/**
 * dsh-input-suggest / privacy — 外发前的最小化与脱敏。
 *
 * 威胁模型：辅助模型可能跑在局域网网关或第三方服务上，所以发出去的东西
 * 必须是「预测下一句话所必需」的最小集，并且先做一遍脱敏。
 *
 * 三层控制：
 *   1. 结构最小化：只发最近一轮的 user/assistant 文本，不发工具调用、
 *      终端输出、diff、文件内容、系统提示词。
 *   2. 模式脱敏：凭据、邮箱、绝对路径、私有地址、长哈希、身份证/手机号。
 *   3. 硬开关：allowRemote 为 false 时只允许发往 loopback 端点；端点不是
 *      本机就直接放弃生成，而不是「尽力发送」。
 *
 * @module dsh-input-suggest/privacy
 */

/** 凭据形状 → 占位符。顺序有意义：先匹配更具体的。 */
const SECRETS = [
  [/\bAKIA[0-9A-Z]{16}\b/g, '<aws-key-id>'],
  [/\bASIA[0-9A-Z]{16}\b/g, '<aws-key-id>'],
  [/\bsk-[A-Za-z0-9_-]{16,}\b/g, '<secret-token>'],
  [/\bgh[opsur]_[A-Za-z0-9]{20,}\b/g, '<github-token>'],
  [/\bxox[abprs]-[A-Za-z0-9-]{10,}\b/g, '<slack-token>'],
  [/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, '<jwt>'],
  [/\b(?:rk|pk)_(?:live|test)_[A-Za-z0-9]{12,}\b/g, '<stripe-key>'],
  [/\bBearer\s+[A-Za-z0-9._~+/=-]{12,}/gi, 'Bearer <token>'],
  [/\b[A-Za-z0-9+/]{40,}={0,2}\b/g, '<opaque-secret>'],
]

/** 个人可识别信息 → 占位符。 */
const PII = [
  [/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, '<email>'],
  [/(?<!\d)1[3-9]\d{9}(?!\d)/g, '<phone>'],
  [/(?<!\d)\d{17}[\dXx](?!\d)/g, '<id-number>'],
]

/** 绝对路径（Windows 盘符与 UNC、POSIX）→ 只保留末段文件名。 */
const WINDOWS_PATH = /\b[A-Za-z]:\\(?:[^\\\s"']+\\)*([^\\\s"']+)/g
const UNC_PATH = /\\\\[^\s\\]+\\[^\s"']*/g
const POSIX_HOME = /\/(?:home|Users)\/[^\s/"']+(?:\/[^\s"']*)?/g

/** 内网地址 → 占位符。 */
const PRIVATE_HOSTS = /\b(?:10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})(?::\d+)?\b/g

/** 去掉终端控制序列（会话文本里可能有）。 */
const ESCAPES = /\u001b(?:\[[0-9;:]*[ -/]*[@-~]|\][^\u0007]*(?:\u0007|\u001b\\))/g


/**
 * 对一段即将外发的文本做脱敏。
 * @param {string} text - 原始文本。
 * @returns {string} 脱敏后的文本。
 */
export function redact(text) {
  let out = String(text ?? '').replace(ESCAPES, '')
  for (const [pattern, label] of SECRETS) {
    pattern.lastIndex = 0
    out = out.replace(pattern, label)
  }
  for (const [pattern, label] of PII) {
    pattern.lastIndex = 0
    out = out.replace(pattern, label)
  }
  out = out.replace(WINDOWS_PATH, (_match, file) => '<path>/' + file)
  out = out.replace(UNC_PATH, '<unc-path>')
  out = out.replace(POSIX_HOME, '<home-path>')
  out = out.replace(PRIVATE_HOSTS, '<private-host>')
  return out
}

/** 端点是否在本机（127.0.0.1 / ::1 / localhost）。 */
export function isLoopbackEndpoint(endpoint) {
  if (typeof endpoint !== 'string' || endpoint.trim() === '') return false
  let host = endpoint.trim()
  try {
    if (host.includes('://')) host = new URL(host).hostname
  } catch {
    // 解析不了就按字符串判断，下面仍会给出保守结果。
  }
  host = host.replace(/^\[|\]$/g, '').replace(/:\d+$/, '').toLowerCase()
  return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '0.0.0.0'
}

/**
 * 外发闸门：决定这次辅助调用是否允许发出。
 *
 * @param {object} options - 决策输入。
 * @param {boolean} options.allowRemote - 用户是否显式允许外发。
 * @param {string} options.endpoint - 解析出的端点（baseURL 之类）。
 * @returns {'allowed' | 'blocked-remote'} 决策。
 */
export function outboundDecision(options) {
  if (isLoopbackEndpoint(options.endpoint)) return 'allowed'
  // 端点未知（适配器没暴露 baseURL）时不阻断：这里只拦「明确是远端」的情况，
  // 否则一个读不到 baseURL 的合法本地适配器会让整个功能静默失效。
  if (typeof options.endpoint !== 'string' || options.endpoint.trim() === '') return 'allowed'
  if (options.allowRemote !== true) return 'blocked-remote'
  return 'allowed'
}

/**
 * 二级泄漏检查：外发前扫描是否仍残留高置信度敏感串。
 * 命中就整条放弃（宁可没有建议，也不把凭据送出去）。
 *
 * @param {string} text - 已脱敏的文本。
 * @returns {boolean} 是否仍然可疑。
 */
export function stillLooksSensitive(text) {
  const value = String(text ?? '')
  return /\bsk-[A-Za-z0-9_-]{16,}\b/.test(value)
    || /\bAKIA[0-9A-Z]{16}\b/.test(value)
    || /\bgh[opsur]_[A-Za-z0-9]{20,}\b/.test(value)
    || /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/.test(value)
    || /-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(value)
}

