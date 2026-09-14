import {useState} from "react"
import {Image, Text, View} from "@tarojs/components"
import Taro, {useDidShow, usePullDownRefresh} from "@tarojs/taro"
import TenantHeader from "../../components/TenantHeader"
import {type CommunityPost} from "../../data/community"
import {readCommunityPosts, syncCommunityPosts} from "../../store/community"
import {currentCampusName, currentTenant} from "../../store/tenant"
import {apiRequest, hasPhoneLogin} from "../../api/client"
import {buildStoredScheduleSummary, getStoredSchedule} from "../../data/demoSchedule"
import type {Tenant} from "../../types/tenant"
import cloudIcon from "../../assets/icons/svg/cloud.svg"
import packageIcon from "../../assets/icons/svg/package.svg"
import calendarSummaryIcon from "../../assets/icons/svg/calendar-event.svg"
import "./index.css"

type HomeSummary = {
  nextCourse: null | {id: number; name: string; timeText: string; room: string; teacher: string; startTime: string; minutesUntil: number | null}
  weather: null | {temperature: string; condition: string; note: string; updatedAt: string; city?: string; source?: string; automatic?: boolean}
  express: {pending: number}
  schedule: {today: number; total: number}
}

const LAUNCH_ANNOUNCEMENT = {
  title: "欢迎来到星尘校园圈",
  content: "当前已开放课表、实时天气、快递通知识别、校园榜单和校园圈。登录后可保存个人数据并参与校园互动。"
}

let launchAnnouncementShownThisSession = false

function todayLabel() {
  const now = new Date()
  return `${now.getMonth() + 1}月${now.getDate()}日 · ${["周日", "周一", "周二", "周三", "周四", "周五", "周六"][now.getDay()]}`
}

function courseNote(course: HomeSummary["nextCourse"]) {
  if (!course) return "导入课表后，首页会自动展示下一门课程"
  const location = [course.room, course.teacher].filter(Boolean).join(" · ") || "地点待补充"
  if (course.minutesUntil === null) return `${location} · ${course.timeText}`
  if (course.minutesUntil < 60) return `${location} · 距上课还有 ${course.minutesUntil} 分钟`
  if (course.minutesUntil < 24 * 60) return `${location} · 距上课还有 ${Math.ceil(course.minutesUntil / 60)} 小时`
  return `${location} · ${course.timeText}`
}

export default function HomePage() {
  const [tenant, setTenant] = useState<Tenant>(currentTenant())
  const [campusName, setCampusName] = useState(currentCampusName())
  const [posts, setPosts] = useState<CommunityPost[]>(readCommunityPosts())
  const localScheduleSummary = () => buildStoredScheduleSummary(getStoredSchedule())
  const localDashboard = (): HomeSummary => {
    const summary = localScheduleSummary()
    return {
      nextCourse: summary.nextCourse,
      weather: null,
      express: {pending: 0},
      schedule: {today: summary.today, total: summary.total}
    }
  }
  const [dashboard, setDashboard] = useState<HomeSummary>({
    nextCourse: null,
    weather: null,
    express: {pending: 0},
    schedule: {today: 0, total: 0}
  })

  const refreshContext = () => {
    setTenant(currentTenant())
    setCampusName(currentCampusName())
    setPosts(readCommunityPosts())
    syncCommunityPosts().then(setPosts).catch(()=>{})
    // 天气是公开信息，游客也可查看；课表和快递在游客状态始终保持为空。
    apiRequest<HomeSummary>("/home/summary").then(result => {
      if (hasPhoneLogin()) setDashboard(result)
      else setDashboard({...result, nextCourse: null, express: {pending: 0}, schedule: {today: 0, total: 0}})
    }).catch(() => setDashboard(hasPhoneLogin() ? localDashboard() : {nextCourse: null, weather: null, express: {pending: 0}, schedule: {today: 0, total: 0}}))
  }

  useDidShow(() => {
    refreshContext()
    if (launchAnnouncementShownThisSession) return
    launchAnnouncementShownThisSession = true
    void Taro.showModal({
      title: LAUNCH_ANNOUNCEMENT.title,
      content: LAUNCH_ANNOUNCEMENT.content,
      showCancel: false,
      confirmText: "我知道了"
    })
  })
  usePullDownRefresh(() => {
    refreshContext()
    Taro.stopPullDownRefresh()
  })

  const openPost = (post: CommunityPost) => {
    Taro.navigateTo({url: `/pages/post-detail/index?id=${encodeURIComponent(post.id)}`})
  }

  const nextCourse = dashboard?.nextCourse || null
  const featuredPost = posts.find(post => post.image) || posts[0]

  return (
    <View className="page home-page" style={{"--tenant-primary": tenant.theme.primary} as React.CSSProperties}>
      <TenantHeader tenant={tenant} campusName={campusName} variant="home"/>

      <View className="course-hero" onClick={() => Taro.navigateTo({url: "/pages/schedule/index"})}>
        <View className="course-hero-copy">
          <Text className="course-kicker">下一节课</Text>
          {nextCourse?.startTime && <Text className="course-time">{nextCourse.startTime}</Text>}
          <Text className="course-title">{nextCourse?.name || "暂无下一节课"}</Text>
          <Text className="course-note">{courseNote(nextCourse)}</Text>
          <Text className="course-action">{nextCourse ? "查看课程" : "导入课表"}</Text>
        </View>
        <Image className="course-hero-art" src={calendarSummaryIcon} mode="aspectFit"/>
      </View>

      <View className="daily-summary">
        <View className="summary-item weather-summary">
          <Image src={cloudIcon} mode="aspectFit"/>
          <View className="summary-copy">
            <Text className="summary-label">{dashboard?.weather?.city || tenant.city} · 天气</Text>
            <Text className="summary-value">{dashboard?.weather?.temperature || "—"} <Text className="summary-unit">{dashboard?.weather?.condition || "待更新"}</Text></Text>
            <Text className="summary-note">{dashboard?.weather?.note || "天气信息待同步"}</Text>
          </View>
        </View>
        <View className="summary-divider"/>
        <View className="summary-item" onClick={() => Taro.navigateTo({url:"/pages/express/index"})}>
          <Image src={packageIcon} mode="aspectFit"/>
          <View className="summary-copy">
            <Text className="summary-label">待取快递</Text>
            <Text className="summary-value">{dashboard ? dashboard.express.pending : "—"}</Text>
            <Text className="summary-note">{dashboard?.express.pending === 0 ? "暂无待取" : "点击查看"}</Text>
          </View>
        </View>
        <View className="summary-divider"/>
        <View className="summary-item" onClick={() => Taro.navigateTo({url: "/pages/schedule/index"})}>
          <Image src={calendarSummaryIcon} mode="aspectFit"/>
          <View className="summary-copy">
            <Text className="summary-label">今日课程</Text>
            <Text className="summary-value">{dashboard?.schedule.today ?? 0} <Text className="summary-unit">节</Text></Text>
            <Text className="summary-note">已同步 {dashboard?.schedule.total ?? 0} 门</Text>
          </View>
        </View>
      </View>

      <View className="campus-circle-block">
        <View className="forum-heading">
          <Text className="forum-title">校园圈</Text>
          <Text className="forum-enter" onClick={() => Taro.switchTab({url: "/pages/community/index"})}>去校园圈 ›</Text>
        </View>
        {featuredPost
          ? <View className="forum-preview" onClick={() => openPost(featuredPost)}>
            {featuredPost.image && <Image className="forum-preview-image" src={featuredPost.image} mode="aspectFill"/>}
            <View className="forum-preview-copy">
              <Text className="forum-preview-title">{featuredPost.content}</Text>
              <Text className="forum-preview-summary">{featuredPost.tag} · {featuredPost.location}</Text>
              <Text className="forum-preview-meta">{featuredPost.user} · {featuredPost.time}</Text>
            </View>
            <Text className="forum-preview-likes">赞 {featuredPost.likes}</Text>
          </View>
          : <View className="feed-empty" onClick={() => Taro.switchTab({url: "/pages/community/index"})}><Text>还没有校园动态</Text><Text>去发布第一条校园生活吧</Text></View>}
      </View>
    </View>
  )
}
