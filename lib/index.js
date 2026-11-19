/** 宿主半区：将任务上下文、模型建议和交互反馈保存在插件的独立域中。 */

import { createHash, randomUUID } from 'node:crypto'
import z from '@deepseek-ai/schemastery'
import { z as zod } from 'zod'
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'
import { BlockAssembler } from '@deepseek-ai/dsh-llm'
import {
  renderPrompt, detailForMode, isAbstain,
  STYLE_PRESETS, DEFAULT_PRESET, resolvePreset, composeStyle,
  FORMAT_SPECS, DEFAULT_FORMAT, resolveFormat, formatIsMultiline, formatRule,
} from './prompt.js'
import {
  AGENT_FIELDS, FIELD_DEFAULTS, FIELD_DESCRIPTIONS, emptyOverrides, readOverrides,
  validatePatch, effectiveConfig, previewPatch, settingsOpsOf, normalizeResetFields,
} from './suggestion-config.js'
import { installAgentControl } from './agent-control.js'
import { emptyUsage, normalizeUsage, recordUsage, summarizeUsage } from './usage.js'
import {
  emptyProfile, recordObservation, describeProfile, recentAccepted, normalizeForCompare,
} from './memory.js'
import { redact, guardOutbound, outboundDecision, stillLooksSensitive, endpointOf, resolveService } from './privacy.js'
import { deriveTaskState, summarizeTaskState, isContinuation } from './task-state.js'
import { feedbackSchema, emptyFeedback, recordFeedback, summarizeFeedback, editRatio } from './feedback.js'
import { admitRequest, normalizeSessionId, rejectionResponse, resolveSession } from './access.js'

export { endpointOf } from './privacy.js'

export const name = 'input-suggest'

/**
 * 必需的宿主服务。
 *
 * storageDomain 刻意不写进 inject：它缺失时插件降级为内存存储，仍可使用，
 * 只是重启后不再记得上一条建议（总比整行 pending 导致界面没有建议好）。
 */
export const inject = ['llm', 'sessions', 'connection']

/** 设置页 / 配置表单绑定的命名空间（等于本包的 profile 行 id）。 */
export const SUGGEST_NS = 'input-suggest'

const MAX_TIMER_DELAY_MS = 2147483647

/**
 * volatile 字段会出现在设置表单里并可被写回；其余字段是部署策略，不出现在表单。
 * 只有用户真正需要改的才标 volatile。
 */
const ConfigSchema = z.object({
  /** 总开关：关掉后不再自动生成（重随与读取仍保留）。 */
  enabled: z.boolean().default(true).volatile(),
  /** 辅助模型供应商；空串表示沿用会话最近一次请求的路由。 */
  provider: z.string().default('').volatile(),
  /** 辅助模型 id；空串表示沿用会话路由。 */
  model: z.string().default('').volatile(),
  /** 推理强度；空串表示用模型自己的默认值。 */
  reasoningEffort: z.string().default('').volatile(),
  /** 自定义风格 / 额外指令，拼进系统提示词；空串表示只用内置提示词。 */
  style: z.string().default('').volatile(),
  /**
   * 风格预设 id：neutral / concise / plan / theory / code / verify。
   *
   * 预设只提供一段模型指令和一组推荐值（详细度、字符上限），最终写法仍由
   * 下面的 style 与 template 决定 —— 用户随时可以整体覆盖。
   */
  stylePreset: z.string().default('neutral').volatile(),
  /** 采纳快捷键。 */
  acceptKey: z.string().default('Tab').volatile(),
  /** 建议可见字符上限。 */
  maxSuggestionChars: z.number().step(1).min(1).default(240).volatile(),
  /** 详细度：brief | standard | detailed。空串表示沿用 legacy（按字符上限推断）。 */
  detailLevel: z.string().default('standard').volatile(),
  /** 自定义提示词模板；空串用内置模板。支持 instructions/style/memory/examples/language/detail/maxChars。 */
  template: z.string().default('').volatile(),
  /** 是否允许记忆参与提示词。关掉只影响「注入」，不清除已有画像。 */
  useMemory: z.boolean().default(true).volatile(),
  /** 是否把「最近采纳的建议」作为少样本示例。 */
  useExamples: z.boolean().default(true).volatile(),
  /** 是否持续学习（记录采纳/改写）。关闭后只读画像，不再写入。 */
  learn: z.boolean().default(true).volatile(),
  /** 是否允许发往非本机端点。默认 false：只发 loopback。 */
  allowRemote: z.boolean().default(false).volatile(),
  localPolicy: z.union([z.const('loopback-gateway'), z.const('strict-local')]).default('loopback-gateway').volatile(),
  trustedLocalProvider: z.string().default('').volatile(),
  trustedLocalModel: z.string().default('').volatile(),
  mode: z.union([z.const('predict'), z.const('next-action'), z.const('hybrid')]).default('hybrid').volatile(),
  /** 输出格式：与风格预设独立，只决定建议的形状（单行 / 结构化 / 步骤 / 研究 / 自定义）。 */
  outputFormat: z.string().default('single-line').volatile(),
  /** 自定义格式结构说明；仅在 outputFormat=custom 时生效。 */
  formatTemplate: z.string().default('').volatile(),
  /** 是否允许 Agent 在会话里直接修改智能建议的生成策略（默认开）。 */
  agentConfig: z.boolean().default(true).volatile(),
  taskAwareness: z.boolean().default(true).volatile(),
  contextLevel: z.union([z.const('recent'), z.const('task'), z.const('extended')]).default('task').volatile(),
  taskMemoryMinutes: z.number().min(0).max(120).step(1).default(30).volatile(),
  draftCompletion: z.boolean().default(false).volatile(),
  /** 辅助请求输出 token 上限。 */
  maxOutputTokens: z.number().step(1).min(1).default(512),
  /** 辅助请求超时（毫秒）。 */
  timeoutMs: z.number().step(1).min(1).max(MAX_TIMER_DELAY_MS).default(60000),
  /** 发给建议模型的最近回合数。 */
  maxRecentTurns: z.number().step(1).min(1).default(1),
  /** 转录字符预算。 */
  maxTranscriptChars: z.number().step(1).min(1).default(12000),
})

export const Config = ConfigSchema

//#region 纯函数（可单测）

/** 读一个 volatile 字段：.get() 引用与普通值都认。 */
export function readField(field, fallback) {
  if (field === undefined || field === null) return fallback
  if (typeof field.get === 'function') {
    const value = field.get()
    return value === undefined || value === null ? fallback : value
  }
  return field
}

/** 归一化配置：把 volatile 引用解成普通值并裁剪。 */
export function resolveConfig(config) {
  const text = (value) => String(value ?? '').trim()
  const number = (value, fallback, minimum) => {
    const parsed = Number(readField(value, fallback))
    return Number.isFinite(parsed) && parsed >= minimum ? Math.floor(parsed) : fallback
  }
  const choice = (value, fallback, options) => {
    const candidate = readField(value, fallback)
    return options.includes(candidate) ? candidate : fallback
  }
  return {
    enabled: readField(config.enabled, true) !== false,
    provider: text(readField(config.provider, '')),
    model: text(readField(config.model, '')),
    reasoningEffort: text(readField(config.reasoningEffort, '')),
    style: String(readField(config.style, '')).trim(),
    stylePreset: text(readField(config.stylePreset, 'neutral')) || DEFAULT_PRESET,
    acceptKey: text(readField(config.acceptKey, 'Tab')) || 'Tab',
    maxSuggestionChars: number(config.maxSuggestionChars, 240, 1),
    detailLevel: text(readField(config.detailLevel, 'standard')) || 'standard',
    template: String(readField(config.template, '')),
    useMemory: readField(config.useMemory, true) !== false,
    useExamples: readField(config.useExamples, true) !== false,
    learn: readField(config.learn, true) !== false,
    allowRemote: readField(config.allowRemote, false) === true,
    localPolicy: choice(config.localPolicy, 'loopback-gateway', ['loopback-gateway', 'strict-local']),
    trustedLocalProvider: text(readField(config.trustedLocalProvider, '')),
    trustedLocalModel: text(readField(config.trustedLocalModel, '')),
    mode: choice(config.mode, 'hybrid', ['predict', 'next-action', 'hybrid']),
    outputFormat: resolveFormat(readField(config.outputFormat, DEFAULT_FORMAT)),
    formatTemplate: text(readField(config.formatTemplate, '')),
    agentConfig: readField(config.agentConfig, true) !== false,
    taskAwareness: readField(config.taskAwareness, true) !== false,
    contextLevel: choice(config.contextLevel, 'task', ['recent', 'task', 'extended']),
    taskMemoryMinutes: Math.min(120, number(config.taskMemoryMinutes, 30, 0)),
    draftCompletion: readField(config.draftCompletion, false) === true,
    maxOutputTokens: number(config.maxOutputTokens, 512, 1),
    timeoutMs: number(config.timeoutMs, 60000, 1000),
    maxRecentTurns: number(config.maxRecentTurns, 1, 1),
    maxTranscriptChars: number(config.maxTranscriptChars, 12000, 1),
  }
}

/** 常见凭据形状，送进辅助模型前先脱敏。 */
const SECRET_PATTERNS = [
  [/\bAKIA[0-9A-Z]{16}\b/g, '<aws-access-key-id>'],
  [/\bsk-[A-Za-z0-9_-]{16,}\b/g, '<secret-token>'],
  [/\bgh[opsu]_[A-Za-z0-9]{36,}\b/g, '<github-token>'],
  [/\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g, '<slack-token>'],
  [/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, '<jwt>'],
  [/\brk_(live|test)_[A-Za-z0-9]{16,}\b/g, '<stripe-key>'],
]

export function redactSecrets(text) {
  let out = text
  for (const [pattern, label] of SECRET_PATTERNS) {
    pattern.lastIndex = 0
    out = out.replace(pattern, label)
  }
  return out
}

const ESCAPE_SEQUENCE = /\u001b(?:\[[0-9;:]*[ -/]*[@-~]|\][^\u0007]*(?:\u0007|\u001b\\)|[()][0-9A-Za-z]|#[0-9A-Za-z])/g
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u202A-\u202E\u2066-\u2069\uFFFC]/g
const FENCE_DELIMITER = /^(?:`{3,}|~{3,})[^\n]*\n?|\n?(?:`{3,}|~{3,})$/g
const QUOTED_OUTER = /^(?:.*?:\s*)?(["'\u201c\u201d\u2018\u2019])([\s\S]*?)\1$/u

function stripLoneSurrogates(text) {
  let out = ''
  for (const char of text) {
    const code = char.charCodeAt(0)
    if (code >= 0xd800 && code <= 0xdfff) continue
    out += char
  }
  return out
}

/** 把模型输出清成输入框可用的单行文本（不截断）。 */
export function cleanSuggestion(raw, format = 'single-line') {
  let value = stripLoneSurrogates(String(raw ?? '').replace(ESCAPE_SEQUENCE, '').replace(CONTROL_CHARS, ''))
  value = value.trim().replace(FENCE_DELIMITER, '').trim().replace(QUOTED_OUTER, '$2').trim()
  if (formatIsMultiline(format)) {
    return value
      .split('\n')
      .map((line) => line.replace(/[ \t\u3000]+/g, ' ').trimEnd())
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  }
  return value.replace(/\s+/g, ' ').trim()
}

/** 截断到可见字符上限（按码点；多行格式按完整行截断）。 */
export function sanitizeSuggestion(raw, maxChars, format = 'single-line') {
  const value = cleanSuggestion(raw, format)
  const chars = Array.from(value)
  if (chars.length <= maxChars) return { text: value, truncated: false }
  if (formatIsMultiline(format)) {
    const lines = value.split('\n')
    const kept = []
    let used = 0
    for (const line of lines) {
      const length = Array.from(line).length + (kept.length === 0 ? 0 : 1)
      if (used + length > maxChars) break
      kept.push(line)
      used += length
    }
    return kept.length === 0
      ? { text: chars.slice(0, maxChars).join(''), truncated: true }
      : { text: kept.join('\n'), truncated: true }
  }
  return { text: chars.slice(0, maxChars).join(''), truncated: true }
}

/** 推测模式维持单句，推进和混合模式允许一条包含步骤和验收条件的指令。 */
export function shouldFilterSuggestion(text, mode = 'predict', format = 'single-line') {
  if (text.length === 0) return true
  if (isAbstain(text) || /^(?:无建议|无需建议)[.!。]?$/u.test(text)) return true
  if (/^(thanks?|thank you|ok|okay|sure|cool|great|nice|got it|yes|no)\b[.!]?$/i.test(text)) return true
  if (/^(looks? good|sounds? good|well done|good job)\b/i.test(text)) return true
  if (/^(let me|i'll|i will|here's|here is)\b/i.test(text)) return true
  if (/^(?:谢谢|好的|收到|没问题)[！。!]?$/u.test(text) || /^(?:我来|我将|以下是)/u.test(text)) return true
  if (/[?\uFF1F]\s*$/u.test(text)) return true
  if (formatIsMultiline(format)) {
    const lines = text.split('\n').filter((line) => line.trim() !== '')
    return lines.length < 2 || lines.length > 8
  }
  const sentences = text.split(/(?<=[.!?])\s+|(?<=[。！？])\s*/u).filter(Boolean)
  return sentences.length > (mode === 'predict' ? 1 : 4)
}

/** 文本里是否含 CJK 汉字（决定建议语言）。 */
export function hasCJK(text) {
  for (const char of text) {
    const code = char.charCodeAt(0)
    if (code >= 0x4e00 && code <= 0x9fff) return true
  }
  return false
}

/** 系统提示词；style 是用户在设置页写的风格/偏好。 */
export function buildSystemPrompt(maxSuggestionChars, language, style = '') {
  const lines = [
    "You are a prompt suggestion generator. Your ONLY purpose is to predict the user's next prompt in a coding-assistant chat - never to generate content.",
    '',
    'Your job:',
    "1. Read the user's most recent message and the assistant's final answer.",
    '2. Predict what the USER would naturally type next - not what the assistant should do.',
    '',
    'CRITICAL CONSTRAINTS:',
    '- You are NOT a code generator, writer, or task executor.',
    '- You MUST respond with ONLY the suggestion text, on a single line.',
    '- NEVER generate, implement, code, or produce any content.',
    '- NEVER provide explanations, reasoning, or extra text.',
    '- NEVER use quotes, labels, Markdown, XML, or formatting.',
    '- Be specific when you can - name files, functions, or actions.',
    '- If the next step is not obvious, reply with nothing at all.',
    '',
    'THE TEST: would the user think "I was just about to type that"?',
    '',
    'NEVER SUGGEST:',
    '- Evaluative feedback ("looks good", "thanks")',
    '- Questions ("what about...?")',
    "- Assistant-voice phrasing (\"Let me...\", \"I'll...\", \"Here's...\")",
    '- New ideas the user did not ask about',
    '- Multiple sentences',
    '',
    'Reply with ONLY the suggestion, 3-12 words, no quotes or explanation. If the next step is not obvious, reply with nothing.',
  ]
  if (style.length > 0) {
    lines.push('', 'USER STYLE / PREFERENCES (follow these when predicting the next prompt):', style)
  }
  lines.push('', 'Language: ' + language, 'At most ' + maxSuggestionChars + ' visible characters.')
  return lines.join('\n')
}

/** 把用户/助手文本拼成带标签的上下文块。 */
export function frameTranscript(pairs) {
  const blocks = []
  for (const pair of pairs) {
    blocks.push((pair.role === 'user' ? '[User Message]' : '[Assistant Response]') + '\n' + pair.text)
  }
  return blocks.join('\n\n')
}

/** 从一个 content 块数组里取纯文本。 */
export function textOfContent(content) {
  if (!Array.isArray(content)) return ''
  let out = ''
  for (const block of content) {
    if (block !== null && typeof block === 'object' && block.type === 'text' && typeof block.text === 'string') out += block.text
  }
  return out
}

/**
 * 从会话派生历史里取最近若干轮的 user/assistant 文本。
 *
 * 只认 source.kind === 'user' 的用户消息：工作区指令、运行时快照、技能目录
 * 也都是 user 消息，但它们不是用户自己打的字。
 */
export function buildPairs(messages, maxRecentTurns, maxTranscriptChars) {
  const pairs = []
  let userTurns = 0
  let remaining = maxTranscriptChars
  for (let index = messages.length - 1; index >= 0 && remaining > 24; index -= 1) {
    const message = messages[index]
    if (message === null || typeof message !== 'object') continue
    const { role } = message
    if (role !== 'assistant' && (role !== 'user' || message.source?.kind !== 'user')) continue
    const text = redact(textOfContent(message.content)).trim()
    if (text.length === 0) continue
    const limit = remaining - 24
    if (text.length > limit) {
      if (pairs.length === 0) pairs.push({ role, text: stripLoneSurrogates(role === 'assistant' ? text.slice(-limit) : text.slice(0, limit)) })
      break
    }
    pairs.unshift({ role, text })
    remaining -= text.length + 24
    if (role === 'user' && ++userTurns >= maxRecentTurns) break
  }
  return pairs
}

/** 建议语言：跟随用户最近一条输入。 */
export function suggestionLanguage(pairs) {
  for (let index = pairs.length - 1; index >= 0; index -= 1) {
    if (pairs[index].role !== 'user') continue
    return hasCJK(pairs[index].text) ? '\u7b80\u4f53\u4e2d\u6587' : 'English'
  }
  return 'English'
}

/** 解析完整路由：显式配置优先，缺的一项回落到会话路由。 */
export function routeOf(requestHeader, config) {
  const logged = requestHeader?.config ?? {}
  const provider = config.provider || logged.provider || ''
  const model = config.model || logged.model || ''
  if (provider === '' || model === '') return undefined
  return { provider, model }
}

//#endregion

//#region 存储

/** 本插件 storage domain 的名字。 */
export const SUGGEST_DOMAIN_NAME = 'input_suggest'

/** 一条建议的持久化形状（durable contract，单独于投影值）。 */
const StoredSuggestion = zod.object({
  version: zod.literal(1),
  id: zod.string().min(1).optional(),
  fingerprint: zod.string().min(1).optional(),
  turn: zod.number().int().nonnegative(),
  text: zod.string().min(1),
  truncated: zod.boolean(),
  acceptKey: zod.string().min(1),
  route: zod.object({ provider: zod.string().min(1), model: zod.string().min(1) }).optional(),
  style: zod.string().optional(),
  preset: zod.string().optional(),
  detailLevel: zod.string().optional(),
})

/** 本地画像的持久化形状：只含聚合量，不含对话正文。 */
const StoredProfile = zod.object({
  version: zod.literal(1),
  createdAt: zod.number().nonnegative(),
  updatedAt: zod.number().nonnegative(),
  observations: zod.number().int().nonnegative(),
  accepted: zod.number().int().nonnegative(),
  rejected: zod.number().int().nonnegative(),
  avgChars: zod.number().nonnegative(),
  language: zod.string(),
  leadingWords: zod.array(zod.string()),
  acceptedSamples: zod.array(zod.string()),
  rejectedSamples: zod.array(zod.string()),
})

/**
 * 建议域：一张以 session id 为键的 sessions 表，每条记录是该会话最新的建议
 * （whole-value，整体替换）。
 *
 * invalidRecords: 'backup-and-skip' —— 记录是可丢弃的派生数据，绝不能因为它
 * 而让插件启动失败。
 */
/** token 账本的持久化形状。只含计量字段。 */
const StoredUsage = zod.object({
  version: zod.literal(1),
  createdAt: zod.number().nonnegative(),
  updatedAt: zod.number().nonnegative(),
  calls: zod.number().int().nonnegative(),
  failures: zod.number().int().nonnegative(),
  inputTokens: zod.number().nonnegative(),
  outputTokens: zod.number().nonnegative(),
  cacheReadTokens: zod.number().nonnegative(),
  cacheWriteTokens: zod.number().nonnegative(),
  reasoningTokens: zod.number().nonnegative(),
  totalTokens: zod.number().nonnegative(),
  routes: zod.array(zod.object({
    key: zod.string(),
    calls: zod.number().int().nonnegative(),
    failures: zod.number().int().nonnegative(),
    inputTokens: zod.number().nonnegative(),
    outputTokens: zod.number().nonnegative(),
    totalTokens: zod.number().nonnegative(),
  })),
  recent: zod.array(zod.object({
    at: zod.number().nonnegative(),
    key: zod.string(),
    kind: zod.string(),
    outcome: zod.string(),
    inputTokens: zod.number().nonnegative(),
    outputTokens: zod.number().nonnegative(),
    totalTokens: zod.number().nonnegative(),
  })),
})

export const suggestDomainSpec = defineDomain({
  name: SUGGEST_DOMAIN_NAME,
  version: 1,
  layout: 'per-record',
  invalidRecords: 'backup-and-skip',
  tables: {
    sessions: domainTable(StoredSuggestion),
    profiles: domainTable(StoredProfile),
    usage: domainTable(StoredUsage),
    feedback: domainTable(feedbackSchema),
    agent_overrides: domainTable(zod.object({
      version: zod.literal(1),
      sessionId: zod.string(),
      updatedAt: zod.number().nonnegative(),
      fields: zod.record(zod.string(), zod.union([
        zod.string(), zod.number(), zod.boolean(),
      ])),
    })),
  },
})

/** 把建议投影成持久化记录。 */
export function toStoredRecord(suggestion) {
  return {
    version: 1,
    turn: suggestion.turn,
    text: suggestion.text,
    truncated: suggestion.truncated,
    acceptKey: suggestion.acceptKey,
    ...(suggestion.id !== undefined ? { id: suggestion.id } : {}),
    ...(suggestion.fingerprint !== undefined ? { fingerprint: suggestion.fingerprint } : {}),
    ...(suggestion.route !== undefined ? { route: suggestion.route } : {}),
    ...(suggestion.style !== undefined ? { style: suggestion.style } : {}),
    ...(suggestion.preset !== undefined ? { preset: suggestion.preset } : {}),
    ...(suggestion.detailLevel !== undefined ? { detailLevel: suggestion.detailLevel } : {}),
  }
}

/** 把读回的记录投影成建议；形状不对就当作没有。 */
export function toSuggestion(record) {
  const parsed = StoredSuggestion.safeParse(record)
  if (!parsed.success) return undefined
  const { version, ...suggestion } = parsed.data
  return suggestion
}

//#endregion

/** 终止原因转成辅助调用失败。 */
function finishError(finish) {
  switch (finish.kind) {
    case 'stop':
      return undefined
    case 'error':
    case 'aborted': {
      const error = new Error('input-suggest: suggestion call ended with ' + finish.kind + ' ' + (finish.failure?.code ?? 'UNKNOWN'))
      error.code = finish.failure?.code
      return error
    }
    case 'max-tokens':
      return new Error('input-suggest: suggestion output reached maxOutputTokens')
    case 'tool-calls':
      return new Error('input-suggest: suggestion model unexpectedly requested a tool')
    default:
      return new Error('input-suggest: unsupported finish reason "' + String(finish.kind) + '"')
  }
}

const BUDGET_WINDOW_MS = 60_000
const FEEDBACK_GRACE_MS = 5_000
const ACCEPTANCE_TTL_MS = 30 * 60_000
const RECENT_FEEDBACK_LIMIT = 8

function rememberBounded(records, key, record) {
  records.set(key, record)
  if (records.size > RECENT_FEEDBACK_LIMIT) records.delete(records.keys().next().value)
}

function requestBudget(limit) {
  const used = []
  return () => {
    const now = Date.now()
    while (used.length > 0 && now - used[0] >= BUDGET_WINDOW_MS) used.shift()
    if (used.length >= limit) return false
    used.push(now)
    return true
  }
}

function fingerprint(parts) {
  return createHash('sha256').update(JSON.stringify(parts)).digest('hex')
}

function isUserCancellation(reason) {
  return reason?.kind === 'aborted' && reason.reason?.kind === 'user'
}

function prepareContext(session, resolved, taskMemory, reason, draft) {
  const messages = session.deriveMessages()
  const budget = resolved.maxTranscriptChars
  const level = resolved.contextLevel
  const recent = buildPairs(messages, 1, budget)
  const local = resolved.taskAwareness && level !== 'recent'
    ? buildPairs(messages, 2, Math.min(Math.max(budget, 4000), 12_000))
    : recent.slice()
  if (!local.some((pair) => pair.role === 'user')) {
    const user = messages.findLast((message) => message?.role === 'user' && message.source?.kind === 'user')
    const text = redact(textOfContent(user?.content)).trim().slice(0, 800)
    if (text) local.unshift({ role: 'user', text })
  }
  const lastUserIndex = local.findLastIndex((pair) => pair.role === 'user')
  const latestUser = local[lastUserIndex]?.text ?? ''
  const continuing = isContinuation(latestUser)
  let task
  if (resolved.taskAwareness && local.length > 0) {
    task = deriveTaskState(local, reason)
    if (continuing) {
      const goal = taskMemory?.goal || deriveTaskState(local.slice(0, lastUserIndex)).goal
      task = { ...task, goal }
    }
  }
  const sections = []
  if (reason && reason !== 'completed') sections.push('[Turn Outcome]\n' + reason)
  if (task !== undefined && level !== 'recent') {
    const summary = summarizeTaskState(task)
    if (summary) sections.push('[Task State]\n' + summary)
  }
  const context = redact(sections.join('\n\n'))
  const reserved = context.length > 0 && context.length <= budget / 3 ? context.length + 2 : 0
  const transcript = frameTranscript(reserved === 0 ? recent : buildPairs(messages, 1, budget - reserved))
  const framed = [transcript, reserved === 0 ? '' : context].filter(Boolean)
  if (typeof draft === 'string' && draft.trim() !== '') {
    framed.push('[Draft Prompt To Refine]\n' + redact(draft.trim().slice(0, 4000)))
  }
  if (level === 'extended' && (continuing || task?.pending || task?.phase === 'BLOCKED')) {
    const history = buildPairs(messages, Math.max(3, Math.min(resolved.maxRecentTurns, 5)), Math.min(budget, 12_000))
      .filter((pair) => pair.role === 'user').slice(0, -1)
    if (history.length > 0) {
      const extension = '[Earlier User Requests]\n' + history.map((pair) => '- ' + pair.text.slice(0, 240)).join('\n')
      if (framed.join('\n\n').length + 2 + extension.length <= budget) framed.push(extension)
    }
  }
  return {
    framed: framed.join('\n\n'),
    // 无转录（新会话）时草稿优化模式仍可行：草稿块本身就是上下文。
    hasTranscript: transcript !== '' || (typeof draft === 'string' && draft.trim() !== ''),
    voice: suggestionLanguage(local),
    task, continuing,
  }
}

function publicSuggestion(offer) {
  if (offer === undefined) return null
  const { fingerprint, ...suggestion } = offer.suggestion
  return suggestion
}

/** 挂载宿主服务、回合监听和浏览器路由。 */
export function apply(ctx, config) {
  const states = new WeakMap()
  const controllers = new Set()
  const taskTimers = new Map()
  const sessionWrites = new Map()
  const automaticBudget = requestBudget(12)
  const manualBudget = requestBudget(10)
  let disposed = false
  let domainPromise

  const stateOf = (session) => {
    let state = states.get(session)
    if (state === undefined) {
      state = {
        turn: 0, boundary: -1, running: false, manualBudget: requestBudget(4),
        accepted: new Map(), recentUsers: new Map(),
      }
      states.set(session, state)
    }
    return state
  }

  const domain = () => {
    if (domainPromise === undefined) {
      domainPromise = Promise.resolve().then(() => {
        const storage = typeof ctx.get === 'function' ? ctx.get('storageDomain') : ctx.storageDomain
        return storage?.open(suggestDomainSpec)
      }).catch(() => undefined)
    }
    return domainPromise
  }

  const readStored = async (table, key) => {
    try {
      return (await domain())?.table(table).get(key)
    } catch {
      return undefined
    }
  }

  // 同键写入按提交顺序完成；一个会话关闭并重新打开时也保持顺序。
  const persistSuggestion = (id, suggestion) => {
    const write = (sessionWrites.get(id) ?? Promise.resolve()).then(async () => {
      const table = (await domain())?.table('sessions')
      if (table === undefined) return
      if (suggestion === undefined) await table.delete(id)
      else await table.put(id, toStoredRecord(suggestion))
    }).catch(() => {})
    sessionWrites.set(id, write)
    void write.then(() => {
      if (sessionWrites.get(id) === write) sessionWrites.delete(id)
    })
    return write
  }

  const localLedger = (table, empty) => {
    let cached
    let chain = Promise.resolve()
    const read = async () => {
      if (cached === undefined) {
        const stored = await readStored(table, 'local')
        cached ??= stored ?? empty()
      }
      return cached
    }
    const update = (change) => {
      chain = chain.then(async () => {
        cached = change(await read())
        await (await domain())?.table(table).put('local', cached)
      }).catch(() => {})
      return chain
    }
    return { read, update }
  }

  const profile = localLedger('profiles', emptyProfile)
  const usage = localLedger('usage', emptyUsage)
  const feedback = localLedger('feedback', emptyFeedback)

  //#region Agent 自然语言配置（P1）

  /**
   * 会话级 override：内存优先、存储域兜底。
   * 键 = sessionId；值 = { fields: { 仅白名单字段 } }。
   * 内存表与存储表同步写；读取时内存优先，插件重启后从存储域恢复。
   */
  const agentOverrideMemory = new Map()
  let agentOverrideChain = Promise.resolve()

  const readAgentOverride = async (sessionId) => {
    const cached = agentOverrideMemory.get(sessionId)
    if (cached !== undefined) return cached
    const stored = await readStored('agent_overrides', sessionId)
    const overrides = readOverrides(stored)
    agentOverrideMemory.set(sessionId, overrides)
    return overrides
  }

  const writeAgentOverride = (sessionId, overrides) => {
    agentOverrideMemory.set(sessionId, overrides)
    agentOverrideChain = agentOverrideChain.then(async () => {
      const table = (await domain())?.table('agent_overrides')
      if (table === undefined) return
      const hasFields = Object.keys(overrides.fields).length > 0
      if (hasFields) {
        await table.put(sessionId, { version: 1, sessionId, updatedAt: Date.now(), fields: overrides.fields })
      } else {
        await table.delete(sessionId)
      }
    }).catch(() => {})
    return agentOverrideChain
  }

  /** 最近一次有效 profile 配置快照（restore 用；每次成功 settings.mutate 后更新）。 */
  let lastGoodConfig
  const rememberGoodConfig = () => {
    lastGoodConfig = {}
    for (const key of AGENT_FIELDS) lastGoodConfig[key] = resolveConfig(config)[key]
  }
  rememberGoodConfig()

  /**
   * 把一次补丁写入 profile 持久层（settings.mutate）。
   * 走宿主 settings 服务的原子写通道，而不是直接改配置对象 ——
   * 这样设置页会同步显示最新值，DSH 原生的冲突检测（revision）也生效。
   */
  const persistProfilePatch = async (patch) => {
    const before = effectiveConfig(resolveConfig(config), undefined)
    const preview = previewPatch(before, patch)
    if (!preview.ok) return preview
    const ops = settingsOpsOf(preview.before, preview.after)
    if (ops.length === 0) return { ...preview, changes: [] }
    const settings = resolveService(ctx, 'settings')
    if (settings === undefined || typeof settings.mutate !== 'function') {
      const unavailable = { ...preview, ok: false, problems: ['settings service unavailable; cannot persist profile changes'] }
      return unavailable
    }
    try {
      await settings.mutate(SUGGEST_NS, ops)
      rememberGoodConfig()
      return preview
    } catch (error) {
      return { ...preview, ok: false, problems: ['settings.mutate failed: ' + (error instanceof Error ? error.message : String(error))] }
    }
  }

  /** Agent 工具的操作分发（inspect / list-presets / preview / apply / reset / restore / inspect-effective）。 */
  const agentConfigAction = async (action, args) => {
    const resolved = resolveConfig(config)
    if (resolved.agentConfig !== true) {
      return { ok: false, problems: ['agent configuration is disabled (agentConfig=false)'] }
    }
    if (action === 'inspect') {
      return { ok: true, scope: 'profile', config: effectiveConfig(resolved, undefined), fields: FIELD_DESCRIPTIONS }
    }
    if (action === 'list-presets') {
      return {
        ok: true,
        presets: Object.values(STYLE_PRESETS).map((preset) => ({
          id: preset.id, label: preset.label, description: preset.description,
          detailLevel: preset.detailLevel, maxChars: preset.maxChars,
        })),
        formats: Object.values(FORMAT_SPECS).map((format) => ({
          id: format.id, label: format.label, multiline: format.multiline === true,
        })),
        defaults: FIELD_DEFAULTS,
      }
    }
    if (action === 'preview') {
      const before = effectiveConfig(resolved, undefined)
      const preview = previewPatch(before, args.patch ?? {})
      return { ...preview, scope: 'profile' }
    }
    if (action === 'apply') {
      const scope = args.scope === 'session' ? 'session' : 'profile'
      if (scope === 'session') {
        if (typeof args.sessionId !== 'string' || args.sessionId === '') {
          return { ok: false, problems: ['scope=session requires sessionId'] }
        }
        const before = effectiveConfig(resolved, await readAgentOverride(args.sessionId))
        const preview = previewPatch(before, args.patch ?? {})
        if (!preview.ok) return { ...preview, scope }
        if (preview.changes.length === 0) return { ...preview, scope }
        const current = await readAgentOverride(args.sessionId)
        const merged = { version: 1, fields: { ...current.fields } }
        for (const key of AGENT_FIELDS) {
          if (Object.hasOwn(args.patch ?? {}, key)) merged.fields[key] = preview.after[key]
        }
        await writeAgentOverride(args.sessionId, merged)
        return { ok: true, scope: 'session', sessionId: args.sessionId, changes: preview.changes, after: preview.after }
      }
      const result = await persistProfilePatch(args.patch ?? {})
      return { ...result, scope: 'profile' }
    }
    if (action === 'reset') {
      const scope = args.scope === 'session' ? 'session' : 'profile'
      const fields = normalizeResetFields(args.fields)
      if (fields.length === 0) return { ok: false, problems: ['no resettable fields given; valid: ' + AGENT_FIELDS.join(', ')] }
      if (scope === 'session') {
        if (typeof args.sessionId !== 'string' || args.sessionId === '') {
          return { ok: false, problems: ['scope=session requires sessionId'] }
        }
        const current = await readAgentOverride(args.sessionId)
        const next = { version: 1, fields: { ...current.fields } }
        for (const key of fields) delete next.fields[key]
        await writeAgentOverride(args.sessionId, next)
        return { ok: true, scope: 'session', sessionId: args.sessionId, reset: fields }
      }
      const patch = {}
      for (const key of fields) patch[key] = FIELD_DEFAULTS[key]
      const result = await persistProfilePatch(patch)
      return { ...result, scope: 'profile', reset: fields }
    }
    if (action === 'restore') {
      if (lastGoodConfig === undefined) {
        return { ok: false, problems: ['no previous valid configuration recorded in this plugin lifetime'] }
      }
      const current = effectiveConfig(resolveConfig(config), undefined)
      const patch = {}
      for (const key of AGENT_FIELDS) {
        if (String(current[key]) !== String(lastGoodConfig[key])) patch[key] = lastGoodConfig[key]
      }
      if (Object.keys(patch).length === 0) return { ok: true, scope: 'profile', changes: [], note: 'already at the last valid configuration' }
      const result = await persistProfilePatch(patch)
      return { ...result, scope: 'profile' }
    }
    if (action === 'inspect-effective') {
      const sessionId = typeof args.sessionId === 'string' && args.sessionId !== '' ? args.sessionId : undefined
      const overrides = sessionId === undefined ? undefined : await readAgentOverride(sessionId)
      return {
        ok: true,
        scope: sessionId === undefined ? 'profile' : 'session',
        ...(sessionId !== undefined ? { sessionId } : {}),
        config: effectiveConfig(resolved, overrides),
      }
    }
    return { ok: false, problems: ['unknown action "' + String(action) + '"; expected inspect | list-presets | preview | apply | reset | restore | inspect-effective'] }
  }

  //#endregion
  const learn = () => readField(config.learn, true) !== false
  const note = (...entries) => {
    if (!learn() || entries.length === 0) return Promise.resolve()
    const now = Date.now()
    return feedback.update((previous) => entries.reduce((ledger, entry) => recordFeedback(ledger, { ...entry, now }), previous))
  }

  const learnFrom = (offer, finalText, rejected) => {
    if (!learn()) return Promise.resolve()
    const suggestion = redact(offer.suggestion.text)
    const final = redact(finalText)
    if (stillLooksSensitive(suggestion) || stillLooksSensitive(final)) return Promise.resolve()
    return profile.update((previous) => recordObservation(previous, {
      suggestion, finalText: final, rejected, accepted: !rejected, now: Date.now(),
    }))
  }

  const retainTask = (state, context, resolved) => {
    if (resolved.taskMemoryMinutes === 0 || resolved.contextLevel === 'recent' ||
        !resolved.taskAwareness || context.task?.phase === 'COMPLETED') {
      clearTimeout(taskTimers.get(state))
      taskTimers.delete(state)
      state.taskMemory = undefined
      return
    }
    if (context.continuing && state.taskMemory !== undefined) return
    const goal = context.task?.goal
    if (!goal || state.taskMemory?.boundary === state.boundary) return
    clearTimeout(taskTimers.get(state))
    state.taskMemory = { goal, boundary: state.boundary }
    const timer = setTimeout(() => {
      taskTimers.delete(state)
      state.taskMemory = undefined
    }, resolved.taskMemoryMinutes * 60_000)
    timer.unref?.()
    taskTimers.set(state, timer)
  }

  const hydrateTurn = (session, state) => {
    if (state.hydrated) return
    state.hydrated = true
    // 已有会话在插件挂载前的回合不会发出事件，沿用安装版的历史快照入口回填一次。
    const events = session.snapshotEvents?.() ?? []
    for (let index = events.length - 1; index >= 0; index -= 1) {
      const event = events[index]
      if (event.type !== 'turn/start' && event.type !== 'turn/end') continue
      state.turn = event.data.turn
      state.boundary = event.seq
      state.running = event.type === 'turn/start'
      state.reason = event.data.reason?.kind
      state.userCancelled = isUserCancellation(event.data.reason)
      break
    }
  }

  const hide = (session, state) => {
    if (state.offer !== undefined) {
      state.offer.hiddenAt = Date.now()
      state.lastOffer = state.offer
    }
    const clear = state.offer !== undefined || !state.readStorage
    state.offer = undefined
    state.readStorage = true
    return clear ? persistSuggestion(session.id) : Promise.resolve()
  }

  const invalidate = (session, state) => {
    state.pending?.controller.abort()
    state.pending = undefined
    void hide(session, state)
  }

  const scopeOf = (session, state) => {
    hydrateTurn(session, state)
    const resolved = resolveConfig(config)
    if (!resolved.taskAwareness || resolved.taskMemoryMinutes === 0 || resolved.contextLevel === 'recent') {
      clearTimeout(taskTimers.get(state))
      taskTimers.delete(state)
      state.taskMemory = undefined
    }
    const logged = session.requestContext?.()
    const header = logged === undefined ? session.requestHeader?.() : { config: logged }
    const route = routeOf(header, resolved)
    const key = fingerprint([session.id, state.boundary, state.turn, state.reason, route, resolved])
    if (state.scopeKey !== undefined && state.scopeKey !== key) invalidate(session, state)
    state.scopeKey = key
    return { key, route, resolved }
  }

  const contextFingerprint = (scope, context) => fingerprint([scope.key, context.framed, context.task?.phase])

  const restore = async (session, state, scope) => {
    if (state.readStorage) return
    await sessionWrites.get(session.id)
    const stored = toSuggestion(await readStored('sessions', session.id))
    if (disposed || state.readStorage || state.scopeKey !== scope.key || states.get(session) !== state) return
    state.readStorage = true
    if (stored?.id === undefined || stored.turn !== state.turn) return
    const context = prepareContext(session, scope.resolved, state.taskMemory, state.reason)
    if (stored.fingerprint !== contextFingerprint(scope, context)) return
    state.offer = { suggestion: stored, boundary: state.boundary }
    state.lastText = stored.text
    state.lastAutoFingerprint = stored.fingerprint
    retainTask(state, context, scope.resolved)
  }

  const settleSend = (state, offer, receipt, text) => {
    if (!text || offer.sent || receipt.settled || !offer.acceptedAt) return
    if (Date.now() - offer.acceptedAt > ACCEPTANCE_TTL_MS) return
    receipt.settled = true
    offer.sent = true
    state.accepted.delete(offer.suggestion.id)
    if (!offer.measured) return
    const ratio = editRatio(offer.suggestion.text, text)
    const events = [{ event: 'sent', editRatio: ratio }]
    if (ratio > 0 && !offer.edited) {
      offer.edited = true
      events.push({ event: 'edited' })
    }
    void note(...events)
    void learnFrom(offer, text.slice(0, 4000), false)
  }

  const candidateOf = (state, id) => {
    if (state.offer?.suggestion.id === id) return state.offer
    const accepted = state.accepted.get(id)
    if (accepted !== undefined && Date.now() - accepted.acceptedAt <= ACCEPTANCE_TTL_MS) return accepted
    const last = state.lastOffer
    return last?.suggestion.id === id && Date.now() - last.hiddenAt <= FEEDBACK_GRACE_MS ? last : undefined
  }

  const settleLateSend = (session, state, offer) => {
    if (!offer.acceptedAt || !offer.requestId || offer.closed) return
    const receipt = state.recentUsers.get(offer.requestId)
    if (receipt === undefined || receipt.seq <= offer.boundary) return
    const message = session.deriveMessages().findLast((message) =>
      message.id === receipt.id && message.role === 'user' && message.source?.rpcId === offer.requestId)
    settleSend(state, offer, receipt, textOfContent(message?.content).trim())
  }

  const onFeedback = (session, state, offer, { event, requestId }) => {
    if (event === 'shown') {
      if (offer.shownMeasured || !learn()) return
      offer.shownMeasured = true
      return note({ event })
    }
    if (event === 'accepted') {
      if (offer.acceptedAt || offer.closed) return
      offer.acceptedAt = Date.now()
      offer.measured = learn()
      rememberBounded(state.accepted, offer.suggestion.id, offer)
      if (state.offer === offer) void hide(session, state)
      const entries = []
      if (offer.measured) {
        if (!offer.shownMeasured) entries.push({ event: 'shown' })
        offer.shownMeasured = true
        entries.push({ event })
      }
      const written = note(...entries)
      settleLateSend(session, state, offer)
      return written
    }
    if (event === 'submitted' && !offer.closed && offer.requestId === undefined &&
        typeof requestId === 'string' && requestId.length > 0 && requestId.length <= 128) {
      // rc.2 的 PendingSubmission.requestId 由宿主原样回写到真人消息的 source.rpcId。
      offer.requestId = requestId
      settleLateSend(session, state, offer)
    }
    if (event === 'edited' && offer.acceptedAt && !offer.closed && offer.measured && !offer.edited && learn()) {
      offer.edited = true
      return note({ event })
    }
    if (event === 'abandoned' && !offer.requestId) {
      state.accepted.delete(offer.suggestion.id)
      offer.closed = true
    }
    if (event === 'dismissed' && state.offer === offer && !offer.acceptedAt) {
      offer.closed = true
      void hide(session, state)
      return Promise.all([note({ event }), learnFrom(offer, '', true)])
    }
  }

  const sameText = (left, right) => right !== '' && normalizeForCompare(left) === normalizeForCompare(right)

  const modelCall = async (session, scope, system, context, controller, trigger, takeBudget, avoid) => {
    controller.signal.throwIfAborted()
    const { resolved, route } = scope
    const effective = scope.effective ?? resolved
    const endpoint = endpointOf(ctx, route.provider)
    if (endpoint !== scope.endpoint || outboundDecision({ ...resolved, endpoint, route }) !== 'allowed') return { status: 'skipped' }
    if (!takeBudget()) return { status: 'limited' }
    const timeout = setTimeout(() => controller.abort(new Error('input-suggest: suggestion timed out')), resolved.timeoutMs)
    const assembler = new BlockAssembler()
    const startedAt = Date.now()
    let outcome = 'error'
    let candidateFeedback
    try {
      const stream = ctx.llm.stream({
        provider: route.provider,
        model: route.model,
        system,
        messages: [{ role: 'user', content: [{ type: 'text', text: context.framed }] }],
        maxTokens: resolved.maxOutputTokens,
        ...(resolved.reasoningEffort !== '' ? { reasoningEffort: resolved.reasoningEffort } : {}),
        sessionId: session.id,
        signal: controller.signal,
      })
      for await (const chunk of stream) {
        assembler.push(chunk)
        controller.signal.throwIfAborted()
      }
      controller.signal.throwIfAborted()
      const terminal = finishError(assembler.finish)
      if (terminal !== undefined) throw terminal
      const blocks = assembler.blocks()
      if (blocks.some((block) => block.type === 'tool-call')) throw new Error('unexpected suggestion tool call')
      const cleaned = cleanSuggestion(blocks.filter((block) => block.type === 'text').map((block) => block.text).join(' '), effective.outputFormat)
      const safe = redact(cleaned)
      if (shouldFilterSuggestion(safe, effective.mode, effective.outputFormat) || stillLooksSensitive(safe)) {
        outcome = 'empty'
        return { status: 'empty' }
      }
      const detail = detailForMode(effective.mode, effective.detailLevel)
      // 多行格式的字符上限放宽：结构化文本需要目标/步骤/验收多行空间。
      const formatBudget = formatIsMultiline(effective.outputFormat) ? 800 : detail.maxChars
      const candidate = sanitizeSuggestion(safe, Math.min(effective.maxSuggestionChars, formatBudget), effective.outputFormat)
      const duplicate = sameText(candidate.text, avoid)
      outcome = duplicate ? 'empty' : 'ok'
      candidateFeedback = { event: 'candidate', duplicate, responseMs: Date.now() - startedAt }
      if (duplicate) return { status: 'duplicate' }
      return {
        status: 'generated',
        suggestion: {
          ...candidate,
          acceptKey: resolved.acceptKey,
          route,
          detailLevel: detail.label,
          preset: resolvePreset(resolved.stylePreset).id,
          ...(resolved.style !== '' ? { style: resolved.style } : {}),
        },
      }
    } finally {
      clearTimeout(timeout)
      const tokens = normalizeUsage(assembler.usage)
      const metering = { event: 'model-call', tokens: tokens.totalTokens }
      await Promise.all([
        usage.update((previous) => recordUsage(previous, { route, tokens, outcome, kind: trigger, now: Date.now() })),
        candidateFeedback === undefined ? note(metering) : note(metering, candidateFeedback),
      ])
    }
  }

  const schedule = async (session, state, trigger, suggestionId, draft) => {
    const manual = trigger === 'manual'
    if (disposed || session.header?.origin === 'subagent') return { status: 'skipped' }
    const scope = scopeOf(session, state)
    const { route, resolved } = scope
    if (!manual && (!resolved.enabled || state.userCancelled || state.reason === 'forked')) return { status: 'skipped' }
    if (state.running || state.pending !== undefined) return { status: 'busy' }
    // 回合门槛只挡「从会话历史预测下一句」；草稿优化模式自带上下文（草稿本身），
    // 新对话里手动优化一段输入不依赖任何已完成的回合。
    const draftCarried = typeof draft === 'string' && draft.trim() !== ''
    if (state.turn < 1 && !draftCarried) return { status: 'no-context' }
    if (!manual && state.offer !== undefined) return { status: 'skipped' }
    if (route === undefined) return { status: 'skipped' }

    const controller = new AbortController()
    const boundary = state.boundary
    state.pending = { controller }
    controllers.add(controller)
    const owns = () => !disposed && state.pending?.controller === controller && !controller.signal.aborted && states.get(session) === state
    try {
      await restore(session, state, scope)
      if (!owns()) return { status: 'busy' }
      if (!manual && state.offer !== undefined) return { status: 'skipped' }
      // draft 模式是「优化输入中的草稿」：与当前显示的灰字建议无关，不校验 suggestionId。
      if (suggestionId !== undefined && state.offer?.suggestion.id !== suggestionId) return { status: 'skipped' }

      const context = prepareContext(session, resolved, state.taskMemory, state.reason, draft)
      const contextId = contextFingerprint(scope, context)
      if (!manual && state.lastAutoFingerprint === contextId) return { status: 'skipped' }
      retainTask(state, context, resolved)
      const draftPresent = typeof draft === 'string' && draft.trim() !== ''
      // 完成态静默只约束自动建议：用户点按钮/快捷键明确要一条时，必须真的去问模型，
      // 由模型给出收尾建议，而不是被本地规则吞掉。
      if (!context.hasTranscript || stillLooksSensitive(context.framed) ||
          !manual && context.task?.phase === 'COMPLETED' && !context.task.pending) {
        if (!manual) state.lastAutoFingerprint = contextId
        return { status: 'skipped' }
      }
      const endpoint = endpointOf(ctx, route.provider)
      if (outboundDecision({ ...resolved, endpoint, route }) !== 'allowed') return { status: 'skipped' }
      // 会话级 Agent 覆盖：只影响本会话的生成参数，不写回 profile。
      const sessionOverrides = await readAgentOverride(session.id)
      const effective = effectiveConfig(resolved, sessionOverrides)
      const approvedScope = { ...scope, endpoint, effective }

      const avoid = draftPresent ? '' : (state.offer?.suggestion.text ?? state.lastText ?? '')
      const learned = resolved.useMemory || resolved.useExamples ? await profile.read() : undefined
      if (!owns()) return { status: 'busy' }
      const system = renderPrompt({
        template: effective.template,
        style: composeStyle(effective.stylePreset, effective.style),
        memory: resolved.useMemory ? describeProfile(learned) : '',
        examples: resolved.useExamples ? recentAccepted(learned, 5).map((sample) => '- ' + sample).join('\n') : '',
        language: context.voice,
        detailLevel: effective.detailLevel,
        maxChars: Math.min(effective.maxSuggestionChars, detailForMode(effective.mode, effective.detailLevel).maxChars),
        mode: effective.mode,
        taskAware: resolved.taskAwareness,
        outputFormat: effective.outputFormat,
        formatTemplate: effective.formatTemplate,
      })
      const refine = draftPresent
        ? '\n\nREFINE MODE: The [Draft Prompt To Refine] block above is the partial prompt the user is typing right now. Rewrite it into the ONE complete, concrete, well-formed prompt the user would most likely send. Preserve the user language, their intent, and any concrete target (file, symbol, requirement) they already named. You may reorganize, add the missing specifics from the conversation, and fix ambiguities - but do NOT answer the prompt, do NOT change what it asks for, and do NOT add unrelated goals. Reply with only the refined prompt.'
        : ''
      const explicitRequest = manual && !draftPresent
        ? '\n\nThe user EXPLICITLY requested a suggestion right now. Even if the task looks complete, propose ONE sensible closing, verification, or follow-up step grounded in the conversation instead of abstaining.'
        : ''
      const outgoing = (retry) => guardOutbound(system + refine + explicitRequest + (avoid === '' ? '' :
        '\n\nALREADY SUGGESTED (avoid repeating or lightly rewording this):\n' + avoid +
        (retry ? '\nPick a DIFFERENT next step grounded in the current task.' : '')))
      const initial = outgoing(false)
      if (!initial.ok || scopeOf(session, state).key !== scope.key) return { status: 'skipped' }
      let started = false
      const takeBudget = () => {
        if (manual ? !state.manualBudget() || !manualBudget() : !automaticBudget()) return false
        if (!started && manual && draftPresent === false && state.offer !== undefined) {
          state.offer.closed = true
          void note({ event: 'regenerated' })
          void learnFrom(state.offer, '', true)
          void hide(session, state)
        }
        started = true
        state.lastAutoFingerprint = contextId
        return true
      }
      let result = await modelCall(session, approvedScope, initial.text, context, controller, trigger, takeBudget, avoid)
      if (!owns()) return { status: 'busy' }
      if (manual && result.status === 'duplicate' && scopeOf(session, state).key === scope.key) {
        const retry = outgoing(true)
        if (retry.ok) result = await modelCall(session, approvedScope, retry.text, context, controller, trigger, takeBudget, avoid)
      }
      if (!owns() || scopeOf(session, state).key !== scope.key) return { status: 'busy' }
      if (result.suggestion === undefined) return { status: result.status === 'duplicate' ? 'empty' : result.status }
      const suggestion = {
        ...result.suggestion,
        id: randomUUID(),
        turn: state.turn,
        fingerprint: contextId,
      }
      if (draftPresent) {
        // 优化结果直接返回给客户端替换草稿，不进入建议存储、不挤掉当前灰字。
        // 反馈口径：作为一次普通候选生成计入账本（model-call / candidate 已在 modelCall 记）。
        if (!owns()) return { status: 'busy' }
        return { status: 'generated', suggestion: publicSuggestion({ suggestion }) }
      }
      state.offer = { suggestion, boundary }
      state.lastText = suggestion.text
      await persistSuggestion(session.id, suggestion)
      if (!owns() || state.offer?.suggestion !== suggestion) return { status: 'busy' }
      return { status: 'generated', suggestion: publicSuggestion(state.offer) }
    } catch {
      return { status: owns() ? 'empty' : 'busy' }
    } finally {
      if (state.pending?.controller === controller) state.pending = undefined
      controllers.delete(controller)
    }
  }

  ctx.on('session/event', (session, event) => {
    if (disposed || session.header?.origin === 'subagent') return
    if (!['user/message', 'turn/start', 'turn/end'].includes(event.type)) return
    const state = stateOf(session)
    if (event.type === 'user/message') {
      if (event.data?.source?.kind !== 'user') return
      const requestId = event.data.source.rpcId
      if (typeof requestId === 'string' && !state.recentUsers.has(requestId)) {
        const receipt = { seq: event.seq, id: event.data.id, settled: false }
        rememberBounded(state.recentUsers, requestId, receipt)
        for (const offer of state.accepted.values()) {
          if (requestId === offer.requestId && event.seq > offer.boundary) {
            settleSend(state, offer, receipt, textOfContent(event.data.content).trim())
            break
          }
        }
      }
      // 发送只结算反馈和作废旧建议。回合执行期间没有可展示的建议。
      invalidate(session, state)
      return
    }
    if (state.hydrated && event.seq <= state.boundary) return
    invalidate(session, state)
    state.hydrated = true
    state.turn = event.data.turn
    state.boundary = event.seq
    state.running = event.type === 'turn/start'
    state.reason = event.data.reason?.kind
    state.userCancelled = isUserCancellation(event.data.reason)
    if (!state.running) void schedule(session, state, 'turn').catch(() => {})
  })

  ctx.on('session/disposed', (session) => {
    const state = states.get(session)
    if (state === undefined) return
    state.pending?.controller.abort()
    clearTimeout(taskTimers.get(state))
    taskTimers.delete(state)
    states.delete(session)
  })

  // Agent 自然语言配置：注册 input_suggest_config 工具 + 系统提示词注入。
  // tools / systemPrompt 任一缺失（旧宿主 / 精简组合）时静默跳过，
  // 不阻塞插件加载 —— 浏览器建议与路由照常工作。
  if (resolveConfig(config).agentConfig === true) {
    ctx.effect(() => {
      const tools = resolveService(ctx, 'tools')
      const systemPrompt = resolveService(ctx, 'systemPrompt')
      if (tools === undefined || systemPrompt === undefined) return undefined
      try {
        return installAgentControl(ctx, { agentConfigAction })
      } catch (error) {
        ctx.logger?.warn?.('input-suggest: agent control unavailable (' + (error instanceof Error ? error.message : String(error)) + ')')
        return undefined
      }
    }, 'input-suggest: agent control')
  }

  ctx.effect(() => () => {
    disposed = true
    for (const controller of controllers) controller.abort()
    for (const timer of taskTimers.values()) clearTimeout(timer)
    taskTimers.clear()
  }, 'input-suggest: dispose scheduler')

  const reply = (body, status = 200) => new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  })

  const register = (path, handler, methods = ['POST']) => ctx.effect(() => ctx.connection.fetch.register({
    path: '/api/input-suggest/' + path,
    methods,
    requestBody: 'buffered',
    fetch: async (request) => {
      const admission = admitRequest(ctx, request)
      return admission.ok ? handler(request) : rejectionResponse(admission.status)
    },
  }), 'input-suggest: ' + path + ' route')

  const readBody = async (request) => {
    try {
      return await request.json()
    } catch {
      return undefined
    }
  }

  register('feedback', async (request) => {
    const body = await readBody(request)
    const session = resolveSession(ctx, body?.sessionId)
    if (session !== undefined && session.header?.origin !== 'subagent' && typeof body.suggestionId === 'string') {
      const state = stateOf(session)
      const offer = candidateOf(state, body.suggestionId)
      if (offer !== undefined) await onFeedback(session, state, offer, body)
    }
    return new Response(null, { status: 204 })
  })

  register('usage', async () => {
    const summary = summarizeUsage(await usage.read())
    return reply({ usage: summary, feedback: summarizeFeedback(await feedback.read()) })
  }, ['POST', 'GET'])

  register('presets', async () => reply({
    presets: Object.values(STYLE_PRESETS).map(({ id, label, description, detailLevel, maxChars }) => ({
      id, label, description, detailLevel, maxChars,
    })),
    default: DEFAULT_PRESET,
  }), ['POST', 'GET'])

  register('get', async (request) => {
    const session = resolveSession(ctx, (await readBody(request))?.sessionId)
    if (session === undefined || session.header?.origin === 'subagent') return reply({ suggestion: null })
    const state = stateOf(session)
    const scope = scopeOf(session, state)
    if (!state.running) await restore(session, state, scope)
    const valid = !disposed && !state.running && states.get(session) === state && state.scopeKey === scope.key
    return reply({ suggestion: valid ? publicSuggestion(state.offer) : null })
  })

  register('generate', async (request) => {
    const body = await readBody(request)
    const id = normalizeSessionId(body?.sessionId)
    if (id === undefined) return reply({ status: 'error', suggestion: null }, 400)
    if (body.trigger !== undefined && body.trigger !== 'idle' && body.trigger !== 'manual') {
      return reply({ status: 'error', suggestion: null }, 400)
    }
    const session = resolveSession(ctx, id)
    if (session === undefined || session.header?.origin === 'subagent') return reply({ status: 'error', suggestion: null }, 404)
    const trigger = body.trigger === 'idle' ? 'idle' : 'manual'
    const suggestionId = trigger === 'manual' && typeof body.suggestionId === 'string' ? body.suggestionId : undefined
    const draft = typeof body.draft === 'string' ? body.draft.slice(0, 8000) : undefined
    const { status, suggestion } = await schedule(session, stateOf(session), trigger, suggestionId, draft)
    return reply({ status, suggestion: suggestion ?? null }, status === 'busy' ? 409 : status === 'limited' ? 429 : 200)
  })
}

export default { name, inject, Config, apply }

