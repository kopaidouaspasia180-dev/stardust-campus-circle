import {useMemo, useState} from "react"
import {Image, Text, View} from "@tarojs/components"
import Taro, {useDidShow, usePullDownRefresh} from "@tarojs/taro"
import {apiRequest, hasPhoneLogin, logoutSession, readAccount, requirePhoneLogin} from "../../api/client"
import {buildStoredScheduleSummary, getStoredSchedule} from "../../data/demoSchedule"
import {currentCampusName, currentTenant} from "../../store/tenant"
import type {Tenant} from "../../types/tenant"
import editIcon from "../../assets/icons/community/edit.svg"
import messageIcon from "../../assets/icons/community/message-circle.svg"
import calendarIcon from "../../assets/icons/community/calendar-event.svg"
import packageIcon from "../../assets/icons/community/package.svg"
import userIcon from "../../assets/icons/svg/user.svg"
import trustedIcon from "../../assets/icons/community/rosette-discount-check.svg"
import CampusAvatar from "../../components/CampusAvatar"
import "./index.css"

type ProfileCounts = {posts: number; messages: number; schedule: number; market?: number}
type ProfileActivity = {kind: string; title: string; detail: string; state: string; createdAt: string; route: string}
type ProfileSummary = {
  user: {id: number; nickname: string; avatar: string; publicId?: string; phoneVerified?: boolean; phoneMasked?: string}
  counts: ProfileCounts
  activities: ProfileActivity[]
}
type HomeSummary = {
  nextCourse: null | {name: string; timeText: string; room: string; teacher: string; minutesUntil: number | null}
  express: {pending: number}
  schedule: {today: number; total: number}
}

const emptyCounts: ProfileCounts = {posts: 0, messages: 0, schedule: 0, market: 0}

export default function ProfilePage() {
  const [tenant, setTenant] = useState<Tenant>(currentTenant())
  const [campusName, setCampusName] = useState(currentCampusName())
  const [summary, setSummary] = useState<ProfileSummary | null>(null)
  const [dashboard, setDashboard] = useState<HomeSummary>({nextCourse: null, express: {pending: 0}, schedule: {today: 0, total: 0}})
  const [loaded, setLoaded] = useState(false)
  const [dashboardSynced, setDashboardSynced] = useState(false)

  const load = async () => {
    setLoaded(false)
    if (!hasPhoneLogin()) {
      setSummary(null)
      setDashboard({nextCourse: null, express: {pending: 0}, schedule: {today: 0, total: 0}})
      setDashboardSynced(false)
      setLoaded(true)
      return
    }
    const local = buildStoredScheduleSummary(getStoredSchedule())
    try {
      const [profileResult, homeResult] = await Promise.all([
        apiRequest<ProfileSummary>("/me/summary"),
        apiRequest<HomeSummary>("/home/summary")
      ])
      setSummary(profileResult)
      // 云端成功返回空课表时保持为空，避免旧缓存覆盖新账号的真实状态。
      setDashboard(homeResult)
      setDashboardSynced(true)
    } catch {
      setSummary(null)
      setDashboard({nextCourse: local.nextCourse, express: {pending: 0}, schedule: {today: local.today, total: local.total}})
      setDashboardSynced(false)
    } finally {
      setLoaded(true)
    }
  }

  useDidShow(() => {
    setTenant(currentTenant())
    setCampusName(currentCampusName())
    void load()
  })
  usePullDownRefresh(() => { void load().finally(() => Taro.stopPullDownRefresh()) })

  const counts = summary?.counts || emptyCounts
  const shortcuts = [
    {title: "帖子", note: `${counts.posts} 条`, icon: editIcon, action: "posts"},
    {title: "消息", note: `${counts.messages} 条`, icon: messageIcon, action: "messages"},
    {title: "课表", note: `${counts.schedule || dashboard.schedule.total} 门`, icon: calendarIcon, action: "schedule"},
    {title: "快递", note: `${dashboard.express.pending} 件待取`, icon: packageIcon, action: "express"}
  ]
  const dailyItems = useMemo(() => [
    {
      title: "下一节课",
      detail: dashboard.nextCourse ? `${dashboard.nextCourse.name} · ${dashboard.nextCourse.timeText}` : "暂未安排课程",
      actionText: dashboard.nextCourse ? "查看" : "去设置",
      icon: calendarIcon,
      action: "schedule"
    },
    {
      title: "待取快递",
      detail: !dashboardSynced ? "包裹信息暂未同步" : dashboard.express.pending > 0 ? `${dashboard.express.pending} 个包裹待取` : "暂无待取包裹",
      actionText: dashboard.express.pending > 0 ? "查看" : "去识别",
      icon: packageIcon,
      action: "express"
    },
    {
      title: "今日行程",
      detail: dashboard.schedule.today > 0 ? `${dashboard.schedule.today} 项课程与日程` : "暂无行程安排",
      actionText: dashboard.schedule.today > 0 ? "查看" : "去设置",
      icon: calendarIcon,
      action: "schedule"
    }
  ], [dashboard, dashboardSynced])
  const openItem = async (action: string, directRoute = "") => {
    if (!await requirePhoneLogin("登录后才能查看和管理你的个人数据。")) return
    if (directRoute) {
      if (directRoute === "/pages/community/index") Taro.switchTab({url: directRoute})
      else Taro.navigateTo({url: directRoute})
      return
    }
    if (action === "posts") {
      Taro.setStorageSync("stardust_community_scope", "mine")
      Taro.switchTab({url: "/pages/community/index"})
      return
    }
    const routes: Record<string, string> = {
      messages: "/pages/messages/index",
      schedule: "/pages/schedule/index",
      express: "/pages/express/index"
    }
    if (routes[action]) Taro.navigateTo({url: routes[action]})
  }
  const showIdentity = () => Taro.showModal({
    title: hasPhoneLogin() ? "账号与校区身份" : "游客模式",
    content: hasPhoneLogin()
      ? `当前账号：${summary?.user.phoneMasked || readAccount()?.phoneMasked || "手机号已验证"}\n小程序使用手机号识别同一个账号。课表和快递按账号私有保存；校园圈、关注和私信按学校隔离，同校院区互通。当前不采集证件照片。`
      : "当前未登录，可以浏览首页、天气和校园圈。发布、评论、导入课表、保存快递或聊天时会提示登录。",
    showCancel: false,
    confirmText: "知道了"
  })
  const logout = async () => {
    const modal = await Taro.showModal({title: "退出当前账号？", content: "退出不会删除云端帖子、课表、快递和消息，下次使用同一手机号登录可继续查看。", confirmText: "退出登录"})
    if (!modal.confirm) return
    await logoutSession().catch(() => undefined)
    Taro.showToast({title: "已退出，可继续浏览", icon: "none"})
    Taro.switchTab({url: "/pages/home/index"})
  }
  const openMyPublicProfile = async () => {
    if (!await requirePhoneLogin("登录后才能查看和设置你的校园主页。")) return
    const publicId = summary?.user.publicId || readAccount()?.publicId
    Taro.navigateTo({url:publicId
      ? `/pages/user-profile/index?id=${encodeURIComponent(publicId)}`
      : "/pages/user-profile/index?mine=1"})
  }
  const openLogin = () => Taro.navigateTo({url: "/pages/login/index"})
  const showPrivacy = () => Taro.navigateTo({url: "/pages/privacy-policy/index"})
  const showDataManagement = () => Taro.navigateTo({url: "/pages/legal/index"})

  return <View className="page profile-page">
    <View className="profile-topbar">
      <Text>我的</Text>
      <View onClick={() => Taro.navigateTo({url: "/pages/school-select/index"})}><Text>{campusName}</Text><Text>切换</Text></View>
    </View>

    <View className={`profile-identity ${hasPhoneLogin() ? "" : "is-guest"}`} onClick={() => hasPhoneLogin() ? void openMyPublicProfile() : openLogin()}>
      <View><CampusAvatar avatar={summary?.user?.avatar || readAccount()?.avatar} seed={summary?.user?.id || readAccount()?.id || "校园同学"} className="profile-avatar"/></View>
      <View className="profile-identity-copy">
        <Text className="profile-name">{summary?.user?.nickname || (hasPhoneLogin() ? "校园同学" : "游客同学")}</Text>
        <Text className="profile-campus">{tenant.name} · {campusName}</Text>
        <View className="profile-verified"><Image src={trustedIcon} mode="aspectFit"/><Text>{hasPhoneLogin() ? `手机号已登录 ${summary?.user.phoneMasked || readAccount()?.phoneMasked || ""}` : "未登录 · 可浏览公开内容"}</Text></View>
      </View>
      <Text className="identity-more">{hasPhoneLogin() ? "查看主页 ›" : "登录 ›"}</Text>
      <Text className="identity-caption">两个学校相互隔离，同一学校的院区共享校园圈和消息</Text>
    </View>

    <View className="profile-shortcuts">
      {shortcuts.map(item => <View className="profile-shortcut" key={item.action} onClick={() => openItem(item.action)}>
        <Image className="profile-shortcut-icon" src={item.icon} mode="aspectFit"/><Text className="profile-shortcut-title">{item.title}</Text><Text className="profile-shortcut-note">{!loaded ? "同步中" : hasPhoneLogin() && !summary ? "暂未同步" : item.note}</Text>
      </View>)}
    </View>

    <View className="profile-section-title"><Text>我的校园生活</Text><Text onClick={() => openItem("schedule")}>全部 ›</Text></View>
    <View className="profile-daily-list">
      {dailyItems.map(item => <View className="profile-daily-item" key={item.title} onClick={() => openItem(item.action)}>
        <View className="profile-daily-icon"><Image src={item.icon} mode="aspectFit"/></View>
        <View className="profile-daily-copy"><Text className="profile-daily-title">{item.title}</Text><Text className="profile-daily-detail">{item.detail}</Text></View>
        <View className="profile-daily-action"><Text>{item.actionText}</Text><Text>›</Text></View>
      </View>)}
    </View>

    <View className="profile-account-list">
      <View className="profile-account-item" onClick={showIdentity}><Image src={userIcon} mode="aspectFit"/><View className="profile-row-copy"><Text className="profile-row-title">身份与校区</Text><Text className="profile-row-note">查看当前账号的数据边界</Text></View><Text className="profile-row-arrow">›</Text></View>
      <View className="profile-account-item" onClick={showPrivacy}><Image src={trustedIcon} mode="aspectFit"/><View className="profile-row-copy"><Text className="profile-row-title">隐私与权限</Text><Text className="profile-row-note">了解信息使用与社区规则</Text></View><Text className="profile-row-arrow">›</Text></View>
      {hasPhoneLogin() && <View className="profile-account-item profile-account-danger" onClick={showDataManagement}><Image src={messageIcon} mode="aspectFit"/><View className="profile-row-copy"><Text className="profile-row-title">数据管理与注销</Text><Text className="profile-row-note">删除身份资料或申请注销</Text></View><Text className="profile-row-arrow">›</Text></View>}
      {hasPhoneLogin()
        ? <View className="profile-account-item profile-account-danger" onClick={() => void logout()}><Image src={userIcon} mode="aspectFit"/><View className="profile-row-copy"><Text className="profile-row-title">退出登录</Text><Text className="profile-row-note">退出后仍可继续浏览首页与校园圈</Text></View><Text className="profile-row-arrow">›</Text></View>
        : <View className="profile-account-item profile-account-login" onClick={openLogin}><Image src={userIcon} mode="aspectFit"/><View className="profile-row-copy"><Text className="profile-row-title">登录校园账号</Text><Text className="profile-row-note">发布、导入课表或保存快递时需要登录</Text></View><Text className="profile-row-arrow">›</Text></View>}
    </View>
  </View>
}
