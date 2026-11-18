/**
 * dsh-input-suggest / usage — 本功能的 token 账本（纯函数 + 数据形状）。
 *
 * 为什么单列一份账本：辅助调用走的是与会话主模型相同的网关，会话用量里会看到
 * token 上涨，但看不出「其中多少是这个建议功能烧掉的」。这里按功能自己记账。
 *
 * 只记录计量字段，不记录任何对话内容。
 *
 * @module dsh-input-suggest/usage
 */

/** 账本格式版本。 */
export const USAGE_VERSION = 1

/** 保留最近多少条逐次记录。 */
const RECENT_KEEP = 50
/** 按路由聚合时最多保留多少条。 */
const ROUTE_KEEP = 20

/** 新建空账本。 */
export function emptyUsage() {
  return {
    version: USAGE_VERSION,
    createdAt: 0,
    updatedAt: 0,
    calls: 0,
    failures: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    reasoningTokens: 0,
    totalTokens: 0,
    routes: [],
    recent: [],
  }
}

/** 把 LLM 层的 TokenUsage 归一成纯数字；缺失字段当 0。 */
export function normalizeUsage(usage) {
  const number = (value) => (typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0)
  if (usage === null || usage === undefined || typeof usage !== 'object') {
    return { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, reasoningTokens: 0, totalTokens: 0 }
  }
  const inputTokens = number(usage.inputTokens)
  const outputTokens = number(usage.outputTokens)
  const explicitTotal = typeof usage.totalTokens === 'number' && Number.isFinite(usage.totalTokens) && usage.totalTokens >= 0
    ? Math.floor(usage.totalTokens)
    : 0
  return {
    inputTokens,
    outputTokens,
    cacheReadTokens: number(usage.cacheReadTokens),
    cacheWriteTokens: number(usage.cacheWriteTokens),
    reasoningTokens: number(usage.reasoningTokens),
    totalTokens: explicitTotal > 0 ? explicitTotal : inputTokens + outputTokens,
  }
}


/** 路由键。 */
export function routeKeyOf(route) {
  if (route === null || route === undefined) return 'unknown'
  const provider = typeof route.provider === 'string' ? route.provider : 'unknown'
  const model = typeof route.model === 'string' ? route.model : 'unknown'
  return provider + '/' + model
}

/**
 * 记一次调用。
 *
 * @param {object} usage - 现有账本。
 * @param {object} entry - 本次调用：route / tokens / outcome / kind / now。
 * @returns {object} 新账本。
 */
export function recordUsage(usage, entry) {
  const base = usage ?? emptyUsage()
  const tokens = normalizeUsage(entry.tokens)
  const now = typeof entry.now === 'number' ? entry.now : 0
  const outcome = entry.outcome === 'error' ? 'error' : entry.outcome === 'empty' ? 'empty' : 'ok'
  const key = routeKeyOf(entry.route)

  const routes = (Array.isArray(base.routes) ? base.routes : []).map((route) => ({ ...route }))
  let bucket = routes.find((route) => route.key === key)
  if (bucket === undefined) {
    bucket = { key, calls: 0, failures: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0 }
    routes.push(bucket)
  }
  bucket.calls += 1
  bucket.inputTokens += tokens.inputTokens
  bucket.outputTokens += tokens.outputTokens
  bucket.totalTokens += tokens.totalTokens
  if (outcome !== 'ok') bucket.failures += 1
  routes.sort((left, right) => right.totalTokens - left.totalTokens)

  const recent = Array.isArray(base.recent) ? base.recent.slice() : []
  recent.unshift({
    at: now,
    key,
    kind: typeof entry.kind === 'string' ? entry.kind : 'unknown',
    outcome,
    inputTokens: tokens.inputTokens,
    outputTokens: tokens.outputTokens,
    totalTokens: tokens.totalTokens,
  })

  return {
    ...base,
    version: USAGE_VERSION,
    createdAt: base.createdAt === 0 ? now : base.createdAt,
    updatedAt: now,
    calls: base.calls + 1,
    failures: base.failures + (outcome === 'ok' ? 0 : 1),
    inputTokens: base.inputTokens + tokens.inputTokens,
    outputTokens: base.outputTokens + tokens.outputTokens,
    cacheReadTokens: base.cacheReadTokens + tokens.cacheReadTokens,
    cacheWriteTokens: base.cacheWriteTokens + tokens.cacheWriteTokens,
    reasoningTokens: base.reasoningTokens + tokens.reasoningTokens,
    totalTokens: base.totalTokens + tokens.totalTokens,
    routes: routes.slice(0, ROUTE_KEEP),
    recent: recent.slice(0, RECENT_KEEP),
  }
}

/** 把账本整理成界面要显示的摘要。 */
export function summarizeUsage(usage) {
  const source = usage ?? emptyUsage()
  const calls = Number(source.calls ?? 0)
  const failures = Number(source.failures ?? 0)
  const totalTokens = Number(source.totalTokens ?? 0)
  return {
    calls,
    failures,
    succeeded: Math.max(0, calls - failures),
    inputTokens: Number(source.inputTokens ?? 0),
    outputTokens: Number(source.outputTokens ?? 0),
    cacheReadTokens: Number(source.cacheReadTokens ?? 0),
    reasoningTokens: Number(source.reasoningTokens ?? 0),
    totalTokens,
    avgTokensPerCall: calls === 0 ? 0 : Math.round(totalTokens / calls),
    routes: Array.isArray(source.routes) ? source.routes : [],
    recent: Array.isArray(source.recent) ? source.recent : [],
    since: Number(source.createdAt ?? 0),
  }
}

/** 按每百万 token 单价估算成本；未配置单价时返回 undefined。 */
export function estimateCost(summary, pricePerMillion) {
  if (pricePerMillion === null || pricePerMillion === undefined) return undefined
  const price = Number(pricePerMillion)
  if (!Number.isFinite(price) || price < 0) return undefined
  const total = Number(summary?.totalTokens ?? 0)
  if (total <= 0) return 0
  return (total / 1000000) * price
}

