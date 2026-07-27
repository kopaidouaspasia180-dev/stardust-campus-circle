import {useMemo, useState} from "react"
import {Input, Text, View} from "@tarojs/components"
import Taro, {useDidShow} from "@tarojs/taro"
import TenantHeader from "../../components/TenantHeader"
import {currentCampusName, currentTenant} from "../../store/tenant"
import type {Tenant} from "../../types/tenant"
import "./index.css"

type ServiceItem = {
  id: string
  icon: string
  title: string
  subtitle: string
  group: string
  channel?: string
  ranking?: string
  route?: string
}

const COMMUNITY_CHANNEL_KEY = "stardust_community_pending_channel"
const SERVICE_QUERY_KEY = "stardust_services_pending_query"
const RANKING_GROUP_KEY = "stardust_ranking_pending_group"

const services: ServiceItem[] = [
  {id: "takeout", icon: "餐", title: "校园外卖", subtitle: "菜单、购物车和订单进度", group: "吃喝", route: "/pages/takeout/index"},
  {id: "secondhand", icon: "闲", title: "二手闲置", subtitle: "发布、图片、收藏与校内交易", group: "互助", route: "/pages/market/index"},
  {id: "errand", icon: "跑", title: "跑腿代取", subtitle: "发布需求、接单和确认完成", group: "互助", route: "/pages/errand/index"},
  {id: "express", icon: "递", title: "快递动态", subtitle: "记录运单、取件码和取件状态", group: "互助", route: "/pages/express/index"},
  {id: "jobs", icon: "职", title: "兼职信息", subtitle: "核验岗位与在线提交意向", group: "信息", route: "/pages/jobs/index"},
  {id: "events", icon: "旗", title: "校园活动", subtitle: "查看详情与在线报名", group: "信息", route: "/pages/events/index"},
  {id: "match", icon: "友", title: "匿名匹配", subtitle: "兴趣资料、候选同学与匿名招呼", group: "社交", route: "/pages/match/index"},
  {id: "lost", icon: "寻", title: "失物招领", subtitle: "发布、认领和寻物信息", group: "互助", channel: "失物"},
  {id: "flowers", icon: "花", title: "校园花店", subtitle: "鲜花、毕业花束与配送需求", group: "吃喝", route: "/pages/campus-store/index?type=flowers"},
  {id: "fruit", icon: "果", title: "校园水果店", subtitle: "水果拼盘与宿舍配送需求", group: "吃喝", route: "/pages/campus-store/index?type=fruit"},
  {id: "snacks", icon: "食", title: "校园零食店", subtitle: "零食、饮料和宿舍日用", group: "吃喝", route: "/pages/campus-store/index?type=snacks"},
  {id: "ebike", icon: "车", title: "二手电动车", subtitle: "校内车源与验车提醒", group: "互助", route: "/pages/market/index?category=电动车"},
  {id: "life", icon: "生", title: "生活服务", subtitle: "理发、医药与维修需求", group: "生活", route: "/pages/campus-store/index?type=life"}
]

export default function ServicesPage() {
  const [tenant, setTenant] = useState<Tenant>(currentTenant())
  const [campusName, setCampusName] = useState(currentCampusName())
  const [query, setQuery] = useState("")
  const [group, setGroup] = useState("全部")

  useDidShow(() => {
    setTenant(currentTenant())
    setCampusName(currentCampusName())
    const pendingQuery = Taro.getStorageSync<string>(SERVICE_QUERY_KEY)
    if (pendingQuery) {
      setQuery(pendingQuery)
      Taro.removeStorageSync(SERVICE_QUERY_KEY)
    }
  })

  const list = useMemo(
    () => services.filter(item =>
      (group === "全部" || item.group === group) &&
      `${item.title}${item.subtitle}`.includes(query.trim())
    ),
    [query, group]
  )

  const openService = (item: ServiceItem) => {
    if (item.route) {
      Taro.navigateTo({url: item.route})
      return
    }
    if (item.channel) {
      Taro.setStorageSync(COMMUNITY_CHANNEL_KEY, item.channel)
      Taro.switchTab({url: "/pages/community/index"})
      return
    }
    if (item.ranking) {
      Taro.setStorageSync(RANKING_GROUP_KEY, item.ranking)
      Taro.switchTab({url: "/pages/rankings/index"})
      return
    }
    Taro.navigateTo({url: "/pages/publish/index"})
  }

  return (
    <View className="page services-page">
      <TenantHeader tenant={tenant} campusName={campusName}/>
      <View className="services-heading"><Text>校园服务</Text><Text>完整服务都在这里</Text></View>
      <View className="service-search card">
        <Text>⌕</Text>
        <Input value={query} onInput={event => setQuery(event.detail.value)} placeholder="搜索外卖、跑腿、花店……"/>
      </View>
      <View className="service-tabs">
        {["全部", "吃喝", "互助", "信息", "社交", "生活"].map(item => (
          <Text key={item} className={group === item ? "active" : ""} onClick={() => setGroup(item)}>{item}</Text>
        ))}
      </View>
      <View className="service-grid">
        {list.map(item => (
          <View className="service-card card" key={item.id} onClick={() => openService(item)}>
            <Text className="service-icon">{item.icon}</Text>
            <Text className="service-name">{item.title}</Text>
            <Text className="service-sub">{item.subtitle}</Text>
            <Text className="service-status">进入服务 →</Text>
          </View>
        ))}
      </View>
      {list.length === 0 && <View className="empty">没有找到相关服务</View>}
    </View>
  )
}
