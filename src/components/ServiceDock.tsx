import {Image, Text, View} from "@tarojs/components"
import homeIcon from "../assets/icons/png/tab-home.png"
import orderIcon from "../assets/icons/png/tab-orders.png"
import userIcon from "../assets/icons/png/tab-user.png"
import "./ServiceDock.css"

type Props = {
  labels: [string, string, string]
  active?: number
  onSelect: (index: number) => void
}

const icons = [homeIcon, orderIcon, userIcon]

export default function ServiceDock({labels, active = 0, onSelect}: Props) {
  return <>
    <View className="service-dock-spacer"/>
    <View className="service-dock">
      {labels.map((label,index) => <View key={label} className={active === index ? "active" : ""} onClick={() => onSelect(index)}>
        <Image src={icons[index]}/>
        <Text>{label}</Text>
      </View>)}
    </View>
  </>
}
