import Taro from "@tarojs/taro"
import {seedCommunityPosts, type CommunityPost} from "../data/community"
import {apiRequest, uploadMedia} from "../api/client"

const POSTS_KEY = "stardust_community_posts_v3"

function cloneSeedPosts(): CommunityPost[] {
  return seedCommunityPosts.map(post => ({
    ...post,
    comments: post.comments.map(comment => ({...comment}))
  }))
}

export function readCommunityPosts(): CommunityPost[] {
  const saved = Taro.getStorageSync<CommunityPost[]>(POSTS_KEY)
  if (!Array.isArray(saved) || saved.length === 0) return cloneSeedPosts()

  const savedIds = new Set(saved.map(post => post.id))
  const missingSeedPosts = cloneSeedPosts().filter(post => !savedIds.has(post.id))
  return [...saved, ...missingSeedPosts].sort((a, b) => b.createdAt - a.createdAt)
}

export function writeCommunityPosts(posts: CommunityPost[]) {
  Taro.setStorageSync(POSTS_KEY, posts)
}

export function addCommunityPost(input: {
  channel: string
  content: string
  image?: string
  location?: string
}): CommunityPost {
  const post: CommunityPost = {
    id: `user-${Date.now()}`,
    user: "校园同学",
    avatar: "我",
    avatarTone: "green",
    time: "刚刚",
    demo: false,
    channel: input.channel,
    tag: input.channel === "推荐" ? "校园日常" : input.channel,
    content: input.content.trim(),
    location: input.location || "唐山学院",
    image: input.image,
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

export function addCommunityComment(postId: string, content: string): CommunityPost | undefined {
  let updated: CommunityPost | undefined
  const next = readCommunityPosts().map(post => {
    if (post.id !== postId) return post
    updated = {
      ...post,
      comments: [
        ...post.comments,
        {id: `comment-${Date.now()}`, user: "校园同学", content: content.trim(), time: "刚刚"}
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
  id:string;channel:string;tag:string;content:string;location:string;image_url?:string;created_at:string;
  author:string;avatar:string;likes:number;liked:boolean;
  comments:Array<{id:string;user:string;content:string;created_at:string}>
}

function mapApiPost(post:ApiPost):CommunityPost {
  const created=new Date(post.created_at)
  return {
    id:post.id,user:post.author||"校园同学",avatar:(post.avatar||post.author||"同").slice(0,1),avatarTone:"green",
    time:created.toLocaleDateString("zh-CN",{month:"numeric",day:"numeric"})+" 发布",demo:false,
    channel:post.channel,tag:post.tag,content:post.content,location:post.location,image:post.image_url||undefined,
    comments:(post.comments||[]).map(item=>({id:item.id,user:item.user,content:item.content,time:new Date(item.created_at).toLocaleDateString("zh-CN")})),
    likes:Number(post.likes)||0,liked:Boolean(post.liked),createdAt:created.getTime()
  }
}

export async function syncCommunityPosts():Promise<CommunityPost[]> {
  const result=await apiRequest<{items:ApiPost[]}>("/community/posts")
  const remote=result.items.map(mapApiPost)
  const next=[...remote,...cloneSeedPosts()].filter((item,index,all)=>all.findIndex(other=>other.id===item.id)===index).sort((a,b)=>b.createdAt-a.createdAt)
  writeCommunityPosts(next)
  return next
}

export async function addCommunityPostRemote(input:{channel:string;content:string;image?:string;location?:string}) {
  const imageUrl=input.image?await uploadMedia(input.image):undefined
  await apiRequest("/community/posts",{method:"POST",data:{channel:input.channel,content:input.content,imageUrl,location:input.location}})
  return syncCommunityPosts()
}

export async function toggleCommunityPostLikeRemote(postId:string) {
  if(!postId.startsWith("seed-")) await apiRequest(`/community/posts/${postId}/like`,{method:"POST"})
  return postId.startsWith("seed-")?toggleCommunityPostLike(postId):syncCommunityPosts()
}

export async function addCommunityCommentRemote(postId:string,content:string) {
  if(postId.startsWith("seed-")) return addCommunityComment(postId,content)
  await apiRequest(`/community/posts/${postId}/comments`,{method:"POST",data:{content}})
  const posts=await syncCommunityPosts()
  return posts.find(post=>post.id===postId)
}
