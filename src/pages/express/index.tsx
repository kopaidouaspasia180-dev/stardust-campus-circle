import {useState} from "react"
import {Button, Input, Text, View} from "@tarojs/components"
import Taro, {useDidShow} from "@tarojs/taro"
import ServicePageHeader from "../../components/ServicePageHeader"
import {apiRequest, showApiError} from "../../api/client"
import "../service-shared.css"
type Package={id:number;carrier:string;tracking_no:string;pickup_code:string;station:string;status:string;created_at:string}
export default function ExpressPage(){
 const [items,setItems]=useState<Package[]>([]);const [form,setForm]=useState({carrier:"",trackingNo:"",pickupCode:"",station:""})
 const load=()=>apiRequest<{items:Package[]}>("/express/packages").then(r=>setItems(r.items)).catch(showApiError)
 useDidShow(load)
 const add=async()=>{try{await apiRequest("/express/packages",{method:"POST",data:form});setForm({carrier:"",trackingNo:"",pickupCode:"",station:""});load();Taro.showToast({title:"已添加",icon:"success"})}catch(e){showApiError(e)}}
 const picked=async(id:number)=>{try{await apiRequest(`/express/packages/${id}/picked`,{method:"PATCH"});load()}catch(e){showApiError(e)}}
 return <View className="page service-page"><ServicePageHeader title="快递动态" subtitle="集中记录取件码和驿站位置"/>
 <View className="service-notice">当前为个人快递清单，不会读取短信；物流状态需本人维护，避免上传完整手机号等敏感信息。</View>
 <View className="form-card"><Input placeholder="快递公司" value={form.carrier} onInput={e=>setForm({...form,carrier:e.detail.value})}/><Input placeholder="运单号" value={form.trackingNo} onInput={e=>setForm({...form,trackingNo:e.detail.value})}/><Input placeholder="取件码（可选）" value={form.pickupCode} onInput={e=>setForm({...form,pickupCode:e.detail.value})}/><Input placeholder="驿站/快递点" value={form.station} onInput={e=>setForm({...form,station:e.detail.value})}/><Button className="primary-action" onClick={add}>添加快递</Button></View>
 <View className="list-stack">{items.map(item=><View className="business-card" key={item.id}><View className="row-between"><Text className="business-title">{item.carrier}</Text><Text className={`status status-${item.status}`}>{item.status==="picked"?"已取件":"待取件"}</Text></View><Text className="business-desc">运单：{item.tracking_no}</Text><Text className="route">{item.station||"校内快递点"}　{item.pickup_code&&`取件码 ${item.pickup_code}`}</Text>{item.status!=="picked"&&<Button className="small-action" onClick={()=>picked(item.id)}>标记已取</Button>}</View>)}</View>
 </View>
}
