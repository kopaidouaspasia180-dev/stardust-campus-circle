import {Button, Text, View} from "@tarojs/components"
import Taro, {useDidShow, usePullDownRefresh} from "@tarojs/taro"
import {useState} from "react"
import {apiRequest, showApiError} from "../../api/client"
import "./index.css"

type Courier = {id: number; name: string}
type Delivery = {id: string; order_no: string; status: string; order_status: string; merchant_name: string; pickup_address: string; dropoff_address: string; contact_name: string; contact_phone: string}
const deliveryState: Record<string, string> = {available: "待抢单", assigned: "待取餐", delivering: "配送中", delivered: "已送达"}

export default function TakeoutRiderPage() {
  const [couriers, setCouriers] = useState<Courier[]>([])
  const [courierId, setCourierId] = useState(0)
  const [available, setAvailable] = useState<Delivery[]>([])
  const [mine, setMine] = useState<Delivery[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [acting, setActing] = useState("")
  const headers = (id = courierId) => ({"x-courier-id": String(id)})
  const loadDeliveries = async (id = courierId) => {
    if (!id) return
    const [pool, assigned] = await Promise.all([
      apiRequest<{items: Delivery[]}>("/rider/deliveries?scope=available", {headers: headers(id)}),
      apiRequest<{items: Delivery[]}>("/rider/deliveries?scope=mine", {headers: headers(id)})
    ])
    setAvailable(pool.items)
    setMine(assigned.items)
  }
  const load = async () => {
    setLoading(true); setError("")
    try {
      const access = await apiRequest<{couriers: Courier[]}>("/ops/access")
      setCouriers(access.couriers)
      const selected = courierId && access.couriers.some(item => item.id === courierId) ? courierId : access.couriers[0]?.id || 0
      setCourierId(selected)
      if (selected) await loadDeliveries(selected)
      else { setAvailable([]); setMine([]) }
    } catch (requestError) { setError(requestError instanceof Error ? requestError.message : "工作台加载失败") }
    finally { setLoading(false); Taro.stopPullDownRefresh() }
  }
  useDidShow(load)
  usePullDownRefresh(load)
  const chooseCourier = async (id: number) => { setCourierId(id); setLoading(true); try { await loadDeliveries(id) } catch (requestError) { showApiError(requestError) } finally { setLoading(false) } }
  const action = async (delivery: Delivery, actionName: "claim" | "pickup" | "deliver") => {
    setActing(`${delivery.id}-${actionName}`)
    try {
      await apiRequest(`/rider/deliveries/${delivery.id}/${actionName}`, {method: "POST", headers: headers()})
      Taro.showToast({title: actionName === "claim" ? "已接配送单" : actionName === "pickup" ? "已取餐" : "已送达", icon: "success"})
      await loadDeliveries()
    } catch (requestError) { showApiError(requestError) } finally { setActing("") }
  }
  const renderDelivery = (delivery: Delivery, isAvailable = false) => <View className="ops-card" key={delivery.id}>
    <View className="ops-card-top"><View><Text>{delivery.merchant_name} · {delivery.order_no}</Text><Text>{deliveryState[delivery.status] || delivery.status}</Text></View><Text className={`ops-status ${delivery.status}`}>{deliveryState[delivery.status] || delivery.status}</Text></View>
    <View className="ops-detail"><Text>取餐：{delivery.pickup_address || "商家取餐点"}</Text><Text>送达：{delivery.dropoff_address} · {delivery.contact_name} {delivery.contact_phone}</Text></View>
    <View className="ops-actions">
      {isAvailable && <Button className="primary" loading={acting === `${delivery.id}-claim`} disabled={Boolean(acting)} onClick={() => action(delivery, "claim")}>接配送单</Button>}
      {!isAvailable && delivery.status === "assigned" && <Button className="primary" loading={acting === `${delivery.id}-pickup`} disabled={Boolean(acting) || delivery.order_status !== "ready"} onClick={() => action(delivery, "pickup")}>{delivery.order_status === "ready" ? "确认已取餐" : "等待商家出餐"}</Button>}
      {!isAvailable && delivery.status === "delivering" && <Button className="primary" loading={acting === `${delivery.id}-deliver`} disabled={Boolean(acting)} onClick={() => action(delivery, "deliver")}>确认已送达</Button>}
    </View>
  </View>
  return <View className="ops-page rider-page">
    <View className="ops-heading"><Text>配送工作台</Text><Text>只显示当前校区可配送与我已接的午餐订单</Text></View>
    {!loading && !error && !!couriers.length && <View className="ops-selector">{couriers.map(item => <View key={item.id} className={item.id === courierId ? "ops-chip active" : "ops-chip"} onClick={() => chooseCourier(item.id)}><Text>{item.name}</Text></View>)}</View>}
    {loading && <View className="ops-state">正在同步配送订单…</View>}
    {!loading && error && <View className="ops-state"><Text>{error}</Text><Button onClick={load}>重新加载</Button></View>}
    {!loading && !error && !couriers.length && <View className="ops-state"><Text>当前微信账号还没有配送工作台权限</Text><Text>请由学校运营管理员为该账号分配骑手账号。</Text></View>}
    {!loading && !error && !!couriers.length && <><View className="rider-section-title">我已接的配送单</View>{mine.length ? mine.map(item => renderDelivery(item)) : <View className="rider-empty">暂时没有已接配送单</View>}<View className="rider-section-title">可接配送单</View>{available.length ? available.map(item => renderDelivery(item, true)) : <View className="rider-empty">当前没有可接配送单</View>}</>}
  </View>
}
