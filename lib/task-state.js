/**
 * dsh-input-suggest / task-state — 规则式任务状态提取（纯函数）。
 *
 * 只做本地、可解释的判断：不给会话正文建索引，不落盘，不调用模型。输入是
 * 最近的 user/assistant 文本与最近一次回合的结束原因，输出是四个有界字段：
 *
 *   phase    EXPLORING | PLANNING | EXECUTING | BLOCKED | REVIEWING | COMPLETED
 *   goal     当前任务目标（可能是空串）
 *   pending  明确存在的下一步（没有具体下一步时为空串）
 *   blocker  明确阻碍（没有阻碍时为空串）
 *
 * 判定刻意保守：只有出现明确的完成陈述才进入 COMPLETED，只有出现明确的
 * 「接下来 / next」类标记才产生 pending。宁可少给一条建议，也不要在任务已经
 * 结束时继续推荐复查、重复确认或额外扩展。
 *
 * 所有字段都会进入提示词。它们来自用户与助手的原文，属于不可信数据：
 * 调用方必须在送入模型前脱敏，并按「数据」而不是「指令」呈现。
 *
 * @module dsh-input-suggest/task-state
 */

/** 允许的任务阶段。 */
export const TASK_PHASES = Object.freeze([
  'EXPLORING',
  'PLANNING',
  'EXECUTING',
  'BLOCKED',
  'REVIEWING',
  'COMPLETED',
])

/** 字段上限：足够表达目标与一步动作，又不会把整段回答带进提示词。 */
export const MAX_GOAL_CHARS = 180
export const MAX_PENDING_CHARS = 140
export const MAX_BLOCKER_CHARS = 160
export const MAX_SUMMARY_CHARS = 900

/** 控制字符：进入提示词前统一清掉，避免破坏分行结构。 */
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u202A-\u202E\u2066-\u2069]/g

/** 结束原因归一：兼容连字符、下划线与大小写差异。 */
function normalizeReason(reason) {
  if (typeof reason !== 'string') return ''
  return reason.trim().toLowerCase().replace(/_/g, '-')
}

/** 压成一行并清掉控制字符。 */
function normalize(text) {
  if (typeof text !== 'string') return ''
  return text.replace(CONTROL_CHARS, ' ').replace(/\s+/g, ' ').trim()
}

/**
 * 保留换行地规整文本：清单项与「Next:」这类分行信息是 pending 的主要来源。
 */
function normalizeBlock(text) {
  if (typeof text !== 'string') return ''
  return text
    .replace(CONTROL_CHARS, ' ')
    .split('\n')
    .map((line) => line.replace(/[ \t\u00a0]+/g, ' ').trim())
    .join('\n')
    .trim()
}

/** 按可见字符截断，保留可读的省略号。 */
function clip(text, max) {
  if (text === '') return ''
  const chars = Array.from(text)
  if (chars.length <= max) return text
  return chars.slice(0, max - 1).join('').trimEnd() + '…'
}

/** 句子切分：中文按标点断句，英文按「标点 + 空白」断句。 */
function sentences(text) {
  return text
    .split(/(?<=[。！？；])|(?<=[.!?])\s+|\n+/u)
    .map((part) => part.trim())
    .filter((part) => part !== '')
}

//#region 阻碍

const BLOCKER_CUES = [
  /\b(error|fail|fails|failed|failing|failure|cannot|can't|unable to|blocked by|missing|not installed|permission denied|timed out|conflict)\b/i,
  /(报错|错误|失败|无法|不能|缺少|缺失|阻塞|受阻|需要.{0,6}(权限|审批|安装)|冲突|超时|未安装)/u,
]

/** 一句里是否出现失败 / 受阻的表述。 */
function hasBlockerCue(text) {
  return BLOCKER_CUES.some((pattern) => pattern.test(text))
}

/** 找一句明确的阻碍陈述；排在后面的句子更接近当前状态。 */
function findBlockerSentence(text) {
  if (text === '') return ''
  const parts = sentences(text)
  for (let index = parts.length - 1; index >= 0; index -= 1) {
    if (hasBlockerCue(parts[index])) return clip(parts[index], MAX_BLOCKER_CHARS)
  }
  return ''
}

/** 结束原因本身表达的阻碍。 */
function blockerOfReason(kind) {
  switch (kind) {
    case 'blocked':
      return 'the turn is blocked and needs a decision or an external state change'
    case 'error':
      return 'the turn ended with an error before the task finished'
    case 'aborted':
    case 'cancelled':
    case 'canceled':
      return 'the turn was cancelled before the task finished'
    case 'max-tokens':
      return 'the answer hit the output limit before the task finished'
    case 'interrupted':
      return 'the turn was interrupted before the task finished'
    default:
      return ''
  }
}

//#endregion

//#region 完成

/**
 * 完成陈述。只认结果性表述：「测试通过」「已修复」「全部完成」而不是
 * 「完成度」「incomplete」这类词。
 */
const COMPLETION_CUES = [
  /\b(all|the) tests? (pass|passed|are passing|succeed|succeeded)\b/i,
  /\btests? (pass|passed)\b/i,
  /\bbuild (succeeds|succeeded|passes|passed)\b/i,
  /\b(verified|confirmed) (that )?(it|this|everything) works\b/i,
  /\b(the )?(task|work|change|implementation|feature) (is|was) (complete|completed|done|finished)\b/i,
  /\b(completed|finished) (the|this) (task|work|change|implementation)\b/i,
  /\bno (remaining|further) (work|changes|steps|issues)\b/i,
  /\bnothing (else )?(remains|left) to do\b/i,
  /(测试|用例)(全部|都)?(通过|执行通过|跑通)/u,
  /(已|全部)(完成|修复|实现|交付|改好|处理完)/u,
  /(修改|修复|实现|改造)(完成|已通过)/u,
  /(没有|无)(遗留|剩余|待办|未完成)/u,
]

/** 否定表述：「尚未完成」「not done」不算完成。 */
const COMPLETION_NEGATION = [
  /\b(not|isn't|is not|aren't|are not|incomplete|partially)\b[^.。!?！？]{0,24}\b(done|complete|completed|finished)\b/i,
  /\b(still|yet) (not|to be) (done|complete|completed|finished)\b/i,
  /(尚未|还没|还没有|未|没有)(完成|修复|实现|交付|通过)/u,
]

/** 未来时或计划口吻：说明的是打算做什么，不是已经做完。 */
const FUTURE_CUES = /\b(i will|we will|i'll|we'll|plan to|going to|let me)\b|(我将|我会|我们将会|打算|计划去)/iu

/** 该句是否构成一次完成陈述。 */
function isCompletionSentence(sentence) {
  if (sentence === '') return false
  if (COMPLETION_NEGATION.some((pattern) => pattern.test(sentence))) return false
  if (FUTURE_CUES.test(sentence)) return false
  return COMPLETION_CUES.some((pattern) => pattern.test(sentence))
}

/** 全文是否有明确的完成陈述。 */
function claimsCompletion(text) {
  if (text === '') return false
  return sentences(text).some((sentence) => isCompletionSentence(sentence))
}

//#endregion

//#region 下一步

const NEXT_STEP_PATTERNS = [
  /(?:^|[\s,;:，；：])(?:next|then|after that)\b[:\s,-]*(.+)$/i,
  /\b(?:remaining|still (?:need|needs|needed|left)|you still need(?: to)?|follow-?up)\b[:\s,-]*(.+)$/i,
  /(?:接下来|下一步|然后|之后|还需要|仍需|剩余|待办|尚未完成|未完成)[：:，,\s-]*(.+)$/u,
]

const OFFER_PATTERNS = [
  /\b(?:shall|should) i\s+(?:also\s+)?(.+)$/i,
  /\b(?:do you )?want me to\s+(.+)$/i,
  /\bwould you like me to\s+(.+)$/i,
  /\bi can\s+(?:also\s+)?(.+?)\s+if you (?:want|like)\b/i,
  /(?:需要我|要我|是否需要我|要不要我)(.+)$/u,
]

/** 去掉残余标点与客套尾巴。 */
function cleanStep(text) {
  let value = normalize(text)
    .replace(/^[:：,，;；\-–—\s]+/u, '')
    .replace(/\s*(please|now)\s*$/i, '')
    .replace(/[?？。.!！]+$/u, '')
    .trim()
  value = value.replace(/^(?:to\s+)/i, '')
  return clip(value, MAX_PENDING_CHARS)
}

/** 可选的加分项：完成之后不该因为它而继续推荐。 */
function isOptionalStep(text) {
  if (/^(you|we) (could|might|may|can)\b/i.test(text)) return true
  if (/\b(optionally|optional|if you (want|like)|if desired)\b/i.test(text)) return true
  return /(可选|如果你(想|需要)|如有需要|如果需要)/u.test(text)
}

/** 一句里是否给出具体的下一步。 */
function stepOf(sentence) {
  for (const pattern of NEXT_STEP_PATTERNS) {
    const match = pattern.exec(sentence)
    if (match === null || match[1] === undefined) continue
    const step = cleanStep(match[1])
    if (isConcreteStep(step)) return step
  }
  return ''
}

/** 一句里是否在征求下一步动作的许可。 */
function offerOf(sentence) {
  for (const pattern of OFFER_PATTERNS) {
    const match = pattern.exec(sentence)
    if (match === null || match[1] === undefined) continue
    const step = cleanStep(match[1])
    if (isConcreteStep(step)) return step
  }
  return ''
}

/** 至少要有字母或汉字，避免把标点、编号当成一步动作。 */
function isConcreteStep(text) {
  return Array.from(text).length >= 2 && /[a-z\u4e00-\u9fff]/iu.test(text)
}

/**
 * 找当前明确的下一步。
 *
 * 来源分三类：
 *   list   未勾选的清单项 / TODO
 *   marker 「接下来 / next / 剩余」等显式标记
 *   offer  「需要我……吗」这类征求许可的提议（可选加分项）
 */
function findPending(text) {
  if (text === '') return { text: '', source: '' }

  const lines = text.split('\n').map((line) => line.trim()).filter((line) => line !== '')
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const box = /^[-*+]\s*\[\s\]\s+(.+)$/u.exec(lines[index])
      ?? /^(?:TODO|Next steps?)[:：]\s*(.+)$/iu.exec(lines[index])
    if (box === null || box[1] === undefined) continue
    const step = cleanStep(box[1])
    if (isConcreteStep(step)) return { text: step, source: 'list' }
  }

  const parts = sentences(text)
  for (let index = parts.length - 1; index >= 0; index -= 1) {
    const offer = offerOf(parts[index])
    if (offer !== '') return { text: offer, source: 'offer' }
    const step = stepOf(parts[index])
    if (step !== '') return { text: step, source: isOptionalStep(step) ? 'offer' : 'marker' }
  }

  return { text: '', source: '' }
}

//#endregion

//#region 阶段

const REVIEW_PATTERNS = [
  /\b(review|re-?check|double[- ]check|verify|validate|inspect|audit|run the tests?|run tests)\b/i,
  /(复查|检查|核对|验收|验证|再看一下|看一下|看看|跑(一下)?测试|运行测试)/u,
]

/** 用户是否在要求检查或验收。 */
function asksForReview(text) {
  return text !== '' && REVIEW_PATTERNS.some((pattern) => pattern.test(text))
}

const WORK_CUES = [
  /\b(modified|updated|changed|added|removed|fixed|implemented|created|ran|executed|applied|patched|refactored|wrote)\b/i,
  /(已(?:经)?(?:修改|更新|新增|删除|修复|实现|运行|执行|生成|完成)|修改了|更新了|新增了|修复了|运行了|执行了|生成了)/u,
]

/** 助手是否报告了已经落地的动作。 */
function looksLikeWork(text) {
  if (text === '') return false
  return sentences(text).some((sentence) => {
    if (FUTURE_CUES.test(sentence)) return false
    return WORK_CUES.some((pattern) => pattern.test(sentence))
  })
}

const PLAN_CUES = [
  /\b(plan|steps?|approach|proposal|options?|i suggest|we (could|can) (start|begin)|shall i|should i|want me to|let me know)\b/i,
  /(方案|计划|步骤|思路|建议|可以考虑|是否|要不要|需要我|请你确认|确认后)/u,
]

/** 助手是否在给方案或等待确认。 */
function looksLikePlan(text) {
  return text !== '' && PLAN_CUES.some((pattern) => pattern.test(text))
}

const QUESTION_START = /^(how|what|why|when|where|which|who|is|are|does|do|did|should|would|will|can|could)\b/i
const CN_QUESTION_START = /^(为什么|为何|怎么|如何|是否|能否|有没有|哪些|什么|多少|哪)/u
const POLITE_REQUEST = /^(can|could|would|will) you\b/i

/** 用户是否在提问（而不是下指令）。 */
function isQuestion(text) {
  if (text === '') return false
  if (POLITE_REQUEST.test(text)) return false
  if (/[?？]\s*$/u.test(text)) return true
  return QUESTION_START.test(text) || CN_QUESTION_START.test(text)
}

//#endregion

//#region 目标

const LEAD_IN = /^(?:please|pls|kindly|could you|can you|would you|will you|i want you to|i need you to|帮我|帮忙|请|麻烦你|麻烦|能不能|能否|可以)/iu
const CONTINUATION_LEAD = /^(?:ok(?:ay)?[,，。.\s]+|好的?[，,。.\s]*|嗯[，,。.\s]*)?(?:please\s+)?(?:go ahead and\s+|just\s+)?(?:continue|carry on|go on|proceed|resume|keep going)\b|^(?:好的?[，,。.\s]*|嗯[，,。.\s]*)?(?:继续|接着|往下做|往下|接着做|继续做)/iu

/** 去掉开头的客套与请求外壳，留下任务本身。 */
function stripLeadIn(text) {
  return text.replace(LEAD_IN, '').trim()
}

/** 去掉开头的「继续」类提示词，留下续做的对象。 */
function stripContinuationCue(text) {
  return text
    .replace(CONTINUATION_LEAD, '')
    .replace(/^[，,。.：:\s-]+/u, '')
    .trim()
}

/** 从最近一条用户消息里取目标。 */
function extractGoal(userText) {
  const value = normalize(userText)
  if (value === '') return ''
  const stripped = stripLeadIn(value)
  if (stripped === '') return ''
  if (isContinuation(value)) {
    const rest = stripContinuationCue(stripped)
    if (Array.from(rest).length < 8) return ''
  }
  return clip(stripped, MAX_GOAL_CHARS)
}

//#endregion

//#region 续做识别

/** 否定式：明确表示不要继续。 */
const CONTINUATION_NEGATION = [
  /\b(do not|don't|dont|never|stop|cancel|quit)\b[^.!?。！？]{0,40}\b(continue|proceed|resume|carry on|keep going)\b/i,
  /(不要|不用|别|停止|取消|算了)[^。！？!?]{0,20}(继续|接着|往下|执行)/u,
  /(继续|接着)(之前|前先)/u,
]

/** 明确指向上一轮方案 / 任务的说法。 */
const CONTINUATION_REFERENCE = [
  /\b(as (planned|agreed|discussed|decided)|same (plan|approach|way)|the (previous|prior|original) (plan|task|approach)|carry on with (the|that|this) (plan|task|work)|pick up where (we|you) left off|resume (the|that|this|our) (task|work|plan)|continue (the|that|this|our|with the) (task|work|plan|approach|implementation)|follow the (plan|same approach)|per the plan|according to the plan)\b/i,
  /(按|照|依|沿用|按照)(原|之前|刚才|已确认|既定|上面|前面|上次|原来|现有)(的)?(方案|计划|安排|思路|做法|步骤|路线|结论|要求|设置|配置)/u,
  /(继续|接着)(刚才|之前|原来|上面|前面)的?(方案|计划|安排|思路|做法|步骤)/u,
  /(按计划|照计划|按原计划)/u,
]

/**
 * 最近一条用户消息是否只是在明确续做上一轮的事情。
 *
 * 只认两种信号：指向上一轮方案 / 任务的明确说法，或以「继续 / continue」类
 * 动词开头的短句。否定式（「不要继续」）、超过 60 个字符的新指令、以及单纯
 * 询问「继续吗？」都不算，避免把新任务误挂到旧目标上。
 *
 * @param {string} text - 用户最近一条消息。
 * @returns {boolean}
 */
export function isContinuation(text) {
  const value = normalize(text).toLowerCase()
  if (value === '') return false
  if (CONTINUATION_NEGATION.some((pattern) => pattern.test(value))) return false
  // 续做是短句；长指令即使开头说「继续」，也已经是在追加新任务。
  if (Array.from(value).length > 60) return false
  if (CONTINUATION_REFERENCE.some((pattern) => pattern.test(value))) return true
  // 纯问句「继续吗？」是在确认，不是已经决定续做。
  if (/[?？]$/u.test(value)) return false
  return CONTINUATION_LEAD.test(value)
}

//#endregion

/**
 * 从最近几轮文本推导任务状态。
 *
 * @param {Array<{role: string, text: string}>} pairs - 按时间顺序的最近 user/assistant 文本。
 * @param {string} reason - 最近一次回合的结束原因（completed / blocked / error /
 *   aborted / cancelled / max-tokens / interrupted / forked 等）。
 * @returns {{phase: string, goal: string, pending: string, blocker: string}}
 */
export function deriveTaskState(pairs, reason) {
  const list = Array.isArray(pairs) ? pairs : []
  let lastUser = ''
  let lastAssistant = ''
  for (const pair of list) {
    if (pair === null || typeof pair !== 'object') continue
    if (pair.role === 'user') {
      const text = normalize(pair.text)
      if (text !== '') {
        lastUser = text
        lastAssistant = ''
      }
      continue
    }
    if (pair.role === 'assistant') {
      // 助手文本保留换行：清单与分行标记决定 pending。
      const block = normalizeBlock(pair.text)
      if (block !== '') lastAssistant = block
    }
  }

  // 长回复保留开头摘要和结尾的完成、阻塞或待办信息。
  const analysis = lastAssistant.length <= 2000 ? lastAssistant : lastAssistant.slice(0, 800) + '\n…\n' + lastAssistant.slice(-1200)
  const kind = normalizeReason(reason)

  const goal = extractGoal(lastUser)
  const pendingInfo = findPending(analysis)
  const completed = claimsCompletion(analysis)
  const blockerSentence = findBlockerSentence(analysis)
  const stopped = blockerOfReason(kind) !== ''
  const hardPending = pendingInfo.text !== '' && pendingInfo.source !== 'offer'

  let phase
  if (stopped) {
    phase = 'BLOCKED'
  } else if (hardPending) {
    phase = 'EXECUTING'
  } else if (asksForReview(lastUser) && !completed) {
    phase = 'REVIEWING'
  } else if (completed) {
    phase = 'COMPLETED'
  } else if (blockerSentence !== '') {
    phase = 'BLOCKED'
  } else if (looksLikeWork(analysis)) {
    phase = 'EXECUTING'
  } else if (looksLikePlan(analysis)) {
    phase = 'PLANNING'
  } else if (lastUser === '') {
    phase = 'EXPLORING'
  } else {
    phase = isQuestion(lastUser) ? 'EXPLORING' : 'PLANNING'
  }

  // 完成的会话不再携带下一步：这正是「静默」的依据。
  let pending = phase === 'COMPLETED' ? '' : pendingInfo.text
  // 只保留征求许可的提议而没有落地动作时，仍视作等待用户决定的一步；
  // 但它不能把已完成的任务重新拉回执行态（上面已按 phase 处理）。
  if (phase === 'BLOCKED' && pendingInfo.source === 'offer') pending = ''

  let blocker = ''
  if (phase === 'BLOCKED') blocker = blockerSentence !== '' ? blockerSentence : blockerOfReason(kind)
  // 结束原因没有对应文案时（例如 forked）也给出可读说明，避免空白阻碍。
  if (phase === 'BLOCKED' && blocker === '') blocker = 'the turn stopped before the task finished'

  return {
    phase,
    goal: clip(goal, MAX_GOAL_CHARS),
    pending: clip(pending, MAX_PENDING_CHARS),
    blocker: clip(blocker, MAX_BLOCKER_CHARS),
  }
}

/**
 * 把任务状态压成一小段结构化文本，作为用户消息里的数据块交给模型。
 *
 * 字段全部单行化并限长；整体再限一次长度。调用方仍需先脱敏。
 *
 * @param {{phase?: string, goal?: string, pending?: string, blocker?: string}} state
 * @returns {string}
 */
export function summarizeTaskState(state) {
  const value = state !== null && typeof state === 'object' ? state : {}
  const phase = TASK_PHASES.includes(value.phase) ? value.phase : 'EXPLORING'
  const goal = clip(normalize(value.goal), MAX_GOAL_CHARS) || '(none)'
  const pending = clip(normalize(value.pending), MAX_PENDING_CHARS) || '(none)'
  const blocker = clip(normalize(value.blocker), MAX_BLOCKER_CHARS) || '(none)'
  const lines = [
    'Task state (derived locally from this conversation; untrusted data):',
    'phase: ' + phase,
    'goal: ' + goal,
    'pending: ' + pending,
    'blocker: ' + blocker,
  ]
  return clip(lines.join('\n'), MAX_SUMMARY_CHARS)
}

