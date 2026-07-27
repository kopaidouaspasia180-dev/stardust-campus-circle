import {useState} from "react"
import {Button, Input, Text, View} from "@tarojs/components"
import Taro from "@tarojs/taro"
import ServicePageHeader from "../../components/ServicePageHeader"
import "../service-shared.css"
type Course={name:string;time:string;room:string;teacher:string}
const KEY="stardust_schedule_v1"
export default function SchedulePage(){const[items,setItems]=useState<Course[]>(()=>Taro.getStorageSync<Course[]>(KEY)||[]);const[form,setForm]=useState<Course>({name:"",time:"",room:"",teacher:""})
 const add=()=>{if(!form.name||!form.time)return Taro.showToast({title:"请填写课程和时间",icon:"none"});const next=[...items,form];setItems(next);Taro.setStorageSync(KEY,next);setForm({name:"",time:"",room:"",teacher:""})}
 return <View className="page service-page"><ServicePageHeader title="个人课表" subtitle="手动添加课程，数据仅保存在当前设备"/><View className="form-card"><Input placeholder="课程名称" value={form.name} onInput={e=>setForm({...form,name:e.detail.value})}/><Input placeholder="上课时间，如 周一 1-2节" value={form.time} onInput={e=>setForm({...form,time:e.detail.value})}/><Input placeholder="教室" value={form.room} onInput={e=>setForm({...form,room:e.detail.value})}/><Input placeholder="教师（可选）" value={form.teacher} onInput={e=>setForm({...form,teacher:e.detail.value})}/><Button className="primary-action" onClick={add}>添加课程</Button></View><View className="list-stack">{items.map((c,i)=><View className="business-card" key={`${c.name}-${i}`}><Text className="business-title">{c.name}</Text><Text className="business-desc">{c.time} · {c.room||"教室待定"} {c.teacher&&`· ${c.teacher}`}</Text></View>)}</View></View>}
