import {useState} from "react"
import {Button, Input, Text, View} from "@tarojs/components"
import Taro, {useDidShow, useRouter} from "@tarojs/taro"
import CommunityPostCard from "../../components/CommunityPostCard"
import type {CommunityComment, CommunityPost} from "../../data/community"
import {addCommunityCommentRemote, deleteCommunityCommentRemote, fetchCommunityPost, readCommunityPost, reportCommunityCommentRemote, reportCommunityPostRemote, toggleCommunityFollowRemote, toggleCommunityPostLikeRemote, withdrawCommunityPostRemote} from "../../store/community"
import {apiRequest, requirePhoneLogin, showApiError} from "../../api/client"
import {currentCampusName} from "../../store/tenant"
import {openCommunityProfile} from "../../utils/communityProfile"
import CampusAvatar from "../../components/CampusAvatar"
import "./index.css"

export default function PostDetailPage() {
  const router = useRouter()
  const postId = decodeURIComponent(router.params.id || "")
  const [post, setPost] = useState<CommunityPost | undefined>(() => readCommunityPost(postId))
  const [comment, setComment] = useState("")
  const [replyTarget, setReplyTarget] = useState<CommunityComment | null>(null)
  const [loading, setLoading] = useState(!readCommunityPost(postId))
  const [submitting, setSubmitting] = useState(false)
  const [followLoading, setFollowLoading] = useState(false)
  const [chatStarting, setChatStarting] = useState(false)
  const [loadFailed, setLoadFailed] = useState(false)

  const load = async () => {
    const cached = readCommunityPost(postId)
    if (cached) setPost(cached)
    setLoading(true)
    setLoadFailed(false)
    try {
      setPost(await fetchCommunityPost(postId))
    } catch {
      setLoadFailed(true)
    } finally {
      setLoading(false)
    }
  }

  useDidShow(() => {void load()})

  const likePost = async () => {
    if (!await requirePhoneLogin("登录后才能点赞，帖子内容无需登录也可以浏览。")) return
    if (post?.status && post.status !== "active") {
      Taro.showToast({title: "审核通过后才能点赞", icon: "none"})
      return
    }
    try {
      const items=await toggleCommunityPostLikeRemote(postId)
      setPost(items.find(item=>item.id===postId))
    } catch (error) {
      showApiError(error)
    }
  }

  const submitComment = async () => {
    if (!await requirePhoneLogin("登录后才能发表评论。")) return
    if (!comment.trim()) {
      Taro.showToast({title: "先写下评论吧", icon: "none"})
      return
    }
    if (submitting) return
    setSubmitting(true)
    try {
      const updated = await addCommunityCommentRemote(postId, comment, replyTarget?.id)
      if (updated) setPost(updated)
      setComment("")
      setReplyTarget(null)
      Taro.showToast({title: "评论成功", icon: "success"})
    } catch (error) {
      showApiError(error)
    } finally {
      setSubmitting(false)
    }
  }

  const toggleFollow = async () => {
    if (!await requirePhoneLogin("登录后才能关注同学。")) return
    if (!post || post.mine || followLoading) return
    setFollowLoading(true)
    try {
      const result = await toggleCommunityFollowRemote(post.id)
      setPost(current => current ? {...current, following: result.following, followerCount: result.followerCount} : current)
      Taro.showToast({title: result.following ? "已关注" : "已取消关注", icon: "success"})
    } catch (error) {
      showApiError(error)
    } finally {
      setFollowLoading(false)
    }
  }

  const startPrivateChat = async () => {
    if (!await requirePhoneLogin("登录后才能私信帖子作者。")) return
    if (!post || post.mine || chatStarting) return
    setChatStarting(true)
    try {
      const result = await apiRequest<{item:{id:string}}>("/conversations", {method: "POST", data: {resourceType: "community_post", resourceId: post.id}})
      if (!result.item?.id) throw new Error("私信会话创建失败，请稍后重试")
      Taro.navigateTo({url: `/pages/chat/index?id=${encodeURIComponent(result.item.id)}`})
    } catch (error) {
      showApiError(error)
    } finally {
      setChatStarting(false)
    }
  }

  const manageComment = async (commentId: string, mine = false) => {
    if (!await requirePhoneLogin("登录后才能管理或举报评论。")) return
    try {
      if (mine) {
        const modal = await Taro.showModal({title: "删除评论？", content: "删除后无法恢复。", confirmText: "删除", confirmColor: "#d94b61"})
        if (!modal.confirm) return
        await deleteCommunityCommentRemote(commentId)
        Taro.showToast({title: "评论已删除", icon: "success"})
      } else {
        const result = await Taro.showActionSheet({itemList: ["广告或诈骗", "侵犯隐私", "辱骂攻击", "虚假信息", "其他违规"]})
        const reason = ["广告或诈骗", "侵犯隐私", "辱骂攻击", "虚假信息", "其他违规"][result.tapIndex]
        await reportCommunityCommentRemote(commentId, reason)
        Taro.showToast({title: "举报已提交", icon: "success"})
      }
      setPost(await fetchCommunityPost(postId))
    } catch (error) {
      const message = String((error as {errMsg?: string})?.errMsg || error)
      if (!message.includes("cancel")) showApiError(error)
    }
  }

  const withdrawPost = async () => {
    if (!await requirePhoneLogin("登录后才能管理自己的发布。")) return
    const modal = await Taro.showModal({title: "撤回这条发布？", content: "撤回后无法恢复。", confirmText: "确认撤回", confirmColor: "#d94b61"})
    if (!modal.confirm) return
    try {
      await withdrawCommunityPostRemote(postId)
      Taro.showToast({title: "已撤回", icon: "success"})
      setTimeout(() => Taro.navigateBack(), 350)
    } catch (error) {
      showApiError(error)
    }
  }

  const reportPost = async () => {
    if (!await requirePhoneLogin("登录后才能举报内容。")) return
    const targetPost = post
    if (!targetPost) return
    try {
      const result = await Taro.showActionSheet({
        itemList: ["广告或诈骗", "侵犯隐私", "辱骂攻击", "虚假信息", "其他违规"]
      })
      const reason = ["广告或诈骗", "侵犯隐私", "辱骂攻击", "虚假信息", "其他违规"][result.tapIndex]
      await reportCommunityPostRemote(targetPost.id, reason)
      Taro.showToast({title: "举报已提交", icon: "success"})
    } catch (error) {
      const message = String((error as {errMsg?: string})?.errMsg || error)
      if (!message.includes("cancel")) showApiError(error)
    }
  }

  if (!post) {
    return <View className="page detail-empty-page"><View className="empty">{loading ? "正在加载内容…" : loadFailed ? "内容加载失败" : "这条内容不存在或已被删除"}</View>{loadFailed && <Button className="detail-retry" onClick={() => void load()}>重新加载</Button>}</View>
  }

  const canInteract = !post.status || post.status === "active"
  return (
    <View className="page post-detail-page">
      <View className="detail-context"><Text>{currentCampusName()}</Text><Text>仅本校区可见</Text></View>
      <CommunityPostCard post={post} onLike={likePost} onAvatar={() => openCommunityProfile({publicId:post.authorPublicId, nickname:post.user, avatar:post.avatar, post})}/>

      {!post.mine && canInteract && <View className="detail-social-actions">
        <View><Text>{post.followerCount || 0}</Text><Text>关注该同学</Text></View>
        <Button loading={followLoading} disabled={followLoading} className={post.following ? "is-following" : ""} onClick={() => void toggleFollow()}>{post.following ? "已关注" : "+ 关注"}</Button>
        <Button loading={chatStarting} disabled={chatStarting} onClick={() => void startPrivateChat()}>{chatStarting ? "打开中" : "私信"}</Button>
      </View>}

      {post.mine && <View className={`detail-owner-state state-${post.status || "active"}`}>
        <View><Text>{post.status === "pending" ? "正在审核" : post.status === "rejected" ? "未通过审核" : "已公开"}</Text><Text>{post.moderationNote || (post.status === "pending" ? "审核通过后会在当前学校公开" : "同校同学可查看与互动")}</Text></View>
        <Text onClick={() => void withdrawPost()}>撤回</Text>
      </View>}

      <View className="comment-section">
        <View className="comment-title-row">
          <Text>全部评论</Text>
          <View><Text>{post.comments.length} 条</Text>{!post.mine && canInteract && <Text className="report-entry" onClick={reportPost}>举报内容</Text>}</View>
        </View>
        <View className="comment-list">
          {post.comments.map(item => (
            <View className="comment-item" key={item.id}>
              <View onClick={() => openCommunityProfile({publicId:item.userPublicId, nickname:item.user, avatar:item.avatar})}><CampusAvatar avatar={item.avatar} seed={item.user} className="comment-avatar"/></View>
              <View>
                <View className="comment-meta">
                  <View className="comment-author-line">
                    <Text>{item.user}</Text>
                    {(item.replyToUser || item.parentCommentId) && <><Text>回复</Text><Text>@{item.replyToUser || "原评论用户"}</Text></>}
                  </View>
                  <View><Text>{item.time}</Text><Text className="comment-reply" onClick={() => setReplyTarget(item)}>回复</Text><Text className="comment-manage" onClick={() => void manageComment(item.id, item.mine)}>{item.mine ? "删除" : "举报"}</Text></View>
                </View>
                {(item.replyToUser || item.parentCommentId) && <View className="comment-reply-context">
                  <Text>{item.user} 回复 @{item.replyToUser || "原评论用户"}</Text>
                  {item.replyToContent && <Text>“{item.replyToContent}”</Text>}
                </View>}
                <Text className="comment-content">{item.content}</Text>
              </View>
            </View>
          ))}
          {post.comments.length === 0 && <Text className="no-comment">还没有评论，来坐第一排吧</Text>}
        </View>
      </View>

      {canInteract ? <View className="comment-composer">
          {replyTarget && <View className="reply-target">
            <View><Text>正在回复 @{replyTarget.user}</Text><Text>{replyTarget.content}</Text></View>
            <Text onClick={() => setReplyTarget(null)}>取消</Text>
          </View>}
          <Input value={comment} maxlength={150} onInput={event => setComment(event.detail.value)} placeholder={replyTarget ? `回复 @${replyTarget.user}` : "友善评论，温暖校园"}/>
          <Button loading={submitting} disabled={submitting || !comment.trim()} onClick={submitComment}>发送</Button>
        </View>
        : <View className="comment-disabled">内容审核通过后开放评论</View>}
    </View>
  )
}
