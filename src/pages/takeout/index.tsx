import {useEffect, useMemo, useState} from "react"
import {Button, Image, Input, Text, View} from "@tarojs/components"
import Taro, {useDidShow} from "@tarojs/taro"
import healthyBeefImage from "../../assets/images/takeout-real/healthy-beef.jpg"
import homestyleRiceImage from "../../assets/images/takeout-real/homestyle-rice.jpg"
import lunchSelectionImage from "../../assets/images/takeout-real/lunch-selection.jpg"
import pepperChickenImage from "../../assets/images/takeout-real/pepper-chicken.jpg"
import chickenGrainImage from "../../assets/images/takeout-real/chicken-grain.jpg"
import homeIcon from "../../assets/icons/png/tab-home.png"
import orderIcon from "../../assets/icons/png/tab-orders.png"
import userIcon from "../../assets/icons/png/tab-user.png"
import clockIcon from "../../assets/icons/svg/calendar-event.svg"
import scooterIcon from "../../assets/icons/svg/scooter.svg"
import chevronDownIcon from "../../assets/icons/svg/chevron-down.svg"
import {accountStorageKey, apiErrorMessage, apiRequest, hasPhoneLogin, requirePhoneLogin, resolveMediaUrl, showApiError} from "../../api/client"
import {currentCampusName, currentTenant} from "../../store/tenant"
import "./index.css"

type MenuDay = {
  key: string
  date: string
  week: string
  label?: string
}

type Product = {
  id: string
  name: string
  description: string
  price: number
  originalPrice: number
  image: string
  category: string
  available: number
  merchantId: string
  merchantName: string
  deliveryMinutes: number
}

type TakeoutContext = {
  lunch: {cutoff: string; pickupWindow: string; deliveryFeeCents: number}
  merchantCount: number
  paymentEnabled: boolean
}

type MenuSource = "daily_menu" | "live_catalog" | "unavailable" | ""

type PaymentParams = {
  timeStamp: string
  nonceStr: string
  package: string
  signType: "RSA"
  paySign: string
}

const categoryAssets: Record<string, string> = {
  "午餐套餐": lunchSelectionImage,
  "减脂餐": healthyBeefImage,
  "家常菜": homestyleRiceImage,
  "轻食": chickenGrainImage,
  "能量餐": pepperChickenImage
}

const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000
const weekLabels = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"]

function shanghaiDate(value = new Date()) {
  return new Date(value.getTime() + SHANGHAI_OFFSET_MS)
}

function dateKey(value: Date) {
  return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, "0")}-${String(value.getUTCDate()).padStart(2, "0")}`
}

function shanghaiMenuDays(): MenuDay[] {
  const day = shanghaiDate()
  return Array.from({length: 7}, (_, index) => {
    const current = new Date(day)
    current.setUTCDate(current.getUTCDate() + index)
    return {
      key: dateKey(current),
      date: `${String(current.getUTCMonth() + 1).padStart(2, "0")}/${String(current.getUTCDate()).padStart(2, "0")}`,
      week: weekLabels[current.getUTCDay()],
      label: index === 0 ? "今天" : ""
    }
  })
}

const menuDays = shanghaiMenuDays()

const CONTACT_KEY = "stardust_takeout_contact_v1"

function shanghaiMinutes() {
  const current = shanghaiDate()
  return current.getUTCHours() * 60 + current.getUTCMinutes()
}

function cutoffMinutes(value = "10:30") {
  const [hour, minute] = value.split(":").map(Number)
  return Number.isFinite(hour) && Number.isFinite(minute) ? hour * 60 + minute : 630
}

function categoryLabel(raw: string) {
  if (["午餐套餐", "家常菜", "能量餐", "正餐"].includes(raw)) return "盖饭"
  if (["减脂餐", "轻食"].includes(raw)) return "轻食"
  if (["面食", "汤粥"].includes(raw)) return "小吃"
  return raw
}

export default function TakeoutPage() {
  const [dayIndex, setDayIndex] = useState(0)
  const [category, setCategory] = useState("全部")
  const [products, setProducts] = useState<Product[]>([])
  const [context, setContext] = useState<TakeoutContext | null>(null)
  const [cart, setCart] = useState<Record<string, number>>({})
  const [checkoutOpen, setCheckoutOpen] = useState(false)
  const [contactName, setContactName] = useState("")
  const [contactPhone, setContactPhone] = useState("")
  const [deliveryAddress, setDeliveryAddress] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState("")
  const [campusName, setCampusName] = useState(currentCampusName())
  const [tenantName, setTenantName] = useState(currentTenant().name)
  const [idempotencyKey, setIdempotencyKey] = useState("")
  const [reloadToken, setReloadToken] = useState(0)
  const selectedDay = menuDays[dayIndex]
  const heroProduct = products.find(item => item.category === "午餐套餐") || products[0]
  const categories = useMemo(() => {
    const available = Array.from(new Set(products.map(item => categoryLabel(item.category))))
    return products.length ? ["全部", ...available] : ["全部"]
  }, [products])
  const visibleProducts = useMemo(() => (
    products.filter(item => item.id !== heroProduct?.id && (category === "全部" || categoryLabel(item.category) === category))
  ), [category, heroProduct?.id, products])
  const cartItems = Object.values(cart).reduce((sum, quantity) => sum + quantity, 0)
  const cartProducts = products.filter(product => cart[product.id])
  const cartMerchant = cartProducts[0]
  const subtotal = products.reduce((sum, product) => sum + product.price * (cart[product.id] || 0), 0)
  const deliveryFee = (context?.lunch.deliveryFeeCents || 300) / 100
  const orderingClosed = dayIndex === 0 && shanghaiMinutes() >= cutoffMinutes(context?.lunch.cutoff)
  const serviceOpen = products.length > 0 && !orderingClosed
  const cutoff = context?.lunch.cutoff || "10:30"

  useDidShow(() => {
    setCampusName(currentCampusName())
    setTenantName(currentTenant().name)
    if (!hasPhoneLogin()) {
      setContactName("")
      setContactPhone("")
      setDeliveryAddress("")
      setCart({})
      setIdempotencyKey("")
      return
    }
    const saved = Taro.getStorageSync<{contactName?: string; contactPhone?: string; deliveryAddress?: string}>(accountStorageKey(CONTACT_KEY))
    if (!saved) return
    setContactName(saved.contactName || "")
    setContactPhone(saved.contactPhone || "")
    setDeliveryAddress(saved.deliveryAddress || "")
  })

  useEffect(() => {
    setLoading(true)
    setLoadError("")
    setProducts([])
    setCart({})
    setCategory("全部")
    setIdempotencyKey("")
    Promise.all([
      apiRequest<{source: MenuSource; items: Array<{
        id: number
        name: string
        description: string
        price: string | number
        original_price?: string | number
        image_url?: string
        category: string
        available: number
        merchant_id: number
        merchant_name: string
        delivery_minutes: number
        data_mode?: "test" | "live"
      }>}>(`/takeout/menu?serviceDate=${selectedDay.key}`),
      apiRequest<TakeoutContext>("/takeout/context")
    ]).then(([menu, nextContext]) => {
      setContext(nextContext)
      const nextProducts = menu.items.filter(item => item.available > 0 && item.data_mode !== "test").map(item => ({
        id: String(item.id),
        name: item.name,
        description: item.description,
        price: Number(item.price),
        originalPrice: Number(item.original_price || 0),
        image: resolveMediaUrl(item.image_url, categoryAssets[item.category] || lunchSelectionImage),
        category: item.category,
        available: item.available,
        merchantId: String(item.merchant_id),
        merchantName: item.merchant_name,
        deliveryMinutes: Number(item.delivery_minutes || 30)
      }))
      setProducts(nextProducts)
    }).catch(error => {
      setProducts([])
      setLoadError(apiErrorMessage(error) || "请检查网络后重试")
      setContext({lunch: {cutoff: "10:30", pickupWindow: "11:00–13:30", deliveryFeeCents: 300}, merchantCount: 0, paymentEnabled: false})
    }).finally(() => setLoading(false))
  }, [reloadToken, selectedDay.key])

  const changeQuantity = async (product: Product, delta: number): Promise<void> => {
    if (orderingClosed) {
      await Taro.showToast({title: "今日已截单，可选择明天", icon: "none"})
      return
    }
    if (!serviceOpen) {
      await Taro.showToast({title: "当前日期暂未发布菜单", icon: "none"})
      return
    }
    if (delta > 0 && cartMerchant && cartMerchant.merchantId !== product.merchantId) {
      const result = await Taro.showModal({
        title: "切换商家？",
        content: `一笔订单只能选择一家商家的餐品。切换到“${product.merchantName}”后，将清空“${cartMerchant.merchantName}”购物车。`,
        confirmText: "清空并切换",
        confirmColor: "#2879f3"
      })
      if (!result.confirm) return
      setCart({[product.id]: Math.min(1, product.available)})
      return
    }
    setCart(current => {
      const next = Math.max(0, Math.min(product.available, (current[product.id] || 0) + delta))
      const result = {...current}
      if (next) result[product.id] = next
      else delete result[product.id]
      return result
    })
  }

  const startHeroOrder = () => {
    if (!heroProduct) return Taro.showToast({title: "当天菜单暂未发布", icon: "none"})
    void changeQuantity(heroProduct, 1)
  }

  const openCheckout = async () => {
    if (!cartItems) return Taro.showToast({title: "请先选择餐品", icon: "none"})
    if (new Set(cartProducts.map(product => product.merchantId)).size > 1) {
      setCart({})
      return Taro.showToast({title: "购物车包含多个商家，请重新选择", icon: "none"})
    }
    if (!await requirePhoneLogin("登录后才能提交校园外卖订单并查看支付状态。")) return
    setIdempotencyKey("")
    setCheckoutOpen(true)
  }

  const submitOrder = async () => {
    if (!contactName.trim()) return Taro.showToast({title: "请填写联系人", icon: "none"})
    if (!/^1\d{10}$/.test(contactPhone)) return Taro.showToast({title: "请填写正确手机号", icon: "none"})
    if (deliveryAddress.trim().length < 5) {
      return Taro.showToast({title: "请填写完整配送地址", icon: "none"})
    }
    const selectedProducts = products.filter(product => cart[product.id])
    const lines = selectedProducts.map(product => ({
      productId: Number(product.id),
      quantity: cart[product.id]
    }))
    if (!lines.length) return Taro.showToast({title: "请先选择餐品", icon: "none"})

    setSubmitting(true)
    try {
      const requestKey = idempotencyKey || `lunch_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
      setIdempotencyKey(requestKey)
      const result = await apiRequest<{item: {id: string; order_no: string}; payment?: {enabled?: boolean}}>('/orders', {
        method: "POST",
        data: {
          idempotencyKey: requestKey,
          items: lines,
          serviceDate: selectedDay.key,
          fulfillmentType: "delivery",
          contactName: contactName.trim(),
          contactPhone,
          deliveryAddress: deliveryAddress.trim(),
          pickupAddress: `${cartMerchant?.merchantName || "校园外卖商家"}取餐点`,
          pickupNote: `仅限校园外送 · 配送时段 ${context?.lunch.pickupWindow || "11:00–13:30"}`
        }
      })
      Taro.setStorageSync(accountStorageKey(CONTACT_KEY), {contactName: contactName.trim(), contactPhone, deliveryAddress: deliveryAddress.trim()})
      setCheckoutOpen(false)
      setCart({})
      setIdempotencyKey("")
      if (result.payment?.enabled) {
        try {
          const intent = await apiRequest<{paymentParams: PaymentParams}>(`/orders/${result.item.id}/payment-intent`, {method: "POST"})
          await Taro.requestPayment(intent.paymentParams)
          await Taro.showModal({title: "支付已提交", content: `订单 ${result.item.order_no} 正在确认支付结果，可在“我的订单”查看进度。`, showCancel: false})
        } catch (paymentError) {
          const detail = apiErrorMessage(paymentError)
          if (/cancel/i.test(detail)) Taro.showToast({title: "已取消支付，可在订单页继续", icon: "none"})
          else showApiError(paymentError)
        }
        Taro.navigateTo({url: "/pages/takeout-orders/index"})
        return
      }
      await Taro.showModal({
        title: "预约已提交",
        content: `订单 ${result.item.order_no} 已进入商家确认队列。当前版本不发起在线支付，结算与履约以校区运营确认为准。`,
        showCancel: false
      })
      Taro.navigateTo({url: "/pages/takeout-orders/index"})
    } catch (requestError) {
      showApiError(requestError)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <View className={`takeout-v5${Taro.getEnv() === Taro.ENV_TYPE.WEB ? " takeout-v5-h5" : ""}`}>
      <View className="takeout-header">
        <Text className="takeout-title">校园外卖</Text>
        <View className="campus-chip" onClick={() => Taro.navigateTo({url: "/pages/school-select/index"})}>
          <Text>{tenantName} · {campusName}</Text><Image src={chevronDownIcon}/>
        </View>
      </View>

      <View className="service-status">
        <View className="status-cell">
          <Image src={clockIcon}/><Text>{dayIndex > 0 ? "预约午餐" : "今日午餐"} · <Text>{cutoff}</Text> 前下单</Text>
        </View>
        <View className="status-divider"/>
        <View className="status-cell delivery-status">
          <Image src={scooterIcon}/><Text>{serviceOpen ? `约 ${heroProduct?.deliveryMinutes || 30} 分钟送达` : orderingClosed ? "今日已截单" : "菜单待发布"}</Text>
        </View>
      </View>

      <View className={`cutoff-notice${orderingClosed ? " closed" : ""}`}>
        <Text>{orderingClosed ? `今天已超过上午 ${cutoff}，请预订明天` : `仅支持校内外送，请在上午 ${cutoff} 前完成下单`}</Text>
      </View>

      <View className="date-tabs">
        {menuDays.map((item, index) => <View className={dayIndex === index ? "active" : ""} key={item.key} onClick={() => setDayIndex(index)}>
          <Text>{item.date}</Text><Text>{item.label || item.week}</Text>
        </View>)}
      </View>

      <View className="takeout-featured">
        <ProductImage src={heroProduct?.image} fallback={lunchSelectionImage} className="featured-image"/>
        <View className="featured-copy">
          <Text>{heroProduct?.name || "今日餐品正在准备"}</Text>
          <Text>{heroProduct?.merchantName || "校区商家发布后自动显示"}</Text>
          <View className="featured-action">
            <Text>{heroProduct ? `¥${heroProduct.price.toFixed(1)}` : "暂未开餐"}</Text>
            {heroProduct && <Button disabled={!serviceOpen} onClick={startHeroOrder}>+</Button>}
          </View>
        </View>
      </View>

      <View className="takeout-section-title"><Text>今日菜单</Text><Text>{products.length ? `${products.length} 款餐品` : "以商家发布为准"}</Text></View>
      <View className="takeout-categories">
        {categories.map(item => <View className={category === item ? "active" : ""} key={item} onClick={() => setCategory(item)}><Text>{item}</Text></View>)}
      </View>

      <View className="takeout-products">
        {loading && <View className="takeout-empty"><Text>正在加载今日菜单…</Text></View>}
        {!loading && visibleProducts.map(product => <ProductRow key={product.id} product={product} quantity={cart[product.id] || 0} changeQuantity={changeQuantity}/>) }
        {!loading && !products.length && <View className="takeout-empty"><Text>{loadError ? "菜单服务暂时没有响应" : "这一天的菜单还没发布"}</Text><Text>{loadError || "可切换其他日期，或稍后再来"}</Text><Button onClick={() => setReloadToken(value => value + 1)}>重新加载</Button></View>}
        {!loading && products.length > 0 && category !== "全部" && !products.some(item => categoryLabel(item.category) === category) && <View className="takeout-empty"><Text>{category}暂无可订餐品</Text><Text>试试“全部”或其他分类</Text></View>}
      </View>

      <View className={`takeout-cart ${cartItems ? "show" : ""}`} onClick={() => void openCheckout()}>
        <View className="cart-icon"><Image src={orderIcon}/><Text>{cartItems}</Text></View>
        <View className="cart-summary"><Text>已选 <Text>{cartItems}</Text> 件 · <Text>¥{subtotal.toFixed(1)}</Text></Text><Text>{cartMerchant?.merchantName || "校园外卖"}</Text></View>
        <Button onClick={event => {event.stopPropagation();void openCheckout()}}>去结算</Button>
      </View>

      {checkoutOpen && <View className="checkout-mask" onClick={() => setCheckoutOpen(false)}>
        <View className="checkout-panel" onClick={event => event.stopPropagation()}>
          <View className="checkout-heading"><View><Text>确认外送订单</Text><Text>{selectedDay.date} · 午餐 · 上午 {cutoff} 前下单</Text></View><Text onClick={() => setCheckoutOpen(false)}>关闭</Text></View>
          <View className="delivery-only"><Image src={scooterIcon}/><View><Text>仅支持送到校内</Text><Text>请填写宿舍楼、房间号或约定取餐点</Text></View></View>
          <View className="checkout-fields">
            <View><Text>联系人</Text><Input value={contactName} onInput={event => setContactName(event.detail.value)} placeholder="怎么称呼"/></View>
            <View><Text>手机号</Text><Input type="number" maxlength={11} value={contactPhone} onInput={event => setContactPhone(event.detail.value)} placeholder="用于接单和送达通知"/></View>
            <View><Text>配送地址</Text><Input value={deliveryAddress} onInput={event => setDeliveryAddress(event.detail.value)} placeholder="校区、楼栋、房间号或取餐点"/></View>
          </View>
          <View className="order-route"><Text>外送流程</Text><Text>商家接单 → 骑手接单 → 出餐配送 → 确认送达</Text></View>
          <View className="checkout-total"><Text>含校内配送费 ¥{deliveryFee.toFixed(1)}</Text><Text>¥{(subtotal + deliveryFee).toFixed(1)}</Text></View>
          <View className="checkout-lines">
            {products.filter(product => cart[product.id]).map(product => <View key={product.id}><Text>{product.name} × {cart[product.id]}</Text><Text>¥{(product.price * cart[product.id]).toFixed(1)}</Text></View>)}
          </View>
          <Button loading={submitting} disabled={submitting} onClick={submitOrder}>{context?.paymentEnabled ? "微信支付" : "提交订单"} · ¥{(subtotal + deliveryFee).toFixed(1)}</Button>
          <Text className="offline-note">{context?.paymentEnabled ? "将进入微信官方收银台，支付成功后商家才会收到订单" : "当前校区未启用在线支付，提交后由商家按运营规则确认"}</Text>
        </View>
      </View>}

      <View className="takeout-nav">
        <View className="active"><Image src={homeIcon}/><Text>首页</Text></View>
        <View onClick={() => Taro.navigateTo({url: "/pages/takeout-orders/index"})}><Image src={orderIcon}/><Text>订单</Text></View>
        <View onClick={() => Taro.switchTab({url: "/pages/profile/index"})}><Image src={userIcon}/><Text>我的</Text></View>
      </View>
    </View>
  )
}

function ProductRow({product, quantity, changeQuantity}: {
  product: Product
  quantity: number
  changeQuantity: (product: Product, delta: number) => void | Promise<void>
}) {
  return <View className="takeout-product-row">
    <ProductImage src={product.image} fallback={categoryAssets[product.category] || lunchSelectionImage}/>
    <View className="takeout-product-copy">
      <Text>{product.name}</Text>
      <View><Text>{product.description}</Text></View>
      <Text>¥{product.price.toFixed(1)}</Text>
    </View>
    <View className="quantity-control">
      {quantity > 0 && <><Text onClick={() => void changeQuantity(product, -1)}>−</Text><Text>{quantity}</Text></>}
      <Text onClick={() => void changeQuantity(product, 1)}>+</Text>
    </View>
  </View>
}

function ProductImage({src, fallback, className = ""}: {src?: string; fallback: string; className?: string}) {
  const [source, setSource] = useState(src || fallback)
  useEffect(() => setSource(src || fallback), [fallback, src])
  return <Image className={className} src={source} mode="aspectFill" onError={() => source !== fallback && setSource(fallback)}/>
}
