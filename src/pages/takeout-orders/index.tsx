import {Button, Text, View} from "@tarojs/components"
import Taro, {useDidShow, usePullDownRefresh} from "@tarojs/taro"
import {useState} from "react"
import {apiErrorMessage, apiRequest, hasPhoneLogin, requirePhoneLogin, showApiError} from "../../api/client"
import "./index.css"

type OrderItem = {
  name: string
  quantity: number
  priceCents?: number
}

type LunchOrder = {
  id: string
  order_no: string
  total_amount: string
  total_amount_cents?: number
  status: string
  payment_status?: string
  service_date: string
  fulfillment_type: "pickup" | "delivery"
  merchant_name: string
  items: OrderItem[]
  created_at: string
}

const statusCopy: Record<string, {title: string; detail: string}> = {
  payment_pending: {title: "等待支付", detail: "完成微信支付后，订单才会推送给商家"},
  submitted: {title: "等待商家接单", detail: "订单已发给商家，可在接单前取消"},
  accepted: {title: "商家制作中", detail: "商家已接单，正在准备午餐"},
  ready: {title: "午餐已出餐", detail: "自取请前往取餐点，配送请等待骑手取餐"},
  delivering: {title: "骑手配送中", detail: "骑手已取餐，正在送往你的地址"},
  delivered: {title: "已送达", detail: "本次午餐配送已完成"},
  completed: {title: "已完成", detail: "本次午餐订单已完成"},
  cancelled: {title: "已取消", detail: "订单已取消，预约名额已释放"},
  rejected: {title: "商家未接单", detail: "商家无法承接本次订单，预约名额已释放"}
}

export default function TakeoutOrdersPage() {
  const [orders, setOrders] = useState<LunchOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [cancelling, setCancelling] = useState("")
  const [paying, setPaying] = useState("")

  const loadOrders = async () => {
    if (!hasPhoneLogin()) {
      setOrders([])
      setLoading(false)
      setError("")
      Taro.stopPullDownRefresh()
      return
    }
    setError("")
    try {
      const result = await apiRequest<{items: LunchOrder[]}>("/orders")
      setOrders(result.items)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "订单加载失败")
    } finally {
      setLoading(false)
      Taro.stopPullDownRefresh()
    }
  }

  useDidShow(() => {
    void requirePhoneLogin("登录后才能查看你的校园外卖订单。").then(allowed => {
      if (allowed) void loadOrders()
      else setLoading(false)
    })
  })

  usePullDownRefresh(loadOrders)

  const cancelOrder = async (order: LunchOrder) => {
    if (!await requirePhoneLogin("登录后才能管理你的订单。")) return
    const confirmation = await Taro.showModal({
      title: "取消这份午餐？",
      content: "商家接单前可以取消，取消后会释放当天预约名额。",
      confirmText: "确认取消",
      confirmColor: "#d84a3a"
    })
    if (!confirmation.confirm) return
    setCancelling(order.id)
    try {
      await apiRequest(`/orders/${order.id}/cancel`, {method: "POST", data: {reason: "用户在订单页取消"}})
      await loadOrders()
      Taro.showToast({title: "订单已取消", icon: "success"})
    } catch (requestError) {
      showApiError(requestError)
    } finally {
      setCancelling("")
    }
  }

  const payOrder = async (order: LunchOrder) => {
    if (!await requirePhoneLogin("登录后才能继续支付订单。")) return
    setPaying(order.id)
    try {
      const result = await apiRequest<{paymentParams: {timeStamp: string; nonceStr: string; package: string; signType: "RSA"; paySign: string}}>(`/orders/${order.id}/payment-intent`, {method: "POST"})
      await Taro.requestPayment(result.paymentParams)
      Taro.showToast({title: "支付结果确认中", icon: "none"})
      await loadOrders()
      setTimeout(loadOrders, 1800)
    } catch (requestError) {
      if (/cancel/i.test(apiErrorMessage(requestError))) {
        Taro.showToast({title: "已取消支付，可稍后继续", icon: "none"})
      } else {
        showApiError(requestError)
      }
    } finally {
      setPaying("")
    }
  }

  return (
    <View className="lunch-orders-page">
      <View className="orders-heading">
        <Text>我的午餐</Text>
        <Text>下拉可刷新商家与骑手进度</Text>
      </View>

      {loading && <View className="orders-state">正在加载订单…</View>}
      {!loading && error && <View className="orders-state">
        <Text>{error}</Text>
        <Button onClick={loadOrders}>重新加载</Button>
      </View>}
      {!loading && !error && !orders.length && <View className="orders-state">
        <Text>还没有午餐订单</Text>
        <Button onClick={() => Taro.navigateBack()}>去选今天的午餐</Button>
      </View>}

      {!loading && !error && orders.map(order => {
        const state = statusCopy[order.status] || {title: order.status, detail: "订单状态已更新"}
        const totalCents = order.total_amount_cents ?? Math.round(Number(order.total_amount) * 100)
        const refundDetail = order.payment_status === "refund_pending" ? "退款已提交，到账时间以微信支付处理结果为准" : order.payment_status === "refunded" ? "退款已完成，请留意微信支付通知" : order.payment_status === "refund_failed" ? "退款处理异常，请联系小饭桌客服协助处理" : ""
        return <View className="order-card" key={order.id}>
          <View className="order-top">
            <View><Text className="merchant-name">{order.merchant_name}</Text><Text className="order-number">订单 {order.order_no}</Text></View>
            <Text className={`status status-${order.status}`}>{state.title}</Text>
          </View>
          <View className="status-detail">{state.detail}</View>
          {refundDetail && <View className="refund-detail">{refundDetail}</View>}
          <View className="service-row">
            <Text>{order.service_date} · 午餐</Text>
            <Text>{order.fulfillment_type === "delivery" ? "骑手配送" : "到店自取"}</Text>
          </View>
          <View className="order-lines">
            {order.items.map((item, index) => <View key={`${order.id}-${index}`}>
              <Text>{item.name}</Text><Text>×{item.quantity}</Text>
            </View>)}
          </View>
          <View className="order-bottom">
            <Text>{new Date(order.created_at).toLocaleString()}</Text>
            <Text>合计 ¥{(totalCents / 100).toFixed(2)}</Text>
          </View>
          {["payment_pending", "submitted"].includes(order.status) && <View className="order-actions">
            {order.status === "payment_pending" && <Button
              className="pay-button"
              loading={paying === order.id}
              disabled={Boolean(paying || cancelling)}
              onClick={() => payOrder(order)}
            >继续支付</Button>}
            <Button
              className="cancel-button"
              loading={cancelling === order.id}
              disabled={Boolean(cancelling)}
              onClick={() => cancelOrder(order)}
            >取消订单</Button>
          </View>}
        </View>
      })}
    </View>
  )
}
