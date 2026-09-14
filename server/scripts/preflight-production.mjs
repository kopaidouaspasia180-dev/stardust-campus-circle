import fs from "node:fs"
import path from "node:path"
import process from "node:process"
import dotenv from "dotenv"

const args = process.argv.slice(2)
const envFlag = args.indexOf("--env")
const envPath = path.resolve(envFlag >= 0 && args[envFlag + 1] ? args[envFlag + 1] : process.env.ENV_FILE || ".env.production")
const checkFiles = args.includes("--check-files")

if (!fs.existsSync(envPath)) {
  console.error(`Production preflight failed: environment file not found (${envPath})`)
  process.exit(1)
}

const env = dotenv.parse(fs.readFileSync(envPath, "utf8"))
const errors = []
const warnings = []
const placeholder = value => !value || /change-me|replace-with|touristappid|your[-_ ]/i.test(value)
const required = name => {
  if (placeholder(env[name])) errors.push(`${name} is required and cannot use a placeholder`)
}
const httpsUrl = (name, requiredValue = false) => {
  const value = String(env[name] || "").trim()
  if (!value) {
    if (requiredValue) errors.push(`${name} is required`)
    return
  }
  for (const item of value.split(",").map(part => part.trim()).filter(Boolean)) {
    try {
      if (new URL(item).protocol !== "https:") errors.push(`${name} must contain HTTPS URL(s)`)
    } catch {
      errors.push(`${name} contains an invalid URL`)
    }
  }
}

for (const name of ["DATABASE_URL", "PII_ENCRYPTION_KEY", "IDENTITY_HASH_SECRET", "WECHAT_APPID", "WECHAT_APPSECRET", "CORS_ORIGINS", "UPLOAD_PUBLIC_ORIGIN"]) required(name)

if (!/^postgres(ql)?:\/\//i.test(String(env.DATABASE_URL || ""))) errors.push("DATABASE_URL must use a PostgreSQL connection URL")
if (String(env.ALLOW_DEVICE_AUTH || "").toLowerCase() === "true") errors.push("ALLOW_DEVICE_AUTH must be false in production")
if (String(env.ALLOW_LEGACY_OPS_TOKEN || "").toLowerCase() === "true") errors.push("ALLOW_LEGACY_OPS_TOKEN must be false in production")
if (env.ADMIN_BOOTSTRAP_TOKEN && placeholder(env.ADMIN_BOOTSTRAP_TOKEN)) errors.push("ADMIN_BOOTSTRAP_TOKEN must be removed or replaced before production")
httpsUrl("CORS_ORIGINS", true)
httpsUrl("UPLOAD_PUBLIC_ORIGIN", true)

const checkoutMode = String(env.CHECKOUT_MODE || "").trim().toLowerCase()
if (!["offline", "wechat"].includes(checkoutMode)) {
  errors.push("CHECKOUT_MODE must be exactly offline or wechat")
} else if (checkoutMode === "offline") {
  warnings.push("CHECKOUT_MODE=offline: orders will not collect online payment")
}

if (checkoutMode === "wechat") {
  for (const name of ["WECHATPAY_APPID", "WECHATPAY_MCHID", "WECHATPAY_CERT_SERIAL_NO", "WECHATPAY_PRIVATE_KEY_PATH", "WECHATPAY_API_V3_KEY", "WECHATPAY_NOTIFY_URL"]) required(name)
  const publicKeyMode = !placeholder(env.WECHATPAY_PUBLIC_KEY_PATH) && !placeholder(env.WECHATPAY_PUBLIC_KEY_ID)
  const platformCertMode = !placeholder(env.WECHATPAY_PLATFORM_CERT_PATH) && !placeholder(env.WECHATPAY_PLATFORM_CERT_SERIAL_NO)
  if (!publicKeyMode && !platformCertMode) errors.push("configure WECHATPAY_PUBLIC_KEY_PATH + WECHATPAY_PUBLIC_KEY_ID (recommended), or the legacy platform certificate pair")
  if (env.WECHATPAY_APPID && env.WECHAT_APPID && env.WECHATPAY_APPID !== env.WECHAT_APPID) errors.push("WECHATPAY_APPID must match WECHAT_APPID")
  if (env.WECHATPAY_API_V3_KEY && Buffer.byteLength(env.WECHATPAY_API_V3_KEY, "utf8") !== 32) errors.push("WECHATPAY_API_V3_KEY must be exactly 32 bytes")
  httpsUrl("WECHATPAY_NOTIFY_URL", true)
  httpsUrl("WECHATPAY_REFUND_NOTIFY_URL")
  if (checkFiles) {
    for (const name of ["WECHATPAY_PRIVATE_KEY_PATH", ...(publicKeyMode ? ["WECHATPAY_PUBLIC_KEY_PATH"] : ["WECHATPAY_PLATFORM_CERT_PATH"])]) {
      if (env[name] && !fs.existsSync(env[name])) errors.push(`${name} does not exist on this host`)
    }
  }
}

if (!env.NOTIFY_WEBHOOK_URL) warnings.push("NOTIFY_WEBHOOK_URL is not configured: notifications will remain in the outbox")
const contentSafetyMode = String(env.WECHAT_CONTENT_SAFETY_MODE || "").trim().toLowerCase()
if (contentSafetyMode !== "required") errors.push("WECHAT_CONTENT_SAFETY_MODE must be required before public production release")

for (const warning of warnings) console.warn(`Warning: ${warning}`)
if (errors.length) {
  console.error("Production preflight failed:")
  for (const error of errors) console.error(`- ${error}`)
  process.exit(1)
}

console.log(`Production preflight passed for ${envPath}${checkFiles ? " (including host certificate paths)" : ""}.`)
