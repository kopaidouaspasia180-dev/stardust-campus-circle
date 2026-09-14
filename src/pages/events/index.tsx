import {useMemo, useState} from "react"
import {Button, Image, Text, View} from "@tarojs/components"
import Taro, {useDidShow, usePullDownRefresh} from "@tarojs/taro"
import ServiceDock from "../../components/ServiceDock"
import ServiceMiniHeader from "../../components/ServiceMiniHeader"
import {apiRequest, requirePhoneLogin, showApiError} from "../../api/client"
import {demoContentEnabled} from "../../utils/demoContent"
import concert from "../../assets/services-real/event-concert.mini.webp"
import campusPhoto from "../../assets/campus/real/tangshan-pink-sky-fengchui.mini.webp"
import "../service-shared.css"
import "../service-visual-v2.css"
import "./index.css"

type EventItem={id:number;title:string;organizer:string;description:string;location:string;event_time:string;capacity:number;signup_count:number;signed:boolean;signup_status?:string;image_url?:string;demo?:boolean}
type EventScope="全部活动"|"可报名"|"我的报名"
type EventType="全部"|"社团"|"讲座"|"运动"|"志愿"

const demos:EventItem[]=[
  {id:-1,title:"校园音乐社开放体验",organizer:"大学生艺术中心",description:"乐队展示、社团招新与现场体验",location:"大学生活动中心",event_time:"2026-08-25T19:00:00+08:00",capacity:60,signup_count:24,signed:false,image_url:concert,demo:true},
  {id:-2,title:"AI 创想未来 · 青年分享会",organizer:"创新创业中心",description:"技术分享与学生项目交流",location:"A 座报告厅",event_time:"2026-08-26T14:00:00+08:00",capacity:80,signup_count:32,signed:false,image_url:campusPhoto,demo:true}
]

function categoryOf(item:EventItem):EventType {
  const content=`${item.title}${item.description}${item.organizer}`
  if(/志愿|公益|环保|支教/.test(content)) return "志愿"
  if(/篮球|足球|羽毛球|跑步|运动|比赛|健身/.test(content)) return "运动"
  if(/讲座|分享|论坛|宣讲|公开课|沙龙/.test(content)) return "讲座"
  return "社团"
}

function eventDate(item:EventItem){const date=new Date(item.event_time);return Number.isNaN(date.getTime())?null:date}
function formatDate(item:EventItem){const date=eventDate(item);return date?`${date.getMonth()+1}月${date.getDate()}日 ${String(date.getHours()).padStart(2,"0")}:${String(date.getMinutes()).padStart(2,"0")}`:item.event_time}
function seats(item:EventItem){return item.capacity>0?Math.max(item.capacity-item.signup_count,0):null}

export default function EventsPage(){
  const[items,setItems]=useState<EventItem[]>([])
  const[scope,setScope]=useState<EventScope>("全部活动")
  const[type,setType]=useState<EventType>("全部")
  const[dateKey,setDateKey]=useState("")
  const[selected,setSelected]=useState<EventItem|null>(null)
  const[loading,setLoading]=useState(true)

  const load=async()=>{setLoading(true);try{const result=await apiRequest<{items:EventItem[]}>("/events");setItems(result.items)}catch{setItems([])}finally{setLoading(false)}}
  useDidShow(()=>{void load()})
  usePullDownRefresh(()=>{void load().finally(()=>Taro.stopPullDownRefresh())})

  const signup=async(item:EventItem)=>{
    if(!await requirePhoneLogin("登录后才能报名校园活动并保存报名记录。"))return
    if(item.demo){Taro.showToast({title:"这是本地设计示例",icon:"none"});return}
    if(seats(item)===0){Taro.showToast({title:"报名已满",icon:"none"});return}
    const confirm=await Taro.showModal({title:"确认报名？",content:`${item.title}\n${formatDate(item)} · ${item.location}`,confirmText:"确认报名",confirmColor:"#f28b2d"})
    if(!confirm.confirm)return
    try{await apiRequest(`/events/${item.id}/signup`,{method:"POST"});setSelected(null);await load();Taro.showToast({title:"报名成功",icon:"success"})}catch(error){showApiError(error)}
  }

  const cancelSignup=async(item:EventItem)=>{const modal=await Taro.showModal({title:"取消活动报名？",content:"名额会释放给其他同学。",confirmText:"取消报名",confirmColor:"#d66655"});if(!modal.confirm)return;try{await apiRequest(`/events/${item.id}/cancel-signup`,{method:"POST"});setSelected(null);await load();Taro.showToast({title:"已取消",icon:"success"})}catch(error){showApiError(error)}}

  const dateRail=useMemo(()=>Array.from({length:7},(_,index)=>{const date=new Date();date.setHours(0,0,0,0);date.setDate(date.getDate()+index);return{key:`${date.getFullYear()}-${date.getMonth()+1}-${date.getDate()}`,day:index===0?"今天":["周日","周一","周二","周三","周四","周五","周六"][date.getDay()],date:String(date.getDate()).padStart(2,"0")}}),[])
  const baseItems=items.length?items:(demoContentEnabled()?demos:[])
  const filtered=useMemo(()=>baseItems.filter(item=>{
    const remaining=seats(item)
    if(scope==="可报名"&&(item.signed||remaining===0))return false
    if(scope==="我的报名"&&!item.signed)return false
    if(type!=="全部"&&categoryOf(item)!==type)return false
    if(dateKey){const date=eventDate(item);const key=date?`${date.getFullYear()}-${date.getMonth()+1}-${date.getDate()}`:"";if(key!==dateKey)return false}
    return true
  }),[baseItems,dateKey,scope,type])
  const featured=filtered[0]

  const dock=(index:number)=>{if(index===0)setScope("全部活动");if(index===1)setScope("我的报名");if(index===2){setScope("全部活动");setType("全部");setDateKey("")}}
  const reset=()=>{setScope("全部活动");setType("全部");setDateKey("")}

  return <View className="service-v2 theme-events">
    <ServiceMiniHeader title="校园活动" badge="唐山学院⌟"/>

    {featured?<View className="event-v2-feature" onClick={()=>setSelected(featured)}>
      <Image src={featured.image_url||concert} mode="aspectFill"/>
      <View className="event-v2-overlay"><Text>近期精选</Text><Text>{featured.title}</Text><Text>{formatDate(featured)}</Text><Text>{featured.location}</Text><Text>{seats(featured)===null?"不限名额":seats(featured)===0?"报名已满":`剩余 ${seats(featured)} 个名额`}</Text><Button onClick={event=>{event.stopPropagation();featured.signed?void cancelSignup(featured):void signup(featured)}}>{featured.signed?"取消报名":seats(featured)===0?"报名已满":"立即报名"}</Button></View>
    </View>:<View className="event-empty-hero"><Image src={concert} mode="aspectFill"/><View><Text>{loading?"正在同步活动…":"近期暂无公开活动"}</Text><Text>活动由当前校区运营审核后发布，下拉可刷新</Text></View></View>}

    <View className="event-date-rail">{dateRail.map(item=><View key={item.key} className={dateKey===item.key?"active":""} onClick={()=>setDateKey(dateKey===item.key?"":item.key)}><Text>{item.date}</Text><Text>{item.day}</Text></View>)}</View>
    <View className="event-type-row">{(["全部","社团","讲座","运动","志愿"] as EventType[]).map(item=><Text key={item} className={type===item?"active":""} onClick={()=>setType(item)}>{item}</Text>)}</View>
    <View className="v2-chip-row">{(["全部活动","可报名","我的报名"] as EventScope[]).map(item=><Text key={item} className={`v2-chip ${scope===item?"active":""}`} onClick={()=>setScope(item)}>{item}</Text>)}</View>

    <View className="v2-section-head event-section-head"><View><Text>{scope==="我的报名"?"我的行程":"活动列表"}</Text><Text>报名后记得按活动时间到场</Text></View><Text>{filtered.length} 场</Text></View>
    <View className="event-v2-list">{filtered.slice(featured?1:0).map(item=><View className="event-v2-row" key={item.id} onClick={()=>setSelected(item)}><Image src={item.image_url||campusPhoto} mode="aspectFill"/><View><Text>{item.title}</Text><Text>{formatDate(item)}</Text><Text>{item.location}</Text><Text>{seats(item)===null?"不限名额":seats(item)===0?"报名已满":`余 ${seats(item)} 个名额`}</Text></View><Button className={item.signed?"signed":""} onClick={event=>{event.stopPropagation();item.signed?void cancelSignup(item):void signup(item)}}>{item.signed?"已报名":seats(item)===0?"已满":"报名"}</Button></View>)}</View>

    {filtered.length<=1&&<View className="event-empty-list"><Text>{dateKey||type!=="全部"||scope!=="全部活动"?"当前筛选下没有更多活动":"当前没有更多已审核活动"}</Text><Text>可在校园圈关注社团通知，或稍后下拉刷新</Text>{(dateKey||type!=="全部"||scope!=="全部活动")&&<Button onClick={reset}>清除筛选</Button>}</View>}

    {selected&&<View className="event-detail-mask" onClick={()=>setSelected(null)}><View className="event-detail-sheet" onClick={event=>event.stopPropagation()}><View className="event-detail-grabber"/><Image src={selected.image_url||concert} mode="aspectFill"/><View className="event-detail-title"><View><Text>{selected.title}</Text><Text>{selected.organizer||"校区活动发布方"}</Text></View><Text>{categoryOf(selected)}</Text></View><View className="event-detail-info"><Text>时间</Text><Text>{formatDate(selected)}</Text><Text>地点</Text><Text>{selected.location}</Text><Text>名额</Text><Text>{seats(selected)===null?"不限":`已报 ${selected.signup_count} / ${selected.capacity}`}</Text></View><Text className="event-detail-desc">{selected.description||"发布方暂未填写更多说明。"}</Text><View className="event-detail-note"><Text>报名提醒</Text><Text>请核对时间与地点；无法到场时请及时取消，把名额留给其他同学。</Text></View><Button disabled={!selected.signed&&seats(selected)===0} onClick={()=>selected.signed?void cancelSignup(selected):void signup(selected)}>{selected.signed?"取消报名":seats(selected)===0?"报名已满":"确认报名"}</Button></View></View>}

    <ServiceDock labels={["发现","我的报名","活动日历"]} active={scope==="我的报名"?1:0} onSelect={dock}/>
  </View>
}
