import {Image, Text, View} from "@tarojs/components"
import CampusIcon from "./CampusIcon"
import "./ServiceVisualHero.css"

type Props = {
  kicker: string
  title: string
  subtitle: string
  iconIndex: number
  image?: string
  primaryLabel?: string
  secondaryLabel?: string
  onPrimary?: () => void
  onSecondary?: () => void
  compact?: boolean
}

export default function ServiceVisualHero({
  kicker,
  title,
  subtitle,
  iconIndex,
  image,
  primaryLabel,
  secondaryLabel,
  onPrimary,
  onSecondary,
  compact = false
}: Props) {
  return <View className={`service-visual-hero${compact ? " is-compact" : ""}`}>
    {image
      ? <Image className="service-visual-photo" src={image} mode="aspectFill"/>
      : <View className="service-visual-art"><CampusIcon className="service-visual-icon" index={iconIndex}/></View>}
    <View className="service-visual-shade"/>
    <View className="service-visual-content">
      <Text className="service-visual-kicker">{kicker}</Text>
      <Text className="service-visual-title">{title}</Text>
      <Text className="service-visual-subtitle">{subtitle}</Text>
      {(primaryLabel || secondaryLabel) && <View className="service-visual-actions">
        {primaryLabel && <Text className="service-visual-primary" onClick={onPrimary}>{primaryLabel}</Text>}
        {secondaryLabel && <Text className="service-visual-secondary" onClick={onSecondary}>{secondaryLabel}</Text>}
      </View>}
    </View>
  </View>
}
