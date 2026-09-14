import {useMemo, useState} from "react"
import {Button, Image, Input, Picker, Text, Textarea, View} from "@tarojs/components"
import Taro, {useDidShow, useRouter} from "@tarojs/taro"
import ServiceDock from "../../components/ServiceDock"
import ServiceMiniHeader from "../../components/ServiceMiniHeader"
import {apiRequest, requirePhoneLogin, showApiError, uploadMedia} from "../../api/client"
import {demoContentEnabled} from "../../utils/demoContent"
import earbuds from "../../assets/services-real/market-earbuds.mini.webp"
import books from "../../assets/services-real/market-books.mini.webp"
import lamp from "../../assets/services-real/market-lamp.mini.webp"
import camera from "../../assets/services-real/market-camera.mini.webp"
import keyboard from "../../assets/services-real/market-keyboard.mini.webp"
import ebike from "../../assets/services-real/ebike-pexels.mini.webp"
import bikeIcon from "../../assets/icons/services/service-12.mini.webp"
import searchIcon from "../../assets/icons/services/service-08.mini.webp"
import "../service-shared.css"
import "../service-visual-v2.css"
import "./index.css"

type RegistrationStatus = "registered"|"unregistered"|"unknown"|""
type Listing = {
  id:string;title:string;description:string;category:string;price:string;image_url?:string;condition_label:string;
  author:string;favorite:boolean;mine:boolean;can_chat?:boolean;status:string;demo?:boolean;
  vehicle_brand?:string;vehicle_range_km?:number;battery_year?:number;registration_status?:RegistrationStatus;
  favorite_count?:number;view_count?:number;intent_status?:string
}
type TradeIntent = {id:string;listing_id:string;status:"requested"|"accepted"|"cancelled"|"completed";title:string;image_url?:string;price:string;condition_label:string;buyer_name:string;seller_name:string;buyer:boolean;seller:boolean}
type Appointment = {
  id:string;listing_id:string;requested_date:string;requested_slot:string;meeting_place:string;note:string;status:string;
  title:string;image_url?:string;price:string;vehicle_brand?:string;vehicle_range_km?:number;battery_year?:number;
  registration_status?:RegistrationStatus;buyer_name:string;seller_name:string;buyer:boolean;seller:boolean
}
type MarketForm = {title:string;description:string;category:string;price:string;conditionLabel:string;imageUrl:string;vehicleBrand:string;vehicleRangeKm:string;batteryYear:string;registrationStatus:RegistrationStatus}
const emptyForm:MarketForm = {title:"",description:"",category:"数码",price:"",conditionLabel:"正常使用",imageUrl:"",vehicleBrand:"",vehicleRangeKm:"",batteryYear:"",registrationStatus:""}
const emptyAppointment = {requestedDate:"",requestedSlot:"下午",meetingPlace:"",note:""}
const registrationLabel:Record<string,string>={registered:"已登记",unregistered:"未登记",unknown:"待核验","":"待核验"}
const statusLabel:Record<string,string>={requested:"待车主确认",confirmed:"已确认",cancelled:"已取消",completed:"已完成"}
const tradeStatusLabel:Record<string,string>={requested:"等待卖家确认",accepted:"已约定交易",cancelled:"已取消",completed:"交易完成"}
const localDate = (offset=0) => {
  const date=new Date();date.setDate(date.getDate()+offset)
  const year=date.getFullYear();const month=String(date.getMonth()+1).padStart(2,"0");const day=String(date.getDate()).padStart(2,"0")
  return `${year}-${month}-${day}`
}
const demos:Listing[]=[
  {id:"demo-earbuds",title:"AirPods Pro 二代",description:"自用保护很好，配件齐全",category:"数码",price:"850",image_url:earbuds,condition_label:"9成新",author:"大学道校区",favorite:false,mine:false,status:"active",demo:true},
  {id:"demo-books",title:"高数线代概率论教材全套",description:"笔记完整，适合期末复习",category:"教材",price:"40",image_url:books,condition_label:"8成新",author:"大学道校区",favorite:false,mine:false,status:"active",demo:true},
  {id:"demo-lamp",title:"米家台灯 Lite",description:"宿舍桌面照明，亮度可调",category:"生活",price:"60",image_url:lamp,condition_label:"9成新",author:"大学道校区",favorite:false,mine:false,status:"active",demo:true},
  {id:"demo-camera",title:"Canon 200D 单反相机",description:"含电池和背带，可当面试机",category:"数码",price:"2100",image_url:camera,condition_label:"8成新",author:"大学道校区",favorite:false,mine:false,status:"active",demo:true},
  {id:"demo-bag",title:"Lee 帆布包",description:"容量大，上课通勤合适",category:"生活",price:"25",image_url:books,condition_label:"良好",author:"华岩路校区",favorite:false,mine:false,status:"active",demo:true},
  {id:"demo-keyboard",title:"机械键盘 红轴",description:"87 键，支持有线连接",category:"数码",price:"120",image_url:keyboard,condition_label:"9成新",author:"大学道校区",favorite:false,mine:false,status:"active",demo:true}
]
const bikes:Listing[]=[
  {id:"demo-bike-1",title:"雅迪轻便电动车",description:"校园通勤使用，支持当面查看车况",category:"电动车",price:"1680",image_url:ebike,condition_label:"9成新",author:"大学道校区",favorite:false,mine:false,status:"active",demo:true,vehicle_brand:"雅迪",vehicle_range_km:45,battery_year:2025,registration_status:"registered"},
  {id:"demo-bike-2",title:"爱玛校园通勤车",description:"车辆功能正常，支持校内公共区域验车",category:"电动车",price:"1650",image_url:ebike,condition_label:"8成新",author:"华岩路校区",favorite:false,mine:false,status:"active",demo:true,vehicle_brand:"爱玛",vehicle_range_km:40,battery_year:2024,registration_status:"registered"}
]

export default function MarketPage() {
  const initialCategory = decodeURIComponent(String(useRouter().params.category || "推荐"))
  const [category,setCategory] = useState(initialCategory)
  const [items,setItems] = useState<Listing[]>([])
  const [historyItems,setHistoryItems] = useState<Listing[]>([])
  const [tradeIntents,setTradeIntents] = useState<TradeIntent[]>([])
  const [appointments,setAppointments] = useState<Appointment[]>([])
  const [form,setForm] = useState<MarketForm>(emptyForm)
  const [appointmentForm,setAppointmentForm] = useState(emptyAppointment)
  const [creating,setCreating] = useState(false)
  const [loading,setLoading] = useState(true)
  const [scope,setScope] = useState<"all"|"favorites"|"history"|"trades"|"mine">("all")
  const [bikeView,setBikeView] = useState<"list"|"appointments"|"mine">("list")
  const [query,setQuery] = useState("")
  const [priceSort,setPriceSort] = useState<"default"|"asc"|"desc">("default")
  const [rangeFilter,setRangeFilter] = useState<"all"|"40"|"50">("all")
  const [yearFilter,setYearFilter] = useState<"all"|"recent">("all")
  const [selected,setSelected] = useState<Listing|null>(null)
  const isBike = category === "电动车"

  const load = async () => {
    setLoading(true)
    try {
      const [listingResult,historyResult,tradeResult,appointmentResult]=await Promise.all([
        apiRequest<{items:Listing[]}>("/market/listings"),
        apiRequest<{items:Listing[]}>("/market/listings?scope=history").catch(()=>({items:[]})),
        apiRequest<{items:TradeIntent[]}>("/market/trade-intents").catch(()=>({items:[]})),
        isBike?apiRequest<{items:Appointment[]}>("/market/inspection-appointments").catch(()=>({items:[]})):Promise.resolve({items:[] as Appointment[]})
      ])
      setItems(listingResult.items);setHistoryItems(historyResult.items);setTradeIntents(tradeResult.items);setAppointments(appointmentResult.items)
    } catch { setItems([]) }
    finally { setLoading(false) }
  }
  useDidShow(load)
  const choose = async () => {
    try {
      const selectedImage = await Taro.chooseImage({count:1,sizeType:["compressed"],sourceType:["album","camera"]})
      if (selectedImage.tempFilePaths[0]) {
        const imageUrl = await uploadMedia(selectedImage.tempFilePaths[0])
        setForm(current => ({...current,imageUrl}))
      }
    } catch(error) { if (!String(error).includes("cancel")) showApiError(error) }
  }
  const submit = async () => {
    if (!await requirePhoneLogin("登录后才能发布闲置物品。")) return
    const price=Number(form.price)
    if(form.title.trim().length<2||form.description.trim().length<5){Taro.showToast({title:"请补充标题和物品描述",icon:"none"});return}
    if(!Number.isFinite(price)||price<=0){Taro.showToast({title:"请填写有效价格",icon:"none"});return}
    if(!form.imageUrl){Taro.showToast({title:"请添加一张实物图片",icon:"none"});return}
    if(isBike&&(!form.vehicleBrand||!form.vehicleRangeKm||!form.batteryYear||!form.registrationStatus)){Taro.showToast({title:"请补全车辆资料",icon:"none"});return}
    try {
      await apiRequest("/market/listings",{method:"POST",data:{...form,title:form.title.trim(),description:form.description.trim(),category:isBike?"电动车":form.category,price,vehicleRangeKm:Number(form.vehicleRangeKm),batteryYear:Number(form.batteryYear)}})
      setForm(emptyForm);setCreating(false);setBikeView("mine");Taro.showToast({title:"已提交审核",icon:"success"});await load()
    } catch(error) { showApiError(error) }
  }
  const favorite = async (id:string) => {
    if(id.startsWith("demo-")){Taro.showToast({title:"示例商品不可收藏",icon:"none"});return}
    try { await apiRequest(`/market/listings/${id}/favorite`,{method:"POST"});await load() } catch(error) { showApiError(error) }
  }
  const openDetail = (item:Listing) => {
    setSelected(item)
    if(!item.demo) void apiRequest(`/market/listings/${item.id}/view`,{method:"POST"}).catch(()=>undefined)
  }
  const requestTrade = async (item:Listing) => {
    if(item.demo){Taro.showToast({title:"示例商品暂无真实卖家",icon:"none"});return}
    const confirmed=await Taro.showModal({title:"确认想要这件商品？",content:"提交后可继续和卖家沟通，卖家确认后会为你保留。请当面验货，不提前转账。",confirmText:"我想要"})
    if(!confirmed.confirm)return
    try{await apiRequest(`/market/listings/${item.id}/trade-intents`,{method:"POST"});Taro.showToast({title:"已通知卖家",icon:"success"});setSelected(null);setScope("trades");await load()}catch(error){showApiError(error)}
  }
  const updateTrade = async (item:TradeIntent,status:"accepted"|"cancelled"|"completed") => {
    const content=status==="accepted"?"确认后商品会为该同学保留。":status==="completed"?"请确认已完成当面验货和交接。":"取消后如有保留，商品会重新上架。"
    const confirmed=await Taro.showModal({title:tradeStatusLabel[status],content,confirmText:"确认"})
    if(!confirmed.confirm)return
    try{await apiRequest(`/market/trade-intents/${item.id}`,{method:"PATCH",data:{status}});await load()}catch(error){showApiError(error)}
  }
  const updateStatus = async (item:Listing) => {
    const next = item.status === "active" ? "sold" : "active"
    const result = await Taro.showModal({title:next==="sold"?"标记已交易":"重新上架",content:next==="sold"?"确认完成当面交易后再标记。":"商品会重新出现在本校列表。",confirmText:next==="sold"?"确认标记":"重新上架"})
    if (!result.confirm) return
    try { await apiRequest(`/market/listings/${item.id}/status`,{method:"PATCH",data:{status:next}});setSelected(null);await load() } catch(error) { showApiError(error) }
  }
  const startChat = async (item:Listing) => {
    if (!await requirePhoneLogin("登录后才能和发布者聊天。")) return
    if(item.demo){Taro.showToast({title:"示例车源暂无真实发布者",icon:"none"});return}
    try{
      const result=await apiRequest<{item:{id:string}}>("/conversations",{method:"POST",data:{resourceType:"market_listing",resourceId:item.id}})
      Taro.navigateTo({url:`/pages/chat/index?id=${encodeURIComponent(result.item.id)}`})
    }catch(error){showApiError(error)}
  }
  const showEbikeContact = async () => {
    try{
      const result=await apiRequest<{contact:{wechat:string;note:string}}>("/campus/contact?purpose=ebike")
      const modal=await Taro.showModal({title:"联系校区运营",content:`${result.contact.wechat}\n\n${result.contact.note}`,confirmText:"复制微信号"})
      if(modal.confirm)await Taro.setClipboardData({data:result.contact.wechat})
    }catch{Taro.showToast({title:"当前校区暂未开放运营咨询",icon:"none"})}
  }
  const requestInspection = async () => {
    if(!selected)return
    if(selected.demo){Taro.showToast({title:"示例车源不能发起预约",icon:"none"});return}
    if(!appointmentForm.requestedDate||appointmentForm.meetingPlace.trim().length<4){Taro.showToast({title:"请选择日期并填写验车地点",icon:"none"});return}
    try{
      await apiRequest(`/market/listings/${selected.id}/inspection-appointments`,{method:"POST",data:appointmentForm})
      Taro.showToast({title:"预约已发送",icon:"success"});setSelected(null);setAppointmentForm(emptyAppointment);setBikeView("appointments");await load()
    }catch(error){showApiError(error)}
  }
  const updateAppointment = async (item:Appointment,status:"confirmed"|"cancelled"|"completed") => {
    try{await apiRequest(`/market/inspection-appointments/${item.id}`,{method:"PATCH",data:{status}});await load()}catch(error){showApiError(error)}
  }
  const filtered = useMemo(() => items.filter(item => {
    const categoryMatch = category === "推荐" || item.category.includes(category)
    const scopeMatch = scope === "all" || scope === "history" || scope === "trades" || (scope === "favorites" ? item.favorite : item.mine)
    const keyword=`${item.title}${item.description}${item.category}`.toLowerCase()
    const bikeScopeMatch=!isBike||bikeView!=="mine"||item.mine
    const rangeMatch=!isBike||rangeFilter==="all"||Number(item.vehicle_range_km||0)>=(rangeFilter==="50"?50:40)
    const yearMatch=!isBike||yearFilter==="all"||Number(item.battery_year||0)>=new Date().getFullYear()-1
    return categoryMatch && scopeMatch && bikeScopeMatch && rangeMatch && yearMatch && keyword.includes(query.trim().toLowerCase()) && (scope === "mine" || item.status === "active")
  }).sort((a,b)=>priceSort==="asc"?Number(a.price)-Number(b.price):priceSort==="desc"?Number(b.price)-Number(a.price):0), [bikeView,category,isBike,items,priceSort,query,rangeFilter,scope,yearFilter])
  const demoItems = demoContentEnabled() ? (isBike ? bikes : demos.filter(item=>category==="推荐"||item.category===category)).filter(item=>`${item.title}${item.description}${item.category}`.toLowerCase().includes(query.trim().toLowerCase())).sort((a,b)=>priceSort==="asc"?Number(a.price)-Number(b.price):priceSort==="desc"?Number(b.price)-Number(a.price):0) : []
  const scopedItems=scope==="history"?historyItems:filtered
  const visibleItems = scopedItems.length ? scopedItems : (items.length || scope==="history" || scope==="trades" ? [] : demoItems)
  const bikeItems=visibleItems.filter(item=>item.category==="电动车")
  const dock = (index:number) => {
    if(isBike){setCreating(false);setSelected(null);setBikeView(index===0?"list":index===1?"appointments":"mine");setScope(index===2?"mine":"all");return}
    if(index===0){setScope("all");setCreating(false)}
    if(index===1)setCreating(true)
    if(index===2){setScope("mine");setCreating(false)}
  }
  const openPublish = async () => {if(!await requirePhoneLogin("登录后才能发布闲置物品。"))return;setSelected(null);setCreating(true);setScope("all");Taro.pageScrollTo({scrollTop:0,duration:240})}
  const emptyMode = query.trim() ? "search" : scope === "favorites" ? "favorites" : scope==="history"?"history":"publish"
  const handleEmptyAction = () => {if(emptyMode==="search")return setQuery("");if(emptyMode==="favorites")return setScope("all");openPublish()}

  return <View className={`service-v2 theme-market${isBike?" theme-ebike":" theme-secondhand"}`}>
    <ServiceMiniHeader title={isBike?"二手电动车":"二手闲置"} badge={isBike?"✓ 仅看本校":"只看本校⌄"}/>
    {!isBike&&!creating&&<>
      <View className="market-hero">
        <View className="market-hero-copy"><Text>CAMPUS MARKET</Text><Text>让好东西，{`\n`}在同校继续被使用</Text><Text>真实闲置 · 当面验货 · 校内沟通</Text><Button onClick={openPublish}>发布我的闲置</Button></View>
        <View className="market-hero-visual"><Image src={camera} mode="aspectFill"/><Image src={books} mode="aspectFill"/><Text>本校同学发布</Text></View>
      </View>
      <View className="market-trust-row"><View><Text>本校可见</Text><Text>校区数据独立</Text></View><View><Text>实拍优先</Text><Text>真实物品信息</Text></View><View><Text>当面交易</Text><Text>验货后再决定</Text></View></View>
      <View className="v2-search market-search"><Image className="v2-search-icon" src={searchIcon}/><Input value={query} onInput={event=>setQuery(event.detail.value)} placeholder="搜索数码、教材、宿舍好物"/>{query&&<Text onClick={()=>setQuery("")}>清除</Text>}</View>
      <View className="market-categories">{["推荐","数码","教材","生活"].map(item=><Text key={item} className={category===item?"active":""} onClick={()=>setCategory(item)}>{item}</Text>)}</View>
      <View className="market-record-tabs">{[["all","最新"],["favorites","收藏"],["history","足迹"],["trades","交易"]].map(([value,label])=><Text key={value} className={scope===value?"active":""} onClick={()=>setScope(value as typeof scope)}>{label}</Text>)}</View>
      {scope!=="trades"&&<View className="market-v2-head"><View><Text>{scope==="favorites"?"我的收藏":scope==="history"?"最近看过":scope==="mine"?"我的发布":"同校好物"}</Text><Text>{query?`找到 ${visibleItems.length} 件相关物品`:`${visibleItems.length} 件本校闲置`}</Text></View><View className="market-toggle"><Text className={priceSort==="default"?"active":""} onClick={()=>setPriceSort("default")}>综合</Text><Text className={priceSort!=="default"?"active":""} onClick={()=>setPriceSort(priceSort==="asc"?"desc":"asc")}>价格 {priceSort==="asc"?"↑":priceSort==="desc"?"↓":""}</Text></View></View>}
      {loading&&scope!=="trades"&&items.length===0&&<View className="market-v2-grid market-skeleton-grid">{[0,1,2,3].map(item=><View className="market-skeleton-card" key={item}><View/><View/><View/><View/></View>)}</View>}
      {!loading&&scope!=="trades"&&<View className="market-v2-grid">{visibleItems.map(item=><View className="market-v2-card" key={item.id}><View className="market-v2-photo" onClick={()=>openDetail(item)}><Image src={item.image_url||earbuds} mode="aspectFill"/><Text>{item.condition_label}</Text>{item.status!=="active"&&<Text className="market-status-badge">{item.status==="sold"?"已交易":"已保留"}</Text>}</View><View className="market-v2-card-body"><Text className="market-v2-title" onClick={()=>openDetail(item)}>{item.title}</Text><View className="market-v2-price-row"><Text>¥</Text><Text>{item.price}</Text></View><Text className="market-v2-description">{item.description}</Text><View className="market-v2-meta"><Text>{item.author}</Text><Text>{item.view_count||0} 次查看</Text></View><View className="market-v2-foot"><Text onClick={()=>openDetail(item)}>查看详情</Text><View className="market-v2-actions">{item.mine?<Text onClick={()=>updateStatus(item)}>管理</Text>:<><Text onClick={()=>favorite(item.id)}>{item.favorite?"已收藏":"收藏"}</Text><Text onClick={()=>startChat(item)}>私信</Text></>}</View></View></View></View>)}</View>}
      {scope==="trades"&&<View className="market-trade-list">{tradeIntents.map(item=><View className="market-trade-card" key={item.id}><Image src={item.image_url||earbuds} mode="aspectFill"/><View><View><Text>{item.title}</Text><Text>¥{item.price}</Text></View><Text>{item.buyer?`卖家：${item.seller_name}`:`买家：${item.buyer_name}`}</Text><Text className={`trade-status ${item.status}`}>{tradeStatusLabel[item.status]}</Text><View>{item.seller&&item.status==="requested"&&<Button onClick={()=>updateTrade(item,"accepted")}>确认保留</Button>}{item.seller&&item.status==="accepted"&&<Button onClick={()=>updateTrade(item,"completed")}>已完成交易</Button>}{["requested","accepted"].includes(item.status)&&<Button className="secondary" onClick={()=>updateTrade(item,"cancelled")}>取消</Button>}</View></View></View>)}</View>}
      {!loading&&scope!=="trades"&&visibleItems.length===0&&<View className="market-empty"><Image src={books} mode="aspectFill"/><View><Text>{emptyMode==="search"?"没有找到相关好物":emptyMode==="favorites"?"还没有收藏的好物":emptyMode==="history"?"还没有浏览记录":"让闲置在校内重新流动"}</Text><Text>{emptyMode==="history"?"打开商品详情后会自动保存足迹":"看到喜欢的物品，可以先收藏，再和卖家当面沟通"}</Text></View><Button onClick={handleEmptyAction}>{emptyMode==="search"?"清除搜索":emptyMode==="favorites"||emptyMode==="history"?"去看最新发布":"发布第一件闲置"}</Button></View>}
      {!loading&&scope==="trades"&&tradeIntents.length===0&&<View className="market-empty"><Image src={books} mode="aspectFill"/><View><Text>还没有交易记录</Text><Text>在商品详情点“我想要”，卖家确认后即可约定当面交易</Text></View><Button onClick={()=>setScope("all")}>去看好物</Button></View>}
    </>}

    {isBike&&!creating&&bikeView==="list"&&<>
      {bikeItems.length>0?<>
        <View className="ebike-feature"><Image src={bikeItems[0].image_url||ebike} mode="aspectFill"/><View className="ebike-feature-panel"><Text className="ebike-feature-tag">本校车源</Text><Text className="ebike-feature-price">¥{bikeItems[0].price}</Text><View className="ebike-spec"><Text>续航</Text><Text>{bikeItems[0].vehicle_range_km||"待核验"}{bikeItems[0].vehicle_range_km?"km":""}</Text></View><View className="ebike-spec"><Text>电池</Text><Text>{bikeItems[0].battery_year||"待核验"}{bikeItems[0].battery_year?"年":""}</Text></View><View className="ebike-spec"><Text>登记</Text><Text>{registrationLabel[bikeItems[0].registration_status||""]}</Text></View><Button onClick={()=>openDetail(bikeItems[0])}>预约验车</Button></View></View>
        <View className="ebike-filter"><Text onClick={()=>setPriceSort(priceSort==="asc"?"desc":"asc")}>价格 {priceSort==="asc"?"↑":priceSort==="desc"?"↓":"⌄"}</Text><Text className={rangeFilter!=="all"?"active":""} onClick={()=>setRangeFilter(rangeFilter==="all"?"40":rangeFilter==="40"?"50":"all")}>续航 {rangeFilter==="all"?"⌄":`${rangeFilter}km+`}</Text><Text className={yearFilter!=="all"?"active":""} onClick={()=>setYearFilter(yearFilter==="all"?"recent":"all")}>车龄 {yearFilter==="all"?"⌄":"近1年"}</Text><Text>本校</Text></View>
        <View className="ebike-list">{bikeItems.slice(1).map(item=><View className="ebike-list-card" key={item.id} onClick={()=>setSelected(item)}><Image src={item.image_url||ebike} mode="aspectFill"/><View><Text className="ebike-list-title">{item.title}</Text><Text className="ebike-list-price">¥{item.price}</Text><View className="ebike-pills"><Text>续航 {item.vehicle_range_km||"待核验"}{item.vehicle_range_km?"km":""}</Text><Text>电池 {item.battery_year||"待核验"}</Text><Text>{registrationLabel[item.registration_status||""]}</Text></View><Button>预约验车</Button></View></View>)}</View>
      </>:!loading&&<View className="ebike-empty"><Image src={ebike} mode="aspectFill"/><View className="ebike-empty-overlay"><Image src={bikeIcon}/><Text>本校二手电动车</Text><Text>真实车源审核后展示，预约后在校内公共区域当面验车</Text><Button onClick={openPublish}>发布第一辆车</Button></View></View>}
      <View className="ebike-safety-grid"><View><Text>验车清单</Text><Text>车架与外观</Text><Text>电池与续航</Text><Text>刹车与灯光</Text><Text>证件与登记</Text></View><View><Text>不提前转账</Text><Text>线下见面验车</Text><Text>确认车况再交易</Text><Text>平台不代收款</Text></View></View>
      <Button className="ebike-publish-fab" onClick={openPublish}>＋ 发布车源</Button>
    </>}
    {isBike&&!creating&&bikeView==="appointments"&&<View className="ebike-appointments"><View className="ebike-section-head"><View><Text>验车预约</Text><Text>买卖双方确认后，按约定时间在校内见面</Text></View></View>{appointments.length?appointments.map(item=><View className="ebike-appointment-card" key={item.id}><View className="ebike-appointment-top"><Image src={item.image_url||ebike} mode="aspectFill"/><View><Text>{item.title}</Text><Text>{item.requested_date.slice(0,10)} · {item.requested_slot}</Text><Text>{item.meeting_place}</Text></View><Text className={`status-${item.status}`}>{statusLabel[item.status]||item.status}</Text></View><Text className="ebike-appointment-person">{item.buyer?`车主：${item.seller_name}`:`预约同学：${item.buyer_name}`}</Text>{item.note&&<Text className="ebike-appointment-note">备注：{item.note}</Text>}<View className="ebike-appointment-actions">{item.seller&&item.status==="requested"&&<Button onClick={()=>updateAppointment(item,"confirmed")}>确认预约</Button>}{item.seller&&item.status==="confirmed"&&<Button onClick={()=>updateAppointment(item,"completed")}>完成验车</Button>}{["requested","confirmed"].includes(item.status)&&<Button className="secondary" onClick={()=>updateAppointment(item,"cancelled")}>取消</Button>}</View></View>):<View className="ebike-appointment-empty"><Image src={bikeIcon}/><Text>还没有验车预约</Text><Text>在车源详情中选择日期、时段和校内见面地点即可发起。</Text><Button onClick={()=>setBikeView("list")}>去看本校车源</Button></View>}</View>}
    {isBike&&!creating&&bikeView==="mine"&&<View className="ebike-mine"><View className="ebike-section-head"><View><Text>我的车源</Text><Text>查看审核状态，交易完成后及时标记</Text></View><Button onClick={openPublish}>发布车源</Button></View>{bikeItems.length?bikeItems.map(item=><View className="ebike-list-card" key={item.id}><Image src={item.image_url||ebike} mode="aspectFill"/><View><Text className="ebike-list-title">{item.title}</Text><Text className="ebike-list-price">¥{item.price}</Text><Text className="ebike-mine-status">{item.status==="pending"?"审核中":item.status==="active"?"展示中":item.status==="sold"?"已交易":item.status}</Text><Button onClick={()=>updateStatus(item)}>{item.status==="active"?"标记已交易":"重新上架"}</Button></View></View>):<View className="ebike-appointment-empty"><Image src={bikeIcon}/><Text>还没有发布车源</Text><Text>上传真实车辆照片和资料，审核通过后仅当前校区可见。</Text><Button onClick={openPublish}>发布车源</Button></View>}</View>}

    {creating&&<View className="market-publish-card"><View className="market-publish-head"><View><Text>{isBike?"发布电动车":"发布闲置"}</Text><Text>实拍、如实描述，审核通过后仅本校可见</Text></View><Text onClick={()=>setCreating(false)}>收起</Text></View>
      {isBike&&<View className="market-field"><Text>车辆品牌</Text><Input maxlength={40} value={form.vehicleBrand} onInput={e=>setForm({...form,vehicleBrand:e.detail.value})} placeholder="例如：雅迪、爱玛、小牛"/></View>}
      <View className="market-field"><Text>物品标题</Text><Input maxlength={50} value={form.title} onInput={e=>setForm({...form,title:e.detail.value})} placeholder={isBike?"例如：雅迪校园通勤电动车":"例如：高数教材全套"}/></View>
      {!isBike&&<View className="market-field"><Text>分类</Text><View className="market-option-row">{["数码","教材","生活","其他"].map(value=><Text key={value} className={form.category===value?"active":""} onClick={()=>setForm({...form,category:value})}>{value}</Text>)}</View></View>}
      <View className="market-field"><Text>成色</Text><View className="market-option-row">{["全新","9成新","8成新","正常使用"].map(value=><Text key={value} className={form.conditionLabel===value?"active":""} onClick={()=>setForm({...form,conditionLabel:value})}>{value}</Text>)}</View></View>
      {isBike&&<><View className="ebike-form-grid"><View className="market-field"><Text>实际续航（km）</Text><Input maxlength={3} type="number" value={form.vehicleRangeKm} onInput={e=>setForm({...form,vehicleRangeKm:e.detail.value})} placeholder="如 45"/></View><View className="market-field"><Text>电池年份</Text><Input maxlength={4} type="number" value={form.batteryYear} onInput={e=>setForm({...form,batteryYear:e.detail.value})} placeholder={String(new Date().getFullYear())}/></View></View><View className="market-field"><Text>登记情况</Text><View className="market-option-row">{[["registered","已登记"],["unregistered","未登记"],["unknown","不确定"]].map(([value,label])=><Text key={value} className={form.registrationStatus===value?"active":""} onClick={()=>setForm({...form,registrationStatus:value as RegistrationStatus})}>{label}</Text>)}</View></View></>}
      <View className="market-field"><Text>价格</Text><View className="market-price-input"><Text>¥</Text><Input maxlength={8} value={form.price} type="digit" onInput={e=>setForm({...form,price:e.detail.value})} placeholder="填写期望价格"/></View></View>
      <View className="market-field"><Text>物品描述</Text><Textarea maxlength={300} value={form.description} onInput={e=>setForm({...form,description:e.detail.value})} placeholder={isBike?"说明购入时间、维修情况、配件、实际车况和方便验车的位置":"描述使用情况、配件和方便当面交易的位置"}/></View>
      <View className="market-field"><Text>实物图片</Text><Text className="market-field-hint">请上传你本人拍摄的清晰照片</Text><Button className="market-upload" onClick={choose}>{form.imageUrl?"重新选择":"添加实拍图"}</Button></View>{form.imageUrl&&<Image className="market-preview" src={form.imageUrl} mode="aspectFill"/>}
      <View className="market-publish-safety"><Text>交易提醒</Text><Text>仅在校内公共区域当面验货，不提前转账，不发布联系方式或收款码。</Text></View><Button className="market-submit" onClick={submit}>提交审核</Button>
    </View>}
    {loading&&items.length===0&&<Text className="market-loading-note">正在同步本校真实数据…</Text>}
    <ServiceDock labels={isBike?["车源","预约","我的"]:["首页","发布","我的"]} active={isBike?(bikeView==="appointments"?1:bikeView==="mine"?2:0):(scope==="mine"?2:creating?1:0)} onSelect={dock}/>

    {selected&&<View className="market-detail-mask" onClick={()=>setSelected(null)}><View className={`market-detail-sheet${isBike?" ebike-detail-sheet":""}`} onClick={event=>event.stopPropagation()}><View className="market-detail-handle"/><Image className="market-detail-image" src={selected.image_url||earbuds} mode="aspectFill"/><View className="market-detail-heading"><View><Text>{selected.title}</Text><Text>{selected.condition_label} · {selected.author}</Text></View><Text>¥{selected.price}</Text></View><Text className="market-detail-description">{selected.description}</Text>
      {isBike&&<><View className="ebike-detail-specs"><View><Text>实际续航</Text><Text>{selected.vehicle_range_km||"待核验"}{selected.vehicle_range_km?"km":""}</Text></View><View><Text>电池年份</Text><Text>{selected.battery_year||"待核验"}</Text></View><View><Text>登记情况</Text><Text>{registrationLabel[selected.registration_status||""]}</Text></View></View>{!selected.mine&&<View className="ebike-booking-form"><Text>预约校内验车</Text><View className="ebike-booking-grid"><Picker mode="date" start={localDate(1)} end={localDate(30)} value={appointmentForm.requestedDate} onChange={event=>setAppointmentForm({...appointmentForm,requestedDate:String(event.detail.value)})}><Text>{appointmentForm.requestedDate||"选择日期"}</Text></Picker><View className="market-option-row">{["上午","下午","晚上"].map(value=><Text key={value} className={appointmentForm.requestedSlot===value?"active":""} onClick={()=>setAppointmentForm({...appointmentForm,requestedSlot:value})}>{value}</Text>)}</View></View><Input maxlength={80} value={appointmentForm.meetingPlace} onInput={event=>setAppointmentForm({...appointmentForm,meetingPlace:event.detail.value})} placeholder="校内验车地点，如图书馆东门"/><Textarea maxlength={200} value={appointmentForm.note} onInput={event=>setAppointmentForm({...appointmentForm,note:event.detail.value})} placeholder="选填：希望重点检查的项目"/><Button onClick={requestInspection}>发送验车预约</Button></View>}</>}
      <View className="market-detail-safety"><Text>当面验货</Text><Text>在校内公共区域见面，核对物品状况后再决定交易；平台不代收款。</Text></View><View className="market-detail-actions">{selected.mine?<Button className="primary full" onClick={()=>updateStatus(selected)}>管理商品</Button>:<><Button className="secondary" onClick={()=>favorite(selected.id)}>{selected.favorite?"已收藏":"收藏"}</Button><Button className="secondary" onClick={()=>startChat(selected)}>先聊聊</Button>{!isBike&&<Button className="primary" disabled={["requested","accepted"].includes(selected.intent_status||"")} onClick={()=>requestTrade(selected)}>{selected.intent_status==="accepted"?"卖家已保留":selected.intent_status==="requested"?"等待卖家":"我想要"}</Button>}</>}</View>{isBike&&<Text className="ebike-operator-link" onClick={showEbikeContact}>联系校区运营咨询</Text>}<Text className="market-detail-close" onClick={()=>setSelected(null)}>关闭</Text></View></View>}
  </View>
}
