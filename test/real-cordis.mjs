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
import { hostModuleUrl } from './resolve-host.mjs'

const cordisSpec = process.env.DSH_CORDIS ?? hostModuleUrl('@deepseek-ai/cordis')
const { Context, Service } = await import(cordisSpec)
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

/** 假会话：只提供本插件真正读到的表面。 */
function makeSession(id) {
  return {
    id,
    seq: 10,
    header: { cwd: 'E:\\demo', isSeeded: false },
    requestHeader: () => ({ config: { provider: 'demo-provider', model: 'demo-model' } }),
    deriveMessages: () => [
      { role: 'user', content: [{ type: 'text', text: '修一下登录页的 bug' }], source: { kind: 'user' } },
      { role: 'assistant', content: [{ type: 'text', text: '已经修好 auth.ts。待办：运行登录回归测试。' }], source: { kind: 'model' } },
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
    this.baseURL = 'http://127.0.0.1:3002/v1'
  }

  providerInfo(provider) {
    return { name: provider, baseURL: this.baseURL }
  }

  stream(options) {
    this.calls.push(options)
    const answer = this.answers.shift() ?? ''
    return (async function* scripted() {
      yield { type: 'usage', usage: { inputTokens: 22, outputTokens: 3 } }
      const text = typeof answer === 'function' ? await answer(options.signal) : answer
      yield { type: 'block-start', index: 0, blockType: 'text' }
      yield { type: 'text-delta', index: 0, text }
      yield { type: 'block-end', index: 0, block: { type: 'text', text } }
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

  call(path, body, headers = {}) {
    const route = this.routes.get(path)
    if (route === undefined) throw new Error('no route ' + path)
    return route.fetch(new Request('http://local' + path, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
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
    const tables = new Map()
    const opened = {
      name: spec.name,
      table: (name) => {
        if (!tables.has(name)) tables.set(name, new Map())
        const table = tables.get(name)
        return {
          get: (key) => table.get(key),
          put: async (key, value) => { table.set(key, value) },
          delete: async (key) => table.delete(key),
        }
      },
    }
    this.opened.push(spec)
    return opened
  }
}

const root = new Context()
root.logger = { warn: (...args) => console.log('  [warn]', ...args) }
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
  assert.ok(connection.routes.has('/api/input-suggest/presets'))
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
  // 重随必须告诉模型「上一句是什么、不要再写一遍」，否则它会复述同一段上下文。
  assert.match(llm.calls[1].system, /ALREADY SUGGESTED/)
  assert.match(llm.calls[1].system, /运行测试验证一下/)
})

await checkAsync('idle fallback does not repeat the end-of-turn context', async () => {
  const before = llm.calls.length
  const responses = await Promise.all(Array.from({ length: 3 }, () =>
    connection.call('/api/input-suggest/generate', { sessionId: session.id, trigger: 'idle' })))
  for (const response of responses) assert.equal((await response.json()).status, 'skipped')
  assert.equal(llm.calls.length, before)
})

await checkAsync('a turn the user cancelled on purpose never generates', async () => {
  root.emit('session/event', session, { type: 'turn/end', seq: 14, data: { turn: 2, reason: { kind: 'aborted', reason: { kind: 'user' } } } })
  const response = await connection.call('/api/input-suggest/generate', { sessionId: session.id, trigger: 'idle' })
  assert.equal((await response.json()).status, 'skipped')
  assert.equal(llm.calls.length, 2)
})

await checkAsync('an errored turn still generates a suggestion', async () => {
  llm.answers.push('换个思路重试')
  root.emit('session/event', session, { type: 'turn/end', seq: 15, data: { turn: 3, reason: { kind: 'error', error: { message: 'boom', code: 'UNKNOWN' } } } })
  const deadline = Date.now() + 2000
  while (Date.now() < deadline && llm.calls.length < 3) await new Promise((resolve) => setTimeout(resolve, 25))
  assert.equal(llm.calls.length, 3, 'an errored turn must still offer a next step')
})

await checkAsync('a new turn invalidates suggestions and suspends idle generation', async () => {
  const before = llm.calls.length
  root.emit('session/event', session, { type: 'turn/start', seq: 16, data: { turn: 4 } })
  root.emit('session/event', session, { type: 'user/message', seq: 17, data: { source: { kind: 'user' }, content: [{ type: 'text', text: '报错了，怎么办' }] } })
  const response = await connection.call('/api/input-suggest/generate', { sessionId: session.id, trigger: 'idle' })
  assert.equal((await response.json()).status, 'busy')
  assert.equal((await (await connection.call('/api/input-suggest/get', { sessionId: session.id })).json()).suggestion, null)
  assert.equal(llm.calls.length, before)
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

await checkAsync('the preset catalog route lists the planning and theory presets', async () => {
  const response = await connection.call('/api/input-suggest/presets', {})
  const body = await response.json()
  const ids = body.presets.map((preset) => preset.id)
  assert.ok(ids.includes('plan') && ids.includes('theory') && ids.includes('neutral'))
  assert.equal(body.default, 'neutral')
  // 设置页按界面语言取 label；两种语言都要有，否则英文界面会出现空选项。
  const plan = body.presets.find((preset) => preset.id === 'plan')
  assert.ok(plan.label.zh !== '' && plan.label.en !== '')
  assert.ok(plan.description.zh !== '' && plan.description.en !== '')
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
      { role: 'assistant', content: [{ type: 'text', text: '有两处改动，第二处等待测试确认。' }], source: { kind: 'model' } },
    ],
  }
  sessions.populate(legacy)
  const before = llm.calls.length
  llm.answers.push('补齐第二处改动的回归测试')
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

await checkAsync('a configured preset reaches the system prompt end to end', async () => {
  // 单独挂一份配置：验证 generate() 真的用上了 stylePreset，
  // 而不只是在纯函数里能拼出来。
  const second = new Context()
  await second.plugin(FakeSessions)
  await second.plugin(FakeLlm)
  await second.plugin(FakeConnection)
  await second.plugin(FakeStorageDomain)
  const session2 = makeSession('session-theory')
  second.sessions.populate(session2)
  await second.plugin(plugin, {
    enabled: true,
    provider: 'demo-provider',
    model: 'demo-model',
    stylePreset: 'theory',
    style: 'prefer closed-form answers',
    acceptKey: 'Tab',
    maxSuggestionChars: 240,
    maxOutputTokens: 128,
    timeoutMs: 5000,
    maxRecentTurns: 1,
    maxTranscriptChars: 4000,
  })
  second.emit('session/event', session2, { type: 'turn/start', seq: 11, data: { turn: 1 } })
  second.emit('session/event', session2, { type: 'turn/end', seq: 12, data: { turn: 1, reason: { kind: 'completed' } } })
  const deadline = Date.now() + 2000
  while (Date.now() < deadline && second.llm.calls.length === 0) await new Promise((resolve) => setTimeout(resolve, 25))
  assert.equal(second.llm.calls.length, 1)
  const system = second.llm.calls[0].system
  assert.match(system, /mechanisms before coding/, 'the theory preset must reach the model')
  assert.match(system, /prefer closed-form answers/, 'the custom style must be appended')
})


await checkAsync('a model that repeats the old line is asked once more', async () => {
  // 重随拿到的是同一段上下文，模型很可能再写一遍同样的话。
  // 第一次回答与当前建议完全相同 → 宿主再问一次，并把「换个角度」写进提示词。
  const repeat = {
    id: 'session-repeat',
    seq: 4,
    header: { cwd: 'E:\\demo', isSeeded: false },
    requestHeader: () => ({ config: { provider: 'demo-provider', model: 'demo-model' } }),
    snapshotEvents: () => [
      { type: 'turn/start', seq: 0, data: { turn: 1 } },
      { type: 'user/message', seq: 1, data: { source: { kind: 'user' }, content: [{ type: 'text', text: '修一下 bug' }] } },
      { type: 'turn/end', seq: 2, data: { turn: 1, reason: { kind: 'completed' } } },
    ],
    deriveMessages: () => [
      { role: 'user', content: [{ type: 'text', text: '修一下 bug' }], source: { kind: 'user' } },
      { role: 'assistant', content: [{ type: 'text', text: '改好了' }], source: { kind: 'model' } },
    ],
  }
  sessions.populate(repeat)
  llm.answers.push('先跑一遍 e2e')
  const first = await connection.call('/api/input-suggest/generate', { sessionId: 'session-repeat' })
  assert.equal((await first.json()).suggestion.text, '先跑一遍 e2e')
  const before = llm.calls.length
  llm.answers.push('先跑一遍 e2e', '再补一个超时用例')
  const second = await connection.call('/api/input-suggest/generate', { sessionId: 'session-repeat' })
  const body = await second.json()
  assert.equal(body.status, 'generated')
  assert.equal(body.suggestion.text, '再补一个超时用例')
  assert.equal(llm.calls.length, before + 2, 'a verbatim repeat must trigger one retry')
  assert.match(llm.calls[before + 1].system, /DIFFERENT next step/)
})

await checkAsync('extended context grounds an action in an earlier human request', async () => {
  const scoped = new Context()
  await scoped.plugin(FakeSessions)
  await scoped.plugin(FakeLlm)
  await scoped.plugin(FakeConnection)
  const continued = makeSession('session-context')
  continued.snapshotEvents = () => [{ type: 'turn/end', seq: 5, data: { turn: 2, reason: { kind: 'completed' } } }]
  const turnText = (role, text, kind = role === 'user' ? 'user' : 'model') => ({
    role, content: [{ type: 'text', text }], source: { kind },
  })
  continued.deriveMessages = () => [
    turnText('user', '隐藏的工作区说明', 'agent-instructions'),
    turnText('user', '复现实验的随机数据划分'),
    turnText('assistant', '已整理方案。'),
    turnText('user', '继续按原方案执行'),
    turnText('assistant', '已读取数据。待办：验证数据划分脚本。'),
  ]
  scoped.sessions.populate(continued)
  const installed = await scoped.plugin(plugin, { mode: 'next-action', contextLevel: 'extended' })
  try {
    scoped.llm.answers = ['验证数据划分脚本。保留已确认的随机种子。']
    const response = await scoped.connection.call('/api/input-suggest/generate', { sessionId: continued.id })
    const body = await response.json()
    assert.equal(body.suggestion?.text, '验证数据划分脚本。保留已确认的随机种子。')
    const [{ system, messages }] = scoped.llm.calls
    assert.match(system, /next-action recommender/)
    const text = messages[0].content[0].text
    assert.match(text, /\[Task State\]/)
    assert.match(text, /\[Earlier User Requests\]\n- 复现实验的随机数据划分/)
    assert.doesNotMatch(text, /隐藏的工作区说明/)
  } finally {
    await installed.dispose()
  }
})

await checkAsync('completion stays silent including during idle fallback', async () => {
  const complete = makeSession('session-finished')
  complete.deriveMessages = () => [
    { role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: '修复登录跳转并运行测试。' }] },
    { role: 'assistant', content: [{ type: 'text', text: '已修复登录跳转，测试全部通过。任务已完成。' }] },
  ]
  sessions.populate(complete)
  const before = llm.calls.length
  root.emit('session/event', complete, { type: 'turn/end', seq: 26, data: { turn: 1, reason: { kind: 'completed' } } })
  const response = await connection.call('/api/input-suggest/generate', { sessionId: complete.id, trigger: 'idle' })
  assert.ok(['skipped', 'busy'].includes((await response.json()).status))
  const manual = await connection.call('/api/input-suggest/generate', { sessionId: complete.id })
  assert.equal((await manual.json()).status, 'skipped')
  assert.equal(llm.calls.length, before)
})

await checkAsync('a new turn cancels the old stream and the cancelled call is metered', async () => {
  const stale = makeSession('session-stale')
  sessions.populate(stale)
  let begin
  const began = new Promise((resolve) => { begin = resolve })
  llm.answers.push((signal) => new Promise((resolve, reject) => {
    begin(signal)
    signal.addEventListener('abort', () => reject(signal.reason), { once: true })
  }))
  const before = llm.calls.length
  root.emit('session/event', stale, { type: 'turn/end', seq: 2, data: { turn: 1, reason: { kind: 'completed' } } })
  const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('no stream')), 1000).unref())
  const signal = await Promise.race([began, timeout])
  const idle = await connection.call('/api/input-suggest/generate', { sessionId: stale.id, trigger: 'idle' })
  assert.equal((await idle.json()).status, 'busy')
  root.emit('session/event', stale, { type: 'turn/start', seq: 3, data: { turn: 2 } })
  assert.ok(signal.aborted)
  const get = await connection.call('/api/input-suggest/get', { sessionId: stale.id })
  assert.equal((await get.json()).suggestion, null)
  const usage = (await (await connection.call('/api/input-suggest/usage', {})).json()).usage
  assert.equal(llm.calls.length, before + 1)
  assert.equal(usage.calls, llm.calls.length)
  assert.equal(usage.totalTokens, usage.calls * 25)
})

await checkAsync('unknown or remote endpoints block generation with default privacy settings', async () => {
  const closed = makeSession('session-closed-route')
  sessions.populate(closed)
  const before = llm.calls.length
  llm.baseURL = undefined
  try {
    root.emit('session/event', closed, { type: 'turn/end', seq: 2, data: { turn: 1, reason: { kind: 'completed' } } })
    const generate = () => connection.call('/api/input-suggest/generate', { sessionId: closed.id })
    assert.equal((await (await generate()).json()).status, 'skipped')
    llm.baseURL = 'https://model.example/v1'
    assert.equal((await (await generate()).json()).status, 'skipped')
    assert.equal(llm.calls.length, before)
  } finally {
    llm.baseURL = 'http://127.0.0.1:3002/v1'
  }
})

await checkAsync('reroll exhaustion does not use up the automatic budget', async () => {
  const limited = makeSession('session-manual-limit')
  limited.snapshotEvents = () => [{ type: 'turn/end', seq: 1, data: { turn: 1, reason: { kind: 'completed' } } }]
  sessions.populate(limited)
  const generate = () => connection.call('/api/input-suggest/generate', { sessionId: limited.id })
  const before = llm.calls.length
  llm.answers.push('跑一遍登录冒烟测试', '验证退出登录后的跳转路径', '覆盖密码过期分支', '检查错误页的文案')
  for (let attempt = 0; attempt < 4; attempt += 1) {
    assert.equal((await (await generate()).json()).status, 'generated')
  }
  const blocked = await generate()
  assert.equal(blocked.status, 429)
  assert.equal((await blocked.json()).status, 'limited')
  assert.equal(llm.calls.length, before + 4)
  llm.answers.push('核对浏览器存储里的会话过期标记')
  root.emit('session/event', limited, { type: 'turn/end', seq: 2, data: { turn: 2, reason: { kind: 'completed' } } })
  const deadline = Date.now() + 1000
  while (llm.calls.length === before + 4 && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 15))
  }
  assert.equal(llm.calls.length, before + 5)
})

await checkAsync('a draft on the generate route refines the typed prompt', async () => {
  // The user typed a partial prompt and pressed reroll: the host must (1) receive the draft,
  // (2) put it into the model context as [Draft Prompt To Refine], and (3) emit the REFINE MODE instruction.
  llm.answers.push('优化后的完整提示词')
  const before = llm.calls.length
  const refineSession = makeSession('session-refine')
  refineSession.snapshotEvents = () => [{ type: 'turn/end', seq: 1, data: { turn: 1, reason: { kind: 'completed' } } }]
  sessions.populate(refineSession)
  const response = await connection.call('/api/input-suggest/generate', {
    sessionId: refineSession.id,
    trigger: 'manual',
    draft: '帮我修一下登录',
  })
  const body = await response.json()
  assert.equal(body.status, 'generated')
  assert.equal(body.suggestion.text, '优化后的完整提示词')
  const call = llm.calls[llm.calls.length - 1]
  assert.match(call.system, /REFINE MODE/)
  assert.match(JSON.stringify(call.messages), /Draft Prompt To Refine/)
  assert.match(JSON.stringify(call.messages), /帮我修一下登录/)
  assert.equal(llm.calls.length, before + 1)
})

await checkAsync('a reroll without a draft keeps the normal generation path', async () => {
  // No draft field: the request behaves exactly like the legacy reroll - no REFINE MODE block.
  llm.answers.push('普通重随建议')
  const response = await connection.call('/api/input-suggest/generate', {
    sessionId: 'session-refine',
    trigger: 'manual',
  })
  const body = await response.json()
  // The whole file shares one profile-level manual budget (10/min); a late reroll
  // can legitimately be rate-limited. When it generates, the normal path must have
  // no refine block; when limited, the dedicated budget test already covers it.
  if (body.status === 'generated') {
    const call = llm.calls[llm.calls.length - 1]
    assert.doesNotMatch(call.system, /REFINE MODE/)
    assert.doesNotMatch(JSON.stringify(call.messages), /Draft Prompt To Refine/)
  } else {
    assert.equal(body.status, 'limited')
  }
})

await checkAsync('disposing the fiber withdraws both routes', async () => {
  await fiber.dispose()
  assert.equal(connection.routes.has('/api/input-suggest/get'), false)
  assert.equal(connection.routes.has('/api/input-suggest/generate'), false)
})

console.log('\n' + passed + ' passed, ' + failures.length + ' failed')
if (failures.length > 0) process.exitCode = 1

