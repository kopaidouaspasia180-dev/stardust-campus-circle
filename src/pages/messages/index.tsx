import {useMemo, useState} from "react"
import {Image, Text, View} from "@tarojs/components"
import Taro, {useDidShow, usePullDownRefresh} from "@tarojs/taro"
import {apiRequest, hasPhoneLogin, requirePhoneLogin, showApiError} from "../../api/client"
import {currentCampusName} from "../../store/tenant"
import messageIcon from "../../assets/icons/community/message.svg"
import "./index.css"

type PageTab = "conversation" | "notice"

type Conversation = {
  id: string
  resource_type: string
  resource_title: string
  peer_name: string
  last_message?: string
  last_message_at: string
  unread_count: number
  status: "active" | "closed"
}

type Notice = {
  id: string
  type: string
  title: string
  content: string
  created_at: string
  resource_id?: string
}

const resourceMeta = {label: "校园圈私信", avatar: messageIcon}

const formatTime = (value: string) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
  if (target === today) return date.toLocaleTimeString("zh-CN", {hour: "2-digit", minute: "2-digit", hour12: false})
  if (today - target === 86_400_000) return "昨天"
  return date.toLocaleDateString("zh-CN", {month: "numeric", day: "numeric"})
}

const noticeMeta = (type: string) => {
  if (type === "community_reply") return {label: "校园互动", icon: messageIcon}
  return {label: "校园圈通知", icon: messageIcon}
}

export default function MessagesPage() {
  const [campusName, setCampusName] = useState(currentCampusName())
  const [tab, setTab] = useState<PageTab>("conversation")
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [notices, setNotices] = useState<Notice[]>([])
  const [loaded, setLoaded] = useState(false)
  const [loadError, setLoadError] = useState("")
  const [marking, setMarking] = useState(false)

  const unreadCount = useMemo(
    () => conversations.reduce((sum, item) => sum + Number(item.unread_count || 0), 0),
    [conversations]
  )
  const filteredConversations = useMemo(() => conversations.filter(item => ["community_post","user_profile"].includes(item.resource_type)), [conversations])

  const load = async () => {
    if (!hasPhoneLogin()) {
      setConversations([])
      setNotices([])
      setLoadError("")
      setLoaded(true)
      return
    }
    setLoadError("")
    try {
      const [conversationResult, noticeResult] = await Promise.all([
        apiRequest<{items: Conversation[]}>('/conversations'),
        apiRequest<{items: Notice[]}>('/messages')
      ])
      setConversations((conversationResult.items || []).filter(item => ["community_post","user_profile"].includes(item.resource_type)))
      setNotices((noticeResult.items || []).filter(item => item.type === "community_reply"))
    } catch {
      setLoadError("暂时没连上消息服务")
    } finally {
      setLoaded(true)
    }
  }

  useDidShow(() => {
    setCampusName(currentCampusName())
    void requirePhoneLogin("登录后才能查看你的消息和聊天记录。").then(allowed => {
      if (allowed) void load()
      else setLoaded(true)
    })
  })
  usePullDownRefresh(() => { void load().finally(() => Taro.stopPullDownRefresh()) })

  const openChat = (id: string) => Taro.navigateTo({url: `/pages/chat/index?id=${encodeURIComponent(id)}`})
  const manageConversation = async (item: Conversation) => {
    if (item.status === "closed") return openChat(item.id)
    try {
      const selected = await Taro.showActionSheet({itemList: ["结束会话"]})
      if (selected.tapIndex !== 0) return
      const confirmed = await Taro.showModal({title: "结束这次沟通？", content: "聊天记录会保留，但不能再发送新消息。", confirmText: "结束会话"})
      if (!confirmed.confirm) return
      await apiRequest(`/conversations/${item.id}/close`, {method: "POST"})
      setConversations(current => current.map(row => row.id === item.id ? {...row, status: "closed"} : row))
    } catch (error) {
      if (!String(error).includes("cancel")) showApiError(error)
    }
  }
  const openNotice = (notice: Notice) => {
    if (notice.type === "community_reply" && notice.resource_id) {
      Taro.navigateTo({url: `/pages/post-detail/index?id=${encodeURIComponent(notice.resource_id)}`})
      return
    }
    Taro.switchTab({url: "/pages/home/index"})
  }
  const markAllRead = async () => {
    if (!unreadCount || marking) return
    setMarking(true)
    try {
      await apiRequest("/conversations/read-all", {method: "POST"})
      setConversations(current => current.map(item => ({...item, unread_count: 0})))
      Taro.showToast({title: "已全部读完", icon: "success"})
    } catch (error) {
      showApiError(error)
    } finally {
      setMarking(false)
    }
  }

  return <View className="page messages-page">
    <View className="messages-topbar">
      <Text className="messages-title">消息</Text>
      <View onClick={() => Taro.navigateTo({url: "/pages/school-select/index"})}>
        <Text>{campusName}</Text><Text>切换</Text>
      </View>
    </View>

    <View className="messages-tabs">
      <View className={tab === "conversation" ? "is-active" : ""} onClick={() => setTab("conversation")}><Text>沟通</Text>{unreadCount > 0 && <Text>{unreadCount > 99 ? "99+" : unreadCount}</Text>}</View>
      <View className={tab === "notice" ? "is-active" : ""} onClick={() => setTab("notice")}><Text>通知</Text>{notices.length > 0 && <Text>{notices.length > 99 ? "99+" : notices.length}</Text>}</View>
    </View>

    {tab === "conversation" ? <>
      <View className="messages-summary">
        <View><Text className={unreadCount ? "summary-dot has-unread" : "summary-dot"}/><Text>{unreadCount ? `${unreadCount} 条未读消息` : "所有消息都已读"}</Text></View>
        {unreadCount > 0 && <Text onClick={markAllRead}>{marking ? "处理中" : "全部已读"}</Text>}
      </View>
      <View className="conversation-list">
        {filteredConversations.map((item, index) => {
          const meta = resourceMeta
          return <View className={`conversation-row ${item.status === "closed" ? "is-closed" : ""}`} key={item.id} onClick={() => openChat(item.id)} onLongPress={() => void manageConversation(item)}>
            <View className="conversation-avatar-wrap">
              <Image className="conversation-avatar" src={meta.avatar} mode="aspectFill"/>
              {index === 0 && <View className="conversation-pin"/>}
            </View>
            <View className="conversation-copy">
              <View><Text>{item.peer_name || "校园同学"}</Text><Text>{item.status === "closed" ? "已结束" : meta.label}</Text></View>
              <Text>{item.resource_title || "校内沟通"}</Text>
              <Text>{item.last_message || "会话已建立，可以开始沟通"}</Text>
            </View>
            <View className="conversation-meta"><Text>{formatTime(item.last_message_at)}</Text>{Number(item.unread_count) > 0 && <Text>{item.unread_count > 99 ? "99+" : item.unread_count}</Text>}</View>
          </View>
        })}
        {loaded && !loadError && filteredConversations.length === 0 && <View className="messages-empty">
          <Image src={messageIcon} mode="aspectFit"/>
          <Text>还没有校园圈私信</Text>
          <Text>可以在帖子详情页关注或私信同学</Text>
          <View className="empty-actions single"><View onClick={() => Taro.switchTab({url: "/pages/community/index"})}>去校园圈</View></View>
        </View>}
        {loaded && loadError && <View className="messages-empty error-state"><Image src={messageIcon} mode="aspectFit"/><Text>{loadError}</Text><Text>下拉刷新或稍后再试，已有消息不会丢失</Text><View className="empty-actions single"><View onClick={() => void load()}>重新加载</View></View></View>}
      </View>
    </> : <>
      <View className="notice-intro"><View><Text>校园圈通知</Text><Text>评论、回复和校园互动集中在这里</Text></View><Text>{notices.length} 条</Text></View>
      <View className="notice-list">
        {notices.map(item => {
          const meta = noticeMeta(item.type)
          return <View className="notice-row" key={item.id} onClick={() => openNotice(item)}>
            <View className="notice-icon"><Image src={meta.icon} mode="aspectFit"/></View>
            <View><View><Text>{item.title}</Text><Text>{meta.label}</Text></View><Text>{item.content}</Text></View>
            <View><Text>{formatTime(item.created_at)}</Text><Text>›</Text></View>
          </View>
        })}
        {loaded && !loadError && notices.length === 0 && <View className="messages-empty notice-empty"><Image src={messageIcon} mode="aspectFit"/><Text>暂无校园圈通知</Text><Text>帖子评论和回复会出现在这里</Text></View>}
        {loaded && loadError && <View className="messages-empty error-state"><Image src={messageIcon} mode="aspectFit"/><Text>{loadError}</Text><Text>下拉刷新或稍后再试</Text><View className="empty-actions single"><View onClick={() => void load()}>重新加载</View></View></View>}
      </View>
    </>}
  </View>
}
