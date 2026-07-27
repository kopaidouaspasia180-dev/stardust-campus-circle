import {useState} from "react"
import {Button, Image, Text, View} from "@tarojs/components"
import Taro, {useDidShow} from "@tarojs/taro"
import ServicePageHeader from "../../components/ServicePageHeader"
import {apiRequest,showApiError} from "../../api/client"
import "../service-shared.css"
type Event={id:number;title:string;organizer:string;description:string;location:string;event_time:string;capacity:number;signup_count:number;signed:boolean;image_url?:string}
export default function EventsPage(){const[items,setItems]=useState<Event[]>([]);const load=()=>apiRequest<{items:Event[]}>("/events").then(r=>setItems(r.items)).catch(showApiError);useDidShow(load)
 const signup=async(id:number)=>{try{await apiRequest(`/events/${id}/signup`,{method:"POST"});Taro.showToast({title:"报名成功",icon:"success"});load()}catch(e){showApiError(e)}}
 return <View className="page service-page"><ServicePageHeader title="校园活动" subtitle="社团、比赛、讲座与同学活动"/><View className="list-stack">{items.map(e=><View className="business-card" key={e.id}>{e.image_url&&<Image className="event-cover" src={e.image_url} mode="aspectFill"/>}<Text className="business-title">{e.title}</Text><Text className="business-desc">{e.organizer} · {e.location}</Text><Text className="business-desc">{e.description}</Text><View className="row-between"><Text>{e.event_time}</Text><Text>{e.signup_count}/{e.capacity||"不限"} 人</Text></View><Button className="small-action" disabled={e.signed} onClick={()=>signup(e.id)}>{e.signed?"已报名":"立即报名"}</Button></View>)}</View></View>}
