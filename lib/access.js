/** 沿用 DSH rc.2 的 Host/Origin 和签名 Cookie 校验。宿主为单操作者，会话操作只接受该宿主的实时会话。 */

import { resolveService } from './privacy.js'

/** 网关可能给出的两种拒绝状态。 */
const ACCESS_REJECTIONS = [401, 403]

/**
 * 复核一个入站请求能否进入插件路由。
 *
 * @param {object} ctx - Cordis 上下文。
 * @param {Request} request - connection.fetch 交给路由的请求。
 * @returns {{ok: true} | {ok: false, status: 401|403}} 裁决。
 */
export function admitRequest(ctx, request) {
  const connection = resolveService(ctx, 'connection')
  if (connection === undefined || typeof connection.admit !== 'function') {
    // 没有可复核的网关（例如单测里的假 connection）：交给网关本层裁决。
    return { ok: true }
  }
  let admission
  try {
    admission = connection.admit(request)
  } catch {
    return { ok: false, status: 403 }
  }
  if (admission !== null && typeof admission === 'object' && ACCESS_REJECTIONS.includes(admission.rejection)) {
    return { ok: false, status: admission.rejection }
  }
  return admission?.peer ? { ok: true } : { ok: false, status: 403 }
}

/**
 * 把 sessionId 解析到一个本插件可用的会话。
 *
 * 只认「sessionId 是字符串、长度有界、无控制字符，且 ctx.sessions.get() 能
 * 取到」。取不到就返回 undefined —— 调用方应当回答空结果，而不是报错把
 * 会话 id 的存在性告诉调用方。
 *
 * @param {object} ctx - Cordis 上下文。
 * @param {unknown} sessionId - 请求体里的 sessionId。
 * @returns {object|undefined} 会话对象。
 */
export function resolveSession(ctx, sessionId) {
  const id = normalizeSessionId(sessionId)
  if (id === undefined) return undefined
  const sessions = resolveService(ctx, 'sessions')
  if (sessions === undefined || typeof sessions.get !== 'function') return undefined
  try {
    const session = sessions.get(id)
    return session === undefined || session === null ? undefined : session
  } catch {
    return undefined
  }
}

/**
 * 校验并归一化 sessionId 的线上形状。
 * @param {unknown} value - 请求体里的 sessionId。
 * @returns {string|undefined} 合法 id，或 undefined。
 */
export function normalizeSessionId(value) {
  if (typeof value !== 'string') return undefined
  if (value.length === 0 || value.length > 512) return undefined
  if (/[\u0000-\u001f]/u.test(value)) return undefined
  return value
}

/**
 * 生成路由的拒绝响应。401/403 都不回显请求内容。
 * @param {401|403} status - 拒绝状态码。
 * @returns {Response} 空响应。
 */
export function rejectionResponse(status) {
  return new Response(null, { status, headers: { 'cache-control': 'no-store' } })
}
