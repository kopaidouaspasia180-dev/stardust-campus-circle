import {useState} from "react"
import {Button,Input,Text,Textarea,View} from "@tarojs/components"
import Taro,{useDidShow} from "@tarojs/taro"
import ServicePageHeader from "../../components/ServicePageHeader"
import {apiRequest,showApiError} from "../../api/client"
import "../service-shared.css"
type Candidate={user_id:number;anonymous_name:string;interests:string;intro:string;greeted:boolean}
export default function MatchPage(){const[items,setItems]=useState<Candidate[]>([]);const[interests,setInterests]=useState("");const[intro,setIntro]=useState("")
 const load=()=>apiRequest<{items:Candidate[]}>("/match/candidates").then(r=>setItems(r.items)).catch(showApiError);useDidShow(load)
 const save=async()=>{try{await apiRequest("/match/profile",{method:"POST",data:{interests,intro}});Taro.showToast({title:"资料已更新",icon:"success"});load()}catch(e){showApiError(e)}}
 const greet=async(id:number)=>{try{await apiRequest(`/match/${id}/greet`,{method:"POST",data:{message:"兴趣相近，想和你认识一下"}});Taro.showToast({title:"已发送招呼",icon:"success"});load()}catch(e){showApiError(e)}}
 return <View className="page service-page"><ServicePageHeader title="匿名匹配好友" subtitle="先看兴趣与自我介绍，不公开真实身份"/><View className="service-notice">请勿发布联系方式、住址等隐私；对方回复前平台不会展示任何个人信息。</View><View className="form-card"><Input placeholder="兴趣标签，如 羽毛球、摄影、考研" value={interests} onInput={e=>setInterests(e.detail.value)}/><Textarea placeholder="简单介绍你想找什么样的校园搭子" value={intro} onInput={e=>setIntro(e.detail.value)}/><Button className="primary-action" onClick={save}>保存并开始匹配</Button></View><View className="list-stack">{items.map(item=><View className="business-card" key={item.user_id}><Text className="business-title">{item.anonymous_name}</Text><Text className="route">{item.interests}</Text><Text className="business-desc">{item.intro}</Text><Button className="small-action" disabled={item.greeted} onClick={()=>greet(item.user_id)}>{item.greeted?"已打招呼":"打个招呼"}</Button></View>)}</View></View>}
