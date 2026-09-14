import {Button, Text, View} from "@tarojs/components"
import Taro, {useDidShow, usePullDownRefresh} from "@tarojs/taro"
import {useState} from "react"
import {apiRequest, showApiError} from "../../api/client"
import "./index.css"

type Merchant = {id: number; name: string; role: string}
type Order = {
  id: string; order_no: string; status: string; service_date: string; fulfillment_type: "pickup" | "delivery"
  contact_name: string; contact_phone: string; delivery_address: string; pickup_note: string
  items: Array<{name: string; quantity: number}>; total_amount_cents: number
}

const orderState: Record<string, string> = {submitted: "待接单", accepted: "制作中", ready: "待取/待骑手", delivering: "配送中", completed: "已完成", delivered: "已送达"}

export default function TakeoutMerchantPage() {
  const [merchants, setMerchants] = useState<Merchant[]>([])
  const [merchantId, setMerchantId] = useState(0)
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [acting, setActing] = useState("")

  const headers = (id = merchantId) => ({"x-merchant-id": String(id)})
  const loadOrders = async (id = merchantId) => {
    if (!id) return
    const result = await apiRequest<{items: Order[]}>("/merchant/orders", {headers: headers(id)})
    setOrders(result.items)
  }
  const load = async () => {
    setLoading(true)
    setError("")
    try {
      const access = await apiRequest<{merchants: Merchant[]}>("/ops/access")
      setMerchants(access.merchants)
      const selected = merchantId && access.merchants.some(item => item.id === merchantId) ? merchantId : access.merchants[0]?.id || 0
      setMerchantId(selected)
      if (selected) await loadOrders(selected)
      else setOrders([])
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "工作台加载失败")
    } finally {
      setLoading(false)
      Taro.stopPullDownRefresh()
    }
  }

  useDidShow(load)
  usePullDownRefresh(load)

  const chooseMerchant = async (id: number) => {
    setMerchantId(id)
    setLoading(true)
    try { await loadOrders(id) } catch (requestError) { showApiError(requestError) } finally { setLoading(false) }
  }
  const action = async (order: Order, actionName: "accept" | "reject" | "ready" | "complete-pickup") => {
    if (actionName === "reject") {
      const confirmation = await Taro.showModal({title: "确认无法接单？", content: "系统会释放该同学的预约名额并通知对方。", confirmColor: "#c94735"})
      if (!confirmation.confirm) return
    }
    setActing(`${order.id}-${actionName}`)
    try {
      await apiRequest(`/merchant/orders/${order.id}/${actionName}`, {method: "POST", headers: headers()})
      Taro.showToast({title: actionName === "accept" ? "已接单" : actionName === "ready" ? "已通知出餐" : "状态已更新", icon: "success"})
      await loadOrders()
    } catch (requestError) {
      showApiError(requestError)
    } finally {
      setActing("")
    }
  }

  return <View className="ops-page merchant-page">
    <View className="ops-heading"><Text>午餐工作台</Text><Text>只显示你被授权管理的当前校区档口订单</Text></View>
    {!loading && !error && !!merchants.length && <View className="ops-selector">
      {merchants.map(item => <View key={item.id} className={item.id === merchantId ? "ops-chip active" : "ops-chip"} onClick={() => chooseMerchant(item.id)}><Text>{item.name}</Text></View>)}
    </View>}
    {loading && <View className="ops-state">正在同步订单…</View>}
    {!loading && error && <View className="ops-state"><Text>{error}</Text><Button onClick={load}>重新加载</Button></View>}
    {!loading && !error && !merchants.length && <View className="ops-state"><Text>当前微信账号还没有商家工作台权限</Text><Text>请由学校运营管理员在后台为该账号分配档口权限。</Text></View>}
    {!loading && !error && !!merchants.length && !orders.length && <View className="ops-state">当前没有需要处理的午餐订单</View>}
    {!loading && !error && orders.map(order => <View className="ops-card" key={order.id}>
      <View className="ops-card-top"><View><Text>订单 {order.order_no}</Text><Text>{order.service_date} · 午餐</Text></View><Text className={`ops-status ${order.status}`}>{orderState[order.status] || order.status}</Text></View>
      <View className="ops-lines">{order.items.map((item, index) => <View key={`${order.id}-${index}`}><Text>{item.name}</Text><Text>×{item.quantity}</Text></View>)}</View>
      <View className="ops-detail"><Text>{order.fulfillment_type === "delivery" ? `配送 · ${order.contact_name} ${order.contact_phone}` : "到店自取"}</Text><Text>{order.fulfillment_type === "delivery" ? order.delivery_address : order.pickup_note || "请核验取餐码后交付"}</Text></View>
      <View className="ops-actions">
        {order.status === "submitted" && <><Button className="secondary" loading={acting === `${order.id}-reject`} disabled={Boolean(acting)} onClick={() => action(order, "reject")}>拒绝</Button><Button className="primary" loading={acting === `${order.id}-accept`} disabled={Boolean(acting)} onClick={() => action(order, "accept")}>接单</Button></>}
        {order.status === "accepted" && <Button className="primary" loading={acting === `${order.id}-ready`} disabled={Boolean(acting)} onClick={() => action(order, "ready")}>标记已出餐</Button>}
        {order.status === "ready" && order.fulfillment_type === "pickup" && <Button className="primary" loading={acting === `${order.id}-complete-pickup`} disabled={Boolean(acting)} onClick={() => action(order, "complete-pickup")}>确认用户已取餐</Button>}
      </View>
    </View>)}
  </View>
}
