const avatarKeyPattern = /^campus-avatar-[1-6]$/
const MAX_INTERESTS = 12
const MAX_GALLERY = 6

function cleanText(value, maximum) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, maximum)
}

export function normalizeProfileUpdate(input, {isTrustedAvatar = () => false} = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw Object.assign(new Error("个人资料格式无效"), {status: 400})
  }
  const hasNickname = Object.prototype.hasOwnProperty.call(input, "nickname")
  const hasAvatar = Object.prototype.hasOwnProperty.call(input, "avatar")
  const hasBackground = Object.prototype.hasOwnProperty.call(input, "profileBackground")
  const hasBio = Object.prototype.hasOwnProperty.call(input, "profileBio")
  const hasInterests = Object.prototype.hasOwnProperty.call(input, "profileInterests")
  const hasGallery = Object.prototype.hasOwnProperty.call(input, "profileGallery")
  if (![hasNickname, hasAvatar, hasBackground, hasBio, hasInterests, hasGallery].some(Boolean)) {
    throw Object.assign(new Error("没有需要保存的资料"), {status: 400})
  }

  const result = {}
  if (hasNickname) {
    const nickname = String(input.nickname || "").trim().replace(/\s+/g, " ")
    if (nickname.length < 2 || nickname.length > 16 || /[\u0000-\u001f\u007f]/.test(nickname)) {
      throw Object.assign(new Error("昵称需为 2—16 个字符"), {status: 400})
    }
    result.nickname = nickname
  }
  if (hasAvatar) {
    const avatar = String(input.avatar || "").trim()
    if (!avatarKeyPattern.test(avatar) && !isTrustedAvatar(avatar)) {
      throw Object.assign(new Error("头像必须使用校园头像或通过本服务上传"), {status: 400})
    }
    result.avatar = avatar
  }
  if (hasBackground) {
    const profileBackground = String(input.profileBackground || "").trim()
    if (profileBackground && !isTrustedAvatar(profileBackground)) {
      throw Object.assign(new Error("主页背景必须通过本服务上传"), {status: 400})
    }
    result.profileBackground = profileBackground
  }
  if (hasBio) {
    const profileBio = cleanText(input.profileBio, 121)
    if (profileBio.length > 120) throw Object.assign(new Error("个人介绍最多 120 个字符"), {status: 400})
    result.profileBio = profileBio
  }
  if (hasInterests) {
    if (!Array.isArray(input.profileInterests)) throw Object.assign(new Error("兴趣爱好格式无效"), {status: 400})
    const profileInterests = [...new Set(input.profileInterests.map(value => cleanText(value, 13)).filter(Boolean))]
    if (profileInterests.length > MAX_INTERESTS || profileInterests.some(value => value.length > 12)) {
      throw Object.assign(new Error("最多设置 12 个兴趣，每个不超过 12 个字符"), {status: 400})
    }
    result.profileInterests = profileInterests
  }
  if (hasGallery) {
    if (!Array.isArray(input.profileGallery)) throw Object.assign(new Error("照片墙格式无效"), {status: 400})
    const profileGallery = [...new Set(input.profileGallery.map(value => String(value || "").trim()).filter(Boolean))]
    if (profileGallery.length > MAX_GALLERY || profileGallery.some(value => !isTrustedAvatar(value))) {
      throw Object.assign(new Error("照片墙最多 6 张，且必须通过本服务上传"), {status: 400})
    }
    result.profileGallery = profileGallery
  }
  return result
}

export function canSendSocialMessage({resourceType, status = "active", mutualFollowing = false, initiatorId, userId, messageCount = 0}) {
  if (status !== "active") return false
  if (!["community_post", "user_profile"].includes(String(resourceType))) return true
  if (mutualFollowing) return true
  return Number(initiatorId) === Number(userId) && Number(messageCount) === 0
}
