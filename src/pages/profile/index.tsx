import {useState} from "react"
import {View, Text} from "@tarojs/components"
import Taro, {useDidShow} from "@tarojs/taro"
import {currentCampusName, currentTenant} from "../../store/tenant"
import type {Tenant} from "../../types/tenant"
import "./index.css"

const items = [
  {title: "我的帖子", action: "posts"},
  {title: "我的收藏", action: "favorites"},
  {title: "消息中心", action: "messages"},
  {title: "身份认证", action: "verify"},
  {title: "隐私与账号设置", action: "privacy"}
]

export default function ProfilePage() {
  const [tenant,setTenant] = useState<Tenant>(currentTenant())
  const [campusName,setCampusName] = useState(currentCampusName())
  useDidShow(() => { setTenant(currentTenant()); setCampusName(currentCampusName()) })

  const openItem = (action: string) => {
    if (action === "posts") {
      Taro.setStorageSync("stardust_community_pending_channel", "推荐")
      Taro.switchTab({url: "/pages/community/index"})
      return
    }
    if (action === "messages") {
      Taro.navigateTo({url: "/pages/messages/index"})
      return
    }
    const copy: Record<string, {title: string; content: string}> = {
      favorites: {
        title: "我的收藏",
        content: "收藏能力已预留。接入微信登录和云端数据后，收藏会在不同设备间同步。"
      },
      verify: {
        title: "校园身份认证",
        content: "为保护同学隐私，正式认证需由学校运营方配置学号或校园邮箱验证，当前版本不会收集证件照片。"
      },
      privacy: {
        title: "隐私与账号设置",
        content: "正式发布时将在小程序后台配置隐私保护指引、用户协议、账号注销和内容举报入口。"
      }
    }
    const item = copy[action]
    if (item) Taro.showModal({...item, showCancel: false, confirmText: "知道了"})
  }

  return <View className="page profile-page">
    <View className="profile-brand"><Text>Stardust</Text><Text>星尘校园圈</Text></View>
    <View className="profile-hero"><View className="profile-avatar">同</View><View><Text>校园同学</Text><Text>{tenant.name} · {campusName}</Text></View></View>
    <View className="profile-school card" onClick={() => Taro.navigateTo({url:"/pages/school-select/index"})}><View><Text>当前高校</Text><Text>{tenant.name}</Text></View><Text>切换 ›</Text></View>
    <View className="profile-menu card">{items.map(item => <View key={item.action} onClick={() => openItem(item.action)}><Text>{item.title}</Text><Text>›</Text></View>)}</View>
    <Text className="profile-version">STARDUST · 星尘校园圈 1.0.0</Text>
  </View>
}
