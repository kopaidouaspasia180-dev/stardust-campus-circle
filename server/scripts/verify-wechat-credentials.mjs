import fs from "node:fs"
import path from "node:path"
import process from "node:process"
import dotenv from "dotenv"

const args = process.argv.slice(2)
const envFlag = args.indexOf("--env")
const envPath = path.resolve(envFlag >= 0 && args[envFlag + 1] ? args[envFlag + 1] : process.env.ENV_FILE || ".env")

if (!fs.existsSync(envPath)) {
  console.error(`WeChat credential verification failed: environment file not found (${envPath})`)
  process.exit(1)
}

const env = dotenv.parse(fs.readFileSync(envPath, "utf8"))
const appId = String(env.WECHAT_APPID || "").trim()
const appSecret = String(env.WECHAT_APPSECRET || "").trim()
const placeholder = value => !value || /change-me|replace-with|touristappid|your[-_ ]/i.test(value)
const maskedAppId = value => value.length <= 4 ? "****" : `${value.slice(0, 2)}…${value.slice(-4)}`

if (placeholder(appId) || placeholder(appSecret)) {
  console.error("WeChat credential verification failed: WECHAT_APPID and WECHAT_APPSECRET must be configured")
  process.exit(1)
}

const endpoint = new URL("https://api.weixin.qq.com/cgi-bin/token")
endpoint.searchParams.set("grant_type", "client_credential")
endpoint.searchParams.set("appid", appId)
endpoint.searchParams.set("secret", appSecret)

try {
  const response = await fetch(endpoint, {signal: AbortSignal.timeout(10_000)})
  const raw = await response.text()
  let payload = {}
  try {
    payload = raw ? JSON.parse(raw) : {}
  } catch {
    throw new Error(`微信接口返回了无法识别的响应（HTTP ${response.status}）`)
  }
  if (!response.ok || !payload.access_token) {
    const providerMessage = payload.errcode ? `微信返回 ${payload.errcode}${payload.errmsg ? `：${payload.errmsg}` : ""}` : `微信接口 HTTP ${response.status}`
    throw new Error(providerMessage)
  }
  // Deliberately do not print, write, or retain the returned access token.
  console.log(`WeChat credential verification passed for ${maskedAppId(appId)}.`)
} catch (error) {
  console.error(`WeChat credential verification failed for ${maskedAppId(appId)}: ${error.message}`)
  process.exit(1)
}
