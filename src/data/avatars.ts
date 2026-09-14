import avatar1 from "../assets/avatars/campus-avatar-1.jpg"
import avatar2 from "../assets/avatars/campus-avatar-2.jpg"
import avatar3 from "../assets/avatars/campus-avatar-3.jpg"
import avatar4 from "../assets/avatars/campus-avatar-4.jpg"
import avatar5 from "../assets/avatars/campus-avatar-5.jpg"
import avatar6 from "../assets/avatars/campus-avatar-6.jpg"
import {resolveMediaUrl} from "../api/client"

export const campusAvatars = [
  {key: "campus-avatar-1", source: avatar1, label: "耳机少年"},
  {key: "campus-avatar-2", source: avatar2, label: "星星同学"},
  {key: "campus-avatar-3", source: avatar3, label: "棒球帽同学"},
  {key: "campus-avatar-4", source: avatar4, label: "读书同学"},
  {key: "campus-avatar-5", source: avatar5, label: "摄影同学"},
  {key: "campus-avatar-6", source: avatar6, label: "篮球同学"}
] as const

const avatarSources = Object.fromEntries(campusAvatars.map(item => [item.key, item.source])) as Record<string, string>

export function defaultAvatarKey(seed: string | number = "校园同学") {
  const value = String(seed)
  let hash = 0
  for (let index = 0; index < value.length; index += 1) hash = ((hash * 31) + value.charCodeAt(index)) >>> 0
  return campusAvatars[hash % campusAvatars.length].key
}

export function resolveCampusAvatar(avatar?: string, seed: string | number = "校园同学") {
  const value = String(avatar || "").trim()
  if (avatarSources[value]) return avatarSources[value]
  if (/^(?:https?:|wxfile:|data:|blob:|\/campus-circle\/api\/uploads\/)/i.test(value)) return resolveMediaUrl(value)
  return avatarSources[defaultAvatarKey(seed)]
}

export function isCampusAvatarKey(value?: string) {
  return Boolean(value && avatarSources[value])
}
