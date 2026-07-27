import {Text, View} from "@tarojs/components"
import Taro from "@tarojs/taro"
import "./ServicePageHeader.css"

export default function ServicePageHeader({title, subtitle}: {title: string; subtitle: string}) {
  return <View className="service-page-header">
    <Text className="service-back" onClick={() => Taro.navigateBack()}>‹</Text>
    <View><Text>{title}</Text><Text>{subtitle}</Text></View>
  </View>
}
