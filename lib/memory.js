/**
 * dsh-input-suggest / memory — 本地画像与隐式反馈（纯函数 + 数据形状）。
 *
 * 设计目标：持续学习个人使用习惯，同时保证「记忆只在本机、只进本地模型调用」。
 *
 * 三类信号：
 *   1. **隐式采纳**：宿主给出的建议 B 与用户实际发出的 A 足够接近 → B 有用；
 *      采纳率进入画像，用来调节建议的语气（越准越简短）。
 *   2. **修改距离**：A 与 B 的编辑距离。小改动说明建议方向对、措辞要调；
 *      完全改写说明方向不对，降低该风格的权重。
 *   3. **显式改写**：用户点重随 → 上一条被拒绝，记一次反例。
 *
 * 画像只保留聚合量：采纳率、平均长度、语言、常用动词/开头词频、改写样例。
 * 不保存对话正文、不保存文件内容、不保存凭据。
 *
 * @module dsh-input-suggest/memory
 */

/** 画像格式版本；升级时旧的画像按字段可选读取，不阻塞启动。 */
export const PROFILE_VERSION = 1

/** 新建一份空画像。 */
export function emptyProfile() {
  return {
    version: PROFILE_VERSION,
    createdAt: 0,
    updatedAt: 0,
    /** 观测到的建议总数（每次给出并收到反馈）。 */
    observations: 0,
    /** 被采纳（含小改动后发出）的次数。 */
    accepted: 0,
    /** 被点重随（明确拒绝）的次数。 */
    rejected: 0,
    /** 用户最终发出文本的平均字符数（CJK 按字符、ASCII 按字符，不折算）。 */
    avgChars: 0,
    /** 观察到的语言：zh / en / mixed。 */
    language: 'unknown',
    /** 用户改写时常用开头词（最多 12 个）。 */
    leadingWords: [],
    /** 最近被采纳的建议原文（最多 20 条，每条裁剪到 120 字符）。 */
    acceptedSamples: [],
    /** 最近被拒绝的建议原文（最多 10 条）。 */
    rejectedSamples: [],
  }
}

/** 单条样例的字符上限。 */
const SAMPLE_MAX_CHARS = 120
/** 两列最多保留多少条。 */
const ACCEPTED_KEEP = 20
const REJECTED_KEEP = 10
/** 开头词保留多少个。 */
const LEADING_KEEP = 12

/** 按「可见字符」截断（码点计数）。 */
export function clip(text, max = SAMPLE_MAX_CHARS) {
  const chars = Array.from(String(text ?? ''))
  return chars.length > max ? chars.slice(0, max).join('') : chars.join('')
}

/** 归一化比较：去掉标点空白、统一小写，只看「说了什么」。 */
export function normalizeForCompare(text) {
  return String(text ?? '')
    .toLowerCase()
    .replace(/[\s]+/g, ' ')
    .replace(/[，。！？、；：,\.!\?;:'"“”‘’()（）\[\]{}]/g, '')
    .trim()
}

/** Levenshtein 距离（两行文本，长度受裁剪限制，O(n*m) 可接受）。 */
export function editDistance(left, right) {
  const a = Array.from(left)
  const b = Array.from(right)
  if (a.length === 0) return b.length
  if (b.length === 0) return a.length
  let previous = new Array(b.length + 1)
  let current = new Array(b.length + 1)
  for (let j = 0; j <= b.length; j += 1) previous[j] = j
  for (let i = 1; i <= a.length; i += 1) {
    current[0] = i
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost)
    }
    const swap = previous
    previous = current
    current = swap
  }
  return previous[b.length]
}

/**
 * 相似度 0..1（1 = 完全相同）。
 *
 * 编辑距离单独用会惩罚「用户把短建议扩写成一句」这种最常见的采纳形态
 * （'push' → 'push the branch' 只有 0.27），所以外加一个包含判据：
 * 较短的一方完整出现在较长的一方里，说明方向被采纳，给 0.7 的底分。
 */
export function similarity(left, right) {
  const a = normalizeForCompare(left)
  const b = normalizeForCompare(right)
  if (a.length === 0 && b.length === 0) return 0
  if (a === b) return 1
  const distance = editDistance(a, b)
  const ratio = Math.max(0, 1 - distance / Math.max(a.length, b.length))
  const shorter = a.length <= b.length ? a : b
  const longer = a.length <= b.length ? b : a
  if (shorter.length >= 2 && longer.includes(shorter)) return Math.max(ratio, 0.7)
  return ratio
}

/**
 * 判断宿主给出的建议是否「被采用」。
 * 阈值 0.55：Typo/补一个词算采用；整句改写算未采用。
 */
export const ADOPT_THRESHOLD = 0.55

/** 语言判定：CJK 字符占比。 */
export function languageOf(text) {
  const chars = Array.from(String(text ?? ''))
  if (chars.length === 0) return 'unknown'
  let cjk = 0
  for (const char of chars) {
    const code = char.codePointAt(0)
    if (code >= 0x3400 && code <= 0x9fff) cjk += 1
  }
  const ratio = cjk / chars.length
  if (ratio > 0.6) return 'zh'
  if (ratio < 0.1) return 'en'
  return 'mixed'
}

/** 取开头词（前两个词，CJK 取前 2 个字），用于刻画用户的指令习惯。 */
export function leadingWordOf(text) {
  const value = String(text ?? '').trim()
  if (value === '') return undefined
  if (languageOf(value) === 'zh') {
    const chars = Array.from(value.replace(/^[\s，。！？、；：]+/, ''))
    return chars.slice(0, 2).join('')
  }
  const words = value.split(/\s+/).filter((word) => word !== '')
  return words.slice(0, 2).join(' ').toLowerCase()
}

/** 滑动平均：给新值一个固定权重，避免被早期单次观测绑死。 */
function blend(previous, next, weight = 0.12) {
  return previous + (next - previous) * weight
}

/** 去重后保留最近 keep 条。 */
function remember(list, value, keep) {
  const next = [value, ...list.filter((entry) => entry !== value)]
  return next.slice(0, keep)
}

/**
 * 记录一次观测。
 *
 * @param {object} profile - 现有画像（不会被修改）。
 * @param {object} observation - 观测事实。
 * @param {string} observation.suggestion - 宿主给出的建议。
 * @param {string} observation.finalText - 用户最终发出的文本（可为空表示没发出）。
 * @param {boolean} observation.rejected - 是否被显式拒绝（点重随）。
 * @param {number} observation.now - 时间戳（毫秒）。
 * @returns {object} 新的画像。
 */
export function recordObservation(profile, observation) {
  const base = profile ?? emptyProfile()
  const suggestion = clip(observation.suggestion)
  const finalText = clip(observation.finalText)
  const next = {
    ...base,
    version: PROFILE_VERSION,
    observations: base.observations + 1,
    updatedAt: observation.now,
    createdAt: base.createdAt === 0 ? observation.now : base.createdAt,
  }

  if (observation.rejected === true) {
    next.rejected = base.rejected + 1
    next.rejectedSamples = remember(base.rejectedSamples, suggestion, REJECTED_KEEP)
    return next
  }

  if (finalText.trim() === '') {
    // 没有后续输入：既不能算采纳，也不能算拒绝。
    return next
  }

  const score = similarity(suggestion, finalText)
  const adopted = score >= ADOPT_THRESHOLD
  next.accepted = base.accepted + (adopted ? 1 : 0)
  const chars = Array.from(finalText).length
  next.avgChars = base.avgChars === 0 ? chars : Math.round(blend(base.avgChars, chars))
  const language = languageOf(finalText)
  next.language = language === 'unknown' ? base.language : language

  if (adopted) {
    next.acceptedSamples = remember(base.acceptedSamples, suggestion, ACCEPTED_KEEP)
    // 采纳但有小改动：用户的措辞更值得学。
    if (score < 0.95) {
      const word = leadingWordOf(finalText)
      if (word !== undefined && word !== '') next.leadingWords = remember(base.leadingWords, word, LEADING_KEEP)
    }
  } else {
    next.rejected = base.rejected + 1
    next.rejectedSamples = remember(base.rejectedSamples, suggestion, REJECTED_KEEP)
    const word = leadingWordOf(finalText)
    if (word !== undefined && word !== '') next.leadingWords = remember(base.leadingWords, word, LEADING_KEEP)
  }
  return next
}

/**
 * 把画像渲染成给模型看的一小段文字（最多 12 行）。
 * 没有足够样本时返回空串：宁可不说，也不要编造「这个人喜欢长句」。
 */
export function describeProfile(profile) {
  if (profile === null || profile === undefined) return ''
  const observations = Number(profile.observations ?? 0)
  if (observations < 3) return ''
  const accepted = Number(profile.accepted ?? 0)
  const rejected = Number(profile.rejected ?? 0)
  const decided = accepted + rejected
  const lines = []
  if (decided > 0) {
    const rate = Math.round((accepted / decided) * 100)
    lines.push('- Suggestion acceptance rate: ' + String(rate) + '% of ' + String(decided) + ' judged suggestions.')
    if (rate >= 65) lines.push('- This user accepts most suggestions: keep predicting the obvious next step confidently.')
    if (rate <= 30) lines.push('- This user rarely accepts suggestions as written: prefer the user\'s own phrasing and be conservative.')
  }
  const avg = Number(profile.avgChars ?? 0)
  if (avg > 0) {
    lines.push('- The user\'s own messages average about ' + String(avg) + ' characters.')
    if (avg <= 24) lines.push('- They write very short messages: stay under roughly 12 characters.')
    else if (avg >= 90) lines.push('- They write longer messages: a full clause is welcome, still one line.')
  }
  if (profile.language === 'zh') lines.push('- They write in Chinese; answer in Chinese.')
  else if (profile.language === 'en') lines.push('- They write in English; answer in English.')
  const leading = Array.isArray(profile.leadingWords) ? profile.leadingWords.slice(0, 8) : []
  if (leading.length > 0) lines.push('- Words they tend to start with: ' + leading.join(', ') + '.')
  return lines.join('\n')
}

/** 最近被采纳的建议，用作少样本示例（最多 5 条，去空去重）。 */
export function recentAccepted(profile, limit = 5) {
  if (profile === null || profile === undefined || !Array.isArray(profile.acceptedSamples)) return []
  const seen = new Set()
  const out = []
  for (const sample of profile.acceptedSamples) {
    const text = String(sample ?? '').trim()
    if (text === '' || seen.has(text)) continue
    seen.add(text)
    out.push(text)
    if (out.length >= limit) break
  }
  return out
}

