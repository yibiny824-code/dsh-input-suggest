/**
 * dsh-input-suggest — 宿主半区。
 *
 * 每轮对话完成（turn/end 且 reason.kind === 'completed'）后，用一次有界的辅助
 * 模型调用预测用户下一句最可能输入的话，存进插件自己的 storage domain，并通过
 * connection.fetch 挂到 /api 网关供浏览器读取。
 *
 * 设计要点：
 *   1. 零会话日志写入。建议是本插件私有的派生状态，不进 session log；
 *      rc.2 无法给追加事件打 ignorable 标记，写自定义事件会让会话冷读失败。
 *   2. 模型显式可配。provider / model / reasoningEffort 来自 volatile 配置，
 *      设置页可改；留空则沿用会话最近一次请求的路由。
 *   3. 提示词可自定义。style 字段作为额外的风格指令拼进系统提示词。
 *   4. 重随。/api/input-suggest/generate 无视「本轮已生成」游标重新生成一次。
 *
 * @module dsh-input-suggest
 */

import z from '@deepseek-ai/schemastery'
import { z as zod } from 'zod'
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'
import { BlockAssembler } from '@deepseek-ai/dsh-llm'
import {
  renderPrompt, resolveDetail, validateTemplate, DEFAULT_TEMPLATE, INSTRUCTIONS, DETAIL_LEVELS,
  STYLE_PRESETS, DEFAULT_PRESET, resolvePreset, composeStyle,
} from './prompt.js'
import { emptyUsage, recordUsage, summarizeUsage, normalizeUsage, routeKeyOf } from './usage.js'
import {
  emptyProfile, recordObservation, describeProfile, recentAccepted, similarity, ADOPT_THRESHOLD,
} from './memory.js'
import { redact, outboundDecision, stillLooksSensitive, isLoopbackEndpoint } from './privacy.js'

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
export function cleanSuggestion(raw) {
  let value = stripLoneSurrogates(String(raw ?? '').replace(ESCAPE_SEQUENCE, '').replace(CONTROL_CHARS, ''))
  value = value.trim().replace(FENCE_DELIMITER, '').trim().replace(QUOTED_OUTER, '$2').trim()
  return value.replace(/\s+/g, ' ').trim()
}

/** 截断到可见字符上限。 */
export function sanitizeSuggestion(raw, maxChars) {
  const value = cleanSuggestion(raw)
  const chars = Array.from(value)
  return chars.length > maxChars
    ? { text: chars.slice(0, maxChars).join(''), truncated: true }
    : { text: value, truncated: false }
}

/** 语义过滤：套话、提问、助手口吻、多句都不要。 */
export function shouldFilterSuggestion(text) {
  if (text.length === 0) return true
  if (/^(thanks?|thank you|ok|okay|sure|cool|great|nice|got it|yes|no)\b[.!]?$/i.test(text)) return true
  if (/^(looks? good|sounds? good|well done|good job)\b/i.test(text)) return true
  if (/^(let me|i'll|i will|here's|here is)\b/i.test(text)) return true
  if (/[?\uFF1F]\s*$/u.test(text)) return true
  const sentences = text.split(/(?<=[.!?\u3002\uFF01\uFF1F])\s+/u).filter((part) => part.trim().length > 0)
  return sentences.length > 1
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
  for (const message of messages) {
    if (message === null || typeof message !== 'object') continue
    const text = textOfContent(message.content).trim()
    if (text.length === 0) continue
    if (message.role === 'user') {
      if (message.source?.kind !== 'user') continue
      pairs.push({ role: 'user', text: redactSecrets(text) })
      continue
    }
    if (message.role === 'assistant') pairs.push({ role: 'assistant', text: redactSecrets(text) })
  }
  let start = Math.max(0, pairs.length - Math.max(1, maxRecentTurns) * 2)
  while (start < pairs.length && pairs[start].role !== 'user') start += 1
  const window = pairs.slice(start)
  let remaining = Math.max(1, maxTranscriptChars)
  const kept = []
  for (let index = window.length - 1; index >= 0; index -= 1) {
    const cost = window[index].text.length + 24
    if (cost > remaining && kept.length > 0) break
    kept.unshift(window[index])
    remaining -= cost
  }
  return kept
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
  turn: zod.number().int().nonnegative(),
  text: zod.string().min(1),
  truncated: zod.boolean(),
  acceptKey: zod.string().min(1),
  route: zod.object({ provider: zod.string().min(1), model: zod.string().min(1) }).optional(),
  style: zod.string().optional(),
  preset: zod.string().optional(),
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
    ...(suggestion.route !== undefined ? { route: suggestion.route } : {}),
    ...(suggestion.style !== undefined ? { style: suggestion.style } : {}),
    ...(suggestion.preset !== undefined ? { preset: suggestion.preset } : {}),
  }
}

/** 把读回的记录投影成建议；形状不对就当作没有。 */
export function toSuggestion(record) {
  const parsed = StoredSuggestion.safeParse(record)
  if (!parsed.success) return undefined
  const stored = parsed.data
  return {
    turn: stored.turn,
    text: stored.text,
    truncated: stored.truncated,
    acceptKey: stored.acceptKey,
    ...(stored.route !== undefined ? { route: stored.route } : {}),
    ...(stored.style !== undefined ? { style: stored.style } : {}),
    ...(stored.preset !== undefined ? { preset: stored.preset } : {}),
  }
}

//#endregion

/** 终止原因转成辅助调用失败。 */
/**
 * 解析某个 provider 的端点。读不到就返回 undefined —— 那会被判成「非本机」，
 * 从而要求用户显式打开 allowRemote，属于失败关闭（fail-closed）。
 */
export function endpointOf(ctx, provider) {
  try {
    if (typeof ctx.llm?.providerInfo === 'function') {
      const info = ctx.llm.providerInfo(provider)
      if (typeof info?.baseURL === 'string') return info.baseURL
    }
    if (typeof ctx.llm?.listProviders === 'function') {
      const found = ctx.llm.listProviders().find((entry) => entry.id === provider || entry.name === provider)
      if (typeof found?.baseURL === 'string') return found.baseURL
    }
  } catch {
    // 读不到就按未知处理。
  }
  return undefined
}

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

/**
 * 挂载插件。
 * @param {object} ctx - Cordis 上下文。
 * @param {object} config - volatile 配置。
 */
export function apply(ctx, config) {
  /** session -> 该会话的内存状态。 */
  const states = new WeakMap()
  /** 出现过的状态，用于卸载时统一中止。 */
  const tracked = new Set()
  let disposed = false

  const stateOf = (session) => {
    let state = states.get(session)
    if (state === undefined) {
      state = { lastTurn: 0, turnResolved: false, lastSuggestedTurn: -1, suggestion: undefined, pending: undefined, mutation: undefined }
      states.set(session, state)
      tracked.add(state)
    }
    return state
  }

  // 内存镜像：storageDomain 缺失或写失败时仍是可用状态。
  const memory = new Map()
  let domainPromise

  const domain = () => {
    if (domainPromise !== undefined) return domainPromise
    const storageDomain = typeof ctx.get === 'function' ? ctx.get('storageDomain') : ctx.storageDomain
    if (storageDomain === undefined || storageDomain === null || typeof storageDomain.open !== 'function') {
      domainPromise = Promise.resolve(undefined)
      return domainPromise
    }
    domainPromise = Promise.resolve()
      .then(() => storageDomain.open(suggestDomainSpec))
      .catch((error) => {
        ctx.logger?.warn?.('input-suggest: storage domain unavailable (' + (error instanceof Error ? error.message : String(error)) + '); suggestions live in memory only')
        return undefined
      })
    return domainPromise
  }

  const readSuggestion = async (sessionId) => {
    if (memory.has(sessionId)) return memory.get(sessionId)
    const opened = await domain()
    if (opened === undefined) return undefined
    try {
      return toSuggestion(opened.table('sessions').get(sessionId))
    } catch {
      return undefined
    }
  }

  const writeSuggestion = async (sessionId, suggestion) => {
    memory.set(sessionId, suggestion)
    const opened = await domain()
    if (opened === undefined) return
    try {
      await opened.table('sessions').put(sessionId, toStoredRecord(suggestion))
    } catch (error) {
      ctx.logger?.warn?.('input-suggest: could not persist suggestion: ' + (error instanceof Error ? error.message : String(error)))
    }
  }

  const clearSuggestion = async (sessionId) => {
    const had = memory.delete(sessionId)
    const opened = await domain()
    if (opened === undefined) return had
    try {
      return (await opened.table('sessions').delete(sessionId)) || had
    } catch {
      return had
    }
  }

  /** 串行化同一会话的持久化写入，避免旧的异步 put 后到覆盖新的。 */
  const mutate = (state, action) => {
    const next = (state.mutation ?? Promise.resolve()).then(action, action)
    state.mutation = next.catch(() => {})
    return next
  }

  //#region 本地画像（独立记忆）

  /** 画像只在本机：存在插件自己的 domain 里，键固定为 'local'。 */
  const PROFILE_KEY = 'local'
  let profileCache
  let profileChain = Promise.resolve()

  /** 读画像；缺失或损坏都回落到空画像（绝不因为画像坏了就没有建议）。 */
  const readProfile = async () => {
    if (profileCache !== undefined) return profileCache
    const opened = await domain()
    if (opened === undefined) {
      profileCache = emptyProfile()
      return profileCache
    }
    try {
      const stored = opened.table('profiles').get(PROFILE_KEY)
      profileCache = stored === undefined ? emptyProfile() : { ...emptyProfile(), ...stored }
    } catch {
      profileCache = emptyProfile()
    }
    return profileCache
  }

  /** 串行化画像写入：学习是低频动作，但并发回合会同时回来。 */
  const mutateProfile = (action) => {
    const next = profileChain.then(action, action)
    profileChain = next.catch(() => {})
    return next
  }

  /** 记一次观测；`learn` 关闭时只在内存里更新，不落盘也不影响下次启动。 */
  const observe = async (suggestion, finalText, rejected) => {
    const resolved = resolveConfig(config)
    if (resolved.learn !== true) return
    const now = Date.now()
    await mutateProfile(async () => {
      const previous = await readProfile()
      const next = recordObservation(previous, {
        suggestion: typeof suggestion === 'string' ? suggestion : '',
        finalText: typeof finalText === 'string' ? finalText : '',
        rejected: rejected === true,
        now,
      })
      profileCache = next
      const opened = await domain()
      if (opened === undefined) return
      try {
        await opened.table('profiles').put(PROFILE_KEY, next)
      } catch (error) {
        ctx.logger?.warn?.('input-suggest: could not persist profile: ' + (error instanceof Error ? error.message : String(error)))
      }
    })
  }

  /**
   * 判断上一条建议的结局：用户此刻发出的文本是「采用 / 改写 / 无关」。
   * 只在草稿从空变成有文本、且存在上一条建议时调用。
   */
  //#region token 账本

  /** 账本固定键：整机一条，按 route 聚合。 */
  const USAGE_KEY = 'local'
  let usageCache
  let usageChain = Promise.resolve()

  /** 读账本；缺失或损坏都回落到空账本（账本坏了不该影响建议功能）。 */
  const readUsage = async () => {
    if (usageCache !== undefined) return usageCache
    const opened = await domain()
    if (opened === undefined) {
      usageCache = emptyUsage()
      return usageCache
    }
    try {
      const stored = opened.table('usage').get(USAGE_KEY)
      usageCache = stored === undefined ? emptyUsage() : { ...emptyUsage(), ...stored }
    } catch {
      usageCache = emptyUsage()
    }
    return usageCache
  }

  /** 串行化账本写入。 */
  const mutateUsage = (action) => {
    const next = usageChain.then(action, action)
    usageChain = next.catch(() => {})
    return next
  }

  /**
   * 记一次调用的 token 用量。
   *
   * 失败也只记不抛：记账失败绝不能影响建议生成本身。
   */
  const recordUsageSafe = async (route, tokens, outcome, kind) => {
    try {
      await mutateUsage(async () => {
        const previous = await readUsage()
        const next = recordUsage(previous, { route, tokens, outcome, kind, now: Date.now() })
        usageCache = next
        const opened = await domain()
        if (opened === undefined) return
        await opened.table('usage').put(USAGE_KEY, next)
      })
    } catch (error) {
      ctx.logger?.warn?.('input-suggest: could not persist usage: ' + (error instanceof Error ? error.message : String(error)))
    }
  }

  //#endregion

  const settlePending = async (session) => {
    const state = stateOf(session)
    const open = state.open
    if (open === undefined) return
    state.open = undefined
    const messages = session.deriveMessages()
    let lastUser = ''
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index]
      if (message !== null && message.role === 'user' && message.source?.kind === 'user') {
        lastUser = textOfContent(message.content).trim()
        break
      }
    }
    if (lastUser === '') return
    await observe(open.text, lastUser, similarity(open.text, lastUser) < ADOPT_THRESHOLD)
  }

  //#endregion

  /**
   * 生成一条建议。
   * @param {object} session - 会话。
   * @param {number} turn - 回合号。
   * @param {AbortSignal|undefined} signal - 取消信号。
   * @param {string} kind - 归因：turn | early | manual。
   * @param {object} options - 生成选项：avoid 表示上一句建议，重随时不得复述。
   * @returns {Promise<object|undefined>} 建议；undefined 表示「本轮没有可建议的下一步」。
   */
  const generate = async (session, turn, signal, kind = 'turn', options = {}) => {
    const resolved = resolveConfig(config)
    const route = routeOf(session.requestHeader?.(), resolved)
    if (route === undefined) {
      throw new Error('input-suggest: no complete route; set provider and model in Settings, or finish a turn that logs a session route')
    }
    const pairs = buildPairs(session.deriveMessages(), resolved.maxRecentTurns, resolved.maxTranscriptChars)
    if (pairs.length === 0) throw new Error('input-suggest: session has no user/assistant text to suggest from')

    // 外发闸门：默认只允许 loopback 端点。端点是远端而用户没显式允许时，
    // 直接放弃生成（宁可没有建议，也不把上下文发出去）。
    const endpoint = endpointOf(ctx, route.provider)
    if (outboundDecision({ allowRemote: resolved.allowRemote, endpoint }) !== 'allowed') {
      throw new Error('input-suggest: endpoint is not loopback and allowRemote is off; refusing to send context')
    }

    // 最小化 + 脱敏：只发最近一轮 user/assistant 文本。
    const redactedPairs = pairs.map((pair) => ({ role: pair.role, text: redact(pair.text) }))
    const framed = frameTranscript(redactedPairs)
    if (stillLooksSensitive(framed)) {
      throw new Error('input-suggest: transcript still looks sensitive after redaction; refusing to send')
    }

    const voice = suggestionLanguage(pairs)
    const profile = resolved.useMemory === true ? await readProfile() : undefined
    const memory = profile === undefined ? '' : describeProfile({ ...profile, language: profile.language === 'unknown' ? (voice === '简体中文' ? 'zh' : 'en') : profile.language })
    const examples = resolved.useExamples === true && profile !== undefined
      ? recentAccepted(profile, 5).map((sample) => '- ' + sample).join('\n')
      : ''
    const detail = resolveDetail(resolved.detailLevel)
    const cap = Math.min(resolved.maxSuggestionChars, detail.maxChars)
    const preset = resolvePreset(resolved.stylePreset)
    const system = renderPrompt({
      template: resolved.template,
      style: composeStyle(resolved.stylePreset, resolved.style),
      memory,
      examples,
      language: voice,
      detailLevel: resolved.detailLevel,
      maxChars: cap,
    })
    // 重随时模型拿到的是同一段上下文，temperature 又不可控，很容易复述上一句。
    // 显式的回避指令是唯一确定有效的办法；只追加一段，不改动其他行为。
    const avoid = typeof options.avoid === 'string' ? options.avoid.trim() : ''
    const systemWithAvoid = avoid === ''
      ? system
      : system + '\n\nALREADY SUGGESTED (the user pressed reroll, so do NOT repeat or lightly reword this):\n' + avoid

    const controller = new AbortController()
    const timer = setTimeout(
      () => controller.abort(new Error('input-suggest: suggestion timed out')),
      Math.max(1000, resolved.timeoutMs),
    )
    const signals = [controller.signal]
    if (signal !== undefined) signals.push(signal)
    const anySignal = typeof AbortSignal.any === 'function' ? AbortSignal.any(signals) : controller.signal

    try {
      const assembler = new BlockAssembler()
      const stream = ctx.llm.stream({
        provider: route.provider,
        model: route.model,
        messages: [{ role: 'user', content: [{ type: 'text', text: framed }] }],
        system: systemWithAvoid,
        maxTokens: resolved.maxOutputTokens,
        ...(resolved.reasoningEffort !== '' ? { reasoningEffort: resolved.reasoningEffort } : {}),
        sessionId: session.id,
        signal: anySignal,
      })
      for await (const chunk of stream) {
        anySignal.throwIfAborted()
        assembler.push(chunk)
      }
      anySignal.throwIfAborted()
      const terminal = finishError(assembler.finish)
      if (terminal !== undefined) throw terminal
      const blocks = assembler.blocks()
      if (blocks.some((block) => block.type === 'tool-call')) {
        throw new Error('input-suggest: suggestion output must be text only')
      }
      const raw = blocks
        .filter((block) => block.type === 'text')
        .map((block) => block.text)
        .join(' ')
      const cleaned = cleanSuggestion(raw)
      const usage = normalizeUsage(assembler.usage)
      // 即使这一轮没有可用的建议，也已经消耗了 token；用量必须记账，
      // 否则用户看到的数字会系统性偏低。
      if (cleaned.length === 0 || shouldFilterSuggestion(cleaned)) {
        await recordUsageSafe(route, usage, 'empty', kind)
        return undefined
      }
      const { text, truncated } = sanitizeSuggestion(cleaned, cap)
      await recordUsageSafe(route, usage, 'ok', kind)
      return {
        turn,
        text,
        truncated,
        acceptKey: resolved.acceptKey,
        route,
        detailLevel: detail.label,
        preset: preset.id,
        ...(resolved.style !== '' ? { style: resolved.style } : {}),
      }
    } finally {
      clearTimeout(timer)
    }
  }

  /** 为一个已完成回合启动自动生成（同回合只跑一次）。 */
  const startGeneration = (session, turn) => {
    const state = stateOf(session)
    const pending = state.pending
    if (pending !== undefined) pending.controller.abort()
    const controller = new AbortController()
    state.pending = { turn, controller }
    const owns = () => !disposed && !controller.signal.aborted && state.pending?.controller === controller

    void Promise.resolve()
      .then(() => (owns() ? generate(session, turn, controller.signal, 'turn') : undefined))
      .then(async (suggestion) => {
        if (!owns()) return
        if (suggestion === undefined) {
          state.pending = undefined
          state.lastSuggestedTurn = Math.max(state.lastSuggestedTurn, turn)
          await mutate(state, () => clearSuggestion(session.id))
          return
        }
        await mutate(state, () => writeSuggestion(session.id, suggestion))
        if (!owns()) return
        // 记下「待结算」：用户接下来发出的文本会与它比对。
        state.open = { turn, text: suggestion.text }
        state.pending = undefined
        state.lastSuggestedTurn = Math.max(state.lastSuggestedTurn, turn)
      })
      .catch((error) => {
        if (state.pending?.controller === controller) state.pending = undefined
        if (controller.signal.aborted) return
        ctx.logger?.warn?.('input-suggest: generation failed: ' + (error instanceof Error ? error.message : String(error)))
      })
  }

  // 会话事件监听：回合开始即作废在途生成，回合正常完成才生成新建议。
  /**
   * 解析当前可用的回合号。
  /** 两次「提前建议」之间的最小间隔：避免连发消息时反复调用模型。 */
  const EARLY_COOLDOWN_MS = 20000

  /**
   * 用户刚发出一条消息时，先用这条消息本身算一条建议。
   *
   * 为什么有效：`generate()` 读的是会话派生历史，此时最后一对就是
   * 「用户刚说的话」+「上一轮的回答」，模型据此推测用户接下来要做什么，
   * 比等到回合结束更早，也比只在 turn/end 触发时覆盖率更高。
   *
   * 失败一律静默：这只是提前量，绝不能干扰正常对话。
   */
  const requestEarlySuggestion = (session, state) => {
    if (state.pending !== undefined) return
    const now = Date.now()
    if (typeof state.lastEarlyAt === 'number' && now - state.lastEarlyAt < EARLY_COOLDOWN_MS) return
    state.lastEarlyAt = now
    const turn = Math.max(state.lastTurn, 1)
    const controller = new AbortController()
    state.pending = { turn, controller }
    const owns = () => !disposed && !controller.signal.aborted && state.pending?.controller === controller
    void Promise.resolve()
      .then(() => (owns() ? generate(session, turn, controller.signal, 'early') : undefined))
      .then(async (suggestion) => {
        if (!owns()) return
        if (suggestion === undefined) {
          state.pending = undefined
          return
        }
        await mutate(state, () => writeSuggestion(session.id, suggestion))
        if (!owns()) return
        state.open = { turn, text: suggestion.text }
        state.pending = undefined
      })
      .catch(() => {
        if (state.pending?.controller === controller) state.pending = undefined
      })
  }

  /**
   * 解析当前可用的回合号。
   *
   * 正常情况下只靠 `turn/end` 累积就够；但插件是后装的，已有会话从未经过本监听，
   * 状态里是 0。这里按需回填一次：从已提交事件里找最大的 `turn/end`（找不到就用
   * 最大的 `turn/start`），之后状态照旧更新。只读一次，不重复扫历史。
   *
   * @returns 可用的回合号（0 表示确实还没有任何回合）。
   */
  const resolveTurn = async (session, state) => {
    if (state.lastTurn > 0) return state.lastTurn
    if (state.turnResolved === true) return state.lastTurn
    state.turnResolved = true
    let started = 0
    let ended = 0
    try {
      // 用 snapshotEvents() 而不是已废弃的 session.events 读取器。
      const events = typeof session.snapshotEvents === 'function' ? session.snapshotEvents() : []
      for (const event of events) {
        if (event.type === 'turn/start' && typeof event.data?.turn === 'number') {
          started = Math.max(started, event.data.turn)
        }
        if (event.type === 'turn/end' && typeof event.data?.turn === 'number') {
          ended = Math.max(ended, event.data.turn)
        }
      }
    } catch {
      // 读不到历史就维持 0。
    }
    state.lastTurn = Math.max(state.lastTurn, ended, started)
    return state.lastTurn
  }

  // 会话事件监听：回合开始即作废在途生成，回合正常完成才生成新建议。
  ctx.on('session/event', (session, event) => {
    const state = stateOf(session)
    if (event.type === 'user/message') {
      // 用户发了一条新消息：立刻用这条消息算一条建议，不等回合结束。
      // 这是提高触发频率的关键一步 —— 原来只认 turn/end，一个回合没跑完就
      // 永远没有建议；而且连续追问时，上一轮一结束就被下一次 turn/start 打断，
      // 建议窗口几乎是空的。
      // 只认真人输入：工作区指令、运行时快照、工具结果都不算。
      const source = event.data?.source?.kind
      if (source !== 'user') return
      if (resolveConfig(config).enabled !== true) return
      if (session.header?.origin === 'subagent') return
      void requestEarlySuggestion(session, state)
      return
    }
    if (event.type === 'turn/start') {
      // 新回合开始：上一条建议要么已经结算，要么被用户忽略。
      void settlePending(session)
      state.pending?.controller.abort()
      state.pending = undefined
      return
    }
    if (event.type !== 'turn/end') return
    state.lastTurn = Math.max(state.lastTurn, event.data.turn)
    if (resolveConfig(config).enabled !== true) return
    // 触发面比早期宽：除了正常完成，中断/出错/触顶也要给建议 ——
    // 「这一步出错了，接下来怎么办」恰恰是最需要下一句提示的时候。
    // 只有用户主动取消（aborted by user）不生成，避免打断用户自己的节奏。
    const reason = event.data.reason?.kind
    if (reason === 'aborted' && event.data.reason?.reason?.kind === 'user') return
    if (state.pending?.turn === event.data.turn) return
    startGeneration(session, event.data.turn)
  })

  ctx.effect(() => () => {
    disposed = true
    for (const state of tracked) {
      state.pending?.controller.abort()
      state.pending = undefined
    }
  }, 'input-suggest: abort in-flight generations')

  //#region 浏览器路由

  const reply = (body, status = 200) => new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  })

  const sessionIdOf = (body) => {
    if (body === null || typeof body !== 'object') return undefined
    const id = body.sessionId
    if (typeof id !== 'string' || id.length === 0 || id.length > 512) return undefined
    if (/[\u0000-\u001f]/u.test(id)) return undefined
    return id
  }

  const readBody = async (request) => {
    try {
      return await request.json()
    } catch {
      return undefined
    }
  }

  /**
   * 隐式反馈：浏览器在「草稿从空变成有文本」时把最终文本送上来。
   * 与上一条建议比对：接近 = 采用，差得远 = 改写（方向有效、措辞要学）。
   * 这是学习的主入口，永远回答 204 —— 学习失败绝不能挡住用户发消息。
   */
  ctx.effect(() => ctx.connection.fetch.register({
    path: '/api/input-suggest/feedback',
    methods: ['POST'],
    requestBody: 'buffered',
    fetch: async (request) => {
      const body = await readBody(request)
      const sessionId = sessionIdOf(body)
      if (sessionId === undefined) return new Response(null, { status: 204 })
      const session = ctx.sessions.get(sessionId)
      if (session === undefined) return new Response(null, { status: 204 })
      const text = typeof body?.text === 'string' ? body.text.slice(0, 4000) : ''
      const rejected = body?.rejected === true
      const state = stateOf(session)
      const open = state.open
      // 没有待结算的建议时只记一次纯采纳统计（例如用户手打了相似的话）。
      await observe(open === undefined ? '' : open.text, text, rejected || (open !== undefined && similarity(open.text, text) < ADOPT_THRESHOLD))
      state.open = undefined
      return new Response(null, { status: 204 })
    },
  }), 'input-suggest: feedback route')

  /** 读取当前会话最新建议。任何失败都回答 suggestion: null。 */
  /** 读取本功能的 token 账本（只含计量字段）。 */
  ctx.effect(() => ctx.connection.fetch.register({
    path: '/api/input-suggest/usage',
    methods: ['POST', 'GET'],
    requestBody: 'buffered',
    fetch: async () => {
      const usage = await readUsage()
      return reply({ usage: summarizeUsage(usage) })
    },
  }), 'input-suggest: usage route')

  /**
   * 风格预设目录。
   *
   * 预设写在宿主侧的 prompt.js 里：升级插件会更新预设文本，而用户在设置页
   * 的选择（stylePreset）与附加要求（style）保存在 profile 配置里，不受影响。
   * 设置页从这里读列表，新增预设不需要改前端。
   */
  ctx.effect(() => ctx.connection.fetch.register({
    path: '/api/input-suggest/presets',
    methods: ['POST', 'GET'],
    requestBody: 'buffered',
    fetch: async () => reply({
      presets: Object.values(STYLE_PRESETS).map((preset) => ({
        id: preset.id,
        label: preset.label,
        description: preset.description,
        detailLevel: preset.detailLevel,
        maxChars: preset.maxChars,
      })),
      default: DEFAULT_PRESET,
    }),
  }), 'input-suggest: preset catalog route')

  /** 读取当前会话最新建议。任何失败都回答 suggestion: null。 */
  ctx.effect(() => ctx.connection.fetch.register({
    path: '/api/input-suggest/get',
    methods: ['POST'],
    requestBody: 'buffered',
    fetch: async (request) => {
      const sessionId = sessionIdOf(await readBody(request))
      if (sessionId === undefined) return reply({ suggestion: null })
      if (ctx.sessions.get(sessionId) === undefined) return reply({ suggestion: null })
      const suggestion = await readSuggestion(sessionId)
      return reply({ suggestion: suggestion ?? null })
    },
  }), 'input-suggest: read route')

  /** 重随：无视「本轮已生成」游标，显式再生成一次。 */
  ctx.effect(() => ctx.connection.fetch.register({
    path: '/api/input-suggest/generate',
    methods: ['POST'],
    requestBody: 'buffered',
    fetch: async (request) => {
      const sessionId = sessionIdOf(await readBody(request))
      if (sessionId === undefined) return reply({ status: 'error', suggestion: null }, 400)
      const session = ctx.sessions.get(sessionId)
      if (session === undefined) return reply({ status: 'error', suggestion: null }, 404)
      const state = stateOf(session)
      if (disposed || state.pending !== undefined) return reply({ status: 'busy', suggestion: null }, 409)
      // 插件加载前就存在的会话从没走过 turn/end 监听，lastTurn 还是 0。
      // 这里回填一次历史里的最大回合号，否则老会话永远回答「还没有完成的回合」。
      const turn = await resolveTurn(session, state)
      if (turn < 1) return reply({ status: 'no-context', suggestion: null })
      const controller = new AbortController()
      state.pending = { turn, controller }
      const owns = () => !disposed && !controller.signal.aborted && state.pending?.controller === controller
      try {
        // 重随的前提是「换一句」：把当前这条原样送回去当作回避目标，
        // 否则模型面对同一段上下文大概率再写一遍同样的话。
        const previous = await readSuggestion(session.id)
        const avoid = previous !== undefined && typeof previous.text === 'string' ? previous.text : ''
        let suggestion = await generate(session, turn, controller.signal, 'manual', { avoid })
        if (!owns()) return reply({ status: 'busy', suggestion: null }, 409)
        // 模型偶尔无视回避指令。第二次问它时把「换一个角度」写进提示词，
        // 比让用户连点五次重随更省 token，也省掉一轮困惑。
        if (suggestion !== undefined && avoid !== '' && suggestion.text === avoid) {
          suggestion = await generate(session, turn, controller.signal, 'manual', {
            avoid: avoid + '\n\nPick a DIFFERENT next step, not a paraphrase of the line above.',
          })
          if (!owns()) return reply({ status: 'busy', suggestion: null }, 409)
        }
        if (suggestion === undefined) {
          state.lastSuggestedTurn = Math.max(state.lastSuggestedTurn, turn)
          await mutate(state, () => clearSuggestion(session.id))
          return reply({ status: 'empty', suggestion: null })
        }
        await mutate(state, () => writeSuggestion(session.id, suggestion))
        if (!owns()) return reply({ status: 'busy', suggestion: null }, 409)
        // 重随成功：旧建议被拒绝，新建议进入待结算。
        if (state.open !== undefined && state.open.text !== suggestion.text) {
          await observe(state.open.text, '', true)
        }
        state.open = { turn, text: suggestion.text }
        state.lastSuggestedTurn = Math.max(state.lastSuggestedTurn, turn)
        return reply({ status: 'generated', suggestion })
      } catch {
        // 不把 provider / 凭据 / 路由细节暴露给浏览器。
        return owns() ? reply({ status: 'error', suggestion: null }, 502) : reply({ status: 'busy', suggestion: null }, 409)
      } finally {
        if (state.pending?.controller === controller) state.pending = undefined
      }
    },
  }), 'input-suggest: generate route')

  //#endregion
}

export default { name, inject, Config, apply }

