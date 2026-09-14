import {useMemo, useState} from "react"
import {Button, Image, Input, Text, Textarea, View} from "@tarojs/components"
import Taro, {useDidShow, usePullDownRefresh} from "@tarojs/taro"
import ServiceDock from "../../components/ServiceDock"
import ServiceMiniHeader from "../../components/ServiceMiniHeader"
import {apiRequest, requirePhoneLogin, showApiError} from "../../api/client"
import {demoContentEnabled} from "../../utils/demoContent"
import heroArt from "../../assets/services-ref/match-hero-art.mini.webp"
import avatarArt from "../../assets/services-ref/match-avatar.mini.webp"
import studyIcon from "../../assets/services-ref/match-study.png"
import sportIcon from "../../assets/services-ref/match-sport.png"
import cameraIcon from "../../assets/services-ref/match-camera.png"
import musicIcon from "../../assets/services-ref/match-music.png"
import shieldIcon from "../../assets/services-ref/match-shield.png"
import planeIcon from "../../assets/services-ref/match-plane.png"
import sparklesIcon from "../../assets/services-ref/match-sparkles.png"
import "../service-shared.css"
import "../service-visual-v2.css"
import "./index.css"

type Candidate={user_id:number;anonymous_name:string;interests:string;intro:string;greeted:boolean;demo?:boolean}
type Greeting={sender_id:number;anonymous_name:string;interests:string;intro:string;message:string;status:"pending"|"accepted"|"declined";created_at:string;conversation_id?:string}
type MatchProfile={interests:string;intro:string;anonymous_name:string;status:"active"|"inactive"}
type MatchTab="发现搭子"|"收到的招呼"|"我的资料"

const demoCandidate:Candidate={user_id:-1,anonymous_name:"同学 · G7",interests:"羽毛球 / 摄影 / 音乐",intro:"想找一起自习、运动的搭子，周末也喜欢拍照记录校园生活～",greeted:false,demo:true}
const interestOptions=[{label:"自习",icon:studyIcon},{label:"运动",icon:sportIcon},{label:"摄影",icon:cameraIcon},{label:"音乐",icon:musicIcon}]

function tags(value:string){return value.split(/[\s,，/、|]+/).map(item=>item.trim()).filter(Boolean)}
function overlap(a:string,b:string){const mine=new Set(tags(a));return tags(b).filter(item=>mine.has(item)).length}

export default function MatchPage(){
  const[items,setItems]=useState<Candidate[]>([])
  const[greetings,setGreetings]=useState<Greeting[]>([])
  const[profile,setProfile]=useState<MatchProfile|null>(null)
  const[interests,setInterests]=useState("")
  const[intro,setIntro]=useState("")
  const[tab,setTab]=useState<MatchTab>("发现搭子")
  const[candidateIndex,setCandidateIndex]=useState(0)
  const[greetingTarget,setGreetingTarget]=useState<Candidate|null>(null)
  const[greetingMessage,setGreetingMessage]=useState("")
  const[loading,setLoading]=useState(true)

  const load=async()=>{setLoading(true);try{const[candidates,inbox,myProfile]=await Promise.all([apiRequest<{items:Candidate[]}>("/match/candidates"),apiRequest<{items:Greeting[]}>("/match/greetings"),apiRequest<{item:MatchProfile|null}>("/match/profile")]);setItems(candidates.items);setGreetings(inbox.items);setProfile(myProfile.item);if(myProfile.item){setInterests(myProfile.item.interests);setIntro(myProfile.item.intro)}}catch{setItems([]);setGreetings([])}finally{setLoading(false)}}
  useDidShow(()=>{void load()})
  usePullDownRefresh(()=>{void load().finally(()=>Taro.stopPullDownRefresh())})

  const save=async()=>{if(!await requirePhoneLogin("登录后才能保存匿名匹配资料。"))return;if(interests.trim().length<2||intro.trim().length<5){Taro.showToast({title:"请完善兴趣和自我介绍",icon:"none"});return}try{const result=await apiRequest<{item:MatchProfile}>("/match/profile",{method:"POST",data:{interests,intro}});setProfile(result.item);Taro.showToast({title:"匿名资料已保存",icon:"success"});setTab("发现搭子");await load()}catch(error){showApiError(error)}}
  const pause=async()=>{if(!await requirePhoneLogin("登录后才能管理匿名匹配资料。"))return;const modal=await Taro.showModal({title:"暂停匿名匹配？",content:"暂停后你不会出现在候选列表，再次保存资料即可恢复。",confirmText:"确认暂停"});if(!modal.confirm)return;try{await apiRequest("/match/profile",{method:"DELETE"});setProfile(current=>current?{...current,status:"inactive"}:current);Taro.showToast({title:"匹配已暂停",icon:"success"})}catch(error){showApiError(error)}}
  const toggleInterest=(label:string)=>{const current=tags(interests);setInterests(current.includes(label)?current.filter(item=>item!==label).join(" / "):[...current,label].join(" / "))}

  const beginGreet=async(item:Candidate)=>{if(!await requirePhoneLogin("登录后才能发送匿名招呼。"))return;if(item.demo){Taro.showToast({title:"这是本地设计示例",icon:"none"});return}setGreetingTarget(item);setGreetingMessage("我们的兴趣很像，想和你认识一下。")}
  const greet=async()=>{if(!await requirePhoneLogin("登录后才能发送匿名招呼。"))return;if(!greetingTarget)return;if(greetingMessage.trim().length<2){Taro.showToast({title:"先写一句友善的招呼吧",icon:"none"});return}try{await apiRequest(`/match/${greetingTarget.user_id}/greet`,{method:"POST",data:{message:greetingMessage}});setGreetingTarget(null);setGreetingMessage("");await load();Taro.showToast({title:"已发送匿名招呼",icon:"success"})}catch(error){showApiError(error)}}
  const respond=async(senderId:number,status:string)=>{if(!await requirePhoneLogin("登录后才能处理收到的匿名招呼。"))return;const accepted=status==="accepted";const normalizedStatus=accepted?"accepted":"declined";const modal=await Taro.showModal({title:accepted?"同意这个招呼？":"婉拒这个招呼？",content:accepted?"同意后会建立只显示匿名昵称的校内会话，不会公开微信或手机号。":"对方只会看到本次招呼未获同意。",confirmText:accepted?"同意并聊天":"确认婉拒"});if(!modal.confirm)return;try{const result=await apiRequest<{conversationId?:string}>(`/match/greetings/${senderId}/respond`,{method:"POST",data:{status:normalizedStatus}});await load();if(result.conversationId)Taro.navigateTo({url:`/pages/chat/index?id=${encodeURIComponent(result.conversationId)}`})}catch(error){showApiError(error)}}
  const openMatchChat=(conversationId?:string)=>{if(conversationId)Taro.navigateTo({url:`/pages/chat/index?id=${encodeURIComponent(conversationId)}`})}

  const pending=useMemo(()=>greetings.filter(item=>item.status==="pending"),[greetings])
  const candidates=useMemo(()=>{const source=items.length?items:(demoContentEnabled()?[demoCandidate]:[]);return [...source].sort((a,b)=>overlap(interests,b.interests)-overlap(interests,a.interests))},[interests,items])
  const current=candidates.length?candidates[candidateIndex%candidates.length]:null
  const common=current?overlap(interests,current.interests):0
  const nextCandidate=()=>{if(!profile||profile.status!=="active"){setTab("我的资料");return}if(candidates.length<2){Taro.showToast({title:candidates.length?"暂时只有这位候选同学":"暂时没有新的匹配",icon:"none"});return}setCandidateIndex(index=>(index+1)%candidates.length)}
  const dock=(index:number)=>setTab(index===0?"发现搭子":index===1?"收到的招呼":"我的资料")

  return <View className="service-v2 theme-match">
    <ServiceMiniHeader title="匿名匹配" badge="仅限本校"/>
    {tab==="发现搭子"&&<>
      <View className="match-v2-hero"><View><Text>找到同频的校园搭子</Text><Text>基于兴趣，遇见合拍的你</Text></View><Image src={heroArt} mode="aspectFit"/></View>
      <Button className="match-start" onClick={nextCandidate}><Image src={sparklesIcon}/>{profile?.status==="active"?"换一个搭子":"开始匹配"}</Button>
      <View className="match-interests">{interestOptions.map(item=><View key={item.label} onClick={()=>{setTab("我的资料");toggleInterest(item.label)}}><Image src={item.icon}/><Text>{item.label}</Text></View>)}</View>
      {current?<View className="match-candidates"><View className="match-candidate" key={current.user_id}>
        <View className="match-profile-row"><View className="match-avatar"><Image src={avatarArt} mode="aspectFill"/></View><View className="match-profile-copy"><Text className="match-profile-name">{current.anonymous_name}</Text><Text className="match-profile-online">● 本校候选</Text><View className="match-common-interest"><Text>{common?`共同兴趣 ${common} 项`:"发现新兴趣"}</Text></View><View className="match-mini-interests">{interestOptions.filter(option=>current.interests.includes(option.label)).slice(0,3).map(option=><Image key={option.label} src={option.icon}/>)}</View></View></View>
        <View className="match-candidate-tags">{tags(current.interests).slice(0,5).map(item=><Text key={item}>{item}</Text>)}</View>
        <View className="match-intro-bubble"><Text>{current.intro}</Text></View>
        <Button className="match-greet-button" disabled={current.greeted} onClick={()=>void beginGreet(current)}><Image src={planeIcon}/>{current.greeted?"等待回应":"匿名打招呼"}</Button>
      </View></View>:<View className="match-empty"><Image src={avatarArt}/><Text>{loading?"正在匹配同校资料…":"暂时没有新的同校候选"}</Text><Text>完善兴趣与介绍后，系统会优先展示兴趣重合的同学</Text><Button onClick={()=>setTab("我的资料")}>完善匿名资料</Button></View>}
      <View className="match-privacy"><Image src={shieldIcon}/><View><Text>双方同意后开启匿名校内会话</Text><Text>聊天只展示匿名昵称，不公开微信、手机号或真实姓名</Text></View></View>
    </>}

    {tab==="我的资料"&&<View className="match-profile-editor"><View className="v2-section-head"><View><Text>匹配偏好</Text><Text>只用于同校匿名推荐，随时可更新</Text></View><Text>{profile?.status==="active"?"匹配中":"未开启"}</Text></View><View className="match-profile-card"><Text className="match-field-label">选择兴趣</Text><View className="match-choice-grid">{interestOptions.map(item=><View key={item.label} className={tags(interests).includes(item.label)?"active":""} onClick={()=>toggleInterest(item.label)}><Image src={item.icon}/><Text>{item.label}</Text></View>)}</View><Text className="match-field-label">更多兴趣</Text><Input maxlength={100} placeholder="例：考研 / 英语 / 桌游" value={interests} onInput={event=>setInterests(event.detail.value)}/><View className="match-editor-count"><Text>匿名昵称由系统生成</Text><Text>{interests.length}/100</Text></View><Text className="match-field-label">自我介绍</Text><Textarea maxlength={240} placeholder="想找什么样的搭子？常用时间和活动地点是什么？" value={intro} onInput={event=>setIntro(event.detail.value)}/><View className="match-editor-count"><Text>不要填写姓名、手机号、微信或宿舍号</Text><Text>{intro.length}/240</Text></View><Button className="v2-cta" onClick={()=>void save()}>{profile?.status==="inactive"?"恢复并保存匹配":"保存匿名资料"}</Button>{profile?.status==="active"&&<Button className="match-pause" onClick={()=>void pause()}>暂停匿名匹配</Button>}</View></View>}

    {tab==="收到的招呼"&&<View><View className="v2-section-head"><View><Text>收到的招呼</Text><Text>同意前不会公开联系方式</Text></View><Text>{pending.length?`${pending.length} 条待回应`:`${greetings.length} 条`}</Text></View><View className="v2-list">{greetings.map(item=><View className="v2-card match-greeting-card" key={item.sender_id}><View className="match-greet-head"><Text className="v2-title">{item.anonymous_name}</Text><Text>{item.status==="pending"?"待回应":item.status==="accepted"?"已同意":"已婉拒"}</Text></View><View className="match-greeting-tags">{tags(item.interests).slice(0,5).map(tag=><Text key={tag}>{tag}</Text>)}</View><Text className="match-greeting-message">“{item.message||item.intro}”</Text>{item.status==="pending"&&<View className="match-response"><Button onClick={()=>void respond(item.sender_id,"declined")}>婉拒</Button><Button onClick={()=>void respond(item.sender_id,"accepted")}>同意</Button></View>}{item.status==="accepted"&&item.conversation_id&&<Button className="v2-cta" onClick={()=>openMatchChat(item.conversation_id)}>进入匿名聊天</Button>}</View>)}{!greetings.length&&<View className="match-empty inbox"><Image src={planeIcon}/><Text>暂时还没有收到招呼</Text><Text>完善兴趣与自我介绍，更容易被同频同学发现</Text><Button onClick={()=>setTab("我的资料")}>去完善资料</Button></View>}</View></View>}

    {greetingTarget&&<View className="match-greet-mask" onClick={()=>setGreetingTarget(null)}><View className="match-greet-sheet" onClick={event=>event.stopPropagation()}><View/><Text>给 {greetingTarget.anonymous_name} 打招呼</Text><Text>只发送这句话和你的匿名兴趣资料</Text><Textarea maxlength={120} value={greetingMessage} onInput={event=>setGreetingMessage(event.detail.value)} placeholder="写一句友善的招呼……"/><Text>{greetingMessage.length}/120</Text><Button disabled={greetingMessage.trim().length<2} onClick={()=>void greet()}>发送匿名招呼</Button></View></View>}
    <ServiceDock labels={["匹配",pending.length?`招呼 ${pending.length}`:"招呼","我的"]} active={tab==="收到的招呼"?1:tab==="我的资料"?2:0} onSelect={dock}/>
  </View>
}
