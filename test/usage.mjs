/**
 * token 账本自检（纯函数）。
 * 用法：node test/usage.mjs
 */
import assert from 'node:assert/strict'
import { emptyUsage, recordUsage, summarizeUsage, normalizeUsage, routeKeyOf, estimateCost } from '../lib/usage.js'

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

const route = { provider: 'opencodex', model: 'glm-5.3' }

check('an empty ledger reports zeroes', () => {
  const summary = summarizeUsage(emptyUsage())
  assert.equal(summary.calls, 0)
  assert.equal(summary.totalTokens, 0)
  assert.equal(summary.avgTokensPerCall, 0)
})

check('normalizeUsage fills missing fields and derives the total', () => {
  assert.deepEqual(normalizeUsage({ inputTokens: 10, outputTokens: 5 }), {
    inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheWriteTokens: 0, reasoningTokens: 0, totalTokens: 15,
  })
  assert.equal(normalizeUsage({ inputTokens: 10, outputTokens: 5, totalTokens: 99 }).totalTokens, 99)
  assert.equal(normalizeUsage(undefined).totalTokens, 0)
})

check('a successful call adds tokens and a route bucket', () => {
  const next = recordUsage(emptyUsage(), { route, tokens: { inputTokens: 1000, outputTokens: 100 }, outcome: 'ok', kind: 'turn', now: 1 })
  assert.equal(next.calls, 1)
  assert.equal(next.failures, 0)
  assert.equal(next.totalTokens, 1100)
  assert.equal(next.routes.length, 1)
  assert.equal(next.routes[0].key, 'opencodex/glm-5.3')
  assert.equal(next.recent[0].kind, 'turn')
})

check('a call without a suggestion still counts as usage', () => {
  const next = recordUsage(emptyUsage(), { route, tokens: { inputTokens: 500, outputTokens: 0 }, outcome: 'empty', kind: 'idle', now: 1 })
  assert.equal(next.calls, 1)
  assert.equal(next.failures, 1)
  assert.equal(next.totalTokens, 500)
})

check('failed calls are counted separately from successes', () => {
  let ledger = emptyUsage()
  ledger = recordUsage(ledger, { route, tokens: {}, outcome: 'ok', kind: 'turn', now: 1 })
  ledger = recordUsage(ledger, { route, tokens: {}, outcome: 'error', kind: 'turn', now: 2 })
  const summary = summarizeUsage(ledger)
  assert.equal(summary.calls, 2)
  assert.equal(summary.failures, 1)
  assert.equal(summary.succeeded, 1)
})

check('routes are aggregated and sorted by spend', () => {
  let ledger = emptyUsage()
  ledger = recordUsage(ledger, { route, tokens: { inputTokens: 100, outputTokens: 10 }, outcome: 'ok', kind: 'turn', now: 1 })
  ledger = recordUsage(ledger, { route: { provider: 'other', model: 'big' }, tokens: { inputTokens: 9000, outputTokens: 500 }, outcome: 'ok', kind: 'turn', now: 2 })
  ledger = recordUsage(ledger, { route, tokens: { inputTokens: 100, outputTokens: 10 }, outcome: 'ok', kind: 'turn', now: 3 })
  assert.equal(ledger.routes.length, 2)
  assert.equal(ledger.routes[0].key, 'other/big')
  const summary = summarizeUsage(ledger)
  assert.equal(summary.calls, 3)
  assert.equal(summary.totalTokens, 9720)
})

check('the recent list is newest first and bounded', () => {
  let ledger = emptyUsage()
  for (let index = 0; index < 60; index += 1) {
    ledger = recordUsage(ledger, { route, tokens: { inputTokens: 1 }, outcome: 'ok', kind: 'turn', now: index + 1 })
  }
  assert.equal(ledger.recent.length, 50)
  assert.equal(ledger.recent[0].at, 60)
})

check('route keys tolerate missing routes', () => {
  assert.equal(routeKeyOf(undefined), 'unknown')
  assert.equal(routeKeyOf({ provider: 'p' }), 'p/unknown')
})

check('cost estimation scales by the million', () => {
  const summary = summarizeUsage(recordUsage(emptyUsage(), { route, tokens: { inputTokens: 1000000, outputTokens: 0 }, outcome: 'ok', kind: 'turn', now: 1 }))
  assert.equal(estimateCost(summary, 2), 2)
  assert.equal(estimateCost(summary, undefined), undefined)
})

console.log('\n' + passed + ' passed, ' + failures.length + ' failed')
if (failures.length > 0) process.exitCode = 1

