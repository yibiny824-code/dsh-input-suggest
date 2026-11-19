import assert from 'node:assert/strict'
import { hostModuleUrl } from './resolve-host.mjs'

import { Config, resolveConfig } from '../lib/index.js'

const resolved = Config({
  enabled: true,
  provider: '',
  model: '',
  reasoningEffort: '',
  style: '',
  acceptKey: 'Tab',
  maxRecentTurns: 1,
  maxTranscriptChars: 12000,
  maxSuggestionChars: 240,
  maxOutputTokens: 512,
  timeoutMs: 60000,
})
const fields = [
  'localPolicy', 'trustedLocalProvider', 'trustedLocalModel', 'mode', 'taskAwareness',
  'contextLevel', 'taskMemoryMinutes', 'draftCompletion',
]
for (const field of fields) assert.equal(typeof resolved[field].get, 'function', field)
assert.equal(resolveConfig(resolved).mode, 'hybrid')
assert.equal(resolveConfig(resolved).contextLevel, 'task')
assert.equal(resolveConfig(resolved).allowRemote, false)

const disabled = resolveConfig(Config({
  mode: 'predict', taskAwareness: false, contextLevel: 'recent', taskMemoryMinutes: 0, learn: false,
}))
assert.equal(disabled.mode, 'predict')
assert.equal(disabled.taskAwareness, false)
assert.equal(disabled.taskMemoryMinutes, 0)
assert.equal(disabled.learn, false)

for (const config of [
  { maxOutputTokens: 0 }, { taskMemoryMinutes: 121 }, { taskMemoryMinutes: -1 },
  { mode: 'unknown' }, { contextLevel: 'unknown' }, { localPolicy: 'unknown' },
]) {
  assert.throws(() => Config(config), JSON.stringify(config))
}
console.log('configuration defaults, volatile fields, valid overrides and bounds passed')

