import {apiRequest, uploadMedia} from "../api/client"

export type RankingCategory = "food" | "fun" | "life" | "custom"
export type RankingStatus = "pending" | "active" | "rejected" | "removed"
export type RankingSort = "top" | "week" | "new"

export type RankingList = {
  id: string
  title: string
  description: string
  entryLabel: string
  coverUrl: string
  builtIn: boolean
  mine: boolean
  status: RankingStatus
  moderationNote: string
  itemCount: number
  createdAt: string | null
}

export type RankingComment = {
  id: string
  content: string
  mine: boolean
  author: {publicId: string; nickname: string; avatar: string}
  createdAt: string
}

export type RankingPlace = {
  id: string
  category: RankingCategory
  listId: string
  listTitle: string
  name: string
  note: string
  location: string
  imageUrl: string
  coverKey: string
  likes: number
  weeklyLikes: number
  favorites: number
  comments: number
  liked: boolean
  favorited: boolean
  mine: boolean
  campusSlug: string
  campusName: string
  status: RankingStatus
  moderationNote: string
  studentSubmitted: boolean
  featured?: boolean
  referenceSource: string
  referenceRating: number | null
  referenceCount: number
  referenceUrl: string
  createdAt: string
}

export async function fetchRankingLists() {
  return apiRequest<{items: RankingList[]}>("/rankings/lists")
}

export async function createRankingList(input: {title: string; description: string; entryLabel: string; coverPath?: string}) {
  const coverUrl = input.coverPath ? await uploadMedia(input.coverPath) : ""
  return apiRequest<{item: RankingList; moderation: "pending_review"}>("/rankings/lists", {
    method: "POST",
    data: {title: input.title, description: input.description, entryLabel: input.entryLabel, coverUrl}
  })
}

export async function withdrawRankingList(id: string) {
  return apiRequest<{removed: true}>(`/rankings/lists/${id}`, {method: "DELETE"})
}

export async function fetchRankingPlaces(listId: string, options: {sort?: RankingSort; query?: string} = {}) {
  const sort = options.sort || "top"
  const query = String(options.query || "").trim()
  return apiRequest<{items: RankingPlace[]; total: number; sort: RankingSort; query: string}>(
    `/rankings/places?list=${encodeURIComponent(listId)}&sort=${encodeURIComponent(sort)}&q=${encodeURIComponent(query)}`
  )
}

export async function submitRankingPlace(input: {
  listId: string
  name: string
  note: string
  location: string
  coverPath?: string
}) {
  const imageUrl = input.coverPath ? await uploadMedia(input.coverPath) : ""
  return apiRequest<{item: RankingPlace; moderation: "pending_review"}>("/rankings/places", {
    method: "POST",
    data: {
      listId: input.listId,
      name: input.name,
      note: input.note,
      location: input.location,
      imageUrl
    }
  })
}

export async function toggleRankingLike(id: string) {
  return apiRequest<{liked: boolean; likes: number}>(`/rankings/places/${id}/like`, {
    method: "POST"
  })
}

export async function toggleRankingFavorite(id: string) {
  return apiRequest<{favorited: boolean; favorites: number}>(`/rankings/places/${id}/favorite`, {method: "POST"})
}

export async function fetchRankingComments(id: string) {
  return apiRequest<{items: RankingComment[]}>(`/rankings/places/${id}/comments`)
}

export async function submitRankingComment(id: string, content: string) {
  return apiRequest<{item: RankingComment}>(`/rankings/places/${id}/comments`, {method: "POST", data: {content}})
}

export async function deleteRankingComment(id: string) {
  return apiRequest<{removed: true}>(`/rankings/comments/${id}`, {method: "DELETE"})
}

export async function reportRankingComment(id: string, reason: string) {
  return apiRequest<{reported: true}>(`/rankings/comments/${id}/reports`, {method: "POST", data: {reason}})
}

export async function reportRankingPlace(id: string, reason: string, detail = "") {
  return apiRequest<{reported: true}>(`/rankings/places/${id}/reports`, {
    method: "POST",
    data: {reason, detail}
  })
}

export async function withdrawRankingPlace(id: string) {
  return apiRequest<{removed: true}>(`/rankings/places/${id}`, {method: "DELETE"})
}
