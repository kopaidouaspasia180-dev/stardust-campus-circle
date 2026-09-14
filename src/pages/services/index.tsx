import {Image, Text, View} from "@tarojs/components"
import Taro, {useDidShow} from "@tarojs/taro"
import {useState} from "react"
import {currentCampusName} from "../../store/tenant"
import takeoutCover from "../../assets/images/takeout-real/lunch-selection.jpg"
import snackCover from "../../assets/services-real/snacks-pexels.mini.webp"
import fruitCover from "../../assets/services-ref/fruit-hero-bowl.mini.webp"
import booksCover from "../../assets/services-real/market-books.mini.webp"
import marketCover from "../../assets/services-real/market-earbuds.mini.webp"
import errandCover from "../../assets/services-real/errand-rider.mini.webp"
import "./index.css"

type ServiceCard = {
  key: string
  title: string
  note: string
  image: string
  url: string
  badge?: string
}

const STORE_CARDS: ServiceCard[] = [
  {key: "snacks", title: "零食小卖部", note: "宿舍补给站，零食饮料泡面", image: snackCover, url: "/pages/campus-store/index?type=snacks", badge: "热卖"},
  {key: "fruit", title: "校园水果店", note: "当日新鲜到校，切盘/整箱", image: fruitCover, url: "/pages/campus-store/index?type=fruit"}
]

const MARKET_CARDS: ServiceCard[] = [
  {key: "books", title: "二手书市", note: "教材真题全套，学长学姐直出", image: booksCover, url: "/pages/market/index?category=%E6%95%99%E6%9D%90", badge: "保真"},
  {key: "market", title: "二手市集", note: "数码/生活/电动车都能淘", image: marketCover, url: "/pages/market/index"}
]

const HELP_CARDS: ServiceCard[] = [
  {key: "errand", title: "跑腿代取", note: "带饭取件取外卖，校内互助", image: errandCover, url: "/pages/errand/index"},
  {key: "express", title: "快递代取", note: "驿站运单与取件码一站管理", image: marketCover, url: "/pages/express/index", badge: "高频"}
]

const MORE_LINKS = [
  {title: "校园花店", url: "/pages/campus-store/index?type=flowers"},
  {title: "校园兼职", url: "/pages/jobs/index"},
  {title: "校园活动", url: "/pages/events/index"},
  {title: "失物招领", url: "/pages/lost/index"}
]

function ServiceTile({card}: {card: ServiceCard}) {
  return (
    <View className="service-tile" onClick={() => Taro.navigateTo({url: card.url})}>
      <View className="service-tile-media">
        <Image className="service-tile-image" src={card.image} mode="aspectFill"/>
        {card.badge ? <Text className="service-tile-badge">{card.badge}</Text> : null}
      </View>
      <View className="service-tile-body">
        <Text className="service-tile-title">{card.title}</Text>
        <Text className="service-tile-note">{card.note}</Text>
      </View>
    </View>
  )
}

function ServiceSection({title, sub, cards}: {title: string; sub: string; cards: ServiceCard[]}) {
  return (
    <View className="service-section">
      <View className="service-section-head">
        <Text className="service-section-title">{title}</Text>
        <Text className="service-section-sub">{sub}</Text>
      </View>
      <View className="service-grid">
        {cards.map(card => <ServiceTile key={card.key} card={card}/>)}
      </View>
    </View>
  )
}

export default function ServicesPage() {
  const [campusName, setCampusName] = useState(currentCampusName())

  useDidShow(() => {
    setCampusName(currentCampusName())
  })

  return (
    <View className="page services-page">
      <View className="services-header">
        <View className="services-header-copy">
          <Text className="services-title">校园服务</Text>
          <Text className="services-subtitle">一个入口，承包你的校园日常</Text>
        </View>
        <Text className="services-campus">{campusName}</Text>
      </View>

      <View className="takeout-service" onClick={() => Taro.navigateTo({url: "/pages/takeout/index"})}>
        <Image className="takeout-service-image" src={takeoutCover} mode="aspectFill"/>
        <View className="takeout-service-body">
          <View className="takeout-service-heading">
            <View className="takeout-service-name">
              <Text className="takeout-service-title">校园外卖</Text>
              <Text className="takeout-service-note">校内好味道，送到宿舍楼下</Text>
            </View>
            <Text className="takeout-service-status">当前开放</Text>
          </View>
          <View className="takeout-service-tags">
            <Text>每日菜单</Text>
            <Text>校内配送</Text>
            <Text>订单可查</Text>
          </View>
          <View className="takeout-service-action">进入校园外卖 <Text>›</Text></View>
        </View>
      </View>

      <ServiceSection title="生活补给" sub="宿舍楼下的便利店" cards={STORE_CARDS}/>
      <ServiceSection title="循环利用" sub="让闲置在校园里流动" cards={MARKET_CARDS}/>
      <ServiceSection title="代取跑腿" sub="没空去？同学帮你拿" cards={HELP_CARDS}/>

      <View className="service-more">
        <View className="service-more-head">
          <Text className="service-section-title">更多服务</Text>
        </View>
        <View className="service-more-list">
          {MORE_LINKS.map(link => (
            <View key={link.url} className="service-more-item" onClick={() => Taro.navigateTo({url: link.url})}>
              <Text>{link.title}</Text>
              <Text className="service-more-arrow">›</Text>
            </View>
          ))}
        </View>
      </View>

      <View className="service-tip">
        <Text className="service-tip-title">使用说明</Text>
        <Text>商品、价格、库存与配送时间以校区运营当日实际发布为准；二手与跑腿交易请尽量选择校内公共区域当面完成。</Text>
      </View>
    </View>
  )
}
