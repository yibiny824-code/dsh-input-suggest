/**
 * agent-tool 集成测试：真实 cordis 上注册 input_suggest_config 工具，验证全部操作。
 */
import assert from 'node:assert/strict'
import { hostModuleUrl } from './resolve-host.mjs'

const cordisSpec = process.env.DSH_CORDIS ?? hostModuleUrl('@deepseek-ai/cordis')
const { Context, Service } = await import(cordisSpec)
const plugin = await import('../lib/index.js')

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

class FakeTools extends Service {
  constructor(ctx) {
    super(ctx, 'tools')
    this.registered = new Map()
    this.register = (definition) => {
      this.registered.set(definition.name, definition)
      return () => this.registered.delete(definition.name)
    }
  }
}

class FakeSystemPrompt extends Service {
  constructor(ctx) {
    super(ctx, 'systemPrompt')
    this.sections = []
    this.section = (section) => {
      this.sections.push(section)
      return () => {
        const at = this.sections.indexOf(section)
        if (at >= 0) this.sections.splice(at, 1)
      }
    }
  }
}

class FakeSessions extends Service {
  constructor(ctx) {
    super(ctx, 'sessions')
    this.live = new Map()
  }
  get(id) { return this.live.get(id) }
}

class FakeLlm extends Service {
  constructor(ctx) {
    super(ctx, 'llm')
    this.calls = []
  }
  stream() {
    this.calls.push(1)
    return (async function* empty() {})()
  }
}

class FakeConnection extends Service {
  constructor(ctx) {
    super(ctx, 'connection')
    this.routes = new Map()
    this.fetch = { register: (route) => { this.routes.set(route.path, route); return async () => this.routes.delete(route.path) } }
  }
}

class FakeStorageDomain extends Service {
  constructor(ctx) {
    super(ctx, 'storageDomain')
    this.opened = []
  }
  async open(spec) {
    const tables = new Map()
    for (const name of Object.keys(spec.tables)) tables.set(name, new Map())
    const opened = {
      name: spec.name,
      table: (name) => ({
        get: (key) => tables.get(name)?.get(key),
        put: async (key, value) => { tables.get(name)?.set(key, value) },
        delete: async (key) => { tables.get(name)?.delete(key) },
      }),
    }
    this.opened.push(spec)
    return opened
  }
}

const root = new Context()
root.logger = { warn: () => {}, error: () => {}, info: () => {}, debug: () => {} }
await root.plugin(FakeTools)
await root.plugin(FakeSystemPrompt)
await root.plugin(FakeSessions)
await root.plugin(FakeLlm)
await root.plugin(FakeConnection)
await root.plugin(FakeStorageDomain)

const configRef = { stylePreset: 'neutral', outputFormat: 'single-line', agentConfig: true }
const fiber = await root.plugin(plugin, {
  enabled: true,
  provider: 'demo',
  model: 'demo-model',
  stylePreset: 'neutral',
  outputFormat: 'single-line',
  agentConfig: true,
  maxOutputTokens: 128,
  timeoutMs: 5000,
})

const tools = root.tools
await new Promise((resolve) => setImmediate(resolve))
console.log('DIAG: root.tools=' + (typeof root.tools) + ' getTools=' + String(root.get && root.get('tools')))
const tool = tools.registered.get('input_suggest_config')

await check('the agent tool registers with the full action set', () => {
  assert.ok(tool !== undefined, 'input_suggest_config must be registered')
  const actions = tool.parameters.properties.action.enum
  for (const action of ['inspect', 'list-presets', 'preview', 'apply', 'reset', 'restore', 'inspect-effective']) {
    assert.ok(actions.includes(action), 'action ' + action + ' missing')
  }
})

await check('the system prompt section teaches the agent when to use the tool', () => {
  const section = root.systemPrompt.sections.find((s) => s.name === 'input-suggest:agent-config')
  assert.ok(section !== undefined, 'prompt section missing')
  assert.ok(section.text.includes('input_suggest_config'))
  assert.ok(section.text.includes('scope=profile'))
})

await check('inspect returns the current profile config with field docs', async () => {
  const result = await tool.execute({ action: 'inspect' }, {})
  assert.equal(result.ok, true)
  assert.equal(result.scope, 'profile')
  assert.equal(result.config.stylePreset, 'neutral')
  assert.equal(result.config.outputFormat, 'single-line')
  assert.ok(result.fields.stylePreset !== undefined)
})

await check('list-presets covers the new styles and formats', async () => {
  const result = await tool.execute({ action: 'list-presets' }, {})
  const presetIds = result.presets.map((p) => p.id)
  assert.ok(presetIds.includes('research-deep-dive'))
  assert.ok(presetIds.includes('direct-execution'))
  assert.ok(presetIds.includes('task-continuation'))
  assert.ok(presetIds.includes('custom'))
  const formatIds = result.formats.map((f) => f.id)
  assert.ok(formatIds.includes('structured'))
  assert.ok(formatIds.includes('research'))
  assert.ok(formatIds.includes('single-line'))
})

await check('preview shows the diff without changing anything', async () => {
  const result = await tool.execute({ action: 'preview', patch: { stylePreset: 'theory', outputFormat: 'structured' } }, {})
  assert.equal(result.ok, true)
  assert.equal(result.changes.length, 2)
  // 确认没有改动配置
  const after = await tool.execute({ action: 'inspect' }, {})
  assert.equal(after.config.stylePreset, 'neutral')
  assert.equal(after.config.outputFormat, 'single-line')
})

await check('session-scope apply lands in the override store, not the profile', async () => {
  const result = await tool.execute({
    action: 'apply',
    scope: 'session',
    sessionId: 'session-1',
    patch: { stylePreset: 'theory', outputFormat: 'structured' },
  }, {})
  assert.equal(result.ok, true)
  assert.equal(result.scope, 'session')
  const profileView = await tool.execute({ action: 'inspect' }, {})
  assert.equal(profileView.config.stylePreset, 'neutral')
  const effective = await tool.execute({ action: 'inspect-effective', sessionId: 'session-1' }, {})
  assert.equal(effective.config.stylePreset, 'theory')
  assert.equal(effective.config.outputFormat, 'structured')
})

await check('session reset clears only the session override', async () => {
  const result = await tool.execute({ action: 'reset', scope: 'session', sessionId: 'session-1' }, {})
  assert.equal(result.ok, true)
  const effective = await tool.execute({ action: 'inspect-effective', sessionId: 'session-1' }, {})
  assert.equal(effective.config.stylePreset, 'neutral')
})

await check('invalid patch fields are rejected at the schema boundary', async () => {
  await assert.rejects(() => tool.execute({ action: 'preview', patch: { enabled: false } }, {}), /invalid arguments/)
  assert.ok(true)
})

await check('unknown actions are rejected at the schema boundary', async () => {
  await assert.rejects(() => tool.execute({ action: 'explode' }, {}), /invalid arguments/)
  assert.ok(true)
})

await check('profile-scope apply persists through settings.mutate', async () => {
  const mutations = []
  // 注入一个可观察的 settings 服务
  const settingsService = {
    mutate: async (ns, ops) => { mutations.push({ ns, ops }) },
  }
  // resolveService 会通过 ctx.get/settings 查找
  root.settings = settingsService
  const result = await tool.execute({ action: 'apply', patch: { stylePreset: 'code' } }, {})
  assert.equal(result.ok, true, 'apply failed: ' + JSON.stringify(result.problems))
  assert.equal(mutations.length, 1)
  assert.equal(mutations[0].ns, 'input-suggest')
  assert.ok(mutations[0].ops.some((op) => op.path[0] === 'stylePreset' && op.value === 'code'))
})

await check('restore rolls back to the last valid configuration', async () => {
  const result = await tool.execute({ action: 'restore' }, {})
  assert.equal(result.ok, true, 'restore failed: ' + JSON.stringify(result.problems))
})

await check('disposing the fiber withdraws the tool and section', async () => {
  await fiber.dispose()
  assert.equal(tools.registered.has('input_suggest_config'), false)
  assert.equal(root.systemPrompt.sections.some((s) => s.name === 'input-suggest:agent-config'), false)
})

console.log('')
console.log(passed + ' passed, ' + failures.length + ' failed')
if (failures.length > 0) process.exitCode = 1

