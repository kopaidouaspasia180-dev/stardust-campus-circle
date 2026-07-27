import {useState} from "react"
import {Button, Input, Text, View} from "@tarojs/components"
import Taro, {useDidShow, useRouter} from "@tarojs/taro"
import TenantHeader from "../../components/TenantHeader"
import CommunityPostCard from "../../components/CommunityPostCard"
import type {CommunityPost} from "../../data/community"
import {addCommunityCommentRemote, readCommunityPost, syncCommunityPosts, toggleCommunityPostLikeRemote} from "../../store/community"
import {currentCampusName, currentTenant} from "../../store/tenant"
import "./index.css"

export default function PostDetailPage() {
  const router = useRouter()
  const postId = decodeURIComponent(router.params.id || "")
  const [post, setPost] = useState<CommunityPost | undefined>(() => readCommunityPost(postId))
  const [comment, setComment] = useState("")

  useDidShow(() => {setPost(readCommunityPost(postId));syncCommunityPosts().then(items=>setPost(items.find(item=>item.id===postId))).catch(()=>{})})

  const likePost = async () => {
    const items=await toggleCommunityPostLikeRemote(postId)
    setPost(items.find(item=>item.id===postId))
  }

  const submitComment = async () => {
    if (!comment.trim()) {
      Taro.showToast({title: "先写下评论吧", icon: "none"})
      return
    }
    const updated = await addCommunityCommentRemote(postId, comment)
    if (updated) {
      setPost(updated)
      setComment("")
      Taro.showToast({title: "评论成功", icon: "success"})
    }
  }

  if (!post) {
    return <View className="page"><View className="empty">这条内容不存在或已被删除</View></View>
  }

  return (
    <View className="page post-detail-page">
      <TenantHeader tenant={currentTenant()} campusName={currentCampusName()}/>
      <CommunityPostCard post={post} onLike={likePost}/>

      <View className="comment-section">
        <View className="comment-title-row">
          <Text>全部评论</Text>
          <Text>{post.comments.length} 条</Text>
        </View>
        <View className="comment-list">
          {post.comments.map(item => (
            <View className="comment-item" key={item.id}>
              <Text className="comment-avatar">{item.user.slice(0, 1)}</Text>
              <View>
                <View className="comment-meta"><Text>{item.user}</Text><Text>{item.time}</Text></View>
                <Text className="comment-content">{item.content}</Text>
              </View>
            </View>
          ))}
          {post.comments.length === 0 && <Text className="no-comment">还没有评论，来坐第一排吧</Text>}
        </View>
      </View>

      <View className="comment-composer">
        <Input value={comment} maxlength={150} onInput={event => setComment(event.detail.value)} placeholder="友善评论，温暖校园"/>
        <Button onClick={submitComment}>发送</Button>
      </View>
    </View>
  )
}
