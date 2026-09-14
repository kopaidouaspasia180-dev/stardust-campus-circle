import {Image, Text, View} from "@tarojs/components"
import Taro from "@tarojs/taro"
import type {Tenant} from "../types/tenant"
import chevronDownIcon from "../assets/icons/svg/chevron-down.svg"
import "./TenantHeader.css"

type Props = {
  tenant: Tenant
  campusName: string
  subtitle?: string
  variant?: "default" | "home"
}

export default function TenantHeader({tenant, campusName, variant = "default"}: Props) {
  if (variant === "home") {
    return (
      <View className="tenant-header tenant-header-home">
        <View className="home-tenant-switch" onClick={() => Taro.navigateTo({url: "/pages/school-select/index"})}>
          <View className="home-tenant-name-row">
            <Text className="home-tenant-name">{tenant.name}</Text>
            <Image className="home-tenant-chevron" src={chevronDownIcon} mode="aspectFit"/>
          </View>
          <Text className="home-campus-name">{campusName}</Text>
        </View>
      </View>
    )
  }

  return (
    <View className="tenant-header">
      <View className="tenant-summary" onClick={() => Taro.navigateTo({url: "/pages/school-select/index"})}>
        <Text className="school-mark">校</Text>
        <View className="tenant-copy">
          <Text className="tenant-name">{tenant.shortName || tenant.name}</Text>
          <Text className="campus-hint">{campusName} · 校园生活服务</Text>
        </View>
        <View className="campus-switch">
          <Text>切换高校</Text>
          <Text>›</Text>
        </View>
      </View>
    </View>
  )
}
