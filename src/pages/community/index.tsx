import {useMemo, useState} from "react"
import {Button, Image, Input, ScrollView, Text, View} from "@tarojs/components"
import Taro, {useDidShow, usePullDownRefresh} from "@tarojs/taro"
import CommunityPostCard from "../../components/CommunityPostCard"
import {communityChannels, type CommunityPost} from "../../data/community"
import {fetchMyCommunityPosts, readCommunityPosts, syncCommunityPosts, toggleCommunityPostLikeRemote, withdrawCommunityPostRemote} from "../../store/community"
import {requirePhoneLogin, showApiError} from "../../api/client"
import {currentCampusName, currentTenant} from "../../store/tenant"
import {openCommunityProfile} from "../../utils/communityProfile"
import buildingIcon from "../../assets/icons/community/building-community.svg"
import messageIcon from "../../assets/icons/community/message-circle.svg"
import editIcon from "../../assets/icons/community/edit.svg"
import "./index.css"

const PENDING_CHANNEL_KEY = "stardust_community_pending_channel"
const primaryChannels = ["推荐", "日常", "吐槽", "互助"]
const COMMUNITY_NOTICE_TITLE = "校园圈文明公约"

export default function CommunityPage() {
  const [channel, setChannel] = useState("推荐")
  const [scope, setScope] = useState<"public" | "mine">("public")
  const [posts, setPosts] = useState<CommunityPost[]>(readCommunityPosts())
  const [loading, setLoading] = useState(false)
  const [loadFailed, setLoadFailed] = useState(false)
  const [query, setQuery] = useState("")
  const tenant = currentTenant()
  const campusName = currentCampusName()

  const refresh = async (requestedScope?: "public" | "mine", notify = false) => {
    const pendingChannel = Taro.getStorageSync<string>(PENDING_CHANNEL_KEY)
    if (pendingChannel && communityChannels.includes(pendingChannel)) {
      setChannel(pendingChannel)
      Taro.removeStorageSync(PENDING_CHANNEL_KEY)
    }
    const pendingScope = Taro.getStorageSync<string>("stardust_community_scope")
    const targetScope = requestedScope || (pendingScope === "mine" || pendingScope === "public" ? pendingScope : scope)
    if (pendingScope) Taro.removeStorageSync("stardust_community_scope")
    setScope(targetScope)
    setLoading(true)
    setLoadFailed(false)
    if (targetScope === "public") setPosts(readCommunityPosts())
    try {
      setPosts(targetScope === "mine" ? await fetchMyCommunityPosts() : await syncCommunityPosts())
    } catch (error) {
      setLoadFailed(true)
      if (notify) showApiError(error)
    } finally {
      setLoading(false)
      Taro.stopPullDownRefresh()
    }
  }

  useDidShow(() => {
    void refresh()
  })
  usePullDownRefresh(() => {void refresh(undefined, true)})

  const visiblePosts = useMemo(() => {
    const byChannel = scope === "mine" || channel === "推荐" ? posts : posts.filter(post => post.channel === channel)
    const keyword = query.trim().toLowerCase()
    if (!keyword) return byChannel
    return byChannel.filter(post => [post.content, post.user, post.tag, post.location, post.channel]
      .some(value => String(value || "").toLowerCase().includes(keyword)))
  }, [channel, posts, query, scope])

  const openPost = (post: CommunityPost) => {
    Taro.navigateTo({url: `/pages/post-detail/index?id=${encodeURIComponent(post.id)}`})
  }
  const openProfile = (post: CommunityPost) => {
    openCommunityProfile({publicId:post.authorPublicId, nickname:post.user, avatar:post.avatar, post})
  }

  const likePost = async (post: CommunityPost) => {
    if (post.status && post.status !== "active") return
    if (!await requirePhoneLogin("登录后才能点赞，公开校园动态无需登录也可以浏览。")) return
    try {
      setPosts(await toggleCommunityPostLikeRemote(post.id))
    } catch (error) {
      showApiError(error)
    }
  }

  const withdrawPost = async (post: CommunityPost) => {
    const modal = await Taro.showModal({title: "撤回这条发布？", content: "撤回后将不再公开展示，且无法恢复。", confirmText: "确认撤回", confirmColor: "#d94b61"})
    if (!modal.confirm) return
    try {
      await withdrawCommunityPostRemote(post.id)
      await refresh("mine")
      Taro.showToast({title: "已撤回", icon: "success"})
    } catch (error) {
      showApiError(error)
    }
  }

  const openPublisher = async () => {
    if (!await requirePhoneLogin("登录后才能发布校园动态，登录后内容会保存在你的账号下。")) return
    Taro.navigateTo({url: "/pages/publish/index"})
  }

  const openMessages = async () => {
    if (!await requirePhoneLogin("登录后才能查看属于你的消息和聊天记录。")) return
    Taro.navigateTo({url: "/pages/messages/index"})
  }

  const switchScope = async () => {
    if (scope === "public" && !await requirePhoneLogin("登录后才能查看自己的发布记录。")) return
    void refresh(scope === "public" ? "mine" : "public")
  }

  return (
    <View className="page community-page">
      <View className="community-header">
        <View className="community-header-copy">
          <Text className="community-title">校园圈</Text>
          <View className="community-campus-line">
            <Text>{campusName}</Text>
            <Text className="community-school-switch" onClick={() => Taro.navigateTo({url: "/pages/school-select/index"})}>切换</Text>
          </View>
        </View>
        <View className="community-header-actions">
          {scope === "public" && <View className="community-message-entry" onClick={() => void openMessages()}>
            <Image src={messageIcon}/><Text>消息</Text>
          </View>}
          <View className="community-scope-entry" onClick={() => void switchScope()}>
            <Image src={buildingIcon}/>
            <Text>{scope === "public" ? "我的" : "返回"}</Text>
          </View>
        </View>
      </View>

      {scope === "public" && <>
        <View className="community-search">
          <Text>搜</Text>
          <Input value={query} maxlength={30} confirmType="search" onInput={event => setQuery(event.detail.value)} placeholder="搜动态、地点或话题"/>
          {!!query && <Text className="community-search-clear" onClick={() => setQuery("")}>清除</Text>}
        </View>
        <ScrollView className="channel-scroll" scrollX enhanced showScrollbar={false}>
          <View className="channel-row">
            {primaryChannels.map(item => (
              <Text key={item} className={channel === item ? "active" : ""} onClick={() => setChannel(item)}>{item}</Text>
            ))}
          </View>
        </ScrollView>
      </>}

      <View className={`community-notice ${scope === "mine" ? "is-mine" : ""}`}>
        <Image src={messageIcon}/>
        <Text>{scope === "mine"
          ? `${tenant.shortName || tenant.name} · ${campusName}的发布记录`
          : `校园公告 · ${COMMUNITY_NOTICE_TITLE}`}</Text>
      </View>

      {loading && <View className="community-inline-state"><Text>正在更新校园动态…</Text></View>}
      {loadFailed && visiblePosts.length > 0 && <View className="community-inline-state is-error" onClick={() => void refresh(scope, true)}><Text>网络开小差了，正在显示已缓存内容</Text><Text>重新加载</Text></View>}

      <View className="community-feed">
        {visiblePosts.map(post => (
          <View className="community-post-shell" key={post.id}>
            {scope === "mine" && <View className={`community-post-status status-${post.status || "active"}`}>
              <View><Text>{post.status === "pending" ? "历史待处理" : post.status === "rejected" ? "未通过" : "已公开"}</Text><Text>{post.status === "pending" ? "这是旧版本留下的记录，请联系管理员处理" : post.status === "rejected" ? (post.moderationNote || "内容未通过社区规范") : "同校同学可见"}</Text></View>
              <Text onClick={() => void withdrawPost(post)}>撤回</Text>
            </View>}
            <CommunityPostCard post={post} variant="editorial" onOpen={openPost} onLike={likePost} onAvatar={openProfile}/>
          </View>
        ))}
      </View>

      {!loading && visiblePosts.length === 0 && (
        <View className="community-empty">
          <Image src={messageIcon}/>
          <Text>{loadFailed ? "暂时没连上校园圈" : query ? "没有找到相关动态" : scope === "mine" ? "还没有发布记录" : "这里还没有动态"}</Text>
          <Text>{loadFailed ? "可以检查网络后重新加载，已有内容不会丢失" : query ? "换个关键词，或清除搜索看看全部动态" : scope === "mine" ? "发布成功后会立即出现在这里" : "分享校园生活，和同学们聊聊吧"}</Text>
          <Text className="community-empty-action" onClick={() => loadFailed ? void refresh(scope, true) : query ? setQuery("") : void openPublisher()}>{loadFailed ? "重新加载" : query ? "清除搜索" : scope === "mine" ? "发布新动态" : "发布第一条动态"}</Text>
        </View>
      )}

      <Button className="publish-float" aria-label="发布校园动态" onClick={() => void openPublisher()}>
        <Image src={editIcon}/>
      </Button>

    </View>
  )
}
