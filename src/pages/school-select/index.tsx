import {useMemo, useState} from "react"
import {View, Text, Input, Button} from "@tarojs/components"
import Taro from "@tarojs/taro"
import {tenants} from "../../data/tenants"
import {isTenantAvailable, readTenantContext, writeTenantContext} from "../../store/tenant"
import "./index.css"

export default function SchoolSelectPage() {
  const current = readTenantContext()
  const [query, setQuery] = useState("")
  const [selected, setSelected] = useState(current)
  const list = useMemo(() => tenants.filter(item => `${item.name}${item.shortName}${item.city}${item.province}`.includes(query.trim())), [query])
  const selectedTenant = tenants.find(item => item.id === selected.tenantId)
  const selectedCampus = selectedTenant?.campuses.find(item => item.id === selected.campusId) || selectedTenant?.campuses[0]
  const confirmTenant = () => {
    if (!isTenantAvailable(selectedTenant)) {
      Taro.showToast({title: "该高校正在筹备，暂未开放", icon: "none"})
      return
    }
    if (selected.tenantId === current.tenantId && selected.campusId === current.campusId) {
      Taro.showToast({title: "已是当前高校", icon: "none"})
      return
    }
    writeTenantContext(selected)
    if (Taro.getCurrentPages().length > 1) {
      Taro.navigateBack()
      return
    }
    Taro.switchTab({url: "/pages/home/index"})
  }
  return <View className="page school-page">
    <Text className="school-kicker">STARDUST · MANY CAMPUSES</Text><Text className="school-title">切换高校</Text>
    <Text className="school-copy">同一套校园生态系统，高校之间数据独立。切换后将展示对应高校的校园内容与服务。</Text>
    <View className="school-search card"><Text>⌕</Text><Input value={query} onInput={event => setQuery(event.detail.value)} placeholder="搜索学校或城市"/></View>
    <View className="school-list">{list.map(item => {
      const available = isTenantAvailable(item)
      const selectedItem = selected.tenantId === item.id
      return <View className={`school-item card ${current.tenantId === item.id ? "current" : ""} ${selectedItem ? "selected" : ""} ${available ? "" : "preparing"}`} key={item.id} onClick={() => {
        if (!available) {
          Taro.showToast({title: "该高校正在筹备，暂未开放", icon: "none"})
          return
        }
        setSelected({
          tenantId: item.id,
          campusId: item.id === current.tenantId && item.campuses.some(campus => campus.id === current.campusId)
            ? current.campusId
            : item.campuses[0].id
        })
      }}>
      <View className="school-mark" style={{background:item.theme.primary}}>{item.shortName.slice(0,1)}</View>
      <View className="school-info"><Text>{item.name}</Text><Text>{item.province} · {item.city} · {item.campuses.length} 个校区</Text></View>
      <View className="school-state"><Text>{!available ? "筹备中" : current.tenantId === item.id ? "当前高校" : selectedItem ? "已选择" : "选择"}</Text><Text>{!available ? "·" : selectedItem ? "✓" : "›"}</Text></View>
    </View>
    })}</View>
    {isTenantAvailable(selectedTenant) && selectedTenant.campuses.length > 1 && <View className="school-campus-panel card">
      <View className="school-campus-heading"><Text>选择院区</Text><Text>院区用于位置标注，校园圈和消息在同一学校内互通</Text></View>
      <View className="school-campus-options">{selectedTenant.campuses.map(campus => <View key={campus.id} className={selected.campusId === campus.id ? "selected" : ""} onClick={() => setSelected({tenantId:selectedTenant.id, campusId:campus.id})}><Text>{campus.name}</Text><Text>{selected.campusId === campus.id ? "✓" : "选择"}</Text></View>)}</View>
    </View>}
    <View className="school-confirm-wrap"><Text>已选择：{selectedTenant?.name || "未选择"}{selectedCampus ? ` · ${selectedCampus.name}` : ""}{!isTenantAvailable(selectedTenant) ? "（筹备中）" : ""}</Text><Button className="school-confirm" disabled={!isTenantAvailable(selectedTenant)} onClick={confirmTenant}>{isTenantAvailable(selectedTenant) ? "确认切换" : "暂未开放"}</Button></View>
  </View>
}
