/**
 * dsh-input-suggest / feedback — 显式反馈统计（纯函数 + 数据形状）。
 *
 * 与 memory.js 的分工：memory.js 从「建议文本 vs 用户实际发出的文本」里学措辞，
 * 本模块只记账 —— 事件次数、采纳率、发送率、平均改写比例、重复率、响应时间、
 * 每条被发送建议的 token 成本。只累加计数与数值，不保存任何文本。
 *
 * 事件由宿主按真实交互记入：Tab/按钮采纳、关闭建议、重随、草稿被发送。
 * 「同一份草稿的一串事件是否属于同一条建议」由调用方判断，这里不按相似度补记，
 * 也就不会把用户自己手打的一句相似的话误算成采纳。
 *
 * 五个口径：
 *   1. acceptRate = accepted / shown，shown 为 0 时为 null。
 *   2. sendRate = sent / accepted，accepted 为 0 时为 null。
 *   3. avgEditRatio 只取 'sent' 上带的 editRatio，逐条累加（0 也算一条样本）；
 *      'edited' 单独计数，它的 editRatio 是发送前快照，不再计入均值。
 *   4. duplicateRate = duplicates / candidates，candidates 为 0 时为 null。
 *      duplicates 只从 'candidate' 的 duplicate 累加，与 shown / sent 无关。
 *   5. tokensPerSent = usageSummary.totalTokens / sent，sent 为 0 时为 null。
 *
 * @module dsh-input-suggest/feedback
 */

import { z as zod } from 'zod'
import { editDistance } from './memory.js'

/** 反馈账本格式版本。 */
export const FEEDBACK_VERSION = 1

/**
 * 允许的事件。
 *
 * 'candidate' 记录可用输出，'shown' 记录实际曝光。'model-call' 计量反馈启用期间的生成成本。
 */
export const FEEDBACK_EVENTS = Object.freeze([
  'shown',
  'accepted',
  'sent',
  'edited',
  'dismissed',
  'regenerated',
  'candidate',
  'model-call',
])

/** 比较改写比例时每条文本最多看多少个字符（码点）。 */
const MAX_COMPARE_CHARS = 2000

/** 每行末尾的句子标点：只影响语气，不构成实质改写。 */
const TRAILING_PUNCTUATION = /[ \t.!?,;:、。！？，；：…]+$/u

const counter = () => zod.number().int().nonnegative()
const amount = () => zod.number().nonnegative()

/**
 * 反馈账本的持久化形状。
 *
 * 全部是计数或累加量，没有任何字符串字段：这份记录可以放心落盘。
 * 'sent' 的 editRatio 累加进 editRatioSum / editRatioCount，
 * 'candidate' 的耗时累加进 responseSum / responseCount。
 */
export const feedbackSchema = zod.object({
  version: zod.literal(1),
  createdAt: counter(),
  updatedAt: counter(),
  shown: counter(),
  accepted: counter(),
  sent: counter(),
  edited: counter(),
  dismissed: counter(),
  regenerated: counter(),
  candidates: counter(),
  duplicates: counter(),
  editRatioSum: amount(),
  editRatioCount: counter(),
  responseSum: amount(),
  responseCount: counter(),
  measuredTokens: amount().default(0),
})

/** 新建一份空账本。 */
export function emptyFeedback() {
  return {
    version: FEEDBACK_VERSION,
    createdAt: 0,
    updatedAt: 0,
    shown: 0,
    accepted: 0,
    sent: 0,
    edited: 0,
    dismissed: 0,
    regenerated: 0,
    candidates: 0,
    duplicates: 0,
    editRatioSum: 0,
    editRatioCount: 0,
    responseSum: 0,
    responseCount: 0,
    measuredTokens: 0,
  }
}

/** 读一个计数：缺失、负数、非数字都当 0。 */
function countOf(source, name) {
  const value = Number(source?.[name] ?? 0)
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0
}

/** 读一个累加量：缺失、负数、非数字都当 0。 */
function amountOf(source, name) {
  const value = Number(source?.[name] ?? 0)
  return Number.isFinite(value) && value > 0 ? value : 0
}

/** 读一个改写比例：只有有限数才记，越界夹到 0..1。 */
function ratioOf(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined
  return Math.min(1, Math.max(0, value))
}

/** 读一个耗时（毫秒）：非负有限数才记。 */
function elapsedOf(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return undefined
  return value
}

/**
 * 记一个反馈事件。
 *
 * @param {object} previous - 现有账本（不会被修改）。
 * @param {object} entry - 事件事实。
 * @param {'shown'|'accepted'|'sent'|'edited'|'dismissed'|'regenerated'|'candidate'|'model-call'} entry.event - 事件名。
 * @param {number} [entry.editRatio] - 0..1 的改写比例；只在 'sent' 上计入均值。
 * @param {boolean} [entry.duplicate] - 是否与前一条建议重复；只在 'candidate' 上计数。
 * @param {number} [entry.responseMs] - 从发起到拿到可用输出的耗时；只在 'candidate' 上计数。
 * @param {number} [entry.tokens] - 本次辅助调用返回的 Token；只在 'model-call' 上计量。
 * @param {number} [entry.now] - 时间戳（毫秒）。缺省用当前时间。
 * @returns {object} 新账本。
 */
export function recordFeedback(previous, entry) {
  const base = previous ?? emptyFeedback()
  const event = entry?.event
  if (typeof event !== 'string' || !FEEDBACK_EVENTS.includes(event)) {
    throw new TypeError('input-suggest: unknown feedback event "' + String(event) + '"')
  }

  const createdAt = countOf(base, 'createdAt')
  const passedNow = elapsedOf(entry?.now)
  const now = passedNow === undefined ? Date.now() : Math.floor(passedNow)

  const counts = {
    shown: countOf(base, 'shown'),
    accepted: countOf(base, 'accepted'),
    sent: countOf(base, 'sent'),
    edited: countOf(base, 'edited'),
    dismissed: countOf(base, 'dismissed'),
    regenerated: countOf(base, 'regenerated'),
    candidates: countOf(base, 'candidates'),
    duplicates: countOf(base, 'duplicates'),
  }
  let editRatioSum = amountOf(base, 'editRatioSum')
  let editRatioCount = countOf(base, 'editRatioCount')
  let responseSum = amountOf(base, 'responseSum')
  let responseCount = countOf(base, 'responseCount')
  let measuredTokens = amountOf(base, 'measuredTokens')

  if (event === 'shown') {
    counts.shown += 1
  } else if (event === 'accepted') {
    counts.accepted += 1
  } else if (event === 'sent') {
    counts.sent += 1
    const ratio = ratioOf(entry.editRatio)
    if (ratio !== undefined) {
      editRatioSum += ratio
      editRatioCount += 1
    }
  } else if (event === 'edited') {
    counts.edited += 1
  } else if (event === 'dismissed') {
    counts.dismissed += 1
  } else if (event === 'regenerated') {
    counts.regenerated += 1
  } else if (event === 'model-call') {
    measuredTokens += amountOf(entry, 'tokens')
  } else {
    counts.candidates += 1
    if (entry.duplicate === true) counts.duplicates += 1
    const elapsed = elapsedOf(entry.responseMs)
    if (elapsed !== undefined) {
      responseSum += elapsed
      responseCount += 1
    }
  }

  return {
    version: FEEDBACK_VERSION,
    createdAt: createdAt === 0 ? now : createdAt,
    updatedAt: Math.max(now, countOf(base, 'updatedAt')),
    ...counts,
    editRatioSum,
    editRatioCount,
    responseSum,
    responseCount,
    measuredTokens,
  }
}

/**
 * 计算反馈启用期间的指标。分母为 0 时返回 null。
 *
 * @param {object} previous - 现有账本。
 * @returns {object} 指标。
 */
export function summarizeFeedback(previous) {
  const base = previous ?? emptyFeedback()
  const shown = countOf(base, 'shown')
  const accepted = countOf(base, 'accepted')
  const sent = countOf(base, 'sent')
  const candidates = countOf(base, 'candidates')
  const editRatioCount = countOf(base, 'editRatioCount')
  const responseCount = countOf(base, 'responseCount')
  const totalTokens = amountOf(base, 'measuredTokens')
  const responseSum = amountOf(base, 'responseSum')

  return {
    shown,
    accepted,
    sent,
    edited: countOf(base, 'edited'),
    dismissed: countOf(base, 'dismissed'),
    regenerated: countOf(base, 'regenerated'),
    candidates,
    duplicates: countOf(base, 'duplicates'),
    acceptRate: shown === 0 ? null : accepted / shown,
    sendRate: accepted === 0 ? null : sent / accepted,
    avgEditRatio: editRatioCount === 0 ? null : amountOf(base, 'editRatioSum') / editRatioCount,
    duplicateRate: candidates === 0 ? null : countOf(base, 'duplicates') / candidates,
    avgResponseMs: responseCount === 0 ? null : Math.round(responseSum / responseCount),
    tokensPerSent: sent === 0 ? null : totalTokens / sent,
    since: countOf(base, 'createdAt'),
    updatedAt: countOf(base, 'updatedAt'),
  }
}

/**
 * 归一化草稿用于比较：大小写、空白、空行、行末标点都是噪声。
 *
 * 多行草稿按行保留结构：行内连续空白压成一个空格，空行丢弃，行末句子标点
 * 去掉。这样「把一句话折成两行」「多打一个句号」「结尾多敲两个空格」都不算改写，
 * 真正的增删词才算。
 */
export function normalizeDraft(text) {
  const lines = String(text ?? '').replace(/\r\n?/g, '\n').split('\n')
  const kept = []
  for (const line of lines) {
    const collapsed = line
      .replace(/[ \t\u3000]+/g, ' ')
      .replace(TRAILING_PUNCTUATION, '')
      .trim()
    if (collapsed !== '') kept.push(collapsed)
  }
  return kept.join('\n').toLowerCase()
}

/**
 * 建议 → 实际发出草稿的改写比例，0 表示原样发出，1 表示完全换掉。
 *
 * 用 memory.js 的编辑距离（同一套字符级比较），两侧各截到 2000 个码点，
 * 分母取较长一方，结果落在 0..1。只返回数字，不回传任何文本。
 *
 * @param {string} suggestion - 宿主给出的建议。
 * @param {string} sent - 用户实际发出的草稿。
 * @returns {number} 0..1 的改写比例。
 */
export function editRatio(suggestion, sent) {
  const left = Array.from(normalizeDraft(suggestion)).slice(0, MAX_COMPARE_CHARS)
  const right = Array.from(normalizeDraft(sent)).slice(0, MAX_COMPARE_CHARS)
  if (left.length === 0 && right.length === 0) return 0
  if (left.length === 0 || right.length === 0) return 1
  const distance = editDistance(left.join(''), right.join(''))
  const longest = Math.max(left.length, right.length)
  return Math.min(1, Math.max(0, distance / longest))
}

