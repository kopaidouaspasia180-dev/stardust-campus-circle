export type CommunityComment = {
  id: string
  user: string
  avatar?: string
  content: string
  time: string
  mine?: boolean
  parentCommentId?: string
  replyToUser?: string
  replyToContent?: string
  userPublicId?: string
}

export type CommunityPost = {
  id: string
  user: string
  avatar: string
  avatarTone: "blue" | "orange" | "pink" | "violet" | "gold" | "green"
  time: string
  demo: boolean
  channel: string
  tag: string
  content: string
  location: string
  image?: string
  images?: string[]
  imageCredit?: string
  imageSource?: string
  comments: CommunityComment[]
  likes: number
  liked?: boolean
  mine?: boolean
  authorId?: string
  authorPublicId?: string
  following?: boolean
  followerCount?: number
  status?: "pending" | "active" | "rejected" | "removed"
  moderationNote?: string
  createdAt: number
}

// 快速上线版只保留通用校园论坛频道，不附带交易或经营性分类。
export const communityChannels = ["推荐", "日常", "吐槽", "互助"]

// 正式微信小程序不注入示例帖子，首次进入展示真实空状态。
export const seedCommunityPosts: CommunityPost[] = []
