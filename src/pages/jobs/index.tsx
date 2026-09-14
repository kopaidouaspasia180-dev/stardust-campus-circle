import {useMemo, useState} from "react"
import {Button, Image, Input, Text, Textarea, View} from "@tarojs/components"
import Taro, {useDidShow} from "@tarojs/taro"
import ServiceDock from "../../components/ServiceDock"
import ServiceMiniHeader from "../../components/ServiceMiniHeader"
import {apiRequest,requirePhoneLogin,showApiError} from "../../api/client"
import {demoContentEnabled} from "../../utils/demoContent"
import jobPhoto from "../../assets/services-real/jobs-student.mini.webp"
import campusPhoto from "../../assets/campus/real/tangshan-sunset-path-momo.mini.webp"
import briefcaseIcon from "../../assets/icons/services/service-05.mini.webp"
import calendarIcon from "../../assets/icons/services/service-01.mini.webp"
import cloudIcon from "../../assets/icons/services/service-06.mini.webp"
import searchIcon from "../../assets/icons/services/service-08.mini.webp"
import "../service-shared.css"
import "../service-visual-v2.css"
import "./index.css"

type Job={id:number;title:string;organization:string;description:string;pay_label:string;location:string;verified:boolean;applied:boolean;can_chat?:boolean;poster_name?:string;application_status?:string;demo?:boolean}
const demos:Job[]=[
  {id:-1,title:"图书馆助理",organization:"校图书馆",description:"整理书目、协助咨询，每周二至周日",pay_label:"20元/小时",location:"图书馆一楼服务台",verified:true,applied:false,demo:true},
  {id:-2,title:"校园咖啡店店员",organization:"校内合作商家",description:"课余时间排班，提供基础培训",pay_label:"18元/小时",location:"大学道校区",verified:true,applied:false,demo:true},
  {id:-3,title:"健身房助理",organization:"体育中心",description:"器械整理与场地签到",pay_label:"20元/小时",location:"体育馆",verified:true,applied:false,demo:true},
  {id:-4,title:"线上数据整理",organization:"学院项目组",description:"资料录入与表格核验",pay_label:"15元/小时",location:"线上办公",verified:true,applied:false,demo:true}
]

export default function JobsPage(){
  const[items,setItems]=useState<Job[]>([])
  const[message,setMessage]=useState<Record<number,string>>({})
  const[tab,setTab]=useState("全部岗位")
  const[category,setCategory]=useState("全部")
  const[query,setQuery]=useState("")
  const[selected,setSelected]=useState<Job|null>(null)
  const[applyTarget,setApplyTarget]=useState<Job|null>(null)
  const load=()=>apiRequest<{items:Job[]}>("/jobs").then(r=>setItems(r.items)).catch(()=>setItems([]))
  useDidShow(load)
  const apply=async(j:Job)=>{if(!await requirePhoneLogin("登录后才能报名校园兼职。"))return;if(j.demo){Taro.showToast({title:"这是界面示例",icon:"none"});return}try{await apiRequest(`/jobs/${j.id}/apply`,{method:"POST",data:{message:message[j.id]?.trim()||"我有意向参与，请联系我进一步确认。"}});setApplyTarget(null);setSelected(null);Taro.showToast({title:"意向已提交",icon:"success"});load()}catch(e){showApiError(e)}}
  const chat=async(j:Job)=>{if(!await requirePhoneLogin("登录后才能与岗位发布方沟通。"))return;if(j.demo||!j.can_chat){Taro.showToast({title:"该岗位暂未开放直接沟通",icon:"none"});return}try{const result=await apiRequest<{item:{id:string}}>("/conversations",{method:"POST",data:{resourceType:"job",resourceId:String(j.id)}});Taro.navigateTo({url:`/pages/chat/index?id=${encodeURIComponent(result.item.id)}`})}catch(e){showApiError(e)}}
  const withdraw=async(id:number)=>{if(!await requirePhoneLogin("登录后才能管理你的兼职报名。"))return;const modal=await Taro.showModal({title:"撤回投递？",content:"岗位方将看到投递已撤回。",confirmText:"撤回投递"});if(!modal.confirm)return;try{await apiRequest(`/jobs/${id}/withdraw`,{method:"POST"});setSelected(null);await load()}catch(e){showApiError(e)}}
  const categoryOf=(job:Job)=>{const text=`${job.title}${job.description}${job.location}`;return /线上|远程/.test(text)?"线上":/周末|周六|周日/.test(text)?"周末":"校内"}
  const filtered=useMemo(()=>items.filter(item=>{
    const tabMatch=tab==="已核验"?item.verified:tab==="我的投递"?item.applied:true
    const categoryMatch=category==="全部"||categoryOf(item)===category
    const keyword=`${item.title}${item.organization}${item.description}${item.location}`.toLowerCase()
    return tabMatch&&categoryMatch&&keyword.includes(query.trim().toLowerCase())
  }),[category,items,query,tab])
  const demoVisible=demos.filter(item=>(category==="全部"||categoryOf(item)===category)&&`${item.title}${item.organization}${item.description}${item.location}`.toLowerCase().includes(query.trim().toLowerCase()))
  const visible=filtered.length?filtered:(items.length||tab==="我的投递"||!demoContentEnabled()?[]:demoVisible)
  const showPublishNotice=()=>Taro.showModal({title:"岗位发布暂由运营维护",content:"本期不开放付费发布。企业、社团或校内部门可先联系校区运营人员完成资质核验。",showCancel:false,confirmText:"知道了"})
  const showSafety=()=>Taro.showModal({title:"兼职安全提醒",content:"不缴纳押金、培训费或保证金；不提供身份证原件、银行卡密码和验证码；面试优先选择校内公共区域。发现收费或异常高薪岗位，请立即举报。",showCancel:false,confirmText:"我知道了"})
  const dock=(index:number)=>{if(index===0)setTab("全部岗位");if(index===1)void showPublishNotice();if(index===2)setTab("我的投递")}
  const featured=visible[0]
  return <View className="service-v2 theme-jobs">
    <ServiceMiniHeader title="兼职信息" badge="本校核验⌄"/>
    <View className="v2-search jobs-search"><Image className="v2-search-icon" src={searchIcon}/><Input value={query} maxlength={40} onInput={event=>setQuery(event.detail.value)} placeholder="搜索岗位、机构或地点"/>{query&&<Text onClick={()=>setQuery("")}>清除</Text>}</View>
    <View className="jobs-publish-entry" onClick={showPublishNotice}><View><Text>岗位发布与资质核验</Text><Text>本期不收取发布费 · 由校区运营统一维护</Text></View><Text>查看说明 ›</Text></View>
    <View className="jobs-categories">{[["校内",briefcaseIcon],["周末",calendarIcon],["线上",cloudIcon]].map(([label,icon])=><View key={label} className={category===label?"active":""} onClick={()=>setCategory(category===label?"全部":label)}><Image className="jobs-category-icon" src={icon}/><Text>{label}</Text></View>)}</View>
    {featured&&<View className="jobs-feature" onClick={()=>setSelected(featured)}>
      <Image src={jobPhoto} mode="aspectFill"/>
      <View><Text>{featured.verified?"本校已核验":"等待核验"}</Text><Text>{featured.title}</Text><Text>{featured.location}</Text><Text>{featured.organization}</Text><Text>{featured.pay_label}</Text>{featured.applied?<Button onClick={event=>{event.stopPropagation();void withdraw(featured.id)}}>撤回投递</Button>:<Button onClick={event=>{event.stopPropagation();setApplyTarget(featured)}}>立即报名</Button>}</View>
    </View>}
    <View className="v2-chip-row">{["全部岗位","已核验","我的投递"].map(item=><Text key={item} className={`v2-chip ${tab===item?"active":""}`} onClick={()=>setTab(item)}>{item}</Text>)}</View>
    <View className="v2-section-head"><View><Text>{tab==="我的投递"?"我的投递":"最新岗位"}</Text><Text>仅展示当前校区已审核岗位</Text></View><Text onClick={()=>{setTab("全部岗位");setCategory("全部");setQuery("")}}>查看全部 ›</Text></View>
    <View className="jobs-list">{visible.slice(featured?1:0).map((job,index)=><View className="jobs-row" key={job.id} onClick={()=>setSelected(job)}>
      <Image src={index%2?campusPhoto:jobPhoto} mode="aspectFill"/>
      <View><View><Text>{job.title}</Text><Text>{job.verified?"已核验":"待核验"}</Text></View><Text>{job.organization} · {job.location}</Text><Text>{job.description}</Text></View>
      <View><Text>{job.pay_label}</Text>{job.can_chat&&<Button className="jobs-chat-btn" onClick={event=>{event.stopPropagation();void chat(job)}}>聊一聊</Button>}{job.applied?<Button onClick={event=>{event.stopPropagation();void withdraw(job.id)}}>撤回</Button>:<Button onClick={event=>{event.stopPropagation();setApplyTarget(job)}}>报名</Button>}</View>
    </View>)}</View>
    {visible.length===0&&<View className="jobs-empty"><Image src={briefcaseIcon}/><Text>{query||category!=="全部"?"没有符合条件的岗位":"当前校区暂无已核验岗位"}</Text><Text>{query||category!=="全部"?"换个关键词或清除筛选再看看":"新岗位核验通过后会第一时间展示"}</Text>{(query||category!=="全部")&&<Button onClick={()=>{setQuery("");setCategory("全部")}}>清除筛选</Button>}</View>}
    <View className="jobs-safe" onClick={showSafety}>谨防收费培训与高薪兼职骗局<Text>安全指南 ›</Text></View>
    <ServiceDock labels={["岗位","发布","我的"]} active={tab==="我的投递"?2:0} onSelect={dock}/>
    {selected&&<View className="jobs-detail-mask" onClick={()=>setSelected(null)}><View className="jobs-detail-sheet" onClick={event=>event.stopPropagation()}>
      <View className="jobs-detail-handle"/><View className="jobs-detail-head"><View><Text>{selected.title}</Text><Text>{selected.verified?"本校已核验":"等待核验"}</Text></View><Text>{selected.pay_label}</Text></View>
      <View className="jobs-detail-facts"><View><Text>发布方</Text><Text>{selected.organization}</Text></View><View><Text>工作地点</Text><Text>{selected.location}</Text></View></View>
      <View className="jobs-detail-description"><Text>岗位说明</Text><Text>{selected.description}</Text></View>
      <View className="jobs-detail-warning"><Text>安全提醒</Text><Text>不缴纳押金或培训费，不向任何人提供验证码；异常岗位可在沟通中举报。</Text></View>
      <View className="jobs-detail-actions">{selected.can_chat&&<Button className="secondary" onClick={()=>chat(selected)}>先聊聊</Button>}{selected.applied?<Button className="primary" onClick={()=>withdraw(selected.id)}>撤回投递</Button>:<Button className="primary" onClick={()=>setApplyTarget(selected)}>提交意向</Button>}</View>
      <Text className="jobs-detail-close" onClick={()=>setSelected(null)}>关闭</Text>
    </View></View>}
    {applyTarget&&<View className="jobs-apply-mask" onClick={()=>setApplyTarget(null)}><View className="jobs-apply-card" onClick={event=>event.stopPropagation()}>
      <View><Text>报名 {applyTarget.title}</Text><Text>意向内容只提供给当前岗位发布方</Text></View>
      <Textarea maxlength={200} value={message[applyTarget.id]||""} onInput={event=>setMessage({...message,[applyTarget.id]:event.detail.value})} placeholder="简单介绍可工作时间、相关经验或想确认的问题"/>
      <View className="jobs-apply-actions"><Button onClick={()=>setApplyTarget(null)}>取消</Button><Button onClick={()=>apply(applyTarget)}>确认提交</Button></View>
    </View></View>}
  </View>
}
