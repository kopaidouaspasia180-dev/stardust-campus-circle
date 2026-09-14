import "dotenv/config"
import crypto from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import cors from "cors"
import express from "express"
import helmet from "helmet"
import multer from "multer"
import pg from "pg"
import {createPiiCodec, hashIdentity} from "./security.js"
import {isExpectedWechatPayment, isExpectedWechatRefund} from "./payment-validation.js"
import {createScheduleRecognizer, normalizeScheduleItems} from "./schedule-ai.js"
import {buildHomeScheduleSummary} from "./home-summary.js"
import {createWeatherService} from "./weather.js"
import {decodeBase64Image, hasSupportedImageSignature, imageExtensionForMime} from "./upload-security.js"
import {assertContentAllowed, ContentSafetyError, createWechatContentSafety} from "./wechat-content-safety.js"
import {createWechatIdentityService} from "./wechat-identity.js"
import {createWechatPhoneService, maskPhone} from "./wechat-phone.js"
import {looksReadable, normalizeExpressArrival, verifyExpressWebhook} from "./express-sync.js"
import {createExpressNoticeRecognizer, parseExpressNotice} from "./express-notice.js"
import {maskStorePhone, normalizeStoreFulfillment, normalizeStoreOccasion} from "./store-order.js"
import {normalizeInspectionAppointment, normalizeVehicleDetails} from "./marketplace.js"
import {assertCommunityContentAllowed, COMMUNITY_POST_IMAGE_LIMIT} from "./community-policy.js"
import {canSendSocialMessage, normalizeProfileUpdate} from "./profile.js"

const {Pool, types: pgTypes} = pg
// PostgreSQL DATE values are calendar dates, not instants. Returning them as
// strings avoids an Asia/Shanghai date becoming the previous UTC day in JSON.
pgTypes.setTypeParser(1082, value => value)
const port = Number(process.env.PORT || 4310)
const host = process.env.HOST || "127.0.0.1"
const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) throw new Error("DATABASE_URL is required")
const sessionDays = Math.max(1, Math.min(30, Number(process.env.SESSION_TTL_DAYS || 14)))
const allowDeviceAuth = process.env.ALLOW_DEVICE_AUTH === "true"
const paymentPendingMinutes = Math.max(5, Math.min(60, Number(process.env.PAYMENT_PENDING_MINUTES || 15)))
const productionMode = process.env.NODE_ENV === "production"
const localAdminPreview = !productionMode && process.env.LOCAL_ADMIN_PREVIEW === "true"
const checkoutMode = String(process.env.CHECKOUT_MODE || (productionMode ? "" : "offline")).trim().toLowerCase()
const allowedCorsOrigins = new Set((process.env.CORS_ORIGINS || "https://stardust.sale").split(",").map(value => value.trim()).filter(Boolean))
const uploadPublicOrigins = new Set((process.env.UPLOAD_PUBLIC_ORIGIN || "https://stardust.sale").split(",").map(value => value.trim().replace(/\/$/, "")).filter(Boolean))
const deepseekApiBase = String(process.env.DEEPSEEK_API_BASE || "https://api.deepseek.com").trim().replace(/\/$/, "")
const deepseekApiKey = String(process.env.DEEPSEEK_API_KEY || "").trim()
const deepseekModel = String(process.env.DEEPSEEK_MODEL || "deepseek-v4-flash").trim()
const deepseekConfigured = Boolean(deepseekApiBase && deepseekApiKey && deepseekModel)
const contentSafety = createWechatContentSafety({
  appid: process.env.WECHAT_APPID,
  appSecret: process.env.WECHAT_APPSECRET,
  mode: process.env.WECHAT_CONTENT_SAFETY_MODE || (productionMode ? "required" : "off")
})
const piiCodec = createPiiCodec(process.env.PII_ENCRYPTION_KEY)
const identityHashSecret = process.env.IDENTITY_HASH_SECRET || (productionMode ? "" : "local-development-identity-secret")
if (productionMode && !piiCodec.configured) throw new Error("PII_ENCRYPTION_KEY is required in production")
if (productionMode && !identityHashSecret) throw new Error("IDENTITY_HASH_SECRET is required in production")
if (!["offline", "wechat"].includes(checkoutMode)) {
  throw new Error("CHECKOUT_MODE must be explicitly set to offline or wechat in production")
}

const pool = new Pool({connectionString: databaseUrl})
const uploadDir = process.env.UPLOAD_DIR || path.resolve("data/uploads")
fs.mkdirSync(uploadDir, {recursive: true})
const scheduleRecognizer = createScheduleRecognizer({
  deepseekApiBase,
  deepseekApiKey,
  deepseekModel,
  ocrApiUrl: process.env.DEEPSEEK_OCR_API_URL,
  ocrApiKey: process.env.DEEPSEEK_OCR_API_KEY,
  ocrModel: process.env.DEEPSEEK_OCR_MODEL,
  visionApiUrl: process.env.SCHEDULE_VISION_API_URL,
  visionApiKey: process.env.SCHEDULE_VISION_API_KEY,
  visionModel: process.env.SCHEDULE_VISION_MODEL
})
const weatherService = createWeatherService({
  apiHost: process.env.QWEATHER_API_HOST,
  apiKey: process.env.QWEATHER_API_KEY
})
const wechatIdentityService = createWechatIdentityService({appid: process.env.WECHAT_APPID, appSecret: process.env.WECHAT_APPSECRET})
const wechatPhoneService = createWechatPhoneService({appid: process.env.WECHAT_APPID, appSecret: process.env.WECHAT_APPSECRET})
const expressWebhookSecret = String(process.env.EXPRESS_WEBHOOK_SECRET || "").trim()
const expressProviderName = text(process.env.EXPRESS_PROVIDER_NAME || "学校快递驿站", 40)
const expressNoticeRecognizer = createExpressNoticeRecognizer({
  ocrApiUrl: process.env.DEEPSEEK_OCR_API_URL,
  ocrApiKey: process.env.DEEPSEEK_OCR_API_KEY,
  ocrModel: process.env.DEEPSEEK_OCR_MODEL
})

const app = express()
app.disable("x-powered-by")
if (process.env.TRUST_PROXY === "true") app.set("trust proxy", 1)
app.use(helmet({crossOriginResourcePolicy: {policy: "cross-origin"}}))
app.use(cors({
  origin(origin, callback) {
    const localOrigin = /^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(origin || "")
    if (!origin || allowedCorsOrigins.has(origin) || (!productionMode && localOrigin)) return callback(null, true)
    const error = new Error("origin not allowed")
    error.status = 403
    callback(error)
  }
}))
app.use(express.json({limit: "1mb", verify(request, _response, buffer) { request.rawBody = buffer.toString("utf8") }}))
app.use("/uploads", express.static(uploadDir, {maxAge: "7d", immutable: true}))

const storage = multer.diskStorage({
  destination: uploadDir,
  filename(_request, file, callback) {
    const ext = imageExtensionForMime(file.mimetype)
    if (!ext) return callback(new Error("unsupported image type"))
    callback(null, `${Date.now()}-${crypto.randomBytes(8).toString("hex")}${ext}`)
  }
})
const upload = multer({
  storage,
  limits: {fileSize: 5 * 1024 * 1024},
  fileFilter(_request, file, callback) {
    callback(null, ["image/jpeg", "image/png", "image/webp"].includes(file.mimetype))
  }
})

const asyncRoute = handler => (request, response, next) => Promise.resolve(handler(request, response, next)).catch(next)

const rateBuckets = new Map()
let rateLimitChecks = 0
function rateLimit(scope, max, windowMs) {
  return (request, response, next) => {
    const key = `${scope}:${request.ip || request.socket.remoteAddress || "unknown"}`
    const now = Date.now()
    if (++rateLimitChecks % 500 === 0 || rateBuckets.size > 10_000) {
      for (const [bucketKey, value] of rateBuckets) {
        if (value.resetAt <= now || rateBuckets.size > 10_000) rateBuckets.delete(bucketKey)
      }
    }
    const current = rateBuckets.get(key)
    const bucket = !current || current.resetAt <= now ? {count: 0, resetAt: now + windowMs} : current
    bucket.count += 1
    rateBuckets.set(key, bucket)
    if (bucket.count > max) {
      response.set("retry-after", String(Math.max(1, Math.ceil((bucket.resetAt - now) / 1000))))
      return response.status(429).json({error: "too many requests, please retry later"})
    }
    next()
  }
}

const hashToken = value => crypto.createHash("sha256").update(value).digest("hex")

async function createUserSession(client, userId) {
  const token = `cs_${crypto.randomBytes(32).toString("base64url")}`
  const expiresAt = new Date(Date.now() + sessionDays * 86400000)
  await client.query("insert into user_sessions(user_id,token_hash,expires_at) values($1,$2,$3)", [userId, hashToken(token), expiresAt])
  return {token, expiresAt}
}

function protectPii(value) {
  return piiCodec.encrypt(value)
}

function revealPii(value) {
  return piiCodec.decrypt(value)
}

async function checkUserText(platform, content, {allowReview = false, scene = 2} = {}) {
  const identity = await pool.query("select wechat_openid from users where id=$1", [platform.user.id])
  const openid = identity.rows[0]?.wechat_openid ? revealPii(identity.rows[0].wechat_openid) : ""
  const result = await contentSafety.checkText({content, openid, scene})
  assertContentAllowed(result, {allowReview})
  return result
}

function contentSafetyDetail(result) {
  return {
    checked: Boolean(result?.checked),
    suggest: result?.suggest || "unknown",
    label: Number(result?.label || 0),
    traceId: result?.traceId || ""
  }
}

function presentContact(order) {
  return {
    ...order,
    contact_name: revealPii(order.contact_name),
    contact_phone: revealPii(order.contact_phone),
    delivery_address: revealPii(order.delivery_address)
  }
}

function presentDelivery(delivery) {
  if (!delivery) return null
  return {...delivery, dropoff_address: revealPii(delivery.dropoff_address)}
}

function presentExpressPackage(item) {
  const pickupCode = revealPii(item.pickup_code_encrypted || item.pickup_code || "")
  const {pickup_code_encrypted: _protectedCode, ...safe} = item
  return {...safe, pickup_code: pickupCode}
}

function presentNumericId(record) {
  const id = Number(record?.id)
  return Number.isSafeInteger(id) ? {...record, id} : record
}

async function resolveTenantCampus(tenant, campus) {
  const [tenantResult, campusResult] = await Promise.all([
    pool.query("select slug,name,status from tenants where slug=$1 and status='active'", [tenant]),
    pool.query("select slug,name,address from campus_sites where tenant_slug=$1 and slug=$2 and status='active'", [tenant, campus])
  ])
  if (!tenantResult.rowCount) throw Object.assign(new Error("tenant not active"), {status: 404})
  if (!campusResult.rowCount) throw Object.assign(new Error("campus not active"), {status: 404})
  return {tenant: tenantResult.rows[0], campus: campusResult.rows[0]}
}

async function context(request, response, next) {
  const tenant = String(request.header("x-tenant-id") || "tangshan").trim()
  const campus = String(request.header("x-campus-id") || "").trim()
  const deviceId = String(request.header("x-device-id") || "").trim()
  const sessionToken = String(request.header("x-session-token") || "").trim()
  if (!/^[a-z0-9_-]{2,40}$/i.test(tenant)) return response.status(400).json({error: "invalid tenant"})
  if (!/^[a-z0-9_-]{2,40}$/i.test(campus)) return response.status(400).json({error: "campus selection required"})
  const scope = await resolveTenantCampus(tenant, campus)
  let user
  const remoteAddress = String(request.socket.remoteAddress || "")
  const localPreviewRequest = localAdminPreview && request.path.startsWith("/admin/") && /^(::1|::ffff:127\.0\.0\.1|127\.0\.0\.1)$/.test(remoteAddress)
  const bootstrapAdminRequest = request.path.startsWith("/admin/") && tokenMatches(request.header("x-admin-token"), process.env.ADMIN_BOOTSTRAP_TOKEN)
  if (bootstrapAdminRequest || localPreviewRequest) {
    const userResult = await pool.query(
      `insert into users(device_id,nickname,avatar) values($1,'平台管理员','管')
       on conflict(device_id) do update set nickname=excluded.nickname,avatar=excluded.avatar
       returning id,nickname,avatar`,
      [`${localPreviewRequest ? "admin-preview" : "admin-bootstrap"}:${tenant}`]
    )
    user = userResult.rows[0]
  } else if (sessionToken) {
    const sessionResult = await pool.query(
      `update user_sessions s set last_seen_at=now() from users u
       where s.token_hash=$1 and s.expires_at>now() and u.id=s.user_id
       returning u.id,u.nickname,u.avatar`,
      [hashToken(sessionToken)]
    )
    if (!sessionResult.rowCount) return response.status(401).json({error: "session expired, please sign in again"})
    user = sessionResult.rows[0]
  } else if (allowDeviceAuth && /^[a-z0-9_-]{8,100}$/i.test(deviceId)) {
    const userResult = await pool.query(
      "insert into users(device_id) values($1) on conflict(device_id) do update set device_id=excluded.device_id returning id,nickname,avatar",
      [deviceId]
    )
    user = userResult.rows[0]
  } else {
    return response.status(401).json({error: "wechat session required"})
  }
  const membership = await pool.query(
    `insert into user_campus_memberships(user_id,tenant_slug,campus_slug,status,last_seen_at)
     values($1,$2,$3,'active',now())
     on conflict(user_id,tenant_slug,campus_slug)
     do update set last_seen_at=now()
     returning status`,
    [user.id, tenant, campus]
  )
  if (membership.rows[0]?.status === "suspended") {
    return response.status(403).json({error: "当前账号已被暂停使用，请联系校区运营人员"})
  }
  request.platform = {tenant, tenantName: scope.tenant.name, campus, campusName: scope.campus.name, user, localAdminPreview: localPreviewRequest}
  next()
}

function tokenMatches(actual, expected) {
  if (!actual || !expected) return false
  const actualHash = Buffer.from(hashToken(String(actual)), "hex")
  const expectedHash = Buffer.from(hashToken(String(expected)), "hex")
  return actualHash.length === expectedHash.length && crypto.timingSafeEqual(actualHash, expectedHash)
}

const adminRoleSets = {
  school: new Set(["platform_admin", "school_admin"]),
  manage: new Set(["platform_admin", "school_admin", "campus_admin"]),
  content: new Set(["platform_admin", "school_admin", "campus_admin", "content_admin"]),
  finance: new Set(["platform_admin", "school_admin", "campus_admin", "finance_admin"]),
  audit: new Set(["platform_admin", "school_admin", "campus_admin", "content_admin", "finance_admin", "auditor"])
}

function requireAdminCapability(capability = "manage") {
  return async (request, response, next) => {
    try {
      const bootstrapToken = process.env.ADMIN_BOOTSTRAP_TOKEN
      if (request.platform.localAdminPreview || tokenMatches(request.header("x-admin-token"), bootstrapToken)) {
        request.adminAccess = {role: request.platform.localAdminPreview ? "local_preview" : "bootstrap", campus: request.platform.campus, capability}
        return next()
      }
      const allowed = adminRoleSets[capability] || adminRoleSets.manage
      const result = await pool.query(
        `select role,campus_slug from platform_admins
         where user_id=$1 and status='active' and tenant_slug=$2
           and (campus_slug is null or campus_slug=$3)
         order by case role when 'platform_admin' then 0 when 'school_admin' then 1 else 2 end
         limit 1`,
        [request.platform.user.id, request.platform.tenant, request.platform.campus]
      )
      const access = result.rows[0]
      if (!access || !allowed.has(access.role)) return response.status(403).json({error: "admin authorization required"})
      request.adminAccess = {role: access.role, campus: access.campus_slug, capability}
      next()
    } catch (error) {
      next(error)
    }
  }
}

const requireAdmin = requireAdminCapability("manage")
const requireSchoolAdmin = requireAdminCapability("school")
const requireContentAdmin = requireAdminCapability("content")
const requireFinanceAdmin = requireAdminCapability("finance")
const requireAuditAdmin = requireAdminCapability("audit")

function requireOpsRole(role) {
  return async (request, response, next) => {
    try {
      const headerName = role === "merchant" ? "x-merchant-id" : "x-courier-id"
      const subjectId = Number(request.header(headerName))
      if (!Number.isInteger(subjectId)) return response.status(400).json({error: `${role} id required`})
      const membership = role === "merchant"
        ? await pool.query(
          `select 1 from merchant_staff s join merchants m on m.id=s.merchant_id
           where s.merchant_id=$1 and s.user_id=$2 and s.status='active' and m.tenant_slug=$3 and m.campus_slug=$4 limit 1`,
          [subjectId, request.platform.user.id, request.platform.tenant, request.platform.campus]
        )
        : await pool.query(
          `select 1 from courier_accounts a join couriers c on c.id=a.courier_id
           where a.courier_id=$1 and a.user_id=$2 and a.status='active' and c.tenant_slug=$3 and c.campus_slug=$4 limit 1`,
          [subjectId, request.platform.user.id, request.platform.tenant, request.platform.campus]
        )
      if (membership.rowCount) return next()
      const legacyAllowed = process.env.ALLOW_LEGACY_OPS_TOKEN === "true"
      const legacyToken = request.header(`x-${role}-token`)
      const expected = role === "merchant" ? process.env.MERCHANT_TOKEN : process.env.RIDER_TOKEN
      if (legacyAllowed && tokenMatches(legacyToken, expected)) return next()
      return response.status(401).json({error: `${role} authorization required`})
    } catch (error) {
      next(error)
    }
  }
}

function text(value, max = 300) {
  return String(value || "").trim().slice(0, max)
}

function optionalTimestamp(value, label) {
  if (value === undefined || value === null || value === "") return null
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) throw Object.assign(new Error(`${label}时间无效`), {status: 400})
  return parsed.toISOString()
}

const rankingCategories = new Set(["food", "fun", "life"])
const builtinRankingLists = [
  {id: "food", title: "美食", description: "同学聚餐与校园周边餐饮", entryLabel: "地点"},
  {id: "fun", title: "玩乐", description: "周末散步、看展与城市游玩", entryLabel: "地点"},
  {id: "life", title: "生活", description: "自习、办事与校园生活便利地点", entryLabel: "地点"}
]
const communityChannels = new Set(["推荐", "日常", "吐槽", "二手", "互助", "活动", "兼职", "失物"])
const campusServiceTypes = new Set(["flowers", "fruit", "snacks"])
const expressPackageStatuses = new Set(["waiting", "picked"])

function rankingCategory(value) {
  const category = text(value, 20)
  return rankingCategories.has(category) ? category : ""
}

function uuid(value) {
  const candidate = text(value, 36).toLowerCase()
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(candidate) ? candidate : ""
}

function presentRankingList(item) {
  return {
    id: item.id,
    title: item.title,
    description: item.description,
    entryLabel: item.entry_label || item.entryLabel || "地点",
    coverUrl: item.cover_url || "",
    builtIn: Boolean(item.built_in),
    mine: Boolean(item.mine),
    status: item.status || "active",
    moderationNote: item.moderation_note || "",
    itemCount: Number(item.item_count || 0),
    createdAt: item.created_at || null
  }
}

function campusServiceType(value) {
  const serviceType = text(value, 30)
  return campusServiceTypes.has(serviceType) ? serviceType : ""
}

function expressPackageStatus(value, fallback = "") {
  const status = text(value, 20) || fallback
  return expressPackageStatuses.has(status) ? status : ""
}

function presentRankingPlace(item) {
  return {
    id: item.id,
    category: item.category,
    listId: item.ranking_list_id || item.category,
    listTitle: item.list_title || "",
    name: item.name,
    note: item.note,
    location: item.location,
    imageUrl: item.image_url || "",
    coverKey: item.cover_key || "",
    likes: Number(item.likes || 0),
    weeklyLikes: Number(item.weekly_likes || 0),
    favorites: Number(item.favorites || 0),
    comments: Number(item.comments || 0),
    liked: Boolean(item.liked),
    favorited: Boolean(item.favorited),
    mine: Boolean(item.mine),
    campusSlug: item.campus_slug || "",
    campusName: item.campus_name || "",
    status: item.status,
    moderationNote: item.moderation_note || "",
    studentSubmitted: item.source_type === "student",
    featured: item.source_type === "curated" && item.cover_key === "life-mocha-pro",
    referenceSource: item.reference_source || "",
    referenceRating: item.reference_rating == null ? null : Number(item.reference_rating),
    referenceCount: Number(item.reference_count || 0),
    referenceUrl: item.reference_url || "",
    createdAt: item.created_at
  }
}

function presentRankingComment(item) {
  return {
    id: item.id,
    content: item.content,
    mine: Boolean(item.mine),
    author: {
      publicId: item.public_id || "",
      nickname: item.nickname || "校园同学",
      avatar: item.avatar || "campus-avatar-1"
    },
    createdAt: item.created_at
  }
}

function trustedUploadUrl(value) {
  const candidate = text(value, 500)
  if (!candidate) return null
  const uploadPath = /^\/campus-circle\/api\/uploads\/[a-z0-9][a-z0-9._-]{0,140}$/i
  if (uploadPath.test(candidate)) return candidate
  try {
    const parsed = new URL(candidate)
    return uploadPublicOrigins.has(parsed.origin) && uploadPath.test(parsed.pathname) ? candidate : null
  } catch {
    return null
  }
}

function campusAnswerScore(question, keywords) {
  const lowered = question.toLowerCase()
  return String(keywords || "").split(/[\s,，、|]+/).reduce((score, keyword) => {
    const normalized = keyword.trim().toLowerCase()
    return normalized.length >= 2 && lowered.includes(normalized) ? score + normalized.length : score
  }, 0)
}

async function answerCampusQuestion(platform, question) {
  const candidates = await pool.query(
    `select id,keywords,answer,source_label,campus_slug from campus_faqs
     where tenant_slug=$1 and status='active' and (campus_slug=$2 or campus_slug is null)
     order by case when campus_slug=$2 then 0 else 1 end,updated_at desc limit 100`,
    [platform.tenant, platform.campus]
  )
  const matched = candidates.rows
    .map(item => ({...item, score: campusAnswerScore(question, item.keywords)}))
    .sort((left, right) => right.score - left.score)[0]
  if (matched?.score > 0) return {answer: matched.answer, source: matched.source_label, mode: "knowledge"}
  if (!deepseekConfigured) return {answer: "暂时没有找到可核验的校区答案。你可以查看对应服务入口，或联系校区运营方补充信息；重要校务请以学校官方通知为准。", source: "校园知识库", mode: "unavailable"}
  const provider = await fetch(`${deepseekApiBase}/chat/completions`, {
    method: "POST",
    headers: {"content-type": "application/json", authorization: `Bearer ${deepseekApiKey}`},
    body: JSON.stringify({
      model: deepseekModel,
      temperature: 0.2,
      max_tokens: 360,
      messages: [
        {role: "system", content: `你是${platform.tenantName}${platform.campusName}的校园助手。只给出谨慎、简短、中文回答；不编造校务、营业时间、联系方式或实时状态。没有可靠依据时明确建议以学校官方通知或当前服务页面为准。`},
        {role: "user", content: question}
      ]
    }),
    signal: AbortSignal.timeout(12_000)
  })
  const payload = await provider.json().catch(() => ({}))
  const answer = text(payload?.choices?.[0]?.message?.content, 1000)
  if (!provider.ok || !answer) throw Object.assign(new Error("智能问答暂不可用"), {status: 503})
  return {answer, source: "星尘校园助手", mode: "ai"}
}

function money(value) {
  const number = Number(value)
  if (!Number.isFinite(number) || number < 0 || number > 10000) throw Object.assign(new Error("invalid amount"), {status: 400})
  return Number(number.toFixed(2))
}

function cents(value) {
  const amount = Number(value)
  if (!Number.isFinite(amount) || amount < 0 || amount > 1000000) throw Object.assign(new Error("invalid amount"), {status: 400})
  return Math.round(amount * 100)
}

function shanghaiClock() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(new Date())
  return Object.fromEntries(parts.map(part => [part.type, part.value]))
}

function validateLunchDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw Object.assign(new Error("invalid service date"), {status: 400})
  const selected = new Date(`${value}T00:00:00+08:00`)
  if (Number.isNaN(selected.getTime())) throw Object.assign(new Error("invalid service date"), {status: 400})
  const clock = shanghaiClock()
  const todayText = `${clock.year}-${clock.month}-${clock.day}`
  const today = new Date(`${todayText}T00:00:00+08:00`)
  const dayOffset = Math.round((selected.getTime() - today.getTime()) / 86400000)
  if (dayOffset < 0 || dayOffset > 14) throw Object.assign(new Error("lunch date unavailable"), {status: 409})
  if (dayOffset === 0 && Number(clock.hour) * 60 + Number(clock.minute) >= 630) {
    throw Object.assign(new Error("today lunch ordering closed at 10:30"), {status: 409})
  }
}

async function audit(client, platform, action, resourceType, resourceId, detail = {}) {
  await client.query(
    "insert into audit_logs(tenant_slug,campus_slug,user_id,action,resource_type,resource_id,detail) values($1,$2,$3,$4,$5,$6,$7)",
    [platform.tenant, platform.campus, platform.user.id, action, resourceType, resourceId, detail]
  )
}

function orderNumber() {
  const stamp = new Date().toISOString().replace(/\D/g, "").slice(2, 14)
  return `CF${stamp}${crypto.randomInt(100000, 1000000)}`
}

function jobPostingOrderNumber() {
  const stamp = new Date().toISOString().replace(/\D/g, "").slice(2, 14)
  return `JP${stamp}${crypto.randomInt(100000, 1000000)}`
}

function serviceOrderNumber() {
  const stamp = new Date().toISOString().replace(/\D/g, "").slice(2, 14)
  return `CS${stamp}${crypto.randomInt(100000, 1000000)}`
}

function wechatPayConfigured() {
  const verificationKeyConfigured = Boolean(
    (process.env.WECHATPAY_PUBLIC_KEY_PATH && process.env.WECHATPAY_PUBLIC_KEY_ID) ||
    (process.env.WECHATPAY_PLATFORM_CERT_PATH && process.env.WECHATPAY_PLATFORM_CERT_SERIAL_NO)
  )
  return Boolean(process.env.WECHATPAY_APPID && process.env.WECHATPAY_MCHID && process.env.WECHATPAY_CERT_SERIAL_NO && process.env.WECHATPAY_PRIVATE_KEY_PATH && process.env.WECHATPAY_NOTIFY_URL && process.env.WECHATPAY_API_V3_KEY && verificationKeyConfigured)
}

if (checkoutMode === "wechat" && !wechatPayConfigured()) {
  throw new Error("CHECKOUT_MODE=wechat requires complete WeChat Pay configuration")
}
if (productionMode && (!process.env.WECHAT_APPID || !process.env.WECHAT_APPSECRET)) {
  throw new Error("WECHAT_APPID and WECHAT_APPSECRET are required in production")
}
if (checkoutMode === "wechat" && process.env.WECHAT_APPID && process.env.WECHAT_APPID !== process.env.WECHATPAY_APPID) {
  throw new Error("WECHAT_APPID and WECHATPAY_APPID must match for JSAPI payments")
}

function refundNumber() {
  const stamp = new Date().toISOString().replace(/\D/g, "").slice(2, 14)
  return `RF${stamp}${crypto.randomInt(100000, 1000000)}`
}

function wechatPayPrivateKey() {
  return fs.readFileSync(process.env.WECHATPAY_PRIVATE_KEY_PATH, "utf8")
}

function wechatPayVerificationKey() {
  return fs.readFileSync(process.env.WECHATPAY_PUBLIC_KEY_PATH || process.env.WECHATPAY_PLATFORM_CERT_PATH, "utf8")
}

function wechatPayVerificationSerial() {
  return process.env.WECHATPAY_PUBLIC_KEY_ID || process.env.WECHATPAY_PLATFORM_CERT_SERIAL_NO || ""
}

function wechatPaySign(message, key = wechatPayPrivateKey()) {
  const signer = crypto.createSign("RSA-SHA256")
  signer.update(message)
  signer.end()
  return signer.sign(key, "base64")
}

function wechatPayAuthorization(method, requestPath, body) {
  const timestamp = Math.floor(Date.now() / 1000).toString()
  const nonce = crypto.randomBytes(16).toString("hex")
  const message = `${method}\n${requestPath}\n${timestamp}\n${nonce}\n${body}\n`
  const signature = wechatPaySign(message)
  return {timestamp, nonce, authorization: `WECHATPAY2-SHA256-RSA2048 mchid="${process.env.WECHATPAY_MCHID}",nonce_str="${nonce}",timestamp="${timestamp}",serial_no="${process.env.WECHATPAY_CERT_SERIAL_NO}",signature="${signature}"`}
}

async function createWechatJsapiPayment({description, orderNo, amountCents, openid}) {
  const body = JSON.stringify({
    appid: process.env.WECHATPAY_APPID,
    mchid: process.env.WECHATPAY_MCHID,
    description: text(description, 127),
    out_trade_no: orderNo,
    notify_url: process.env.WECHATPAY_NOTIFY_URL,
    amount: {total: amountCents, currency: "CNY"},
    payer: {openid}
  })
  const requestPath = "/v3/pay/transactions/jsapi"
  const auth = wechatPayAuthorization("POST", requestPath, body)
  const provider = await fetch(`https://api.mch.weixin.qq.com${requestPath}`, {
    method: "POST",
    headers: {"content-type": "application/json", accept: "application/json", authorization: auth.authorization, "wechatpay-serial": wechatPayVerificationSerial()},
    body,
    signal: AbortSignal.timeout(10000)
  })
  const raw = await provider.text()
  let payload = {}
  try { payload = raw ? JSON.parse(raw) : {} } catch { payload = {error: "invalid provider response"} }
  const signatureValid = verifyWechatPayResponse(provider, raw)
  if (!provider.ok || !signatureValid || !payload.prepay_id) return {ok: false, requestPayload: JSON.parse(body), payload: signatureValid ? payload : {...payload, signatureError: "invalid WeChat Pay response signature"}}
  const timestamp = Math.floor(Date.now() / 1000).toString()
  const nonceStr = crypto.randomBytes(16).toString("hex")
  return {
    ok: true,
    requestPayload: JSON.parse(body),
    payload,
    paymentParams: {
      timeStamp: timestamp,
      nonceStr,
      package: `prepay_id=${payload.prepay_id}`,
      signType: "RSA",
      paySign: wechatPaySign(`${process.env.WECHATPAY_APPID}\n${timestamp}\n${nonceStr}\nprepay_id=${payload.prepay_id}\n`)
    }
  }
}

function decryptWechatPayResource(resource) {
  const key = Buffer.from(process.env.WECHATPAY_API_V3_KEY || "", "utf8")
  if (key.length !== 32) throw new Error("invalid WECHATPAY_API_V3_KEY")
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(resource.nonce, "utf8"))
  decipher.setAuthTag(Buffer.from(resource.ciphertext, "base64").subarray(-16))
  decipher.setAAD(Buffer.from(resource.associated_data || "", "utf8"))
  const encrypted = Buffer.from(resource.ciphertext, "base64")
  const plain = Buffer.concat([decipher.update(encrypted.subarray(0, -16)), decipher.final()])
  return JSON.parse(plain.toString("utf8"))
}

function verifyWechatPaySignedMessage({timestamp, nonce, signature, serial, rawBody}) {
  if (!timestamp || !nonce || !signature || !rawBody || serial !== wechatPayVerificationSerial()) return false
  const verifier = crypto.createVerify("RSA-SHA256")
  verifier.update(`${timestamp}\n${nonce}\n${rawBody}\n`)
  verifier.end()
  return verifier.verify(wechatPayVerificationKey(), signature, "base64")
}

function verifyWechatPayResponse(response, rawBody) {
  return verifyWechatPaySignedMessage({
    timestamp: String(response.headers.get("wechatpay-timestamp") || ""),
    nonce: String(response.headers.get("wechatpay-nonce") || ""),
    signature: String(response.headers.get("wechatpay-signature") || ""),
    serial: String(response.headers.get("wechatpay-serial") || ""),
    rawBody
  })
}

function verifyWechatPayCallback(request) {
  return verifyWechatPaySignedMessage({
    timestamp: String(request.header("wechatpay-timestamp") || ""),
    nonce: String(request.header("wechatpay-nonce") || ""),
    signature: String(request.header("wechatpay-signature") || ""),
    serial: String(request.header("wechatpay-serial") || ""),
    rawBody: request.rawBody
  })
}

async function recordOrderEvent(client, platform, orderId, actorType, actorRef, fromStatus, toStatus, note = "") {
  await client.query(
    `insert into order_events(tenant_slug,order_id,actor_type,actor_ref,from_status,to_status,note)
     values($1,$2,$3,$4,$5,$6,$7)`,
    [platform.tenant, orderId, actorType, String(actorRef || ""), fromStatus || null, toStatus, text(note, 200)]
  )
}

async function enqueueNotification(client, platform, orderId, recipientType, recipientRef, template, payload = {}) {
  await client.query(
    `insert into notification_outbox(tenant_slug,campus_slug,order_id,recipient_type,recipient_ref,template,payload)
     values($1,$2,$3,$4,$5,$6,$7)`,
    [platform.tenant, platform.campus, orderId, recipientType, String(recipientRef), template, payload]
  )
}

async function queuePaidOrderRefund(client, platform, order, reason) {
  if (order.payment_status !== "paid" || !order.payment_reference) return false
  const refund = await client.query(
    `insert into payment_refunds(tenant_slug,campus_slug,order_id,out_refund_no,transaction_id,amount_cents,reason)
     values($1,$2,$3,$4,$5,$6,$7) on conflict(order_id) do nothing returning id`,
    [platform.tenant, platform.campus, order.id, refundNumber(), order.payment_reference, order.total_amount_cents, text(reason, 120)]
  )
  if (!refund.rowCount) return false
  await client.query("update orders set payment_status='refund_pending' where id=$1 and payment_status='paid'", [order.id])
  await recordOrderEvent(client, platform, order.id, "payment", "refund_queue", order.status, order.status, "退款申请已提交")
  await enqueueNotification(client, platform, order.id, "customer", order.user_id, "refund_requested", {orderNo: order.order_no, amountCents: order.total_amount_cents})
  return true
}

async function queuePaidCampusServiceRefund(client, platform, order, reason) {
  if (order.payment_status !== "paid" || !order.payment_reference) return false
  const refund = await client.query(
    `insert into campus_service_refunds(order_id,out_refund_no,transaction_id,amount_cents,reason)
     values($1,$2,$3,$4,$5) on conflict(order_id) do nothing returning id`,
    [order.id, refundNumber(), order.payment_reference, order.total_amount_cents, text(reason, 120)]
  )
  if (!refund.rowCount) return false
  await client.query("update campus_service_orders set payment_status='refund_pending',updated_at=now() where id=$1 and payment_status='paid'", [order.id])
  await audit(client, platform, "refund_requested", "campus_service_order", order.id, {amountCents: order.total_amount_cents})
  return true
}

app.get("/health", asyncRoute(async (_request, response) => {
  await pool.query("select 1")
  response.json({ok: true, service: "stardust-campus-circle-api", version: "1.0.0"})
}))

app.get("/ready", asyncRoute(async (_request, response) => {
  await pool.query("select 1")
  response.json({
    ok: true,
    database: "ready",
    checkoutMode,
    wechatLoginConfigured: Boolean(process.env.WECHAT_APPID && process.env.WECHAT_APPSECRET),
    wechatPayConfigured: wechatPayConfigured(),
    contentSafetyMode: contentSafety.mode,
    contentSafetyConfigured: contentSafety.configured,
    piiEncryptionConfigured: piiCodec.configured,
    automaticWeatherConfigured: weatherService.configured,
    expressAutoSyncConfigured: Boolean(expressWebhookSecret),
    wechatPhoneBindingConfigured: wechatPhoneService.configured
  })
}))

app.post("/v1/auth/wechat", rateLimit("wechat-login", 20, 10 * 60_000), asyncRoute(async (request, response) => {
  const code = text(request.body?.code, 300)
  const guestMode = request.body?.guestMode === true
  const clientDeviceId = text(request.header("x-device-id"), 100)
  const tenant = text(request.header("x-tenant-id"), 40)
  const campus = text(request.header("x-campus-id"), 40)
  if (!code || !tenant || !campus) return response.status(400).json({error: "wechat code, tenant and campus required"})
  await resolveTenantCampus(tenant, campus)
  if (!process.env.WECHAT_APPID || !process.env.WECHAT_APPSECRET) {
    return response.status(503).json({error: "wechat login is not configured"})
  }
  const identity = await wechatIdentityService.resolve(code)
  const openidHash = hashIdentity(identity.openid, identityHashSecret)
  if (guestMode) {
    if (!/^[a-z0-9_-]{8,100}$/i.test(clientDeviceId)) return response.status(400).json({error: "guest device identity required"})
    const guestKey = `guest:${openidHash.slice(0, 20)}:${hashIdentity(clientDeviceId, identityHashSecret).slice(0, 20)}`
    const guestResult = await pool.query(
      `insert into users(device_id,nickname,avatar) values($1,'游客同学','campus-avatar-1')
       on conflict(device_id) do update set device_id=excluded.device_id
       returning id,nickname,avatar`,
      [guestKey]
    )
    const guestSession = await createUserSession(pool, guestResult.rows[0].id)
    return response.status(201).json({
      sessionToken: guestSession.token,
      expiresAt: guestSession.expiresAt.toISOString(),
      user: {...guestResult.rows[0], phoneVerified: false}
    })
  }
  const deviceKey = `wechat:${openidHash.slice(0, 48)}`
  const userResult = await pool.query(
    `insert into users(device_id,wechat_openid,wechat_openid_hash) values($1,$2,$3)
     on conflict(wechat_openid_hash) where wechat_openid_hash is not null do update set wechat_openid=excluded.wechat_openid
     returning id,nickname,avatar,public_id,profile_background,profile_bio,profile_interests,profile_gallery,
       (phone_verified_at is not null) phone_verified`,
    [deviceKey, protectPii(identity.openid), openidHash]
  )
  const session = await createUserSession(pool, userResult.rows[0].id)
  const user = userResult.rows[0]
  response.status(201).json({
    sessionToken: session.token,
    expiresAt: session.expiresAt.toISOString(),
    user: {
      id: user.id, nickname: user.nickname, avatar: user.avatar, publicId: user.public_id,
      profileBackground: user.profile_background || "", profileBio: user.profile_bio || "",
      profileInterests: user.profile_interests || [], profileGallery: user.profile_gallery || [],
      phoneVerified: Boolean(user.phone_verified)
    }
  })
}))

app.post("/v1/auth/phone", rateLimit("phone-login", 8, 10 * 60_000), asyncRoute(async (request, response) => {
  const tenant = text(request.header("x-tenant-id"), 40)
  const campus = text(request.header("x-campus-id"), 40)
  const sessionToken = text(request.header("x-session-token"), 200)
  const phoneCode = text(request.body?.code, 300)
  const wechatCode = text(request.body?.wechatCode, 300)
  if (!tenant || !campus || !sessionToken || !phoneCode || !wechatCode) return response.status(400).json({error: "手机号登录参数不完整"})
  await resolveTenantCampus(tenant, campus)
  const current = await pool.query(
    `select u.id,u.nickname,u.avatar,u.wechat_openid,u.wechat_openid_hash
     from user_sessions s join users u on u.id=s.user_id
     where s.token_hash=$1 and s.expires_at>now()`,
    [hashToken(sessionToken)]
  )
  if (!current.rowCount) return response.status(401).json({error: "登录状态已失效，请重新打开小程序"})
  const [phone, identity] = await Promise.all([
    wechatPhoneService.resolvePhone(phoneCode),
    wechatIdentityService.resolve(wechatCode)
  ])
  const phoneHash = hashIdentity(phone, identityHashSecret)
  const openidHash = hashIdentity(identity.openid, identityHashSecret)
  const client = await pool.connect()
  try {
    await client.query("begin")
    const currentUser = current.rows[0]
    const existing = await client.query(
      `select id,nickname,avatar,public_id,profile_background,profile_bio,profile_interests,profile_gallery
       from users where phone_hash=$1 for update`,
      [phoneHash]
    )
    const openidOwner = await client.query(
      "select id,phone_hash from users where wechat_openid_hash=$1 for update",
      [openidHash]
    )
    let account = currentUser
    if (!existing.rowCount) {
      const bound = await client.query(
        `update users set phone_encrypted=$1,phone_hash=$2,phone_verified_at=now()
         where id=$3 returning id,nickname,avatar,public_id,profile_background,profile_bio,profile_interests,profile_gallery`,
        [protectPii(phone), phoneHash, currentUser.id]
      )
      account = bound.rows[0]
    } else if (Number(existing.rows[0].id) !== Number(currentUser.id)) {
      account = existing.rows[0]
    } else {
      await client.query(
        "update users set phone_encrypted=$1,phone_verified_at=now() where id=$2",
        [protectPii(phone), currentUser.id]
      )
    }
    const identityOwner = openidOwner.rows[0]
    if (identityOwner && Number(identityOwner.id) !== Number(account.id)) {
      if (identityOwner.phone_hash && identityOwner.phone_hash !== phoneHash) {
        throw Object.assign(new Error("当前微信已绑定其他手机号，请使用原手机号登录"), {status: 409})
      }
      await client.query("update users set wechat_openid=null,wechat_openid_hash=null where id=$1", [identityOwner.id])
    }
    if (currentUser.wechat_openid_hash && Number(currentUser.id) !== Number(account.id)) {
      await client.query("update users set wechat_openid=null,wechat_openid_hash=null where id=$1", [currentUser.id])
    }
    const boundAccount = await client.query(
      `update users set device_id=$1,wechat_openid=$2,wechat_openid_hash=$3,phone_encrypted=$4,phone_hash=$5,phone_verified_at=now()
       where id=$6 returning id,nickname,avatar,public_id,profile_background,profile_bio,profile_interests,profile_gallery`,
      [`phone:${phoneHash.slice(0, 48)}`, protectPii(identity.openid), openidHash, protectPii(phone), phoneHash, account.id]
    )
    account = boundAccount.rows[0]
    await client.query("delete from user_sessions where token_hash=$1", [hashToken(sessionToken)])
    const session = await createUserSession(client, account.id)
    await client.query(
      `insert into user_campus_memberships(user_id,tenant_slug,campus_slug,status,last_seen_at)
       values($1,$2,$3,'active',now())
       on conflict(user_id,tenant_slug,campus_slug) do update set last_seen_at=now()`,
      [account.id, tenant, campus]
    )
    await client.query("commit")
    response.status(201).json({
      sessionToken: session.token,
      expiresAt: session.expiresAt.toISOString(),
      user: {
        id: account.id, nickname: account.nickname, avatar: account.avatar, publicId: account.public_id,
        profileBackground: account.profile_background || "", profileBio: account.profile_bio || "",
        profileInterests: account.profile_interests || [], profileGallery: account.profile_gallery || [],
        phoneVerified: true
      },
      phoneMasked: maskPhone(phone),
      returningAccount: existing.rowCount > 0
    })
  } catch (error) {
    await client.query("rollback")
    throw error
  } finally {
    client.release()
  }
}))

app.post("/v1/admin/auth/exchange", rateLimit("admin-login-exchange", 12, 10 * 60_000), asyncRoute(async (request, response) => {
  const tenant = text(request.header("x-tenant-id"), 40)
  const campus = text(request.header("x-campus-id"), 40)
  const code = text(request.body?.code, 20).replace(/\s+/g, "")
  if (!tenant || !campus || !/^\d{8}$/.test(code)) return response.status(400).json({error: "请输入小程序生成的 8 位员工登录码"})
  await resolveTenantCampus(tenant, campus)
  const client = await pool.connect()
  try {
    await client.query("begin")
    const result = await client.query(
      `select c.user_id,a.role,a.campus_slug
       from admin_login_codes c join platform_admins a on a.user_id=c.user_id and a.tenant_slug=c.tenant_slug
       where c.code_hash=$1 and c.tenant_slug=$2 and c.consumed_at is null and c.expires_at>now()
         and a.status='active' and (a.campus_slug is null or a.campus_slug=$3)
       for update of c`,
      [hashToken(code), tenant, campus]
    )
    if (!result.rowCount) {
      await client.query("rollback")
      return response.status(401).json({error: "登录码无效、已使用或已过期"})
    }
    await client.query("update admin_login_codes set consumed_at=now() where code_hash=$1", [hashToken(code)])
    const sessionToken = `cs_${crypto.randomBytes(32).toString("base64url")}`
    const expiresAt = new Date(Date.now() + sessionDays * 86400000)
    await client.query("insert into user_sessions(user_id,token_hash,expires_at) values($1,$2,$3)", [result.rows[0].user_id, hashToken(sessionToken), expiresAt])
    await client.query("commit")
    response.json({sessionToken, expiresAt: expiresAt.toISOString(), role: result.rows[0].role})
  } catch (error) {
    await client.query("rollback")
    throw error
  } finally {
    client.release()
  }
}))

app.post("/v1/payments/wechat/notify", rateLimit("payment-notify", 180, 60_000), asyncRoute(async (request, response) => {
  if (checkoutMode !== "wechat" || !wechatPayConfigured()) return response.status(404).json({error: "payment not configured"})
  if (!verifyWechatPayCallback(request)) return response.status(401).json({error: "invalid payment signature"})
  const paid = decryptWechatPayResource(request.body?.resource || {})
  if (paid.trade_state !== "SUCCESS" || !paid.out_trade_no || !paid.transaction_id) return response.json({code: "SUCCESS", message: "ignored"})
  const client = await pool.connect()
  try {
    await client.query("begin")
    const expected = await client.query("select * from orders where order_no=$1 for update", [paid.out_trade_no])
    if (!expected.rowCount) {
      const postingOrder = await client.query("select * from job_posting_orders where order_no=$1 for update", [paid.out_trade_no])
      if (!postingOrder.rowCount) {
        const serviceOrder = await client.query("select * from campus_service_orders where order_no=$1 for update", [paid.out_trade_no])
        if (!serviceOrder.rowCount) {
          await client.query("commit")
          return response.json({code: "SUCCESS", message: "ignored"})
        }
        const service = serviceOrder.rows[0]
        if (!isExpectedWechatPayment(paid, {order_no: service.order_no, total_amount_cents: service.total_amount_cents}, {mchid: process.env.WECHATPAY_MCHID, appid: process.env.WECHATPAY_APPID})) {
          await client.query("rollback")
          return response.status(400).json({error: "payment payload does not match campus service order"})
        }
        const updatedService = await client.query(
          `update campus_service_orders set status='submitted',payment_status='paid',payment_reference=$1,updated_at=now()
           where id=$2 and status='payment_pending' and payment_status='pending' returning *`,
          [paid.transaction_id, service.id]
        )
        if (updatedService.rowCount) {
          await client.query(
            `insert into campus_service_payment_attempts(order_id,status,provider_reference,amount_cents,response_payload)
             values($1,'paid',$2,$3,$4)`,
            [service.id, paid.transaction_id, service.total_amount_cents, paid]
          )
          const platform = {tenant: service.tenant_slug, campus: service.campus_slug, user: {id: service.user_id}}
          await audit(client, platform, "payment_succeeded", "campus_service_order", service.id, {transactionId: paid.transaction_id})
        }
        await client.query("commit")
        return response.json({code: "SUCCESS", message: "成功"})
      }
      const posting = postingOrder.rows[0]
      if (!isExpectedWechatPayment(paid, {order_no: posting.order_no, total_amount_cents: posting.amount_cents}, {mchid: process.env.WECHATPAY_MCHID, appid: process.env.WECHATPAY_APPID})) {
        await client.query("rollback")
        return response.status(400).json({error: "payment payload does not match job posting order"})
      }
      const updated = await client.query(
        `update job_posting_orders
         set status='pending_contact',payment_status='paid',payment_reference=$1,updated_at=now()
         where id=$2 and status='payment_required' and payment_status='pending' returning *`,
        [paid.transaction_id, posting.id]
      )
      if (updated.rowCount) {
        await client.query(
          `insert into job_posting_payment_attempts(posting_order_id,status,provider_reference,amount_cents,response_payload)
           values($1,'paid',$2,$3,$4)`,
          [posting.id, paid.transaction_id, posting.amount_cents, paid]
        )
        const platform = {tenant: posting.tenant_slug, campus: posting.campus_slug, user: {id: posting.user_id}}
        await audit(client, platform, "payment_succeeded", "job_posting_order", posting.id, {transactionId: paid.transaction_id})
      }
      await client.query("commit")
      return response.json({code: "SUCCESS", message: "成功"})
    }
    if (!isExpectedWechatPayment(paid, expected.rows[0], {mchid: process.env.WECHATPAY_MCHID, appid: process.env.WECHATPAY_APPID})) {
      await client.query("rollback")
      return response.status(400).json({error: "payment payload does not match order"})
    }
    const result = await client.query(
      `update orders set status='submitted',payment_status='paid',payment_reference=$1
       where id=$2 and status='payment_pending' and payment_status='pending' returning *`,
      [paid.transaction_id, expected.rows[0].id]
    )
    if (result.rowCount) {
      const order = result.rows[0]
      const platform = {tenant: order.tenant_slug, campus: order.campus_slug, user: {id: order.user_id}}
      await client.query(
        `insert into payment_attempts(tenant_slug,campus_slug,order_id,provider,status,provider_reference,amount_cents,response_payload)
         values($1,$2,$3,'wechat_pay','paid',$4,$5,$6)`,
        [order.tenant_slug, order.campus_slug, order.id, paid.transaction_id, order.total_amount_cents, paid]
      )
      await recordOrderEvent(client, platform, order.id, "payment", paid.transaction_id, "payment_pending", "submitted", "微信支付成功，订单已推送商家")
      await enqueueNotification(client, platform, order.id, "merchant", order.merchant_id, "new_order", {
        orderNo: order.order_no,
        totalCents: order.total_amount_cents,
        serviceDate: order.service_date,
        fulfillmentType: order.fulfillment_type
      })
      await audit(client, platform, "payment_succeeded", "order", order.id, {transactionId: paid.transaction_id})
    }
    await client.query("commit")
    response.json({code: "SUCCESS", message: "成功"})
  } catch (error) {
    await client.query("rollback")
    throw error
  } finally {
    client.release()
  }
}))

app.post("/v1/payments/wechat/refund-notify", rateLimit("refund-notify", 180, 60_000), asyncRoute(async (request, response) => {
  if (checkoutMode !== "wechat" || !wechatPayConfigured()) return response.status(404).json({error: "payment not configured"})
  if (!verifyWechatPayCallback(request)) return response.status(401).json({error: "invalid payment signature"})
  const refund = decryptWechatPayResource(request.body?.resource || {})
  if (!refund.out_refund_no || !refund.refund_status) return response.json({code: "SUCCESS", message: "ignored"})
  const client = await pool.connect()
  try {
    await client.query("begin")
    const expected = await client.query(
      `select r.*,o.total_amount_cents from payment_refunds r join orders o on o.id=r.order_id
       where r.out_refund_no=$1 for update`,
      [refund.out_refund_no]
    )
    if (!expected.rowCount) {
      const postingRefund = await client.query(
        `select r.*,p.tenant_slug,p.campus_slug,p.user_id,p.order_no
         from job_posting_refunds r join job_posting_orders p on p.id=r.posting_order_id
         where r.out_refund_no=$1 for update`,
        [refund.out_refund_no]
      )
      if (!postingRefund.rowCount) {
        const serviceRefund = await client.query(
          `select r.*,o.tenant_slug,o.campus_slug,o.user_id,o.order_no,o.total_amount_cents
           from campus_service_refunds r join campus_service_orders o on o.id=r.order_id
           where r.out_refund_no=$1 for update`,
          [refund.out_refund_no]
        )
        if (!serviceRefund.rowCount) {
          await client.query("commit")
          return response.json({code: "SUCCESS", message: "ignored"})
        }
        const record = serviceRefund.rows[0]
        if (!isExpectedWechatRefund(refund, record, {mchid: process.env.WECHATPAY_MCHID})) {
          await client.query("rollback")
          return response.status(400).json({error: "refund payload does not match campus service order"})
        }
        const normalizedStatus = refund.refund_status === "SUCCESS" ? "succeeded" : refund.refund_status === "CLOSED" || refund.refund_status === "ABNORMAL" ? "failed" : "processing"
        await client.query(
          `update campus_service_refunds set status=$1,provider_reference=$2,response_payload=$3,updated_at=now()
           where id=$4 and status not in ('succeeded','failed')`,
          [normalizedStatus, refund.refund_id || "", refund, record.id]
        )
        await client.query(
          `update campus_service_orders set payment_status=$1,updated_at=now() where id=$2`,
          [normalizedStatus === "succeeded" ? "refunded" : normalizedStatus === "failed" ? "refund_failed" : "refund_pending", record.order_id]
        )
        const platform = {tenant: record.tenant_slug, campus: record.campus_slug, user: {id: record.user_id}}
        await audit(client, platform, normalizedStatus === "succeeded" ? "refund_succeeded" : "refund_updated", "campus_service_order", record.order_id, {refundId: refund.refund_id || "", status: normalizedStatus})
        await client.query("commit")
        return response.json({code: "SUCCESS", message: "成功"})
      }
      const record = postingRefund.rows[0]
      if (!isExpectedWechatRefund(refund, record, {mchid: process.env.WECHATPAY_MCHID})) {
        await client.query("rollback")
        return response.status(400).json({error: "refund payload does not match job posting order"})
      }
      const normalizedStatus = refund.refund_status === "SUCCESS" ? "succeeded" : refund.refund_status === "CLOSED" || refund.refund_status === "ABNORMAL" ? "failed" : "processing"
      await client.query(
        `update job_posting_refunds set status=$1,provider_reference=$2,response_payload=$3,updated_at=now()
         where id=$4 and status not in ('succeeded','failed')`,
        [normalizedStatus, refund.refund_id || "", refund, record.id]
      )
      await client.query(
        `update job_posting_orders set payment_status=$1,updated_at=now() where id=$2`,
        [normalizedStatus === "succeeded" ? "refunded" : normalizedStatus === "failed" ? "failed" : "refund_pending", record.posting_order_id]
      )
      const platform = {tenant: record.tenant_slug, campus: record.campus_slug, user: {id: record.user_id}}
      await audit(client, platform, normalizedStatus === "succeeded" ? "refund_succeeded" : "refund_updated", "job_posting_order", record.posting_order_id, {refundId: refund.refund_id || "", status: normalizedStatus})
      await client.query("commit")
      return response.json({code: "SUCCESS", message: "成功"})
    }
    if (!isExpectedWechatRefund(refund, expected.rows[0], {mchid: process.env.WECHATPAY_MCHID})) {
      await client.query("rollback")
      return response.status(400).json({error: "refund payload does not match order"})
    }
    const normalizedStatus = refund.refund_status === "SUCCESS" ? "succeeded" : refund.refund_status === "CLOSED" || refund.refund_status === "ABNORMAL" ? "failed" : "processing"
    const result = await client.query(
      `update payment_refunds set status=$1,provider_reference=$2,response_payload=$3,updated_at=now()
       where out_refund_no=$4 and status not in ('succeeded','failed') returning *`,
      [normalizedStatus, refund.refund_id || "", refund, refund.out_refund_no]
    )
    if (result.rowCount && refund.refund_status === "SUCCESS") {
      const item = result.rows[0]
      const order = await client.query("update orders set payment_status='refunded' where id=$1 returning *", [item.order_id])
      if (order.rowCount) {
        const itemOrder = order.rows[0]
        const platform = {tenant: itemOrder.tenant_slug, campus: itemOrder.campus_slug, user: {id: itemOrder.user_id}}
        await recordOrderEvent(client, platform, itemOrder.id, "payment", refund.refund_id || item.out_refund_no, itemOrder.status, itemOrder.status, "退款已到账")
        await enqueueNotification(client, platform, itemOrder.id, "customer", itemOrder.user_id, "refund_succeeded", {orderNo: itemOrder.order_no, amountCents: item.amount_cents})
      }
    }
    if (result.rowCount && normalizedStatus === "failed") {
      const item = result.rows[0]
      const order = await client.query("update orders set payment_status='refund_failed' where id=$1 returning *", [item.order_id])
      if (order.rowCount) {
        const itemOrder = order.rows[0]
        const platform = {tenant: itemOrder.tenant_slug, campus: itemOrder.campus_slug, user: {id: itemOrder.user_id}}
        await recordOrderEvent(client, platform, itemOrder.id, "payment", refund.refund_id || item.out_refund_no, itemOrder.status, itemOrder.status, "退款处理异常，等待人工处理")
        await enqueueNotification(client, platform, itemOrder.id, "admin", itemOrder.tenant_slug, "refund_failed", {orderNo: itemOrder.order_no, reason: refund.refund_status})
      }
    }
    await client.query("commit")
    response.json({code: "SUCCESS", message: "成功"})
  } catch (error) {
    await client.query("rollback")
    throw error
  } finally {
    client.release()
  }
}))

app.post("/v1/integrations/express/arrival", rateLimit("express-arrival", 300, 60_000), asyncRoute(async (request, response) => {
  if (!expressWebhookSecret) return response.status(503).json({error: "express arrival integration is not configured"})
  if (!verifyExpressWebhook(request.rawBody, request.header("x-express-signature"), expressWebhookSecret)) {
    return response.status(401).json({error: "invalid express arrival signature"})
  }
  const arrival = normalizeExpressArrival(request.body)
  if (!arrival) return response.status(400).json({error: "invalid express arrival payload"})
  await resolveTenantCampus(arrival.tenant, arrival.campus)
  const phoneHash = hashIdentity(arrival.phone, identityHashSecret)
  const binding = await pool.query(
    `select user_id from express_bindings
     where tenant_slug=$1 and campus_slug=$2 and phone_hash=$3 and status='active'`,
    [arrival.tenant, arrival.campus, phoneHash]
  )
  if (!binding.rowCount) return response.status(202).json({accepted: true, matched: false})
  const client = await pool.connect()
  try {
    await client.query("begin")
    const result = await client.query(
      `insert into express_packages(
         tenant_slug,campus_slug,user_id,carrier,tracking_no,pickup_code,pickup_code_encrypted,
         station,status,source,provider_event_id,updated_at
       ) values($1,$2,$3,$4,$5,'',$6,$7,'waiting','provider',$8,now())
       on conflict(tenant_slug,campus_slug,provider_event_id) where provider_event_id is not null
       do update set carrier=excluded.carrier,tracking_no=excluded.tracking_no,
         pickup_code='',pickup_code_encrypted=excluded.pickup_code_encrypted,station=excluded.station,
         status='waiting',updated_at=now()
       returning *`,
      [arrival.tenant, arrival.campus, binding.rows[0].user_id, arrival.carrier, arrival.trackingNo, protectPii(arrival.pickupCode), arrival.station, arrival.eventId]
    )
    await client.query(
      `update express_bindings set provider_status='active',updated_at=now()
       where user_id=$1 and tenant_slug=$2 and campus_slug=$3`,
      [binding.rows[0].user_id, arrival.tenant, arrival.campus]
    )
    await audit(client, {tenant: arrival.tenant, campus: arrival.campus, user: {id: binding.rows[0].user_id}}, "provider_arrival", "express_package", result.rows[0].id, {providerEventId: arrival.eventId})
    await client.query("commit")
    response.status(202).json({accepted: true, matched: true})
  } catch (error) {
    await client.query("rollback")
    throw error
  } finally {
    client.release()
  }
}))

app.use("/v1", asyncRoute(context))

app.get("/v1/me", asyncRoute(async (request, response) => {
  const result = await pool.query(
    `select id,nickname,avatar,public_id,profile_background,profile_bio,profile_interests,profile_gallery,
       phone_encrypted,phone_verified_at from users where id=$1`,
    [request.platform.user.id]
  )
  const user = result.rows[0] || request.platform.user
  response.json({
    user: {
      id: user.id,
      nickname: user.nickname,
      avatar: user.avatar,
      publicId: user.public_id,
      profileBackground: user.profile_background || "",
      profileBio: user.profile_bio || "",
      profileInterests: user.profile_interests || [],
      profileGallery: user.profile_gallery || [],
      phoneVerified: Boolean(user.phone_verified_at),
      phoneMasked: user.phone_encrypted ? maskPhone(revealPii(user.phone_encrypted)) : ""
    },
    school: {id: request.platform.tenant, name: request.platform.tenantName},
    campus: {id: request.platform.campus, name: request.platform.campusName}
  })
}))

app.patch("/v1/me", rateLimit("profile-update", 20, 60 * 60_000), asyncRoute(async (request, response) => {
  const current = await pool.query(
    "select id,nickname,avatar,phone_encrypted,phone_verified_at from users where id=$1",
    [request.platform.user.id]
  )
  if (!current.rowCount || !current.rows[0].phone_verified_at) return response.status(403).json({error: "请先使用手机号登录"})
  const update = normalizeProfileUpdate(request.body, {isTrustedAvatar: value => Boolean(trustedUploadUrl(value))})
  if (update.nickname) await checkUserText(request.platform, update.nickname)
  if (update.profileBio) await checkUserText(request.platform, update.profileBio)
  if (update.profileInterests?.length) await checkUserText(request.platform, update.profileInterests.join(" "))
  const result = await pool.query(
    `update users set nickname=coalesce($2,nickname),avatar=coalesce($3,avatar),
       profile_background=coalesce($4,profile_background),profile_bio=coalesce($5,profile_bio),
       profile_interests=coalesce($6::jsonb,profile_interests),profile_gallery=coalesce($7::jsonb,profile_gallery)
     where id=$1
     returning id,nickname,avatar,public_id,profile_background,profile_bio,profile_interests,profile_gallery,phone_encrypted,phone_verified_at`,
    [request.platform.user.id, update.nickname ?? null, update.avatar ?? null,
      update.profileBackground ?? null, update.profileBio ?? null,
      update.profileInterests === undefined ? null : JSON.stringify(update.profileInterests),
      update.profileGallery === undefined ? null : JSON.stringify(update.profileGallery)]
  )
  await audit(pool, request.platform, "update", "user_profile", request.platform.user.id, {
    nicknameChanged: Boolean(update.nickname),
    avatarChanged: Boolean(update.avatar)
  })
  const user = result.rows[0]
  response.json({user: {
    id: user.id,
    nickname: user.nickname,
    avatar: user.avatar,
    publicId: user.public_id,
    profileBackground: user.profile_background || "",
    profileBio: user.profile_bio || "",
    profileInterests: user.profile_interests || [],
    profileGallery: user.profile_gallery || [],
    phoneVerified: Boolean(user.phone_verified_at),
    phoneMasked: user.phone_encrypted ? maskPhone(revealPii(user.phone_encrypted)) : ""
  }})
}))

app.get("/v1/community/profiles/:publicId", asyncRoute(async (request, response) => {
  const publicId = text(request.params.publicId, 6)
  if (!/^\d{6}$/.test(publicId)) return response.status(400).json({error: "用户 ID 格式无效"})
  const result = await pool.query(
    `select u.id,u.public_id,u.nickname,u.avatar,u.profile_background,u.profile_bio,u.profile_interests,u.profile_gallery,
       greatest(1,(current_date-(select min(m.joined_at)::date from user_campus_memberships m
         where m.user_id=u.id and m.tenant_slug=$1 and m.status='active'))+1)::int joined_days,
       (u.id=$3) mine,
       exists(select 1 from community_follows f where f.tenant_slug=$1 and f.follower_id=$3 and f.followed_id=u.id) following,
       exists(select 1 from community_follows f where f.tenant_slug=$1 and f.follower_id=u.id and f.followed_id=$3) follows_me,
       (select count(*)::int from community_follows f where f.tenant_slug=$1 and f.followed_id=u.id) follower_count,
       (select count(*)::int from community_follows f where f.tenant_slug=$1 and f.follower_id=u.id) following_count,
       (select count(*)::int from community_posts p where p.tenant_slug=$1 and p.user_id=u.id and p.status='active') post_count
     from users u
     where u.public_id=$2 and exists(select 1 from user_campus_memberships m
       where m.user_id=u.id and m.tenant_slug=$1 and m.status='active')`,
    [request.platform.tenant, publicId, request.platform.user.id]
  )
  if (!result.rowCount) return response.status(404).json({error: "该用户主页不存在"})
  const user = result.rows[0]
  response.json({user: {
    publicId: user.public_id, nickname: user.nickname, avatar: user.avatar,
    profileBackground: user.profile_background || "", profileBio: user.profile_bio || "",
    profileInterests: user.profile_interests || [], profileGallery: user.profile_gallery || [],
    joinedDays: user.joined_days, mine: user.mine, following: user.following, followsMe: user.follows_me,
    mutualFollowing: user.following && user.follows_me, followerCount: user.follower_count,
    followingCount: user.following_count, postCount: user.post_count
  }})
}))

app.post("/v1/community/profiles/:publicId/follow", rateLimit("community-profile-follow", 120, 60 * 60_000), asyncRoute(async (request, response) => {
  const viewer = await pool.query("select phone_verified_at from users where id=$1", [request.platform.user.id])
  if (!viewer.rows[0]?.phone_verified_at) return response.status(403).json({error: "请先使用手机号登录"})
  const target = await pool.query(
    `select u.id from users u where u.public_id=$1 and exists(
       select 1 from user_campus_memberships m where m.user_id=u.id and m.tenant_slug=$2 and m.status='active'
     )`,
    [text(request.params.publicId, 6), request.platform.tenant]
  )
  if (!target.rowCount) return response.status(404).json({error: "该用户主页不存在"})
  const followedId = Number(target.rows[0].id)
  if (followedId === Number(request.platform.user.id)) return response.status(400).json({error: "不能关注自己"})
  const found = await pool.query(
    `select 1 from community_follows where tenant_slug=$1 and follower_id=$2 and followed_id=$3`,
    [request.platform.tenant, request.platform.user.id, followedId]
  )
  if (found.rowCount) await pool.query(
    `delete from community_follows where tenant_slug=$1 and follower_id=$2 and followed_id=$3`,
    [request.platform.tenant, request.platform.user.id, followedId]
  )
  else await pool.query(
    `insert into community_follows(tenant_slug,campus_slug,follower_id,followed_id) values($1,$2,$3,$4)
     on conflict(tenant_slug,follower_id,followed_id) do nothing`,
    [request.platform.tenant, request.platform.campus, request.platform.user.id, followedId]
  )
  const state = await pool.query(
    `select
       exists(select 1 from community_follows where tenant_slug=$1 and follower_id=$2 and followed_id=$3) following,
       exists(select 1 from community_follows where tenant_slug=$1 and follower_id=$3 and followed_id=$2) follows_me,
       (select count(*)::int from community_follows where tenant_slug=$1 and followed_id=$3) follower_count`,
    [request.platform.tenant, request.platform.user.id, followedId]
  )
  response.json({...state.rows[0], mutualFollowing: state.rows[0].following && state.rows[0].follows_me})
}))

app.get("/v1/me/admin-access", asyncRoute(async (request, response) => {
  const result = await pool.query(
    `select role,campus_slug from platform_admins
     where user_id=$1 and tenant_slug=$2 and status='active' and (campus_slug is null or campus_slug=$3)
     order by case role when 'platform_admin' then 0 when 'school_admin' then 1 else 2 end limit 1`,
    [request.platform.user.id, request.platform.tenant, request.platform.campus]
  )
  response.json({allowed: Boolean(result.rowCount), role: result.rows[0]?.role || "", campus: result.rows[0]?.campus_slug || null})
}))

app.post("/v1/admin/auth/code", rateLimit("admin-login-code", 6, 10 * 60_000), requireAuditAdmin, asyncRoute(async (request, response) => {
  const code = String(crypto.randomInt(10_000_000, 100_000_000))
  const expiresAt = new Date(Date.now() + 5 * 60_000)
  await pool.query("delete from admin_login_codes where user_id=$1 or expires_at<=now()", [request.platform.user.id])
  await pool.query(
    "insert into admin_login_codes(code_hash,user_id,tenant_slug,expires_at) values($1,$2,$3,$4)",
    [hashToken(code), request.platform.user.id, request.platform.tenant, expiresAt]
  )
  await audit(pool, request.platform, "create", "admin_login_code", request.platform.user.id, {expiresAt: expiresAt.toISOString()})
  response.status(201).json({code, expiresAt: expiresAt.toISOString(), school: request.platform.tenantName, campus: request.platform.campusName})
}))

app.get("/v1/home/summary", asyncRoute(async (request, response) => {
  const scope = [request.platform.tenant, request.platform.campus]
  const [announcementResult, weatherResult, scheduleResult, packageResult] = await Promise.all([
    pool.query(
      `select id,title,content,route,publish_at,expires_at
       from campus_announcements
       where tenant_slug=$1 and campus_slug=$2 and status='active'
         and publish_at<=now() and (expires_at is null or expires_at>now())
       order by priority desc,publish_at desc,id desc limit 1`,
      scope
    ),
    pool.query(
      `select weather_temperature,weather_condition,weather_note,updated_at
       from campus_home_status where tenant_slug=$1 and campus_slug=$2`,
      scope
    ),
    pool.query(
      `select id,name,time_text,room,teacher from user_schedule_entries
       where tenant_slug=$1 and campus_slug=$2 and user_id=$3 order by id`,
      [...scope, request.platform.user.id]
    ),
    pool.query(
      `select count(*)::int pending from express_packages
       where tenant_slug=$1 and campus_slug=$2 and user_id=$3 and status<>'picked'`,
      [...scope, request.platform.user.id]
    )
  ])
  const schedule = buildHomeScheduleSummary(scheduleResult.rows)
  const weather = await weatherService.current({tenant: request.platform.tenant, fallback: weatherResult.rows[0]})
  response.json({
    announcement: announcementResult.rows[0] || null,
    nextCourse: schedule.nextCourse,
    weather,
    express: {pending: packageResult.rows[0].pending},
    schedule: {today: schedule.today, total: schedule.total}
  })
}))

app.get("/v1/me/summary", asyncRoute(async (request, response) => {
  const params = [request.platform.tenant, request.platform.campus, request.platform.user.id]
  const [countsResult, activitiesResult, userResult] = await Promise.all([
    pool.query(
      `select
        (select count(*)::int from community_posts where tenant_slug=$1 and user_id=$3) posts,
        (
          (select count(*) from order_events e join orders o on o.id=e.order_id
           where o.tenant_slug=$1 and o.campus_slug=$2 and o.user_id=$3)
          +
          (select count(*) from community_comments c join community_posts p on p.id=c.post_id
           where p.tenant_slug=$1 and p.user_id=$3 and c.user_id<>$3 and c.status='active')
          +
          (select count(*) from conversation_messages m join resource_conversations c on c.id=m.conversation_id
           where c.tenant_slug=$1 and (c.initiator_id=$3 or c.participant_id=$3)
             and (c.resource_type in ('community_post','user_profile','lost_post') or c.campus_slug=$2)
             and m.sender_id<>$3 and m.read_at is null)
        )::int messages,
        (select count(*)::int from user_schedule_entries where tenant_slug=$1 and campus_slug=$2 and user_id=$3) schedule,
        (
          (select count(*) from marketplace_listings where tenant_slug=$1 and campus_slug=$2 and user_id=$3)
          +
          (select count(*) from marketplace_favorites f join marketplace_listings l on l.id=f.listing_id
           where l.tenant_slug=$1 and l.campus_slug=$2 and f.user_id=$3)
        )::int market`,
      params
    ),
    pool.query(
      `select kind,title,detail,state,created_at,route from (
         select 'ranking' kind,'榜单地点' title,p.name detail,
           case p.status when 'active' then '已公开' when 'rejected' then '未通过' else '审核中' end state,
           p.created_at,'/pages/rankings/index' route
         from ranking_places p
         where p.tenant_slug=$1 and p.campus_slug=$2 and p.user_id=$3
         union all
         select 'community','校园帖子',left(p.content,40),
           case p.status when 'active' then '已公开' when 'rejected' then '未通过' else '审核中' end,
           p.created_at,'/pages/community/index'
         from community_posts p where p.tenant_slug=$1 and p.user_id=$3
         union all
         select 'errand','校园跑腿',e.title,
           case e.status when 'open' then '待接单' when 'claimed' then '进行中' when 'completed' then '已完成' else '已结束' end,
           e.created_at,'/pages/errand/index'
         from errands e where e.tenant_slug=$1 and e.campus_slug=$2 and (e.creator_id=$3 or e.runner_id=$3)
         union all
         select 'takeout','校园外卖',coalesce(m.name,'午餐订单'),
           case o.status when 'payment_pending' then '待支付' when 'submitted' then '待接单'
             when 'accepted' then '制作中' when 'ready' then '待取餐' when 'delivering' then '配送中'
             when 'delivered' then '已送达' when 'cancelled' then '已取消' else o.status end,
           o.created_at,'/pages/takeout-orders/index'
         from orders o join merchants m on m.id=o.merchant_id
         where o.tenant_slug=$1 and o.campus_slug=$2 and o.user_id=$3
         union all
         select 'event','活动报名',e.title,
           case s.status when 'signed' then '已报名' else '已取消' end,
           s.created_at,'/pages/events/index'
         from event_signups s join events e on e.id=s.event_id
         where e.tenant_slug=$1 and e.campus_slug=$2 and s.user_id=$3
         union all
         select 'market','二手交易',l.title,
           case l.status when 'active' then '展示中' when 'sold' then '已售出' else '已结束' end,
           l.created_at,'/pages/market/index'
         from marketplace_listings l where l.tenant_slug=$1 and l.campus_slug=$2 and l.user_id=$3
         union all
         select 'schedule','课程日程',s.name,s.time_text,s.created_at,'/pages/schedule/index'
         from user_schedule_entries s where s.tenant_slug=$1 and s.campus_slug=$2 and s.user_id=$3
       ) activity order by created_at desc limit 4`,
      params
    ),
    pool.query("select id,nickname,avatar,public_id,phone_encrypted,phone_verified_at from users where id=$1", [request.platform.user.id])
  ])
  const user = userResult.rows[0] || request.platform.user
  response.json({
    user: {
      id: user.id,
      nickname: user.nickname,
      avatar: user.avatar,
      publicId: user.public_id,
      phoneVerified: Boolean(user.phone_verified_at),
      phoneMasked: user.phone_encrypted ? maskPhone(revealPii(user.phone_encrypted)) : ""
    },
    school: {id: request.platform.tenant, name: request.platform.tenantName},
    campus: {id: request.platform.campus, name: request.platform.campusName},
    counts: countsResult.rows[0],
    activities: activitiesResult.rows.map(item => ({
      kind: item.kind,
      title: item.title,
      detail: item.detail,
      state: item.state,
      createdAt: item.created_at,
      route: item.route
    }))
  })
}))

app.post("/v1/auth/logout", asyncRoute(async (request, response) => {
  const sessionToken = String(request.header("x-session-token") || "").trim()
  if (sessionToken) await pool.query("delete from user_sessions where token_hash=$1", [hashToken(sessionToken)])
  response.status(204).end()
}))

app.delete("/v1/me", asyncRoute(async (request, response) => {
  const activeOrders = await pool.query(
    `select 1 from orders where user_id=$1 and status in ('payment_pending','submitted','accepted','ready','delivering') limit 1`,
    [request.platform.user.id]
  )
  if (activeOrders.rowCount) return response.status(409).json({error: "active lunch orders must be completed or cancelled before account closure"})
  const client = await pool.connect()
  try {
    await client.query("begin")
    await client.query("delete from user_sessions where user_id=$1", [request.platform.user.id])
    await client.query(
      `update users set device_id=$2,nickname='已注销用户',avatar='-',wechat_openid=null,wechat_openid_hash=null where id=$1`,
      [request.platform.user.id, `closed-${request.platform.user.id}-${crypto.randomBytes(12).toString("hex")}`]
    )
    await audit(client, request.platform, "account_closed", "user", request.platform.user.id, {retainedOrderRecords: true})
    await client.query("commit")
    response.status(204).end()
  } catch (error) {
    await client.query("rollback")
    throw error
  } finally {
    client.release()
  }
}))

app.get("/v1/ops/access", asyncRoute(async (request, response) => {
  const [merchants, couriers] = await Promise.all([
    pool.query(
      `select m.id::int id,m.name,s.role from merchant_staff s join merchants m on m.id=s.merchant_id
       where s.user_id=$1 and s.status='active' and m.status='active' and m.tenant_slug=$2 and m.campus_slug=$3 order by m.name`,
      [request.platform.user.id, request.platform.tenant, request.platform.campus]
    ),
    pool.query(
      `select c.id::int id,c.name from courier_accounts a join couriers c on c.id=a.courier_id
       where a.user_id=$1 and a.status='active' and c.status='active' and c.tenant_slug=$2 and c.campus_slug=$3 order by c.name`,
      [request.platform.user.id, request.platform.tenant, request.platform.campus]
    )
  ])
  response.json({merchants: merchants.rows, couriers: couriers.rows})
}))

app.post("/v1/ai/ask", rateLimit("campus-ai", 30, 10 * 60_000), asyncRoute(async (request, response) => {
  const question = text(request.body?.question, 300)
  if (question.length < 2) return response.status(400).json({error: "question is required"})
  const result = await answerCampusQuestion(request.platform, question)
  response.json({item: result, configured: deepseekConfigured, provider: "Stardust AI"})
}))

app.get("/v1/takeout/merchants", asyncRoute(async (request, response) => {
  const result = await pool.query(
    `select m.id,m.name,m.category,m.description,m.delivery_minutes,m.min_order,m.data_mode,
      coalesce(json_agg(json_build_object('id',p.id,'name',p.name,'description',p.description,'price',p.price,'category',p.category,'image_url',p.image_url,'stock',p.stock,'data_mode',p.data_mode)
      order by p.id) filter(where p.id is not null),'[]') products
     from merchants m left join products p on p.merchant_id=m.id and p.status='active'
     where m.tenant_slug=$1 and m.campus_slug=$2 and m.status='active' group by m.id order by m.id`,
    [request.platform.tenant, request.platform.campus]
  )
  response.json({items: result.rows})
}))

app.get("/v1/takeout/menu", asyncRoute(async (request, response) => {
  const serviceDate = text(request.query.serviceDate, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(serviceDate)) return response.status(400).json({error: "service date required"})
  const result = await pool.query(
    `select d.id::int daily_menu_id,d.product_id::int id,d.name,d.description,d.category,d.price,d.original_price,d.image_url,d.capacity,d.sort_order,d.data_mode,
       coalesce(i.reserved,0)::int reserved,m.id::int merchant_id,m.name merchant_name,m.delivery_minutes
     from daily_menu_items d join merchants m on m.id=d.merchant_id
     left join lunch_inventory i on i.service_date=d.service_date and i.product_id=d.product_id
     where d.tenant_slug=$1 and d.campus_slug=$2 and d.service_date=$3 and d.status='active' and m.status='active'
       and d.data_mode='live' and m.data_mode='live'
     order by d.sort_order,d.id`,
    [request.platform.tenant, request.platform.campus, serviceDate]
  )
  if (result.rowCount) {
    return response.json({serviceDate, source: "daily_menu", items: result.rows.map(item => ({...item, available: Math.max(0, Number(item.capacity) - Number(item.reserved))}))})
  }
  const liveCatalog = await pool.query(
    `select null::int daily_menu_id,p.id::int id,p.name,p.description,p.category,p.price,null::numeric original_price,p.image_url,
       p.stock::int capacity,0::int sort_order,p.data_mode,coalesce(i.reserved,0)::int reserved,
       m.id::int merchant_id,m.name merchant_name,m.delivery_minutes
     from products p join merchants m on m.id=p.merchant_id
     left join lunch_inventory i on i.service_date=$3 and i.product_id=p.id
     where m.tenant_slug=$1 and m.campus_slug=$2 and m.status='active' and p.status='active'
       and m.data_mode='live' and p.data_mode='live'
     order by m.id,p.id`,
    [request.platform.tenant, request.platform.campus, serviceDate]
  )
  if (liveCatalog.rowCount) {
    return response.json({
      serviceDate,
      source: "live_catalog",
      items: liveCatalog.rows.map(item => ({
        ...item,
        available: Math.max(0, Number(item.capacity) - Number(item.reserved))
      }))
    })
  }
  response.json({serviceDate, source: "unavailable", items: []})
}))

app.get("/v1/takeout/context", asyncRoute(async (request, response) => {
  const result = await pool.query(
    `select count(*)::int merchant_count,count(*) filter(where status='active')::int active_merchant_count
     from merchants where tenant_slug=$1 and campus_slug=$2 and data_mode='live'`,
    [request.platform.tenant, request.platform.campus]
  )
  response.json({
    school: {id: request.platform.tenant, name: request.platform.tenantName},
    campus: {id: request.platform.campus, name: request.platform.campusName},
    lunch: {cutoff: "10:30", pickupWindow: "11:00–13:30", deliveryFeeCents: Number(process.env.LUNCH_DELIVERY_FEE_CENTS || 300)},
    merchantCount: result.rows[0].active_merchant_count,
    paymentEnabled: checkoutMode === "wechat" && wechatPayConfigured()
  })
}))

app.get("/v1/schedule", asyncRoute(async (request, response) => {
  const result = await pool.query(
    `select id::int id,name,time_text,room,teacher,created_at
     from user_schedule_entries where tenant_slug=$1 and campus_slug=$2 and user_id=$3 order by created_at desc,id desc`,
    [request.platform.tenant, request.platform.campus, request.platform.user.id]
  )
  response.json({items: result.rows})
}))

app.post("/v1/schedule", rateLimit("schedule-write", 60, 60_000), asyncRoute(async (request, response) => {
  const name = text(request.body?.name, 80)
  const timeText = text(request.body?.time, 80)
  const room = text(request.body?.room, 80)
  const teacher = text(request.body?.teacher, 80)
  if (name.length < 2 || timeText.length < 2) return response.status(400).json({error: "course name and time are required"})
  const result = await pool.query(
    `insert into user_schedule_entries(tenant_slug,campus_slug,user_id,name,time_text,room,teacher)
     values($1,$2,$3,$4,$5,$6,$7) returning id::int id,name,time_text,room,teacher,created_at`,
    [request.platform.tenant, request.platform.campus, request.platform.user.id, name, timeText, room, teacher]
  )
  await audit(pool, request.platform, "create", "schedule_entry", result.rows[0].id)
  response.status(201).json({item: result.rows[0]})
}))

app.post("/v1/schedule/import-image", rateLimit("schedule-recognition", 6, 10 * 60_000), asyncRoute(async (request, response) => {
  const imageUrl = trustedUploadUrl(request.body?.imageUrl)
  if (!imageUrl) return response.status(400).json({error: "请先上传有效的课表图片"})
  const pathname = imageUrl.startsWith("http") ? new URL(imageUrl).pathname : imageUrl
  const filename = path.basename(pathname)
  const filePath = path.resolve(uploadDir, filename)
  const uploadRoot = `${path.resolve(uploadDir)}${path.sep}`
  if (!filePath.startsWith(uploadRoot)) return response.status(400).json({error: "invalid schedule image"})
  const extension = path.extname(filename).toLowerCase()
  const mimeType = extension === ".png" ? "image/png" : extension === ".webp" ? "image/webp" : "image/jpeg"
  let buffer
  try {
    buffer = await fs.promises.readFile(filePath)
  } catch {
    return response.status(404).json({error: "课表图片不存在，请重新上传"})
  }
  const result = await scheduleRecognizer.recognize({buffer, mimeType})
  response.json(result)
}))

app.post("/v1/schedule/import", rateLimit("schedule-write", 12, 60_000), asyncRoute(async (request, response) => {
  const items = normalizeScheduleItems(request.body?.items)
  if (!items.length) return response.status(400).json({error: "没有可导入的有效课程"})
  const client = await pool.connect()
  try {
    await client.query("begin")
    const existingResult = await client.query(
      `select name,time_text,room,teacher from user_schedule_entries
       where tenant_slug=$1 and campus_slug=$2 and user_id=$3`,
      [request.platform.tenant, request.platform.campus, request.platform.user.id]
    )
    const existing = new Set(existingResult.rows.map(item => (
      `${item.name}\u0000${item.time_text}\u0000${item.room || ""}\u0000${item.teacher || ""}`.toLowerCase()
    )))
    const inserted = []
    let skipped = 0
    for (const item of items) {
      const key = `${item.name}\u0000${item.time}\u0000${item.room}\u0000${item.teacher}`.toLowerCase()
      if (existing.has(key)) {
        skipped += 1
        continue
      }
      const result = await client.query(
        `insert into user_schedule_entries(tenant_slug,campus_slug,user_id,name,time_text,room,teacher)
         values($1,$2,$3,$4,$5,$6,$7)
         returning id::int id,name,time_text,room,teacher,created_at`,
        [request.platform.tenant, request.platform.campus, request.platform.user.id, item.name, item.time, item.room, item.teacher]
      )
      inserted.push(result.rows[0])
      existing.add(key)
    }
    await audit(client, request.platform, "import", "schedule_entries", inserted[0]?.id || request.platform.user.id, {
      inserted: inserted.length,
      skipped
    })
    await client.query("commit")
    response.status(201).json({items: inserted, inserted: inserted.length, skipped})
  } catch (error) {
    await client.query("rollback")
    throw error
  } finally {
    client.release()
  }
}))

app.delete("/v1/schedule/:id", rateLimit("schedule-write", 60, 60_000), asyncRoute(async (request, response) => {
  const result = await pool.query(
    "delete from user_schedule_entries where id=$1 and tenant_slug=$2 and campus_slug=$3 and user_id=$4 returning id",
    [request.params.id, request.platform.tenant, request.platform.campus, request.platform.user.id]
  )
  if (!result.rowCount) return response.status(404).json({error: "schedule entry not found"})
  await audit(pool, request.platform, "delete", "schedule_entry", request.params.id)
  response.json({deleted: true})
}))

app.get("/v1/messages", asyncRoute(async (request, response) => {
  const result = await pool.query(
    `select * from (
       select concat('order:',e.id) id,'lunch_order' type,'午餐订单' title,
         concat('订单 ',coalesce(o.order_no,''),'：',coalesce(e.note,e.to_status)) content,e.created_at,
         o.id::text resource_id
       from order_events e join orders o on o.id=e.order_id
       where o.tenant_slug=$1 and o.campus_slug=$2 and o.user_id=$3
       union all
       select concat('comment:',c.id) id,'community_reply' type,'校园互动' title,
         concat(case when c.reply_to_user_id=$3 then '有人回复了你的评论：' else '有人评论了你的动态：' end,left(c.content,80)) content,c.created_at,
         p.id::text resource_id
       from community_comments c join community_posts p on p.id=c.post_id
       where p.tenant_slug=$1 and (p.user_id=$3 or c.reply_to_user_id=$3)
         and c.user_id<>$3 and c.status='active'
     ) messages order by created_at desc limit 100`,
    [request.platform.tenant, request.platform.campus, request.platform.user.id]
  )
  response.json({items: result.rows})
}))

app.get("/v1/orders", asyncRoute(async (request, response) => {
  const result = await pool.query(
    `select o.id,o.order_no,o.total_amount,o.total_amount_cents,o.status,o.pickup_note,o.service_date,o.service_slot,
      o.fulfillment_type,o.contact_name,o.contact_phone,o.delivery_address,o.payment_status,o.created_at,m.name merchant_name,
      coalesce(json_agg(json_build_object('name',i.product_name,'price',i.unit_price,'priceCents',i.unit_price_cents,'quantity',i.quantity) order by i.id),'[]') items
     from orders o join merchants m on m.id=o.merchant_id join order_items i on i.order_id=o.id
     where o.tenant_slug=$1 and o.campus_slug=$2 and o.user_id=$3 group by o.id,m.name order by o.created_at desc limit 50`,
    [request.platform.tenant, request.platform.campus, request.platform.user.id]
  )
  response.json({items: result.rows.map(presentContact)})
}))

app.post("/v1/orders", rateLimit("create-order", 30, 60_000), asyncRoute(async (request, response) => {
  const items = Array.isArray(request.body.items) ? request.body.items : []
  if (!items.length || items.length > 30) return response.status(400).json({error: "order items required"})
  const normalized = items.map(item => ({productId: Number(item.productId), quantity: Math.max(1, Math.min(20, Number(item.quantity) || 1))}))
  const idempotencyKey = text(request.body.idempotencyKey, 80)
  if (!/^[a-zA-Z0-9_-]{8,80}$/.test(idempotencyKey)) return response.status(400).json({error: "valid idempotency key required"})
  const productIds = normalized.map(item => item.productId)
  const client = await pool.connect()
  try {
    await client.query("begin")
    const existing = await client.query(
      `select id,order_no,total_amount,total_amount_cents,status,payment_status,service_date,service_slot,fulfillment_type,created_at
       from orders where user_id=$1 and tenant_slug=$2 and campus_slug=$3 and idempotency_key=$4`,
      [request.platform.user.id, request.platform.tenant, request.platform.campus, idempotencyKey]
    )
    if (existing.rowCount) {
      await client.query("commit")
      const item = existing.rows[0]
      return response.json({
        item,
        idempotent: true,
        payment: item.status === "payment_pending" && item.payment_status === "pending"
          ? {enabled: true, orderId: item.id, message: "订单仍在等待支付"}
          : {enabled: false}
      })
    }
    const serviceDate = text(request.body.serviceDate, 10) || new Date().toISOString().slice(0, 10)
    validateLunchDate(serviceDate)
    const dailyMenu = await client.query(
      `select 1 from daily_menu_items d join merchants m on m.id=d.merchant_id
       where d.service_date=$1 and d.status='active' and m.status='active'
       and d.tenant_slug=$2 and d.campus_slug=$3 limit 1`,
      [serviceDate, request.platform.tenant, request.platform.campus]
    )
    const products = dailyMenu.rowCount
      ? await client.query(
        `select d.product_id id,d.name,d.price,d.capacity stock,d.merchant_id from daily_menu_items d
         join products p on p.id=d.product_id join merchants m on m.id=d.merchant_id
         where d.product_id=any($1::bigint[]) and d.service_date=$2 and d.status='active' and p.status='active'
         and m.status='active' and d.tenant_slug=$3 and d.campus_slug=$4 for update of d`,
        [productIds, serviceDate, request.platform.tenant, request.platform.campus]
      )
      : await client.query(
        `select p.id,p.name,p.price,p.stock,m.id merchant_id from products p
         join merchants m on m.id=p.merchant_id
         where p.id=any($1::bigint[]) and p.status='active' and p.data_mode='live'
         and m.status='active' and m.data_mode='live' and m.tenant_slug=$2 and m.campus_slug=$3
         for update of p`,
        [productIds, request.platform.tenant, request.platform.campus]
      )
    if (products.rowCount !== new Set(productIds).size) throw Object.assign(new Error("product unavailable"), {status: 400})
    const merchantIds = new Set(products.rows.map(item => String(item.merchant_id)))
    if (merchantIds.size !== 1) throw Object.assign(new Error("one merchant per order"), {status: 400})
    let subtotalCents = 0
    const rows = normalized.map(item => {
      const product = products.rows.find(row => Number(row.id) === item.productId)
      if (!product || item.quantity > product.stock) throw Object.assign(new Error("insufficient stock"), {status: 400})
      const unitPriceCents = cents(product.price)
      subtotalCents += unitPriceCents * item.quantity
      return {...item, product, unitPriceCents}
    })
    if (request.body.fulfillmentType && request.body.fulfillmentType !== "delivery") {
      throw Object.assign(new Error("校园外卖仅支持校内外送"), {status: 400})
    }
    const fulfillmentType = "delivery"
    const contactName = text(request.body.contactName, 40)
    const contactPhone = text(request.body.contactPhone, 30)
    const deliveryAddress = text(request.body.deliveryAddress, 160)
    if (!contactName || !/^1\d{10}$/.test(contactPhone)) throw Object.assign(new Error("valid contact required"), {status: 400})
    if (deliveryAddress.length < 5) throw Object.assign(new Error("delivery address required"), {status: 400})
    const protectedContactName = protectPii(contactName)
    const protectedContactPhone = protectPii(contactPhone)
    const protectedDeliveryAddress = protectPii(deliveryAddress)
    for (const item of rows) {
      await client.query(
        `insert into lunch_inventory(service_date,product_id,capacity,reserved)
         values($1,$2,$3,0) on conflict(service_date,product_id) do nothing`,
        [serviceDate, item.product.id, item.product.stock]
      )
      const reserved = await client.query(
        `update lunch_inventory set reserved=reserved+$1,updated_at=now()
         where service_date=$2 and product_id=$3 and reserved+$1<=capacity returning reserved,capacity`,
        [item.quantity, serviceDate, item.product.id]
      )
      if (!reserved.rowCount) throw Object.assign(new Error(`${item.product.name} lunch capacity unavailable`), {status: 409})
    }
    const merchantId = [...merchantIds][0]
    const configuredDeliveryFee = Number(process.env.LUNCH_DELIVERY_FEE_CENTS || 300)
    if (!Number.isInteger(configuredDeliveryFee) || configuredDeliveryFee < 0 || configuredDeliveryFee > 100000) {
      throw Object.assign(new Error("invalid server delivery fee configuration"), {status: 500})
    }
    const deliveryFeeCents = configuredDeliveryFee
    const totalCents = subtotalCents + deliveryFeeCents
    const paymentEnabled = checkoutMode === "wechat" && wechatPayConfigured()
    const initialStatus = paymentEnabled ? "payment_pending" : "submitted"
    const paymentStatus = paymentEnabled ? "pending" : "not_required"
    const order = await client.query(
      `insert into orders(tenant_slug,campus_slug,user_id,merchant_id,order_no,total_amount,total_amount_cents,pickup_note,service_date,service_slot,
        fulfillment_type,contact_name,contact_phone,delivery_address,idempotency_key,status,payment_status)
       values($1,$2,$3,$4,$5,$6,$7,$8,$9,'lunch',$10,$11,$12,$13,$14,$15,$16)
       returning id,order_no,total_amount,total_amount_cents,status,payment_status,service_date,service_slot,fulfillment_type,created_at`,
      [request.platform.tenant, request.platform.campus, request.platform.user.id, merchantId, orderNumber(), (totalCents / 100).toFixed(2), totalCents, text(request.body.pickupNote, 120), serviceDate, fulfillmentType, protectedContactName, protectedContactPhone, protectedDeliveryAddress, idempotencyKey, initialStatus, paymentStatus]
    )
    for (const item of rows) {
      await client.query(
        "insert into order_items(order_id,product_id,product_name,unit_price,unit_price_cents,quantity) values($1,$2,$3,$4,$5,$6)",
        [order.rows[0].id, item.product.id, item.product.name, item.product.price, item.unitPriceCents, item.quantity]
      )
    }
    await client.query(
      `insert into deliveries(tenant_slug,campus_slug,order_id,merchant_id,pickup_address,dropoff_address,delivery_fee,delivery_fee_cents)
       values($1,$2,$3,$4,$5,$6,$7,$8)`,
      [request.platform.tenant, request.platform.campus, order.rows[0].id, merchantId, text(request.body.pickupAddress, 160) || "商家取餐点", protectedDeliveryAddress, (deliveryFeeCents / 100).toFixed(2), deliveryFeeCents]
    )
    await recordOrderEvent(client, request.platform, order.rows[0].id, "customer", request.platform.user.id, null, initialStatus, paymentEnabled ? "等待微信支付" : "用户提交午餐订单")
    if (!paymentEnabled) {
      await enqueueNotification(client, request.platform, order.rows[0].id, "merchant", merchantId, "new_order", {
        orderNo: order.rows[0].order_no,
        totalCents: order.rows[0].total_amount_cents,
        serviceDate,
        fulfillmentType
      })
    }
    await audit(client, request.platform, "create", "order", order.rows[0].id, {totalCents, fulfillmentType, serviceDate})
    await client.query("commit")
    response.status(201).json({
      item: order.rows[0],
      routing: {merchant: paymentEnabled ? "wait_for_payment" : "queued", rider: fulfillmentType === "delivery" ? "wait_for_merchant_acceptance" : "not_required"},
      payment: paymentEnabled ? {enabled: true, orderId: order.rows[0].id, message: "请完成微信支付后通知商家"} : {enabled: false, message: "订单已创建；当前为免支付/线下结算模式"}
    })
  } catch (error) {
    await client.query("rollback")
    if (error?.code === "23505" && error?.constraint === "idx_orders_user_idempotency") {
      const existing = await pool.query(
        `select id,order_no,total_amount,total_amount_cents,status,payment_status,service_date,service_slot,fulfillment_type,created_at
         from orders where user_id=$1 and tenant_slug=$2 and campus_slug=$3 and idempotency_key=$4`,
        [request.platform.user.id, request.platform.tenant, request.platform.campus, idempotencyKey]
      )
      if (existing.rowCount) {
        const item = existing.rows[0]
        return response.json({
          item,
          idempotent: true,
          payment: item.status === "payment_pending" && item.payment_status === "pending"
            ? {enabled: true, orderId: item.id, message: "订单仍在等待支付"}
            : {enabled: false}
        })
      }
    }
    throw error
  } finally {
    client.release()
  }
}))

app.post("/v1/orders/:id/payment-intent", asyncRoute(async (request, response) => {
  if (checkoutMode !== "wechat" || !wechatPayConfigured()) return response.status(409).json({error: "wechat payment is not enabled"})
  const result = await pool.query(
    `select o.*,u.wechat_openid from orders o join users u on u.id=o.user_id
     where o.id=$1 and o.tenant_slug=$2 and o.campus_slug=$3 and o.user_id=$4 and o.status='payment_pending' and o.payment_status='pending'`,
    [request.params.id, request.platform.tenant, request.platform.campus, request.platform.user.id]
  )
  if (!result.rowCount) return response.status(409).json({error: "order is not awaiting payment"})
  const order = result.rows[0]
  const openid = revealPii(order.wechat_openid)
  if (!openid) return response.status(409).json({error: "wechat login is required before payment"})
  const payment = await createWechatJsapiPayment({
    description: `吃啥不愁午餐 ${order.order_no}`,
    orderNo: order.order_no,
    amountCents: order.total_amount_cents,
    openid
  })
  if (!payment.ok) {
    await pool.query(
      `insert into payment_attempts(tenant_slug,campus_slug,order_id,provider,status,amount_cents,request_payload,response_payload)
       values($1,$2,$3,'wechat_pay','failed',$4,$5,$6)`,
      [order.tenant_slug, order.campus_slug, order.id, order.total_amount_cents, payment.requestPayload, payment.payload]
    )
    return response.status(502).json({error: "payment provider unavailable"})
  }
  await pool.query(
    `insert into payment_attempts(tenant_slug,campus_slug,order_id,provider,status,provider_reference,amount_cents,request_payload,response_payload)
     values($1,$2,$3,'wechat_pay','prepay_created',$4,$5,$6,$7)`,
    [order.tenant_slug, order.campus_slug, order.id, payment.payload.prepay_id, order.total_amount_cents, payment.requestPayload, payment.payload]
  )
  response.json({paymentParams: payment.paymentParams, expiresInSeconds: paymentPendingMinutes * 60})
}))

app.get("/v1/orders/:id", asyncRoute(async (request, response) => {
  const order = await pool.query(
    `select o.*,m.name merchant_name,
      coalesce(json_agg(distinct jsonb_build_object('name',i.product_name,'price',i.unit_price,'quantity',i.quantity))
        filter(where i.id is not null),'[]') items
     from orders o join merchants m on m.id=o.merchant_id
     left join order_items i on i.order_id=o.id
     where o.id=$1 and o.tenant_slug=$2 and o.campus_slug=$3 and o.user_id=$4 group by o.id,m.name`,
    [request.params.id, request.platform.tenant, request.platform.campus, request.platform.user.id]
  )
  if (!order.rowCount) return response.status(404).json({error: "order not found"})
  const [events, delivery] = await Promise.all([
    pool.query("select actor_type,from_status,to_status,note,created_at from order_events where order_id=$1 order by created_at", [request.params.id]),
    pool.query(
      `select d.id,d.status,d.pickup_address,d.dropoff_address,d.delivery_fee,d.delivery_fee_cents,d.claimed_at,d.picked_up_at,d.delivered_at,
        c.name courier_name,c.phone courier_phone
       from deliveries d left join couriers c on c.id=d.courier_id where d.order_id=$1`,
      [request.params.id]
    )
  ])
  response.json({item: presentContact(order.rows[0]), events: events.rows, delivery: presentDelivery(delivery.rows[0])})
}))

app.post("/v1/orders/:id/cancel", asyncRoute(async (request, response) => {
  const client = await pool.connect()
  try {
    await client.query("begin")
    const result = await client.query(
      `update orders set status='cancelled',cancelled_at=now(),cancel_reason=$1
       where id=$2 and tenant_slug=$3 and campus_slug=$4 and user_id=$5 and status in ('payment_pending','submitted') returning *`,
      [text(request.body.reason, 120) || "用户取消", request.params.id, request.platform.tenant, request.platform.campus, request.platform.user.id]
    )
    if (!result.rowCount) throw Object.assign(new Error("order cannot be cancelled"), {status: 409})
    await client.query("update deliveries set status='cancelled' where order_id=$1", [request.params.id])
    await client.query(
      `update lunch_inventory li set reserved=greatest(0,li.reserved-i.quantity),updated_at=now()
       from order_items i where i.order_id=$1 and li.service_date=$2 and li.product_id=i.product_id`,
      [request.params.id, result.rows[0].service_date]
    )
    await recordOrderEvent(client, request.platform, request.params.id, "customer", request.platform.user.id, null, "cancelled", result.rows[0].cancel_reason)
    const refundPending = await queuePaidOrderRefund(client, request.platform, result.rows[0], result.rows[0].cancel_reason)
    await enqueueNotification(client, request.platform, request.params.id, "merchant", result.rows[0].merchant_id, "order_cancelled", {orderNo: result.rows[0].order_no})
    await client.query("commit")
    response.json({item: {...result.rows[0], payment_status: refundPending ? "refund_pending" : result.rows[0].payment_status}})
  } catch (error) {
    await client.query("rollback")
    throw error
  } finally {
    client.release()
  }
}))

app.get("/v1/merchant/orders", requireOpsRole("merchant"), asyncRoute(async (request, response) => {
  const merchantId = Number(request.header("x-merchant-id"))
  if (!Number.isInteger(merchantId)) return response.status(400).json({error: "merchant id required"})
  const status = text(request.query.status, 30)
  const result = await pool.query(
    `select o.id,o.order_no,o.total_amount,o.total_amount_cents,o.status,o.service_date,o.fulfillment_type,o.contact_name,o.contact_phone,
      o.delivery_address,o.pickup_note,o.created_at,
      coalesce(json_agg(json_build_object('name',i.product_name,'quantity',i.quantity,'price',i.unit_price,'priceCents',i.unit_price_cents) order by i.id),'[]') items
     from orders o join order_items i on i.order_id=o.id
     where o.tenant_slug=$1 and o.campus_slug=$2 and o.merchant_id=$3 and o.status<>'payment_pending' and ($4='' or o.status=$4)
     group by o.id order by case o.status when 'submitted' then 0 when 'accepted' then 1 when 'ready' then 2 else 3 end,o.created_at`,
    [request.platform.tenant, request.platform.campus, merchantId, status]
  )
  response.json({items: result.rows.map(presentContact)})
}))

app.post("/v1/merchant/orders/:id/accept", requireOpsRole("merchant"), asyncRoute(async (request, response) => {
  const merchantId = Number(request.header("x-merchant-id"))
  if (!Number.isInteger(merchantId)) return response.status(400).json({error: "merchant id required"})
  const client = await pool.connect()
  try {
    await client.query("begin")
    const result = await client.query(
      `update orders set status='accepted',accepted_at=now()
       where id=$1 and tenant_slug=$2 and campus_slug=$3 and merchant_id=$4 and status='submitted' returning *`,
      [request.params.id, request.platform.tenant, request.platform.campus, merchantId]
    )
    if (!result.rowCount) throw Object.assign(new Error("order unavailable"), {status: 409})
    await recordOrderEvent(client, request.platform, request.params.id, "merchant", merchantId, "submitted", "accepted", "商家已接单")
    await enqueueNotification(client, request.platform, request.params.id, "customer", result.rows[0].user_id, "merchant_accepted", {orderNo: result.rows[0].order_no})
    if (result.rows[0].fulfillment_type === "delivery") {
      await client.query("update deliveries set status='available' where order_id=$1 and status='waiting_merchant'", [request.params.id])
      await enqueueNotification(client, request.platform, request.params.id, "rider_pool", request.platform.tenant, "delivery_available", {
        orderNo: result.rows[0].order_no,
        serviceDate: result.rows[0].service_date
      })
    }
    await client.query("commit")
    response.json({item: result.rows[0], routing: {customer: "queued", rider: result.rows[0].fulfillment_type === "delivery" ? "queued" : "not_required"}})
  } catch (error) {
    await client.query("rollback")
    throw error
  } finally {
    client.release()
  }
}))

app.post("/v1/merchant/orders/:id/reject", requireOpsRole("merchant"), asyncRoute(async (request, response) => {
  const merchantId = Number(request.header("x-merchant-id"))
  if (!Number.isInteger(merchantId)) return response.status(400).json({error: "merchant id required"})
  const reason = text(request.body.reason, 120) || "商家无法接单"
  const client = await pool.connect()
  try {
    await client.query("begin")
    const result = await client.query(
      `update orders set status='rejected',cancelled_at=now(),cancel_reason=$1
       where id=$2 and tenant_slug=$3 and campus_slug=$4 and merchant_id=$5 and status='submitted' returning *`,
      [reason, request.params.id, request.platform.tenant, request.platform.campus, merchantId]
    )
    if (!result.rowCount) throw Object.assign(new Error("order unavailable"), {status: 409})
    await client.query("update deliveries set status='cancelled' where order_id=$1", [request.params.id])
    await client.query(
      `update lunch_inventory li set reserved=greatest(0,li.reserved-i.quantity),updated_at=now()
       from order_items i where i.order_id=$1 and li.service_date=$2 and li.product_id=i.product_id`,
      [request.params.id, result.rows[0].service_date]
    )
    await recordOrderEvent(client, request.platform, request.params.id, "merchant", merchantId, "submitted", "rejected", reason)
    const refundPending = await queuePaidOrderRefund(client, request.platform, result.rows[0], reason)
    await enqueueNotification(client, request.platform, request.params.id, "customer", result.rows[0].user_id, "merchant_rejected", {orderNo: result.rows[0].order_no, reason})
    await client.query("commit")
    response.json({item: {...result.rows[0], payment_status: refundPending ? "refund_pending" : result.rows[0].payment_status}})
  } catch (error) {
    await client.query("rollback")
    throw error
  } finally {
    client.release()
  }
}))

app.post("/v1/merchant/orders/:id/ready", requireOpsRole("merchant"), asyncRoute(async (request, response) => {
  const merchantId = Number(request.header("x-merchant-id"))
  if (!Number.isInteger(merchantId)) return response.status(400).json({error: "merchant id required"})
  const client = await pool.connect()
  try {
    await client.query("begin")
    const result = await client.query(
      `update orders set status='ready',ready_at=now()
       where id=$1 and tenant_slug=$2 and campus_slug=$3 and merchant_id=$4 and status='accepted' returning *`,
      [request.params.id, request.platform.tenant, request.platform.campus, merchantId]
    )
    if (!result.rowCount) throw Object.assign(new Error("order cannot be marked ready"), {status: 409})
    await recordOrderEvent(client, request.platform, request.params.id, "merchant", merchantId, "accepted", "ready", "午餐已出餐")
    await enqueueNotification(client, request.platform, request.params.id, "customer", result.rows[0].user_id, "meal_ready", {orderNo: result.rows[0].order_no})
    if (result.rows[0].fulfillment_type === "delivery") {
      const delivery = await client.query("select courier_id from deliveries where order_id=$1", [request.params.id])
      if (delivery.rows[0]?.courier_id) {
        await enqueueNotification(client, request.platform, request.params.id, "rider", delivery.rows[0].courier_id, "pickup_ready", {orderNo: result.rows[0].order_no})
      }
    }
    await client.query("commit")
    response.json({item: result.rows[0]})
  } catch (error) {
    await client.query("rollback")
    throw error
  } finally {
    client.release()
  }
}))

app.post("/v1/merchant/orders/:id/complete-pickup", requireOpsRole("merchant"), asyncRoute(async (request, response) => {
  const merchantId = Number(request.header("x-merchant-id"))
  if (!Number.isInteger(merchantId)) return response.status(400).json({error: "merchant id required"})
  const client = await pool.connect()
  try {
    await client.query("begin")
    const result = await client.query(
      `update orders set status='completed',completed_at=now()
       where id=$1 and tenant_slug=$2 and campus_slug=$3 and merchant_id=$4 and fulfillment_type='pickup' and status='ready' returning *`,
      [request.params.id, request.platform.tenant, request.platform.campus, merchantId]
    )
    if (!result.rowCount) throw Object.assign(new Error("pickup order cannot be completed"), {status: 409})
    await recordOrderEvent(client, request.platform, request.params.id, "merchant", merchantId, "ready", "completed", "用户已取餐")
    await enqueueNotification(client, request.platform, request.params.id, "customer", result.rows[0].user_id, "order_completed", {orderNo: result.rows[0].order_no})
    await client.query("commit")
    response.json({item: result.rows[0]})
  } catch (error) {
    await client.query("rollback")
    throw error
  } finally {
    client.release()
  }
}))

app.get("/v1/rider/deliveries", requireOpsRole("rider"), asyncRoute(async (request, response) => {
  const courierId = Number(request.header("x-courier-id"))
  const scope = text(request.query.scope, 20) || "available"
  if (!["available", "mine"].includes(scope)) return response.status(400).json({error: "invalid delivery scope"})
  if (scope === "mine" && !Number.isInteger(courierId)) return response.status(400).json({error: "courier id required"})
  const result = await pool.query(
    `select d.*,o.order_no,o.service_date,o.contact_name,o.contact_phone,o.status order_status,m.name merchant_name
     from deliveries d join orders o on o.id=d.order_id join merchants m on m.id=d.merchant_id
     where d.tenant_slug=$1 and d.campus_slug=$2 and (($3='available' and d.status='available') or ($3='mine' and d.courier_id=$4))
     order by d.created_at`,
    [request.platform.tenant, request.platform.campus, scope, courierId]
  )
  response.json({items: result.rows.map(item => presentContact(presentDelivery(item)))})
}))

app.post("/v1/rider/deliveries/:id/claim", requireOpsRole("rider"), asyncRoute(async (request, response) => {
  const courierId = Number(request.header("x-courier-id"))
  if (!Number.isInteger(courierId)) return response.status(400).json({error: "courier id required"})
  const client = await pool.connect()
  try {
    await client.query("begin")
    const delivery = await client.query(
      `update deliveries set courier_id=$1,status='assigned',claimed_at=now()
       where id=$2 and tenant_slug=$3 and campus_slug=$4 and status='available'
       and exists(select 1 from couriers c where c.id=$1 and c.tenant_slug=$3 and c.campus_slug=$4 and c.status='active') returning *`,
      [courierId, request.params.id, request.platform.tenant, request.platform.campus]
    )
    if (!delivery.rowCount) throw Object.assign(new Error("delivery unavailable"), {status: 409})
    const order = await client.query("select * from orders where id=$1 for update", [delivery.rows[0].order_id])
    await recordOrderEvent(client, request.platform, order.rows[0].id, "rider", courierId, order.rows[0].status, order.rows[0].status, "骑手已接配送单")
    await enqueueNotification(client, request.platform, order.rows[0].id, "customer", order.rows[0].user_id, "rider_assigned", {orderNo: order.rows[0].order_no, courierId})
    await enqueueNotification(client, request.platform, order.rows[0].id, "merchant", order.rows[0].merchant_id, "rider_assigned", {orderNo: order.rows[0].order_no, courierId})
    if (order.rows[0].status === "ready") {
      await enqueueNotification(client, request.platform, order.rows[0].id, "rider", courierId, "pickup_ready", {orderNo: order.rows[0].order_no})
    }
    await client.query("commit")
    response.json({item: delivery.rows[0]})
  } catch (error) {
    await client.query("rollback")
    throw error
  } finally {
    client.release()
  }
}))

app.post("/v1/rider/deliveries/:id/pickup", requireOpsRole("rider"), asyncRoute(async (request, response) => {
  const courierId = Number(request.header("x-courier-id"))
  if (!Number.isInteger(courierId)) return response.status(400).json({error: "courier id required"})
  const client = await pool.connect()
  try {
    await client.query("begin")
    const delivery = await client.query(
      `update deliveries d set status='delivering',picked_up_at=now()
       from orders o where d.id=$1 and d.tenant_slug=$2 and d.campus_slug=$3 and d.courier_id=$4 and d.status='assigned'
       and o.id=d.order_id and o.status='ready' returning d.*`,
      [request.params.id, request.platform.tenant, request.platform.campus, courierId]
    )
    if (!delivery.rowCount) throw Object.assign(new Error("meal is not ready or delivery unavailable"), {status: 409})
    const order = await client.query("update orders set status='delivering' where id=$1 returning *", [delivery.rows[0].order_id])
    await recordOrderEvent(client, request.platform, order.rows[0].id, "rider", courierId, "ready", "delivering", "骑手已取餐，开始配送")
    await enqueueNotification(client, request.platform, order.rows[0].id, "customer", order.rows[0].user_id, "delivery_started", {orderNo: order.rows[0].order_no})
    await client.query("commit")
    response.json({item: delivery.rows[0]})
  } catch (error) {
    await client.query("rollback")
    throw error
  } finally {
    client.release()
  }
}))

app.post("/v1/rider/deliveries/:id/deliver", requireOpsRole("rider"), asyncRoute(async (request, response) => {
  const courierId = Number(request.header("x-courier-id"))
  if (!Number.isInteger(courierId)) return response.status(400).json({error: "courier id required"})
  const client = await pool.connect()
  try {
    await client.query("begin")
    const delivery = await client.query(
      `update deliveries set status='delivered',delivered_at=now()
       where id=$1 and tenant_slug=$2 and campus_slug=$3 and courier_id=$4 and status='delivering' returning *`,
      [request.params.id, request.platform.tenant, request.platform.campus, courierId]
    )
    if (!delivery.rowCount) throw Object.assign(new Error("delivery cannot be completed"), {status: 409})
    const order = await client.query("update orders set status='delivered',completed_at=now() where id=$1 returning *", [delivery.rows[0].order_id])
    await recordOrderEvent(client, request.platform, order.rows[0].id, "rider", courierId, "delivering", "delivered", "午餐已送达")
    await enqueueNotification(client, request.platform, order.rows[0].id, "customer", order.rows[0].user_id, "order_delivered", {orderNo: order.rows[0].order_no})
    await client.query("commit")
    response.json({item: delivery.rows[0]})
  } catch (error) {
    await client.query("rollback")
    throw error
  } finally {
    client.release()
  }
}))

app.get("/v1/admin/notification-outbox", requireFinanceAdmin, asyncRoute(async (request, response) => {
  const status = text(request.query.status, 20) || "pending"
  const result = await pool.query(
    `select * from notification_outbox where tenant_slug=$1 and campus_slug=$2 and status=$3 order by created_at limit 200`,
    [request.platform.tenant, request.platform.campus, status]
  )
  response.json({items: result.rows, providerConfigured: Boolean(process.env.NOTIFY_WEBHOOK_URL)})
}))

app.get("/v1/admin/takeout/summary", requireFinanceAdmin, asyncRoute(async (request, response) => {
  const rows = await pool.query(
    `select campus_slug,status,count(*)::int count,coalesce(sum(total_amount_cents),0)::int gross_cents
     from orders where tenant_slug=$1 and campus_slug=$2 group by campus_slug,status order by campus_slug,status`,
    [request.platform.tenant, request.platform.campus]
  )
  response.json({items: rows.rows})
}))

app.get("/v1/admin/campus-faqs", requireAdmin, asyncRoute(async (request, response) => {
  const result = await pool.query(
    `select id,campus_slug,keywords,answer,source_label,status,created_at,updated_at
     from campus_faqs where tenant_slug=$1 and (campus_slug=$2 or campus_slug is null) order by campus_slug nulls last,updated_at desc`,
    [request.platform.tenant, request.platform.campus]
  )
  response.json({items: result.rows})
}))

app.post("/v1/admin/campus-faqs", requireAdmin, asyncRoute(async (request, response) => {
  const keywords = text(request.body?.keywords, 160)
  const answer = text(request.body?.answer, 1000)
  if (keywords.length < 2 || answer.length < 5) return response.status(400).json({error: "keywords and answer are required"})
  const campusSlug = request.body?.allCampuses === true ? null : request.platform.campus
  const result = await pool.query(
    `insert into campus_faqs(tenant_slug,campus_slug,keywords,answer,source_label)
     values($1,$2,$3,$4,$5) returning *`,
    [request.platform.tenant, campusSlug, keywords, answer, text(request.body?.sourceLabel, 80) || "校园运营知识库"]
  )
  await audit(pool, request.platform, "create", "campus_faq", result.rows[0].id)
  response.status(201).json({item: result.rows[0]})
}))

app.patch("/v1/admin/campus-faqs/:id", requireAdmin, asyncRoute(async (request, response) => {
  const result = await pool.query(
    `update campus_faqs set keywords=coalesce($1,keywords),answer=coalesce($2,answer),source_label=coalesce($3,source_label),
       status=coalesce($4,status),updated_at=now()
     where id=$5 and tenant_slug=$6 and (campus_slug=$7 or campus_slug is null) returning *`,
    [request.body?.keywords === undefined ? null : text(request.body.keywords, 160), request.body?.answer === undefined ? null : text(request.body.answer, 1000), request.body?.sourceLabel === undefined ? null : text(request.body.sourceLabel, 80), request.body?.status === undefined ? null : (request.body.status === "inactive" ? "inactive" : "active"), request.params.id, request.platform.tenant, request.platform.campus]
  )
  if (!result.rowCount) return response.status(404).json({error: "campus FAQ not found"})
  await audit(pool, request.platform, "update", "campus_faq", request.params.id)
  response.json({item: result.rows[0]})
}))

app.get("/v1/admin/community/posts", requireContentAdmin, asyncRoute(async (request, response) => {
  const status = text(request.query.status, 20) || "pending"
  if (!["pending", "active", "rejected", "removed", "all"].includes(status)) return response.status(400).json({error: "invalid post status"})
  const result = await pool.query(
    `select p.id,p.channel,p.content,p.location,p.image_url,p.image_urls,p.status,p.moderation_note,p.created_at,u.nickname author,
       count(r.id)::int report_count
     from community_posts p join users u on u.id=p.user_id left join community_reports r on r.post_id=p.id and r.status='open'
     where p.tenant_slug=$1 and ($2='all' or p.status=$2)
     group by p.id,u.nickname
     order by case p.status when 'pending' then 0 when 'active' then 1 else 2 end,p.created_at desc limit 200`,
    [request.platform.tenant, status]
  )
  response.json({items: result.rows})
}))

app.post("/v1/admin/community/posts/:id/review", requireContentAdmin, asyncRoute(async (request, response) => {
  const decision = request.body?.decision === "approve" ? "approve" : request.body?.decision === "reject" ? "reject" : ""
  if (!decision) return response.status(400).json({error: "review decision is required"})
  const result = await pool.query(
    `update community_posts set status=$1,moderation_note=$2,reviewed_at=now(),reviewed_by=$3
     where id=$4 and tenant_slug=$5 and status='pending' returning id,status`,
    [decision === "approve" ? "active" : "rejected", text(request.body?.note, 240), request.platform.user.id, request.params.id, request.platform.tenant]
  )
  if (!result.rowCount) return response.status(404).json({error: "pending post not found"})
  await audit(pool, request.platform, decision, "community_post", request.params.id)
  response.json({item: result.rows[0]})
}))

app.patch("/v1/admin/community/posts/:id", requireContentAdmin, asyncRoute(async (request, response) => {
  const status = text(request.body?.status, 20)
  if (!['removed'].includes(status)) return response.status(400).json({error: "invalid post status"})
  const result = await pool.query(
    `update community_posts set status='removed',moderation_note=$1,reviewed_at=now(),reviewed_by=$2
     where id=$3 and tenant_slug=$4 and status='active' returning id,status`,
    [text(request.body?.note, 240), request.platform.user.id, request.params.id, request.platform.tenant]
  )
  if (!result.rowCount) return response.status(404).json({error: "active post not found"})
  await audit(pool, request.platform, "remove", "community_post", request.params.id)
  response.json({item: result.rows[0]})
}))

app.get("/v1/admin/community/reports", requireContentAdmin, asyncRoute(async (request, response) => {
  const result = await pool.query(
    `select r.id,r.reason,r.detail,r.status,r.created_at,p.id post_id,p.content,p.channel,u.nickname reporter
     from community_reports r join community_posts p on p.id=r.post_id join users u on u.id=r.reporter_id
     where p.tenant_slug=$1 and r.status='open' order by r.created_at asc limit 100`,
    [request.platform.tenant]
  )
  response.json({items: result.rows})
}))

app.post("/v1/admin/community/reports/:id/resolve", requireContentAdmin, asyncRoute(async (request, response) => {
  const result = await pool.query(
    `update community_reports r set status='resolved',handled_at=now(),handled_by=$1
     from community_posts p where r.id=$2 and r.status='open' and p.id=r.post_id and p.tenant_slug=$3 returning r.id`,
    [request.platform.user.id, request.params.id, request.platform.tenant]
  )
  if (!result.rowCount) return response.status(404).json({error: "open report not found"})
  await audit(pool, request.platform, "resolve", "community_report", request.params.id)
  response.json({resolved: true})
}))

app.get("/v1/admin/community/comment-reports", requireContentAdmin, asyncRoute(async (request, response) => {
  const result = await pool.query(
    `select r.id,r.reason,r.detail,r.status,r.created_at,c.id comment_id,c.content,
       p.id post_id,p.channel,reporter.nickname reporter,author.nickname author
     from community_comment_reports r
     join community_comments c on c.id=r.comment_id
     join community_posts p on p.id=c.post_id
     join users reporter on reporter.id=r.reporter_id
     join users author on author.id=c.user_id
     where p.tenant_slug=$1 and r.status='open'
     order by r.created_at asc limit 100`,
    [request.platform.tenant]
  )
  response.json({items: result.rows})
}))

app.post("/v1/admin/community/comment-reports/:id/resolve", requireContentAdmin, asyncRoute(async (request, response) => {
  const remove = request.body?.remove === true
  const client = await pool.connect()
  try {
    await client.query("begin")
    const result = await client.query(
      `update community_comment_reports r set status='resolved',handled_at=now(),handled_by=$1
       from community_comments c join community_posts p on p.id=c.post_id
       where r.id=$2 and r.status='open' and c.id=r.comment_id
         and p.tenant_slug=$3
       returning r.id,r.comment_id`,
      [request.platform.user.id, request.params.id, request.platform.tenant]
    )
    if (!result.rowCount) throw Object.assign(new Error("open comment report not found"), {status: 404})
    if (remove) await client.query("update community_comments set status='removed' where id=$1", [result.rows[0].comment_id])
    await audit(client, request.platform, remove ? "remove" : "resolve", "community_comment_report", request.params.id)
    await client.query("commit")
    response.json({resolved: true, removed: remove})
  } catch (error) {
    await client.query("rollback")
    throw error
  } finally {
    client.release()
  }
}))

app.get("/v1/admin/rankings/places", requireContentAdmin, asyncRoute(async (request, response) => {
  const status = text(request.query.status, 20) || "pending"
  if (!["pending", "active", "rejected", "removed", "all"].includes(status)) return response.status(400).json({error: "invalid ranking status"})
  const result = await pool.query(
    `select p.id,p.category,p.ranking_list_id,lists.title list_title,p.name,p.note,p.location,p.image_url,p.cover_key,p.source_type,p.status,
       p.campus_slug,cs.name campus_name,p.moderation_note,p.created_at,u.nickname author,count(distinct r.id)::int report_count
     from ranking_places p left join users u on u.id=p.user_id
     join campus_sites cs on cs.tenant_slug=p.tenant_slug and cs.slug=p.campus_slug
     left join ranking_lists lists on lists.id=p.ranking_list_id
     left join ranking_place_reports r on r.place_id=p.id and r.status='open'
     where p.tenant_slug=$1 and ($2='all' or p.status=$2)
     group by p.id,u.nickname,cs.name,lists.title
     order by case p.status when 'pending' then 0 when 'active' then 1 else 2 end,p.created_at desc limit 200`,
    [request.platform.tenant, status]
  )
  response.json({items: result.rows})
}))

app.get("/v1/admin/rankings/lists", requireContentAdmin, asyncRoute(async (request, response) => {
  const status = text(request.query.status, 20) || "all"
  if (!["pending", "active", "rejected", "removed", "all"].includes(status)) return response.status(400).json({error: "invalid ranking list status"})
  const result = await pool.query(
    `select lists.id,lists.title,lists.description,lists.entry_label,lists.cover_url,lists.source_type,lists.status,
       lists.moderation_note,lists.created_at,u.nickname author,
       count(places.id) filter(where places.status='active')::int item_count
     from ranking_lists lists
     left join users u on u.id=lists.user_id
     left join ranking_places places on places.ranking_list_id=lists.id
     where lists.tenant_slug=$1 and ($2='all' or lists.status=$2)
     group by lists.id,u.nickname
     order by case lists.status when 'pending' then 0 when 'active' then 1 else 2 end,lists.created_at desc
     limit 200`,
    [request.platform.tenant, status]
  )
  response.json({items: result.rows})
}))

app.post("/v1/admin/rankings/lists/:id/review", requireContentAdmin, asyncRoute(async (request, response) => {
  const decision = request.body?.decision === "approve" ? "approve" : request.body?.decision === "reject" ? "reject" : ""
  if (!decision) return response.status(400).json({error: "review decision is required"})
  const result = await pool.query(
    `update ranking_lists set status=$1,moderation_note=$2,reviewed_at=now(),reviewed_by=$3,updated_at=now()
     where id=$4 and tenant_slug=$5 and status='pending'
     returning id,status,moderation_note`,
    [decision === "approve" ? "active" : "rejected", text(request.body?.note, 240), request.platform.user.id, request.params.id, request.platform.tenant]
  )
  if (!result.rowCount) return response.status(404).json({error: "pending ranking list not found"})
  await audit(pool, request.platform, decision, "ranking_list", request.params.id)
  response.json({item: result.rows[0]})
}))

app.patch("/v1/admin/rankings/lists/:id", requireContentAdmin, asyncRoute(async (request, response) => {
  if (text(request.body?.status, 20) !== "removed") return response.status(400).json({error: "invalid ranking list status"})
  const result = await pool.query(
    `update ranking_lists set status='removed',moderation_note=$1,reviewed_at=now(),reviewed_by=$2,updated_at=now()
     where id=$3 and tenant_slug=$4 and status='active' returning id,status`,
    [text(request.body?.note, 240) || "运营下架", request.platform.user.id, request.params.id, request.platform.tenant]
  )
  if (!result.rowCount) return response.status(404).json({error: "active ranking list not found"})
  await audit(pool, request.platform, "remove", "ranking_list", request.params.id)
  response.json({item: result.rows[0]})
}))

app.post("/v1/admin/rankings/places/:id/review", requireContentAdmin, asyncRoute(async (request, response) => {
  const decision = request.body?.decision === "approve" ? "approve" : request.body?.decision === "reject" ? "reject" : ""
  if (!decision) return response.status(400).json({error: "review decision is required"})
  const result = await pool.query(
    `update ranking_places set status=$1,moderation_note=$2,reviewed_at=now(),reviewed_by=$3,updated_at=now()
     where id=$4 and tenant_slug=$5 and status='pending'
     returning id,status,moderation_note`,
    [
      decision === "approve" ? "active" : "rejected",
      text(request.body?.note, 240),
      request.platform.user.id,
      request.params.id,
      request.platform.tenant
    ]
  )
  if (!result.rowCount) return response.status(404).json({error: "pending ranking place not found"})
  await audit(pool, request.platform, decision, "ranking_place", request.params.id)
  response.json({item: result.rows[0]})
}))

app.patch("/v1/admin/rankings/places/:id", requireContentAdmin, asyncRoute(async (request, response) => {
  const status = text(request.body?.status, 20)
  if (status !== "removed") return response.status(400).json({error: "invalid ranking status"})
  const result = await pool.query(
    `update ranking_places set status='removed',moderation_note=$1,reviewed_at=now(),reviewed_by=$2,updated_at=now()
     where id=$3 and tenant_slug=$4 and status='active' returning id,status`,
    [text(request.body?.note, 240), request.platform.user.id, request.params.id, request.platform.tenant]
  )
  if (!result.rowCount) return response.status(404).json({error: "active ranking place not found"})
  await audit(pool, request.platform, "remove", "ranking_place", request.params.id)
  response.json({item: result.rows[0]})
}))

app.get("/v1/admin/rankings/reports", requireContentAdmin, asyncRoute(async (request, response) => {
  const result = await pool.query(
    `select r.id,r.reason,r.detail,r.status,r.created_at,p.id place_id,p.name,p.category,u.nickname reporter
     from ranking_place_reports r join ranking_places p on p.id=r.place_id join users u on u.id=r.reporter_id
     where p.tenant_slug=$1 and r.status='open'
     order by r.created_at asc limit 100`,
    [request.platform.tenant]
  )
  response.json({items: result.rows})
}))

app.post("/v1/admin/rankings/reports/:id/resolve", requireContentAdmin, asyncRoute(async (request, response) => {
  const result = await pool.query(
    `update ranking_place_reports r set status='resolved',handled_at=now(),handled_by=$1
     from ranking_places p
     where r.id=$2 and r.status='open' and p.id=r.place_id and p.tenant_slug=$3
     returning r.id`,
    [request.platform.user.id, request.params.id, request.platform.tenant]
  )
  if (!result.rowCount) return response.status(404).json({error: "open ranking report not found"})
  await audit(pool, request.platform, "resolve", "ranking_place_report", request.params.id)
  response.json({resolved: true})
}))

app.get("/v1/admin/rankings/comment-reports", requireContentAdmin, asyncRoute(async (request, response) => {
  const result = await pool.query(
    `select reports.id,reports.reason,reports.detail,reports.created_at,
       comments.id comment_id,comments.content,places.id place_id,places.name,
       reporters.nickname reporter,authors.nickname author
     from ranking_place_comment_reports reports
     join ranking_place_comments comments on comments.id=reports.comment_id
     join ranking_places places on places.id=comments.place_id
     join users reporters on reporters.id=reports.reporter_id
     join users authors on authors.id=comments.user_id
     where places.tenant_slug=$1 and reports.status='open'
     order by reports.created_at asc limit 100`,
    [request.platform.tenant]
  )
  response.json({items: result.rows})
}))

app.post("/v1/admin/rankings/comment-reports/:id/resolve", requireContentAdmin, asyncRoute(async (request, response) => {
  const remove = Boolean(request.body?.remove)
  const client = await pool.connect()
  try {
    await client.query("begin")
    const result = await client.query(
      `update ranking_place_comment_reports reports set status='resolved',handled_at=now(),handled_by=$1
       from ranking_place_comments comments,ranking_places places
       where reports.id=$2 and reports.status='open' and comments.id=reports.comment_id
         and places.id=comments.place_id and places.tenant_slug=$3
       returning reports.id,reports.comment_id`,
      [request.platform.user.id, request.params.id, request.platform.tenant]
    )
    if (!result.rowCount) throw Object.assign(new Error("open ranking comment report not found"), {status: 404})
    if (remove) await client.query("update ranking_place_comments set status='removed',updated_at=now() where id=$1", [result.rows[0].comment_id])
    await audit(client, request.platform, remove ? "remove" : "resolve", "ranking_place_comment_report", request.params.id)
    await client.query("commit")
    response.json({resolved: true, removed: remove})
  } catch (error) {
    await client.query("rollback")
    throw error
  } finally {
    client.release()
  }
}))

app.get("/v1/admin/takeout/merchants", requireAdmin, asyncRoute(async (request, response) => {
  const result = await pool.query(
    `select m.id::int id,m.campus_slug,m.name,m.category,m.description,m.status,m.delivery_minutes,m.min_order,m.data_mode,
      coalesce(json_agg(json_build_object('id',p.id,'name',p.name,'description',p.description,'price',p.price,'category',p.category,'image_url',p.image_url,'stock',p.stock,'status',p.status,'data_mode',p.data_mode)
      order by p.id) filter(where p.id is not null),'[]') products
     from merchants m left join products p on p.merchant_id=m.id
     where m.tenant_slug=$1 and m.campus_slug=$2
     group by m.id order by m.campus_slug,m.name`,
    [request.platform.tenant, request.platform.campus]
  )
  response.json({items: result.rows})
}))

app.patch("/v1/admin/merchants/:id", requireAdmin, asyncRoute(async (request, response) => {
  const payload = request.body || {}
  const status = payload.status === undefined ? null : text(payload.status, 20)
  if (status !== null && !["active", "inactive"].includes(status)) return response.status(400).json({error: "invalid merchant status"})
  const dataMode = payload.dataMode === undefined ? null : text(payload.dataMode, 10)
  if (dataMode !== null && !["test", "live"].includes(dataMode)) return response.status(400).json({error: "invalid merchant data mode"})
  const result = await pool.query(
    `update merchants set name=coalesce($1,name),category=coalesce($2,category),description=coalesce($3,description),status=coalesce($4,status),
      delivery_minutes=coalesce($5,delivery_minutes),min_order=coalesce($6,min_order),data_mode=coalesce($7,data_mode)
     where id=$8 and tenant_slug=$9 and campus_slug=$10 returning *`,
    [payload.name === undefined ? null : text(payload.name, 80), payload.category === undefined ? null : text(payload.category, 40), payload.description === undefined ? null : text(payload.description, 300), status,
      payload.deliveryMinutes === undefined ? null : Math.max(0, Math.min(180, Number(payload.deliveryMinutes) || 0)), payload.minOrder === undefined ? null : money(payload.minOrder), dataMode, request.params.id, request.platform.tenant, request.platform.campus]
  )
  if (!result.rowCount) return response.status(404).json({error: "merchant not found"})
  await audit(pool, request.platform, "update", "merchant", request.params.id, {campusSlug: result.rows[0].campus_slug})
  response.json({item: presentNumericId(result.rows[0])})
}))

app.get("/v1/admin/couriers", requireAdmin, asyncRoute(async (request, response) => {
  const result = await pool.query(
    `select c.id::int id,c.name,c.phone,c.status,c.created_at,count(a.user_id)::int account_count
     from couriers c left join courier_accounts a on a.courier_id=c.id and a.status='active'
     where c.tenant_slug=$1 and c.campus_slug=$2 group by c.id order by c.status,c.name`,
    [request.platform.tenant, request.platform.campus]
  )
  response.json({items: result.rows})
}))

app.post("/v1/admin/couriers", requireAdmin, asyncRoute(async (request, response) => {
  const name = text(request.body.name, 60)
  const phone = text(request.body.phone, 30)
  if (name.length < 2 || (phone && !/^1\d{10}$/.test(phone))) return response.status(400).json({error: "valid courier name and phone required"})
  const result = await pool.query(
    "insert into couriers(tenant_slug,campus_slug,name,phone,status) values($1,$2,$3,$4,'active') returning *",
    [request.platform.tenant, request.platform.campus, name, phone]
  )
  await audit(pool, request.platform, "create", "courier", result.rows[0].id)
  response.status(201).json({item: presentNumericId(result.rows[0])})
}))

app.post("/v1/admin/merchants", requireAdmin, asyncRoute(async (request, response) => {
  const name = text(request.body.name, 80)
  const campusSlug = request.platform.campus
  if (name.length < 2) return response.status(400).json({error: "merchant name required"})
  const campus = await pool.query("select 1 from campus_sites where tenant_slug=$1 and slug=$2 and status='active'", [request.platform.tenant, campusSlug])
  if (!campus.rowCount) return response.status(400).json({error: "invalid campus"})
  const result = await pool.query(
    `insert into merchants(tenant_slug,campus_slug,name,category,description,status,delivery_minutes,min_order,data_mode)
     values($1,$2,$3,$4,$5,'active',$6,$7,$8) returning *`,
    [request.platform.tenant, campusSlug, name, text(request.body.category, 40) || "午餐", text(request.body.description, 300), Math.max(0, Math.min(180, Number(request.body.deliveryMinutes) || 30)), money(request.body.minOrder || 0), request.body.dataMode === "test" ? "test" : "live"]
  )
  await audit(pool, request.platform, "create", "merchant", result.rows[0].id, {campusSlug})
  response.status(201).json({item: presentNumericId(result.rows[0])})
}))

app.post("/v1/admin/merchants/:id/products", requireAdmin, asyncRoute(async (request, response) => {
  const merchant = await pool.query("select id,campus_slug from merchants where id=$1 and tenant_slug=$2 and campus_slug=$3", [request.params.id, request.platform.tenant, request.platform.campus])
  if (!merchant.rowCount) return response.status(404).json({error: "merchant not found"})
  const name = text(request.body.name, 80)
  if (name.length < 2) return response.status(400).json({error: "product name required"})
  const stock = Number(request.body.stock)
  if (!Number.isInteger(stock) || stock < 0 || stock > 100000) return response.status(400).json({error: "valid stock required"})
  const imageInput = text(request.body.imageUrl, 500)
  const imageUrl = imageInput ? trustedUploadUrl(imageInput) : null
  if (imageInput && !imageUrl) return response.status(400).json({error: "product image must be uploaded through this service"})
  const result = await pool.query(
    `insert into products(merchant_id,name,description,price,category,image_url,stock,status,data_mode)
     values($1,$2,$3,$4,$5,$6,$7,'active',$8) returning *`,
    [merchant.rows[0].id, name, text(request.body.description, 300), money(request.body.price), text(request.body.category, 40) || "午餐", imageUrl, stock, request.body.dataMode === "test" ? "test" : "live"]
  )
  await audit(pool, request.platform, "create", "product", result.rows[0].id, {merchantId: merchant.rows[0].id, campusSlug: merchant.rows[0].campus_slug})
  response.status(201).json({item: presentNumericId(result.rows[0])})
}))

app.patch("/v1/admin/products/:id", requireAdmin, asyncRoute(async (request, response) => {
  const current = await pool.query(
    `select p.id,p.merchant_id,m.campus_slug from products p join merchants m on m.id=p.merchant_id
     where p.id=$1 and m.tenant_slug=$2 and m.campus_slug=$3`, [request.params.id, request.platform.tenant, request.platform.campus]
  )
  if (!current.rowCount) return response.status(404).json({error: "product not found"})
  const payload = request.body || {}
  const stock = payload.stock === undefined ? null : Number(payload.stock)
  if (stock !== null && (!Number.isInteger(stock) || stock < 0 || stock > 100000)) return response.status(400).json({error: "valid stock required"})
  const status = payload.status === undefined ? null : text(payload.status, 20)
  if (status !== null && !["active", "inactive"].includes(status)) return response.status(400).json({error: "invalid product status"})
  const dataMode = payload.dataMode === undefined ? null : text(payload.dataMode, 10)
  if (dataMode !== null && !["test", "live"].includes(dataMode)) return response.status(400).json({error: "invalid product data mode"})
  const imageInput = payload.imageUrl === undefined ? null : text(payload.imageUrl, 500)
  const imageUrl = imageInput === null ? null : trustedUploadUrl(imageInput)
  if (imageInput && !imageUrl) return response.status(400).json({error: "product image must be uploaded through this service"})
  const result = await pool.query(
    `update products set name=coalesce($1,name),description=coalesce($2,description),price=coalesce($3,price),category=coalesce($4,category),
      image_url=coalesce($5,image_url),stock=coalesce($6,stock),status=coalesce($7,status),data_mode=coalesce($8,data_mode) where id=$9 returning *`,
    [payload.name === undefined ? null : text(payload.name, 80), payload.description === undefined ? null : text(payload.description, 300), payload.price === undefined ? null : money(payload.price), payload.category === undefined ? null : text(payload.category, 40), imageUrl, stock, status, dataMode, request.params.id]
  )
  await audit(pool, request.platform, "update", "product", request.params.id, {merchantId: current.rows[0].merchant_id, campusSlug: current.rows[0].campus_slug})
  response.json({item: presentNumericId(result.rows[0])})
}))

app.get("/v1/admin/merchants/:id/daily-menu", requireAdmin, asyncRoute(async (request, response) => {
  const serviceDate = text(request.query.serviceDate, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(serviceDate)) return response.status(400).json({error: "service date required"})
  const result = await pool.query(
    `select d.id::int id,d.product_id::int product_id,d.service_date,d.name,d.description,d.category,d.price,d.original_price,d.image_url,d.capacity,d.status,d.sort_order,d.data_mode,
       coalesce(i.reserved,0)::int reserved
     from daily_menu_items d join merchants m on m.id=d.merchant_id
     left join lunch_inventory i on i.service_date=d.service_date and i.product_id=d.product_id
     where d.merchant_id=$1 and m.tenant_slug=$2 and m.campus_slug=$3 and d.service_date=$4 order by d.sort_order,d.id`,
    [request.params.id, request.platform.tenant, request.platform.campus, serviceDate]
  )
  response.json({items: result.rows.map(item => ({...item, available: Math.max(0, Number(item.capacity) - Number(item.reserved))}))})
}))

app.post("/v1/admin/merchants/:id/daily-menu", requireAdmin, asyncRoute(async (request, response) => {
  const merchant = await pool.query("select id,tenant_slug,campus_slug from merchants where id=$1 and tenant_slug=$2 and campus_slug=$3", [request.params.id, request.platform.tenant, request.platform.campus])
  if (!merchant.rowCount) return response.status(404).json({error: "merchant not found"})
  const productId = Number(request.body?.productId)
  const serviceDate = text(request.body?.serviceDate, 10)
  if (!Number.isInteger(productId) || !/^\d{4}-\d{2}-\d{2}$/.test(serviceDate)) return response.status(400).json({error: "valid product and service date required"})
  validateLunchDate(serviceDate)
  const product = await pool.query("select * from products where id=$1 and merchant_id=$2 and status='active'", [productId, merchant.rows[0].id])
  if (!product.rowCount) return response.status(400).json({error: "active product template required"})
  const template = product.rows[0]
  const capacity = request.body?.capacity === undefined ? Number(template.stock) : Number(request.body.capacity)
  if (!Number.isInteger(capacity) || capacity < 0 || capacity > 100000) return response.status(400).json({error: "valid daily capacity required"})
  const status = request.body?.status === "inactive" ? "inactive" : "active"
  const client = await pool.connect()
  try {
    await client.query("begin")
    const result = await client.query(
      `insert into daily_menu_items(tenant_slug,campus_slug,merchant_id,product_id,service_date,name,description,category,price,original_price,image_url,capacity,status,sort_order,data_mode)
       values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
       on conflict(service_date,product_id) do update set name=excluded.name,description=excluded.description,category=excluded.category,
         price=excluded.price,original_price=excluded.original_price,image_url=excluded.image_url,capacity=excluded.capacity,status=excluded.status,sort_order=excluded.sort_order,data_mode=excluded.data_mode,updated_at=now()
       returning *`,
      [merchant.rows[0].tenant_slug, merchant.rows[0].campus_slug, merchant.rows[0].id, productId, serviceDate,
        text(request.body?.name, 80) || template.name, text(request.body?.description, 300) || template.description, text(request.body?.category, 40) || template.category, request.body?.price === undefined ? money(template.price) : money(request.body.price), request.body?.originalPrice === undefined || request.body.originalPrice === "" ? null : money(request.body.originalPrice), request.body?.imageUrl === undefined ? template.image_url : (trustedUploadUrl(request.body.imageUrl) || null), capacity, status, Math.max(0, Math.min(1000, Number(request.body?.sortOrder) || 0)), request.body?.dataMode === "live" ? "live" : template.data_mode]
    )
    const inventory = await client.query(
      "select reserved from lunch_inventory where service_date=$1 and product_id=$2 for update",
      [serviceDate, productId]
    )
    if (inventory.rowCount && capacity < Number(inventory.rows[0].reserved)) {
      throw Object.assign(new Error("daily capacity cannot be below reserved orders"), {status: 409})
    }
    if (inventory.rowCount) {
      await client.query(
        "update lunch_inventory set capacity=$1,updated_at=now() where service_date=$2 and product_id=$3",
        [capacity, serviceDate, productId]
      )
    }
    await audit(client, request.platform, "publish_daily_menu", "daily_menu_item", result.rows[0].id, {merchantId: merchant.rows[0].id, serviceDate})
    await client.query("commit")
    response.status(201).json({item: presentNumericId(result.rows[0])})
  } catch (error) {
    await client.query("rollback")
    throw error
  } finally {
    client.release()
  }
}))

app.patch("/v1/admin/daily-menu/:id", requireAdmin, asyncRoute(async (request, response) => {
  const payload = request.body || {}
  const client = await pool.connect()
  try {
    await client.query("begin")
    const current = await client.query(
      `select d.*,m.id merchant_id from daily_menu_items d join merchants m on m.id=d.merchant_id
       where d.id=$1 and d.tenant_slug=$2 and d.campus_slug=$3 for update of d`,
      [request.params.id, request.platform.tenant, request.platform.campus]
    )
    if (!current.rowCount) throw Object.assign(new Error("daily menu item not found"), {status: 404})
    const item = current.rows[0]
    const capacity = payload.capacity === undefined ? Number(item.capacity) : Number(payload.capacity)
    if (!Number.isInteger(capacity) || capacity < 0 || capacity > 100000) throw Object.assign(new Error("valid daily capacity required"), {status: 400})
    const status = payload.status === undefined ? item.status : text(payload.status, 20)
    if (!["active", "inactive"].includes(status)) throw Object.assign(new Error("invalid daily menu status"), {status: 400})
    const inventory = await client.query(
      "select reserved from lunch_inventory where service_date=$1 and product_id=$2 for update",
      [item.service_date, item.product_id]
    )
    if (inventory.rowCount && capacity < Number(inventory.rows[0].reserved)) {
      throw Object.assign(new Error("daily capacity cannot be below reserved orders"), {status: 409})
    }
    const result = await client.query(
      `update daily_menu_items set name=$1,description=$2,category=$3,price=$4,original_price=$5,capacity=$6,status=$7,sort_order=$8,updated_at=now()
       where id=$9 returning *`,
      [payload.name === undefined ? item.name : text(payload.name, 80), payload.description === undefined ? item.description : text(payload.description, 300),
        payload.category === undefined ? item.category : text(payload.category, 40), payload.price === undefined ? money(item.price) : money(payload.price),
        payload.originalPrice === undefined ? item.original_price : (payload.originalPrice === "" ? null : money(payload.originalPrice)), capacity, status,
        payload.sortOrder === undefined ? Number(item.sort_order) : Math.max(0, Math.min(1000, Number(payload.sortOrder) || 0)), item.id]
    )
    if (inventory.rowCount) {
      await client.query(
        "update lunch_inventory set capacity=$1,updated_at=now() where service_date=$2 and product_id=$3",
        [capacity, item.service_date, item.product_id]
      )
    }
    await audit(client, request.platform, "update_daily_menu", "daily_menu_item", item.id, {merchantId: item.merchant_id, serviceDate: item.service_date, status})
    await client.query("commit")
    response.json({item: presentNumericId(result.rows[0])})
  } catch (error) {
    await client.query("rollback")
    throw error
  } finally {
    client.release()
  }
}))

app.post("/v1/admin/merchants/:id/staff", requireAdmin, asyncRoute(async (request, response) => {
  const userId = Number(request.body.userId)
  const role = text(request.body.role, 20) || "operator"
  if (!Number.isInteger(userId) || !["owner", "manager", "operator"].includes(role)) return response.status(400).json({error: "valid user and role required"})
  const merchant = await pool.query("select id,campus_slug from merchants where id=$1 and tenant_slug=$2 and campus_slug=$3", [request.params.id, request.platform.tenant, request.platform.campus])
  if (!merchant.rowCount) return response.status(404).json({error: "merchant not found"})
  const result = await pool.query(
    `insert into merchant_staff(merchant_id,user_id,role,status) values($1,$2,$3,'active')
     on conflict(merchant_id,user_id) do update set role=excluded.role,status='active' returning *`,
    [merchant.rows[0].id, userId, role]
  )
  await audit(pool, request.platform, "assign", "merchant_staff", `${merchant.rows[0].id}:${userId}`, {role, campusSlug: merchant.rows[0].campus_slug})
  response.status(201).json({item: result.rows[0]})
}))

app.post("/v1/admin/couriers/:id/accounts", requireAdmin, asyncRoute(async (request, response) => {
  const userId = Number(request.body.userId)
  if (!Number.isInteger(userId)) return response.status(400).json({error: "valid user required"})
  const courier = await pool.query("select id from couriers where id=$1 and tenant_slug=$2 and campus_slug=$3 and status='active'", [request.params.id, request.platform.tenant, request.platform.campus])
  if (!courier.rowCount) return response.status(404).json({error: "courier not found"})
  const result = await pool.query(
    `insert into courier_accounts(courier_id,user_id,status) values($1,$2,'active')
     on conflict(courier_id,user_id) do update set status='active' returning *`,
    [courier.rows[0].id, userId]
  )
  await audit(pool, request.platform, "assign", "courier_account", `${courier.rows[0].id}:${userId}`)
  response.status(201).json({item: result.rows[0]})
}))

app.get("/v1/market/listings", asyncRoute(async (request, response) => {
  const scope = text(request.query.scope, 20)
  if (scope && !["favorites", "mine", "history"].includes(scope)) return response.status(400).json({error: "invalid listing scope"})
  const result = await pool.query(
    `select l.id,l.title,l.description,l.category,l.price,l.image_url,l.condition_label,l.status,l.created_at,
      l.vehicle_brand,l.vehicle_range_km,l.battery_year,l.registration_status,
      u.nickname author,(l.user_id=$3) mine,(l.user_id<>$3) can_chat,
      exists(select 1 from marketplace_favorites f where f.listing_id=l.id and f.user_id=$3) favorite,
      (select count(*)::int from marketplace_favorites f where f.listing_id=l.id) favorite_count,
      coalesce((select sum(v.view_count)::int from marketplace_views v where v.listing_id=l.id),0) view_count,
      (select i.status from marketplace_trade_intents i where i.listing_id=l.id and i.buyer_id=$3 limit 1) intent_status
     from marketplace_listings l join users u on u.id=l.user_id
     where l.tenant_slug=$1 and l.campus_slug=$2 and (l.status='active' or l.user_id=$3)
       and (
         $4='' or
         ($4='favorites' and exists(select 1 from marketplace_favorites f where f.listing_id=l.id and f.user_id=$3)) or
         ($4='mine' and l.user_id=$3) or
         ($4='history' and exists(select 1 from marketplace_views v where v.listing_id=l.id and v.user_id=$3))
       )
     order by case when $4='history' then (select v.last_viewed_at from marketplace_views v where v.listing_id=l.id and v.user_id=$3) end desc nulls last,l.created_at desc limit 100`,
    [request.platform.tenant, request.platform.campus, request.platform.user.id, scope]
  )
  response.json({items: result.rows})
}))

app.post("/v1/market/listings/:id/view", rateLimit("market-view", 120, 60 * 60_000), asyncRoute(async (request, response) => {
  const listing = await pool.query(
    "select id from marketplace_listings where id=$1 and tenant_slug=$2 and campus_slug=$3 and status in ('active','reserved','sold')",
    [request.params.id, request.platform.tenant, request.platform.campus]
  )
  if (!listing.rowCount) return response.status(404).json({error: "listing not found"})
  const result = await pool.query(
    `insert into marketplace_views(listing_id,user_id,tenant_slug,campus_slug)
     values($1,$2,$3,$4)
     on conflict(listing_id,user_id) do update set view_count=marketplace_views.view_count+1,last_viewed_at=now()
     returning view_count,last_viewed_at`,
    [request.params.id, request.platform.user.id, request.platform.tenant, request.platform.campus]
  )
  response.json({item: result.rows[0]})
}))

app.post("/v1/market/listings", asyncRoute(async (request, response) => {
  const title = text(request.body.title, 60)
  const description = text(request.body.description, 500)
  if (title.length < 2 || description.length < 5) return response.status(400).json({error: "title and description required"})
  const imageUrl = text(request.body.imageUrl, 500)
  if (imageUrl && !trustedUploadUrl(imageUrl)) return response.status(400).json({error: "listing image must be uploaded through this service"})
  const category = text(request.body.category, 30) || "其他"
  const vehicle = normalizeVehicleDetails(request.body, category)
  const safety = await checkUserText(request.platform, [title, description, category, request.body.conditionLabel, vehicle.vehicleBrand].filter(Boolean).join("\n"), {allowReview: true})
  const result = await pool.query(
    `insert into marketplace_listings(tenant_slug,campus_slug,user_id,title,description,category,price,image_url,condition_label,status,moderation_note,
       vehicle_brand,vehicle_range_km,battery_year,registration_status)
     values($1,$2,$3,$4,$5,$6,$7,$8,$9,'pending',$10,$11,$12,$13,$14) returning *`,
    [request.platform.tenant, request.platform.campus, request.platform.user.id, title, description, category, money(request.body.price), imageUrl || null, text(request.body.conditionLabel, 30) || "正常使用", safety.suggest === "review" ? "内容安全建议人工复核" : "", vehicle.vehicleBrand, vehicle.vehicleRangeKm, vehicle.batteryYear, vehicle.registrationStatus]
  )
  await audit(pool, request.platform, "create", "market_listing", result.rows[0].id, {contentSafety: contentSafetyDetail(safety)})
  response.status(201).json({item: result.rows[0], moderation: "pending_review"})
}))

app.post("/v1/market/listings/:id/favorite", asyncRoute(async (request, response) => {
  const listing = await pool.query("select id from marketplace_listings where id=$1 and tenant_slug=$2 and campus_slug=$3", [request.params.id, request.platform.tenant, request.platform.campus])
  if (!listing.rowCount) return response.status(404).json({error: "listing not found"})
  const found = await pool.query("select 1 from marketplace_favorites where listing_id=$1 and user_id=$2", [request.params.id, request.platform.user.id])
  if (found.rowCount) await pool.query("delete from marketplace_favorites where listing_id=$1 and user_id=$2", [request.params.id, request.platform.user.id])
  else await pool.query("insert into marketplace_favorites(listing_id,user_id) values($1,$2)", [request.params.id, request.platform.user.id])
  response.json({favorite: !found.rowCount})
}))

app.patch("/v1/market/listings/:id/status", asyncRoute(async (request, response) => {
  const status = text(request.body.status, 20)
  if (!["active", "sold"].includes(status)) return response.status(400).json({error: "invalid listing status"})
  const result = await pool.query(
    `update marketplace_listings set status=$1
     where id=$2 and tenant_slug=$3 and campus_slug=$4 and user_id=$5 and status in ('active','sold') returning id,status`,
    [status, request.params.id, request.platform.tenant, request.platform.campus, request.platform.user.id]
  )
  if (!result.rowCount) return response.status(404).json({error: "listing not found"})
  await audit(pool, request.platform, status === "sold" ? "complete" : "reopen", "market_listing", request.params.id)
  response.json({item: result.rows[0]})
}))

app.get("/v1/market/trade-intents", asyncRoute(async (request, response) => {
  const result = await pool.query(
    `select i.id,i.listing_id,i.status,i.created_at,i.updated_at,l.title,l.image_url,l.price,l.condition_label,
       buyer.nickname buyer_name,seller.nickname seller_name,(i.buyer_id=$3) buyer,(i.seller_id=$3) seller
     from marketplace_trade_intents i
     join marketplace_listings l on l.id=i.listing_id
     join users buyer on buyer.id=i.buyer_id join users seller on seller.id=i.seller_id
     where i.tenant_slug=$1 and i.campus_slug=$2 and (i.buyer_id=$3 or i.seller_id=$3)
     order by case i.status when 'requested' then 0 when 'accepted' then 1 else 2 end,i.updated_at desc limit 100`,
    [request.platform.tenant, request.platform.campus, request.platform.user.id]
  )
  response.json({items: result.rows})
}))

app.post("/v1/market/listings/:id/trade-intents", rateLimit("market-intent", 20, 60 * 60_000), asyncRoute(async (request, response) => {
  const listing = await pool.query(
    `select id,user_id,status from marketplace_listings
     where id=$1 and tenant_slug=$2 and campus_slug=$3 and status='active'`,
    [request.params.id, request.platform.tenant, request.platform.campus]
  )
  if (!listing.rowCount) return response.status(404).json({error: "商品不存在或已下架"})
  if (Number(listing.rows[0].user_id) === Number(request.platform.user.id)) return response.status(409).json({error: "不能购买自己发布的商品"})
  const result = await pool.query(
    `insert into marketplace_trade_intents(listing_id,tenant_slug,campus_slug,buyer_id,seller_id,status)
     values($1,$2,$3,$4,$5,'requested')
     on conflict(listing_id,buyer_id) do update set status='requested',updated_at=now()
     returning *`,
    [request.params.id, request.platform.tenant, request.platform.campus, request.platform.user.id, listing.rows[0].user_id]
  )
  await audit(pool, request.platform, "request", "market_trade_intent", result.rows[0].id, {listingId: request.params.id})
  response.status(201).json({item: result.rows[0]})
}))

app.patch("/v1/market/trade-intents/:id", asyncRoute(async (request, response) => {
  const status = text(request.body?.status, 20)
  if (!["accepted", "cancelled", "completed"].includes(status)) return response.status(400).json({error: "无效交易状态"})
  const client = await pool.connect()
  try {
    await client.query("begin")
    const found = await client.query(
      `select * from marketplace_trade_intents where id=$1 and tenant_slug=$2 and campus_slug=$3 for update`,
      [request.params.id, request.platform.tenant, request.platform.campus]
    )
    const intent = found.rows[0]
    if (!intent) throw Object.assign(new Error("交易意向不存在"), {status: 404})
    const isBuyer = Number(intent.buyer_id) === Number(request.platform.user.id)
    const isSeller = Number(intent.seller_id) === Number(request.platform.user.id)
    const allowed = (status === "accepted" && isSeller && intent.status === "requested") ||
      (status === "cancelled" && (isBuyer || isSeller) && ["requested", "accepted"].includes(intent.status)) ||
      (status === "completed" && isSeller && intent.status === "accepted")
    if (!allowed) throw Object.assign(new Error("当前状态不允许此操作"), {status: 409})
    const updated = await client.query(
      "update marketplace_trade_intents set status=$1,updated_at=now() where id=$2 returning *",
      [status, request.params.id]
    )
    if (status === "accepted") {
      await client.query("update marketplace_listings set status='reserved' where id=$1 and status='active'", [intent.listing_id])
      await client.query(
        "update marketplace_trade_intents set status='cancelled',updated_at=now() where listing_id=$1 and id<>$2 and status='requested'",
        [intent.listing_id, intent.id]
      )
    }
    if (status === "cancelled" && intent.status === "accepted") await client.query("update marketplace_listings set status='active' where id=$1 and status='reserved'", [intent.listing_id])
    if (status === "completed") await client.query("update marketplace_listings set status='sold' where id=$1", [intent.listing_id])
    await audit(client, request.platform, status, "market_trade_intent", intent.id, {listingId: intent.listing_id})
    await client.query("commit")
    response.json({item: updated.rows[0]})
  } catch (error) {
    await client.query("rollback")
    throw error
  } finally {
    client.release()
  }
}))

app.get("/v1/market/inspection-appointments", asyncRoute(async (request, response) => {
  const result = await pool.query(
    `select a.id,a.listing_id,a.requested_date,a.requested_slot,a.meeting_place,a.note,a.status,a.created_at,
      l.title,l.image_url,l.price,l.vehicle_brand,l.vehicle_range_km,l.battery_year,l.registration_status,
      buyer.nickname buyer_name,seller.nickname seller_name,(a.buyer_id=$3) buyer,(a.seller_id=$3) seller
     from marketplace_inspection_appointments a
     join marketplace_listings l on l.id=a.listing_id
     join users buyer on buyer.id=a.buyer_id join users seller on seller.id=a.seller_id
     where a.tenant_slug=$1 and a.campus_slug=$2 and (a.buyer_id=$3 or a.seller_id=$3)
     order by case a.status when 'requested' then 0 when 'confirmed' then 1 else 2 end,a.requested_date asc,a.created_at desc limit 100`,
    [request.platform.tenant, request.platform.campus, request.platform.user.id]
  )
  response.json({items: result.rows})
}))

app.post("/v1/market/listings/:id/inspection-appointments", rateLimit("market-inspection", 10, 60 * 60_000), asyncRoute(async (request, response) => {
  const appointment = normalizeInspectionAppointment(request.body)
  const listing = await pool.query(
    `select id,user_id,title from marketplace_listings
     where id=$1 and tenant_slug=$2 and campus_slug=$3 and category='电动车' and status='active'`,
    [request.params.id, request.platform.tenant, request.platform.campus]
  )
  if (!listing.rowCount) return response.status(404).json({error: "电动车车源不存在或已下架"})
  if (listing.rows[0].user_id === request.platform.user.id) return response.status(409).json({error: "不能预约自己发布的车辆"})
  const duplicate = await pool.query(
    `select id from marketplace_inspection_appointments
     where listing_id=$1 and buyer_id=$2 and status in ('requested','confirmed') limit 1`,
    [listing.rows[0].id, request.platform.user.id]
  )
  if (duplicate.rowCount) return response.status(409).json({error: "你已有一条待处理的验车预约"})
  const result = await pool.query(
    `insert into marketplace_inspection_appointments(tenant_slug,campus_slug,listing_id,buyer_id,seller_id,requested_date,requested_slot,meeting_place,note)
     values($1,$2,$3,$4,$5,$6,$7,$8,$9) returning *`,
    [request.platform.tenant, request.platform.campus, listing.rows[0].id, request.platform.user.id, listing.rows[0].user_id, appointment.requestedDate, appointment.requestedSlot, appointment.meetingPlace, appointment.note]
  )
  await audit(pool, request.platform, "create", "market_inspection", result.rows[0].id, {listingId: listing.rows[0].id})
  response.status(201).json({item: result.rows[0]})
}))

app.patch("/v1/market/inspection-appointments/:id", asyncRoute(async (request, response) => {
  const status = text(request.body?.status, 20)
  if (!new Set(["confirmed", "cancelled", "completed"]).has(status)) return response.status(400).json({error: "无效预约状态"})
  const result = await pool.query(
    `update marketplace_inspection_appointments set status=$1,updated_at=now()
     where id=$2 and tenant_slug=$3 and campus_slug=$4
       and (
         ($1='confirmed' and seller_id=$5 and status='requested') or
         ($1='completed' and seller_id=$5 and status='confirmed') or
         ($1='cancelled' and (buyer_id=$5 or seller_id=$5) and status in ('requested','confirmed'))
       ) returning *`,
    [status, request.params.id, request.platform.tenant, request.platform.campus, request.platform.user.id]
  )
  if (!result.rowCount) return response.status(409).json({error: "当前预约状态不允许此操作"})
  await audit(pool, request.platform, "update", "market_inspection", request.params.id, {status})
  response.json({item: result.rows[0]})
}))

app.get("/v1/errands", asyncRoute(async (request, response) => {
  const result = await pool.query(
    `select e.*,u.nickname creator_name,runner.nickname runner_name,
       (e.creator_id=$3) mine,(e.runner_id=$3) accepted_by_me,
       (select c.id from resource_conversations c
        where c.tenant_slug=e.tenant_slug and c.campus_slug=e.campus_slug
          and c.resource_type='errand' and c.resource_id=e.id::text
          and (c.initiator_id=$3 or c.participant_id=$3)
        order by c.updated_at desc limit 1) conversation_id
     from errands e join users u on u.id=e.creator_id left join users runner on runner.id=e.runner_id
     where e.tenant_slug=$1 and e.campus_slug=$2
     order by case e.status when 'open' then 0 when 'claimed' then 1 else 2 end,e.created_at desc limit 100`,
    [request.platform.tenant, request.platform.campus, request.platform.user.id]
  )
  response.json({items: result.rows.filter(item => [item.title, item.description, item.pickup_place, item.delivery_place].every(value => looksReadable(value)))})
}))

app.post("/v1/errands", rateLimit("errand-create", 12, 60 * 60_000), asyncRoute(async (request, response) => {
  const title = text(request.body.title, 60)
  const description = text(request.body.description, 500)
  const pickup = text(request.body.pickupPlace, 80)
  const delivery = text(request.body.deliveryPlace, 80)
  if (!title || description.length < 5 || !pickup || !delivery) return response.status(400).json({error: "incomplete errand"})
  if (![title, description, pickup, delivery].every(value => looksReadable(value))) return response.status(400).json({error: "任务文字异常，请重新输入"})
  const reward = money(request.body.reward)
  if (reward > 100) return response.status(400).json({error: "跑腿酬金不能超过 100 元"})
  if (pickup === delivery) return response.status(400).json({error: "取件点和送达位置不能相同"})
  const safety = await checkUserText(request.platform, [title, description, pickup, delivery, request.body.deadline].filter(Boolean).join("\n"))
  const result = await pool.query(
    `insert into errands(tenant_slug,campus_slug,creator_id,title,description,pickup_place,delivery_place,reward,deadline)
     values($1,$2,$3,$4,$5,$6,$7,$8,$9) returning *`,
    [request.platform.tenant, request.platform.campus, request.platform.user.id, title, description, pickup, delivery, reward, text(request.body.deadline, 60) || "尽快送达"]
  )
  await audit(pool, request.platform, "create", "errand", result.rows[0].id, {contentSafety: contentSafetyDetail(safety)})
  response.status(201).json({item: result.rows[0]})
}))

app.post("/v1/errands/:id/claim", asyncRoute(async (request, response) => {
  const result = await pool.query(
    `update errands set runner_id=$1,status='claimed' where id=$2 and tenant_slug=$3 and campus_slug=$4 and status='open' and creator_id<>$1 returning *`,
    [request.platform.user.id, request.params.id, request.platform.tenant, request.platform.campus]
  )
  if (!result.rowCount) return response.status(409).json({error: "task unavailable"})
  await audit(pool, request.platform, "claim", "errand", request.params.id)
  response.json({item: result.rows[0]})
}))

app.post("/v1/errands/:id/complete", asyncRoute(async (request, response) => {
  const client = await pool.connect()
  try {
    await client.query("begin")
    const found = await client.query(
      "select * from errands where id=$1 and tenant_slug=$2 and campus_slug=$3 for update",
      [request.params.id, request.platform.tenant, request.platform.campus]
    )
    const task = found.rows[0]
    if (!task || task.status !== "claimed" || (task.creator_id !== request.platform.user.id && task.runner_id !== request.platform.user.id)) {
      throw Object.assign(new Error("task cannot be confirmed"), {status: 409})
    }

    const role = task.creator_id === request.platform.user.id ? "creator" : "runner"
    const confirmed = await client.query(
      `update errands set
        creator_confirmed_at=case when creator_id=$3 then coalesce(creator_confirmed_at,now()) else creator_confirmed_at end,
        runner_confirmed_at=case when runner_id=$3 then coalesce(runner_confirmed_at,now()) else runner_confirmed_at end
       where id=$1 and tenant_slug=$2 and campus_slug=$4
       returning *`,
      [request.params.id, request.platform.tenant, request.platform.user.id, request.platform.campus]
    )
    let item = confirmed.rows[0]
    if (item.creator_confirmed_at && item.runner_confirmed_at) {
      item = (await client.query(
        "update errands set status='completed' where id=$1 and tenant_slug=$2 and campus_slug=$3 and status='claimed' returning *",
        [request.params.id, request.platform.tenant, request.platform.campus]
      )).rows[0]
    }
    await audit(client, request.platform, "confirm", "errand", request.params.id, {role, completed: item.status === "completed"})
    await client.query("commit")
    response.json({item})
  } catch (error) {
    await client.query("rollback")
    throw error
  } finally {
    client.release()
  }
}))

app.post("/v1/errands/:id/cancel", asyncRoute(async (request, response) => {
  const result = await pool.query(
    `update errands set status='cancelled'
     where id=$1 and tenant_slug=$2 and campus_slug=$3 and creator_id=$4 and status='open' returning *`,
    [request.params.id, request.platform.tenant, request.platform.campus, request.platform.user.id]
  )
  if (!result.rowCount) return response.status(409).json({error: "only unclaimed tasks can be cancelled"})
  await audit(pool, request.platform, "cancel", "errand", request.params.id)
  response.json({item: result.rows[0]})
}))

app.post("/v1/errands/:id/release", asyncRoute(async (request, response) => {
  const client = await pool.connect()
  try {
    await client.query("begin")
    const result = await client.query(
      `update errands set runner_id=null,status='open',creator_confirmed_at=null,runner_confirmed_at=null
       where id=$1 and tenant_slug=$2 and campus_slug=$3 and runner_id=$4 and status='claimed'
         and creator_confirmed_at is null and runner_confirmed_at is null
       returning *`,
      [request.params.id, request.platform.tenant, request.platform.campus, request.platform.user.id]
    )
    if (!result.rowCount) throw Object.assign(new Error("已开始交接的任务不能放弃"), {status: 409})
    await client.query(
      `update resource_conversations set status='closed',updated_at=now()
       where tenant_slug=$1 and campus_slug=$2 and resource_type='errand' and resource_id=$3
         and (initiator_id=$4 or participant_id=$4)`,
      [request.platform.tenant, request.platform.campus, request.params.id, request.platform.user.id]
    )
    await audit(client, request.platform, "release", "errand", request.params.id)
    await client.query("commit")
    response.json({item: result.rows[0]})
  } catch (error) {
    await client.query("rollback")
    throw error
  } finally {
    client.release()
  }
}))

app.get("/v1/express/packages", asyncRoute(async (request, response) => {
  const result = await pool.query(
    "select * from express_packages where tenant_slug=$1 and campus_slug=$2 and user_id=$3 order by created_at desc limit 100",
    [request.platform.tenant, request.platform.campus, request.platform.user.id]
  )
  response.json({items: result.rows.map(presentExpressPackage)})
}))

app.get("/v1/express/binding", asyncRoute(async (request, response) => {
  const result = await pool.query(
    `select phone_encrypted,provider_status,bound_at,updated_at from express_bindings
     where user_id=$1 and tenant_slug=$2 and campus_slug=$3 and status='active'`,
    [request.platform.user.id, request.platform.tenant, request.platform.campus]
  )
  if (!result.rowCount) return response.json({binding: null, autoSyncReady: false, providerName: expressProviderName})
  const item = result.rows[0]
  response.json({
    binding: {phoneMasked: maskPhone(revealPii(item.phone_encrypted)), providerStatus: item.provider_status, boundAt: item.bound_at, updatedAt: item.updated_at},
    autoSyncReady: Boolean(expressWebhookSecret),
    providerName: expressProviderName
  })
}))

app.post("/v1/express/recognize-notice", rateLimit("express-notice-recognition", 12, 10 * 60_000), asyncRoute(async (request, response) => {
  const noticeText = text(request.body?.text, 4000)
  let item = noticeText ? parseExpressNotice(noticeText) : null
  if (!item && request.body?.imageUrl) {
    const imageUrl = trustedUploadUrl(request.body.imageUrl)
    if (!imageUrl) return response.status(400).json({error: "请上传有效的取件通知截图"})
    const pathname = imageUrl.startsWith("http") ? new URL(imageUrl).pathname : imageUrl
    const filename = path.basename(pathname)
    const filePath = path.resolve(uploadDir, filename)
    const uploadRoot = `${path.resolve(uploadDir)}${path.sep}`
    if (!filePath.startsWith(uploadRoot)) return response.status(400).json({error: "invalid express notice image"})
    const extension = path.extname(filename).toLowerCase()
    const mimeType = extension === ".png" ? "image/png" : extension === ".webp" ? "image/webp" : "image/jpeg"
    let buffer
    try { buffer = await fs.promises.readFile(filePath) } catch { return response.status(404).json({error: "通知截图不存在，请重新上传"}) }
    item = await expressNoticeRecognizer.recognizeImage({buffer, mimeType})
  }
  if (!item) return response.status(422).json({error: "没有识别到取件码，请复制完整通知或选择清晰截图"})
  response.json({item, provider: "星尘智能识别"})
}))

app.post("/v1/express/import-notice", rateLimit("express-notice-import", 30, 60 * 60_000), asyncRoute(async (request, response) => {
  const item = parseExpressNotice(JSON.stringify({
    carrier: text(request.body?.carrier, 30),
    trackingNo: text(request.body?.trackingNo, 80),
    pickupCode: text(request.body?.pickupCode, 40),
    station: text(request.body?.station, 80)
  }))
  if (!item) return response.status(400).json({error: "取件通知信息不完整"})
  const noticeEventId = `notice-${hashToken([
    request.platform.user.id,
    item.carrier,
    item.trackingNo,
    item.pickupCode,
    item.station
  ].join("|"))}`
  const result = await pool.query(
    `insert into express_packages(
       tenant_slug,campus_slug,user_id,carrier,tracking_no,pickup_code,pickup_code_encrypted,
       station,status,source,provider_event_id,updated_at
     ) values($1,$2,$3,$4,$5,'',$6,$7,'waiting','notice',$8,now())
     on conflict(tenant_slug,campus_slug,provider_event_id) where provider_event_id is not null do nothing
     returning *`,
    [request.platform.tenant, request.platform.campus, request.platform.user.id, item.carrier, item.trackingNo, protectPii(item.pickupCode), item.station, noticeEventId]
  )
  if (!result.rowCount) return response.status(409).json({error: "这个取件通知已经导入，无需重复添加"})
  await audit(pool, request.platform, "import_notice", "express_package", result.rows[0].id)
  response.status(201).json({item: presentExpressPackage(result.rows[0])})
}))

app.post("/v1/express/binding", rateLimit("express-phone-binding", 8, 10 * 60_000), asyncRoute(async (request, response) => {
  const code = text(request.body?.code, 300)
  const phone = await wechatPhoneService.resolvePhone(code)
  const phoneHash = hashIdentity(phone, identityHashSecret)
  const conflict = await pool.query(
    `select user_id from express_bindings
     where tenant_slug=$1 and campus_slug=$2 and phone_hash=$3 and status='active' and user_id<>$4`,
    [request.platform.tenant, request.platform.campus, phoneHash, request.platform.user.id]
  )
  if (conflict.rowCount) return response.status(409).json({error: "该手机号已绑定其他校园账号，请先联系运营人员解绑"})
  const providerStatus = expressWebhookSecret ? "active" : "pending_provider"
  const result = await pool.query(
    `insert into express_bindings(user_id,tenant_slug,campus_slug,phone_encrypted,phone_hash,status,provider_status,bound_at,updated_at)
     values($1,$2,$3,$4,$5,'active',$6,now(),now())
     on conflict(user_id,tenant_slug,campus_slug) do update set
       phone_encrypted=excluded.phone_encrypted,phone_hash=excluded.phone_hash,status='active',
       provider_status=excluded.provider_status,bound_at=now(),updated_at=now()
     returning phone_encrypted,provider_status,bound_at,updated_at`,
    [request.platform.user.id, request.platform.tenant, request.platform.campus, protectPii(phone), phoneHash, providerStatus]
  )
  await audit(pool, request.platform, "bind", "express_binding", request.platform.user.id, {providerStatus})
  const item = result.rows[0]
  response.status(201).json({
    binding: {phoneMasked: maskPhone(phone), providerStatus: item.provider_status, boundAt: item.bound_at, updatedAt: item.updated_at},
    autoSyncReady: Boolean(expressWebhookSecret),
    providerName: expressProviderName
  })
}))

app.delete("/v1/express/binding", asyncRoute(async (request, response) => {
  await pool.query(
    `update express_bindings set status='revoked',provider_status='paused',updated_at=now()
     where user_id=$1 and tenant_slug=$2 and campus_slug=$3`,
    [request.platform.user.id, request.platform.tenant, request.platform.campus]
  )
  await audit(pool, request.platform, "unbind", "express_binding", request.platform.user.id)
  response.status(204).end()
}))

app.post("/v1/express/packages", asyncRoute(async (request, response) => {
  const carrier = text(request.body.carrier, 30)
  const tracking = text(request.body.trackingNo, 80)
  const status = expressPackageStatus(request.body.status, "waiting")
  if (!carrier || tracking.length < 5) return response.status(400).json({error: "carrier and tracking number required"})
  if (!status) return response.status(400).json({error: "invalid package status"})
  const result = await pool.query(
    `insert into express_packages(tenant_slug,campus_slug,user_id,carrier,tracking_no,pickup_code,pickup_code_encrypted,station,status,source,updated_at)
     values($1,$2,$3,$4,$5,'',$6,$7,$8,'manual',now()) returning *`,
    [request.platform.tenant, request.platform.campus, request.platform.user.id, carrier, tracking, protectPii(text(request.body.pickupCode, 40)), text(request.body.station, 80) || "校内快递点", status]
  )
  response.status(201).json({item: presentExpressPackage(result.rows[0]), note: "此接口仅保留为运营兜底；学生端默认使用手机号绑定自动同步"})
}))

app.patch("/v1/express/packages/:id/picked", asyncRoute(async (request, response) => {
  const result = await pool.query(
    "update express_packages set status='picked' where id=$1 and tenant_slug=$2 and campus_slug=$3 and user_id=$4 returning *",
    [request.params.id, request.platform.tenant, request.platform.campus, request.platform.user.id]
  )
  if (!result.rowCount) return response.status(404).json({error: "package not found"})
  response.json({item: presentExpressPackage(result.rows[0])})
}))

app.get("/v1/jobs", asyncRoute(async (request, response) => {
  const result = await pool.query(
    `select j.*,j.salary_text pay_label,''::text deadline,
      u.nickname poster_name,(j.poster_user_id is not null and j.poster_user_id<>$3) can_chat,
      coalesce((select a.status from job_applications a where a.job_id=j.id and a.user_id=$3),'') application_status,
      exists(select 1 from job_applications a where a.job_id=j.id and a.user_id=$3 and a.status='submitted') applied
     from jobs j left join users u on u.id=j.poster_user_id
     where j.tenant_slug=$1 and j.campus_slug=$2 and j.status='active' order by j.verified desc,j.created_at desc`,
    [request.platform.tenant, request.platform.campus, request.platform.user.id]
  )
  response.json({items: result.rows})
}))

app.post("/v1/jobs/:id/apply", asyncRoute(async (request, response) => {
  const result = await pool.query(
    `insert into job_applications(job_id,user_id,message,status)
     select id,$2,$3,'submitted' from jobs where id=$1 and tenant_slug=$4 and campus_slug=$5 and status='active'
     on conflict(job_id,user_id) do update set message=excluded.message,status='submitted',created_at=now()
     returning job_id,status`,
    [request.params.id, request.platform.user.id, text(request.body.message, 300), request.platform.tenant, request.platform.campus]
  )
  if (!result.rowCount) return response.status(404).json({error: "job not found"})
  await audit(pool, request.platform, "apply", "job", request.params.id)
  response.json({applied: true, application: result.rows[0]})
}))

app.post("/v1/jobs/:id/withdraw", asyncRoute(async (request, response) => {
  const result = await pool.query(
    `update job_applications a set status='withdrawn'
     from jobs j where a.job_id=j.id and a.job_id=$1 and a.user_id=$2 and j.tenant_slug=$3 and a.status='submitted'
       and j.campus_slug=$4
     returning a.job_id,a.status`,
    [request.params.id, request.platform.user.id, request.platform.tenant, request.platform.campus]
  )
  if (!result.rowCount) return response.status(409).json({error: "application cannot be withdrawn"})
  await audit(pool, request.platform, "withdraw", "job", request.params.id)
  response.json({withdrawn: true, application: result.rows[0]})
}))

app.get("/v1/job-postings/mine", asyncRoute(async (request, response) => {
  const result = await pool.query(
    `select id,order_no,job_id,title,organization,location,salary_text,description,amount_cents,status,
       payment_status,contact_confirmed_at,moderation_note,created_at,updated_at
     from job_posting_orders
     where tenant_slug=$1 and campus_slug=$2 and user_id=$3
     order by created_at desc limit 50`,
    [request.platform.tenant, request.platform.campus, request.platform.user.id]
  )
  response.json({items: result.rows, feeCents: 1000, paymentConfigured: checkoutMode === "wechat" && wechatPayConfigured()})
}))

app.post("/v1/job-postings", rateLimit("job-posting", 10, 60 * 60_000), asyncRoute(async (request, response) => {
  if (checkoutMode !== "wechat" || !wechatPayConfigured()) {
    return response.status(409).json({error: "付费兼职发布暂未开放，请等待微信支付与退款通道配置完成"})
  }
  const title = text(request.body?.title, 80)
  const organization = text(request.body?.organization, 80)
  const location = text(request.body?.location, 100)
  const salaryText = text(request.body?.salaryText, 80)
  const description = text(request.body?.description, 800)
  if (title.length < 2 || organization.length < 2 || location.length < 2 || salaryText.length < 2 || description.length < 10) {
    return response.status(400).json({error: "请完整填写岗位、发布方、地点、报酬和工作说明"})
  }
  const safety = await checkUserText(request.platform, [title, organization, location, salaryText, description].join("\n"))
  const result = await pool.query(
    `insert into job_posting_orders(
       order_no,tenant_slug,campus_slug,user_id,title,organization,location,salary_text,description,amount_cents,status,payment_status
     ) values($1,$2,$3,$4,$5,$6,$7,$8,$9,1000,'payment_required','unpaid') returning *`,
    [jobPostingOrderNumber(), request.platform.tenant, request.platform.campus, request.platform.user.id, title, organization, location, salaryText, description]
  )
  await audit(pool, request.platform, "create", "job_posting_order", result.rows[0].id, {amountCents: 1000, contentSafety: contentSafetyDetail(safety)})
  response.status(201).json({item: result.rows[0], payment: {enabled: checkoutMode === "wechat" && wechatPayConfigured(), amountCents: 1000}})
}))

app.post("/v1/job-postings/:id/payment-intent", asyncRoute(async (request, response) => {
  if (checkoutMode !== "wechat" || !wechatPayConfigured()) {
    return response.status(409).json({error: "微信支付尚未配置，发布单已保存但不会进入审核"})
  }
  const result = await pool.query(
    `select p.*,u.wechat_openid from job_posting_orders p join users u on u.id=p.user_id
     where p.id=$1 and p.tenant_slug=$2 and p.campus_slug=$3 and p.user_id=$4
       and p.status='payment_required' and p.payment_status in ('unpaid','failed','pending')`,
    [request.params.id, request.platform.tenant, request.platform.campus, request.platform.user.id]
  )
  if (!result.rowCount) return response.status(409).json({error: "该发布单当前不能支付"})
  const posting = result.rows[0]
  const openid = revealPii(posting.wechat_openid)
  if (!openid) return response.status(409).json({error: "支付前需要完成微信登录"})
  await pool.query("update job_posting_orders set payment_status='pending',updated_at=now() where id=$1", [posting.id])
  const payment = await createWechatJsapiPayment({
    description: `校园兼职发布服务 ${posting.order_no}`,
    orderNo: posting.order_no,
    amountCents: posting.amount_cents,
    openid
  })
  if (!payment.ok) {
    await pool.query(
      `insert into job_posting_payment_attempts(posting_order_id,status,amount_cents,request_payload,response_payload)
       values($1,'failed',$2,$3,$4)`,
      [posting.id, posting.amount_cents, payment.requestPayload, payment.payload]
    )
    await pool.query("update job_posting_orders set payment_status='failed',updated_at=now() where id=$1 and payment_status='pending'", [posting.id])
    return response.status(502).json({error: "支付服务暂不可用，请稍后重试"})
  }
  await pool.query(
    `insert into job_posting_payment_attempts(posting_order_id,status,provider_reference,amount_cents,request_payload,response_payload)
     values($1,'prepay_created',$2,$3,$4,$5)`,
    [posting.id, payment.payload.prepay_id, posting.amount_cents, payment.requestPayload, payment.payload]
  )
  response.json({paymentParams: payment.paymentParams, expiresInSeconds: paymentPendingMinutes * 60})
}))

app.get("/v1/job-postings/:id/contact", asyncRoute(async (request, response) => {
  const posting = await pool.query(
    `select id,status,payment_status from job_posting_orders
     where id=$1 and tenant_slug=$2 and campus_slug=$3 and user_id=$4 and payment_status='paid'`,
    [request.params.id, request.platform.tenant, request.platform.campus, request.platform.user.id]
  )
  if (!posting.rowCount) return response.status(403).json({error: "支付成功后才会显示运营联系方式"})
  const settings = await pool.query(
    `select setting_key,setting_value from campus_settings
     where tenant_slug=$1 and campus_slug=$2 and setting_key in ('operator_wechat','operator_qr_url','operator_contact_note')`,
    [request.platform.tenant, request.platform.campus]
  )
  const contact = Object.fromEntries(settings.rows.map(item => [item.setting_key, item.setting_value]))
  if (!contact.operator_wechat) return response.status(409).json({error: "当前校区尚未配置运营微信，请联系平台管理员"})
  response.json({contact: {wechat: contact.operator_wechat, qrUrl: contact.operator_qr_url || "", note: contact.operator_contact_note || "支付后请添加运营微信并说明发布单号"}})
}))

app.post("/v1/job-postings/:id/cancel", asyncRoute(async (request, response) => {
  const result = await pool.query(
    `update job_posting_orders set status='cancelled',updated_at=now()
     where id=$1 and tenant_slug=$2 and campus_slug=$3 and user_id=$4
       and status='payment_required' and payment_status in ('unpaid','failed') returning id,status`,
    [request.params.id, request.platform.tenant, request.platform.campus, request.platform.user.id]
  )
  if (!result.rowCount) return response.status(409).json({error: "该发布单不能取消"})
  await audit(pool, request.platform, "cancel", "job_posting_order", request.params.id)
  response.json({item: result.rows[0]})
}))

async function resolveConversationResource(client, platform, resourceType, resourceId) {
  if (resourceType === "user_profile") {
    const result = await client.query(
      `select u.public_id resource_id,u.id owner_id,u.nickname resource_title,'个人主页' resource_summary
       from users u where u.public_id=$1 and exists(
         select 1 from user_campus_memberships m where m.user_id=u.id and m.tenant_slug=$2 and m.status='active'
       )`,
      [resourceId, platform.tenant]
    )
    return result.rows[0]
  }
  if (resourceType === "market_listing") {
    const result = await client.query(
      `select id::text resource_id,user_id owner_id,title resource_title,description resource_summary
       from marketplace_listings where id::text=$1 and tenant_slug=$2 and campus_slug=$3 and status in ('active','reserved','sold')`,
      [resourceId, platform.tenant, platform.campus]
    )
    return result.rows[0]
  }
  if (resourceType === "job") {
    const result = await client.query(
      `select id::text resource_id,poster_user_id owner_id,title resource_title,organization resource_summary
       from jobs where id::text=$1 and tenant_slug=$2 and campus_slug=$3 and status='active' and poster_user_id is not null`,
      [resourceId, platform.tenant, platform.campus]
    )
    return result.rows[0]
  }
  if (resourceType === "lost_post") {
    const result = await client.query(
      `select id::text resource_id,user_id owner_id,left(content,40) resource_title,location resource_summary
       from community_posts where id::text=$1 and tenant_slug=$2 and status='active' and channel='失物'`,
      [resourceId, platform.tenant]
    )
    return result.rows[0]
  }
  if (resourceType === "community_post") {
    const result = await client.query(
      `select id::text resource_id,user_id owner_id,left(content,40) resource_title,
         concat(channel,' · ',location) resource_summary
       from community_posts where id::text=$1 and tenant_slug=$2 and status='active'`,
      [resourceId, platform.tenant]
    )
    return result.rows[0]
  }
  if (resourceType === "errand") {
    const result = await client.query(
      `select id::text resource_id,creator_id owner_id,title resource_title,
         concat(pickup_place,' → ',delivery_place) resource_summary
       from errands where id::text=$1 and tenant_slug=$2 and campus_slug=$3
         and status in ('open','claimed') and (status='open' or creator_id=$4 or runner_id=$4)`,
      [resourceId, platform.tenant, platform.campus, platform.user.id]
    )
    return result.rows[0]
  }
  return null
}

app.post("/v1/conversations", rateLimit("conversation-start", 30, 60_000), asyncRoute(async (request, response) => {
  const resourceType = text(request.body?.resourceType, 30)
  const resourceId = text(request.body?.resourceId, 80)
  if (!resourceId || !["market_listing", "job", "lost_post", "errand", "community_post", "user_profile"].includes(resourceType)) return response.status(400).json({error: "无效的沟通对象"})
  if (["community_post", "user_profile"].includes(resourceType)) {
    const viewer = await pool.query("select phone_verified_at from users where id=$1", [request.platform.user.id])
    if (!viewer.rows[0]?.phone_verified_at) return response.status(403).json({error: "请先使用手机号登录"})
  }
  const resource = await resolveConversationResource(pool, request.platform, resourceType, resourceId)
  if (!resource || !resource.owner_id) return response.status(404).json({error: "该内容暂不支持直接沟通"})
  const schoolWideConversation = ["community_post", "user_profile", "lost_post"].includes(resourceType)
  const existing = await pool.query(
    `select id,resource_type,resource_id,status,created_at from resource_conversations
     where tenant_slug=$1 and ($2 or campus_slug=$3) and resource_type=$4 and resource_id=$5
       and ((initiator_id=$6 and participant_id=$7) or (initiator_id=$7 and participant_id=$6))
     order by updated_at desc limit 1`,
    [request.platform.tenant, schoolWideConversation, request.platform.campus, resourceType, resource.resource_id, request.platform.user.id, resource.owner_id]
  )
  if (existing.rowCount) {
    if (existing.rows[0].status === "closed") await pool.query("update resource_conversations set status='active',updated_at=now() where id=$1", [existing.rows[0].id])
    return response.json({item: {...existing.rows[0], status: "active", resource_title: resource.resource_title, resource_summary: resource.resource_summary}})
  }
  if (Number(resource.owner_id) === Number(request.platform.user.id)) return response.status(400).json({error: "暂无可沟通的对方"})
  const result = await pool.query(
    `insert into resource_conversations(
       tenant_slug,campus_slug,resource_type,resource_id,initiator_id,participant_id,status,last_message_at
     ) values($1,$2,$3,$4,$5,$6,'active',now())
     on conflict(tenant_slug,campus_slug,resource_type,resource_id,initiator_id,participant_id)
     do update set status='active',updated_at=now()
     returning id,resource_type,resource_id,status,created_at`,
    [request.platform.tenant, request.platform.campus, resourceType, resource.resource_id, request.platform.user.id, resource.owner_id]
  )
  await audit(pool, request.platform, "start", "conversation", result.rows[0].id, {resourceType, resourceId})
  response.status(201).json({item: {...result.rows[0], resource_title: resource.resource_title, resource_summary: resource.resource_summary}})
}))

app.get("/v1/conversations", asyncRoute(async (request, response) => {
  const result = await pool.query(
    `select c.id,c.resource_type,c.resource_id,c.status,c.last_message_at,c.created_at,
       case when c.resource_type='match' then coalesce((
         select p.anonymous_name from match_profiles p
         where p.tenant_slug=c.tenant_slug and p.campus_slug=c.campus_slug
           and p.user_id=case when c.initiator_id=$3 then c.participant_id else c.initiator_id end
       ),'匿名同学') else case when c.initiator_id=$3 then participant.nickname else initiator.nickname end end peer_name,
       case c.resource_type
         when 'market_listing' then (select title from marketplace_listings where id::text=c.resource_id)
         when 'job' then (select title from jobs where id::text=c.resource_id)
         when 'lost_post' then (select left(content,40) from community_posts where id::text=c.resource_id)
         when 'community_post' then (select left(content,40) from community_posts where id::text=c.resource_id)
         when 'user_profile' then '个人主页私信'
         when 'errand' then (select title from errands where id::text=c.resource_id)
         when 'match' then '匿名匹配'
       end resource_title,
       (select content from conversation_messages where conversation_id=c.id order by created_at desc limit 1) last_message,
       (select count(*)::int from conversation_messages m where m.conversation_id=c.id and m.sender_id<>$3 and m.read_at is null) unread_count
     from resource_conversations c
     join users initiator on initiator.id=c.initiator_id
     join users participant on participant.id=c.participant_id
     where c.tenant_slug=$1 and (c.resource_type in ('community_post','user_profile','lost_post') or c.campus_slug=$2)
       and (c.initiator_id=$3 or c.participant_id=$3)
     order by c.last_message_at desc limit 100`,
    [request.platform.tenant, request.platform.campus, request.platform.user.id]
  )
  response.json({items: result.rows})
}))

app.post("/v1/conversations/read-all", rateLimit("conversation-read-all", 20, 60_000), asyncRoute(async (request, response) => {
  const result = await pool.query(
    `update conversation_messages m set read_at=coalesce(m.read_at,now())
     from resource_conversations c
     where m.conversation_id=c.id and c.tenant_slug=$1
       and (c.resource_type in ('community_post','user_profile','lost_post') or c.campus_slug=$2)
       and (c.initiator_id=$3 or c.participant_id=$3)
       and m.sender_id<>$3 and m.read_at is null
     returning m.id`,
    [request.platform.tenant, request.platform.campus, request.platform.user.id]
  )
  response.json({updated: result.rowCount})
}))

app.get("/v1/conversations/:id/messages", asyncRoute(async (request, response) => {
  const conversation = await pool.query(
    `select c.id,c.resource_type,c.resource_id,c.status,c.initiator_id,
       case when c.initiator_id=$4 then c.participant_id else c.initiator_id end peer_id,
       case when c.initiator_id=$4 then participant.public_id else initiator.public_id end peer_public_id,
       case when c.initiator_id=$4 then participant.nickname else initiator.nickname end peer_name,
       case c.resource_type
         when 'market_listing' then (select title from marketplace_listings where id::text=c.resource_id)
         when 'job' then (select title from jobs where id::text=c.resource_id)
         when 'lost_post' then (select left(content,40) from community_posts where id::text=c.resource_id)
         when 'community_post' then (select left(content,40) from community_posts where id::text=c.resource_id)
         when 'user_profile' then '个人主页私信'
         when 'errand' then (select title from errands where id::text=c.resource_id)
         when 'match' then '匿名匹配'
       end resource_title,
       case c.resource_type
         when 'market_listing' then (select concat('¥',price,' · ',condition_label) from marketplace_listings where id::text=c.resource_id)
         when 'job' then (select concat(organization,' · ',location) from jobs where id::text=c.resource_id)
         when 'lost_post' then (select location from community_posts where id::text=c.resource_id)
         when 'community_post' then (select concat(channel,' · ',location) from community_posts where id::text=c.resource_id)
         when 'user_profile' then '互关后可自由聊天'
         when 'errand' then (select concat(pickup_place,' → ',delivery_place) from errands where id::text=c.resource_id)
         when 'match' then '只显示匿名资料'
       end resource_summary
     from resource_conversations c
     join users initiator on initiator.id=c.initiator_id join users participant on participant.id=c.participant_id
     where c.id=$1 and c.tenant_slug=$2
       and (c.resource_type in ('community_post','user_profile','lost_post') or c.campus_slug=$3)
       and (c.initiator_id=$4 or c.participant_id=$4)`,
    [request.params.id, request.platform.tenant, request.platform.campus, request.platform.user.id]
  )
  if (!conversation.rowCount) return response.status(404).json({error: "会话不存在"})
  await pool.query(
    `update conversation_messages set read_at=coalesce(read_at,now())
     where conversation_id=$1 and sender_id<>$2 and read_at is null`,
    [request.params.id, request.platform.user.id]
  )
  const messages = await pool.query(
    `select m.id,m.content,m.created_at,m.read_at,m.sender_id,(m.sender_id=$2) mine,
       case when $3='match' then coalesce((select p.anonymous_name from match_profiles p
         where p.tenant_slug=$4 and p.campus_slug=$5 and p.user_id=m.sender_id),'匿名同学') else u.nickname end sender_name
     from conversation_messages m join users u on u.id=m.sender_id
     where m.conversation_id=$1 order by m.created_at asc limit 300`,
    [request.params.id, request.platform.user.id, conversation.rows[0].resource_type, request.platform.tenant, request.platform.campus]
  )
  const row = conversation.rows[0]
  const permission = await pool.query(
    `select
       exists(select 1 from community_follows where tenant_slug=$1 and follower_id=$2 and followed_id=$3)
       and exists(select 1 from community_follows where tenant_slug=$1 and follower_id=$3 and followed_id=$2) mutual_following,
       (select count(*)::int from conversation_messages where conversation_id=$4) message_count,
       (select initiator_id from resource_conversations where id=$4) initiator_id`,
    [request.platform.tenant, request.platform.user.id, Number(row.peer_id), request.params.id]
  )
  const access = permission.rows[0]
  const canSend = canSendSocialMessage({resourceType:row.resource_type,status:row.status,mutualFollowing:access.mutual_following,
    initiatorId:access.initiator_id,userId:request.platform.user.id,messageCount:access.message_count})
  response.json({conversation: {...row, mutual_following: access.mutual_following, can_send: canSend,
    message_limit_reason: canSend || access.mutual_following ? "" : "双方互相关注后可继续聊天"}, items: messages.rows})
}))

app.post("/v1/conversations/:id/messages", rateLimit("conversation-message", 120, 60_000), asyncRoute(async (request, response) => {
  const content = text(request.body?.content, 600)
  if (!content) return response.status(400).json({error: "消息内容不能为空"})
  const safety = await checkUserText(request.platform, content)
  const conversation = await pool.query(
    `select id,initiator_id,participant_id,resource_type from resource_conversations
     where id=$1 and tenant_slug=$2
       and (resource_type in ('community_post','user_profile','lost_post') or campus_slug=$3)
       and status='active' and (initiator_id=$4 or participant_id=$4)`,
    [request.params.id, request.platform.tenant, request.platform.campus, request.platform.user.id]
  )
  if (!conversation.rowCount) return response.status(404).json({error: "会话不可用"})
  const chat = conversation.rows[0]
  const mutual = await pool.query(
    `select exists(select 1 from community_follows where tenant_slug=$1 and follower_id=$2 and followed_id=$3)
       and exists(select 1 from community_follows where tenant_slug=$1 and follower_id=$3 and followed_id=$2) allowed`,
    [request.platform.tenant, chat.initiator_id, chat.participant_id]
  )
  const count = await pool.query("select count(*)::int count from conversation_messages where conversation_id=$1", [request.params.id])
  if (!canSendSocialMessage({resourceType:chat.resource_type,mutualFollowing:mutual.rows[0].allowed,
    initiatorId:chat.initiator_id,userId:request.platform.user.id,messageCount:count.rows[0].count})) {
    return response.status(409).json({error: "未互关前只能发送一条问候，双方互关后可继续聊天"})
  }
  const result = await pool.query(
    `insert into conversation_messages(conversation_id,sender_id,content) values($1,$2,$3)
     returning id,conversation_id,sender_id,content,read_at,created_at`,
    [request.params.id, request.platform.user.id, content]
  )
  await pool.query("update resource_conversations set last_message_at=now(),updated_at=now() where id=$1", [request.params.id])
  if (safety.checked) await audit(pool, request.platform, "content_safety_pass", "conversation_message", result.rows[0].id, {contentSafety: contentSafetyDetail(safety)})
  response.status(201).json({item: {...result.rows[0], mine: true}})
}))

app.post("/v1/conversations/:id/reports", rateLimit("conversation-report", 8, 60 * 60_000), asyncRoute(async (request, response) => {
  const reason = text(request.body?.reason, 80)
  const detail = text(request.body?.detail, 300)
  if (reason.length < 2) return response.status(400).json({error: "请填写举报原因"})
  const conversation = await pool.query(
    `select id from resource_conversations
     where id=$1 and tenant_slug=$2
       and (resource_type in ('community_post','user_profile','lost_post') or campus_slug=$3)
       and (initiator_id=$4 or participant_id=$4)`,
    [request.params.id, request.platform.tenant, request.platform.campus, request.platform.user.id]
  )
  if (!conversation.rowCount) return response.status(404).json({error: "会话不存在"})
  await pool.query(
    `insert into conversation_reports(tenant_slug,campus_slug,conversation_id,reporter_id,reason,detail)
     values($1,$2,$3,$4,$5,$6)
     on conflict(conversation_id,reporter_id) do update set reason=excluded.reason,detail=excluded.detail,status='open',handled_at=null,handled_by=null`,
    [request.platform.tenant, request.platform.campus, request.params.id, request.platform.user.id, reason, detail]
  )
  await audit(pool, request.platform, "report", "conversation", request.params.id, {reason})
  response.status(201).json({reported: true})
}))

app.post("/v1/conversations/:id/close", rateLimit("conversation-close", 30, 60_000), asyncRoute(async (request, response) => {
  const result = await pool.query(
    `update resource_conversations set status='closed',updated_at=now()
     where id=$1 and tenant_slug=$2
       and (resource_type in ('community_post','user_profile','lost_post') or campus_slug=$3)
       and (initiator_id=$4 or participant_id=$4)
     returning id,status`,
    [request.params.id, request.platform.tenant, request.platform.campus, request.platform.user.id]
  )
  if (!result.rowCount) return response.status(404).json({error: "会话不存在"})
  await audit(pool, request.platform, "close", "conversation", request.params.id)
  response.json({item: result.rows[0]})
}))

app.get("/v1/campus/contact", asyncRoute(async (request, response) => {
  const purpose = text(request.query?.purpose, 30)
  if (purpose !== "ebike") return response.status(400).json({error: "无效的联系用途"})
  const settings = await pool.query(
    `select setting_key,setting_value from campus_settings
     where tenant_slug=$1 and campus_slug=$2 and setting_key in ('operator_wechat','operator_qr_url','operator_contact_note','ebike_contact_enabled')`,
    [request.platform.tenant, request.platform.campus]
  )
  const values = Object.fromEntries(settings.rows.map(item => [item.setting_key, item.setting_value]))
  if (values.ebike_contact_enabled !== "true" || !values.operator_wechat) return response.status(409).json({error: "当前校区暂未开放电动车咨询"})
  response.json({contact: {wechat: values.operator_wechat, qrUrl: values.operator_qr_url || "", note: values.operator_contact_note || "添加时请备注二手电动车咨询"}})
}))

app.get("/v1/events", asyncRoute(async (request, response) => {
  const result = await pool.query(
    `select e.*,count(s.user_id) filter(where s.status='signed')::int signup_count,
      coalesce((select mine.status from event_signups mine where mine.event_id=e.id and mine.user_id=$3),'') signup_status,
      exists(select 1 from event_signups mine where mine.event_id=e.id and mine.user_id=$3 and mine.status='signed') signed
     from events e left join event_signups s on s.event_id=e.id and s.status='signed'
     where e.tenant_slug=$1 and e.campus_slug=$2 and e.status='active' group by e.id order by e.created_at desc`,
    [request.platform.tenant, request.platform.campus, request.platform.user.id]
  )
  response.json({items: result.rows})
}))

app.post("/v1/events/:id/signup", asyncRoute(async (request, response) => {
  const client = await pool.connect()
  try {
    await client.query("begin")
    const event = await client.query(
      "select capacity from events where id=$1 and tenant_slug=$2 and campus_slug=$3 and status='active' for update",
      [request.params.id, request.platform.tenant, request.platform.campus]
    )
    if (!event.rowCount) throw Object.assign(new Error("event not found"), {status: 404})
    const existing = await client.query(
      "select status from event_signups where event_id=$1 and user_id=$2 for update",
      [request.params.id, request.platform.user.id]
    )
    if (!existing.rowCount || existing.rows[0].status !== "signed") {
      const count = await client.query("select count(*)::int count from event_signups where event_id=$1 and status='signed'", [request.params.id])
      if (event.rows[0].capacity > 0 && count.rows[0].count >= event.rows[0].capacity) throw Object.assign(new Error("event is full"), {status: 409})
      await client.query(
        `insert into event_signups(event_id,user_id,status,cancelled_at) values($1,$2,'signed',null)
         on conflict(event_id,user_id) do update set status='signed',cancelled_at=null,created_at=now()`,
        [request.params.id, request.platform.user.id]
      )
    }
    await audit(client, request.platform, "signup", "event", request.params.id)
    await client.query("commit")
    response.json({signed: true})
  } catch (error) {
    await client.query("rollback")
    throw error
  } finally {
    client.release()
  }
}))

app.post("/v1/events/:id/cancel-signup", asyncRoute(async (request, response) => {
  const result = await pool.query(
    `update event_signups s set status='cancelled',cancelled_at=now()
     from events e where s.event_id=e.id and s.event_id=$1 and s.user_id=$2 and s.status='signed'
       and e.tenant_slug=$3 and e.campus_slug=$4 and e.status='active'
     returning s.event_id,s.status`,
    [request.params.id, request.platform.user.id, request.platform.tenant, request.platform.campus]
  )
  if (!result.rowCount) return response.status(409).json({error: "signup cannot be cancelled"})
  await audit(pool, request.platform, "cancel_signup", "event", request.params.id)
  response.json({cancelled: true, signup: result.rows[0]})
}))

app.get("/v1/community/posts", asyncRoute(async (request, response) => {
  const scope = text(request.query.scope, 20)
  if (scope && scope !== "mine") return response.status(400).json({error: "invalid post scope"})
  const result = await pool.query(
    `select p.id,p.user_id author_id,u.public_id author_public_id,p.channel,p.tag,p.content,p.location,p.image_url,p.image_urls,p.status,p.moderation_note,p.created_at,u.nickname author,u.avatar,
      count(distinct l.user_id)::int likes,(p.user_id=$2) mine,
      exists(select 1 from community_likes mine where mine.post_id=p.id and mine.user_id=$2) liked,
      exists(select 1 from community_follows f where f.tenant_slug=p.tenant_slug and f.follower_id=$2 and f.followed_id=p.user_id) following,
      (select count(*)::int from community_follows f where f.tenant_slug=p.tenant_slug and f.followed_id=p.user_id) follower_count,
      coalesce(json_agg(distinct jsonb_build_object('id',c.id,'user',cu.nickname,'avatar',cu.avatar,'user_public_id',cu.public_id,'content',c.content,'created_at',c.created_at,'mine',c.user_id=$2,
        'parent_comment_id',c.parent_comment_id,'parent_comment_content',pc.content,
        'reply_to_user_id',c.reply_to_user_id,'reply_to_name',ru.nickname))
        filter(where c.id is not null),'[]') comments
     from community_posts p join users u on u.id=p.user_id
     left join community_likes l on l.post_id=p.id
     left join community_comments c on c.post_id=p.id and c.status='active'
     left join community_comments pc on pc.id=c.parent_comment_id
     left join users cu on cu.id=c.user_id
     left join users ru on ru.id=c.reply_to_user_id
     where p.tenant_slug=$1
       and (($3='mine' and p.user_id=$2 and p.status<>'removed') or ($3<> 'mine' and p.status='active'))
     group by p.id,u.nickname,u.avatar,u.public_id order by p.created_at desc limit 100`,
    [request.platform.tenant, request.platform.user.id, scope]
  )
  response.json({items: result.rows})
}))

app.get("/v1/community/posts/:id", asyncRoute(async (request, response) => {
  const result = await pool.query(
    `select p.id,p.user_id author_id,u.public_id author_public_id,p.channel,p.tag,p.content,p.location,p.image_url,p.image_urls,p.status,p.moderation_note,p.created_at,
      u.nickname author,u.avatar,count(distinct l.user_id)::int likes,(p.user_id=$3) mine,
      exists(select 1 from community_likes mine where mine.post_id=p.id and mine.user_id=$3) liked,
      exists(select 1 from community_follows f where f.tenant_slug=p.tenant_slug and f.follower_id=$3 and f.followed_id=p.user_id) following,
      (select count(*)::int from community_follows f where f.tenant_slug=p.tenant_slug and f.followed_id=p.user_id) follower_count,
      coalesce(json_agg(distinct jsonb_build_object('id',c.id,'user',cu.nickname,'avatar',cu.avatar,'user_public_id',cu.public_id,'content',c.content,
        'created_at',c.created_at,'mine',c.user_id=$3,'parent_comment_id',c.parent_comment_id,
        'parent_comment_content',pc.content,'reply_to_user_id',c.reply_to_user_id,
        'reply_to_name',ru.nickname)) filter(where c.id is not null),'[]') comments
     from community_posts p join users u on u.id=p.user_id
     left join community_likes l on l.post_id=p.id
     left join community_comments c on c.post_id=p.id and c.status='active'
     left join community_comments pc on pc.id=c.parent_comment_id
     left join users cu on cu.id=c.user_id
     left join users ru on ru.id=c.reply_to_user_id
     where p.id=$1 and p.tenant_slug=$2
       and (p.status='active' or p.user_id=$3)
     group by p.id,u.nickname,u.avatar,u.public_id`,
    [request.params.id, request.platform.tenant, request.platform.user.id]
  )
  if (!result.rowCount) return response.status(404).json({error: "post not found"})
  response.json({item: result.rows[0]})
}))

app.get("/v1/community/profiles/:publicId/posts", asyncRoute(async (request, response) => {
  const publicId = text(request.params.publicId, 6)
  if (!/^\d{6}$/.test(publicId)) return response.status(400).json({error: "用户 ID 格式无效"})
  const result = await pool.query(
    `select p.id,p.user_id author_id,u.public_id author_public_id,p.channel,p.tag,p.content,p.location,
       p.image_url,p.image_urls,p.status,p.moderation_note,p.created_at,u.nickname author,u.avatar,
       count(distinct l.user_id)::int likes,(p.user_id=$3) mine,
       exists(select 1 from community_likes mine where mine.post_id=p.id and mine.user_id=$3) liked,
       exists(select 1 from community_follows f where f.tenant_slug=p.tenant_slug and f.follower_id=$3 and f.followed_id=p.user_id) following,
       (select count(*)::int from community_follows f where f.tenant_slug=p.tenant_slug and f.followed_id=p.user_id) follower_count,
       '[]'::json comments
     from community_posts p join users u on u.id=p.user_id
     left join community_likes l on l.post_id=p.id
     where p.tenant_slug=$1 and u.public_id=$2 and p.status='active'
     group by p.id,u.nickname,u.avatar,u.public_id order by p.created_at desc limit 100`,
    [request.platform.tenant, publicId, request.platform.user.id]
  )
  response.json({items: result.rows})
}))

app.post("/v1/community/posts", rateLimit("community-publish", 8, 60 * 60_000), asyncRoute(async (request, response) => {
  const content = text(request.body.content, 500)
  if (content.length < 5) return response.status(400).json({error: "content too short"})
  assertCommunityContentAllowed([content, request.body.location].filter(Boolean).join("\n"))
  const channel = text(request.body.channel, 20) || "日常"
  if (!communityChannels.has(channel)) return response.status(400).json({error: "invalid community channel"})
  const requestedTag = text(request.body.tag, 20)
  const tag = channel === "失物" && ["寻物", "招领"].includes(requestedTag)
    ? requestedTag
    : channel === "推荐" ? "校园日常" : channel
  if (request.body.imageUrls !== undefined && !Array.isArray(request.body.imageUrls)) return response.status(400).json({error: "post imageUrls must be an array"})
  const requestedImageUrls = (Array.isArray(request.body.imageUrls) ? request.body.imageUrls : request.body.imageUrl ? [request.body.imageUrl] : [])
    .map(value => text(value, 500))
    .filter(Boolean)
  if (requestedImageUrls.length > COMMUNITY_POST_IMAGE_LIMIT) return response.status(400).json({error: `a post supports up to ${COMMUNITY_POST_IMAGE_LIMIT} images`})
  const imageUrls = [...new Set(requestedImageUrls)]
  if (imageUrls.some(value => !trustedUploadUrl(value))) return response.status(400).json({error: "post images must be uploaded through this service"})
  const imageUrl = imageUrls[0] || null
  const safety = await checkUserText(request.platform, [channel, content, request.body.location].filter(Boolean).join("\n"))
  const status = "active"
  const result = await pool.query(
    `insert into community_posts(tenant_slug,campus_slug,user_id,channel,tag,content,location,image_url,image_urls,status)
     values($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10) returning id,channel,tag,content,location,image_url,image_urls,status,created_at`,
    [request.platform.tenant,request.platform.campus,request.platform.user.id,channel,tag,content,text(request.body.location,60)||request.platform.campusName,imageUrl,JSON.stringify(imageUrls),status]
  )
  await audit(pool,request.platform,"create","community_post",result.rows[0].id,{contentSafety:contentSafetyDetail(safety)})
  response.status(201).json({item:result.rows[0], moderation: "published"})
}))

app.delete("/v1/community/posts/:id", rateLimit("community-withdraw", 30, 60 * 60_000), asyncRoute(async (request, response) => {
  const result = await pool.query(
    `update community_posts set status='removed',moderation_note='用户主动撤回'
     where id=$1 and tenant_slug=$2 and user_id=$3 and status<>'removed'
     returning id,status`,
    [request.params.id, request.platform.tenant, request.platform.user.id]
  )
  if (!result.rowCount) return response.status(404).json({error: "post not found"})
  await audit(pool, request.platform, "withdraw", "community_post", request.params.id)
  response.json({removed: true})
}))

app.post("/v1/community/posts/:id/like", rateLimit("community-like", 180, 60 * 60_000), asyncRoute(async (request, response) => {
  const post = await pool.query("select id from community_posts where id=$1 and tenant_slug=$2 and status='active'", [request.params.id, request.platform.tenant])
  if (!post.rowCount) return response.status(404).json({error: "post not found"})
  const found=await pool.query("select 1 from community_likes where post_id=$1 and user_id=$2",[request.params.id,request.platform.user.id])
  if(found.rowCount) await pool.query("delete from community_likes where post_id=$1 and user_id=$2",[request.params.id,request.platform.user.id])
  else await pool.query("insert into community_likes(post_id,user_id) values($1,$2)",[request.params.id,request.platform.user.id])
  response.json({liked:!found.rowCount})
}))

app.post("/v1/community/posts/:id/follow", rateLimit("community-follow", 120, 60 * 60_000), asyncRoute(async (request, response) => {
  const post = await pool.query(
    "select user_id from community_posts where id=$1 and tenant_slug=$2 and status='active'",
    [request.params.id, request.platform.tenant]
  )
  if (!post.rowCount) return response.status(404).json({error: "post not found"})
  const followedId = Number(post.rows[0].user_id)
  if (followedId === Number(request.platform.user.id)) return response.status(400).json({error: "不能关注自己"})
  const found = await pool.query(
    `select 1 from community_follows where tenant_slug=$1 and follower_id=$2 and followed_id=$3`,
    [request.platform.tenant, request.platform.user.id, followedId]
  )
  if (found.rowCount) {
    await pool.query(
      `delete from community_follows where tenant_slug=$1 and follower_id=$2 and followed_id=$3`,
      [request.platform.tenant, request.platform.user.id, followedId]
    )
  } else {
    await pool.query(
      `insert into community_follows(tenant_slug,campus_slug,follower_id,followed_id) values($1,$2,$3,$4)
       on conflict(tenant_slug,follower_id,followed_id) do nothing`,
      [request.platform.tenant, request.platform.campus, request.platform.user.id, followedId]
    )
  }
  const count = await pool.query(
    `select count(*)::int count from community_follows where tenant_slug=$1 and followed_id=$2`,
    [request.platform.tenant, followedId]
  )
  response.json({following: !found.rowCount, followerCount: count.rows[0].count})
}))

app.post("/v1/community/posts/:id/comments", rateLimit("community-comment", 30, 60 * 60_000), asyncRoute(async (request,response)=>{
  const content=text(request.body.content,150)
  if(!content)return response.status(400).json({error:"comment required"})
  assertCommunityContentAllowed(content)
  const safety=await checkUserText(request.platform,content)
  const post = await pool.query("select id from community_posts where id=$1 and tenant_slug=$2 and status='active'", [request.params.id, request.platform.tenant])
  if (!post.rowCount) return response.status(404).json({error: "post not found"})
  let parentCommentId = null
  let replyToUserId = null
  const requestedParentId = text(request.body?.parentCommentId, 80)
  if (requestedParentId) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestedParentId)) {
      return response.status(400).json({error: "要回复的评论不存在"})
    }
    const parent = await pool.query(
      `select c.id,c.user_id from community_comments c
       where c.id=$1 and c.post_id=$2 and c.status='active'`,
      [requestedParentId, request.params.id]
    )
    if (!parent.rowCount) return response.status(400).json({error: "要回复的评论不存在"})
    parentCommentId = parent.rows[0].id
    replyToUserId = parent.rows[0].user_id
  }
  const result=await pool.query(
    `insert into community_comments(post_id,user_id,content,parent_comment_id,reply_to_user_id)
     values($1,$2,$3,$4,$5) returning id,content,parent_comment_id,reply_to_user_id,created_at`,
    [request.params.id,request.platform.user.id,content,parentCommentId,replyToUserId]
  )
  if(safety.checked)await audit(pool,request.platform,"content_safety_pass","community_comment",result.rows[0].id,{contentSafety:contentSafetyDetail(safety)})
  response.status(201).json({item:result.rows[0]})
}))

app.delete("/v1/community/comments/:id", rateLimit("community-comment-delete", 60, 60 * 60_000), asyncRoute(async (request, response) => {
  const result = await pool.query(
    `update community_comments c set status='removed'
     from community_posts p where c.id=$1 and p.id=c.post_id
       and p.tenant_slug=$2 and c.user_id=$3 and c.status='active'
     returning c.id`,
    [request.params.id, request.platform.tenant, request.platform.user.id]
  )
  if (!result.rowCount) return response.status(404).json({error: "comment not found"})
  await audit(pool, request.platform, "remove", "community_comment", request.params.id)
  response.json({removed: true})
}))

app.post("/v1/community/comments/:id/reports", rateLimit("community-comment-report", 12, 60 * 60_000), asyncRoute(async (request, response) => {
  const reason = text(request.body?.reason, 60)
  const detail = text(request.body?.detail, 300)
  if (reason.length < 2) return response.status(400).json({error: "report reason is required"})
  const comment = await pool.query(
    `select c.id,c.user_id from community_comments c join community_posts p on p.id=c.post_id
     where c.id=$1 and c.status='active' and p.status='active'
       and p.tenant_slug=$2`,
    [request.params.id, request.platform.tenant]
  )
  if (!comment.rowCount) return response.status(404).json({error: "comment not found"})
  if (Number(comment.rows[0].user_id) === Number(request.platform.user.id)) return response.status(400).json({error: "cannot report your own comment"})
  await pool.query(
    `insert into community_comment_reports(comment_id,reporter_id,reason,detail) values($1,$2,$3,$4)
     on conflict(comment_id,reporter_id) do update
       set reason=excluded.reason,detail=excluded.detail,status='open',handled_at=null,handled_by=null`,
    [request.params.id, request.platform.user.id, reason, detail]
  )
  await audit(pool, request.platform, "report", "community_comment", request.params.id, {reason})
  response.status(201).json({reported: true})
}))

app.post("/v1/community/posts/:id/reports", rateLimit("community-report", 12, 60 * 60_000), asyncRoute(async (request, response) => {
  const reason = text(request.body?.reason, 60)
  const detail = text(request.body?.detail, 300)
  if (reason.length < 2) return response.status(400).json({error: "report reason is required"})
  const post = await pool.query("select id,user_id from community_posts where id=$1 and tenant_slug=$2 and status='active'", [request.params.id, request.platform.tenant])
  if (!post.rowCount) return response.status(404).json({error: "post not found"})
  if (Number(post.rows[0].user_id) === Number(request.platform.user.id)) return response.status(400).json({error: "cannot report your own post"})
  await pool.query(
    `insert into community_reports(tenant_slug,campus_slug,post_id,reporter_id,reason,detail) values($1,$2,$3,$4,$5,$6)
     on conflict(post_id,reporter_id) do update set tenant_slug=excluded.tenant_slug,campus_slug=excluded.campus_slug,
       reason=excluded.reason,detail=excluded.detail,status='open',handled_at=null,handled_by=null`,
    [request.platform.tenant, request.platform.campus, request.params.id, request.platform.user.id, reason, detail]
  )
  await audit(pool, request.platform, "report", "community_post", request.params.id, {reason})
  response.status(201).json({reported: true})
}))

app.get("/v1/rankings/lists", asyncRoute(async (request, response) => {
  const result = await pool.query(
    `select lists.id,lists.title,lists.description,lists.entry_label,lists.cover_url,lists.status,
       lists.moderation_note,lists.created_at,(lists.user_id=$2) mine,false built_in,
       count(places.id) filter(where places.status='active')::int item_count
     from ranking_lists lists
     left join ranking_places places on places.ranking_list_id=lists.id
     where lists.tenant_slug=$1 and lists.status<>'removed' and (lists.status='active' or lists.user_id=$2)
     group by lists.id
     order by case lists.status when 'active' then 0 when 'pending' then 1 else 2 end,lists.created_at desc`,
    [request.platform.tenant, request.platform.user.id]
  )
  const customLists = result.rows.map(presentRankingList)
  const builtIns = builtinRankingLists.map(item => presentRankingList({...item, built_in: true, status: "active"}))
  response.json({items: [...builtIns, ...customLists]})
}))

app.post("/v1/rankings/lists", rateLimit("ranking-list-submit", 6, 24 * 60 * 60_000), asyncRoute(async (request, response) => {
  const viewer = await pool.query("select phone_verified_at from users where id=$1", [request.platform.user.id])
  if (!viewer.rows[0]?.phone_verified_at) return response.status(403).json({error: "请先使用手机号登录"})
  const title = text(request.body?.title, 20)
  const description = text(request.body?.description, 80)
  const entryLabel = text(request.body?.entryLabel, 8) || "项目"
  const imageCandidate = text(request.body?.coverUrl, 500)
  if (title.length < 2 || description.length < 5) return response.status(400).json({error: "请填写榜单名称和完整介绍"})
  if (builtinRankingLists.some(item => item.title === title)) return response.status(409).json({error: "该榜单名称已存在"})
  const coverUrl = imageCandidate ? trustedUploadUrl(imageCandidate) : null
  if (imageCandidate && !coverUrl) return response.status(400).json({error: "榜单封面必须通过本服务上传"})
  const safety = await checkUserText(request.platform, [title, description, entryLabel].join("\n"), {allowReview: true})
  try {
    const result = await pool.query(
      `insert into ranking_lists(tenant_slug,user_id,title,description,entry_label,cover_url,source_type,status)
       values($1,$2,$3,$4,$5,$6,'student','pending')
       returning id,title,description,entry_label,cover_url,status,moderation_note,created_at,true mine,false built_in,0 item_count`,
      [request.platform.tenant, request.platform.user.id, title, description, entryLabel, coverUrl]
    )
    await audit(pool, request.platform, "create", "ranking_list", result.rows[0].id, {contentSafety: contentSafetyDetail(safety)})
    response.status(201).json({item: presentRankingList(result.rows[0]), moderation: "pending_review"})
  } catch (error) {
    if (error.code === "23505") return response.status(409).json({error: "这个榜单已存在或正在审核"})
    throw error
  }
}))

app.delete("/v1/rankings/lists/:id", rateLimit("ranking-list-withdraw", 12, 24 * 60 * 60_000), asyncRoute(async (request, response) => {
  const listId = uuid(request.params.id)
  if (!listId) return response.status(400).json({error: "invalid ranking list id"})
  const result = await pool.query(
    `update ranking_lists set status='removed',moderation_note='用户主动撤回',updated_at=now()
     where id=$1 and tenant_slug=$2 and user_id=$3 and status in ('pending','rejected') returning id`,
    [listId, request.platform.tenant, request.platform.user.id]
  )
  if (!result.rowCount) return response.status(404).json({error: "ranking list not found or cannot be withdrawn"})
  await audit(pool, request.platform, "withdraw", "ranking_list", listId)
  response.json({removed: true})
}))

app.get("/v1/rankings/places", asyncRoute(async (request, response) => {
  const requestedList = text(request.query.list, 36)
  const category = rankingCategory(requestedList || request.query.category)
  const listId = category ? "" : uuid(requestedList)
  if (!category && !listId) return response.status(400).json({error: "valid ranking list is required"})
  if (listId) {
    const list = await pool.query(
      `select id from ranking_lists where id=$1 and tenant_slug=$2 and status='active'`,
      [listId, request.platform.tenant]
    )
    if (!list.rowCount) return response.status(404).json({error: "ranking list not found"})
  }
  const sort = ["top", "week", "new"].includes(text(request.query.sort, 12)) ? text(request.query.sort, 12) : "top"
  const query = text(request.query.q, 30).replace(/[%_]/g, "").trim()
  const search = query ? `%${query}%` : ""
  const order = sort === "week"
    ? "weekly_likes desc,likes desc,p.reference_count desc,p.reference_rating desc nulls last,p.editorial_rank asc,p.created_at desc"
    : sort === "new"
      ? "p.created_at desc,p.editorial_rank asc,likes desc"
      : "likes desc,p.reference_count desc,p.reference_rating desc nulls last,p.editorial_rank asc,weekly_likes desc,p.created_at desc"
  const params = [request.platform.tenant, request.platform.user.id, category || "custom", search, listId || null]
  const [result, totalResult] = await Promise.all([
    pool.query(
      `select p.id,p.campus_slug,cs.name campus_name,p.category,p.ranking_list_id,lists.title list_title,p.name,p.note,p.location,p.image_url,p.cover_key,p.source_type,p.status,
         p.reference_source,p.reference_rating,p.reference_count,p.reference_url,p.editorial_rank,
         p.moderation_note,p.created_at,count(distinct l.user_id)::int likes,
         count(distinct l.user_id) filter(where l.created_at>=now()-interval '7 days')::int weekly_likes,
         count(distinct favorites.user_id)::int favorites,
         count(distinct comments.id) filter(where comments.status='active')::int comments,
         (p.user_id=$2) mine,
         exists(select 1 from ranking_place_likes mine where mine.place_id=p.id and mine.user_id=$2) liked,
         exists(select 1 from ranking_place_favorites mine where mine.place_id=p.id and mine.user_id=$2) favorited
       from ranking_places p
       join campus_sites cs on cs.tenant_slug=p.tenant_slug and cs.slug=p.campus_slug
       left join ranking_lists lists on lists.id=p.ranking_list_id
       left join ranking_place_likes l on l.place_id=p.id
       left join ranking_place_favorites favorites on favorites.place_id=p.id
       left join ranking_place_comments comments on comments.place_id=p.id
       where p.tenant_slug=$1 and p.category=$3 and (($5::uuid is null and p.ranking_list_id is null) or p.ranking_list_id=$5)
         and p.status<>'removed' and (p.status='active' or p.user_id=$2)
         and ($4='' or p.name ilike $4 or p.note ilike $4 or p.location ilike $4 or cs.name ilike $4)
       group by p.id,cs.name,lists.title
       order by case p.status when 'active' then 0 when 'pending' then 1 else 2 end,
         ${order}
       limit 100`,
      params
    ),
    pool.query(
      `select count(*)::int count from ranking_places p
       join campus_sites cs on cs.tenant_slug=p.tenant_slug and cs.slug=p.campus_slug
       where p.tenant_slug=$1 and p.category=$3 and (($5::uuid is null and p.ranking_list_id is null) or p.ranking_list_id=$5)
         and p.status<>'removed' and (p.status='active' or p.user_id=$2)
         and ($4='' or p.name ilike $4 or p.note ilike $4 or p.location ilike $4 or cs.name ilike $4)`,
      params
    )
  ])
  response.json({items: result.rows.map(presentRankingPlace), total: totalResult.rows[0].count, sort, query})
}))

app.post("/v1/rankings/places", rateLimit("ranking-submit", 12, 60 * 60_000), asyncRoute(async (request, response) => {
  const viewer = await pool.query("select phone_verified_at from users where id=$1", [request.platform.user.id])
  if (!viewer.rows[0]?.phone_verified_at) return response.status(403).json({error: "请先使用手机号登录"})
  const requestedList = text(request.body?.listId || request.body?.category, 36)
  const builtinCategory = rankingCategory(requestedList)
  const listId = builtinCategory ? "" : uuid(requestedList)
  const category = builtinCategory || (listId ? "custom" : "")
  const name = text(request.body?.name, 30)
  const note = text(request.body?.note, 80)
  const location = text(request.body?.location, 40)
  const imageCandidate = text(request.body?.imageUrl, 500)
  if (!category) return response.status(400).json({error: "valid ranking list is required"})
  if (listId) {
    const list = await pool.query("select id from ranking_lists where id=$1 and tenant_slug=$2 and status='active'", [listId, request.platform.tenant])
    if (!list.rowCount) return response.status(404).json({error: "榜单不存在或尚未通过审核"})
  }
  if (name.length < 2 || location.length < 2 || note.length < 5) {
    return response.status(400).json({error: "place name, location and recommendation are required"})
  }
  if (!imageCandidate) return response.status(400).json({error: "请上传真实地点照片"})
  const imageUrl = imageCandidate ? trustedUploadUrl(imageCandidate) : null
  if (imageCandidate && !imageUrl) return response.status(400).json({error: "place image must be uploaded through this service"})
  const safety = await checkUserText(request.platform, [name, note, location].join("\n"), {allowReview: true})
  try {
    const duplicate = await pool.query(
      `select 1 from ranking_places where tenant_slug=$1 and category=$2
       and (($4::uuid is null and ranking_list_id is null) or ranking_list_id=$4)
       and lower(trim(name))=lower(trim($3)) and status in ('pending','active') limit 1`,
      [request.platform.tenant, category, name, listId || null]
    )
    if (duplicate.rowCount) return response.status(409).json({error: "这个地点已经在本校榜单或审核队列中"})
    const result = await pool.query(
      `insert into ranking_places(
         tenant_slug,campus_slug,user_id,category,ranking_list_id,name,note,location,image_url,source_type,status
       ) values($1,$2,$3,$4,$5,$6,$7,$8,$9,'student','pending')
       returning id,category,ranking_list_id,name,note,location,image_url,cover_key,source_type,status,moderation_note,created_at`,
      [request.platform.tenant, request.platform.campus, request.platform.user.id, category, listId || null, name, note, location, imageUrl]
    )
    await audit(pool, request.platform, "create", "ranking_place", result.rows[0].id, {contentSafety: contentSafetyDetail(safety)})
    response.status(201).json({
      item: presentRankingPlace({...result.rows[0], likes: 0, liked: false, mine: true}),
      moderation: "pending_review"
    })
  } catch (error) {
    if (error.code === "23505") return response.status(409).json({error: "这个地点已经在本校榜单或审核队列中"})
    throw error
  }
}))

app.delete("/v1/rankings/places/:id", rateLimit("ranking-withdraw", 30, 60 * 60_000), asyncRoute(async (request, response) => {
  const result = await pool.query(
    `update ranking_places set status='removed',moderation_note='用户主动撤回',updated_at=now()
     where id=$1 and tenant_slug=$2 and user_id=$3 and status in ('pending','rejected')
     returning id,status`,
    [request.params.id, request.platform.tenant, request.platform.user.id]
  )
  if (!result.rowCount) return response.status(404).json({error: "ranking place not found or cannot be withdrawn"})
  await audit(pool, request.platform, "withdraw", "ranking_place", request.params.id)
  response.json({removed: true})
}))

app.post("/v1/rankings/places/:id/like", rateLimit("ranking-like", 120, 60 * 60_000), asyncRoute(async (request, response) => {
  const viewer = await pool.query("select phone_verified_at from users where id=$1", [request.platform.user.id])
  if (!viewer.rows[0]?.phone_verified_at) return response.status(403).json({error: "请先使用手机号登录"})
  const client = await pool.connect()
  try {
    await client.query("begin")
    const place = await client.query(
      `select id from ranking_places
       where id=$1 and tenant_slug=$2 and status='active' for update`,
      [request.params.id, request.platform.tenant]
    )
    if (!place.rowCount) throw Object.assign(new Error("ranking place not found"), {status: 404})
    const removed = await client.query(
      "delete from ranking_place_likes where place_id=$1 and user_id=$2 returning place_id",
      [request.params.id, request.platform.user.id]
    )
    const liked = !removed.rowCount
    if (liked) {
      await client.query(
        "insert into ranking_place_likes(place_id,user_id) values($1,$2)",
        [request.params.id, request.platform.user.id]
      )
    }
    const count = await client.query(
      "select count(*)::int likes from ranking_place_likes where place_id=$1",
      [request.params.id]
    )
    await client.query("commit")
    response.json({liked, likes: count.rows[0].likes})
  } catch (error) {
    await client.query("rollback")
    throw error
  } finally {
    client.release()
  }
}))

app.post("/v1/rankings/places/:id/favorite", rateLimit("ranking-favorite", 120, 60 * 60_000), asyncRoute(async (request, response) => {
  const viewer = await pool.query("select phone_verified_at from users where id=$1", [request.platform.user.id])
  if (!viewer.rows[0]?.phone_verified_at) return response.status(403).json({error: "请先使用手机号登录"})
  const place = await pool.query(
    "select id from ranking_places where id=$1 and tenant_slug=$2 and status='active'",
    [request.params.id, request.platform.tenant]
  )
  if (!place.rowCount) return response.status(404).json({error: "ranking place not found"})
  const removed = await pool.query(
    "delete from ranking_place_favorites where place_id=$1 and user_id=$2 returning place_id",
    [request.params.id, request.platform.user.id]
  )
  const favorited = !removed.rowCount
  if (favorited) await pool.query(
    "insert into ranking_place_favorites(place_id,user_id) values($1,$2)",
    [request.params.id, request.platform.user.id]
  )
  const count = await pool.query("select count(*)::int favorites from ranking_place_favorites where place_id=$1", [request.params.id])
  response.json({favorited, favorites: count.rows[0].favorites})
}))

app.get("/v1/rankings/places/:id/comments", asyncRoute(async (request, response) => {
  const place = await pool.query(
    "select id from ranking_places where id=$1 and tenant_slug=$2 and status='active'",
    [request.params.id, request.platform.tenant]
  )
  if (!place.rowCount) return response.status(404).json({error: "ranking place not found"})
  const result = await pool.query(
    `select comments.id,comments.content,comments.created_at,comments.user_id=$2 mine,
       users.public_id,users.nickname,users.avatar
     from ranking_place_comments comments join users on users.id=comments.user_id
     where comments.place_id=$1 and comments.status='active'
     order by comments.created_at desc limit 80`,
    [request.params.id, request.platform.user.id]
  )
  response.json({items: result.rows.map(presentRankingComment)})
}))

app.post("/v1/rankings/places/:id/comments", rateLimit("ranking-comment", 30, 60 * 60_000), asyncRoute(async (request, response) => {
  const viewer = await pool.query("select phone_verified_at from users where id=$1", [request.platform.user.id])
  if (!viewer.rows[0]?.phone_verified_at) return response.status(403).json({error: "请先使用手机号登录"})
  const content = text(request.body?.content, 200)
  if (content.length < 2) return response.status(400).json({error: "评论至少需要 2 个字"})
  const place = await pool.query(
    "select id from ranking_places where id=$1 and tenant_slug=$2 and status='active'",
    [request.params.id, request.platform.tenant]
  )
  if (!place.rowCount) return response.status(404).json({error: "ranking place not found"})
  await checkUserText(request.platform, content)
  const result = await pool.query(
    `insert into ranking_place_comments(place_id,user_id,content) values($1,$2,$3)
     returning id,content,created_at,true mine`,
    [request.params.id, request.platform.user.id, content]
  )
  const user = await pool.query("select public_id,nickname,avatar from users where id=$1", [request.platform.user.id])
  await audit(pool, request.platform, "create", "ranking_place_comment", result.rows[0].id, {placeId: request.params.id})
  response.status(201).json({item: presentRankingComment({...result.rows[0], ...user.rows[0]})})
}))

app.delete("/v1/rankings/comments/:id", rateLimit("ranking-comment-delete", 30, 60 * 60_000), asyncRoute(async (request, response) => {
  const result = await pool.query(
    `update ranking_place_comments comments set status='removed',updated_at=now()
     from ranking_places places
     where comments.id=$1 and comments.place_id=places.id and places.tenant_slug=$2
       and comments.user_id=$3 and comments.status='active'
     returning comments.id`,
    [request.params.id, request.platform.tenant, request.platform.user.id]
  )
  if (!result.rowCount) return response.status(404).json({error: "ranking comment not found"})
  await audit(pool, request.platform, "remove", "ranking_place_comment", request.params.id)
  response.json({removed: true})
}))

app.post("/v1/rankings/comments/:id/reports", rateLimit("ranking-comment-report", 12, 60 * 60_000), asyncRoute(async (request, response) => {
  const reason = text(request.body?.reason, 60)
  if (reason.length < 2) return response.status(400).json({error: "report reason is required"})
  const comment = await pool.query(
    `select comments.id,comments.user_id from ranking_place_comments comments
     join ranking_places places on places.id=comments.place_id
     where comments.id=$1 and comments.status='active' and places.tenant_slug=$2`,
    [request.params.id, request.platform.tenant]
  )
  if (!comment.rowCount) return response.status(404).json({error: "ranking comment not found"})
  if (Number(comment.rows[0].user_id) === Number(request.platform.user.id)) return response.status(400).json({error: "cannot report your own comment"})
  await pool.query(
    `insert into ranking_place_comment_reports(comment_id,reporter_id,reason) values($1,$2,$3)
     on conflict(comment_id,reporter_id) do update set reason=excluded.reason,status='open',handled_at=null,handled_by=null`,
    [request.params.id, request.platform.user.id, reason]
  )
  await audit(pool, request.platform, "report", "ranking_place_comment", request.params.id, {reason})
  response.status(201).json({reported: true})
}))

app.post("/v1/rankings/places/:id/reports", rateLimit("ranking-report", 12, 60 * 60_000), asyncRoute(async (request, response) => {
  const reason = text(request.body?.reason, 60)
  const detail = text(request.body?.detail, 300)
  if (reason.length < 2) return response.status(400).json({error: "report reason is required"})
  const place = await pool.query(
    `select id,user_id from ranking_places
     where id=$1 and tenant_slug=$2 and status='active'`,
    [request.params.id, request.platform.tenant]
  )
  if (!place.rowCount) return response.status(404).json({error: "ranking place not found"})
  if (Number(place.rows[0].user_id) === Number(request.platform.user.id)) {
    return response.status(400).json({error: "cannot report your own ranking place"})
  }
  await pool.query(
    `insert into ranking_place_reports(place_id,reporter_id,reason,detail) values($1,$2,$3,$4)
     on conflict(place_id,reporter_id) do update
       set reason=excluded.reason,detail=excluded.detail,status='open',handled_at=null,handled_by=null`,
    [request.params.id, request.platform.user.id, reason, detail]
  )
  await audit(pool, request.platform, "report", "ranking_place", request.params.id, {reason})
  response.status(201).json({reported: true})
}))

app.get("/v1/service/products", asyncRoute(async (request, response) => {
  const serviceType = campusServiceType(request.query?.type)
  if (!serviceType) return response.status(400).json({error: "无效的校园商店类型"})
  const result = await pool.query(
    `select id::int id,name,description,category,price_cents,image_url,stock,sort_order,data_mode
     from campus_service_products
     where tenant_slug=$1 and campus_slug=$2 and service_type=$3 and status='active' and data_mode='live'
     order by sort_order,id`,
    [request.platform.tenant, request.platform.campus, serviceType]
  )
  response.json({items: result.rows})
}))

app.get("/v1/service/orders", asyncRoute(async (request, response) => {
  const serviceType = campusServiceType(request.query?.type)
  const result = await pool.query(
    `select o.id,o.order_no,o.service_type,o.status,o.payment_status,o.total_amount_cents,o.note,o.fulfillment_type,o.contact_phone,o.delivery_address,o.desired_date,o.desired_time,o.gift_message,o.created_at,o.updated_at,
       coalesce(json_agg(json_build_object(
         'productId',i.product_id,'name',i.product_name,'unitPriceCents',i.unit_price_cents,'quantity',i.quantity
       ) order by i.id) filter(where i.id is not null),'[]') items
     from campus_service_orders o left join campus_service_order_items i on i.order_id=o.id
     where o.tenant_slug=$1 and o.campus_slug=$2 and o.user_id=$3 and ($4='' or o.service_type=$4)
     group by o.id order by o.created_at desc limit 100`,
    [request.platform.tenant, request.platform.campus, request.platform.user.id, serviceType]
  )
  response.json({items: result.rows.map(item => ({
    ...item,
    contact_phone: undefined,
    contact_phone_masked: maskStorePhone(revealPii(item.contact_phone))
  }))})
}))

app.post("/v1/service/orders", rateLimit("campus-service-order", 20, 60 * 60_000), asyncRoute(async (request, response) => {
  const serviceType = campusServiceType(request.body?.serviceType)
  const note = text(request.body?.note, 300)
  const fulfillment = normalizeStoreFulfillment(request.body)
  const occasion = normalizeStoreOccasion(request.body, serviceType)
  const requested = Array.isArray(request.body?.items) ? request.body.items : []
  const quantities = new Map()
  for (const item of requested.slice(0, 20)) {
    const productId = Number(item?.productId)
    const quantity = Number(item?.quantity)
    if (!Number.isSafeInteger(productId) || !Number.isInteger(quantity) || quantity < 1 || quantity > 20) {
      return response.status(400).json({error: "商品和数量无效"})
    }
    quantities.set(productId, Math.min(20, (quantities.get(productId) || 0) + quantity))
  }
  if (!serviceType || !quantities.size) return response.status(400).json({error: "请先选择当前校园商店的商品"})
  const productIds = [...quantities.keys()]
  const client = await pool.connect()
  try {
    await client.query("begin")
    const products = await client.query(
      `select id::int id,name,price_cents,stock,data_mode from campus_service_products
       where tenant_slug=$1 and campus_slug=$2 and service_type=$3 and status='active' and data_mode='live' and id=any($4::bigint[])
       order by id for update`,
      [request.platform.tenant, request.platform.campus, serviceType, productIds]
    )
    if (products.rowCount !== productIds.length) throw Object.assign(new Error("部分商品已下架，请刷新后重试"), {status: 409})
    let totalAmountCents = 0
    for (const product of products.rows) {
      const quantity = quantities.get(Number(product.id))
      if (Number(product.stock) < quantity) throw Object.assign(new Error(`${product.name}库存不足`), {status: 409})
      totalAmountCents += Number(product.price_cents) * quantity
    }
    const paymentEnabled = checkoutMode === "wechat" && wechatPayConfigured()
    const initialStatus = paymentEnabled ? "payment_pending" : "submitted"
    const initialPaymentStatus = paymentEnabled ? "pending" : "offline"
    const orderResult = await client.query(
      `insert into campus_service_orders(
         order_no,tenant_slug,campus_slug,user_id,service_type,status,total_amount_cents,note,payment_status,
         fulfillment_type,contact_name,contact_phone,delivery_address,desired_date,desired_time,gift_message
       ) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) returning *`,
      [serviceOrderNumber(), request.platform.tenant, request.platform.campus, request.platform.user.id, serviceType, initialStatus, totalAmountCents, note, initialPaymentStatus,
        fulfillment.fulfillmentType, fulfillment.contactName, protectPii(fulfillment.contactPhone), fulfillment.deliveryAddress,
        occasion.desiredDate, occasion.desiredTime, occasion.giftMessage]
    )
    const order = orderResult.rows[0]
    const items = []
    for (const product of products.rows) {
      const quantity = quantities.get(Number(product.id))
      await client.query("update campus_service_products set stock=stock-$1,updated_at=now() where id=$2", [quantity, product.id])
      const itemResult = await client.query(
        `insert into campus_service_order_items(order_id,product_id,product_name,unit_price_cents,quantity)
         values($1,$2,$3,$4,$5) returning product_id "productId",product_name name,unit_price_cents "unitPriceCents",quantity`,
        [order.id, product.id, product.name, product.price_cents, quantity]
      )
      items.push(itemResult.rows[0])
    }
    await audit(client, request.platform, "create", "campus_service_order", order.id, {serviceType, totalAmountCents, desiredDate: occasion.desiredDate})
    await client.query("commit")
    response.status(201).json({
      item: {...order, contact_phone: undefined, contact_phone_masked: maskStorePhone(fulfillment.contactPhone), items},
      payment: paymentEnabled
        ? {required: true, enabled: true, orderId: order.id, note: "请完成微信支付后等待校区商家确认"}
        : {required: false, enabled: false, note: "订单已提交，价格与履约时间以校区运营确认结果为准"}
    })
  } catch (error) {
    await client.query("rollback")
    throw error
  } finally {
    client.release()
  }
}))

app.post("/v1/service/orders/:id/payment-intent", asyncRoute(async (request, response) => {
  if (checkoutMode !== "wechat" || !wechatPayConfigured()) return response.status(409).json({error: "微信支付尚未配置"})
  const result = await pool.query(
    `select o.*,u.wechat_openid from campus_service_orders o join users u on u.id=o.user_id
     where o.id=$1 and o.tenant_slug=$2 and o.campus_slug=$3 and o.user_id=$4
       and o.status='payment_pending' and o.payment_status in ('pending','failed')`,
    [request.params.id, request.platform.tenant, request.platform.campus, request.platform.user.id]
  )
  if (!result.rowCount) return response.status(409).json({error: "该订单当前不能支付"})
  const order = result.rows[0]
  const openid = revealPii(order.wechat_openid)
  if (!openid) return response.status(409).json({error: "支付前需要完成微信登录"})
  const payment = await createWechatJsapiPayment({
    description: `校园服务 ${order.order_no}`,
    orderNo: order.order_no,
    amountCents: order.total_amount_cents,
    openid
  })
  if (!payment.ok) {
    await pool.query(
      `insert into campus_service_payment_attempts(order_id,status,amount_cents,request_payload,response_payload)
       values($1,'failed',$2,$3,$4)`,
      [order.id, order.total_amount_cents, payment.requestPayload, payment.payload]
    )
    await pool.query("update campus_service_orders set payment_status='failed',updated_at=now() where id=$1 and payment_status='pending'", [order.id])
    return response.status(502).json({error: "支付服务暂不可用，请稍后重试"})
  }
  await pool.query("update campus_service_orders set payment_status='pending',updated_at=now() where id=$1", [order.id])
  await pool.query(
    `insert into campus_service_payment_attempts(order_id,status,provider_reference,amount_cents,request_payload,response_payload)
     values($1,'prepay_created',$2,$3,$4,$5)`,
    [order.id, payment.payload.prepay_id, order.total_amount_cents, payment.requestPayload, payment.payload]
  )
  response.json({paymentParams: payment.paymentParams, expiresInSeconds: paymentPendingMinutes * 60})
}))

app.post("/v1/service/orders/:id/cancel", asyncRoute(async (request, response) => {
  const client = await pool.connect()
  try {
    await client.query("begin")
    const orderResult = await client.query(
      `select * from campus_service_orders
       where id=$1 and tenant_slug=$2 and campus_slug=$3 and user_id=$4 for update`,
      [request.params.id, request.platform.tenant, request.platform.campus, request.platform.user.id]
    )
    const order = orderResult.rows[0]
    if (!order || !["payment_pending", "submitted"].includes(order.status)) throw Object.assign(new Error("当前订单不能取消"), {status: 409})
    await client.query(
      `update campus_service_products p set stock=p.stock+i.quantity,updated_at=now()
       from campus_service_order_items i where i.order_id=$1 and i.product_id=p.id`,
      [order.id]
    )
    const result = await client.query(
      "update campus_service_orders set status='cancelled',updated_at=now() where id=$1 returning *",
      [order.id]
    )
    const refundPending = await queuePaidCampusServiceRefund(client, request.platform, order, "用户取消校园服务订单")
    await audit(client, request.platform, "cancel", "campus_service_order", order.id)
    await client.query("commit")
    response.json({item: {...result.rows[0], payment_status: refundPending ? "refund_pending" : result.rows[0].payment_status}})
  } catch (error) {
    await client.query("rollback")
    throw error
  } finally {
    client.release()
  }
}))

app.get("/v1/service/requests", asyncRoute(async (request,response)=>{
  const serviceType=text(request.query.type,30)
  const result=await pool.query(
    `select id,service_type,title,detail,status,created_at,(user_id=$3) mine
     from service_requests where tenant_slug=$1 and campus_slug=$2 and user_id=$3 and ($4='' or service_type=$4)
     order by created_at desc limit 80`,
    [request.platform.tenant,request.platform.campus,request.platform.user.id,serviceType]
  )
  response.json({items:result.rows})
}))

app.post("/v1/service/requests", asyncRoute(async (request,response)=>{
  const serviceType=text(request.body.serviceType,30),title=text(request.body.title,60),detail=text(request.body.detail,400)
  if(!serviceType||title.length<2||detail.length<5)return response.status(400).json({error:"incomplete service request"})
  const result=await pool.query(
    "insert into service_requests(tenant_slug,campus_slug,user_id,service_type,title,detail) values($1,$2,$3,$4,$5,$6) returning *",
    [request.platform.tenant,request.platform.campus,request.platform.user.id,serviceType,title,detail]
  )
  await audit(pool,request.platform,"create","service_request",result.rows[0].id)
  response.status(201).json({item:result.rows[0]})
}))

app.get("/v1/match/candidates", asyncRoute(async (request,response)=>{
  const result=await pool.query(
    `select p.user_id,p.anonymous_name,p.interests,p.intro,
      exists(select 1 from match_greetings g where g.tenant_slug=p.tenant_slug and g.campus_slug=p.campus_slug and g.sender_id=$3 and g.target_id=p.user_id and g.status in ('pending','accepted')) greeted
     from match_profiles p where p.tenant_slug=$1 and p.campus_slug=$2 and p.user_id<>$3 and p.status='active'
     order by p.updated_at desc limit 30`,
    [request.platform.tenant,request.platform.campus,request.platform.user.id]
  )
  response.json({items:result.rows})
}))

app.get("/v1/match/profile", asyncRoute(async (request,response)=>{
  const result=await pool.query(
    "select anonymous_name,interests,intro,status,updated_at from match_profiles where tenant_slug=$1 and campus_slug=$2 and user_id=$3",
    [request.platform.tenant,request.platform.campus,request.platform.user.id]
  )
  response.json({item:result.rows[0]||null})
}))

app.get("/v1/match/greetings", asyncRoute(async (request,response)=>{
  const result=await pool.query(
    `select g.sender_id,g.message,g.status,g.created_at,g.responded_at,p.anonymous_name,p.interests,p.intro,
      (select c.id from resource_conversations c
       where c.tenant_slug=g.tenant_slug and c.campus_slug=g.campus_slug and c.resource_type='match'
         and c.initiator_id=least(g.sender_id,g.target_id) and c.participant_id=greatest(g.sender_id,g.target_id)
       limit 1) conversation_id
     from match_greetings g join match_profiles p on p.tenant_slug=g.tenant_slug and p.campus_slug=g.campus_slug and p.user_id=g.sender_id
     where g.tenant_slug=$1 and g.campus_slug=$2 and g.target_id=$3
     order by case g.status when 'pending' then 0 else 1 end,g.created_at desc limit 50`,
    [request.platform.tenant,request.platform.campus,request.platform.user.id]
  )
  response.json({items:result.rows})
}))

app.post("/v1/match/profile", asyncRoute(async (request,response)=>{
  const interests=text(request.body.interests,100),intro=text(request.body.intro,240)
  if(interests.length<2||intro.length<5)return response.status(400).json({error:"complete profile required"})
  const safety=await checkUserText(request.platform,[interests,intro].join("\n"))
  const names=["星河同学","晚风同学","小岛同学","云朵同学","青柠同学","月光同学"]
  const anonymousName=names[Number(request.platform.user.id)%names.length]
  const result=await pool.query(
    `insert into match_profiles(tenant_slug,campus_slug,user_id,anonymous_name,interests,intro) values($1,$2,$3,$4,$5,$6)
     on conflict(tenant_slug,campus_slug,user_id) do update set interests=excluded.interests,intro=excluded.intro,status='active',updated_at=now()
     returning *`,
    [request.platform.tenant,request.platform.campus,request.platform.user.id,anonymousName,interests,intro]
  )
  if(safety.checked)await audit(pool,request.platform,"content_safety_pass","match_profile",request.platform.user.id,{contentSafety:contentSafetyDetail(safety)})
  response.json({item:result.rows[0]})
}))

app.delete("/v1/match/profile", asyncRoute(async (request,response)=>{
  const result=await pool.query(
    `update match_profiles set status='inactive',updated_at=now()
     where tenant_slug=$1 and campus_slug=$2 and user_id=$3 and status='active'
     returning anonymous_name,status,updated_at`,
    [request.platform.tenant,request.platform.campus,request.platform.user.id]
  )
  if(!result.rowCount)return response.status(409).json({error:"匹配资料已暂停或尚未建立"})
  await audit(pool,request.platform,"pause","match_profile",request.platform.user.id)
  response.json({item:result.rows[0]})
}))

app.post("/v1/match/:userId/greet", asyncRoute(async (request,response)=>{
  if(Number(request.params.userId)===Number(request.platform.user.id))return response.status(400).json({error:"cannot greet yourself"})
  const message=text(request.body.message,120)||"想和你认识一下"
  const safety=await checkUserText(request.platform,message)
  const result=await pool.query(
    `insert into match_greetings(tenant_slug,campus_slug,sender_id,target_id,message,status)
     select $1,$2,$3,p.user_id,$5,'pending' from match_profiles p
     where p.tenant_slug=$1 and p.campus_slug=$2 and p.user_id=$4 and p.status='active'
     on conflict(tenant_slug,campus_slug,sender_id,target_id) do nothing
     returning sender_id,target_id,status`,
    [request.platform.tenant,request.platform.campus,request.platform.user.id,request.params.userId,message]
  )
  if(!result.rowCount)return response.status(409).json({error:"candidate unavailable or already greeted"})
  await audit(pool,request.platform,"greet","match",request.params.userId,{contentSafety:contentSafetyDetail(safety)})
  response.json({greeted:true,item:result.rows[0]})
}))

app.post("/v1/match/greetings/:senderId/respond", asyncRoute(async (request,response)=>{
  const status=text(request.body.status,20)
  if(!["accepted","declined"].includes(status))return response.status(400).json({error:"invalid greeting response"})
  const senderId=Number(request.params.senderId)
  if(!Number.isSafeInteger(senderId))return response.status(400).json({error:"invalid greeting sender"})
  const client=await pool.connect()
  try{
    await client.query("begin")
    const result=await client.query(
      `update match_greetings set status=$1,responded_at=now()
       where tenant_slug=$2 and campus_slug=$3 and sender_id=$4 and target_id=$5 and status='pending'
       returning sender_id,target_id,status,responded_at`,
      [status,request.platform.tenant,request.platform.campus,senderId,request.platform.user.id]
    )
    if(!result.rowCount)throw Object.assign(new Error("greeting cannot be responded"),{status:409})
    let conversationId=null
    if(status==="accepted"){
      const firstUser=Math.min(senderId,Number(request.platform.user.id))
      const secondUser=Math.max(senderId,Number(request.platform.user.id))
      const resourceId=`${firstUser}-${secondUser}`
      const conversation=await client.query(
        `insert into resource_conversations(
           tenant_slug,campus_slug,resource_type,resource_id,initiator_id,participant_id,status,last_message_at
         ) values($1,$2,'match',$3,$4,$5,'active',now())
         on conflict(tenant_slug,campus_slug,resource_type,resource_id,initiator_id,participant_id)
         do update set status='active',updated_at=now()
         returning id`,
        [request.platform.tenant,request.platform.campus,resourceId,firstUser,secondUser]
      )
      conversationId=conversation.rows[0].id
    }
    await audit(client,request.platform,status,"match_greeting",senderId,{conversationId})
    await client.query("commit")
    response.json({item:result.rows[0],conversationId})
  }catch(error){
    await client.query("rollback")
    throw error
  }finally{
    client.release()
  }
}))

app.post("/v1/uploads", rateLimit("uploads", 20, 60_000), upload.single("file"), asyncRoute(async (request, response) => {
  if (!request.file) return response.status(400).json({error: "image required"})
  if (!await hasSupportedImageSignature(request.file.path, request.file.mimetype)) {
    await fs.promises.unlink(request.file.path).catch(() => {})
    return response.status(400).json({error: "unsupported or invalid image file"})
  }
  response.status(201).json({url: `/campus-circle/api/uploads/${request.file.filename}`})
}))

app.post("/v1/uploads/base64", rateLimit("uploads-base64", 12, 60_000), asyncRoute(async (request, response) => {
  const mimeType = String(request.body?.mimeType || "").trim().toLowerCase()
  const base64 = String(request.body?.base64 || "").trim()
  const extension = imageExtensionForMime(mimeType)
  if (!extension || !["image/jpeg", "image/png", "image/webp"].includes(mimeType)) {
    return response.status(400).json({error: "unsupported image type"})
  }
  const buffer = decodeBase64Image(base64, mimeType)
  if (!buffer) {
    return response.status(400).json({error: "invalid or oversized image"})
  }
  const filename = `${Date.now()}-${crypto.randomBytes(8).toString("hex")}${extension}`
  const filePath = path.resolve(uploadDir, filename)
  await fs.promises.writeFile(filePath, buffer, {flag: "wx"})
  response.status(201).json({url: `/campus-circle/api/uploads/${filename}`})
}))

app.get("/v1/admin/context", requireAuditAdmin, asyncRoute(async (request, response) => {
  const broadAccess = ["bootstrap", "local_preview", "platform_admin", "school_admin"].includes(request.adminAccess.role)
  const campuses = await pool.query(
    `select slug,name,address,status from campus_sites
     where tenant_slug=$1 and status='active' and ($2::boolean or slug=$3)
     order by created_at,slug`,
    [request.platform.tenant, broadAccess, request.platform.campus]
  )
  response.json({
    school: {id: request.platform.tenant, name: request.platform.tenantName},
    campus: {id: request.platform.campus, name: request.platform.campusName},
    role: request.adminAccess.role,
    campuses: campuses.rows,
    capabilities: {
      manage: ["bootstrap", "local_preview"].includes(request.adminAccess.role) || adminRoleSets.manage.has(request.adminAccess.role),
      content: ["bootstrap", "local_preview"].includes(request.adminAccess.role) || adminRoleSets.content.has(request.adminAccess.role),
      finance: ["bootstrap", "local_preview"].includes(request.adminAccess.role) || adminRoleSets.finance.has(request.adminAccess.role),
      audit: true
    }
  })
}))

app.get("/v1/admin/users", requireAdmin, asyncRoute(async (request, response) => {
  const result = await pool.query(
    `select u.id,u.nickname,u.avatar,m.status,m.joined_at,m.last_seen_at,
       a.role admin_role,a.campus_slug admin_campus
     from user_campus_memberships m join users u on u.id=m.user_id
     left join platform_admins a on a.user_id=u.id and a.tenant_slug=m.tenant_slug and a.status='active'
     where m.tenant_slug=$1 and m.campus_slug=$2
     order by m.last_seen_at desc limit 300`,
    [request.platform.tenant, request.platform.campus]
  )
  response.json({items: result.rows})
}))

app.patch("/v1/admin/users/:userId/membership", requireAdmin, asyncRoute(async (request, response) => {
  const userId = Number(request.params.userId)
  const status = request.body?.status === "active" ? "active" : request.body?.status === "suspended" ? "suspended" : ""
  if (!Number.isInteger(userId) || !status) return response.status(400).json({error: "有效用户和状态必填"})
  if (userId === Number(request.platform.user.id) && status === "suspended") return response.status(409).json({error: "不能暂停当前登录账号"})
  const result = await pool.query(
    `update user_campus_memberships set status=$1
     where user_id=$2 and tenant_slug=$3 and campus_slug=$4
     returning user_id,status`,
    [status, userId, request.platform.tenant, request.platform.campus]
  )
  if (!result.rowCount) return response.status(404).json({error: "当前校区用户不存在"})
  await audit(pool, request.platform, status === "suspended" ? "suspend" : "restore", "campus_membership", userId)
  response.json({item: result.rows[0]})
}))

app.get("/v1/admin/roles", requireSchoolAdmin, asyncRoute(async (request, response) => {
  const result = await pool.query(
    `select a.user_id,a.role,a.campus_slug,a.status,a.created_at,u.nickname,u.avatar
     from platform_admins a join users u on u.id=a.user_id
     where a.tenant_slug=$1 order by a.status,a.role,u.nickname`,
    [request.platform.tenant]
  )
  response.json({items: result.rows})
}))

app.post("/v1/admin/roles", requireSchoolAdmin, asyncRoute(async (request, response) => {
  const userId = Number(request.body?.userId)
  const role = text(request.body?.role, 30)
  const scopedRoles = new Set(["campus_admin", "content_admin", "finance_admin", "auditor"])
  if (!Number.isInteger(userId) || !["platform_admin", "school_admin", ...scopedRoles].includes(role)) {
    return response.status(400).json({error: "有效的用户和角色必填"})
  }
  const campusSlug = scopedRoles.has(role) ? (text(request.body?.campusSlug, 40) || request.platform.campus) : null
  if (campusSlug) {
    const campus = await pool.query("select 1 from campus_sites where tenant_slug=$1 and slug=$2 and status='active'", [request.platform.tenant, campusSlug])
    if (!campus.rowCount) return response.status(400).json({error: "无效校区"})
  }
  const member = await pool.query("select 1 from user_campus_memberships where user_id=$1 and tenant_slug=$2", [userId, request.platform.tenant])
  if (!member.rowCount) return response.status(404).json({error: "用户尚未进入当前高校"})
  const result = await pool.query(
    `insert into platform_admins(user_id,tenant_slug,campus_slug,role,status)
     values($1,$2,$3,$4,'active')
     on conflict(user_id,tenant_slug) do update set campus_slug=excluded.campus_slug,role=excluded.role,status='active'
     returning user_id,tenant_slug,campus_slug,role,status`,
    [userId, request.platform.tenant, campusSlug, role]
  )
  await audit(pool, request.platform, "assign", "platform_admin", userId, {role, campusSlug})
  response.status(201).json({item: result.rows[0]})
}))

app.patch("/v1/admin/roles/:userId", requireSchoolAdmin, asyncRoute(async (request, response) => {
  const userId = Number(request.params.userId)
  const status = request.body?.status === "active" ? "active" : request.body?.status === "inactive" ? "inactive" : ""
  if (!Number.isInteger(userId) || !status) return response.status(400).json({error: "有效用户和状态必填"})
  if (userId === Number(request.platform.user.id) && status === "inactive") return response.status(409).json({error: "不能停用当前登录的管理员"})
  const result = await pool.query(
    `update platform_admins set status=$1 where user_id=$2 and tenant_slug=$3 returning user_id,role,campus_slug,status`,
    [status, userId, request.platform.tenant]
  )
  if (!result.rowCount) return response.status(404).json({error: "管理员角色不存在"})
  await audit(pool, request.platform, status === "active" ? "enable" : "disable", "platform_admin", userId)
  response.json({item: result.rows[0]})
}))

app.get("/v1/admin/announcements", requireAuditAdmin, asyncRoute(async (request, response) => {
  const result = await pool.query(
    `select id,title,content,route,status,priority,publish_at,expires_at,created_at,updated_at
     from campus_announcements where tenant_slug=$1 and campus_slug=$2
     order by case status when 'active' then 0 when 'draft' then 1 else 2 end,priority desc,publish_at desc,id desc
     limit 200`,
    [request.platform.tenant, request.platform.campus]
  )
  response.json({items: result.rows})
}))

app.post("/v1/admin/announcements", requireContentAdmin, asyncRoute(async (request, response) => {
  const title = text(request.body?.title, 60)
  const content = text(request.body?.content, 240)
  const route = text(request.body?.route, 160) || "/pages/messages/index"
  const status = text(request.body?.status, 20) || "draft"
  const priority = Number(request.body?.priority || 0)
  const publishAt = optionalTimestamp(request.body?.publishAt, "发布时间")
  const expiresAt = optionalTimestamp(request.body?.expiresAt, "结束时间")
  if (title.length < 2 || content.length < 2) return response.status(400).json({error: "公告标题和内容必填"})
  if (!route.startsWith("/pages/")) return response.status(400).json({error: "公告跳转地址必须是小程序内部页面"})
  if (!["draft", "active"].includes(status)) return response.status(400).json({error: "公告状态无效"})
  if (!Number.isInteger(priority) || priority < 0 || priority > 100) return response.status(400).json({error: "公告优先级应为 0 至 100"})
  if (expiresAt && new Date(expiresAt) <= new Date(publishAt || Date.now())) return response.status(400).json({error: "公告结束时间必须晚于发布时间"})
  const result = await pool.query(
    `insert into campus_announcements(
       tenant_slug,campus_slug,title,content,route,status,priority,publish_at,expires_at,created_by,updated_by
     ) values($1,$2,$3,$4,$5,$6,$7,coalesce($8::timestamptz,now()),$9,$10,$10)
     returning id,title,content,route,status,priority,publish_at,expires_at,created_at,updated_at`,
    [request.platform.tenant, request.platform.campus, title, content, route, status, priority, publishAt, expiresAt, request.platform.user.id]
  )
  await audit(pool, request.platform, "create", "campus_announcement", result.rows[0].id, {status, priority})
  response.status(201).json({item: result.rows[0]})
}))

app.patch("/v1/admin/announcements/:id", requireContentAdmin, asyncRoute(async (request, response) => {
  const currentResult = await pool.query(
    `select * from campus_announcements where id=$1 and tenant_slug=$2 and campus_slug=$3`,
    [request.params.id, request.platform.tenant, request.platform.campus]
  )
  if (!currentResult.rowCount) return response.status(404).json({error: "公告不存在"})
  const current = currentResult.rows[0]
  const owns = key => Object.prototype.hasOwnProperty.call(request.body || {}, key)
  const title = owns("title") ? text(request.body.title, 60) : current.title
  const content = owns("content") ? text(request.body.content, 240) : current.content
  const route = owns("route") ? text(request.body.route, 160) : current.route
  const status = owns("status") ? text(request.body.status, 20) : current.status
  const priority = owns("priority") ? Number(request.body.priority) : Number(current.priority)
  const publishAt = owns("publishAt") ? optionalTimestamp(request.body.publishAt, "发布时间") : current.publish_at
  const expiresAt = owns("expiresAt") ? optionalTimestamp(request.body.expiresAt, "结束时间") : current.expires_at
  if (title.length < 2 || content.length < 2) return response.status(400).json({error: "公告标题和内容必填"})
  if (!route.startsWith("/pages/")) return response.status(400).json({error: "公告跳转地址必须是小程序内部页面"})
  if (!["draft", "active", "archived"].includes(status)) return response.status(400).json({error: "公告状态无效"})
  if (!Number.isInteger(priority) || priority < 0 || priority > 100) return response.status(400).json({error: "公告优先级应为 0 至 100"})
  if (expiresAt && new Date(expiresAt) <= new Date(publishAt)) return response.status(400).json({error: "公告结束时间必须晚于发布时间"})
  const result = await pool.query(
    `update campus_announcements set title=$1,content=$2,route=$3,status=$4,priority=$5,
       publish_at=$6,expires_at=$7,updated_by=$8,updated_at=now()
     where id=$9 and tenant_slug=$10 and campus_slug=$11
     returning id,title,content,route,status,priority,publish_at,expires_at,created_at,updated_at`,
    [title, content, route, status, priority, publishAt, expiresAt, request.platform.user.id, request.params.id, request.platform.tenant, request.platform.campus]
  )
  await audit(pool, request.platform, "update", "campus_announcement", request.params.id, {status, priority})
  response.json({item: result.rows[0]})
}))

app.get("/v1/admin/home-status", requireAuditAdmin, asyncRoute(async (request, response) => {
  const result = await pool.query(
    `select weather_temperature,weather_condition,weather_note,updated_at
     from campus_home_status where tenant_slug=$1 and campus_slug=$2`,
    [request.platform.tenant, request.platform.campus]
  )
  response.json({item: result.rows[0] || null})
}))

app.patch("/v1/admin/home-status", requireAdmin, asyncRoute(async (request, response) => {
  const temperature = text(request.body?.temperature, 20)
  const condition = text(request.body?.condition, 40)
  const note = text(request.body?.note, 80)
  const result = await pool.query(
    `insert into campus_home_status(
       tenant_slug,campus_slug,weather_temperature,weather_condition,weather_note,updated_by,updated_at
     ) values($1,$2,$3,$4,$5,$6,now())
     on conflict(tenant_slug,campus_slug) do update set
       weather_temperature=excluded.weather_temperature,
       weather_condition=excluded.weather_condition,
       weather_note=excluded.weather_note,
       updated_by=excluded.updated_by,updated_at=now()
     returning weather_temperature,weather_condition,weather_note,updated_at`,
    [request.platform.tenant, request.platform.campus, temperature, condition, note, request.platform.user.id]
  )
  await audit(pool, request.platform, "update", "campus_home_status", request.platform.campus, {weatherConfigured: Boolean(temperature || condition)})
  response.json({item: result.rows[0]})
}))

app.get("/v1/admin/express/packages", requireAuditAdmin, asyncRoute(async (request, response) => {
  const status = text(request.query?.status, 20)
  if (status && !expressPackageStatus(status)) return response.status(400).json({error: "快递状态无效"})
  const result = await pool.query(
    `select p.id,p.user_id,p.carrier,p.tracking_no,p.pickup_code,p.pickup_code_encrypted,p.station,p.status,p.source,p.created_at,p.updated_at,u.nickname
     from express_packages p join users u on u.id=p.user_id
     where p.tenant_slug=$1 and p.campus_slug=$2 and ($3='' or p.status=$3)
     order by case p.status when 'waiting' then 0 else 1 end,p.created_at desc limit 300`,
    [request.platform.tenant, request.platform.campus, status]
  )
  response.json({items: result.rows.map(presentExpressPackage)})
}))

app.post("/v1/admin/express/packages", requireAdmin, asyncRoute(async (request, response) => {
  const userId = Number(request.body?.userId)
  const carrier = text(request.body?.carrier, 30)
  const trackingNo = text(request.body?.trackingNo, 80)
  const pickupCode = text(request.body?.pickupCode, 40)
  const station = text(request.body?.station, 80) || "校内快递点"
  const status = expressPackageStatus(request.body?.status, "waiting")
  if (!Number.isInteger(userId) || userId <= 0) return response.status(400).json({error: "请选择有效用户"})
  if (!carrier || trackingNo.length < 5 || !status) return response.status(400).json({error: "请填写有效的快递公司、单号和状态"})
  const member = await pool.query(
    `select 1 from user_campus_memberships where user_id=$1 and tenant_slug=$2 and campus_slug=$3 and status='active'`,
    [userId, request.platform.tenant, request.platform.campus]
  )
  if (!member.rowCount) return response.status(404).json({error: "用户不属于当前校区"})
  const result = await pool.query(
    `insert into express_packages(tenant_slug,campus_slug,user_id,carrier,tracking_no,pickup_code,pickup_code_encrypted,station,status,source,updated_at)
     values($1,$2,$3,$4,$5,'',$6,$7,$8,'operator',now()) returning *`,
    [request.platform.tenant, request.platform.campus, userId, carrier, trackingNo, protectPii(pickupCode), station, status]
  )
  await audit(pool, request.platform, "create", "express_package", result.rows[0].id, {userId, status})
  response.status(201).json({item: presentExpressPackage(result.rows[0])})
}))

app.patch("/v1/admin/express/packages/:id", requireAdmin, asyncRoute(async (request, response) => {
  const currentResult = await pool.query(
    `select * from express_packages where id=$1 and tenant_slug=$2 and campus_slug=$3`,
    [request.params.id, request.platform.tenant, request.platform.campus]
  )
  if (!currentResult.rowCount) return response.status(404).json({error: "快递记录不存在"})
  const current = currentResult.rows[0]
  const owns = key => Object.prototype.hasOwnProperty.call(request.body || {}, key)
  const pickupCodeEncrypted = owns("pickupCode") ? protectPii(text(request.body.pickupCode, 40)) : current.pickup_code_encrypted || protectPii(current.pickup_code)
  const station = owns("station") ? text(request.body.station, 80) : current.station
  const status = owns("status") ? expressPackageStatus(request.body.status) : current.status
  if (!station || !status) return response.status(400).json({error: "快递站点或状态无效"})
  const result = await pool.query(
    `update express_packages set pickup_code='',pickup_code_encrypted=$1,station=$2,status=$3,updated_at=now()
     where id=$4 and tenant_slug=$5 and campus_slug=$6 returning *`,
    [pickupCodeEncrypted, station, status, request.params.id, request.platform.tenant, request.platform.campus]
  )
  await audit(pool, request.platform, "update", "express_package", request.params.id, {status})
  response.json({item: presentExpressPackage(result.rows[0])})
}))

app.get("/v1/admin/service/products", requireAuditAdmin, asyncRoute(async (request, response) => {
  const serviceType = campusServiceType(request.query?.type)
  const result = await pool.query(
    `select id::int id,service_type,name,description,category,price_cents,image_url,stock,sort_order,status,data_mode,created_at,updated_at
     from campus_service_products
     where tenant_slug=$1 and campus_slug=$2 and ($3='' or service_type=$3)
     order by service_type,sort_order,id`,
    [request.platform.tenant, request.platform.campus, serviceType]
  )
  response.json({items: result.rows})
}))

app.post("/v1/admin/service/products", requireAdmin, asyncRoute(async (request, response) => {
  const serviceType = campusServiceType(request.body?.serviceType)
  const name = text(request.body?.name, 80)
  const description = text(request.body?.description, 300)
  const category = text(request.body?.category, 30) || "其他"
  const priceCents = Number(request.body?.priceCents)
  const stock = Number(request.body?.stock)
  const sortOrder = Number(request.body?.sortOrder || 0)
  const imageInput = text(request.body?.imageUrl, 500)
  const imageUrl = imageInput ? trustedUploadUrl(imageInput) : ""
  if (!serviceType || name.length < 2) return response.status(400).json({error: "商店类型和商品名称必填"})
  if (request.body?.priceCents === null || request.body?.priceCents === undefined || !Number.isInteger(priceCents) || priceCents < 0 || priceCents > 1000000) return response.status(400).json({error: "商品价格无效"})
  if (request.body?.stock === null || request.body?.stock === undefined || !Number.isInteger(stock) || stock < 0 || stock > 1000000) return response.status(400).json({error: "商品库存无效"})
  if (!Number.isInteger(sortOrder) || Math.abs(sortOrder) > 100000) return response.status(400).json({error: "商品排序值无效"})
  if (imageInput && !imageUrl) return response.status(400).json({error: "商品图片必须来自本项目上传接口"})
  try {
    const result = await pool.query(
      `insert into campus_service_products(
         tenant_slug,campus_slug,service_type,name,description,category,price_cents,image_url,stock,sort_order,data_mode,created_by,updated_by
       ) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$12)
       returning id::int id,service_type,name,description,category,price_cents,image_url,stock,sort_order,status,data_mode,created_at,updated_at`,
      [request.platform.tenant, request.platform.campus, serviceType, name, description, category, priceCents, imageUrl, stock, sortOrder, request.body?.dataMode === "test" ? "test" : "live", request.platform.user.id]
    )
    await audit(pool, request.platform, "create", "campus_service_product", result.rows[0].id, {serviceType})
    response.status(201).json({item: result.rows[0]})
  } catch (error) {
    if (error.code === "23505") return response.status(409).json({error: "当前商店已存在同名商品"})
    throw error
  }
}))

app.patch("/v1/admin/service/products/:id", requireAdmin, asyncRoute(async (request, response) => {
  const currentResult = await pool.query(
    `select * from campus_service_products where id=$1 and tenant_slug=$2 and campus_slug=$3`,
    [request.params.id, request.platform.tenant, request.platform.campus]
  )
  if (!currentResult.rowCount) return response.status(404).json({error: "商品不存在"})
  const current = currentResult.rows[0]
  const owns = key => Object.prototype.hasOwnProperty.call(request.body || {}, key)
  const name = owns("name") ? text(request.body.name, 80) : current.name
  const description = owns("description") ? text(request.body.description, 300) : current.description
  const category = owns("category") ? text(request.body.category, 30) : current.category
  const priceCents = owns("priceCents") ? Number(request.body.priceCents) : Number(current.price_cents)
  const stock = owns("stock") ? Number(request.body.stock) : Number(current.stock)
  const sortOrder = owns("sortOrder") ? Number(request.body.sortOrder) : Number(current.sort_order)
  const status = owns("status") ? text(request.body.status, 20) : current.status
  const dataMode = owns("dataMode") ? text(request.body.dataMode, 10) : current.data_mode
  const imageInput = owns("imageUrl") ? text(request.body.imageUrl, 500) : current.image_url
  const imageUrl = imageInput ? trustedUploadUrl(imageInput) : ""
  if (name.length < 2 || !category || !["active", "inactive"].includes(status) || !["test", "live"].includes(dataMode)) return response.status(400).json({error: "商品名称、分类、状态或数据模式无效"})
  if (!Number.isInteger(priceCents) || priceCents < 0 || priceCents > 1000000 || !Number.isInteger(stock) || stock < 0 || stock > 1000000) return response.status(400).json({error: "商品价格或库存无效"})
  if (!Number.isInteger(sortOrder) || Math.abs(sortOrder) > 100000) return response.status(400).json({error: "商品排序值无效"})
  if (imageInput && !imageUrl) return response.status(400).json({error: "商品图片必须来自本项目上传接口"})
  const result = await pool.query(
    `update campus_service_products set name=$1,description=$2,category=$3,price_cents=$4,image_url=$5,stock=$6,sort_order=$7,status=$8,data_mode=$9,updated_by=$10,updated_at=now()
     where id=$11 and tenant_slug=$12 and campus_slug=$13
     returning id::int id,service_type,name,description,category,price_cents,image_url,stock,sort_order,status,data_mode,created_at,updated_at`,
    [name, description, category, priceCents, imageUrl, stock, sortOrder, status, dataMode, request.platform.user.id, request.params.id, request.platform.tenant, request.platform.campus]
  )
  await audit(pool, request.platform, "update", "campus_service_product", request.params.id, {status, stock})
  response.json({item: result.rows[0]})
}))

app.get("/v1/admin/service/orders", requireAuditAdmin, asyncRoute(async (request, response) => {
  const serviceType = campusServiceType(request.query?.type)
  const status = text(request.query?.status, 20)
  const result = await pool.query(
    `select o.id,o.order_no,o.service_type,o.status,o.payment_status,o.total_amount_cents,o.note,o.fulfillment_type,o.contact_name,o.contact_phone,o.delivery_address,o.desired_date,o.desired_time,o.gift_message,o.created_at,o.updated_at,u.nickname,
       coalesce(json_agg(json_build_object('name',i.product_name,'unitPriceCents',i.unit_price_cents,'quantity',i.quantity) order by i.id) filter(where i.id is not null),'[]') items
     from campus_service_orders o join users u on u.id=o.user_id left join campus_service_order_items i on i.order_id=o.id
     where o.tenant_slug=$1 and o.campus_slug=$2 and ($3='' or o.service_type=$3) and ($4='' or o.status=$4)
     group by o.id,u.nickname order by o.created_at desc limit 200`,
    [request.platform.tenant, request.platform.campus, serviceType, status]
  )
  response.json({items: result.rows.map(item => ({...item, contact_phone: revealPii(item.contact_phone)}))})
}))

app.patch("/v1/admin/service/orders/:id", requireAdmin, asyncRoute(async (request, response) => {
  const targetStatus = text(request.body?.status, 20)
  const transitions = {
    submitted: new Set(["confirmed", "cancelled"]),
    confirmed: new Set(["preparing", "cancelled"]),
    preparing: new Set(["ready"]),
    ready: new Set(["completed"])
  }
  const client = await pool.connect()
  try {
    await client.query("begin")
    const currentResult = await client.query(
      `select * from campus_service_orders where id=$1 and tenant_slug=$2 and campus_slug=$3 for update`,
      [request.params.id, request.platform.tenant, request.platform.campus]
    )
    const current = currentResult.rows[0]
    if (!current) throw Object.assign(new Error("服务订单不存在"), {status: 404})
    if (!transitions[current.status]?.has(targetStatus)) throw Object.assign(new Error("服务订单状态不能这样变更"), {status: 409})
    if (targetStatus === "cancelled") {
      await client.query(
        `update campus_service_products p set stock=p.stock+i.quantity,updated_at=now()
         from campus_service_order_items i where i.order_id=$1 and i.product_id=p.id`,
        [current.id]
      )
      await queuePaidCampusServiceRefund(client, request.platform, current, "校区运营取消校园服务订单")
    }
    const result = await client.query(
      "update campus_service_orders set status=$1,updated_at=now() where id=$2 returning *",
      [targetStatus, current.id]
    )
    await audit(client, request.platform, "status", "campus_service_order", current.id, {from: current.status, to: targetStatus})
    await client.query("commit")
    response.json({item: result.rows[0]})
  } catch (error) {
    await client.query("rollback")
    throw error
  } finally {
    client.release()
  }
}))

app.get("/v1/admin/events", requireAuditAdmin, asyncRoute(async (request, response) => {
  const result = await pool.query(
    `select e.*,count(s.user_id) filter(where s.status='signed')::int signup_count
     from events e left join event_signups s on s.event_id=e.id
     where e.tenant_slug=$1 and e.campus_slug=$2 group by e.id order by e.created_at desc limit 200`,
    [request.platform.tenant, request.platform.campus]
  )
  response.json({items: result.rows})
}))

app.post("/v1/admin/events", requireContentAdmin, asyncRoute(async (request, response) => {
  const title = text(request.body?.title, 100)
  const organizer = text(request.body?.organizer, 100)
  const eventTime = text(request.body?.eventTime, 100)
  const location = text(request.body?.location, 100)
  const description = text(request.body?.description, 800)
  const capacity = Number(request.body?.capacity || 0)
  const imageInput = text(request.body?.imageUrl, 500)
  const imageUrl = imageInput ? trustedUploadUrl(imageInput) : ""
  if (title.length < 2 || organizer.length < 2 || eventTime.length < 2 || location.length < 2 || description.length < 5) return response.status(400).json({error: "请完整填写活动信息"})
  if (!Number.isInteger(capacity) || capacity < 0 || capacity > 100000) return response.status(400).json({error: "活动名额无效"})
  if (imageInput && !imageUrl) return response.status(400).json({error: "活动图片必须来自本项目上传接口"})
  const result = await pool.query(
    `insert into events(tenant_slug,campus_slug,title,organizer,event_time,location,description,capacity,image_url,created_by)
     values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning *`,
    [request.platform.tenant, request.platform.campus, title, organizer, eventTime, location, description, capacity, imageUrl, request.platform.user.id]
  )
  await audit(pool, request.platform, "create", "event", result.rows[0].id)
  response.status(201).json({item: result.rows[0]})
}))

app.patch("/v1/admin/events/:id", requireContentAdmin, asyncRoute(async (request, response) => {
  const status = text(request.body?.status, 20)
  if (!["active", "inactive", "cancelled"].includes(status)) return response.status(400).json({error: "活动状态无效"})
  const result = await pool.query(
    `update events set status=$1,updated_at=now()
     where id=$2 and tenant_slug=$3 and campus_slug=$4 returning *`,
    [status, request.params.id, request.platform.tenant, request.platform.campus]
  )
  if (!result.rowCount) return response.status(404).json({error: "活动不存在"})
  await audit(pool, request.platform, "status", "event", request.params.id, {status})
  response.json({item: result.rows[0]})
}))

app.get("/v1/admin/settings", requireAuditAdmin, asyncRoute(async (request, response) => {
  const result = await pool.query(
    `select setting_key,setting_value,updated_at from campus_settings
     where tenant_slug=$1 and campus_slug=$2 order by setting_key`,
    [request.platform.tenant, request.platform.campus]
  )
  response.json({items: result.rows})
}))

app.patch("/v1/admin/settings", requireAdmin, asyncRoute(async (request, response) => {
  const allowed = ["operator_wechat", "operator_qr_url", "operator_contact_note", "ebike_contact_enabled"]
  const updates = []
  for (const key of allowed) {
    if (request.body?.[key] === undefined) continue
    const value = key === "ebike_contact_enabled" ? (request.body[key] === true || request.body[key] === "true" ? "true" : "false") : text(request.body[key], key === "operator_contact_note" ? 240 : 500)
    updates.push([key, value])
  }
  if (!updates.length) return response.status(400).json({error: "没有可更新的设置"})
  const client = await pool.connect()
  try {
    await client.query("begin")
    for (const [key, value] of updates) {
      await client.query(
        `insert into campus_settings(tenant_slug,campus_slug,setting_key,setting_value,updated_by,updated_at)
         values($1,$2,$3,$4,$5,now())
         on conflict(tenant_slug,campus_slug,setting_key)
         do update set setting_value=excluded.setting_value,updated_by=excluded.updated_by,updated_at=now()`,
        [request.platform.tenant, request.platform.campus, key, value, request.platform.user.id]
      )
    }
    await audit(client, request.platform, "update", "campus_settings", request.platform.campus, {keys: updates.map(item => item[0])})
    await client.query("commit")
    response.json({updated: updates.map(item => item[0])})
  } catch (error) {
    await client.query("rollback")
    throw error
  } finally {
    client.release()
  }
}))

app.get("/v1/admin/market/listings", requireContentAdmin, asyncRoute(async (request, response) => {
  const status = text(request.query?.status, 20)
  const result = await pool.query(
    `select l.id,l.title,l.description,l.category,l.price,l.image_url,l.condition_label,l.status,l.moderation_note,l.created_at,
       l.vehicle_brand,l.vehicle_range_km,l.battery_year,l.registration_status,u.id user_id,u.nickname author
     from marketplace_listings l join users u on u.id=l.user_id
     where l.tenant_slug=$1 and l.campus_slug=$2 and ($3='' or l.status=$3)
     order by l.created_at desc limit 200`,
    [request.platform.tenant, request.platform.campus, status]
  )
  response.json({items: result.rows})
}))

app.patch("/v1/admin/market/listings/:id", requireContentAdmin, asyncRoute(async (request, response) => {
  const status = text(request.body?.status, 20)
  const note = text(request.body?.note, 300)
  if (!["active", "sold", "removed", "rejected"].includes(status)) return response.status(400).json({error: "无效状态"})
  const result = await pool.query(
    `update marketplace_listings set status=$1,moderation_note=$2,reviewed_at=now(),reviewed_by=$3
     where id=$4 and tenant_slug=$5 and campus_slug=$6 returning id,status,moderation_note`,
    [status, note, request.platform.user.id, request.params.id, request.platform.tenant, request.platform.campus]
  )
  if (!result.rowCount) return response.status(404).json({error: "闲置商品不存在"})
  await audit(pool, request.platform, "moderate", "market_listing", request.params.id, {status})
  response.json({item: result.rows[0]})
}))

app.get("/v1/admin/jobs/posting-orders", requireContentAdmin, asyncRoute(async (request, response) => {
  const status = text(request.query?.status, 30)
  const result = await pool.query(
    `select p.*,u.nickname author
     from job_posting_orders p join users u on u.id=p.user_id
     where p.tenant_slug=$1 and p.campus_slug=$2 and ($3='' or p.status=$3)
     order by p.created_at asc limit 200`,
    [request.platform.tenant, request.platform.campus, status]
  )
  response.json({items: result.rows})
}))

app.post("/v1/admin/jobs/posting-orders/:id/contacted", requireContentAdmin, asyncRoute(async (request, response) => {
  const result = await pool.query(
    `update job_posting_orders set status='pending_review',contact_confirmed_at=now(),updated_at=now()
     where id=$1 and tenant_slug=$2 and campus_slug=$3 and status='pending_contact' and payment_status='paid'
     returning *`,
    [request.params.id, request.platform.tenant, request.platform.campus]
  )
  if (!result.rowCount) return response.status(409).json({error: "发布单尚未支付或状态不允许确认沟通"})
  await audit(pool, request.platform, "confirm_contact", "job_posting_order", request.params.id)
  response.json({item: result.rows[0]})
}))

app.post("/v1/admin/jobs/posting-orders/:id/review", requireContentAdmin, asyncRoute(async (request, response) => {
  const decision = request.body?.decision === "approve" ? "approve" : request.body?.decision === "reject" ? "reject" : ""
  const note = text(request.body?.note, 300)
  if (!decision || (decision === "reject" && note.length < 4)) return response.status(400).json({error: "请选择审核结果，拒绝时需填写原因"})
  const client = await pool.connect()
  try {
    await client.query("begin")
    const found = await client.query(
      `select * from job_posting_orders
       where id=$1 and tenant_slug=$2 and campus_slug=$3 and status='pending_review'
         and payment_status='paid' and contact_confirmed_at is not null for update`,
      [request.params.id, request.platform.tenant, request.platform.campus]
    )
    if (!found.rowCount) throw Object.assign(new Error("发布单尚未完成支付与沟通确认"), {status: 409})
    const posting = found.rows[0]
    let jobId = posting.job_id
    if (decision === "approve") {
      const job = await client.query(
        `insert into jobs(tenant_slug,campus_slug,poster_user_id,title,organization,location,salary_text,description,verified,status,source_type,moderation_note,reviewed_at,reviewed_by)
         values($1,$2,$3,$4,$5,$6,$7,$8,true,'active','student',$9,now(),$10) returning id`,
        [posting.tenant_slug, posting.campus_slug, posting.user_id, posting.title, posting.organization, posting.location, posting.salary_text, posting.description, note, request.platform.user.id]
      )
      jobId = job.rows[0].id
      await client.query(
        `update job_posting_orders set status='approved',job_id=$1,moderation_note=$2,reviewed_at=now(),reviewed_by=$3,updated_at=now()
         where id=$4`,
        [jobId, note, request.platform.user.id, posting.id]
      )
    } else {
      await client.query(
        `insert into job_posting_refunds(posting_order_id,out_refund_no,transaction_id,amount_cents,reason)
         values($1,$2,$3,$4,$5) on conflict(posting_order_id) do nothing`,
        [posting.id, refundNumber(), posting.payment_reference, posting.amount_cents, note]
      )
      await client.query(
        `update job_posting_orders set status='rejected',payment_status='refund_pending',moderation_note=$1,reviewed_at=now(),reviewed_by=$2,updated_at=now()
         where id=$3`,
        [note, request.platform.user.id, posting.id]
      )
    }
    await audit(client, request.platform, decision, "job_posting_order", posting.id, {jobId, refundQueued: decision === "reject"})
    await client.query("commit")
    response.json({item: {id: posting.id, status: decision === "approve" ? "approved" : "rejected", jobId, refundQueued: decision === "reject"}})
  } catch (error) {
    await client.query("rollback")
    throw error
  } finally {
    client.release()
  }
}))

app.get("/v1/admin/conversation-reports", requireContentAdmin, asyncRoute(async (request, response) => {
  const result = await pool.query(
    `select r.id,r.conversation_id,r.reason,r.detail,r.status,r.created_at,u.nickname reporter,
       c.resource_type,c.resource_id
     from conversation_reports r join users u on u.id=r.reporter_id
     join resource_conversations c on c.id=r.conversation_id
     where r.tenant_slug=$1 and r.status='open'
     order by r.created_at asc limit 100`,
    [request.platform.tenant]
  )
  response.json({items: result.rows})
}))

app.post("/v1/admin/conversation-reports/:id/resolve", requireContentAdmin, asyncRoute(async (request, response) => {
  const block = request.body?.block === true
  const client = await pool.connect()
  try {
    await client.query("begin")
    const result = await client.query(
      `update conversation_reports set status='resolved',handled_at=now(),handled_by=$1
       where id=$2 and tenant_slug=$3 and status='open' returning conversation_id`,
      [request.platform.user.id, request.params.id, request.platform.tenant]
    )
    if (!result.rowCount) throw Object.assign(new Error("待处理举报不存在"), {status: 404})
    if (block) await client.query("update resource_conversations set status='blocked',updated_at=now() where id=$1", [result.rows[0].conversation_id])
    await audit(client, request.platform, "resolve", "conversation_report", request.params.id, {blocked: block})
    await client.query("commit")
    response.json({resolved: true, blocked: block})
  } catch (error) {
    await client.query("rollback")
    throw error
  } finally {
    client.release()
  }
}))

app.get("/v1/admin/audit-logs", requireAuditAdmin, asyncRoute(async (request, response) => {
  const result = await pool.query(
    `select a.id,a.action,a.resource_type,a.resource_id,a.detail,a.created_at,u.nickname actor
     from audit_logs a left join users u on u.id=a.user_id
     where a.tenant_slug=$1 and a.campus_slug=$2 order by a.created_at desc limit 300`,
    [request.platform.tenant, request.platform.campus]
  )
  response.json({items: result.rows})
}))

app.get("/v1/admin/stats", requireAuditAdmin, asyncRoute(async (request, response) => {
  const tenant = request.platform.tenant
  const campus = request.platform.campus
  const [users, orders, listings, errands, packages, pendingPosts, pendingListings, pendingRankings, pendingJobs, openReports, openPublicReports] = await Promise.all([
    pool.query("select count(*)::int count from user_campus_memberships where tenant_slug=$1 and campus_slug=$2 and status='active'", [tenant, campus]),
    pool.query("select count(*)::int count from orders where tenant_slug=$1 and campus_slug=$2", [tenant, campus]),
    pool.query("select count(*)::int count from marketplace_listings where tenant_slug=$1 and campus_slug=$2", [tenant, campus]),
    pool.query("select count(*)::int count from errands where tenant_slug=$1 and campus_slug=$2", [tenant, campus]),
    pool.query("select count(*)::int count from express_packages where tenant_slug=$1 and campus_slug=$2", [tenant, campus]),
    pool.query("select count(*)::int count from community_posts where tenant_slug=$1 and status='pending'", [tenant]),
    pool.query("select count(*)::int count from marketplace_listings where tenant_slug=$1 and campus_slug=$2 and status='pending'", [tenant, campus]),
    pool.query(`select
      (select count(*) from ranking_places where tenant_slug=$1 and status='pending') +
      (select count(*) from ranking_lists where tenant_slug=$1 and status='pending') count`, [tenant]),
    pool.query("select count(*)::int count from job_posting_orders where tenant_slug=$1 and campus_slug=$2 and status in ('pending_contact','pending_review')", [tenant, campus]),
    pool.query("select count(*)::int count from conversation_reports where tenant_slug=$1 and status='open'", [tenant]),
    pool.query(`select
      (select count(*) from community_reports r join community_posts p on p.id=r.post_id where p.tenant_slug=$1 and r.status='open') +
      (select count(*) from community_comment_reports r join community_comments c on c.id=r.comment_id join community_posts p on p.id=c.post_id where p.tenant_slug=$1 and r.status='open') +
      (select count(*) from ranking_place_reports r join ranking_places p on p.id=r.place_id where p.tenant_slug=$1 and r.status='open') +
      (select count(*) from ranking_place_comment_reports r join ranking_place_comments c on c.id=r.comment_id join ranking_places p on p.id=c.place_id where p.tenant_slug=$1 and r.status='open') count`, [tenant])
  ])
  response.json({tenant, campus, users: users.rows[0].count, orders: orders.rows[0].count, listings: listings.rows[0].count, errands: errands.rows[0].count, packages: packages.rows[0].count, pendingPosts: pendingPosts.rows[0].count, pendingListings: pendingListings.rows[0].count, pendingRankings: pendingRankings.rows[0].count, pendingJobs: pendingJobs.rows[0].count, openReports: openReports.rows[0].count, openPublicReports: Number(openPublicReports.rows[0].count)})
}))

// Read-only operational status. It intentionally returns only booleans and
// aggregate counts, never keys, certificates, payment configuration values, or
// operator contact details.
app.get("/v1/admin/readiness", requireAuditAdmin, asyncRoute(async (request, response) => {
  const tenant = request.platform.tenant
  const campus = request.platform.campus
  const [operators, contact, products, futureMenus, moderationQueue] = await Promise.all([
    pool.query(
      `select count(*) filter (where role in ('platform_admin','school_admin','campus_admin','content_admin'))::int count
       from platform_admins
       where tenant_slug=$1 and status='active' and (campus_slug is null or campus_slug=$2)`,
      [tenant, campus]
    ),
    pool.query(
      `select count(*) filter (where setting_key='operator_wechat' and btrim(setting_value) <> '')::int wechat,
              count(*) filter (where setting_key='operator_contact_note' and btrim(setting_value) <> '')::int note
       from campus_settings where tenant_slug=$1 and campus_slug=$2`,
      [tenant, campus]
    ),
    pool.query(
      `select service_type,count(*)::int count
       from campus_service_products
       where tenant_slug=$1 and campus_slug=$2 and status='active' and stock>0
       group by service_type`,
      [tenant, campus]
    ),
    pool.query(
      `select count(*)::int count from daily_menu_items item
       join merchants merchant on merchant.id=item.merchant_id
       where item.tenant_slug=$1 and item.campus_slug=$2 and item.status='active'
         and item.capacity>0 and item.service_date>=current_date and merchant.status='active'`,
      [tenant, campus]
    ),
    pool.query(
      `select count(*) filter (where status='pending')::int pending_posts,
              (select count(*)::int from marketplace_listings where tenant_slug=$1 and campus_slug=$2 and status='pending') pending_listings,
              ((select count(*) from ranking_places where tenant_slug=$1 and status='pending') +
               (select count(*) from ranking_lists where tenant_slug=$1 and status='pending'))::int pending_rankings,
              (select count(*)::int from conversation_reports where tenant_slug=$1 and status='open') open_reports,
              ((select count(*) from community_reports r join community_posts p on p.id=r.post_id where p.tenant_slug=$1 and r.status='open') +
               (select count(*) from community_comment_reports r join community_comments c on c.id=r.comment_id join community_posts p on p.id=c.post_id where p.tenant_slug=$1 and r.status='open') +
               (select count(*) from ranking_place_reports r join ranking_places p on p.id=r.place_id where p.tenant_slug=$1 and r.status='open') +
               (select count(*) from ranking_place_comment_reports r join ranking_place_comments c on c.id=r.comment_id join ranking_places p on p.id=c.place_id where p.tenant_slug=$1 and r.status='open'))::int open_public_reports
       from community_posts where tenant_slug=$1`,
      [tenant, campus]
    )
  ])
  const productCounts = Object.fromEntries(products.rows.map(item => [item.service_type, Number(item.count)]))
  const operatorCount = Number(operators.rows[0].count)
  const contactReady = Number(contact.rows[0].wechat) > 0 && Number(contact.rows[0].note) > 0
  const paymentReady = checkoutMode === "wechat" && wechatPayConfigured()
  const moderationReady = operatorCount > 0
  const notificationReady = Boolean(process.env.NOTIFY_WEBHOOK_URL)
  const contentSafetyReady = contentSafety.mode === "required" && contentSafety.configured
  const scheduleOcrReady = Boolean(process.env.DEEPSEEK_OCR_API_URL && process.env.DEEPSEEK_OCR_API_KEY && process.env.DEEPSEEK_OCR_MODEL)
  const automaticWeatherReady = weatherService.configured
  const expressAutoSyncReady = Boolean(expressWebhookSecret)
  const checks = [
    {id: "moderation", label: "内容审核人员", ready: moderationReady, detail: moderationReady ? `已配置 ${operatorCount} 名可处理内容的管理员` : "请先为当前校区分配内容或校区管理员"},
    {id: "content_safety", label: "微信内容安全", ready: contentSafetyReady, detail: contentSafetyReady ? "服务端文本检测已强制启用" : "公开 UGC 前必须启用 WECHAT_CONTENT_SAFETY_MODE=required"},
    {id: "contact", label: "校区运营联系方式", ready: contactReady, detail: contactReady ? "已配置运营微信与联系说明" : "二手电动车、兼职沟通等功能暂不应公开"},
    {id: "stores", label: "校园商店真实商品", ready: Object.values(productCounts).some(count => count > 0), detail: Object.entries({fruit: "水果", flowers: "花店", snacks: "零食"}).map(([key, label]) => `${label} ${productCounts[key] || 0} 件`).join(" · ")},
    {id: "lunch", label: "校园外卖当日菜单", ready: Number(futureMenus.rows[0].count) > 0, detail: Number(futureMenus.rows[0].count) > 0 ? `已有 ${futureMenus.rows[0].count} 条可售菜单` : "尚未发布今天或未来的可售菜单"},
    {id: "payment", label: "在线支付", ready: paymentReady, optional: true, detail: paymentReady ? "微信支付已配置" : "本期暂不启用；收费、付费发布和支付按钮保持关闭"},
    {id: "notification", label: "运营通知", ready: notificationReady, detail: notificationReady ? "通知网关已配置" : "通知只会保存在发件箱，运营人员不会自动收到"},
    {id: "schedule_ocr", label: "课表图片识别", ready: scheduleOcrReady, optional: true, detail: scheduleOcrReady ? "OCR 服务已配置" : "可保留手动录入；未配置时不要宣传一键识别"},
    {id: "automatic_weather", label: "实时天气", ready: automaticWeatherReady, optional: true, detail: automaticWeatherReady ? "已按学校所在城市自动匹配实时天气" : "需在服务端配置 QWEATHER_API_HOST 与 QWEATHER_API_KEY"},
    {id: "express_auto_sync", label: "快递自动同步", ready: expressAutoSyncReady, optional: true, detail: expressAutoSyncReady ? `${expressProviderName}到件回调已配置` : "学生可先绑定手机号，但正式自动出码前必须接通学校驿站或已授权物流服务商"}
  ]
  response.json({
    tenant,
    campus,
    generatedAt: new Date().toISOString(),
    checks,
    moderation: {pendingPosts: Number(moderationQueue.rows[0].pending_posts), pendingListings: Number(moderationQueue.rows[0].pending_listings), pendingRankings: Number(moderationQueue.rows[0].pending_rankings), openReports: Number(moderationQueue.rows[0].open_reports) + Number(moderationQueue.rows[0].open_public_reports)},
    publicLaunchReady: checks.filter(item => !item.optional).every(item => item.ready)
  })
}))

app.use((error, _request, response, _next) => {
  console.error(error)
  const status = error.status || (error instanceof multer.MulterError ? 400 : 500)
  response.status(status).json({error: status < 500 ? error.message : "internal server error", ...(error instanceof ContentSafetyError ? {code: error.code} : {})})
})

async function flushNotificationOutbox() {
  const webhookUrl = process.env.NOTIFY_WEBHOOK_URL
  if (!webhookUrl) return
  const client = await pool.connect()
  try {
    await client.query("begin")
    const pending = await client.query(
      `select * from notification_outbox
       where status='pending' and next_attempt_at<=now()
       order by created_at for update skip locked limit 20`
    )
    for (const item of pending.rows) {
      try {
        const result = await fetch(webhookUrl, {
          method: "POST",
          headers: {"content-type": "application/json", "x-notification-secret": process.env.NOTIFY_WEBHOOK_SECRET || ""},
          body: JSON.stringify({
            id: item.id,
            tenant: item.tenant_slug,
            orderId: item.order_id,
            recipientType: item.recipient_type,
            recipientRef: item.recipient_ref,
            channel: item.channel,
            template: item.template,
            payload: item.payload
          }),
          signal: AbortSignal.timeout(8000)
        })
        if (!result.ok) throw new Error(`notification provider returned ${result.status}`)
        await client.query(
          "update notification_outbox set status='sent',sent_at=now(),attempts=attempts+1,last_error='' where id=$1",
          [item.id]
        )
      } catch (error) {
        await client.query(
          `update notification_outbox set attempts=attempts+1,last_error=$2,
           status=case when attempts>=5 then 'failed' else 'pending' end,
           next_attempt_at=now()+make_interval(mins=>least(30,power(2,attempts)::int))
           where id=$1`,
          [item.id, text(error.message, 300)]
        )
      }
    }
    await client.query("commit")
  } catch (error) {
    await client.query("rollback")
    console.error("notification outbox flush failed", error)
  } finally {
    client.release()
  }
}

async function expirePendingPayments() {
  const client = await pool.connect()
  try {
    await client.query("begin")
    const expired = await client.query(
      `update orders set status='cancelled',cancelled_at=now(),cancel_reason='支付超时，预约名额已释放'
       where status='payment_pending' and payment_status='pending' and created_at<now()-make_interval(mins=>$1)
       returning *`,
      [paymentPendingMinutes]
    )
    for (const order of expired.rows) {
      await client.query(
        `update lunch_inventory li set reserved=greatest(0,li.reserved-i.quantity),updated_at=now()
         from order_items i where i.order_id=$1 and li.service_date=$2 and li.product_id=i.product_id`,
        [order.id, order.service_date]
      )
      const platform = {tenant: order.tenant_slug, campus: order.campus_slug, user: {id: order.user_id}}
      await recordOrderEvent(client, platform, order.id, "system", "payment_timeout", "payment_pending", "cancelled", order.cancel_reason)
      await enqueueNotification(client, platform, order.id, "customer", order.user_id, "payment_timeout", {orderNo: order.order_no})
    }
    await client.query(
      `update job_posting_orders set payment_status='failed',updated_at=now()
       where status='payment_required' and payment_status='pending'
         and updated_at<now()-make_interval(mins=>$1)`,
      [paymentPendingMinutes]
    )
    const expiredServices = await client.query(
      `update campus_service_orders set status='cancelled',payment_status='failed',updated_at=now()
       where status='payment_pending' and payment_status in ('pending','failed')
         and updated_at<now()-make_interval(mins=>$1) returning id`,
      [paymentPendingMinutes]
    )
    for (const order of expiredServices.rows) {
      await client.query(
        `update campus_service_products p set stock=p.stock+i.quantity,updated_at=now()
         from campus_service_order_items i where i.order_id=$1 and i.product_id=p.id`,
        [order.id]
      )
    }
    await client.query("commit")
  } catch (error) {
    await client.query("rollback")
    console.error("expire pending payments failed", error)
  } finally {
    client.release()
  }
}

async function processPendingRefunds() {
  if (checkoutMode !== "wechat" || !wechatPayConfigured()) return
  const claimed = await pool.query(
    `with candidates as (
       select id from payment_refunds where status in ('pending','retrying') and next_attempt_at<=now()
       order by created_at for update skip locked limit 10
     ) update payment_refunds r set status='requesting',attempts=r.attempts+1,updated_at=now()
     from candidates c where r.id=c.id returning r.*`
  )
  for (const refund of claimed.rows) {
    const body = JSON.stringify({
      transaction_id: refund.transaction_id,
      out_refund_no: refund.out_refund_no,
      reason: refund.reason || "午餐订单取消退款",
      amount: {refund: refund.amount_cents, total: refund.amount_cents, currency: "CNY"},
      notify_url: process.env.WECHATPAY_REFUND_NOTIFY_URL || process.env.WECHATPAY_NOTIFY_URL
    })
    const requestPath = "/v3/refund/domestic/refunds"
    try {
      const auth = wechatPayAuthorization("POST", requestPath, body)
      const provider = await fetch(`https://api.mch.weixin.qq.com${requestPath}`, {
        method: "POST",
        headers: {"content-type": "application/json", "accept": "application/json", "authorization": auth.authorization, "wechatpay-serial": wechatPayVerificationSerial()},
        body,
        signal: AbortSignal.timeout(10000)
      })
      const raw = await provider.text()
      let payload = {}
      try { payload = raw ? JSON.parse(raw) : {} } catch { payload = {raw: raw.slice(0, 1000)} }
      if (!provider.ok) throw new Error(`refund provider returned ${provider.status}`)
      if (!verifyWechatPayResponse(provider, raw)) throw new Error("invalid WeChat Pay refund response signature")
      const status = payload.status === "SUCCESS" ? "succeeded" : payload.status === "CLOSED" || payload.status === "ABNORMAL" ? "failed" : "processing"
      const client = await pool.connect()
      try {
        await client.query("begin")
        await client.query(
          `update payment_refunds set status=$1,provider_reference=$2,request_payload=$3,response_payload=$4,last_error='',updated_at=now() where id=$5`,
          [status, payload.refund_id || "", JSON.parse(body), payload, refund.id]
        )
        if (status === "succeeded") {
          const order = await client.query("update orders set payment_status='refunded' where id=$1 returning *", [refund.order_id])
          if (order.rowCount) {
            const itemOrder = order.rows[0]
            const platform = {tenant: itemOrder.tenant_slug, campus: itemOrder.campus_slug, user: {id: itemOrder.user_id}}
            await recordOrderEvent(client, platform, itemOrder.id, "payment", payload.refund_id || refund.out_refund_no, itemOrder.status, itemOrder.status, "退款已到账")
            await enqueueNotification(client, platform, itemOrder.id, "customer", itemOrder.user_id, "refund_succeeded", {orderNo: itemOrder.order_no, amountCents: refund.amount_cents})
          }
        }
        if (status === "failed") {
          const order = await client.query("update orders set payment_status='refund_failed' where id=$1 returning *", [refund.order_id])
          if (order.rowCount) {
            const itemOrder = order.rows[0]
            const platform = {tenant: itemOrder.tenant_slug, campus: itemOrder.campus_slug, user: {id: itemOrder.user_id}}
            await recordOrderEvent(client, platform, itemOrder.id, "payment", payload.refund_id || refund.out_refund_no, itemOrder.status, itemOrder.status, "退款处理异常，等待人工处理")
            await enqueueNotification(client, platform, itemOrder.id, "admin", itemOrder.tenant_slug, "refund_failed", {orderNo: itemOrder.order_no, reason: payload.status || "unknown"})
          }
        }
        await client.query("commit")
      } catch (error) {
        await client.query("rollback")
        throw error
      } finally {
        client.release()
      }
    } catch (error) {
      await pool.query(
        `update payment_refunds set status='retrying',last_error=$2,next_attempt_at=now()+interval '5 minutes',updated_at=now() where id=$1`,
        [refund.id, text(error.message, 300)]
      )
    }
  }

  const postingClaims = await pool.query(
    `with candidates as (
       select id from job_posting_refunds where status in ('pending','retrying') and next_attempt_at<=now()
       order by created_at for update skip locked limit 10
     ) update job_posting_refunds r set status='requesting',attempts=r.attempts+1,updated_at=now()
     from candidates c where r.id=c.id returning r.*`
  )
  for (const refund of postingClaims.rows) {
    const body = JSON.stringify({
      transaction_id: refund.transaction_id,
      out_refund_no: refund.out_refund_no,
      reason: refund.reason || "兼职发布审核未通过退款",
      amount: {refund: refund.amount_cents, total: refund.amount_cents, currency: "CNY"},
      notify_url: process.env.WECHATPAY_REFUND_NOTIFY_URL || process.env.WECHATPAY_NOTIFY_URL
    })
    const requestPath = "/v3/refund/domestic/refunds"
    try {
      const auth = wechatPayAuthorization("POST", requestPath, body)
      const provider = await fetch(`https://api.mch.weixin.qq.com${requestPath}`, {
        method: "POST",
        headers: {"content-type": "application/json", accept: "application/json", authorization: auth.authorization, "wechatpay-serial": wechatPayVerificationSerial()},
        body,
        signal: AbortSignal.timeout(10000)
      })
      const raw = await provider.text()
      let payload = {}
      try { payload = raw ? JSON.parse(raw) : {} } catch { payload = {raw: raw.slice(0, 1000)} }
      if (!provider.ok) throw new Error(`refund provider returned ${provider.status}`)
      if (!verifyWechatPayResponse(provider, raw)) throw new Error("invalid WeChat Pay refund response signature")
      const status = payload.status === "SUCCESS" ? "succeeded" : payload.status === "CLOSED" || payload.status === "ABNORMAL" ? "failed" : "processing"
      const client = await pool.connect()
      try {
        await client.query("begin")
        await client.query(
          `update job_posting_refunds set status=$1,provider_reference=$2,request_payload=$3,response_payload=$4,last_error='',updated_at=now()
           where id=$5`,
          [status, payload.refund_id || "", JSON.parse(body), payload, refund.id]
        )
        const posting = await client.query(
          `update job_posting_orders set payment_status=$1,updated_at=now() where id=$2 returning tenant_slug,campus_slug,user_id`,
          [status === "succeeded" ? "refunded" : status === "failed" ? "failed" : "refund_pending", refund.posting_order_id]
        )
        if (posting.rowCount) {
          const item = posting.rows[0]
          const platform = {tenant: item.tenant_slug, campus: item.campus_slug, user: {id: item.user_id}}
          await audit(client, platform, status === "succeeded" ? "refund_succeeded" : status === "failed" ? "refund_failed" : "refund_processing", "job_posting_order", refund.posting_order_id, {refundId: payload.refund_id || ""})
        }
        await client.query("commit")
      } catch (error) {
        await client.query("rollback")
        throw error
      } finally {
        client.release()
      }
    } catch (error) {
      await pool.query(
        `update job_posting_refunds set status='retrying',last_error=$2,next_attempt_at=now()+interval '5 minutes',updated_at=now() where id=$1`,
        [refund.id, text(error.message, 300)]
      )
    }
  }

  const serviceClaims = await pool.query(
    `with candidates as (
       select id from campus_service_refunds where status in ('pending','retrying') and next_attempt_at<=now()
       order by created_at for update skip locked limit 10
     ) update campus_service_refunds r set status='requesting',attempts=r.attempts+1,updated_at=now()
     from candidates c where r.id=c.id returning r.*`
  )
  for (const refund of serviceClaims.rows) {
    const body = JSON.stringify({
      transaction_id: refund.transaction_id,
      out_refund_no: refund.out_refund_no,
      reason: refund.reason || "校园服务订单取消退款",
      amount: {refund: refund.amount_cents, total: refund.amount_cents, currency: "CNY"},
      notify_url: process.env.WECHATPAY_REFUND_NOTIFY_URL || process.env.WECHATPAY_NOTIFY_URL
    })
    const requestPath = "/v3/refund/domestic/refunds"
    try {
      const auth = wechatPayAuthorization("POST", requestPath, body)
      const provider = await fetch(`https://api.mch.weixin.qq.com${requestPath}`, {
        method: "POST",
        headers: {"content-type": "application/json", accept: "application/json", authorization: auth.authorization, "wechatpay-serial": wechatPayVerificationSerial()},
        body,
        signal: AbortSignal.timeout(10000)
      })
      const raw = await provider.text()
      let payload = {}
      try { payload = raw ? JSON.parse(raw) : {} } catch { payload = {raw: raw.slice(0, 1000)} }
      if (!provider.ok) throw new Error(`refund provider returned ${provider.status}`)
      if (!verifyWechatPayResponse(provider, raw)) throw new Error("invalid WeChat Pay refund response signature")
      const status = payload.status === "SUCCESS" ? "succeeded" : payload.status === "CLOSED" || payload.status === "ABNORMAL" ? "failed" : "processing"
      const client = await pool.connect()
      try {
        await client.query("begin")
        await client.query(
          `update campus_service_refunds set status=$1,provider_reference=$2,request_payload=$3,response_payload=$4,last_error='',updated_at=now() where id=$5`,
          [status, payload.refund_id || "", JSON.parse(body), payload, refund.id]
        )
        const order = await client.query(
          `update campus_service_orders set payment_status=$1,updated_at=now() where id=$2 returning tenant_slug,campus_slug,user_id`,
          [status === "succeeded" ? "refunded" : status === "failed" ? "refund_failed" : "refund_pending", refund.order_id]
        )
        if (order.rowCount) {
          const item = order.rows[0]
          const platform = {tenant: item.tenant_slug, campus: item.campus_slug, user: {id: item.user_id}}
          await audit(client, platform, status === "succeeded" ? "refund_succeeded" : status === "failed" ? "refund_failed" : "refund_processing", "campus_service_order", refund.order_id, {refundId: payload.refund_id || ""})
        }
        await client.query("commit")
      } catch (error) {
        await client.query("rollback")
        throw error
      } finally {
        client.release()
      }
    } catch (error) {
      await pool.query(
        `update campus_service_refunds set status='retrying',last_error=$2,next_attempt_at=now()+interval '5 minutes',updated_at=now() where id=$1`,
        [refund.id, text(error.message, 300)]
      )
    }
  }
}

const server = app.listen(port, host, () => console.log(`stardust campus circle api listening on ${host}:${port}`))
const notificationTimer = setInterval(flushNotificationOutbox, 15000)
const paymentExpiryTimer = setInterval(expirePendingPayments, 60000)
const refundTimer = setInterval(processPendingRefunds, 30000)
notificationTimer.unref()
paymentExpiryTimer.unref()
refundTimer.unref()
flushNotificationOutbox()
expirePendingPayments()
processPendingRefunds()

async function shutdown() {
  clearInterval(notificationTimer)
  clearInterval(paymentExpiryTimer)
  clearInterval(refundTimer)
  server.close()
  await pool.end()
  process.exit(0)
}
process.on("SIGTERM", shutdown)
process.on("SIGINT", shutdown)
