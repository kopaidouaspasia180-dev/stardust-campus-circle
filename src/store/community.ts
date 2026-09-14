import Taro from "@tarojs/taro"
import {seedCommunityPosts, type CommunityPost} from "../data/community"
import {accountTenantStorageKey, apiRequest, readAccount, resolveMediaUrl, uploadMedia} from "../api/client"
import {demoContentEnabled} from "../utils/demoContent"
import {currentCampusName} from "./tenant"
import {COMMUNITY_POST_IMAGE_LIMIT} from "../utils/communityPolicy"

const POSTS_KEY = "stardust_community_posts_v4"

function postsKey() {
  return accountTenantStorageKey(POSTS_KEY)
}

function stringValue(value: unknown, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback
}

function normalizePost(value: unknown): CommunityPost | null {
  if (!value || typeof value !== "object") return null
  const raw = value as Partial<CommunityPost>
  const id = stringValue(raw.id)
  const content = stringValue(raw.content)
  if (!id || !content) return null
  const createdAt = Number(raw.createdAt)
  const images = Array.isArray(raw.images)
    ? raw.images.map(item => resolveMediaUrl(stringValue(item))).filter(Boolean).slice(0, COMMUNITY_POST_IMAGE_LIMIT)
    : raw.image ? [resolveMediaUrl(stringValue(raw.image))].filter(Boolean) : []
  const account = readAccount()
  const privateStateAllowed = Boolean(account?.phoneVerified)
  const comments = Array.isArray(raw.comments) ? raw.comments.flatMap((comment, index) => {
    if (!comment || typeof comment !== "object") return []
    const item = comment as Partial<CommunityPost["comments"][number]>
    const commentContent = stringValue(item.content)
    if (!commentContent) return []
    const mine = privateStateAllowed && Boolean(item.mine)
    return [{
      id: stringValue(item.id, `cached-comment-${id}-${index}`),
      user: mine ? account?.nickname || "校园同学" : stringValue(item.user, "校园同学"),
      avatar: mine ? account?.avatar || "" : stringValue(item.avatar),
      content: commentContent,
      time: stringValue(item.time, "刚刚"),
      mine,
      parentCommentId: stringValue(item.parentCommentId),
      replyToUser: stringValue(item.replyToUser),
      replyToContent: stringValue(item.replyToContent)
      ,userPublicId: stringValue(item.userPublicId)
    }]
  }) : []
  const mine = privateStateAllowed && Boolean(raw.mine)
  return {
    id,
    user: mine ? account?.nickname || "校园同学" : stringValue(raw.user, "校园同学"),
    avatar: mine ? account?.avatar || "" : stringValue(raw.avatar),
    avatarTone: ["blue", "orange", "pink", "violet", "gold", "green"].includes(String(raw.avatarTone)) ? raw.avatarTone as CommunityPost["avatarTone"] : "green",
    time: stringValue(raw.time, "刚刚"),
    demo: Boolean(raw.demo),
    channel: stringValue(raw.channel, "日常"),
    tag: stringValue(raw.tag, "校园日常"),
    content,
    location: stringValue(raw.location, currentCampusName()),
    image: images[0],
    images,
    comments,
    likes: Math.max(0, Number(raw.likes) || 0),
    liked: privateStateAllowed && Boolean(raw.liked),
    mine,
    authorId: stringValue(raw.authorId),
    authorPublicId: stringValue(raw.authorPublicId),
    following: privateStateAllowed && Boolean(raw.following),
    followerCount: Math.max(0, Number(raw.followerCount) || 0),
    status: raw.status || "active",
    moderationNote: stringValue(raw.moderationNote),
    createdAt: Number.isFinite(createdAt) && createdAt > 0 ? createdAt : Date.now()
  }
}

function cloneSeedPosts(): CommunityPost[] {
  return seedCommunityPosts.map(post => ({
    ...post,
    comments: post.comments.map(comment => ({...comment}))
  }))
}

function dedupePosts(posts: CommunityPost[]): CommunityPost[] {
  const seen = new Set<string>()
  return posts.filter(post => {
    const key = [
      String(post.user || "").trim(),
      String(post.content || "").trim(),
      String(post.location || "").trim(),
      (post.images?.length ? post.images : post.image ? [post.image] : []).join(",")
    ].join("|")
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export function readCommunityPosts(): CommunityPost[] {
  try {
    const raw = Taro.getStorageSync<unknown>(postsKey())
    const saved = Array.isArray(raw) ? raw.map(normalizePost).filter((post): post is CommunityPost => Boolean(post)) : []
    const showDemo = demoContentEnabled()
    if (!saved.length) return showDemo ? cloneSeedPosts() : []
    const visibleSaved = showDemo ? saved : saved.filter(post => !post.id.startsWith("seed-"))
    if (!visibleSaved.length) return showDemo ? cloneSeedPosts() : []

    const currentSeeds = new Map((showDemo ? cloneSeedPosts() : []).map(post => [post.id, post]))
    const refreshedSaved = visibleSaved.map(post => {
      const seed = currentSeeds.get(post.id)
      return seed ? {...seed, liked: post.liked, likes: post.likes, comments: post.comments} : post
    })
    const savedIds = new Set(refreshedSaved.map(post => post.id))
    const missingSeedPosts = showDemo ? cloneSeedPosts().filter(post => !savedIds.has(post.id)) : []
    return dedupePosts([...refreshedSaved, ...missingSeedPosts]).sort((a, b) => b.createdAt - a.createdAt)
  } catch {
    Taro.removeStorageSync(postsKey())
    return demoContentEnabled() ? cloneSeedPosts() : []
  }
}

export function writeCommunityPosts(posts: CommunityPost[]) {
  Taro.setStorageSync(postsKey(), posts.map(normalizePost).filter(Boolean))
}

export function addCommunityPost(input: {
  channel: string
  tag?: string
  content: string
  image?: string
  images?: string[]
  location?: string
}): CommunityPost {
  const account = readAccount()
  const images = (input.images?.length ? input.images : input.image ? [input.image] : []).slice(0, COMMUNITY_POST_IMAGE_LIMIT)
  const post: CommunityPost = {
    id: `user-${Date.now()}`,
    user: account?.nickname || "校园同学",
    avatar: account?.avatar || "",
    avatarTone: "green",
    time: "刚刚",
    demo: false,
    channel: input.channel,
    tag: input.tag || (input.channel === "推荐" ? "校园日常" : input.channel),
    content: input.content.trim(),
    location: input.location || currentCampusName(),
    image: images[0],
    images,
    comments: [],
    likes: 0,
    liked: false,
    createdAt: Date.now()
  }
  const next = [post, ...readCommunityPosts()]
  writeCommunityPosts(next)
  return post
}

export function toggleCommunityPostLike(postId: string): CommunityPost[] {
  const next = readCommunityPosts().map(post => {
    if (post.id !== postId) return post
    const liked = !post.liked
    return {...post, liked, likes: Math.max(0, post.likes + (liked ? 1 : -1))}
  })
  writeCommunityPosts(next)
  return next
}

export function addCommunityComment(postId: string, content: string, parentCommentId?: string): CommunityPost | undefined {
  const account = readAccount()
  let updated: CommunityPost | undefined
  const next = readCommunityPosts().map(post => {
    if (post.id !== postId) return post
    const replyTarget = parentCommentId ? post.comments.find(item => item.id === parentCommentId) : undefined
    updated = {
      ...post,
      comments: [
        ...post.comments,
        {
          id: `comment-${Date.now()}`,
          user: account?.nickname || "校园同学",
          avatar: account?.avatar || "",
          content: content.trim(),
          time: "刚刚",
          parentCommentId: replyTarget?.id,
          replyToUser: replyTarget?.user,
          replyToContent: replyTarget?.content
        }
      ]
    }
    return updated
  })
  writeCommunityPosts(next)
  return updated
}

export function readCommunityPost(postId: string): CommunityPost | undefined {
  return readCommunityPosts().find(post => post.id === postId)
}

type ApiPost = {
  id:string;channel:string;tag:string;content:string;location:string;image_url?:string;image_urls?:string[];created_at:string;status?:"pending"|"active"|"rejected"|"removed";moderation_note?:string;
  author:string;avatar:string;author_id?:string|number;author_public_id?:string;likes:number;liked:boolean;mine?:boolean;following?:boolean;follower_count?:number;
  comments:Array<{id:string;user:string;avatar?:string;user_public_id?:string;content:string;created_at:string;mine?:boolean;parent_comment_id?:string;parent_comment_content?:string;reply_to_name?:string}>
}

export function mapApiPost(post:ApiPost):CommunityPost {
  if (!post || !post.id || !post.content) throw new Error("校园圈返回了无法识别的数据")
  const created=new Date(post.created_at)
  const images = Array.isArray(post.image_urls) && post.image_urls.length ? post.image_urls.filter(Boolean).slice(0, COMMUNITY_POST_IMAGE_LIMIT) : post.image_url ? [post.image_url] : []
  return {
    id:post.id,user:post.author||"校园同学",avatar:post.avatar||"",avatarTone:"green",
    time:created.toLocaleDateString("zh-CN",{month:"numeric",day:"numeric"})+" 发布",demo:false,
    channel:post.channel,tag:post.tag,content:post.content,location:post.location,image:images[0],images,
    comments:(post.comments||[]).map(item=>({id:item.id,user:item.user,avatar:item.avatar||"",userPublicId:item.user_public_id||"",content:item.content,time:new Date(item.created_at).toLocaleDateString("zh-CN"),mine:Boolean(item.mine),parentCommentId:item.parent_comment_id||"",replyToUser:item.reply_to_name||"",replyToContent:item.parent_comment_content||""})),
    likes:Number(post.likes)||0,liked:Boolean(post.liked),mine:Boolean(post.mine),authorId:String(post.author_id||""),authorPublicId:post.author_public_id||"",following:Boolean(post.following),followerCount:Number(post.follower_count)||0,status:post.status||"active",moderationNote:post.moderation_note||"",createdAt:created.getTime()
  }
}

export async function syncCommunityPosts():Promise<CommunityPost[]> {
  const result=await apiRequest<{items:ApiPost[]}>("/community/posts")
  const remote=(Array.isArray(result?.items)?result.items:[]).flatMap(item=>{try{return [mapApiPost(item)]}catch{return []}})
  const next=dedupePosts([...remote,...(demoContentEnabled()?cloneSeedPosts():[])]).sort((a,b)=>b.createdAt-a.createdAt)
  writeCommunityPosts(next)
  return next
}

export async function fetchMyCommunityPosts():Promise<CommunityPost[]> {
  const result=await apiRequest<{items:ApiPost[]}>("/community/posts?scope=mine")
  return (Array.isArray(result?.items)?result.items:[]).flatMap(item=>{try{return [mapApiPost(item)]}catch{return []}}).filter(post=>post.status!=="removed").sort((a,b)=>b.createdAt-a.createdAt)
}

export async function fetchProfileCommunityPosts(publicId:string):Promise<CommunityPost[]> {
  const result=await apiRequest<{items:ApiPost[]}>(`/community/profiles/${encodeURIComponent(publicId)}/posts`)
  return (Array.isArray(result?.items)?result.items:[]).flatMap(item=>{try{return [mapApiPost(item)]}catch{return []}})
}

export async function fetchCommunityPost(postId:string):Promise<CommunityPost> {
  const result=await apiRequest<{item:ApiPost}>(`/community/posts/${encodeURIComponent(postId)}`)
  return mapApiPost(result.item)
}

export async function addCommunityPostRemote(input:{channel:string;tag?:string;content:string;image?:string;images?:string[];location?:string}) {
  const localImages = (input.images?.length ? input.images : input.image ? [input.image] : []).slice(0, COMMUNITY_POST_IMAGE_LIMIT)
  const imageUrls:string[] = []
  for (const filePath of localImages) imageUrls.push(await uploadMedia(filePath))
  return apiRequest<{item:ApiPost;moderation:"published"}>("/community/posts",{method:"POST",data:{channel:input.channel,tag:input.tag,content:input.content,imageUrl:imageUrls[0],imageUrls,location:input.location}})
}

export async function toggleCommunityPostLikeRemote(postId:string) {
  await apiRequest(`/community/posts/${postId}/like`,{method:"POST"})
  return syncCommunityPosts()
}

export async function addCommunityCommentRemote(postId:string,content:string,parentCommentId?:string) {
  await apiRequest(`/community/posts/${postId}/comments`,{method:"POST",data:{content,parentCommentId}})
  const posts=await syncCommunityPosts()
  return posts.find(post=>post.id===postId)
}

export async function toggleCommunityFollowRemote(postId:string) {
  return apiRequest<{following:boolean;followerCount:number}>(`/community/posts/${postId}/follow`,{method:"POST"})
}

export async function reportCommunityPostRemote(postId:string,reason:string) {
  await apiRequest(`/community/posts/${postId}/reports`,{method:"POST",data:{reason}})
  return {reported:true}
}

export async function withdrawCommunityPostRemote(postId:string) {
  await apiRequest(`/community/posts/${postId}`,{method:"DELETE"})
}

export async function deleteCommunityCommentRemote(commentId:string) {
  await apiRequest(`/community/comments/${commentId}`,{method:"DELETE"})
}

export async function reportCommunityCommentRemote(commentId:string,reason:string) {
  await apiRequest(`/community/comments/${commentId}/reports`,{method:"POST",data:{reason}})
}
