import {Image, Text, View} from "@tarojs/components"
import type {BaseEventOrig} from "@tarojs/components"
import type {CommunityPost} from "../data/community"
import "./CommunityPostCard.css"

type Props = {
  post: CommunityPost
  compact?: boolean
  onOpen?: (post: CommunityPost) => void
  onLike?: (post: CommunityPost) => void
}

export default function CommunityPostCard({post, compact = false, onOpen, onLike}: Props) {
  const handleLike = (event: BaseEventOrig) => {
    event.stopPropagation()
    onLike?.(post)
  }

  return (
    <View className={`community-post-card ${compact ? "is-compact" : ""}`} onClick={() => onOpen?.(post)}>
      <View className="post-user-row">
        <Text className={`post-avatar tone-${post.avatarTone}`}>{post.avatar}</Text>
        <View className="post-user-copy">
          <Text className="post-user-name">{post.user}</Text>
          <Text className="post-user-meta">{post.time}{post.demo ? " · 演示账号" : ""}</Text>
        </View>
        <Text className="post-tag">{post.tag}</Text>
      </View>

      <Text className="post-content">{post.content}</Text>

      {post.image && (
        <View className="post-image-wrap">
          <Image className="post-image" src={post.image} mode="aspectFill"/>
          <View className="post-image-shade"/>
          <Text className="post-image-location">⌖ {post.location}</Text>
        </View>
      )}

      {!post.image && <Text className="post-location">⌖ {post.location}</Text>}

      <View className="post-action-row">
        <Text>评论 {post.comments.length}</Text>
        <Text className={post.liked ? "liked" : ""} onClick={handleLike}>{post.liked ? "已赞" : "赞"} {post.likes}</Text>
      </View>
    </View>
  )
}
