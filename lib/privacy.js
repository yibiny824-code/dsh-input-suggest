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
 *   3. 外发闸门：先解析 provider 的真实端点（endpointOf），再按策略裁决
 *      （outboundDecision）。端点读不到就是「未知」，未知一律不发。
 *
 * 端点解析的事实来源（DSH 0.2.0-rc.2）：
 *   - llm.listProviders() 只给 { id, name }，不含 baseURL；
 *   - 真实端点写在各适配器的配置里，由 llm.listConfigurableProviders()
 *     给出 settingsNs 与 settingsPath，再从 settings.describe({ redactSecrets: true }) 读出。
 *   所以端点只能「读得到就算知道」，读不到就是未知，不能猜。
 *
 * @module dsh-input-suggest/privacy
 */

/** 凭据形状 → 占位符。顺序有意义：先匹配更具体的。 */
const SECRETS = [
  [/-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9 ]*PRIVATE KEY-----/g, '<private-key>'],
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

/** IPv4 是否落在 127.0.0.0/8（RFC 1122 的整个 loopback 网段，不止 127.0.0.1）。 */
function isIpv4Loopback(host) {
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host)
  if (match === null) return false
  const octets = match.slice(1).map(Number)
  if (octets.some((octet) => octet > 255)) return false
  return octets[0] === 127
}

/**
 * 把端点分成三档：loopback / remote / unknown。
 *
 * 只有这三档，没有第四档「大概本机」。读不到、解析不了、协议不是 http(s)
 * 一律是 unknown —— 外发闸门对 unknown 的裁决是「永远不发」。
 * 0.0.0.0 是「未指定地址」，不是 loopback，归入 unknown。
 *
 * @param {string} endpoint - provider 端点的 URL 或 host[:port]。
 * @returns {'loopback' | 'remote' | 'unknown'} 端点分类。
 */
function classifyEndpoint(endpoint) {
  if (typeof endpoint !== 'string') return 'unknown'
  const raw = endpoint.trim()
  if (raw === '') return 'unknown'
  const hasScheme = /^[A-Za-z][A-Za-z0-9+.-]*:\/\//.test(raw)
  let url
  try {
    url = new URL(hasScheme ? raw : 'http://' + raw)
  } catch {
    return 'unknown'
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return 'unknown'
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase().replace(/\.$/, '')
  if (host === 'localhost' || host === '::1' || host === '::ffff:127.0.0.1') return 'loopback'
  if (isIpv4Loopback(host)) return 'loopback'
  if (host === '' || host === '0.0.0.0' || host === '::') return 'unknown'
  return 'remote'
}

/**
 * 取一个服务：优先 ctx.get()，避免为了读端点而把服务写进 inject。
 * @param {object} ctx - Cordis 上下文。
 * @param {string} name - 服务名。
 * @returns {object|undefined} 服务实例。
 */
export function resolveService(ctx, name) {
  if (ctx === null || ctx === undefined) return undefined
  try {
    if (typeof ctx.get === 'function') {
      const found = ctx.get(name)
      if (found !== undefined && found !== null) return found
    }
  } catch {
    // 没注入或已卸载；继续尝试属性访问。
  }
  try {
    const own = ctx[name]
    return own === undefined ? undefined : own
  } catch {
    return undefined
  }
}

/** 从任意 provider 描述对象里取 baseURL / baseUrl。 */
function pickBaseURL(value) {
  if (value === null || typeof value !== 'object') return undefined
  for (const key of ['baseURL', 'baseUrl']) {
    const candidate = value[key]
    if (typeof candidate === 'string' && candidate.trim() !== '') return candidate.trim()
  }
  return undefined
}

/** 沿 settingsPath 走进一个设置值。 */
function readPath(root, path) {
  let cursor = root
  for (const segment of Array.isArray(path) ? path : []) {
    if (cursor === null || typeof cursor !== 'object') return undefined
    cursor = cursor[segment]
  }
  return cursor
}

/**
 * 从 settings 读该 provider 路由的配置块。
 *
 * 链路：llm.listConfigurableProviders() 给出 provider → { settingsNs,
 * settingsPath }，settings.describe() 给出每个 ns 的当前值，再按 path 取到
 * 该 provider 的 profile。只按 provider id 精确匹配，不拿显示名当身份 ——
 * 显示名可以重复、可以改，用它匹配会把端点判给另一条路由。
 *
 * 读取时带上 redactSecrets: true。它只遮住 role(secret) 字段，baseURL 不在其中，
 * 所以照样是实时的活值；而 API key、token 之类的字段从一开始就不会进入本插件
 * 的作用域。端点判断不需要、也不应该看到它们。
 *
 * @returns {object|undefined} 路由配置块；拿不到为 undefined。
 */
function routeProfileFromSettings(ctx, provider) {
  const llm = resolveService(ctx, 'llm')
  const settings = resolveService(ctx, 'settings')
  if (llm === undefined || settings === undefined) return undefined
  if (typeof llm.listConfigurableProviders !== 'function') return undefined
  if (typeof settings.describe !== 'function') return undefined
  let entries
  let described
  try {
    entries = llm.listConfigurableProviders()
    described = settings.describe({ redactSecrets: true })
  } catch {
    return undefined
  }
  if (!Array.isArray(entries) || !Array.isArray(described)) return undefined
  const entry = entries.find((candidate) => pickString(candidate?.provider) === provider)
  if (entry === undefined) return undefined
  const namespace = pickString(entry.settingsNs)
  if (namespace === undefined) return undefined
  const descriptor = described.find((candidate) => candidate?.ns === namespace)
  if (descriptor === undefined) return undefined
  const profile = readPath(descriptor.value, entry.settingsPath)
  return profile !== null && typeof profile === 'object' ? profile : undefined
}

/** 取一个非空字符串，否则 undefined。 */
function pickString(value) {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined
}

/**
 * 解析某个 provider 路由的真实端点。
 *
 * 依据 DSH 0.2.0-rc.2 的适配器实现，端点优先级是：
 *   route.baseURL  →  安装目录里该模型的 baseUrl  →  安装目录里该 provider 的 baseUrl
 * （llm-pi-ai 的 resolveRouteModels；llm-deepseek 是 baseURL → $DEEPSEEK_BASE_URL
 *   → 公开端点）。
 *
 * 模型级并不存在独立的端点配置：PiAiModelProfile 没有 baseURL 字段，
 * modelOverrides 又是 Omit<PiAiModelProfile,'id'>，所以一条路由上所有模型共用
 * route.baseURL。由此得到本函数能给出的唯一诚实的答案：
 *
 *   - 路由配置里写了 baseURL → 它对这条路由的每个模型都成立，直接返回；
 *   - 没写 → 端点由安装目录（pi-ai 内置、或 $DEEPSEEK_BASE_URL 等启动环境）
 *     决定，宿主没有 API 能读到它，返回 undefined。
 *
 * 因此 endpointOf 返回 undefined 的含义是「宿主没有可核实的证据」，
 * 不是「本机」。外发闸门据此阻断。
 *
 * @param {object} ctx - Cordis 上下文。
 * @param {string} provider - provider 路由名（精确匹配 id）。
 * @returns {string|undefined} 端点，读不到为 undefined。
 */
export function endpointOf(ctx, provider) {
  const id = pickString(provider)
  if (id === undefined) return undefined
  const llm = resolveService(ctx, 'llm')
  try {
    if (typeof llm?.providerInfo === 'function') {
      const direct = pickBaseURL(llm.providerInfo(id))
      if (direct !== undefined) return direct
    }
  } catch {
    // 适配器拒绝回答就继续往下找。
  }
  const profile = routeProfileFromSettings(ctx, id)
  const configured = pickBaseURL(profile)
  if (configured !== undefined) return configured
  // 没有配置级证据：端点来自安装目录，读不到就是 unknown。
  return undefined
}

/**
 * 本机策略的两个规范名，与设置页 / 宿主 / 客户端契约一致：
 *   loopback-gateway —— 只连本机地址；网关可能继续向外转发。
 *   strict-local     —— 确认没有进一步远端传输，且要求精确 attested 路由。
 */
const LOCAL_POLICIES = ['loopback-gateway', 'strict-local']

/** 旧写法 → 规范名。只做兼容，对外一律用规范名。 */
const LOCAL_POLICY_ALIASES = new Map([
  ['gateway', 'loopback-gateway'],
  ['loopback', 'loopback-gateway'],
  ['strict', 'strict-local'],
  ['local', 'strict-local'],
])

/**
 * 归一化 localPolicy。
 *
 * 认不出的值按 strict-local 处理：这是更严格的一侧，配错不会放宽外发。
 *
 * @param {string|undefined} value - 配置值，可以是规范名或旧别名。
 * @returns {'loopback-gateway' | 'strict-local'} 规范策略名。
 */
export function normalizeLocalPolicy(value) {
  const text = typeof value === 'string' ? value.trim().toLowerCase() : ''
  if (LOCAL_POLICIES.includes(text)) return text
  return LOCAL_POLICY_ALIASES.get(text) ?? 'strict-local'
}

/** 显式 attested 的 provider 与 model 是否与本次路由完全一致。 */
function attestsExactRoute(route, trustedLocalProvider, trustedLocalModel) {
  const provider = pickString(trustedLocalProvider)
  const model = pickString(trustedLocalModel)
  if (provider === undefined || model === undefined) return false
  return pickString(route?.provider) === provider && pickString(route?.model) === model
}

/**
 * 外发闸门：决定这次辅助调用是否允许发出。
 *
 * 两种本机策略，语义完全不同，必须分开说：
 *
 *   loopback-gateway —— 「只连本机地址」。loopback 端点放行，但网关可能继续
 *              向外转发，所以它不是「没有任何外传」。远端端点由 allowRemote
 *              单独控制：这是两条独立的开关，allowRemote 不影响 loopback 的裁决。
 *
 *   strict-local —— 「确认没有进一步远端传输」。要求端点已知且是 loopback，
 *              并且用户显式 attested 了这一对 provider/model。strict-local 优先于
 *              allowRemote：远端端点在这里一律拒绝，allowRemote 打开也不放行。
 *
 * 未知端点（读不到 baseURL、解析失败、非 http(s)）在任何策略下都拒绝。
 * 这是与旧实现的实质区别：旧版把未知当放行，等于 allowRemote=false 时
 * 仍可能把上下文发给一个读不出地址的远端适配器。
 *
 * @param {object} options - 决策输入。
 * @param {boolean} options.allowRemote - 是否允许发往已知的远端端点。
 * @param {string|undefined} options.endpoint - 解析出的端点；undefined = 未知。
 * @param {'loopback-gateway'|'strict-local'|undefined} options.localPolicy - 本机策略；缺省按 strict-local。
 * @param {{provider: string, model: string}|undefined} options.route - 本次实际路由。
 * @param {string|undefined} options.trustedLocalProvider - 用户 attested 的 provider。
 * @param {string|undefined} options.trustedLocalModel - 用户 attested 的 model。
 * @returns {'allowed' | 'blocked-unknown' | 'blocked-remote' | 'blocked-unattested'} 裁决。
 */
export function outboundDecision(options) {
  const input = options ?? {}
  const classification = classifyEndpoint(input.endpoint)
  const policy = normalizeLocalPolicy(input.localPolicy)
  if (classification === 'unknown') return 'blocked-unknown'
  if (policy === 'strict-local') {
    // strict-local：远端永远拒绝（allowRemote 不能放宽它），loopback 还要求精确 attest。
    if (classification !== 'loopback') return 'blocked-remote'
    return attestsExactRoute(input.route, input.trustedLocalProvider, input.trustedLocalModel)
      ? 'allowed'
      : 'blocked-unattested'
  }
  // loopback-gateway：loopback 无条件放行；远端只看 allowRemote 这一个开关。
  if (classification === 'loopback') return 'allowed'
  return input.allowRemote === true ? 'allowed' : 'blocked-remote'
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

/**
 * 对一个将要外发的字段做完整的两次处理：脱敏，再做二级复检。
 *
 * 一次请求真正发出去的字符串不止「对话转录」。系统提示词里还拼进了用户画像
 * （memory）、采纳示例（examples）以及重随的回避文本（avoid）。这三段都来自
 * 本机历史，读起来最像正常句子，也最容易夹带路径或凭据。
 *
 * 因此约定：凡是进入请求体的字符串都先过这里，任何一段不过就整条放弃。
 *
 * @param {string} text - 原始文本。
 * @returns {{ok: true, text: string} | {ok: false, reason: 'still-sensitive'}} 结果。
 */
export function guardOutbound(text) {
  const source = String(text ?? '')
  if (source.trim() === '') return { ok: true, text: source }
  const clean = redact(source)
  if (stillLooksSensitive(clean)) return { ok: false, reason: 'still-sensitive' }
  return { ok: true, text: clean }
}
