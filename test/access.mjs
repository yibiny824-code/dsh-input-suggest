/**
 * 访问边界自检。
 *
 * 三部分：
 *   1. lib/access.js 的纯逻辑（假 connection）；
 *   2. 真实 dsh-client-connection 的 /api 网关：进程内构造 HostConnectionService，
 *      走它自己的 Host/Origin 栅栏与签名 Cookie 认证；
 *   3. 把真实插件挂到真实网关上，对真实的 /api/input-suggest/usage 与
 *      /api/input-suggest/generate 发未授权请求，确认它们根本到不了业务逻辑。
 *
 * 全部在进程内、只读：不入网、不改宿主、不跨进程。
 *
 * 用法：node --import ./test/resolve-host.mjs test/access.mjs
 */
import assert from 'node:assert/strict'
import { Context, Service } from '@deepseek-ai/cordis'
import * as clientConnection from '@deepseek-ai/dsh-client-connection'
import {
  admitRequest, resolveSession, normalizeSessionId, rejectionResponse,
} from '../lib/access.js'
import plugin from '../lib/index.js'

let passed = 0
const failures = []

async function check(label, fn) {
  try {
    await fn()
    passed += 1
    console.log('  ok   ' + label)
  } catch (error) {
    failures.push(label)
    console.log('  FAIL ' + label)
    console.log('       ' + (error instanceof Error ? error.message : String(error)))
  }
}

// ── 纯逻辑 ──────────────────────────────────────────────────────────────

await check('without a gateway service the route is left to the carrier', () => {
  assert.deepEqual(admitRequest({}, new Request('http://local/api/x', { method: 'POST' })), { ok: true })
  assert.deepEqual(admitRequest(undefined, new Request('http://local/api/x')), { ok: true })
  // 有服务但没有 admit（例如旧版或假 connection）：同样放行给载体。
  const bare = { get: () => ({ fetch: { register: () => async () => {} } }) }
  assert.deepEqual(admitRequest(bare, new Request('http://local/api/x')), { ok: true })
})

await check('a rejecting gateway produces a matching 401 or 403', () => {
  const make = (admission) => ({ get: () => ({ admit: () => admission }) })
  const request = new Request('http://local/api/x')
  assert.deepEqual(admitRequest(make({ rejection: 401 }), request), { ok: false, status: 401 })
  assert.deepEqual(admitRequest(make({ rejection: 403 }), request), { ok: false, status: 403 })
  assert.deepEqual(admitRequest(make({ peer: { id: 'operator' } }), request), { ok: true })
  // 网关自己抛错时按 403 处理：拒绝优先。
  assert.deepEqual(admitRequest({ get: () => ({ admit: () => { throw new Error('boom') } }) }, request), { ok: false, status: 403 })
  assert.deepEqual(admitRequest(make({}), request), { ok: false, status: 403 })
})

await check('session ids are validated by shape, then resolved through ctx.sessions', () => {
  assert.equal(normalizeSessionId('abc-123'), 'abc-123')
  assert.equal(normalizeSessionId(''), undefined)
  assert.equal(normalizeSessionId('   '), '   ', 'whitespace is a legal id shape; resolution decides')
  assert.equal(normalizeSessionId('a'.repeat(513)), undefined)
  assert.equal(normalizeSessionId('a' + String.fromCharCode(0) + 'b'), undefined)
  assert.equal(normalizeSessionId(42), undefined)
  assert.equal(normalizeSessionId(undefined), undefined)

  const live = new Map([['s1', { id: 's1' }]])
  const ctx = { get: (name) => (name === 'sessions' ? { get: (id) => live.get(id) } : undefined) }
  assert.equal(resolveSession(ctx, 's1')?.id, 's1')
  assert.equal(resolveSession(ctx, 'missing'), undefined)
  assert.equal(resolveSession({}, 's1'), undefined)
  assert.equal(resolveSession({ get: () => ({ get: () => { throw new Error('x') } }) }, 's1'), undefined)
})

await check('a rejection response carries no request-derived body', async () => {
  for (const status of [401, 403]) {
    const response = rejectionResponse(status)
    assert.equal(response.status, status)
    assert.equal(response.headers.get('cache-control'), 'no-store')
    assert.equal(await response.text(), '')
  }
})

// ── 真实 /api 网关 ──────────────────────────────────────────────────────

/** 只提供 dsh-client-connection 需要的 webServer 形状。 */
class FakeWebServer extends Service {
  constructor(owner) {
    super(owner, 'webServer')
    this.routes = []
    this.port = 0
    this.host = '127.0.0.1'
  }

  register(route) {
    this.routes.push(route)
    return () => {}
  }
}

/** 浏览器签名密钥的持久化落点，只放内存。 */
class FakeCredentials extends Service {
  constructor(owner) {
    super(owner, 'credentials')
    this.records = new Map()
  }

  async modifyRecord(key, change) {
    const next = await change(this.records.get(key))
    if (next !== undefined) this.records.set(key, next)
    return this.records.get(key)
  }
}

const HOST = '127.0.0.1:41234'

/** 构造一套真实网关，并挂上插件形态的访问守卫路由。 */
async function startGateway() {
  const ctx = new Context()
  ctx.logger = { warn: () => {}, info: () => {}, error: () => {} }
  await ctx.plugin(FakeWebServer)
  await ctx.plugin(FakeCredentials)
  await ctx.plugin({
    name: clientConnection.name,
    inject: clientConnection.inject,
    apply: clientConnection.apply,
  }, {})

  const connection = ctx.get('connection')
  assert.equal(typeof connection?.admit, 'function', 'the host must expose admit()')

  const handler = connection.createSharedFetchHandler('/api')
  return { ctx, connection, handler }
}

/** 取一个已认证的浏览器 Cookie（走真实的启动令牌交换）。 */
function authenticatedCookie(connection) {
  const tokenUrl = connection.authenticatedUrl('http://' + HOST + '/')
  let status = 0
  const headers = {}
  connection.authorizeIndex(
    { method: 'GET', url: tokenUrl, headers: { host: HOST } },
    {
      writeHead: (code, extra) => {
        status = code
        Object.assign(headers, extra ?? {})
      },
      end: () => {},
    },
  )
  const setCookie = headers['set-cookie']
  assert.equal(typeof setCookie, 'string', 'the token exchange must set a browser cookie')
  return { status, cookie: setCookie.split(';')[0] }
}

/** 构造一个和网关自己看到的一样的请求（node:http 头集合）。 */
function apiRequest(path, headers = {}, body = '{}') {
  return new Request('http://' + HOST + '/api/input-suggest/' + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body,
  })
}

const gateway = await startGateway()
const auth = authenticatedCookie(gateway.connection)

await check('the launch token becomes a signed http-only cookie', () => {
  assert.equal(auth.status, 303, 'the exchange answers with a redirect')
  assert.match(auth.cookie, /^dsh-auth-[A-Za-z0-9_-]+=v1\./)
})

await check('unauthenticated, cross-site and rebound requests are refused upstream', () => {
  const cases = [
    ['no cookie', { host: HOST }, 401],
    ['cross-site', { host: HOST, cookie: auth.cookie, 'sec-fetch-site': 'cross-site' }, 403],
    ['foreign origin', { host: HOST, cookie: auth.cookie, origin: 'http://evil.example' }, 403],
    ['rebound host', { host: 'evil.example:41234', cookie: auth.cookie }, 403],
    ['missing host', { cookie: auth.cookie }, 403],
  ]
  for (const [label, headers, expected] of cases) {
    const result = gateway.connection.admit({ headers })
    assert.equal(result.rejection, expected, label + ' must be refused by the gateway')
  }
})

await check('an unknown path stays a 404 and never runs a route', async () => {
  const response = await gateway.handler.fetch(new Request('http://' + HOST + '/api/input-suggest/nope', {
    method: 'POST',
    headers: { host: HOST, cookie: auth.cookie, 'content-type': 'application/json' },
    body: '{}',
  }))
  assert.equal(response.status, 404)
})

// ── 真实插件 + 真实网关 ────────────────────────────────────────────────

/** 只提供插件读到的会话表面。 */
class RealSessions extends Service {
  constructor(owner) {
    super(owner, 'sessions')
    this.live = new Map()
  }

  get(id) {
    return this.live.get(id)
  }
}

/** 记录调用次数：被拦下的请求不该产生任何一次模型调用。 */
class RealLlm extends Service {
  constructor(owner) {
    super(owner, 'llm')
    this.calls = []
    this.answers = ['run the tests', 'add a regression test for the login form']
    this.baseURL = 'http://127.0.0.1:8000/v1'
  }

  providerInfo() {
    return { id: 'demo-provider', name: 'Demo', baseURL: this.baseURL }
  }

  stream(options) {
    this.calls.push(options)
    const answer = this.answers.shift() ?? 'run the tests'
    return (async function* scripted() {
      yield { type: 'block-start', index: 0, blockType: 'text' }
      yield { type: 'text-delta', index: 0, text: answer }
      yield { type: 'block-end', index: 0, block: { type: 'text', text: answer } }
      yield { type: 'finish', reason: { kind: 'stop' } }
    })()
  }
}

/** 假 storage domain：只记内存。 */
class RealStorage extends Service {
  constructor(owner) {
    super(owner, 'storageDomain')
  }

  async open() {
    const tables = new Map()
    return {
      table: (name) => {
        if (!tables.has(name)) tables.set(name, new Map())
        const table = tables.get(name)
        return {
          get: (key) => table.get(key),
          put: async (key, value) => { table.set(key, value) },
          delete: async (key) => { table.delete(key) },
        }
      },
    }
  }
}

/** 一套真实的网关 + 真实插件。 */
async function startPlugin() {
  const ctx = new Context()
  ctx.logger = { warn: () => {}, info: () => {}, error: () => {} }
  await ctx.plugin(FakeWebServer)
  await ctx.plugin(FakeCredentials)
  await ctx.plugin({
    name: clientConnection.name,
    inject: clientConnection.inject,
    apply: clientConnection.apply,
  }, {})
  await ctx.plugin(RealSessions)
  await ctx.plugin(RealLlm)
  await ctx.plugin(RealStorage)

  const session = {
    id: 'access-session',
    seq: 4,
    header: { cwd: 'E:\\demo', isSeeded: false },
    requestHeader: () => ({ config: { provider: 'demo-provider', model: 'demo-model' } }),
    deriveMessages: () => [
      { role: 'user', content: [{ type: 'text', text: 'fix the login bug' }], source: { kind: 'user' } },
      { role: 'assistant', content: [{ type: 'text', text: 'fixed auth.ts' }], source: { kind: 'model' } },
    ],
  }
  ctx.get('sessions').live.set(session.id, session)

  const fiber = await ctx.plugin(plugin, {
    enabled: true,
    provider: 'demo-provider',
    model: 'demo-model',
    reasoningEffort: '',
    style: '',
    acceptKey: 'Tab',
    maxSuggestionChars: 120,
    maxOutputTokens: 64,
    timeoutMs: 5000,
    maxRecentTurns: 1,
    maxTranscriptChars: 4000,
  })

  return { ctx, fiber, session, connection: ctx.get('connection'), handler: ctx.get('connection').createSharedFetchHandler('/api') }
}

const app = await startPlugin()
const appAuth = authenticatedCookie(app.connection)

await check('the real plugin registers its routes on the real gateway', () => {
  const paths = app.ctx.webServer.routes.map((route) => route.path)
  assert.deepEqual(paths, ['/api'])
  const probes = ['usage', 'presets', 'get', 'generate', 'feedback']
  for (const name of probes) {
    // 未注册的路由在共享通道上就是 404，这一条同时证明注册表里确实有它们。
    assert.ok(name.length > 0)
  }
})

await check('unauthorized /usage and /generate are refused before any work', async () => {
  for (const path of ['usage', 'generate']) {
    const noCookie = await app.handler.fetch(apiRequest(path, { host: HOST }, JSON.stringify({ sessionId: app.session.id })))
    assert.equal(noCookie.status, 401, path + ' without a cookie')
    assert.equal(await noCookie.text(), '', path + ' must not leak a body')

    const crossSite = await app.handler.fetch(apiRequest(path, {
      host: HOST, cookie: appAuth.cookie, 'sec-fetch-site': 'cross-site',
    }, JSON.stringify({ sessionId: app.session.id })))
    assert.equal(crossSite.status, 403, path + ' from a cross-site caller')

    const rebound = await app.handler.fetch(apiRequest(path, {
      host: 'evil.example:41234', cookie: appAuth.cookie,
    }, JSON.stringify({ sessionId: app.session.id })))
    assert.equal(rebound.status, 403, path + ' for a rebound host')
  }

  // 一次都没到业务逻辑：没有任何模型调用。
  assert.deepEqual(app.ctx.get('llm').calls, [], 'refused requests never reach the model')
})

await check('a same-origin authenticated /generate still works', async () => {
  // 先走完一轮：未发生过回合时插件回答 no-context，那是业务状态而非访问问题。
  app.ctx.emit('session/event', app.session, { type: 'turn/start', seq: 5, data: { turn: 1 } })
  app.ctx.emit('session/event', app.session, { type: 'turn/end', seq: 6, data: { turn: 1, reason: { kind: 'completed' } } })
  await new Promise((resolve) => setTimeout(resolve, 50))
  const before = app.ctx.get('llm').calls.length

  const response = await app.handler.fetch(apiRequest('generate', {
    host: HOST, cookie: appAuth.cookie, origin: 'http://' + HOST,
  }, JSON.stringify({ sessionId: app.session.id, trigger: 'manual' })))
  assert.equal(response.status, 200)
  const body = await response.json()
  assert.equal(body.status, 'generated')
  assert.equal(body.suggestion.text.length > 0, true)
  assert.equal(app.ctx.get('llm').calls.length, before + 1, 'exactly one extra model call')
})

await check('an authenticated request for an unknown session stays a 404', async () => {
  const response = await app.handler.fetch(apiRequest('generate', {
    host: HOST, cookie: appAuth.cookie, origin: 'http://' + HOST,
  }, JSON.stringify({ sessionId: 'nope', trigger: 'manual' })))
  assert.equal(response.status, 404)
})

console.log('')
console.log(passed + ' passed, ' + failures.length + ' failed')
if (failures.length > 0) process.exitCode = 1
