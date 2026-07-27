import {Text, View} from "@tarojs/components"
import Taro from "@tarojs/taro"
import type {Tenant} from "../types/tenant"
import "./TenantHeader.css"

type Props = {
  tenant: Tenant
  campusName: string
  subtitle?: string
}

export default function TenantHeader({tenant, campusName}: Props) {
  return (
    <View className="tenant-header">
      <View className="mini-nav">
        <View className="brand-lockup">
          <View className="brand-script-row">
            <Text className="brand-script">Stardust</Text>
            <Text className="brand-star">✦</Text>
          </View>
          <Text className="brand-cn">星尘校园圈</Text>
        </View>
        <View className="wechat-capsule">
          <Text>•••</Text>
          <Text className="capsule-line"/>
          <Text className="capsule-ring">○</Text>
        </View>
      </View>

      <View className="campus-bar" onClick={() => Taro.navigateTo({url: "/pages/school-select/index"})}>
        <View className="campus-title">
          <Text className="tenant-name">{tenant.name}</Text>
          <Text className="campus-hint">切换高校</Text>
        </View>
        <View className="campus-pill">
          <Text className="campus-dot"/>
          <Text className="campus-name">{campusName}</Text>
          <Text className="picker-chevron">⌄</Text>
        </View>
      </View>
    </View>
  )
}
