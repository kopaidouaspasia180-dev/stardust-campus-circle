import {useState} from "react"
import {Button, Input, Text, View} from "@tarojs/components"
import Taro, {useDidShow} from "@tarojs/taro"
import ServicePageHeader from "../../components/ServicePageHeader"
import {apiRequest,showApiError} from "../../api/client"
import "../service-shared.css"
type Job={id:number;title:string;organization:string;description:string;pay_label:string;location:string;deadline:string;verified:boolean;applied:boolean}
export default function JobsPage(){const[items,setItems]=useState<Job[]>([]);const[message,setMessage]=useState<Record<number,string>>({})
 const load=()=>apiRequest<{items:Job[]}>("/jobs").then(r=>setItems(r.items)).catch(showApiError);useDidShow(load)
 const apply=async(id:number)=>{try{await apiRequest(`/jobs/${id}/apply`,{method:"POST",data:{message:message[id]||"我有意向参与，请联系我进一步确认。"}});Taro.showToast({title:"意向已提交",icon:"success"});load()}catch(e){showApiError(e)}}
 return <View className="page service-page"><ServicePageHeader title="兼职信息" subtitle="仅展示经运营方核验的信息"/><View className="service-notice">不收押金、不垫资、不出租银行卡或账号。凡承诺高薪、要求先付款的兼职请立即停止联系。</View><View className="list-stack">{items.map(j=><View className="business-card" key={j.id}><View className="row-between"><Text className="business-title">{j.title}</Text><Text className="verified">{j.verified?"已核验":"待核验"}</Text></View><Text className="business-desc">{j.organization} · {j.location}</Text><Text className="business-desc">{j.description}</Text><View className="row-between"><Text className="price">{j.pay_label}</Text><Text>截止 {j.deadline}</Text></View><Input placeholder="填写一句意向说明" value={message[j.id]||""} onInput={e=>setMessage({...message,[j.id]:e.detail.value})}/><Button className="small-action" disabled={j.applied} onClick={()=>apply(j.id)}>{j.applied?"已提交意向":"提交意向"}</Button></View>)}</View></View>}
