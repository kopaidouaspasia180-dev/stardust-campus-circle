const TOKEN_ENDPOINT = "https://api.weixin.qq.com/cgi-bin/token"
const TEXT_CHECK_ENDPOINT = "https://api.weixin.qq.com/wxa/msg_sec_check"

export class ContentSafetyError extends Error {
  constructor(message, {status = 503, code = "content_safety_unavailable", result = null} = {}) {
    super(message)
    this.name = "ContentSafetyError"
    this.status = status
    this.code = code
    this.result = result
  }
}

function normalizedMode(value) {
  const mode = String(value || "off").trim().toLowerCase()
  if (!["off", "observe", "required"].includes(mode)) {
    throw new Error("WECHAT_CONTENT_SAFETY_MODE must be off, observe or required")
  }
  return mode
}

function providerError(message, payload) {
  const error = new ContentSafetyError(message)
  error.providerCode = Number(payload?.errcode || 0)
  return error
}

export function createWechatContentSafety({
  appid,
  appSecret,
  mode = "off",
  fetchImpl = fetch,
  now = () => Date.now()
} = {}) {
  const resolvedMode = normalizedMode(mode)
  const configured = Boolean(String(appid || "").trim() && String(appSecret || "").trim())
  let accessToken = ""
  let accessTokenExpiresAt = 0

  async function fetchAccessToken(force = false) {
    if (!configured) throw new ContentSafetyError("微信内容安全服务尚未配置")
    if (!force && accessToken && accessTokenExpiresAt > now() + 60_000) return accessToken
    const url = new URL(TOKEN_ENDPOINT)
    url.searchParams.set("grant_type", "client_credential")
    url.searchParams.set("appid", appid)
    url.searchParams.set("secret", appSecret)
    let remote
    try {
      remote = await fetchImpl(url, {signal: AbortSignal.timeout(8_000)})
    } catch {
      throw new ContentSafetyError("微信内容安全服务暂时不可用，请稍后重试")
    }
    const payload = await remote.json().catch(() => ({}))
    if (!remote.ok || !payload.access_token) {
      throw providerError("微信内容安全凭据校验失败", payload)
    }
    accessToken = String(payload.access_token)
    accessTokenExpiresAt = now() + Math.max(300, Number(payload.expires_in || 7200)) * 1000
    return accessToken
  }

  async function callTextCheck({content, openid, scene}, retry = true) {
    const token = await fetchAccessToken()
    let remote
    try {
      remote = await fetchImpl(`${TEXT_CHECK_ENDPOINT}?access_token=${encodeURIComponent(token)}`, {
        method: "POST",
        headers: {"content-type": "application/json"},
        body: JSON.stringify({content, version: 2, scene, openid}),
        signal: AbortSignal.timeout(8_000)
      })
    } catch {
      throw new ContentSafetyError("微信内容安全服务暂时不可用，请稍后重试")
    }
    const payload = await remote.json().catch(() => ({}))
    if ([40014, 42001].includes(Number(payload.errcode)) && retry) {
      accessToken = ""
      accessTokenExpiresAt = 0
      await fetchAccessToken(true)
      return callTextCheck({content, openid, scene}, false)
    }
    if (!remote.ok || Number(payload.errcode || 0) !== 0 || !payload.result?.suggest) {
      throw providerError("微信内容安全检测失败，请稍后重试", payload)
    }
    return {
      checked: true,
      configured: true,
      mode: resolvedMode,
      suggest: String(payload.result.suggest),
      label: Number(payload.result.label || 0),
      traceId: String(payload.trace_id || "")
    }
  }

  async function checkText({content, openid, scene = 2} = {}) {
    const normalizedContent = String(content || "").trim().slice(0, 2500)
    if (!normalizedContent) return {checked: false, configured, mode: resolvedMode, suggest: "pass", label: 0, traceId: ""}
    if (resolvedMode === "off") return {checked: false, configured, mode: resolvedMode, suggest: "pass", label: 0, traceId: ""}
    if (!configured) {
      if (resolvedMode === "observe") return {checked: false, configured: false, mode: resolvedMode, suggest: "review", label: 0, traceId: ""}
      throw new ContentSafetyError("微信内容安全服务尚未配置")
    }
    if (!String(openid || "").trim()) {
      if (resolvedMode === "observe") return {checked: false, configured: true, mode: resolvedMode, suggest: "review", label: 0, traceId: ""}
      throw new ContentSafetyError("请重新登录后再提交内容", {status: 401, code: "wechat_login_required"})
    }
    try {
      return await callTextCheck({content: normalizedContent, openid: String(openid), scene: Number(scene) || 2})
    } catch (error) {
      if (resolvedMode === "observe") {
        return {checked: false, configured: true, mode: resolvedMode, suggest: "review", label: 0, traceId: "", providerError: error.message}
      }
      throw error
    }
  }

  return {
    mode: resolvedMode,
    configured,
    checkText
  }
}

export function assertContentAllowed(result, {allowReview = false} = {}) {
  if (!result || result.suggest === "pass" || (allowReview && result.suggest === "review")) return result
  throw new ContentSafetyError(
    result.suggest === "risky" ? "内容可能违反社区规范，请修改后重试" : "内容需要修改后再提交",
    {status: 422, code: "content_safety_rejected", result}
  )
}
