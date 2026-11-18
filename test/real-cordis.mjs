/**
 * dsh-input-suggest 宿主集成自检：在真实的 @deepseek-ai/cordis 上挂载本插件，
 * 验证 ctx.effect / ctx.on('session/event') / ctx.connection.fetch.register 的注册
 * 与卸载，以及一轮 turn/end 之后真的会调用 llm.stream 并落到域里。
 *
 * 不连真实模型：FakeLlm 直接吐一段文本。
 *
 * 用法（需要一份 DSH 安装的宿主包）：
 *   node test/real-cordis.mjs
 */
import assert from 'node:assert/strict'

const cordisSpec = process.env.DSH_CORDIS ?? 'file:///C:/Users/admin/.dsh/profiles/node_modules/@deepseek-ai/cordis/lib/index.js'
const { Context, Service } = await import(cordisSpec)
const plugin = await import('file:///E:/DeepseekHarness/dsh-input-suggest/lib/index.js')

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

/** 假会话：只提供本插件真正读到的表面。 */
function makeSession(id) {
  return {
    id,
    seq: 10,
    header: { cwd: 'E:\\demo', isSeeded: false },
    requestHeader: () => ({ config: { provider: 'demo-provider', model: 'demo-model' } }),
    deriveMessages: () => [
      { role: 'user', content: [{ type: 'text', text: '修一下登录页的 bug' }], source: { kind: 'user' } },
      { role: 'assistant', content: [{ type: 'text', text: '已经修好，改动在 auth.ts' }], source: { kind: 'model' } },
    ],
  }
}

class FakeSessions extends Service {
  constructor(ctx) {
    super(ctx, 'sessions')
    this.live = new Map()
    this.populate = (session) => this.live.set(session.id, session)
  }

  get(id) {
    return this.live.get(id)
  }
}

class FakeLlm extends Service {
  constructor(ctx) {
    super(ctx, 'llm')
    this.calls = []
    this.answers = ['运行测试验证一下']
  }

  stream(options) {
    this.calls.push(options)
    const answer = this.answers.shift() ?? ''
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
        if (self.routes.has(route.path)) throw new Error('duplicate route ' + route.path)
        self.routes.set(route.path, route)
        return async () => { self.routes.delete(route.path) }
      },
    }
  }

  call(path, body) {
    const route = this.routes.get(path)
    if (route === undefined) throw new Error('no route ' + path)
    return route.fetch(new Request('http://local' + path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }))
  }
}

/** 假 storage domain：只记内存。 */
class FakeStorageDomain extends Service {
  constructor(ctx) {
    super(ctx, 'storageDomain')
    this.opened = []
  }

  async open(spec) {
    const table = new Map()
    const opened = {
      name: spec.name,
      table: () => ({
        get: (key) => table.get(key),
        put: async (key, value) => { table.set(key, value) },
        delete: async (key) => table.delete(key),
      }),
    }
    this.opened.push(spec)
    return opened
  }
}

const root = new Context()
await root.plugin(FakeSessions)
await root.plugin(FakeLlm)
await root.plugin(FakeConnection)
await root.plugin(FakeStorageDomain)

const sessions = root.sessions
const llm = root.llm
const connection = root.connection
const session = makeSession('session-1')
sessions.populate(session)

const fiber = await root.plugin(plugin, {
  enabled: true,
  provider: 'demo-provider',
  model: 'demo-model',
  reasoningEffort: '',
  style: 'keep it short',
  acceptKey: 'Tab',
  maxSuggestionChars: 120,
  maxOutputTokens: 128,
  timeoutMs: 5000,
  maxRecentTurns: 1,
  maxTranscriptChars: 4000,
})

check('the plugin mounts on a real cordis context', () => {
  assert.equal(typeof root.plugin, 'function')
})

check('both browser routes are registered under /api', () => {
  assert.ok(connection.routes.has('/api/input-suggest/get'))
  assert.ok(connection.routes.has('/api/input-suggest/generate'))
})

check('a completed turn generates one suggestion through the configured route', async () => {
  root.emit('session/event', session, { type: 'turn/start', seq: 11, data: { turn: 1 } })
  root.emit('session/event', session, { type: 'turn/end', seq: 12, data: { turn: 1, reason: { kind: 'completed' } } })
})

await checkAsync('the suggestion is stored and readable over the get route', async () => {
  const deadline = Date.now() + 2000
  let stored = null
  while (Date.now() < deadline) {
    const response = await connection.call('/api/input-suggest/get', { sessionId: 'session-1' })
    const body = await response.json()
    if (body.suggestion !== null) { stored = body.suggestion; break }
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
  assert.ok(stored !== null, 'expected a stored suggestion')
  assert.equal(stored.text, '运行测试验证一下')
  assert.equal(stored.route.provider, 'demo-provider')
  assert.equal(llm.calls.length, 1)
  assert.equal(llm.calls[0].provider, 'demo-provider')
  assert.match(llm.calls[0].system, /keep it short/)
  assert.equal(root.storageDomain.opened.length, 1)
  const spec = root.storageDomain.opened[0]
  assert.equal(spec.name, 'input_suggest')
  assert.equal(spec.layout, 'per-record')
  assert.equal(spec.invalidRecords, 'backup-and-skip')
})

await checkAsync('reroll regenerates even though this turn already has a suggestion', async () => {
  llm.answers.push('提交一下')
  const response = await connection.call('/api/input-suggest/generate', { sessionId: 'session-1' })
  const body = await response.json()
  assert.equal(body.status, 'generated')
  assert.equal(body.suggestion.text, '提交一下')
  assert.equal(llm.calls.length, 2)
})

await checkAsync('a turn the user cancelled on purpose never generates', async () => {
  llm.answers.push('不该出现')
  root.emit('session/event', session, { type: 'turn/end', seq: 14, data: { turn: 2, reason: { kind: 'aborted', reason: { kind: 'user' } } } })
  await new Promise((resolve) => setTimeout(resolve, 100))
  assert.equal(llm.calls.length, 2)
})

await checkAsync('an errored turn still generates a suggestion', async () => {
  llm.answers.push('换个思路重试')
  root.emit('session/event', session, { type: 'turn/end', seq: 15, data: { turn: 3, reason: { kind: 'error', error: { message: 'boom', code: 'UNKNOWN' } } } })
  const deadline = Date.now() + 2000
  while (Date.now() < deadline && llm.calls.length < 3) await new Promise((resolve) => setTimeout(resolve, 25))
  assert.equal(llm.calls.length, 3, 'an errored turn must still offer a next step')
})

await checkAsync('a new user message generates before the turn ends', async () => {
  llm.answers.push('先看日志')
  root.emit('session/event', session, { type: 'user/message', seq: 16, data: { source: { kind: 'user' }, content: [{ type: 'text', text: '报错了，怎么办' }] } })
  const deadline = Date.now() + 2000
  while (Date.now() < deadline && llm.calls.length < 4) await new Promise((resolve) => setTimeout(resolve, 25))
  assert.equal(llm.calls.length, 4, 'a human message must trigger an early suggestion')
})

await checkAsync('injected context is not mistaken for a user message', async () => {
  const before = llm.calls.length
  root.emit('session/event', session, { type: 'user/message', seq: 17, data: { source: { kind: 'agent-instructions' }, content: [{ type: 'text', text: 'workspace instructions' }] } })
  await new Promise((resolve) => setTimeout(resolve, 120))
  assert.equal(llm.calls.length, before)
})

await checkAsync('the get route answers null for an unknown session', async () => {
  const response = await connection.call('/api/input-suggest/get', { sessionId: 'nope' })
  const body = await response.json()
  assert.equal(body.suggestion, null)
})

await checkAsync('reroll works on a session that predates the plugin', async () => {
  // 老会话从未经过本插件的 turn/end 监听，内部回合号是 0；
  // 生成路由要从历史里回填，否则永远回答「还没有完成的回合」。
  const legacy = {
    id: 'legacy-session',
    seq: 4,
    header: { cwd: 'E:\\demo', isSeeded: false },
    requestHeader: () => ({ config: { provider: 'demo-provider', model: 'demo-model' } }),
    snapshotEvents: () => [
      { type: 'turn/start', seq: 0, data: { turn: 1 } },
      { type: 'user/message', seq: 1, data: { source: { kind: 'user' }, content: [{ type: 'text', text: '修一下 bug' }] } },
      { type: 'assistant/message', seq: 2, data: { message: { content: [{ type: 'text', text: '改好了' }] } } },
      { type: 'turn/end', seq: 3, data: { turn: 1, reason: { kind: 'completed' } } },
    ],
    deriveMessages: () => [
      { role: 'user', content: [{ type: 'text', text: '修一下 bug' }], source: { kind: 'user' } },
      { role: 'assistant', content: [{ type: 'text', text: '改好了' }], source: { kind: 'model' } },
    ],
  }
  sessions.populate(legacy)
  const before = llm.calls.length
  const response = await connection.call('/api/input-suggest/generate', { sessionId: 'legacy-session' })
  const body = await response.json()
  assert.notEqual(body.status, 'no-context', 'a pre-existing session must not answer no-context')
  assert.equal(llm.calls.length, before + 1)
})

await checkAsync('the generate route answers no-context before any turn', async () => {
  const fresh = makeSession('session-2')
  sessions.populate(fresh)
  const response = await connection.call('/api/input-suggest/generate', { sessionId: 'session-2' })
  const body = await response.json()
  assert.equal(body.status, 'no-context')
})

await checkAsync('disposing the fiber withdraws both routes', async () => {
  await fiber.dispose()
  assert.equal(connection.routes.has('/api/input-suggest/get'), false)
  assert.equal(connection.routes.has('/api/input-suggest/generate'), false)
})

console.log('\n' + passed + ' passed, ' + failures.length + ' failed')
if (failures.length > 0) process.exitCode = 1

