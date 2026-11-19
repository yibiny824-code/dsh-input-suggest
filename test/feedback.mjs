/**
 * 反馈账本自检（纯函数）。
 * 用法：node test/feedback.mjs
 */
import assert from 'node:assert/strict'
import {
  emptyFeedback, recordFeedback, summarizeFeedback, editRatio, normalizeDraft, feedbackSchema,
} from '../lib/feedback.js'

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

check('an empty ledger passes its schema and reports no rates', () => {
  const empty = emptyFeedback()
  assert.equal(feedbackSchema.safeParse(empty).success, true)
  const summary = summarizeFeedback(empty)
  assert.equal(summary.shown, 0)
  assert.equal(summary.acceptRate, null)
  assert.equal(summary.sendRate, null)
  assert.equal(summary.avgEditRatio, null)
  assert.equal(summary.duplicateRate, null)
  assert.equal(summary.avgResponseMs, null)
  assert.equal(summary.tokensPerSent, null)
})

check('the ledger holds numbers only', () => {
  for (const value of Object.values(emptyFeedback())) assert.equal(typeof value, 'number')
})

check('shown and accepted build an acceptance rate', () => {
  let ledger = emptyFeedback()
  for (let index = 0; index < 4; index += 1) ledger = recordFeedback(ledger, { event: 'shown', now: index + 1 })
  ledger = recordFeedback(ledger, { event: 'accepted', now: 10 })
  assert.equal(ledger.shown, 4)
  assert.equal(ledger.accepted, 1)
  assert.equal(summarizeFeedback(ledger).acceptRate, 0.25)
})

check('acceptRate is null until something was shown', () => {
  let ledger = emptyFeedback()
  ledger = recordFeedback(ledger, { event: 'accepted', now: 1 })
  ledger = recordFeedback(ledger, { event: 'accepted', now: 2 })
  assert.equal(summarizeFeedback(ledger).acceptRate, null)
})

check('sendRate divides sent by accepted and is null before the first acceptance', () => {
  let ledger = recordFeedback(emptyFeedback(), { event: 'shown', now: 1 })
  assert.equal(summarizeFeedback(ledger).sendRate, null)
  ledger = recordFeedback(ledger, { event: 'accepted', now: 2 })
  assert.equal(summarizeFeedback(ledger).sendRate, 0)
  ledger = recordFeedback(ledger, { event: 'sent', editRatio: 0, now: 3 })
  assert.equal(summarizeFeedback(ledger).sendRate, 1)
})

check('avgEditRatio averages sent ratios and counts a zero edit as a sample', () => {
  let ledger = emptyFeedback()
  ledger = recordFeedback(ledger, { event: 'sent', editRatio: 0, now: 1 })
  ledger = recordFeedback(ledger, { event: 'sent', editRatio: 0.6, now: 2 })
  assert.equal(summarizeFeedback(ledger).avgEditRatio, 0.3)
})

check('avgEditRatio is null when no sent event carried a ratio', () => {
  const ledger = recordFeedback(emptyFeedback(), { event: 'sent', now: 1 })
  assert.equal(ledger.sent, 1)
  assert.equal(summarizeFeedback(ledger).avgEditRatio, null)
})

check('edited counts on its own and does not skew the sent average', () => {
  let ledger = emptyFeedback()
  ledger = recordFeedback(ledger, { event: 'edited', editRatio: 0.9, now: 1 })
  ledger = recordFeedback(ledger, { event: 'sent', editRatio: 0.1, now: 2 })
  const summary = summarizeFeedback(ledger)
  assert.equal(summary.edited, 1)
  assert.equal(summary.sent, 1)
  assert.equal(summary.avgEditRatio, 0.1)
})

check('out-of-range ratios are clamped into 0..1', () => {
  let ledger = recordFeedback(emptyFeedback(), { event: 'sent', editRatio: 2, now: 1 })
  ledger = recordFeedback(ledger, { event: 'sent', editRatio: -3, now: 2 })
  assert.equal(summarizeFeedback(ledger).avgEditRatio, 0.5)
})

check('non-numeric ratios are ignored instead of counted as zero', () => {
  let ledger = recordFeedback(emptyFeedback(), { event: 'sent', editRatio: 0.4, now: 1 })
  ledger = recordFeedback(ledger, { event: 'sent', editRatio: Number.NaN, now: 2 })
  ledger = recordFeedback(ledger, { event: 'sent', now: 3 })
  assert.equal(summarizeFeedback(ledger).avgEditRatio, 0.4)
})

check('duplicate rate uses candidates as its denominator', () => {
  let ledger = emptyFeedback()
  ledger = recordFeedback(ledger, { event: 'candidate', now: 1 })
  ledger = recordFeedback(ledger, { event: 'candidate', duplicate: true, now: 2 })
  ledger = recordFeedback(ledger, { event: 'candidate', duplicate: false, now: 3 })
  ledger = recordFeedback(ledger, { event: 'candidate', now: 4 })
  const summary = summarizeFeedback(ledger)
  assert.equal(summary.candidates, 4)
  assert.equal(summary.duplicates, 1)
  assert.equal(summary.duplicateRate, 0.25)
})

check('duplicate rate is null with no candidates', () => {
  const ledger = recordFeedback(emptyFeedback(), { event: 'shown', now: 1 })
  assert.equal(summarizeFeedback(ledger).duplicateRate, null)
})

check('duplicates are only taken from candidate events', () => {
  let ledger = recordFeedback(emptyFeedback(), { event: 'shown', duplicate: true, now: 1 })
  ledger = recordFeedback(ledger, { event: 'sent', duplicate: true, now: 2 })
  assert.equal(ledger.duplicates, 0)
  assert.equal(summarizeFeedback(ledger).duplicateRate, null)
})

check('avgResponseMs averages candidate latencies', () => {
  let ledger = recordFeedback(emptyFeedback(), { event: 'candidate', responseMs: 100, now: 1 })
  ledger = recordFeedback(ledger, { event: 'candidate', responseMs: 201, now: 2 })
  assert.equal(summarizeFeedback(ledger).avgResponseMs, 151)
})

check('a candidate without a latency is not a latency sample', () => {
  let ledger = recordFeedback(emptyFeedback(), { event: 'candidate', responseMs: 80, now: 1 })
  ledger = recordFeedback(ledger, { event: 'candidate', now: 2 })
  ledger = recordFeedback(ledger, { event: 'candidate', responseMs: -5, now: 3 })
  assert.equal(summarizeFeedback(ledger).candidates, 3)
  assert.equal(summarizeFeedback(ledger).avgResponseMs, 80)
})

check('avgResponseMs is null with no latency samples', () => {
  const ledger = recordFeedback(emptyFeedback(), { event: 'candidate', duplicate: true, now: 1 })
  assert.equal(summarizeFeedback(ledger).avgResponseMs, null)
})

check('tokensPerSent divides usage by delivered suggestions', () => {
  let ledger = emptyFeedback()
  ledger = recordFeedback(ledger, { event: 'model-call', tokens: 4000, now: 1 })
  assert.equal(summarizeFeedback(ledger).tokensPerSent, null)
  ledger = recordFeedback(ledger, { event: 'sent', now: 1 })
  ledger = recordFeedback(ledger, { event: 'sent', now: 2 })
  assert.equal(summarizeFeedback(ledger).tokensPerSent, 2000)
})

check('recording does not mutate the ledger it was given', () => {
  const before = emptyFeedback()
  const after = recordFeedback(before, { event: 'shown', now: 5 })
  assert.equal(before.shown, 0)
  assert.equal(before.createdAt, 0)
  assert.equal(after.shown, 1)
  assert.notEqual(before, after)
})

check('the first event stamps createdAt and later events move updatedAt', () => {
  let ledger = recordFeedback(emptyFeedback(), { event: 'shown', now: 100 })
  ledger = recordFeedback(ledger, { event: 'accepted', now: 250 })
  assert.equal(ledger.createdAt, 100)
  assert.equal(ledger.updatedAt, 250)
  const summary = summarizeFeedback(ledger)
  assert.equal(summary.since, 100)
  assert.equal(summary.updatedAt, 250)
})

check('unknown or missing events are rejected', () => {
  assert.throws(() => recordFeedback(emptyFeedback(), { event: 'ignored' }), TypeError)
  assert.throws(() => recordFeedback(emptyFeedback(), {}), TypeError)
  assert.throws(() => recordFeedback(emptyFeedback(), undefined), TypeError)
})

check('the ledger survives a JSON round trip', () => {
  let ledger = emptyFeedback()
  ledger = recordFeedback(ledger, { event: 'candidate', responseMs: 42, now: 100 })
  ledger = recordFeedback(ledger, { event: 'sent', editRatio: 0.25, now: 101 })
  const restored = JSON.parse(JSON.stringify(ledger))
  assert.equal(feedbackSchema.safeParse(restored).success, true)
  assert.equal(summarizeFeedback(restored).avgEditRatio, 0.25)
})

check('the schema rejects a foreign version and broken counters', () => {
  const empty = emptyFeedback()
  assert.equal(feedbackSchema.safeParse({ ...empty, version: 2 }).success, false)
  assert.equal(feedbackSchema.safeParse({ ...empty, version: undefined }).success, false)
  assert.equal(feedbackSchema.safeParse({ ...empty, shown: 1.5 }).success, false)
  assert.equal(feedbackSchema.safeParse({ ...empty, sent: -1 }).success, false)
  assert.equal(feedbackSchema.safeParse({ ...empty, editRatioSum: 'x' }).success, false)
})

check('text fields never survive schema parsing', () => {
  const parsed = feedbackSchema.parse({ ...emptyFeedback(), lastSuggestion: 'deploy the branch', sent: 1 })
  assert.deepEqual(Object.keys(parsed).sort(), Object.keys(emptyFeedback()).sort())
  for (const value of Object.values(parsed)) assert.equal(typeof value, 'number')
})

check('a partial record still summarizes without throwing', () => {
  const summary = summarizeFeedback({ version: 1, createdAt: 7, shown: 2, accepted: 1, sent: 1 })
  assert.equal(summary.acceptRate, 0.5)
  assert.equal(summary.sendRate, 1)
  assert.equal(summary.duplicateRate, null)
  assert.equal(summary.since, 7)
})

check('editRatio treats formatting-only differences as no edit', () => {
  assert.equal(editRatio('run the tests', 'Run  the tests. '), 0)
  assert.equal(editRatio('line one\nline two', 'line one\n\n   line two  '), 0)
  assert.equal(editRatio('', ''), 0)
  assert.equal(editRatio('跑测试', '跑测试。'), 0)
})

check('normalizeDraft keeps line structure and drops blank lines', () => {
  assert.equal(normalizeDraft('  a  b \n\r\n c\n'), 'a b\nc')
  assert.equal(normalizeDraft(undefined), '')
})

check('editRatio grows with substantive word edits', () => {
  const ratio = editRatio('run the tests', 'run the unit tests please')
  assert.ok(ratio > 0 && ratio < 1)
  assert.ok(editRatio('跑测试', '跑一遍测试') > 0)
})

check('editRatio reaches 1 for a rewrite with nothing in common', () => {
  assert.equal(editRatio('abc', 'xyz'), 1)
  assert.ok(editRatio('run the tests', 'deploy the branch') > 0.6)
})

check('editRatio is 1 when one side is empty', () => {
  assert.equal(editRatio('run the tests', ''), 1)
  assert.equal(editRatio('', 'run the tests'), 1)
})

check('editRatio stays bounded on very long drafts', () => {
  const ratio = editRatio('x' + 'a'.repeat(5000), 'y' + 'a'.repeat(5000))
  assert.ok(Number.isFinite(ratio))
  assert.ok(ratio >= 0 && ratio <= 1)
  assert.equal(ratio, 1 / 2000)
  assert.equal(editRatio('a'.repeat(5000), 'a'.repeat(5000) + 'b'), 0)
})

console.log('\n' + passed + ' passed, ' + failures.length + ' failed')
if (failures.length > 0) process.exitCode = 1

