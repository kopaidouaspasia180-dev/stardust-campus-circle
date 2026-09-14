import {useEffect, useMemo, useState} from "react"
import {Button, Input, ScrollView, Text, View} from "@tarojs/components"
import Taro, {useRouter} from "@tarojs/taro"
import {apiRequest, hasPhoneLogin, requirePhoneLogin, showApiError} from "../../api/client"
import "./index.css"
import "./social.css"

type Message = {
  id: string
  content: string
  created_at: string
  mine: boolean
  sender_name: string
}

type ConversationResponse = {
  conversation: {id: string; resource_type: string; resource_id: string; status: string; peer_name?: string; peer_public_id?:string; resource_title?: string; resource_summary?: string; mutual_following?:boolean; can_send?:boolean; message_limit_reason?:string}
  items: Message[]
}

export default function ChatPage() {
  const conversationId = String(useRouter().params.id || "")
  const [messages, setMessages] = useState<Message[]>([])
  const [resourceType, setResourceType] = useState("")
  const [conversation, setConversation] = useState<ConversationResponse["conversation"] | null>(null)
  const [content, setContent] = useState("")
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const resourceLabel = useMemo(() => ["community_post","user_profile"].includes(resourceType) ? "校园圈私信" : "校园圈沟通", [resourceType])

  const load = async () => {
    if (!hasPhoneLogin()) {
      setLoading(false)
      return
    }
    if (!conversationId) {
      setLoading(false)
      return
    }
    try {
      const result = await apiRequest<ConversationResponse>(`/conversations/${conversationId}/messages`)
      setMessages(result.items)
      setResourceType(result.conversation.resource_type)
      setConversation(result.conversation)
    } catch (error) {
      showApiError(error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void requirePhoneLogin("登录后才能查看和发送校内消息。").then(allowed => {
      if (allowed) void load()
      else setLoading(false)
    })
  }, [conversationId])

  const send = async () => {
    if (!await requirePhoneLogin("登录后才能发送校内消息。")) return
    const value = content.trim()
    if (!value || sending) return
    if (conversation?.can_send === false) return Taro.showToast({title:conversation.message_limit_reason || "互关后可继续聊天",icon:"none"})
    setSending(true)
    try {
      await apiRequest(`/conversations/${conversationId}/messages`, {method: "POST", data: {content: value}})
      setContent("")
      await load()
    } catch (error) {
      showApiError(error)
    } finally {
      setSending(false)
    }
  }

  const report = async () => {
    if (!await requirePhoneLogin("登录后才能举报会话。")) return
    const reasons = ["疑似诈骗或收款风险", "骚扰或辱骂", "发布违规内容"]
    try {
      const selected = await Taro.showActionSheet({itemList: reasons})
      const reason = reasons[selected.tapIndex]
      if (!reason) return
      await apiRequest(`/conversations/${conversationId}/reports`, {method: "POST", data: {reason}})
      Taro.showToast({title: "已提交处理", icon: "success"})
    } catch (error) {
      if (!String(error).includes("cancel")) showApiError(error)
    }
  }

  const manage = async () => {
    if (!await requirePhoneLogin("登录后才能管理会话。")) return
    const options = conversation?.status === "closed" ? ["举报会话"] : ["结束会话", "举报会话"]
    try {
      const selected = await Taro.showActionSheet({itemList: options})
      if (options[selected.tapIndex] === "举报会话") return void report()
      const confirmed = await Taro.showModal({title: "结束这次沟通？", content: "结束后将不能继续发送消息，需要时可从相关服务重新发起。", confirmText: "结束会话"})
      if (!confirmed.confirm) return
      await apiRequest(`/conversations/${conversationId}/close`, {method: "POST"})
      setConversation(current => current ? {...current, status: "closed"} : current)
      Taro.showToast({title: "会话已结束", icon: "success"})
    } catch (error) {
      if (!String(error).includes("cancel")) showApiError(error)
    }
  }

  const openResource = () => {
    if (resourceType === "user_profile" && conversation?.peer_public_id) {
      Taro.navigateTo({url:`/pages/user-profile/index?id=${encodeURIComponent(conversation.peer_public_id)}`})
      return
    }
    if (resourceType === "community_post" && conversation?.resource_id) {
      Taro.navigateTo({url: `/pages/post-detail/index?id=${encodeURIComponent(conversation.resource_id)}`})
      return
    }
    Taro.switchTab({url: "/pages/community/index"})
  }

  return <View className="chat-page">
    <View className="chat-topbar">
      <View onClick={() => Taro.navigateBack()}><Text>‹</Text><Text>消息</Text></View>
      <View><Text>{conversation?.peer_name || resourceLabel}</Text><Text>{resourceLabel} · 本校私信</Text></View>
      <Text onClick={manage}>更多</Text>
    </View>
    <View className="chat-trust">
      <View><Text>安全沟通</Text><Text>先核验身份与服务内容，不提前转账、不缴押金</Text></View>
      <Text>仅本校区</Text>
    </View>
    {conversation?.resource_title && <View className="chat-resource" onClick={openResource}><View><Text>{conversation.resource_title}</Text><Text>{conversation.resource_summary || resourceLabel}</Text></View><Text>查看 ›</Text></View>}
    <ScrollView className="chat-scroll" scrollY scrollIntoView={messages.length ? `message-${messages[messages.length - 1].id}` : undefined}>
      {loading && <View className="chat-empty">正在加载会话…</View>}
      {!loading && messages.length === 0 && <View className="chat-empty"><Text>从一句礼貌的问候开始</Text><Text>只讨论当前服务，不发送微信、手机号、取件码或宿舍房间号</Text></View>}
      {messages.map(item => <View id={`message-${item.id}`} className={`chat-message ${item.mine ? "mine" : "peer"}`} key={item.id}>
        {!item.mine && <Text className="chat-sender">{item.sender_name}</Text>}
        <Text className="chat-bubble">{item.content}</Text>
        <Text className="chat-time">{new Date(item.created_at).toLocaleString("zh-CN", {month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit"})}</Text>
      </View>)}
    </ScrollView>
    {conversation?.status !== "closed" && conversation?.can_send === false && <View className="chat-limit-note"><Text>一条问候已送达</Text><Text>{conversation.message_limit_reason || "双方互关后可继续聊天"}</Text></View>}
    <View className={`chat-composer ${conversation?.status === "closed" || conversation?.can_send === false ? "is-closed" : ""}`}>
      <Input disabled={conversation?.status === "closed" || conversation?.can_send === false} value={content} maxlength={600} confirmType="send" placeholder={conversation?.status === "closed" ? "会话已结束" : conversation?.can_send === false ? "等待对方互关" : "输入消息…"} onInput={event => setContent(event.detail.value)} onConfirm={send}/>
      <Button disabled={conversation?.status === "closed" || conversation?.can_send === false || !content.trim() || sending} onClick={send}>{conversation?.status === "closed" ? "已结束" : conversation?.can_send === false ? "待互关" : sending ? "发送中" : "发送"}</Button>
    </View>
  </View>
}
