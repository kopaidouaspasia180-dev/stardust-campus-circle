import Taro from "@tarojs/taro"
import type {CommunityPost} from "../data/community"
import {currentTenant} from "../store/tenant"

const PROFILE_PREVIEW_KEY = "stardust_community_profile_preview_v1"

function scopedProfilePreviewKey() {
  return `${PROFILE_PREVIEW_KEY}:${currentTenant().id}`
}

export type CommunityProfilePreview = {
  nickname: string
  avatar: string
  post?: CommunityPost
}

export function openCommunityProfile(input: {publicId?: string; nickname: string; avatar?: string; post?: CommunityPost}) {
  const publicId = String(input.publicId || "").trim()
  if (/^\d{6}$/.test(publicId)) {
    Taro.navigateTo({url: `/pages/user-profile/index?id=${encodeURIComponent(publicId)}`})
    return
  }
  Taro.setStorageSync(scopedProfilePreviewKey(), {
    nickname: String(input.nickname || "校园同学").trim() || "校园同学",
    avatar: String(input.avatar || "").trim(),
    post: input.post
  } satisfies CommunityProfilePreview)
  Taro.navigateTo({url: "/pages/user-profile/index?preview=1"})
}

export function readCommunityProfilePreview(): CommunityProfilePreview | null {
  const value = Taro.getStorageSync<CommunityProfilePreview>(scopedProfilePreviewKey())
  if (!value || typeof value !== "object") return null
  return {
    nickname: String(value.nickname || "校园同学").trim() || "校园同学",
    avatar: String(value.avatar || "").trim(),
    post: value.post
  }
}
