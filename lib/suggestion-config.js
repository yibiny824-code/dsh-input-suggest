/**
 * dsh-input-suggest / suggestion-config — Agent 自然语言配置的纯函数层。
 *
 * 分工：本模块只做「字段白名单 + 校验 + 合并 + 预览」，不触碰宿主服务；
 * 持久化与工具注册在 agent-control.js / index.js。
 *
 * 三级优先级（高 → 低）：
 *   session override（会话内存，插件重启即失）
 *   profile configuration（DSH settings 持久层，settings.mutate 写回）
 *   plugin defaults（ConfigSchema 的 default）
 *
 * Agent 可改的字段只限本模块的 AGENT_FIELDS 白名单，且必须是 volatile：
 * 非白名单字段（enabled、allowRemote、localPolicy 等安全语义字段）一律拒绝。
 *
 * @module dsh-input-suggest/suggestion-config
 */

import { STYLE_PRESETS, DEFAULT_PRESET, FORMAT_SPECS, DEFAULT_FORMAT,
  resolvePreset, resolveFormat, resolveDetail, resolveMode, validateTemplate } from './prompt.js'

/** Agent 工具允许修改的全部字段（按 JSON key 排序，输出保持稳定）。 */
export const AGENT_FIELDS = Object.freeze([
  'detailLevel',
  'formatTemplate',
  'maxSuggestionChars',
  'mode',
  'outputFormat',
  'style',
  'stylePreset',
  'template',
])

/** 字段的人类可读说明，inspect 与错误信息共用一份。 */
export const FIELD_DESCRIPTIONS = Object.freeze({
  stylePreset: 'style preset id: ' + Object.keys(STYLE_PRESETS).join(', '),
  style: 'extra writing instructions appended after the preset (free text)',
  outputFormat: 'output shape: ' + Object.keys(FORMAT_SPECS).join(', '),
  formatTemplate: 'custom structure description, used only when outputFormat=custom',
  detailLevel: 'brief | standard | detailed',
  maxSuggestionChars: 'hard character cap (1..2000)',
  mode: 'predict | next-action | hybrid',
  template: 'full prompt template; empty = built-in; supports the documented placeholders',
})

/** 每个字段的默认值（与 ConfigSchema 的 default 对齐，供 reset 使用）。 */
export const FIELD_DEFAULTS = Object.freeze({
  stylePreset: DEFAULT_PRESET,
  style: '',
  outputFormat: DEFAULT_FORMAT,
  formatTemplate: '',
  detailLevel: 'standard',
  maxSuggestionChars: 240,
  mode: 'hybrid',
  template: '',
})

/** 插件默认层（最低优先级）。 */
export function emptyOverrides() {
  return { version: 1, fields: {} }
}

/** 读一段 override 存档；形状不对时回落为空（旧版无此表）。 */
export function readOverrides(stored) {
  if (stored === null || typeof stored !== 'object' || typeof stored.fields !== 'object' || stored.fields === null) {
    return emptyOverrides()
  }
  const fields = {}
  for (const key of AGENT_FIELDS) {
    if (Object.hasOwn(stored.fields, key)) fields[key] = stored.fields[key]
  }
  return { version: 1, fields }
}

const isText = (value) => typeof value === 'string'
const isCount = (value, min, max) => Number.isSafeInteger(value) && value >= min && value <= max

/**
 * 校验一个配置补丁。
 *
 * @returns {{ok: true, value: object} | {ok: false, problems: string[]}}
 *   ok 时 value 只包含白名单内的合法字段；未知字段、非法值、安全字段全部拒绝。
 */
export function validatePatch(patch) {
  if (patch === null || typeof patch !== 'object' || Array.isArray(patch)) {
    return { ok: false, problems: ['patch must be an object'] }
  }
  const problems = []
  const value = {}
  for (const [key, raw] of Object.entries(patch)) {
    if (!AGENT_FIELDS.includes(key)) {
      problems.push('field "' + key + '" is not configurable through the agent tool; allowed: ' + AGENT_FIELDS.join(', '))
      continue
    }
    if (key === 'stylePreset') {
      const id = isText(raw) ? raw.trim().toLowerCase() : ''
      if (!Object.hasOwn(STYLE_PRESETS, id)) {
        problems.push('stylePreset "' + String(raw) + '" is unknown; known: ' + Object.keys(STYLE_PRESETS).join(', '))
        continue
      }
      value[key] = id
      continue
    }
    if (key === 'outputFormat') {
      const id = isText(raw) ? raw.trim().toLowerCase().replace(/_/g, '-') : ''
      if (!Object.hasOwn(FORMAT_SPECS, id)) {
        problems.push('outputFormat "' + String(raw) + '" is unknown; known: ' + Object.keys(FORMAT_SPECS).join(', '))
        continue
      }
      value[key] = id
      continue
    }
    if (key === 'detailLevel') {
      const level = isText(raw) ? raw.trim().toLowerCase() : ''
      if (!['brief', 'standard', 'detailed'].includes(level)) {
        problems.push('detailLevel must be brief | standard | detailed')
        continue
      }
      value[key] = level
      continue
    }
    if (key === 'mode') {
      const normalized = resolveMode(raw)
      if (isText(raw) && normalized !== String(raw).trim().toLowerCase()) {
        // resolveMode 接受 alias，这里直接存归一化结果。
      }
      value[key] = normalized
      continue
    }
    if (key === 'maxSuggestionChars') {
      if (!isCount(raw, 1, 2000)) {
        problems.push('maxSuggestionChars must be an integer in 1..2000')
        continue
      }
      value[key] = raw
      continue
    }
    if (key === 'template' || key === 'formatTemplate') {
      if (!isText(raw)) {
        problems.push('"' + key + '" must be a string')
        continue
      }
      const text = raw.slice(0, 8000)
      if (key === 'template') {
        const templateProblems = validateTemplate(text)
        if (templateProblems.length > 0) {
          problems.push('template problems: ' + templateProblems.join('; '))
          continue
        }
      }
      value[key] = text
      continue
    }
    if (key === 'style') {
      if (!isText(raw)) {
        problems.push('"style" must be a string')
        continue
      }
      value[key] = raw.slice(0, 4000)
      continue
    }
  }
  return problems.length > 0 ? { ok: false, problems } : { ok: true, value }
}

/** 合并 override 到 base：override 中未设置的字段沿用 base。 */
function mergeLayer(base, override) {
  const out = { ...base }
  for (const key of AGENT_FIELDS) {
    if (Object.hasOwn(override, key)) out[key] = override[key]
  }
  return out
}

/**
 * 计算某会话的最终生效配置（供 inspect-effective 与生成路径）。
 *
 * @param {object} profile - 当前 profile 的解析后配置。
 * @param {object|undefined} sessionOverrides - 该会话的 override 存档。
 * @returns {object} 最终配置（含 stylePresetLabel / formatLabel 等展示位）。
 */
export function effectiveConfig(profile, sessionOverrides) {
  const base = {}
  for (const key of AGENT_FIELDS) {
    base[key] = profile[key] ?? FIELD_DEFAULTS[key]
  }
  const merged = sessionOverrides === undefined ? base : mergeLayer(base, readOverrides(sessionOverrides).fields)
  return {
    ...merged,
    stylePresetLabel: STYLE_PRESETS[resolvePreset(merged.stylePreset).id]?.label?.en ?? merged.stylePreset,
    outputFormatLabel: FORMAT_SPECS[resolveFormat(merged.outputFormat)].label.en,
  }
}

/**
 * 预览一次 apply：不落盘，返回 before / after / diff。
 *
 * @param {object} before - effectiveConfig 的输出。
 * @param {object} patch - 待应用的字段。
 * @returns {object} { ok, before, after, changes[], problems[] }。
 */
export function previewPatch(before, patch) {
  const validated = validatePatch(patch)
  if (!validated.ok) {
    return { ok: false, before, after: before, changes: [], problems: validated.problems }
  }
  const after = mergeLayer(before, validated.value)
  const changes = []
  for (const key of AGENT_FIELDS) {
    if (Object.hasOwn(validated.value, key) && String(before[key]) !== String(after[key])) {
      changes.push({ field: key, from: before[key], to: after[key] })
    }
  }
  return { ok: true, before, after, changes, problems: [] }
}

/** 生成 apply 用的 settings.mutate op 列表：只包含真正变化的 volatile 字段。 */
export function settingsOpsOf(before, after) {
  const ops = []
  for (const key of AGENT_FIELDS) {
    if (String(before[key]) === String(after[key])) continue
    const value = after[key]
    ops.push(value === '' ? { op: 'unset', path: [key] } : { op: 'set', path: [key], value })
  }
  return ops
}

/** 归一化 reset 的字段列表；空 = 全部恢复默认。 */
export function normalizeResetFields(fields) {
  if (fields === undefined || fields === null) return [...AGENT_FIELDS]
  if (!Array.isArray(fields)) return []
  return AGENT_FIELDS.filter((key) => fields.includes(key))
}
