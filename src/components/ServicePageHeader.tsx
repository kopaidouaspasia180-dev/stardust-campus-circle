import {Text, View} from "@tarojs/components"
import CampusIcon from "./CampusIcon"
import "./ServicePageHeader.css"

type Props = {
  title: string
  subtitle: string
  iconIndex?: number
  eyebrow?: string
  badge?: string
}

export default function ServicePageHeader({
  title,
  subtitle,
  iconIndex = 0,
  eyebrow = "CAMPUS SERVICE",
  badge = "本校服务"
}: Props) {
  return <View className="service-page-header">
    <CampusIcon index={iconIndex} className="service-header-icon"/>
    <View className="service-header-copy">
      <Text className="service-header-eyebrow">{eyebrow}</Text>
      <Text className="service-header-title">{title}</Text>
      <Text className="service-header-subtitle">{subtitle}</Text>
    </View>
    <Text className="service-header-badge">{badge}</Text>
  </View>
}
