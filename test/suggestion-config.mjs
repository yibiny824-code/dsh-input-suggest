/**
 * suggestion-config tests: whitelist, validation, merge, preview, ops.
 */
import assert from 'node:assert/strict'
import {
  AGENT_FIELDS, FIELD_DEFAULTS, emptyOverrides, readOverrides, validatePatch,
  effectiveConfig, previewPatch, settingsOpsOf, normalizeResetFields,
} from '../lib/suggestion-config.js'

let passed = 0
const failures = []

function check(label, fn) {
  try {
    fn()
    passed += 1
    console.log('  ok   ' + label)
  } catch (error) {
    failures.push(label)
    console.log('  FAIL ' + label)
    console.log('       ' + (error instanceof Error ? error.message : String(error)))
  }
}
check('agent fields only cover writing strategy, never safety fields', () => {
  assert.ok(AGENT_FIELDS.includes('stylePreset'))
  assert.ok(AGENT_FIELDS.includes('outputFormat'))
  assert.ok(AGENT_FIELDS.includes('maxSuggestionChars'))
  assert.ok(!AGENT_FIELDS.includes('enabled'))
  assert.ok(!AGENT_FIELDS.includes('allowRemote'))
  assert.ok(!AGENT_FIELDS.includes('localPolicy'))
  assert.ok(!AGENT_FIELDS.includes('provider'))
})

check('validatePatch accepts known fields with valid values', () => {
  const result = validatePatch({
    stylePreset: 'Theory',
    outputFormat: 'structured',
    detailLevel: 'detailed',
    maxSuggestionChars: 400,
    mode: 'predict',
  })
  assert.equal(result.ok, true)
  assert.equal(result.value.stylePreset, 'theory')
  assert.equal(result.value.outputFormat, 'structured')
  assert.equal(result.value.maxSuggestionChars, 400)
})

check('validatePatch rejects unknown fields and safety fields', () => {
  const rejected = validatePatch({ enabled: false, allowRemote: true, nope: 'x' })
  assert.equal(rejected.ok, false)
  assert.ok(rejected.problems.some((problem) => problem.includes('enabled')))
  assert.ok(rejected.problems.some((problem) => problem.includes('allowRemote')))
  assert.ok(rejected.problems.some((problem) => problem.includes('nope')))
})

check('validatePatch rejects invalid values', () => {
  assert.equal(validatePatch({ stylePreset: 'unknown-preset' }).ok, false)
  assert.equal(validatePatch({ outputFormat: 'unknown-format' }).ok, false)
  assert.equal(validatePatch({ detailLevel: 'extreme' }).ok, false)
  assert.equal(validatePatch({ maxSuggestionChars: 0 }).ok, false)
  assert.equal(validatePatch({ maxSuggestionChars: 9999 }).ok, false)
})

check('validatePatch rejects a broken template loudly', () => {
  const result = validatePatch({ template: '{{unknown_placeholder}} and no {{maxChars}}' })
  assert.equal(result.ok, false)
  assert.ok(result.problems.some((problem) => problem.includes('unknown_placeholder')))
})

check('effectiveConfig merges session overrides over profile', () => {
  const profile = { stylePreset: 'neutral', outputFormat: 'single-line', maxSuggestionChars: 200, mode: 'hybrid' }
  const overrides = { version: 1, fields: { stylePreset: 'theory', outputFormat: 'research' } }
  const merged = effectiveConfig(profile, overrides)
  assert.equal(merged.stylePreset, 'theory')
  assert.equal(merged.outputFormat, 'research')
  assert.equal(merged.maxSuggestionChars, 200)
  assert.equal(merged.mode, 'hybrid')
})

check('effectiveConfig without overrides keeps profile intact', () => {
  const profile = { stylePreset: 'code', outputFormat: 'concise' }
  const merged = effectiveConfig(profile, undefined)
  assert.equal(merged.stylePreset, 'code')
  assert.equal(merged.outputFormat, 'concise')
})

check('readOverrides drops malformed stored shapes', () => {
  assert.deepEqual(readOverrides(undefined), emptyOverrides())
  assert.deepEqual(readOverrides(null), emptyOverrides())
  assert.deepEqual(readOverrides({}), emptyOverrides())
  const read = readOverrides({ version: 1, fields: { stylePreset: 'plan', enabled: true } })
  assert.deepEqual(read.fields, { stylePreset: 'plan' })
})

check('previewPatch shows the exact diff without touching values', () => {
  const before = effectiveConfig({ stylePreset: 'neutral', outputFormat: 'single-line' }, undefined)
  const preview = previewPatch(before, { stylePreset: 'theory', outputFormat: 'structured' })
  assert.equal(preview.ok, true)
  assert.equal(preview.changes.length, 2)
  assert.ok(preview.changes.some((c) => c.field === 'stylePreset' && c.from === 'neutral' && c.to === 'theory'))
  assert.ok(preview.changes.some((c) => c.field === 'outputFormat' && c.from === 'single-line' && c.to === 'structured'))
  assert.equal(before.stylePreset, 'neutral')
})

check('previewPatch reports problems without changes', () => {
  const before = effectiveConfig({}, undefined)
  const preview = previewPatch(before, { nope: 1 })
  assert.equal(preview.ok, false)
  assert.equal(preview.changes.length, 0)
  assert.ok(preview.problems.length > 0)
})

check('settingsOpsOf produces set and unset ops for changed fields only', () => {
  const before = { stylePreset: 'neutral', style: '', maxSuggestionChars: 240, outputFormat: 'single-line' }
  const after = { stylePreset: 'theory', style: 'keep it tight', maxSuggestionChars: 240, outputFormat: 'single-line' }
  const ops = settingsOpsOf(before, after)
  assert.deepEqual(ops, [
    { op: 'set', path: ['style'], value: 'keep it tight' },
    { op: 'set', path: ['stylePreset'], value: 'theory' },
  ])
})

check('settingsOpsOf unsets empty-string values', () => {
  const before = { style: 'old instruction' }
  const after = { style: '' }
  const ops = settingsOpsOf(before, after)
  assert.deepEqual(ops, [{ op: 'unset', path: ['style'] }])
})

check('normalizeResetFields accepts whitelist and rejects the rest', () => {
  assert.deepEqual(normalizeResetFields(undefined), [...AGENT_FIELDS])
  assert.deepEqual(normalizeResetFields(['stylePreset', 'outputFormat']), ['outputFormat', 'stylePreset'])
  assert.deepEqual(normalizeResetFields(['stylePreset', 'enabled']), ['stylePreset'])
  assert.deepEqual(normalizeResetFields('not-array'), [])
})

check('field defaults match the plugin defaults', () => {
  assert.equal(FIELD_DEFAULTS.stylePreset, 'neutral')
  assert.equal(FIELD_DEFAULTS.outputFormat, 'single-line')
  assert.equal(FIELD_DEFAULTS.detailLevel, 'standard')
  assert.equal(FIELD_DEFAULTS.maxSuggestionChars, 240)
  assert.equal(FIELD_DEFAULTS.mode, 'hybrid')
})

console.log('')
console.log(passed + ' passed, ' + failures.length + ' failed')
if (failures.length > 0) process.exitCode = 1
