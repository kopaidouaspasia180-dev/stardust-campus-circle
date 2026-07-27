import {useState} from "react"
import {Button, Input, Text, Textarea, View} from "@tarojs/components"
import Taro, {useDidShow} from "@tarojs/taro"
import ServicePageHeader from "../../components/ServicePageHeader"
import {apiRequest, showApiError} from "../../api/client"
import "../service-shared.css"

type Errand = {id:number;title:string;description:string;pickup_place:string;delivery_place:string;reward:string;deadline:string;status:string;mine:boolean;accepted_by_me:boolean;creator_name:string}

export default function ErrandPage() {
  const [items,setItems]=useState<Errand[]>([])
  const [form,setForm]=useState({title:"",description:"",pickupPlace:"",deliveryPlace:"",reward:"5",deadline:"今天"})
  const [showForm,setShowForm]=useState(false)
  const load=()=>apiRequest<{items:Errand[]}>("/errands").then(r=>setItems(r.items)).catch(showApiError)
  useDidShow(load)
  const submit=async()=>{
    try{
      await apiRequest("/errands",{method:"POST",data:{...form,reward:Number(form.reward)}})
      setShowForm(false);setForm({title:"",description:"",pickupPlace:"",deliveryPlace:"",reward:"5",deadline:"今天"});load()
      Taro.showToast({title:"需求已发布",icon:"success"})
    }catch(e){showApiError(e)}
  }
  const action=async(item:Errand)=>{
    try{
      await apiRequest(`/errands/${item.id}/${item.status==="open"?"claim":"complete"}`,{method:"POST"})
      load()
    }catch(e){showApiError(e)}
  }
  return <View className="page service-page">
    <ServicePageHeader title="跑腿代取" subtitle="校内同学互助，完成后再确认"/>
    <View className="service-notice">请勿代购违禁品，不提前向陌生人转账；贵重物品建议本人领取。</View>
    <Button className="primary-action" onClick={()=>setShowForm(!showForm)}>{showForm?"收起发布":"＋ 发布跑腿需求"}</Button>
    {showForm&&<View className="form-card">
      <Input placeholder="需求标题，如：代取快递" value={form.title} onInput={e=>setForm({...form,title:e.detail.value})}/>
      <Textarea placeholder="物品、时间和注意事项" value={form.description} onInput={e=>setForm({...form,description:e.detail.value})}/>
      <Input placeholder="取件地点" value={form.pickupPlace} onInput={e=>setForm({...form,pickupPlace:e.detail.value})}/>
      <Input placeholder="送达地点" value={form.deliveryPlace} onInput={e=>setForm({...form,deliveryPlace:e.detail.value})}/>
      <Input type="digit" placeholder="酬金" value={form.reward} onInput={e=>setForm({...form,reward:e.detail.value})}/>
      <Input placeholder="截止时间" value={form.deadline} onInput={e=>setForm({...form,deadline:e.detail.value})}/>
      <Button className="primary-action" onClick={submit}>确认发布</Button>
    </View>}
    <View className="list-stack">{items.map(item=><View className="business-card" key={item.id}>
      <View className="row-between"><Text className="business-title">{item.title}</Text><Text className={`status status-${item.status}`}>{item.status==="open"?"待接单":item.status==="claimed"?"进行中":"已完成"}</Text></View>
      <Text className="business-desc">{item.description}</Text>
      <Text className="route">取：{item.pickup_place}　→　送：{item.delivery_place}</Text>
      <View className="row-between"><Text className="price">¥{item.reward}</Text><Text>{item.deadline}</Text></View>
      {((item.status==="open"&&!item.mine)||(item.status==="claimed"&&(item.mine||item.accepted_by_me)))&&<Button className="small-action" onClick={()=>action(item)}>{item.status==="open"?"我要接单":"确认完成"}</Button>}
    </View>)}</View>
  </View>
}
