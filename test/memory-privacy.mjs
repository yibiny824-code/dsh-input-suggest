/**
 * 记忆 / 隐私 / 模板的自检（纯函数）。
 * 用法：node test/memory-privacy.mjs
 */
import assert from 'node:assert/strict'
import { emptyProfile, recordObservation, describeProfile, recentAccepted, similarity, ADOPT_THRESHOLD, languageOf, leadingWordOf, editDistance } from '../lib/memory.js'
import {
  redact, outboundDecision, stillLooksSensitive, endpointOf, normalizeLocalPolicy,
} from '../lib/privacy.js'
import {
  renderPrompt, validateTemplate, DEFAULT_TEMPLATE, INSTRUCTIONS, resolveDetail,
  STYLE_PRESETS, DEFAULT_PRESET, resolvePreset, composeStyle,
} from '../lib/prompt.js'

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

// ── 记忆 ────────────────────────────────────────────────────────────────

check('similarity treats a small edit as the same suggestion', () => {
  assert.equal(similarity('run the tests', 'run the tests'), 1)
  assert.ok(similarity('run the tests', 'run the tests please') > ADOPT_THRESHOLD)
  assert.ok(similarity('run the tests', 'commit and push everything now') < ADOPT_THRESHOLD)
})

check('editDistance is a real Levenshtein distance', () => {
  assert.equal(editDistance('kitten', 'sitting'), 3)
  assert.equal(editDistance('', 'abc'), 3)
})

check('a fresh profile says nothing to the model', () => {
  assert.equal(describeProfile(emptyProfile()), '')
})

check('accepted observations build an acceptance rate and samples', () => {
  let profile = emptyProfile()
  profile = recordObservation(profile, { suggestion: 'run the tests', finalText: 'run the tests', now: 1 })
  profile = recordObservation(profile, { suggestion: 'commit it', finalText: 'commit it now', now: 2 })
  profile = recordObservation(profile, { suggestion: 'push', finalText: 'push the branch', now: 3 })
  assert.equal(profile.observations, 3)
  assert.equal(profile.accepted, 3)
  const description = describeProfile(profile)
  assert.match(description, /acceptance rate: 100%/)
  const samples = recentAccepted(profile)
  assert.deepEqual(samples.slice(0, 2), ['push', 'commit it'])
})

check('a rewrite counts as a rejection and records leading words', () => {
  let profile = emptyProfile()
  profile = recordObservation(profile, { suggestion: 'run tests', finalText: 'deploy to staging first', now: 1 })
  assert.equal(profile.rejected, 1)
  assert.equal(profile.accepted, 0)
  assert.ok(profile.rejectedSamples.includes('run tests'))
  assert.ok(profile.leadingWords.includes('deploy to'))
})

check('an explicit reroll is a rejection with no adopted text', () => {
  let profile = emptyProfile()
  profile = recordObservation(profile, { suggestion: 'run tests', finalText: '', rejected: true, now: 1 })
  assert.equal(profile.rejected, 1)
  assert.equal(profile.accepted, 0)
})

check('profile language follows the user and leading words are stable', () => {
  assert.equal(languageOf('帮我修一下这个 bug'), 'zh')
  assert.equal(languageOf('fix this bug'), 'en')
  assert.equal(leadingWordOf('please run tests'), 'please run')
  assert.equal(leadingWordOf('帮我跑测试'), '帮我')
})

// ── 隐私 ────────────────────────────────────────────────────────────────

check('redact removes credentials and identifiers', () => {
  const raw = 'token sk-abcdefghijklmnopqrstuvwx mail me at a.b@example.com or 13812345678'
  const clean = redact(raw)
  assert.doesNotMatch(clean, /sk-abcdefghijklmnopqrstuvwx/)
  assert.doesNotMatch(clean, /a\.b@example\.com/)
  assert.doesNotMatch(clean, /13812345678/)
  assert.match(clean, /<secret-token>/)
})

check('redact collapses absolute paths to a file name', () => {
  const clean = redact('look at E:\\work\\project\\src\\auth.ts please')
  assert.ok(clean.includes('auth.ts'))
  assert.doesNotMatch(clean, /E:\\\\work\\\\project/)
})

check('redact masks private hosts', () => {
  assert.match(redact('proxy at 192.168.1.20:7890'), /<private-host>/)
})

check('stillLooksSensitive catches what slipped through', () => {
  assert.equal(stillLooksSensitive('a sk-abcdefghijklmnopqrstuvwx b'), true)
  assert.equal(stillLooksSensitive('nothing to see'), false)
})

check('redact removes private keys whole instead of leaving the body behind', () => {
  const pem = [
    '-----BEGIN RSA PRIVATE KEY-----',
    'MIIEowIBAAKCAQEA1234567890abcdefghijklmnopqrstuvwxyz',
    '-----END RSA PRIVATE KEY-----',
  ].join('\n')
  const clean = redact(pem)
  assert.doesNotMatch(clean, /MIIEowIBAAKCAQEA/)
  assert.equal(clean, '<private-key>')
})

check('the system prompt carries memory, examples and the avoid line through both passes', () => {
  // 宿主把这三段一起拼进 system，再整体 redact + 复检；这里复现同一条链路。
  const system = [
    'You predict the next prompt.',
    'USER PROFILE:',
    '- acceptance rate: 62%; writes mail to a.b@example.com',
    'EXAMPLES:',
    '- look at E:\\work\\project\\src\\auth.ts',
  ].join('\n')
  const avoid = 'previous suggestion from 192.168.1.20'
  const outgoing = redact(system + '\n\nALREADY SUGGESTED:\n' + avoid)
  assert.doesNotMatch(outgoing, /a\.b@example\.com/)
  assert.doesNotMatch(outgoing, /E:\\work/)
  assert.doesNotMatch(outgoing, /192\.168\.1\.20/)
  assert.equal(stillLooksSensitive(outgoing), false)

  // 截断的私钥只有 BEGIN 头，整段替换匹配不到 END，脱敏会原样放过它 ——
  // 这正是第二遍复检存在的理由，也是唯一能看见这种残留的地方。
  const leaky = redact(system + '\n\nALREADY SUGGESTED:\n' + '-----BEGIN RSA PRIVATE KEY-----\nAAAAAA')
  assert.equal(stillLooksSensitive(leaky), true, 'only the whole-bundle check can see this')
})

check('local policies keep the canonical names the host and client use', () => {
  assert.equal(normalizeLocalPolicy('loopback-gateway'), 'loopback-gateway')
  assert.equal(normalizeLocalPolicy('strict-local'), 'strict-local')
  assert.equal(normalizeLocalPolicy(' strict-local '), 'strict-local')
  // 旧别名仍然可用，免得旧配置把人挡在门外。
  assert.equal(normalizeLocalPolicy('gateway'), 'loopback-gateway')
  assert.equal(normalizeLocalPolicy('strict'), 'strict-local')
  // 认不出的值落到更严格的一侧：配错不会放宽外发。
  assert.equal(normalizeLocalPolicy('nonsense'), 'strict-local')
  assert.equal(normalizeLocalPolicy(undefined), 'strict-local')
  // 规范名之外的写法都不改变「哪些端点算本机」这一层判断。
  assert.equal(outboundDecision({ allowRemote: false, endpoint: 'http://127.0.0.5:10100/v1', localPolicy: 'unknown-policy' }), 'blocked-unattested')
})

check('unknown endpoints are blocked in every policy', () => {
  assert.equal(outboundDecision({ allowRemote: false, endpoint: undefined, localPolicy: 'loopback-gateway' }), 'blocked-unknown')
  assert.equal(outboundDecision({ allowRemote: true, endpoint: undefined, localPolicy: 'loopback-gateway' }), 'blocked-unknown')
  // 这是与旧实现的实质差别：旧版把未知当放行。
  assert.equal(outboundDecision({ allowRemote: true, endpoint: 'http://0.0.0.0:8080/v1', localPolicy: 'strict-local' }), 'blocked-unknown')
  assert.equal(outboundDecision({ allowRemote: true, endpoint: 'http://[::]:8080/v1', localPolicy: 'loopback-gateway' }), 'blocked-unknown')
  assert.equal(outboundDecision({ allowRemote: true, endpoint: '', localPolicy: 'loopback-gateway' }), 'blocked-unknown')
  assert.equal(outboundDecision({ allowRemote: true, endpoint: 'not a url', localPolicy: 'loopback-gateway' }), 'blocked-unknown')
  // 只有 http(s) 能当模型端点；别的协议同样不可核实。
  assert.equal(outboundDecision({ allowRemote: true, endpoint: 'ftp://127.0.0.1/v1', localPolicy: 'loopback-gateway' }), 'blocked-unknown')
})

check('loopback-gateway allows loopback and gates remote by allowRemote alone', () => {
  const loopback = 'http://127.0.0.1:10100/v1'
  const remote = 'https://api.example.com/v1'
  assert.equal(outboundDecision({ allowRemote: false, endpoint: loopback, localPolicy: 'loopback-gateway' }), 'allowed')
  // allowRemote 与 loopback 网关是两条独立开关：打开它也不改变本机端点的裁决。
  assert.equal(outboundDecision({ allowRemote: true, endpoint: loopback, localPolicy: 'loopback-gateway' }), 'allowed')
  assert.equal(outboundDecision({ allowRemote: false, endpoint: remote, localPolicy: 'loopback-gateway' }), 'blocked-remote')
  assert.equal(outboundDecision({ allowRemote: true, endpoint: remote, localPolicy: 'loopback-gateway' }), 'allowed')
  // 整个 127/8、localhost 与 ::1 都算本机。
  assert.equal(outboundDecision({ allowRemote: false, endpoint: 'http://127.0.0.5:10100/v1', localPolicy: 'loopback-gateway' }), 'allowed')
  assert.equal(outboundDecision({ allowRemote: false, endpoint: 'http://localhost:8080/v1', localPolicy: 'loopback-gateway' }), 'allowed')
  assert.equal(outboundDecision({ allowRemote: false, endpoint: 'http://[::1]:8080/v1', localPolicy: 'loopback-gateway' }), 'allowed')
  assert.equal(outboundDecision({ allowRemote: false, endpoint: 'https://api.deepseek.com/anthropic', localPolicy: 'loopback-gateway' }), 'blocked-remote')
})

check('strict-local needs a known loopback endpoint and an attested route', () => {
  const route = { provider: 'oa-compat', model: 'glm-5.3' }
  const trusted = { trustedLocalProvider: 'oa-compat', trustedLocalModel: 'glm-5.3' }
  const loopback = 'http://127.0.0.1:8000/v1'
  const base = { endpoint: loopback, localPolicy: 'strict-local', route }

  assert.equal(outboundDecision({ ...base }), 'blocked-unattested')
  assert.equal(outboundDecision({ ...base, ...trusted }), 'allowed')
  // 部分 attest 不算：provider 与 model 必须同时给出并且完全一致。
  assert.equal(outboundDecision({ ...base, trustedLocalProvider: 'oa-compat' }), 'blocked-unattested')
  assert.equal(outboundDecision({ ...base, trustedLocalProvider: 'oa-compat', trustedLocalModel: 'other-model' }), 'blocked-unattested')
  assert.equal(outboundDecision({ ...base, trustedLocalProvider: 'other', trustedLocalModel: 'glm-5.3' }), 'blocked-unattested')
  // strict-local 优先于 allowRemote：远端凭证齐备也不放行。
  assert.equal(outboundDecision({
    endpoint: 'https://api.example.com/v1', localPolicy: 'strict-local', route, allowRemote: true, ...trusted,
  }), 'blocked-remote')
})

check('a provider with no configured baseURL has no verifiable endpoint', () => {
  // rc.2 的 llm.listProviders() 只给 { id, name }；显示名不能当身份用。
  const llm = {
    listProviders: () => [{ id: 'catalog-route', name: 'Catalog Route' }],
    listConfigurableProviders: () => [{ provider: 'catalog-route', displayName: 'Catalog Route', settingsNs: 'llm-b', settingsPath: ['providers', 'catalog-route'] }],
  }
  const settings = { describe: () => [{ ns: 'llm-b', value: { providers: { 'catalog-route': { apiKeyEnv: 'X' } } } }] }
  const ctx = { get: (name) => (name === 'llm' ? llm : name === 'settings' ? settings : undefined) }

  assert.equal(endpointOf(ctx, 'catalog-route'), undefined)
  // 显示名不是 id：用它查不到端点，也就不会被误判成另一条路由。
  assert.equal(endpointOf(ctx, 'Catalog Route'), undefined)
  // 读不到端点 → 未知 → 任何策略下都不外发。
  assert.equal(outboundDecision({
    allowRemote: true, endpoint: endpointOf(ctx, 'catalog-route'), localPolicy: 'loopback-gateway',
  }), 'blocked-unknown')
})

check('a configured route baseURL is the endpoint every model on it shares', () => {
  const llm = {
    listConfigurableProviders: () => [{ provider: 'oa-compat', displayName: 'OA', settingsNs: 'llm-b', settingsPath: ['providers', 'oa-compat'] }],
  }
  const settings = {
    describe: () => [{ ns: 'llm-b', value: { providers: { 'oa-compat': { baseURL: 'http://127.0.0.1:8000/v1', apiKeyEnv: 'K' } } } }],
  }
  const ctx = { get: (name) => (name === 'llm' ? llm : name === 'settings' ? settings : undefined) }

  assert.equal(endpointOf(ctx, 'oa-compat'), 'http://127.0.0.1:8000/v1')
  assert.equal(outboundDecision({
    allowRemote: false, endpoint: endpointOf(ctx, 'oa-compat'), localPolicy: 'loopback-gateway',
  }), 'allowed')
})

check('endpoint lookup reads settings with secrets redacted and still sees the live baseURL', () => {
  const llm = {
    listConfigurableProviders: () => [{ provider: 'oa-compat', settingsNs: 'llm-b', settingsPath: ['providers', 'oa-compat'] }],
  }
  const seen = []
  const settings = {
    // 宿主在 redactSecrets 下会剥掉 role(secret) 字段，但 baseURL 是普通字段，原样返回。
    describe: (options) => {
      seen.push(options)
      return [{
        ns: 'llm-b',
        value: options?.redactSecrets === true
          ? { providers: { 'oa-compat': { baseURL: 'http://127.0.0.1:8000/v1' } } }
          : { providers: { 'oa-compat': { baseURL: 'http://127.0.0.1:8000/v1', apiKeyEnv: 'SECRET' } } },
      }]
    },
  }
  const ctx = { get: (name) => (name === 'llm' ? llm : name === 'settings' ? settings : undefined) }

  assert.equal(endpointOf(ctx, 'oa-compat'), 'http://127.0.0.1:8000/v1')
  // 插件只请求脱敏视图：密钥字段不进插件的作用域，端点判断也用不着它们。
  assert.deepEqual(seen, [{ redactSecrets: true }])
})

check('an unreadable settings or llm service degrades to unknown', () => {
  assert.equal(endpointOf({}, 'x'), undefined)
  assert.equal(endpointOf(undefined, 'x'), undefined)
  assert.equal(endpointOf({ get: () => { throw new Error('gone') } }, 'x'), undefined)
  const broken = { get: (name) => (name === 'llm'
    ? { listConfigurableProviders: () => { throw new Error('nope') } }
    : { describe: () => [] }) }
  assert.equal(endpointOf(broken, 'x'), undefined)
})

// ── 模板 ────────────────────────────────────────────────────────────────

check('detail levels pick a char cap and a rule', () => {
  assert.equal(resolveDetail('brief').maxChars, 40)
  assert.equal(resolveDetail('detailed').maxChars, 240)
  assert.equal(resolveDetail('nonsense').label, 'standard')
})

check('the default template renders every placeholder', () => {
  const prompt = renderPrompt({
    template: DEFAULT_TEMPLATE,
    style: 'short and concrete',
    memory: '- acceptance rate: 70%',
    examples: '- run the tests',
    language: 'English',
    detailLevel: 'standard',
    maxChars: 100,
  })
  assert.ok(prompt.includes('short and concrete'))
  assert.ok(prompt.includes('acceptance rate: 70%'))
  assert.ok(prompt.includes('- run the tests'))
  assert.ok(prompt.includes('At most 100 visible characters'))
  assert.doesNotMatch(prompt, /\{\{/)
})

check('an empty slot renders a neutral note rather than an empty heading', () => {
  const prompt = renderPrompt({ template: DEFAULT_TEMPLATE, style: '', memory: '', examples: '', language: 'English', detailLevel: 'standard', maxChars: 80 })
  assert.ok(prompt.includes('(none configured)'))
})

check('a custom template is honored', () => {
  const prompt = renderPrompt({ template: 'Only this: {{style}} / {{detail}}', style: 'terse', language: 'English', detailLevel: 'brief', maxChars: 40 })
  assert.ok(prompt.includes('Only this: terse'))
  assert.ok(prompt.includes('1-6 words'))
})

check('dropping instructions re-adds the hard constraints', () => {
  const prompt = renderPrompt({ template: 'Just suggest something for {{language}}.', style: '', language: 'English', detailLevel: 'standard', maxChars: 80 })
  assert.ok(prompt.startsWith(INSTRUCTIONS))
})

check('template validation flags missing and unknown placeholders', () => {
  const problems = validateTemplate('Hello {{user}}')
  assert.ok(problems.some((text) => text.includes('{{instructions}}')))
  assert.ok(problems.some((text) => text.includes('{{user}}')))
  assert.deepEqual(validateTemplate(DEFAULT_TEMPLATE), [])
})

// ── 风格预设 ─────────────────────────────────────────────────────────────

check('every preset carries its own instruction and recommended values', () => {
  const ids = Object.keys(STYLE_PRESETS)
  assert.ok(ids.includes('neutral') && ids.includes('plan') && ids.includes('theory'))
  for (const id of ids) {
    const preset = STYLE_PRESETS[id]
    assert.equal(preset.id, id)
    assert.ok(preset.label.zh !== '' && preset.label.en !== '')
    assert.ok(['brief', 'standard', 'detailed'].includes(preset.detailLevel))
    assert.ok(preset.maxChars > 0)
  }
  assert.equal(STYLE_PRESETS.neutral.style, '')
})

check('an unknown preset id falls back to the default instead of breaking', () => {
  assert.equal(resolvePreset('nope').id, DEFAULT_PRESET)
  assert.equal(resolvePreset(undefined).id, DEFAULT_PRESET)
  assert.equal(resolvePreset('PLAN').id, 'plan')
})

check('the chosen preset and the user text both reach the prompt', () => {
  const style = composeStyle('theory', 'say why before how')
  assert.ok(style.includes('mechanisms before coding'))
  assert.ok(style.includes('say why before how'))
  const prompt = renderPrompt({ template: DEFAULT_TEMPLATE, style, language: 'English', detailLevel: 'detailed', maxChars: 240 })
  assert.ok(prompt.includes('mechanisms before coding'))
  assert.ok(prompt.includes('say why before how'))
})

check('neutral plus no custom text renders the empty-slot note', () => {
  assert.equal(composeStyle('neutral', ''), '')
  assert.equal(composeStyle('neutral', '   '), '')
  const prompt = renderPrompt({ template: DEFAULT_TEMPLATE, style: composeStyle('neutral', ''), language: 'English', detailLevel: 'standard', maxChars: 80 })
  assert.ok(prompt.includes('(none configured)'))
})

check('plan and theory presets describe a shape without writing the answer', () => {
  for (const id of ['plan', 'theory']) {
    const style = STYLE_PRESETS[id].style.toLowerCase()
    assert.ok(style.length > 80, id + ' should describe the shape of the prompt it wants')
    // 预设只描述「用户会怎么问」，绝不能鼓励模型自己产出方案或推导。
    assert.match(style, /never write/ )
  }
})

console.log('\n' + passed + ' passed, ' + failures.length + ' failed')
if (failures.length > 0) process.exitCode = 1
