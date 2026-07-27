import {useState} from "react"
import {Image, Text, View} from "@tarojs/components"
import Taro, {useDidShow} from "@tarojs/taro"
import TenantHeader from "../../components/TenantHeader"
import {currentCampusName, currentTenant} from "../../store/tenant"
import type {Tenant} from "../../types/tenant"
import foodGuide from "../../assets/campus/tangshan-food-guide.webp"
import tangshanNanhu from "../../assets/campus/tangshan-nanhu.webp"
import tangshanMuseum from "../../assets/campus/tangshan-museum.webp"
import tangshanPhoenix from "../../assets/campus/tangshan-phoenix.webp"
import campusLocomotive from "../../assets/campus/campus-locomotive.webp"
import "./index.css"

const groups = [
  {
    id: "food",
    label: "校园美食榜",
    caption: "同学聚餐与校园周边餐饮",
    cover: foodGuide,
    rows: [
      {name: "唐山宴饮食文化博物馆", note: "唐山特色 · 城市餐饮体验"},
      {name: "远洋城餐饮区", note: "选择丰富 · 交通便利"},
      {name: "大学城周边餐饮", note: "距离校园较近"}
    ]
  },
  {
    id: "fun",
    label: "校园玩乐榜",
    caption: "周末散步、看展与城市游玩",
    cover: tangshanNanhu,
    rows: [
      {name: "唐山南湖景区", note: "城市地标 · 适合散步"},
      {name: "唐山博物馆", note: "城市文化 · 免费展览为主"},
      {name: "凤凰山公园", note: "休闲公园 · 校园周边"}
    ]
  },
  {
    id: "life",
    label: "校园生活服务榜",
    caption: "日常办事与生活便利地点",
    cover: campusLocomotive,
    rows: [
      {name: "大学城城市书房", note: "自习阅读 · 公共文化空间"},
      {name: "龙华西道公园", note: "运动休闲 · 就近散步"},
      {name: "远洋城综合服务", note: "购物、餐饮与生活服务"}
    ]
  }
]

export default function RankingsPage() {
  const [tenant, setTenant] = useState<Tenant>(currentTenant())
  const [campusName, setCampusName] = useState(currentCampusName())

  useDidShow(() => {
    setTenant(currentTenant())
    setCampusName(currentCampusName())
    const pendingGroup = Taro.getStorageSync<string>("stardust_ranking_pending_group")
    if (pendingGroup) {
      Taro.removeStorageSync("stardust_ranking_pending_group")
      setTimeout(() => {
        Taro.pageScrollTo({selector: `#ranking-${pendingGroup}`, duration: 300})
      }, 120)
    }
  })

  return (
    <View className="page rankings-page">
      <TenantHeader tenant={tenant} campusName={campusName}/>
      <View className="rankings-hero">
        <Text className="rankings-kicker">STARDUST CAMPUS PICKS</Text>
        <Text className="rankings-title">校园榜单</Text>
        <Text className="rankings-intro">把同学们常去的吃喝、玩乐和生活服务整理成一页，后续将开放真实评价与校区筛选。</Text>
        <View className="hero-badges"><Text>3 类榜单</Text><Text>9 个地点</Text><Text>持续更新</Text></View>
      </View>

      {groups.map((group, groupIndex) => (
        <View className="ranking-section" id={`ranking-${group.id}`} key={group.id}>
          <View className="ranking-heading">
            <View><Text>{group.label}</Text><Text>{group.caption}</Text></View>
            <Text>0{groupIndex + 1}</Text>
          </View>
          <View className="ranking-winner">
            <Image src={group.cover} mode="aspectFill"/>
            <View className="winner-shade"/>
            <Text className="winner-badge">TOP 1</Text>
            <View className="winner-copy"><Text>{group.rows[0].name}</Text><Text>{group.rows[0].note}</Text></View>
          </View>
          <View className="ranking-list">
            {group.rows.slice(1).map((row, index) => (
              <View className="ranking-row" key={row.name}>
                <Text className={`ranking-number number-${index + 2}`}>{index + 2}</Text>
                <View><Text>{row.name}</Text><Text>{row.note}</Text></View>
                <Text>查看 →</Text>
              </View>
            ))}
          </View>
        </View>
      ))}

      <View className="ranking-gallery">
        <Image src={tangshanMuseum} mode="aspectFill"/>
        <Image src={tangshanPhoenix} mode="aspectFill"/>
      </View>
      <Text className="rankings-note">首版榜单依据学校官网、政府公开信息及高校周边公开攻略整理，仅作生活参考，不代表学校官方排名或商业背书。</Text>
    </View>
  )
}
