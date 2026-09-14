function clean(value) {
  return String(value || "").trim()
}

export function normalizeMainlandPhone(value) {
  const normalized = clean(value).replace(/[\s-]/g, "").replace(/^\+?86/, "")
  return /^1\d{10}$/.test(normalized) ? normalized : ""
}

export function maskPhone(value) {
  const phone = normalizeMainlandPhone(value)
  return phone ? `${phone.slice(0, 3)}****${phone.slice(-4)}` : ""
}

export function createWechatPhoneService({appid, appSecret, fetchImpl = globalThis.fetch, now = () => Date.now()} = {}) {
  let token = ""
  let tokenExpiresAt = 0

  async function accessToken(forceRefresh = false) {
    if (!forceRefresh && token && tokenExpiresAt > now() + 60_000) return token
    if (!appid || !appSecret) throw Object.assign(new Error("微信手机号授权尚未配置"), {status: 503})
    const remote = await fetchImpl("https://api.weixin.qq.com/cgi-bin/stable_token", {
      method: "POST",
      headers: {"content-type": "application/json"},
      body: JSON.stringify({grant_type: "client_credential", appid, secret: appSecret, force_refresh: forceRefresh}),
      signal: AbortSignal.timeout(8000)
    })
    const payload = await remote.json()
    if (!remote.ok || !payload.access_token) {
      console.warn("wechat access token failed", {errcode: payload.errcode, errmsg: payload.errmsg})
      throw Object.assign(new Error("微信授权服务暂不可用"), {status: 503})
    }
    token = payload.access_token
    tokenExpiresAt = now() + Math.max(60, Number(payload.expires_in || 7200) - 300) * 1000
    return token
  }

  return {
    configured: Boolean(appid && appSecret),
    async resolvePhone(code) {
      const oneTimeCode = clean(code)
      if (!oneTimeCode) throw Object.assign(new Error("手机号授权凭证缺失，请重试"), {status: 400})
      const requestPhone = async (currentToken) => {
        const remote = await fetchImpl(`https://api.weixin.qq.com/wxa/business/getuserphonenumber?access_token=${encodeURIComponent(currentToken)}`, {
          method: "POST",
          headers: {"content-type": "application/json"},
          body: JSON.stringify({code: oneTimeCode}),
          signal: AbortSignal.timeout(8000)
        })
        return {remote, payload: await remote.json()}
      }
      let result = await requestPhone(await accessToken())
      if ([40001, 40014, 42001].includes(Number(result.payload.errcode))) {
        token = ""
        tokenExpiresAt = 0
        result = await requestPhone(await accessToken(true))
      }
      const {remote, payload} = result
      const phone = normalizeMainlandPhone(payload.phone_info?.purePhoneNumber || payload.phone_info?.phoneNumber)
      if (!remote.ok || Number(payload.errcode || 0) !== 0 || !phone) {
        console.warn("wechat phone resolve failed", {errcode: payload.errcode, errmsg: payload.errmsg})
        throw Object.assign(new Error("未能完成手机号授权，请重新点击绑定"), {status: 401})
      }
      return phone
    }
  }
}
