import {Button,Input,Text,Textarea,View} from "@tarojs/components"
import Taro,{useDidShow,useRouter} from "@tarojs/taro"
import {useState} from "react"
import ServicePageHeader from "../../components/ServicePageHeader"
import {apiRequest,showApiError} from "../../api/client"
import "../service-shared.css"
const data:Record<string,{title:string;items:string[]}>={flowers:{title:"校园花店",items:["生日花束","毕业花束","单支鲜花","贺卡与包装"]},fruit:{title:"校园水果店",items:["当季水果","宿舍拼盘","整箱团购","自提与配送"]},snacks:{title:"校园零食店",items:["饮料乳品","休闲零食","泡面速食","宿舍日用"]},life:{title:"生活服务",items:["理发造型","药店购药","洗浴足疗","手机电脑维修"]}}
type RequestItem={id:string;title:string;detail:string;status:string;mine:boolean}
export default function CampusStorePage(){const key=String(useRouter().params.type||"life");const current=data[key]||data.life;const[items,setItems]=useState<RequestItem[]>([]);const[title,setTitle]=useState("");const[detail,setDetail]=useState("")
 const load=()=>apiRequest<{items:RequestItem[]}>(`/service/requests?type=${key}`).then(r=>setItems(r.items)).catch(showApiError);useDidShow(load)
 const submit=async()=>{try{await apiRequest("/service/requests",{method:"POST",data:{serviceType:key,title,detail}});setTitle("");setDetail("");Taro.showToast({title:"需求已提交",icon:"success"});load()}catch(e){showApiError(e)}}
 return <View className="page service-page"><ServicePageHeader title={current.title} subtitle="按真实需求连接经核验的校园服务"/><View className="service-notice">商家信息需通过营业资质和校区服务范围核验；需求中请勿留下手机号、宿舍号等隐私。</View><View className="store-grid">{current.items.map(item=><View className="store-card" key={item} onClick={()=>setTitle(item)}><Text>{item}</Text><Text>选择此需求 →</Text></View>)}</View><View className="form-card"><Input placeholder="需求标题" value={title} onInput={e=>setTitle(e.detail.value)}/><Textarea placeholder="数量、时间和大致位置" value={detail} onInput={e=>setDetail(e.detail.value)}/><Button className="primary-action" onClick={submit}>提交服务需求</Button></View><View className="list-stack">{items.map(item=><View className="business-card" key={item.id}><View className="row-between"><Text className="business-title">{item.title}</Text><Text className="status">{item.status==="submitted"?"待响应":item.status}</Text></View><Text className="business-desc">{item.detail}</Text></View>)}</View></View>}
