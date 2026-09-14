import {Button, Image, Input, Picker, Text, Textarea, View} from "@tarojs/components"
import Taro, {useDidShow, useRouter} from "@tarojs/taro"
import {useMemo, useState} from "react"
import ServiceDock from "../../components/ServiceDock"
import {apiRequest, hasPhoneLogin, requirePhoneLogin, showApiError} from "../../api/client"
import {currentCampusName} from "../../store/tenant"
import flowers from "../../assets/services-real/flowers-pexels.mini.webp"
import snacks from "../../assets/services-real/snacks-pexels.mini.webp"
import flowerIcon from "../../assets/icons/services/service-11.mini.webp"
import calendarCategory from "../../assets/icons/services/service-01.mini.webp"
import flagCategory from "../../assets/icons/services/service-06.mini.webp"
import heartCategory from "../../assets/icons/services/service-07.mini.webp"
import snackIcon from "../../assets/icons/services/service-10.mini.webp"
import dailyIcon from "../../assets/icons/services/service-02.mini.webp"
import fruitHero from "../../assets/services-ref/fruit-hero-bowl.mini.webp"
import fruitSeason from "../../assets/services-ref/fruit-category-season.png"
import fruitPlatter from "../../assets/services-ref/fruit-category-platter.png"
import fruitDorm from "../../assets/services-ref/fruit-category-dorm.png"
import fruitDrink from "../../assets/services-ref/fruit-category-drink.png"
import fruitAdd from "../../assets/services-ref/fruit-add.png"
import fruitCart from "../../assets/services-ref/fruit-cart.png"
import snackHero from "../../assets/services-ref/snacks/hero.mini.webp"
import dailySupplyIcon from "../../assets/icons/services/service-08.mini.webp"
import "../service-shared.css"
import "../service-visual-v2.css"
import "./index.css"

type StoreKey = "flowers" | "fruit" | "snacks"
type ApiProduct = {id: number; name: string; description: string; category?: string; price_cents: number; image_url?: string; stock: number; sort_order: number; data_mode?: "test" | "live"}
type DisplayProduct = {id: number; title: string; sub: string; category: string; priceCents: number; image?: string; stock: number}
type ServiceOrder = {
  id: string
  order_no: string
  service_type: StoreKey
  status: string
  payment_status?: string
  total_amount_cents: number
  note: string
  fulfillment_type?: "pickup" | "delivery"
  contact_name?: string
  contact_phone_masked?: string
  delivery_address?: string
  desired_date?: string
  desired_time?: string
  gift_message?: string
  created_at: string
  items: Array<{productId: number; name: string; unitPriceCents: number; quantity: number}>
}

const stores: Record<StoreKey, {
  title: string
  badge: string
  hero: string
  headline: string
  sub: string
  accent: string
  categories: string[]
}> = {
  flowers: {
    title: "校园花店", badge: "当前校区", hero: flowers, headline: "把祝福送到 TA 手中", sub: "真实花束由校区运营发布", accent: "#ec719b",
    categories: ["毕业", "生日", "表白", "日常"]
  },
  fruit: {
    title: "校园水果店", badge: "当前校区", hero: fruitHero, headline: "今日新鲜到校", sub: "库存与价格由校区运营实时维护", accent: "#247fe8",
    categories: ["当季", "拼盘", "宿舍装", "饮品"]
  },
  snacks: {
    title: "南院零食店", badge: "当前校区", hero: snacks, headline: "宿舍补给站", sub: "真实商品由校区运营发布", accent: "#6f65df",
    categories: ["零食", "饮料", "泡面", "日用"]
  }
}

const orderStatus: Record<string, string> = {
  payment_pending: "等待支付", submitted: "待确认", confirmed: "已确认", preparing: "备货中", ready: "待取/待送", completed: "已完成", cancelled: "已取消"
}

const moneyText = (cents: number) => (Number(cents || 0) / 100).toFixed(2).replace(/\.00$/, "")
const localDateText = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`

const inferredCategory = (product: Pick<ApiProduct, "name" | "description" | "category">, key: StoreKey) => {
  if (product.category) return product.category
  const value = `${product.name}${product.description}`
  if (key === "snacks") {
    if (/饮料|汽水|茶|水|咖啡|奶/.test(value)) return "饮料"
    if (/泡面|方便面|拌面|粉/.test(value)) return "泡面"
    if (/纸|洗|牙|日用|湿巾/.test(value)) return "日用"
    return "零食"
  }
  return stores[key].categories[0]
}

export default function CampusStorePage() {
  const router = useRouter()
  const requestedStore = String(router.params.type || "fruit")
  const key = (requestedStore in stores ? requestedStore : "fruit") as StoreKey
  const current = stores[key]
  const categoryIcons = key === "flowers" ? [flagCategory, calendarCategory, heartCategory, flowerIcon] : key === "fruit" ? [fruitSeason, fruitPlatter, fruitDorm, fruitDrink] : [snackIcon, fruitDrink, dailyIcon, dailySupplyIcon]
  const [products, setProducts] = useState<ApiProduct[]>([])
  const [orders, setOrders] = useState<ServiceOrder[]>([])
  const [cart, setCart] = useState<Record<number, number>>({})
  const [note, setNote] = useState("")
  const [tab, setTab] = useState<"商品" | "结算" | "订单">("商品")
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [category, setCategory] = useState("全部")
  const [query, setQuery] = useState("")
  const [searchOpen, setSearchOpen] = useState(false)
  const [fulfillmentType, setFulfillmentType] = useState<"pickup" | "delivery">("pickup")
  const [contactName, setContactName] = useState("")
  const [contactPhone, setContactPhone] = useState("")
  const [deliveryAddress, setDeliveryAddress] = useState("")
  const [desiredDate, setDesiredDate] = useState(localDateText())
  const [desiredTime, setDesiredTime] = useState("18:00")
  const [giftMessage, setGiftMessage] = useState("")

  const load = async () => {
    setLoading(true)
    setLoadError("")
    try {
      const [productResult, orderResult] = await Promise.all([
        apiRequest<{items: ApiProduct[]}>(`/service/products?type=${key}`),
        hasPhoneLogin()
          ? apiRequest<{items: ServiceOrder[]}>(`/service/orders?type=${key}`)
          : Promise.resolve({items: [] as ServiceOrder[]})
      ])
      setProducts(productResult.items)
      setOrders(orderResult.items)
      if (!hasPhoneLogin()) {
        setCart({})
        setContactName("")
        setContactPhone("")
        setDeliveryAddress("")
        setNote("")
        setGiftMessage("")
        if (tab === "订单" || tab === "结算") setTab("商品")
      }
    } catch (error) {
      setProducts([])
      setOrders([])
      setLoadError("暂时没有连接到校区店铺，稍后可重新加载")
    } finally {
      setLoading(false)
    }
  }
  useDidShow(() => { void load() })

  const displayProducts = useMemo<DisplayProduct[]>(() => {
    return products.filter(product => product.data_mode !== "test").map(product => ({
      id: product.id,
      title: product.name,
      sub: product.description || "当前校区在售商品",
      category: inferredCategory(product, key),
      priceCents: product.price_cents,
      image: product.image_url,
      stock: product.stock
    }))
  }, [key, products])

  const visibleProducts = useMemo(() => displayProducts.filter(product => {
    const matchesCategory = category === "全部" || product.category === category
    const keyword = query.trim().toLowerCase()
    return matchesCategory && (!keyword || `${product.title}${product.sub}${product.category}`.toLowerCase().includes(keyword))
  }), [category, displayProducts, query])

  const cartItems = useMemo(() => displayProducts.filter(product => cart[product.id]).map(product => ({...product, quantity: cart[product.id]})), [cart, displayProducts])
  const totalCount = cartItems.reduce((sum, item) => sum + item.quantity, 0)
  const totalCents = cartItems.reduce((sum, item) => sum + item.priceCents * item.quantity, 0)

  const addProduct = (product: DisplayProduct) => {
    const currentQuantity = cart[product.id] || 0
    if (currentQuantity >= product.stock) return Taro.showToast({title: "库存不足", icon: "none"})
    setCart(value => ({...value, [product.id]: currentQuantity + 1}))
    Taro.showToast({title: "已加入", icon: "success"})
  }

  const changeQuantity = (product: DisplayProduct, delta: number) => {
    const next = Math.max(0, Math.min(product.stock, (cart[product.id] || 0) + delta))
    setCart(currentCart => {
      const updated = {...currentCart}
      if (next) updated[product.id] = next
      else delete updated[product.id]
      return updated
    })
  }

  const submitOrder = async () => {
    if (!await requirePhoneLogin("登录后才能提交订单并查看履约与支付状态。")) return
    if (!cartItems.length || submitting) return Taro.showToast({title: "请先选择商品", icon: "none"})
    if (!contactName.trim()) return Taro.showToast({title: "请填写联系人", icon: "none"})
    if (!/^1\d{10}$/.test(contactPhone)) return Taro.showToast({title: "请填写正确手机号", icon: "none"})
    if (fulfillmentType === "delivery" && deliveryAddress.trim().length < 4) return Taro.showToast({title: "请填写校内送达位置", icon: "none"})
    if (key === "flowers" && !/^\d{4}-\d{2}-\d{2}$/.test(desiredDate)) return Taro.showToast({title: "请选择送达日期", icon: "none"})
    if (key === "flowers" && !/^\d{2}:\d{2}$/.test(desiredTime)) return Taro.showToast({title: "请选择期望时间", icon: "none"})
    setSubmitting(true)
    try {
      const result = await apiRequest<{item: ServiceOrder; payment?: {enabled?: boolean}}>("/service/orders", {
        method: "POST",
        data: {
          serviceType: key,
          note: note.trim(),
          fulfillmentType,
          contactName: contactName.trim(),
          contactPhone,
          deliveryAddress: fulfillmentType === "delivery" ? deliveryAddress.trim() : "",
          desiredDate: key === "flowers" ? desiredDate : "",
          desiredTime: key === "flowers" ? desiredTime : "",
          giftMessage: key === "flowers" ? giftMessage.trim() : "",
          items: cartItems.map(item => ({productId: item.id, quantity: item.quantity}))
        }
      })
      setCart({})
      setNote("")
      setDeliveryAddress("")
      setGiftMessage("")
      setTab("订单")
      await load()
      if (result.payment?.enabled) {
        if (Taro.getEnv() !== Taro.ENV_TYPE.WEAPP) {
          await Taro.showModal({title: "请在微信中支付", content: "订单已创建，请在微信小程序的“我的订单”中继续支付。", showCancel: false})
          return
        }
        const intent = await apiRequest<{paymentParams: {timeStamp: string; nonceStr: string; package: string; signType: "RSA"; paySign: string}}>(`/service/orders/${result.item.id}/payment-intent`, {method: "POST"})
        await Taro.requestPayment(intent.paymentParams)
        Taro.showToast({title: "支付已提交", icon: "success"})
        await load()
        return
      }
      Taro.showModal({title: "订单已提交", content: "校区运营确认库存与履约时间后会更新订单状态。", showCancel: false})
    } catch (error) {
      showApiError(error)
    } finally {
      setSubmitting(false)
    }
  }

  const payOrder = async (order: ServiceOrder) => {
    if (Taro.getEnv() !== Taro.ENV_TYPE.WEAPP) return Taro.showToast({title: "请在微信小程序内支付", icon: "none"})
    try {
      const result = await apiRequest<{paymentParams: {timeStamp: string; nonceStr: string; package: string; signType: "RSA"; paySign: string}}>(`/service/orders/${order.id}/payment-intent`, {method: "POST"})
      await Taro.requestPayment(result.paymentParams)
      Taro.showToast({title: "支付已提交", icon: "success"})
      await load()
    } catch (error) {
      if (!String(error).includes("cancel")) showApiError(error)
    }
  }

  const cancelOrder = async (order: ServiceOrder) => {
    const modal = await Taro.showModal({title: "取消订单？", content: "仅待确认订单可以取消，库存会自动恢复。", confirmText: "确认取消"})
    if (!modal.confirm) return
    try {
      await apiRequest(`/service/orders/${order.id}/cancel`, {method: "POST"})
      await load()
    } catch (error) {
      showApiError(error)
    }
  }

  const dock = (index: number) => setTab(index === 0 ? "商品" : index === 1 ? "结算" : "订单")
  const firstProduct = visibleProducts[0]

  return <View className={`service-v2 store-v2 store-v2-${key}`} style={{"--store-accent": current.accent} as React.CSSProperties}>
    {key === "fruit" ? <View className="fruit-v3-header"><View><Text>{current.title}</Text><Text>今日新鲜到校</Text></View><View onClick={() => Taro.navigateTo({url: "/pages/school-select/index"})}><Text>{currentCampusName()}</Text><Text>⌄</Text></View></View> : key === "snacks" ? <View className="snack-v3-header"><Text>校园零食店</Text><View onClick={() => Taro.navigateTo({url: "/pages/school-select/index"})}><Text>{currentCampusName()}</Text><Text>⌄</Text></View></View> : <View className="flower-v3-header"><Text>{current.title}</Text><View onClick={() => Taro.navigateTo({url: "/pages/school-select/index"})}><Text>{firstProduct ? "鲜花预约" : "等待上新"}</Text><Text>· {currentCampusName()}</Text></View></View>}

    {tab === "商品" && <>
      <View className={`store-v2-hero ${key === "fruit" ? "fruit-v2-hero" : key === "snacks" ? "snack-v3-hero" : "flower-v3-hero"}`}>
        <Image className={key === "fruit" ? "fruit-v2-hero-image" : ""} src={key === "snacks" ? snackHero : current.hero} mode="aspectFill"/>
        <View className="store-v2-overlay">
          <Text>{key === "fruit" ? "夏日当季鲜果" : current.headline}</Text><Text>{key === "snacks" ? "到店自取或校内送达，时间以接单确认为准" : key === "fruit" ? "清甜多汁 · 新鲜直达宿舍" : current.sub}</Text>
          {key !== "snacks" && firstProduct && <Text>¥{moneyText(firstProduct.priceCents)} 起</Text>}
          <Button onClick={() => firstProduct ? addProduct(firstProduct) : void load()}>{firstProduct ? (key === "snacks" ? "马上选购" : key === "flowers" ? "选花预约" : "选购水果") : "刷新商品"} <Text>→</Text></Button>
        </View>
      </View>
      <View className={`store-v2-categories ${key === "fruit" ? "fruit-v2-categories" : key === "snacks" ? "snack-v3-categories" : "flower-v3-categories"}`}>{current.categories.map((item, index) => <View className={category === item ? "active" : ""} key={item} onClick={() => setCategory(currentCategory => currentCategory === item ? "全部" : item)}><View style={key === "fruit" || key === "flowers" ? undefined : {background: index % 2 ? "#fff3db" : "#eef8f3"}}><Image className="store-category-icon" src={categoryIcons[index]}/></View><Text>{item}</Text></View>)}</View>
      {key === "snacks" && searchOpen && <View className="snack-v3-search"><Text>⌕</Text><Input value={query} focus onInput={event => setQuery(event.detail.value)} placeholder="搜索零食、饮料、泡面或日用品"/><Text onClick={() => {setQuery("");setCategory("全部");setSearchOpen(false)}}>收起</Text></View>}
      <View className={key === "fruit" ? "fruit-v2-section-title" : "v2-section-head"}><View><Text>{key === "snacks" ? (category === "全部" ? "宿舍补给" : category) : key === "flowers" ? (category === "全部" ? "今日花礼" : `${category}花礼`) : (category === "全部" ? "今日推荐" : category)}</Text>{key !== "fruit" && <Text>{key === "flowers" ? "价格与库存来自当前校区花店" : products.length ? "价格、库存与订单均来自当前校区后台" : "当前校区暂未营业，商品上架后会自动显示"}</Text>}</View>{key === "snacks" ? <View className="snack-section-actions"><Text onClick={() => setSearchOpen(value => !value)}>搜索</Text><Text>{visibleProducts.length} 件</Text></View> : <Text>{visibleProducts.length} 件</Text>}</View>
      <View className={`store-product-list ${key === "fruit" ? "fruit-v2-products" : key === "snacks" ? "snack-v3-products" : "flower-v3-products"}`}>{visibleProducts.map((product, productIndex) => <View className={`store-product ${key === "snacks" && productIndex === 0 ? "snack-featured-product" : ""}`} key={product.id}>
        <Image src={product.image || (key === "snacks" ? snackHero : current.hero)} mode="aspectFill"/>
        <View><Text>{product.title}</Text><Text>{product.sub}</Text>{key === "fruit" ? <><View className="fruit-product-truth"><Text>库存 {product.stock} 份</Text></View><Text className="fruit-product-time">履约时间下单后确认</Text></> : key === "flowers" ? <Text>预约时间下单后确认 · 库存 {product.stock}</Text> : <Text>库存 {product.stock}</Text>}</View>
        <View><Text>¥{moneyText(product.priceCents)}</Text><Image className={key === "fruit" ? "fruit-product-add" : "store-product-add"} src={key === "fruit" ? fruitAdd : key === "flowers" ? flowerIcon : snackIcon} onClick={() => addProduct(product)}/></View>
      </View>)}</View>
      {!loading && visibleProducts.length === 0 && (key === "flowers" ? <View className="v2-empty flower-v3-empty"><Image src={flowerIcon}/><Text>{displayProducts.length ? "没有找到符合条件的花礼" : "当前校区还没有上架真实花礼"}</Text><Text>{loadError || "运营后台发布后会自动显示，页面不会使用虚假花束或价格"}</Text>{loadError && <Button onClick={() => void load()}>重新加载</Button>}</View> : key === "fruit" ? <View className="v2-empty fruit-v3-empty"><Image src={fruitSeason} mode="aspectFit"/><View><Text>{displayProducts.length ? "没有找到符合条件的水果" : "当前校区还没有上架真实水果"}</Text><Text>{loadError || "运营后台发布后会自动显示，页面不会使用虚假商品、价格或配送时效"}</Text></View><Button onClick={() => void load()}>重新加载</Button></View> : <View className="v2-empty">{displayProducts.length ? "没有找到符合条件的商品" : "当前校区还没有上架真实商品，运营后台发布后会自动显示"}</View>)}
    </>}

    {tab === "结算" && <View className="store-panel">
      <View className="v2-section-head"><View><Text>{key === "flowers" ? "确认花礼" : "确认商品"}</Text><Text>订单提交后等待校区运营确认</Text></View><Text>{totalCount} 件</Text></View>
      <View className="v2-list">{cartItems.map(item => <View className="v2-card store-checkout-row" key={item.id}><View><Text className="v2-title">{item.title}</Text><Text className="v2-muted">¥{moneyText(item.priceCents)} × {item.quantity}</Text></View><View><Button onClick={() => changeQuantity(item, -1)}>−</Button><Text>{item.quantity}</Text><Button onClick={() => changeQuantity(item, 1)}>＋</Button></View></View>)}{cartItems.length === 0 && <View className="v2-empty">购物车还是空的</View>}</View>
      <View className="store-fulfillment"><Text className={fulfillmentType === "pickup" ? "active" : ""} onClick={() => setFulfillmentType("pickup")}>到店自取</Text><Text className={fulfillmentType === "delivery" ? "active" : ""} onClick={() => setFulfillmentType("delivery")}>校内送达</Text></View>
      {key === "flowers" && <View className="flower-v3-occasion"><View><Text>期望日期</Text><Picker mode="date" start={localDateText()} value={desiredDate} onChange={event => setDesiredDate(String(event.detail.value))}><Text>{desiredDate || "请选择"}</Text></Picker></View><View><Text>期望时间</Text><Picker mode="time" value={desiredTime} onChange={event => setDesiredTime(String(event.detail.value))}><Text>{desiredTime || "请选择"}</Text></Picker></View></View>}
      <View className="store-contact-fields"><Input value={contactName} maxlength={30} onInput={event => setContactName(event.detail.value)} placeholder={key === "flowers" ? (fulfillmentType === "delivery" ? "收花人称呼" : "取花人称呼") : "联系人"}/><Input type="number" value={contactPhone} maxlength={11} onInput={event => setContactPhone(event.detail.value)} placeholder={key === "flowers" ? "取花/收花联系电话" : "接单联系电话"}/>{fulfillmentType === "delivery" && <Input value={deliveryAddress} maxlength={120} onInput={event => setDeliveryAddress(event.detail.value)} placeholder="校内送达位置（楼栋/取货点）"/>}</View>
      {key === "flowers" && <Textarea className="flower-v3-message" value={giftMessage} maxlength={120} onInput={event => setGiftMessage(event.detail.value)} placeholder="花卡留言（选填），例如：毕业快乐，前程似锦"/>}
      <Textarea value={note} maxlength={300} onInput={event => setNote(event.detail.value)} placeholder={key === "flowers" ? "补充花材偏好、包装色或其他说明；不要填写身份证、学号等敏感信息" : "补充希望时间和其他说明；不要填写身份证、学号等敏感信息"}/>
      <View className="store-checkout-total"><Text>合计</Text><Text>¥{moneyText(totalCents)}</Text></View>
      <Button className="v2-cta" loading={submitting} disabled={!cartItems.length || submitting} onClick={submitOrder}>{key === "flowers" ? "确认鲜花预约" : "确认订单"}</Button>
    </View>}

    {tab === "订单" && <View className="store-panel">
      <View className="v2-section-head"><View><Text>我的订单</Text><Text>仅展示当前账号、当前校区记录</Text></View><Text>{orders.length} 单</Text></View>
      <View className="v2-list">{orders.map(order => <View className="v2-card" key={order.id}><View className="store-request-head"><Text className="v2-title">{order.order_no}</Text><Text>{orderStatus[order.status] || order.status}</Text></View><Text className="v2-muted">{order.items.map(item => `${item.name}×${item.quantity}`).join("、")}</Text>{key === "flowers" && order.desired_date && <Text className="v2-muted">期望：{order.desired_date}{order.desired_time ? ` ${order.desired_time}` : ""}</Text>}<Text className="v2-muted">{order.fulfillment_type === "delivery" ? `校内送达 · ${order.delivery_address || "待确认地址"}` : "到店自取"}{order.contact_phone_masked ? ` · ${order.contact_phone_masked}` : ""}</Text><Text className="v2-muted">合计 ¥{moneyText(order.total_amount_cents)} · {new Date(order.created_at).toLocaleString("zh-CN")}</Text>{key === "flowers" && order.gift_message && <Text className="v2-muted">花卡：{order.gift_message}</Text>}{order.note && <Text className="v2-muted">备注：{order.note}</Text>}{order.status === "payment_pending" && <Button className="v2-small-btn" onClick={() => payOrder(order)}>继续支付</Button>}{["payment_pending", "submitted"].includes(order.status) && <Button className="v2-small-btn" onClick={() => cancelOrder(order)}>取消订单</Button>}</View>)}{orders.length === 0 && <View className="v2-empty">还没有真实订单</View>}</View>
    </View>}

    {tab === "商品" && <View className={`store-cart ${key === "fruit" ? "fruit-v2-cart" : key === "flowers" ? "flower-v3-cart" : ""}`}><View><Image className="store-cart-icon" src={key === "fruit" ? fruitCart : key === "flowers" ? flowerIcon : snackIcon}/><View className="fruit-cart-copy"><Text>¥{moneyText(totalCents)}</Text><Text>{totalCount ? `已选 ${totalCount} 件` : "购物车为空"}</Text></View></View><Button onClick={() => setTab("结算")}>{key === "flowers" ? "确认预约" : "去结算"}</Button></View>}
    <ServiceDock labels={["首页", "结算", "订单"]} active={tab === "商品" ? 0 : tab === "结算" ? 1 : 2} onSelect={dock}/>
  </View>
}
