import {useState} from "react"
import {Button, Input, Text, View} from "@tarojs/components"
import {useDidShow} from "@tarojs/taro"
import Taro from "@tarojs/taro"
import ServicePageHeader from "../../components/ServicePageHeader"
import {apiRequest, showApiError} from "../../api/client"
import "../service-shared.css"
import "./index.css"

type Product = {id:number;name:string;description:string;price:string;category:string;stock:number}
type Merchant = {id:number;name:string;description:string;delivery_minutes:number;min_order:string;products:Product[]}
type Order = {id:string;merchant_name:string;total_amount:string;status:string;created_at:string;items:{name:string;quantity:number}[]}

export default function TakeoutPage() {
  const [merchants,setMerchants] = useState<Merchant[]>([])
  const [orders,setOrders] = useState<Order[]>([])
  const [cart,setCart] = useState<Record<number,number>>({})
  const [note,setNote] = useState("")
  const [loading,setLoading] = useState(true)
  const [ordering,setOrdering] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const [merchantResult,orderResult] = await Promise.all([
        apiRequest<{items:Merchant[]}>("/takeout/merchants"),
        apiRequest<{items:Order[]}>("/orders")
      ])
      setMerchants(merchantResult.items)
      setOrders(orderResult.items)
    } catch(error) { showApiError(error) }
    finally { setLoading(false) }
  }
  useDidShow(load)

  const allProducts = merchants.flatMap(item => item.products)
  const total = allProducts.reduce((sum,item) => sum + Number(item.price) * (cart[item.id] || 0),0)
  const change = (id:number,delta:number) => setCart(current => ({...current,[id]:Math.max(0,(current[id] || 0)+delta)}))
  const submit = async () => {
    const items = Object.entries(cart).filter(([,quantity]) => quantity > 0).map(([productId,quantity]) => ({productId:Number(productId),quantity}))
    if (!items.length) return Taro.showToast({title:"请先选择商品",icon:"none"})
    setOrdering(true)
    try {
      const result = await apiRequest<{payment:{message:string}}>("/orders",{method:"POST",data:{items,pickupNote:note}})
      setCart({})
      setNote("")
      Taro.showModal({title:"订单已提交",content:result.payment.message,showCancel:false})
      await load()
    } catch(error) { showApiError(error) }
    finally { setOrdering(false) }
  }

  return <View className="page business-page">
    <ServicePageHeader title="校园外卖" subtitle="选餐、购物车与订单记录"/>
    <View className="takeout-notice">当前订单支持创建和查询；微信支付须在商户号配置完成后启用。</View>
    {loading ? <View className="loading-card">正在加载菜单…</View> : merchants.map(merchant => <View className="business-section" key={merchant.id}>
      <View className="merchant-head"><View><Text>{merchant.name}</Text><Text>{merchant.description}</Text></View><Text>{merchant.delivery_minutes} 分钟</Text></View>
      <View className="business-list">{merchant.products.map(product => <View className="business-card product-card" key={product.id}>
        <View><Text className="business-card-title">{product.name}</Text><Text className="business-copy">{product.description}</Text><Text className="business-price">¥{product.price}</Text></View>
        <View className="quantity"><Text onClick={() => change(product.id,-1)}>−</Text><Text>{cart[product.id] || 0}</Text><Text onClick={() => change(product.id,1)}>＋</Text></View>
      </View>)}</View>
    </View>)}
    <View className="business-section"><Text className="business-section-title">取餐备注</Text><View className="business-form"><Input value={note} onInput={event => setNote(event.detail.value)} placeholder="宿舍楼、取餐时间或其他说明"/></View></View>
    {orders.length > 0 && <View className="business-section"><Text className="business-section-title">我的订单</Text><View className="business-list">{orders.map(order => <View className="business-card" key={order.id}><View className="business-card-head"><Text className="business-card-title">{order.merchant_name}</Text><Text className="business-badge">{order.status}</Text></View><Text className="business-copy">{order.items.map(item => `${item.name}×${item.quantity}`).join("、")}</Text><Text className="business-price">¥{order.total_amount}</Text></View>)}</View></View>}
    <View className="cart-bar"><View><Text>合计</Text><Text>¥{total.toFixed(2)}</Text></View><Button loading={ordering} disabled={ordering || total===0} onClick={submit}>提交订单</Button></View>
  </View>
}
