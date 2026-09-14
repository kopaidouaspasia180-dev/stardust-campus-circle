import Taro from "@tarojs/taro"
import {currentCampus, currentTenant} from "../store/tenant"

// 构建时可通过 TARO_APP_API_ROOT / TARO_UPLOAD_ORIGIN 指向正式环境，避免迁移域名时修改业务源码。
// 不接受运行时拼接的用户输入，防止请求被导向非受信任地址。
const API_ROOT = String(process.env.TARO_APP_API_ROOT || "https://stardust.sale/campus-circle/api/v1").replace(/\/$/, "")
const UPLOAD_ORIGIN = String(process.env.TARO_UPLOAD_ORIGIN || "https://stardust.sale").replace(/\/$/, "")
const DEVICE_KEY = "stardust_device_session_v1"
const SESSION_KEY = "stardust_wechat_session_v1"
const SESSION_EXPIRY_KEY = "stardust_wechat_session_expiry_v1"
const ACCOUNT_KEY = "stardust_phone_account_v1"
const AUTH_LEVEL_KEY = "stardust_auth_level_v1"
const GUEST_MODE_KEY = "stardust_guest_mode_v1"

export type AccountSession = {
  id: number
  nickname: string
  avatar: string
  phoneVerified: boolean
  phoneMasked?: string
  publicId?: string
  profileBackground?: string
  profileBio?: string
  profileInterests?: string[]
  profileGallery?: string[]
}

let pendingSession: Promise<string> | undefined

type ApiFailure = Error & {statusCode?: number}

function returned(source: object | null | undefined, key: string) {
  return Boolean(source && Object.prototype.hasOwnProperty.call(source, key))
}

function mergedProfileFields(source: Partial<AccountSession>, fallback?: Partial<AccountSession>): Pick<AccountSession, "publicId" | "profileBackground" | "profileBio" | "profileInterests" | "profileGallery"> {
  return {
    publicId: returned(source, "publicId") ? source.publicId : fallback?.publicId,
    profileBackground: returned(source, "profileBackground") ? String(source.profileBackground || "") : String(fallback?.profileBackground || ""),
    profileBio: returned(source, "profileBio") ? String(source.profileBio || "") : String(fallback?.profileBio || ""),
    profileInterests: returned(source, "profileInterests") && Array.isArray(source.profileInterests) ? source.profileInterests : fallback?.profileInterests || [],
    profileGallery: returned(source, "profileGallery") && Array.isArray(source.profileGallery) ? source.profileGallery : fallback?.profileGallery || []
  }
}

function hasUsableSession() {
  const token = Taro.getStorageSync<string>(SESSION_KEY)
  const expiry = Number(Taro.getStorageSync<number>(SESSION_EXPIRY_KEY) || 0)
  return Boolean(token && expiry > Date.now() + 10_000)
}

export function resolveMediaUrl(value?: string, fallback = "") {
  const source = String(value || "").trim()
  if (!source) return fallback
  if (/^(?:https?:|data:|wxfile:|blob:)/i.test(source)) return source
  if (source.startsWith("//")) return `https:${source}`
  return `${UPLOAD_ORIGIN}${source.startsWith("/") ? "" : "/"}${source}`
}

function deviceId() {
  let value = Taro.getStorageSync<string>(DEVICE_KEY)
  if (!value) {
    value = `device-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`
    Taro.setStorageSync(DEVICE_KEY, value)
  }
  return value
}

type RequestOptions = {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE"
  data?: unknown
  headers?: Record<string, string | number>
  timeoutMs?: number
}

async function getSessionToken(): Promise<string> {
  const saved = Taro.getStorageSync<string>(SESSION_KEY)
  const expiry = Number(Taro.getStorageSync<number>(SESSION_EXPIRY_KEY) || 0)
  if (saved && expiry > Date.now() + 60_000) return saved
  if (Taro.getEnv() !== Taro.ENV_TYPE.WEAPP) return ""
  if (pendingSession) return pendingSession
  pendingSession = (async () => {
    const guestMode = !readAccount()?.phoneVerified
    const login = await Taro.login({timeout: 8000})
    if (!login.code) throw new Error("微信登录失败，请重试")
    const result = await Taro.request<{sessionToken?: string; expiresAt?: string; error?: string; user?: Partial<AccountSession>}>({
      url: `${API_ROOT}/auth/wechat`,
      method: "POST",
      data: {code: login.code, guestMode},
      timeout: 12000,
      header: {
        "content-type": "application/json",
        "x-tenant-id": currentTenant().id,
        "x-campus-id": currentCampus().id,
        "x-device-id": deviceId()
      }
    })
    if (result.statusCode < 200 || result.statusCode >= 300 || !result.data?.sessionToken || !result.data.expiresAt) {
      throw new Error(result.data?.error || "微信登录服务暂不可用")
    }
    Taro.setStorageSync(SESSION_KEY, result.data.sessionToken)
    Taro.setStorageSync(SESSION_EXPIRY_KEY, new Date(result.data.expiresAt).getTime())
    if (!guestMode && result.data.user?.id) {
      const previous = readAccount()
      const userId = Number(result.data.user.id)
      const sameAccount = previous?.id === userId ? previous : undefined
      writeAccount({
        ...mergedProfileFields(result.data.user, sameAccount),
        id: userId,
        nickname: String(result.data.user.nickname || "校园同学"),
        avatar: String(result.data.user.avatar || "同"),
        phoneVerified: returned(result.data.user, "phoneVerified") ? Boolean(result.data.user.phoneVerified) : Boolean(sameAccount?.phoneVerified),
        phoneMasked: sameAccount?.phoneMasked
      })
    }
    return result.data.sessionToken
  })()
  try {
    return await pendingSession
  } finally {
    pendingSession = undefined
  }
}

function writeAccount(account: AccountSession) {
  Taro.setStorageSync(ACCOUNT_KEY, account)
  if (account.phoneVerified) Taro.setStorageSync(AUTH_LEVEL_KEY, "phone")
  else Taro.removeStorageSync(AUTH_LEVEL_KEY)
}

export function readAccount(): AccountSession | null {
  try {
    const value = Taro.getStorageSync<AccountSession>(ACCOUNT_KEY)
    if (!value || !Number.isSafeInteger(Number(value.id))) return null
    return {...value, id: Number(value.id), phoneVerified: Boolean(value.phoneVerified)}
  } catch {
    return null
  }
}

export function hasPhoneLogin() {
  const verified = Boolean(readAccount()?.phoneVerified)
  if (verified && Taro.getStorageSync<string>(AUTH_LEVEL_KEY) !== "phone") {
    // 兼容旧版本已登录账号，首次读取时补齐新的会话级别标记。
    Taro.setStorageSync(AUTH_LEVEL_KEY, "phone")
  }
  // Token 到期时仍保留账号身份，由下一次请求静默换取新会话；避免 UI 先退回游客。
  return verified && Taro.getStorageSync<string>(AUTH_LEVEL_KEY) === "phone"
}

async function restorePhoneLogin() {
  if (hasPhoneLogin()) return true
  if (!hasUsableSession()) return false
  try {
    const account = await refreshAccount()
    return Boolean(account.phoneVerified)
  } catch {
    return false
  }
}

export async function requirePhoneLogin(content = "登录后才能使用这项功能，首页和公开校园内容无需登录也可以浏览。") {
  if (await restorePhoneLogin()) return true
  const result = await Taro.showModal({
    title: "登录后继续",
    content,
    confirmText: "去登录",
    cancelText: "先逛逛",
    confirmColor: "#278bea"
  })
  if (result.confirm) await Taro.navigateTo({url: "/pages/login/index"})
  return false
}

export function accountStorageKey(base: string) {
  const account = readAccount()
  return `${base}:${account?.id || "guest"}:${currentTenant().id}:${currentCampus().id}`
}

export function accountTenantStorageKey(base: string) {
  const account = readAccount()
  return `${base}:${account?.id || "guest"}:${currentTenant().id}`
}

export async function refreshAccount(): Promise<AccountSession> {
  const result = await apiRequest<{user: AccountSession}>("/me")
  const previous = readAccount()
  const userId = Number(result.user.id)
  const sameAccount = previous?.id === userId ? previous : undefined
  const account: AccountSession = {
    ...mergedProfileFields(result.user, sameAccount),
    id: userId,
    nickname: String(result.user.nickname || "校园同学"),
    avatar: String(result.user.avatar || "同"),
    phoneVerified: returned(result.user, "phoneVerified") ? Boolean(result.user.phoneVerified) : Boolean(sameAccount?.phoneVerified),
    phoneMasked: returned(result.user, "phoneMasked") ? result.user.phoneMasked || undefined : sameAccount?.phoneMasked
  }
  Taro.removeStorageSync(GUEST_MODE_KEY)
  writeAccount(account)
  return account
}

export async function updateProfile(input: {nickname?: string; avatar?: string; profileBackground?: string; profileBio?: string; profileInterests?: string[]; profileGallery?: string[]}): Promise<AccountSession> {
  const result = await apiRequest<{user: AccountSession}>("/me", {
    method: "PATCH",
    data: input
  })
  const previous = readAccount()
  const pendingProfile: Partial<AccountSession> = {
    publicId: previous?.publicId,
    profileBackground: input.profileBackground ?? previous?.profileBackground,
    profileBio: input.profileBio ?? previous?.profileBio,
    profileInterests: input.profileInterests ?? previous?.profileInterests,
    profileGallery: input.profileGallery ?? previous?.profileGallery
  }
  const account: AccountSession = {
    ...mergedProfileFields(result.user, pendingProfile),
    id: Number(result.user.id),
    nickname: String(result.user.nickname || "校园同学"),
    avatar: String(result.user.avatar || "campus-avatar-1"),
    phoneVerified: returned(result.user, "phoneVerified") ? Boolean(result.user.phoneVerified) : Boolean(previous?.phoneVerified),
    phoneMasked: returned(result.user, "phoneMasked") ? result.user.phoneMasked || previous?.phoneMasked : previous?.phoneMasked
  }
  writeAccount(account)
  return account
}

export async function loginWithPhone(code: string): Promise<AccountSession> {
  if (!code.trim()) throw new Error("未取得手机号授权，请重试")
  const token = await getSessionToken()
  if (!token) throw new Error("请在微信小程序中使用手机号登录")
  const wechatLogin = await Taro.login({timeout: 8000})
  if (!wechatLogin.code) throw new Error("微信身份校验失败，请重新打开小程序")
  const result = await Taro.request<{
    sessionToken?: string
    expiresAt?: string
    user?: AccountSession
    phoneMasked?: string
    error?: string
  }>({
    url: `${API_ROOT}/auth/phone`,
    method: "POST",
    data: {code, wechatCode: wechatLogin.code},
    timeout: 15000,
    header: {
      "content-type": "application/json",
      "x-tenant-id": currentTenant().id,
      "x-campus-id": currentCampus().id,
      "x-session-token": token
    }
  })
  if (result.statusCode < 200 || result.statusCode >= 300 || !result.data.sessionToken || !result.data.expiresAt || !result.data.user?.id) {
    throw new Error(result.data?.error || "手机号登录失败，请稍后重试")
  }
  Taro.setStorageSync(SESSION_KEY, result.data.sessionToken)
  Taro.setStorageSync(SESSION_EXPIRY_KEY, new Date(result.data.expiresAt).getTime())
  const previous = readAccount()
  const userId = Number(result.data.user.id)
  const sameAccount = previous?.id === userId ? previous : undefined
  const account: AccountSession = {
    ...mergedProfileFields(result.data.user, sameAccount),
    id: userId,
    nickname: String(result.data.user.nickname || "校园同学"),
    avatar: String(result.data.user.avatar || "同"),
    phoneVerified: true,
    phoneMasked: result.data.phoneMasked || sameAccount?.phoneMasked
  }
  Taro.removeStorageSync(GUEST_MODE_KEY)
  writeAccount(account)
  // 使用服务端刚签发的新令牌核验一次账号。仅网络瞬时失败时保留本次
  // 登录结果；服务端明确拒绝或返回未绑定账号时必须回到未登录状态。
  try {
    const verified = await refreshAccount()
    if (!verified.phoneVerified) {
      clearSession()
      throw new Error("手机号账号绑定未完成，请重新登录")
    }
    return verified
  } catch (error) {
    if ((error as ApiFailure)?.statusCode === 401) {
      clearSession()
      throw error
    }
    return account
  }
}

async function requestHeaders(contentType?: string): Promise<Record<string, string>> {
  const token = await getSessionToken()
  return {
    ...(contentType ? {"content-type": contentType} : {}),
    "x-tenant-id": currentTenant().id,
    "x-campus-id": currentCampus().id,
    ...(token ? {"x-session-token": token} : {"x-device-id": deviceId()})
  }
}

function clearSessionIfCurrent(requestToken: string) {
  // 登录过程中可能仍有使用旧游客 token 的请求在飞行。旧请求晚到的 401
  // 不能清除刚换取到的手机号登录会话，否则用户会在“登录成功”后又变回游客。
  const currentToken = Taro.getStorageSync<string>(SESSION_KEY)
  // 当前令牌失效时保留已绑定账号，让下一次请求用 wx.login 静默恢复该
  // 手机号账号；只有用户主动退出或注销时才清除账号身份。
  if (requestToken && currentToken === requestToken) clearSessionToken()
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string | number> = {...await requestHeaders(), ...options.headers}
  const requestToken = String(headers["x-session-token"] || "")
  const result = await Taro.request<T & {error?: string}>({
    url: `${API_ROOT}${path}`,
    method: options.method || "GET",
    data: options.data,
    timeout: options.timeoutMs || 12000,
    header: headers
  })
  if (result.statusCode === 401) {
    clearSessionIfCurrent(requestToken)
  }
  if (result.statusCode < 200 || result.statusCode >= 300) {
    const error = new Error(result.data?.error || `服务请求失败（${result.statusCode}）`) as ApiFailure
    error.statusCode = result.statusCode
    throw error
  }
  return result.data
}

export async function uploadMedia(filePath: string): Promise<string> {
  let result
  try {
    result = await Taro.uploadFile({
      url: `${API_ROOT}/uploads`,
      filePath,
      name: "file",
      timeout: 30000,
      // 微信会自动生成包含 boundary 的 multipart 请求头，不能手动覆盖。
      header: await requestHeaders()
    })
  } catch (error) {
    const detail = apiErrorMessage(error)
    if (/url not in domain list|合法域名|domain list/i.test(detail)) {
      return uploadMediaByRequest(filePath)
    }
    if (/timeout/i.test(detail)) throw new Error("图片上传超时，请检查网络后重试")
    throw new Error(detail || "图片上传失败，请检查网络后重试")
  }
  const data = JSON.parse(result.data || "{}") as {url?: string; error?: string}
  if (result.statusCode < 200 || result.statusCode >= 300 || !data.url) {
    throw new Error(data.error || "图片上传失败")
  }
  return resolveMediaUrl(data.url)
}

async function uploadMediaByRequest(filePath: string): Promise<string> {
  let uploadPath = filePath
  try {
    const initial = await Taro.getFileInfo({filePath: uploadPath}) as {size?: number}
    if (Number(initial.size || 0) > 680 * 1024) {
      const compressed = await Taro.compressImage({src: uploadPath, quality: 55})
      uploadPath = compressed.tempFilePath
    }
    const fileInfo = await Taro.getFileInfo({filePath: uploadPath}) as {size?: number}
    if (Number(fileInfo.size || 0) > 720 * 1024) {
      throw new Error("图片仍然过大，请裁剪后重试")
    }
    const imageInfo = await Taro.getImageInfo({src: uploadPath}) as {type?: string}
    const detectedType = String(imageInfo.type || "").toLowerCase()
    const extension = (detectedType || uploadPath.match(/\.([a-zA-Z0-9]+)(?:\?|$)/)?.[1] || "jpg").toLowerCase()
    const mimeType = extension === "png" ? "image/png" : extension === "webp" ? "image/webp" : "image/jpeg"
    const base64 = await new Promise<string>((resolve, reject) => {
      Taro.getFileSystemManager().readFile({
        filePath: uploadPath,
        encoding: "base64",
        success: result => resolve(String(result.data || "")),
        fail: reject
      })
    })
    if (!base64) throw new Error("无法读取图片，请重新选择")
    const data = await apiRequest<{url: string}>("/uploads/base64", {
      method: "POST",
      data: {mimeType, base64},
      timeoutMs: 30000
    })
    return resolveMediaUrl(data.url)
  } catch (error) {
    const detail = apiErrorMessage(error)
    if (/timeout/i.test(detail)) throw new Error("图片上传超时，请检查网络后重试")
    throw new Error(detail || "图片上传失败，请重新选择图片")
  }
}

export async function logoutSession() {
  try {
    await apiRequest("/auth/logout", {method: "POST"})
  } finally {
    clearSession()
    Taro.setStorageSync(GUEST_MODE_KEY, true)
  }
}

export async function deleteAccount() {
  try {
    await apiRequest<void>("/me", {method: "DELETE"})
  } finally {
    clearSession()
  }
}

export function clearSession() {
  clearSessionToken()
  Taro.removeStorageSync(ACCOUNT_KEY)
  Taro.removeStorageSync(AUTH_LEVEL_KEY)
  const guestSuffix = `:guest:${currentTenant().id}:${currentCampus().id}`
  ;[
    "stardust_schedule_v1",
    "stardust_takeout_contact_v1",
    "errand_preferences_v2"
  ].forEach(base => Taro.removeStorageSync(`${base}${guestSuffix}`))
}

function clearSessionToken() {
  Taro.removeStorageSync(SESSION_KEY)
  Taro.removeStorageSync(SESSION_EXPIRY_KEY)
}

export function showApiError(error: unknown) {
  Taro.showToast({title: apiErrorMessage(error) || "服务暂时不可用", icon: "none", duration: 3600})
}

export function apiErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message
  if (typeof error === "string") return error
  if (error && typeof error === "object") {
    const value = error as {errMsg?: unknown; message?: unknown; error?: unknown}
    const message = value.errMsg || value.message || value.error
    if (typeof message === "string" && message.trim()) {
      return message.replace(/^\w+(?::fail)?\s*/i, "").trim()
    }
  }
  return ""
}
