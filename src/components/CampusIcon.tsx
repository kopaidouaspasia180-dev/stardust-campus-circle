import {Image, View} from "@tarojs/components"
import service01 from "../assets/icons/services/service-01.mini.webp"
import service02 from "../assets/icons/services/service-02.mini.webp"
import service03 from "../assets/icons/services/service-03.mini.webp"
import service04 from "../assets/icons/services/service-04.mini.webp"
import service05 from "../assets/icons/services/service-05.mini.webp"
import service06 from "../assets/icons/services/service-06.mini.webp"
import service07 from "../assets/icons/services/service-07.mini.webp"
import service08 from "../assets/icons/services/service-08.mini.webp"
import service09 from "../assets/icons/services/service-09.mini.webp"
import service10 from "../assets/icons/services/service-10.mini.webp"
import service11 from "../assets/icons/services/service-11.mini.webp"
import service12 from "../assets/icons/services/service-12.mini.webp"
import "./CampusIcon.css"

const serviceIcons = [
  service01,
  service02,
  service03,
  service04,
  service05,
  service06,
  service07,
  service08,
  service09,
  service10,
  service11,
  service12
]

export default function CampusIcon({index, className = ""}: {index: number; className?: string}) {
  return (
    <View className={`campus-icon ${className}`}>
      <Image className="campus-icon-image" src={serviceIcons[index] || serviceIcons[0]} mode="aspectFill"/>
    </View>
  )
}
