import {Image, Text, View} from "@tarojs/components"
import type {BaseEventOrig} from "@tarojs/components"
import type {CommunityPost} from "../data/community"
import locationIcon from "../assets/icons/community/map-pin.svg"
import commentIcon from "../assets/icons/community/message.svg"
import heartIcon from "../assets/icons/community/heart.svg"
import CampusAvatar from "./CampusAvatar"
import "./CommunityPostCard.css"

type Props = {
  post: CommunityPost
  compact?: boolean
  variant?: "card" | "editorial"
  onOpen?: (post: CommunityPost) => void
  onLike?: (post: CommunityPost) => void
  onAvatar?: (post: CommunityPost) => void
}

export default function CommunityPostCard({post, compact = false, variant = "card", onOpen, onLike, onAvatar}: Props) {
  const editorial = variant === "editorial"
  const images = post.images?.length ? post.images : post.image ? [post.image] : []
  const handleLike = (event: BaseEventOrig) => {
    event.stopPropagation()
    onLike?.(post)
  }
  const handleAvatar = (event: BaseEventOrig) => {
    if (!onAvatar) return
    event.stopPropagation()
    onAvatar(post)
  }

  return (
    <View className={`community-post-card ${compact ? "is-compact" : ""} ${editorial ? "is-editorial" : ""}`} onClick={() => onOpen?.(post)}>
      <View className="post-user-row">
        <View onClick={handleAvatar}><CampusAvatar avatar={post.avatar} seed={post.user} className={`post-avatar ${editorial ? "post-avatar-editorial" : ""}`}/></View>
        <View className="post-user-copy" onClick={handleAvatar}>
          <View className="post-name-line">
            <Text className="post-user-name">{post.user}</Text>
          </View>
          <Text className="post-user-meta">{post.time}{editorial ? " · 本校同学" : ""}</Text>
        </View>
        <Text className="post-tag">{post.tag}</Text>
      </View>

      <Text className="post-content">{post.content}</Text>

      {images.length > 0 && (
        <>
          <View className={`post-image-grid count-${Math.min(images.length, 9)}`}>
            {images.slice(0, 9).map((source, index) => <Image className="post-image" src={source} mode="aspectFill" key={`${source}-${index}`}/>) }
          </View>
          {post.imageCredit && <Text className="post-image-credit">{post.imageCredit}</Text>}
        </>
      )}

      {editorial
        ? <View className="post-editorial-meta">
          <View className="post-location"><Image src={locationIcon}/><Text>{post.location}</Text></View>
          <View className="post-action-row">
            <View><Image src={commentIcon}/><Text>{post.comments.length}</Text></View>
            <View className={post.liked ? "liked" : ""} onClick={handleLike}><Image src={heartIcon}/><Text>{post.likes}</Text></View>
          </View>
        </View>
        : <>
          {!post.image && <Text className="post-location">⌖ {post.location}</Text>}
          <View className="post-action-row">
            <Text>评论 {post.comments.length}</Text>
            <Text className={post.liked ? "liked" : ""} onClick={handleLike}>{post.liked ? "已赞" : "赞"} {post.likes}</Text>
          </View>
        </>}
    </View>
  )
}
