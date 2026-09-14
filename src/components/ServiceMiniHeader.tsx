import {Text, View} from "@tarojs/components"
import "./ServiceMiniHeader.css"

type Props = {
  title: string
  badge?: string
  accent?: string
  onBadge?: () => void
}

export default function ServiceMiniHeader({title,badge,accent,onBadge}: Props) {
  return <View className="service-mini-header">
    <Text className="service-mini-title">{title}</Text>
    {badge&&<Text className="service-mini-badge" style={accent?{color:accent}:undefined} onClick={onBadge}>{badge}</Text>}
  </View>
}
