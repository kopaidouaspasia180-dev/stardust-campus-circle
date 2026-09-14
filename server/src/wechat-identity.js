function clean(value) {
  return String(value || "").trim()
}

export function createWechatIdentityService({appid, appSecret, fetchImpl = globalThis.fetch} = {}) {
  return {
    configured: Boolean(appid && appSecret),
    async resolve(code) {
      const oneTimeCode = clean(code)
      if (!oneTimeCode) throw Object.assign(new Error("微信登录凭证缺失，请重试"), {status: 400})
      if (!appid || !appSecret) throw Object.assign(new Error("微信登录尚未配置"), {status: 503})

      const url = new URL("https://api.weixin.qq.com/sns/jscode2session")
      url.searchParams.set("appid", appid)
      url.searchParams.set("secret", appSecret)
      url.searchParams.set("js_code", oneTimeCode)
      url.searchParams.set("grant_type", "authorization_code")
      const remote = await fetchImpl(url, {signal: AbortSignal.timeout(8000)})
      const payload = await remote.json()
      if (!remote.ok || !payload.openid) {
        console.warn("wechat login failed", {errcode: payload.errcode, errmsg: payload.errmsg})
        throw Object.assign(new Error("微信登录失败，请重新打开小程序"), {status: 401})
      }
      return {openid: clean(payload.openid), sessionKey: clean(payload.session_key), unionid: clean(payload.unionid)}
    }
  }
}
