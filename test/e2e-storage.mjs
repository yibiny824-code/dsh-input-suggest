/**
 * dsh-input-suggest 端到端验证：真实 storage 家族（storage + storage-json +
 * storage-domain）+ 真实 cordis，跑一次 turn/end，确认建议真的落到磁盘。
 *
 * 用法：node test/e2e-storage.mjs
 */
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { hostModuleUrl } from './resolve-host.mjs'

const cordisSpec = process.env.DSH_CORDIS ?? hostModuleUrl('@deepseek-ai/cordis')
const { Context, Service } = await import(cordisSpec)
const storage = await import(hostModuleUrl('@deepseek-ai/dsh-storage'))
const storageJson = await import(hostModuleUrl('@deepseek-ai/dsh-storage-json'))
const storageDomain = await import(hostModuleUrl('@deepseek-ai/dsh-storage-domain'))
const plugin = await import('../lib/index.js')

let passed = 0
const failures = []

function check(label, fn) {
  try {
    fn()
    passed += 1
    console.log('  ok   ' + label)
  } catch (error) {
    failures.push(label)
    console.log('  FAIL ' + label + '\n       ' + (error instanceof Error ? error.message : String(error)))
  }
}

async function checkAsync(label, fn) {
  try {
    await fn()
    passed += 1
    console.log('  ok   ' + label)
  } catch (error) {
    failures.push(label)
    console.log('  FAIL ' + label + '\n       ' + (error instanceof Error ? error.message : String(error)))
  }
}

const base = realpathSync(process.env.DSH_TEST_TMP ?? tmpdir())
const root = mkdtempSync(join(base, 'dsh-input-suggest-e2e-'))

class FakeSessions extends Service {
  constructor(ctx) {
    super(ctx, 'sessions')
    this.live = new Map()
  }

  get(id) {
    return this.live.get(id)
  }
}

class FakeLlm extends Service {
  constructor(ctx) {
    super(ctx, 'llm')
    this.calls = []
  }

  providerInfo(provider) {
    return { name: provider, baseURL: 'http://127.0.0.1:3002/v1' }
  }

  stream(options) {
    this.calls.push(options)
    const answer = this.calls.length === 1 ? '跑一遍测试确认没问题' : '补齐鉴权失败场景的用例'
    return (async function* scripted() {
      yield { type: 'block-start', index: 0, blockType: 'text' }
      yield { type: 'text-delta', index: 0, text: answer }
      yield { type: 'block-end', index: 0, block: { type: 'text', text: answer } }
      yield { type: 'finish', reason: { kind: 'stop' } }
    })()
  }
}

class FakeConnection extends Service {
  constructor(ctx) {
    super(ctx, 'connection')
    this.routes = new Map()
    const self = this
    this.fetch = {
      register(route) {
        self.routes.set(route.path, route)
        return async () => { self.routes.delete(route.path) }
      },
    }
  }

  call(path, body) {
    return this.routes.get(path).fetch(new Request('http://local' + path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }))
  }
}

const app = new Context()
await app.plugin(FakeSessions)
await app.plugin(FakeLlm)
await app.plugin(FakeConnection)
// Cordis 只接受函数或带 apply 的对象；storage 把插件放在 default，另外两个是具名导出。
// Config 交给 Loader 时由 schemastery 解析，直接挂载要自己给出已归一的值。
// inject 声明必须一起带上，否则 Cordis 会在 storage 就绪前调用 apply。
await app.plugin(storage.default)
await app.plugin({ name: storageJson.name, inject: storageJson.inject, apply: storageJson.apply }, storageJson.Config({ root }))
await app.plugin({ name: storageDomain.name, inject: storageDomain.inject, apply: storageDomain.apply }, { backend: 'json' })

const conversation = [
  { role: 'user', content: [{ type: 'text', text: '帮我修一下登录 bug' }], source: { kind: 'user' } },
  { role: 'assistant', content: [{ type: 'text', text: '已修复 auth.ts。待办：运行登录测试。' }], source: { kind: 'model' } },
]
const session = {
  id: 'e2e-session',
  seq: 4,
  header: { cwd: 'E:\\demo', isSeeded: false },
  requestHeader: () => ({ config: { provider: 'demo-provider', model: 'demo-model' } }),
  deriveMessages: () => conversation,
}
app.sessions.live.set(session.id, session)

const fiber = await app.plugin(plugin, {
  enabled: true,
  provider: '',
  model: '',
  reasoningEffort: '',
  style: '简短中文，动词开头',
  acceptKey: 'Alt+/',
  maxSuggestionChars: 120,
  maxOutputTokens: 128,
  timeoutMs: 5000,
  maxRecentTurns: 1,
  maxTranscriptChars: 4000,
})

await checkAsync('a completed turn writes the suggestion to the real JSON backend', async () => {
  app.emit('session/event', session, { type: 'turn/start', seq: 5, data: { turn: 1 } })
  app.emit('session/event', session, { type: 'turn/end', seq: 6, data: { turn: 1, reason: { kind: 'completed' } } })
  const deadline = Date.now() + 3000
  while (Date.now() < deadline) {
    const dir = join(root, 'input_suggest', 'sessions')
    let names = []
    try {
      names = readdirSync(dir).filter((name) => name.endsWith('.json'))
    } catch {
      names = []
    }
    if (names.length > 0) {
      const document = JSON.parse(readFileSync(join(dir, names[0]), 'utf8'))
      const value = document.record
      assert.ok(value !== undefined, 'expected the session record, saw ' + JSON.stringify(document).slice(0, 200))
      assert.equal(value.text, '跑一遍测试确认没问题')
      assert.equal(value.turn, 1)
      assert.equal(value.acceptKey, 'Alt+/')
      assert.equal(value.route.provider, 'demo-provider')
      assert.equal(value.style, '简短中文，动词开头')
      return
    }
    await new Promise((resolve) => setTimeout(resolve, 30))
  }
  throw new Error('no record was written under ' + join(root, 'input_suggest') + '; tree: ' + JSON.stringify(readdirSync(root)))
})

await checkAsync('the stored suggestion survives a re-read through the plugin route', async () => {
  const response = await app.connection.call('/api/input-suggest/get', { sessionId: 'e2e-session' })
  const body = await response.json()
  assert.equal(body.suggestion.text, '跑一遍测试确认没问题')
  assert.equal(body.suggestion.route.model, 'demo-model')
})

await checkAsync('explicit acceptance and a real edited send teach the local profile', async () => {
  const body = { sessionId: session.id }
  const current = await app.connection.call('/api/input-suggest/get', body)
  const { suggestion } = await current.json()
  assert.ok(suggestion.id)
  await app.connection.call('/api/input-suggest/feedback', { ...body, text: suggestion.text })
  for (const event of ['shown', 'shown', 'accepted', 'accepted']) {
    const response = await app.connection.call('/api/input-suggest/feedback', { ...body, suggestionId: suggestion.id, event })
    assert.equal(response.status, 204)
  }
  const stats = async () => (await (await app.connection.call('/api/input-suggest/usage', {})).json()).feedback
  assert.equal((await stats()).shown, 1)
  assert.equal((await stats()).accepted, 1)
  assert.equal((await stats()).sent, 0)

  app.emit('session/event', session, { type: 'turn/start', seq: 7, data: { turn: 2 } })
  app.emit('session/event', session, {
    type: 'user/message', seq: 8,
    data: { id: 'unrelated', source: { kind: 'user', rpcId: 'another-frontend-request' }, content: [{ type: 'text', text: suggestion.text }] },
  })
  assert.equal((await stats()).sent, 0)
  const draft = {
    role: 'user', id: 'edited-draft', source: { kind: 'user', rpcId: 'actual-composer-request' },
    content: [{ type: 'text', text: '跑一遍登录测试确认没问题' }],
  }
  conversation.push(draft)
  app.emit('session/event', session, {
    type: 'user/message', seq: 9, data: draft,
  })
  assert.equal((await stats()).sent, 0)
  await app.connection.call('/api/input-suggest/feedback', {
    ...body, suggestionId: suggestion.id, event: 'submitted', requestId: draft.source.rpcId,
  })
  const dir = join(root, 'input_suggest', 'profiles')
  let names = []
  const learned = Date.now() + 3000
  while (names.length === 0 && Date.now() < learned) {
    try { names = readdirSync(dir).filter((name) => name.endsWith('.json')) } catch {}
    if (names.length === 0) await new Promise((resolve) => setTimeout(resolve, 20))
  }
  assert.equal(names.length, 1, 'expected one profile document')
  const document = JSON.parse(readFileSync(join(dir, names[0]), 'utf8'))
  assert.equal(document.record.observations, 1)
  assert.equal(document.record.accepted, 1)
  assert.ok(document.record.acceptedSamples.includes('跑一遍测试确认没问题'))
  assert.equal(document.record.language, 'zh')
  assert.equal((await stats()).sent, 1)
  assert.equal((await stats()).edited, 1)
  assert.ok((await stats()).avgEditRatio > 0)
  assert.equal((await stats()).sendRate, 1)

  const llm = app.llm
  conversation.push({ role: 'assistant', content: [{ type: 'text', text: '登录用例已通过。待办：补齐鉴权失败场景。' }] })
  app.emit('session/event', session, { type: 'turn/end', seq: 10, data: { turn: 2, reason: { kind: 'completed' } } })
  const deadline = Date.now() + 3000
  while (Date.now() < deadline && llm.calls.length < 2) await new Promise((resolve) => setTimeout(resolve, 25))
  assert.equal(llm.calls.length, 2, 'expected a second suggestion call')
  assert.match(llm.calls[1].system, /RECENTLY ACCEPTED SUGGESTIONS/)
  assert.match(llm.calls[1].system, /- 跑一遍测试确认没问题/)
  assert.match(llm.calls[1].system, /Language: 简体中文/)
  assert.doesNotMatch(llm.calls[1].system, /\{\{/)
})

await checkAsync('token usage is recorded and served over the usage route', async () => {
  const response = await app.connection.call('/api/input-suggest/usage', {})
  const body = await response.json()
  assert.ok(body.usage !== undefined && body.usage !== null, 'expected a usage summary')
  assert.ok(body.usage.calls >= 1, 'the completed turn must have been counted')
  assert.ok(body.usage.totalTokens >= 0)
  const dir = join(root, 'input_suggest', 'usage')
  const names = readdirSync(dir).filter((name) => name.endsWith('.json'))
  assert.equal(names.length, 1, 'expected one usage document')
  const deadline = Date.now() + 3000
  let document = JSON.parse(readFileSync(join(dir, names[0]), 'utf8'))
  while (document.record.calls < body.usage.calls && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 20))
    document = JSON.parse(readFileSync(join(dir, names[0]), 'utf8'))
  }
  assert.equal(document.record.calls, body.usage.calls)
  assert.equal(document.record.version, 1)
})

await checkAsync('the storage domain file is version-stamped and per-record', async () => {
  const dir = join(root, 'input_suggest', 'sessions')
  let names = []
  const deadline = Date.now() + 3000
  while (names.length === 0 && Date.now() < deadline) {
    names = readdirSync(dir).filter((name) => name.endsWith('.json'))
    if (names.length === 0) await new Promise((resolve) => setTimeout(resolve, 20))
  }
  assert.equal(names.length, 1)
  const document = JSON.parse(readFileSync(join(dir, names[0]), 'utf8'))
  // per-record 文档只带记录级版本号；域名与版本在 descriptor / 目录名上。
  assert.equal(document.version, 1)
  assert.equal(names[0].endsWith('.json'), true)
  const feedbackDir = join(root, 'input_suggest', 'feedback')
  const feedbackFile = join(feedbackDir, readdirSync(feedbackDir).find((name) => name.endsWith('.json')))
  const feedback = JSON.parse(readFileSync(feedbackFile, 'utf8')).record
  assert.equal(feedback.accepted, 1)
  assert.equal(feedback.sent, 1)
  assert.ok(Object.values(feedback).every((value) => typeof value === 'number'))
})

await checkAsync('nothing at all was appended to the session log', async () => {
  // 会话对象在测试里是手写的，没有 append 面；本插件从不调用它。
  assert.equal(session.append, undefined)
})

await fiber.dispose()
assert.equal(realpathSync(root), root)
rmSync(root, { recursive: true })

console.log('\n' + passed + ' passed, ' + failures.length + ' failed')
if (failures.length > 0) process.exitCode = 1

