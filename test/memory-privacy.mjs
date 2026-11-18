/**
 * 记忆 / 隐私 / 模板的自检（纯函数）。
 * 用法：node test/memory-privacy.mjs
 */
import assert from 'node:assert/strict'
import { emptyProfile, recordObservation, describeProfile, recentAccepted, similarity, ADOPT_THRESHOLD, languageOf, leadingWordOf, editDistance } from '../lib/memory.js'
import { redact, isLoopbackEndpoint, outboundDecision, stillLooksSensitive } from '../lib/privacy.js'
import { renderPrompt, validateTemplate, DEFAULT_TEMPLATE, INSTRUCTIONS, resolveDetail } from '../lib/prompt.js'

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

check('outbound decisions fail closed for remote endpoints', () => {
  assert.equal(isLoopbackEndpoint('http://127.0.0.1:10100/v1'), true)
  assert.equal(isLoopbackEndpoint('https://api.example.com/v1'), false)
  assert.equal(outboundDecision({ allowRemote: false, endpoint: 'http://127.0.0.1:10100/v1' }), 'allowed')
  assert.equal(outboundDecision({ allowRemote: false, endpoint: 'https://api.example.com/v1' }), 'blocked-remote')
  assert.equal(outboundDecision({ allowRemote: true, endpoint: 'https://api.example.com/v1' }), 'allowed')
  // 端点未知时放行：否则读不到 baseURL 的本地适配器会让功能静默失效。
  assert.equal(outboundDecision({ allowRemote: false, endpoint: undefined }), 'allowed')
  assert.equal(outboundDecision({ allowRemote: false, endpoint: 'http://localhost:10100/v1' }), 'allowed')
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

console.log('\n' + passed + ' passed, ' + failures.length + ' failed')
if (failures.length > 0) process.exitCode = 1

