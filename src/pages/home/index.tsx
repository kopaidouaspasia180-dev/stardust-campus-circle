import {useMemo, useState} from "react"
import {Image, Text, View} from "@tarojs/components"
import Taro, {useDidShow, usePullDownRefresh} from "@tarojs/taro"
import TenantHeader from "../../components/TenantHeader"
import CommunityPostCard from "../../components/CommunityPostCard"
import {type CommunityPost} from "../../data/community"
import {readCommunityPosts, syncCommunityPosts, toggleCommunityPostLikeRemote} from "../../store/community"
import {currentCampusName, currentTenant} from "../../store/tenant"
import type {Tenant} from "../../types/tenant"
import calendarWeekIcon from "../../assets/icons/png/calendar-week.png"
import bowlSpoonIcon from "../../assets/icons/png/bowl-spoon.png"
import tagIcon from "../../assets/icons/png/tag.png"
import scooterIcon from "../../assets/icons/png/scooter.png"
import briefcaseIcon from "../../assets/icons/png/briefcase-2.png"
import eventIcon from "../../assets/icons/png/flag-3.png"
import heartsIcon from "../../assets/icons/png/hearts.png"
import lostIcon from "../../assets/icons/png/zoom-scan.png"
import appleIcon from "../../assets/icons/png/apple.png"
import cookieIcon from "../../assets/icons/png/cookie.png"
import flowerIcon from "../../assets/icons/png/flower.png"
import bikeIcon from "../../assets/icons/png/bike.png"
import cloudIcon from "../../assets/icons/png/cloud.png"
import packageIcon from "../../assets/icons/png/package.png"
import sparklesIcon from "../../assets/icons/png/sparkles.png"
import "./index.css"

type Tool = {id: string; icon: string; title: string; tone: string}

const DEFAULT_TOOL_IDS = ["schedule", "takeout", "secondhand", "errand", "jobs", "events", "match", "lost"]
const TOOL_KEY = "stardust_common_tools_v1"
const COMMUNITY_CHANNEL_KEY = "stardust_community_pending_channel"
const SERVICE_QUERY_KEY = "stardust_services_pending_query"

const tools: Tool[] = [
  {id: "schedule", icon: calendarWeekIcon, title: "课表", tone: "mint"},
  {id: "takeout", icon: bowlSpoonIcon, title: "校园外卖", tone: "orange"},
  {id: "secondhand", icon: tagIcon, title: "二手闲置", tone: "blue"},
  {id: "errand", icon: scooterIcon, title: "跑腿代取", tone: "lime"},
  {id: "jobs", icon: briefcaseIcon, title: "兼职信息", tone: "violet"},
  {id: "events", icon: eventIcon, title: "校园活动", tone: "yellow"},
  {id: "match", icon: heartsIcon, title: "匿名匹配", tone: "pink"},
  {id: "lost", icon: lostIcon, title: "失物招领", tone: "cyan"},
  {id: "fruit", icon: appleIcon, title: "校园水果", tone: "lime"},
  {id: "snacks", icon: cookieIcon, title: "校园零食", tone: "orange"},
  {id: "flowers", icon: flowerIcon, title: "校园花店", tone: "pink"},
  {id: "ebike", icon: bikeIcon, title: "二手电动车", tone: "blue"}
]

const serviceRoutes: Record<string, string> = {
  schedule: "/pages/schedule/index",
  takeout: "/pages/takeout/index",
  secondhand: "/pages/market/index",
  errand: "/pages/errand/index",
  jobs: "/pages/jobs/index",
  events: "/pages/events/index",
  fruit: "/pages/campus-store/index?type=fruit",
  snacks: "/pages/campus-store/index?type=snacks",
  flowers: "/pages/campus-store/index?type=flowers",
  ebike: "/pages/market/index?category=电动车",
  match: "/pages/match/index"
}

export default function HomePage() {
  const [tenant, setTenant] = useState<Tenant>(currentTenant())
  const [campusName, setCampusName] = useState(currentCampusName())
  const [posts, setPosts] = useState<CommunityPost[]>(readCommunityPosts())
  const [toolIds, setToolIds] = useState<string[]>(() => Taro.getStorageSync<string[]>(TOOL_KEY) || DEFAULT_TOOL_IDS)
  const [editing, setEditing] = useState(false)
  const commonTools = useMemo(
    () => toolIds.map(id => tools.find(item => item.id === id)).filter(Boolean) as Tool[],
    [toolIds]
  )

  const refreshContext = () => {
    setTenant(currentTenant())
    setCampusName(currentCampusName())
    setPosts(readCommunityPosts())
    syncCommunityPosts().then(setPosts).catch(()=>{})
  }

  useDidShow(refreshContext)
  usePullDownRefresh(() => {
    refreshContext()
    Taro.stopPullDownRefresh()
  })

  const toggleTool = (id: string) => {
    let next = [...toolIds]
    if (next.includes(id)) next = next.filter(item => item !== id)
    else if (next.length < 8) next.push(id)
    else {
      Taro.showToast({title: "最多选择 8 个", icon: "none"})
      return
    }
    setToolIds(next)
    Taro.setStorageSync(TOOL_KEY, next)
  }

  const openCommunityChannel = (channel = "推荐") => {
    Taro.setStorageSync(COMMUNITY_CHANNEL_KEY, channel)
    Taro.switchTab({url: "/pages/community/index"})
  }

  const openService = (query = "") => {
    Taro.setStorageSync(SERVICE_QUERY_KEY, query)
    Taro.switchTab({url: "/pages/services/index"})
  }

  const openTool = (tool: Tool) => {
    if (serviceRoutes[tool.id]) {
      Taro.navigateTo({url: serviceRoutes[tool.id]})
      return
    }
    openService(tool.title)
  }

  const openPost = (post: CommunityPost) => {
    Taro.navigateTo({url: `/pages/post-detail/index?id=${encodeURIComponent(post.id)}`})
  }

  const likePost = async (post: CommunityPost) => {
    setPosts(await toggleCommunityPostLikeRemote(post.id))
  }

  return (
    <View className="page home-page" style={{"--tenant-primary": tenant.theme.primary} as React.CSSProperties}>
      <TenantHeader tenant={tenant} campusName={campusName}/>

      <View className="today-panel">
        <View className="today-heading">
          <View><Text className="live-dot"/><Text className="today-title">今日校园</Text></View>
          <Text className="today-date">7月27日 · 周一</Text>
        </View>
        <View className="today-grid">
          <View className="today-item" onClick={() => openTool(tools[0])}>
            <View className="today-symbol symbol-green"><Image src={calendarWeekIcon}/></View>
            <View><Text className="today-label">课表</Text><Text className="today-value">待绑定</Text></View>
          </View>
          <View className="today-item">
            <View className="today-symbol symbol-blue"><Image src={cloudIcon}/></View>
            <View><Text className="today-label">唐山天气</Text><Text className="today-value">23° 多云</Text></View>
          </View>
          <View className="today-item" onClick={() => Taro.navigateTo({url:"/pages/events/index"})}>
            <View className="today-symbol symbol-orange"><Image src={eventIcon}/></View>
            <View><Text className="today-label">校园活动</Text><Text className="today-value">近期 1 场</Text></View>
          </View>
          <View className="today-item" onClick={() => Taro.navigateTo({url:"/pages/express/index"})}>
            <View className="today-symbol symbol-violet"><Image src={packageIcon}/></View>
            <View><Text className="today-label">快递动态</Text><Text className="today-value">待绑定</Text></View>
          </View>
        </View>
      </View>

      <View className="section-block common-block">
        <View className="section-head">
          <View><Text className="block-title">常用功能</Text><Text className="block-subtitle">定制你的校园首页</Text></View>
          <Text className="head-action" onClick={() => setEditing(true)}>自定义</Text>
        </View>
        <View className="common-grid">
          {commonTools.map(tool => (
            <View className="common-item" key={tool.id} onClick={() => openTool(tool)}>
              <View className={`common-icon tone-${tool.tone}`}><Image className="tool-icon-image" src={tool.icon}/></View>
              <Text className="common-name">{tool.title}</Text>
            </View>
          ))}
        </View>
      </View>

      <View className="forum-heading">
        <View>
          <Text className="forum-title">校园论坛</Text>
          <Text className="forum-subtitle">继续下滑，看看同学们正在聊什么</Text>
        </View>
        <Text className="forum-enter" onClick={() => openCommunityChannel("推荐")}>全部频道 →</Text>
      </View>

      <View className="home-forum-feed">
        {posts.map(post => (
          <CommunityPostCard key={post.id} post={post} compact onOpen={openPost} onLike={likePost}/>
        ))}
      </View>

      <View className="feed-end">
        <Text>✦</Text>
        <Text>已经看到今天的校园动态了</Text>
      </View>

      <View className="ai-float" onClick={() => Taro.navigateTo({url: "/pages/ai/index"})}>
        <View className="ai-orbit"><Image src={sparklesIcon}/></View>
        <View><Text>问校园 AI</Text><Text>随时提问</Text></View>
      </View>

      {editing && (
        <View className="modal-mask" onClick={() => setEditing(false)}>
          <View className="sheet" onClick={event => event.stopPropagation()}>
            <View className="sheet-head">
              <View><Text>编辑常用功能</Text><Text>已选择 {toolIds.length}/8</Text></View>
              <Text onClick={() => setEditing(false)}>完成</Text>
            </View>
            <View className="tool-picker">
              {tools.map(tool => (
                <View className={`picker-item ${toolIds.includes(tool.id) ? "selected" : ""}`} key={tool.id} onClick={() => toggleTool(tool.id)}>
                  <View className={`picker-icon tone-${tool.tone}`}><Image className="tool-icon-image" src={tool.icon}/></View>
                  <Text>{tool.title}</Text>
                  <Text className="picker-state">{toolIds.includes(tool.id) ? "✓" : "+"}</Text>
                </View>
              ))}
            </View>
          </View>
        </View>
      )}
    </View>
  )
}
