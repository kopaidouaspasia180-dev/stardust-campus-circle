import {useMemo, useState} from "react"
import {View, Text, Input} from "@tarojs/components"
import Taro from "@tarojs/taro"
import {tenants} from "../../data/tenants"
import {readTenantContext, writeTenantContext} from "../../store/tenant"
import "./index.css"

export default function SchoolSelectPage() {
  const current = readTenantContext()
  const [query, setQuery] = useState("")
  const list = useMemo(() => tenants.filter(item => `${item.name}${item.shortName}${item.city}${item.province}`.includes(query.trim())), [query])
  const selectTenant = (tenantId: string, campusId: string) => {
    writeTenantContext({tenantId, campusId})
    Taro.switchTab({url: "/pages/home/index"})
  }
  return <View className="page school-page">
    <Text className="school-kicker">STARDUST · MANY CAMPUSES</Text><Text className="school-title">切换高校</Text>
    <Text className="school-copy">同一套校园生态系统，高校之间数据独立。切换后将展示对应高校的校园内容与服务。</Text>
    <View className="school-search card"><Text>⌕</Text><Input value={query} onInput={event => setQuery(event.detail.value)} placeholder="搜索学校或城市"/></View>
    <View className="school-list">{list.map(item => <View className={`school-item card ${current.tenantId === item.id ? "current" : ""}`} key={item.id} onClick={() => selectTenant(item.id, item.campuses[0].id)}>
      <View className="school-mark" style={{background:item.theme.primary}}>{item.shortName.slice(0,1)}</View>
      <View className="school-info"><Text>{item.name}</Text><Text>{item.province} · {item.city} · {item.campuses.length} 个校区</Text></View>
      <View className="school-state"><Text>{current.tenantId === item.id ? "当前高校" : "进入"}</Text><Text>›</Text></View>
    </View>)}</View>
  </View>
}
