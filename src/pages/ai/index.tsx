import {useState} from "react"
import {View, Text, Input, Button} from "@tarojs/components"
import Taro, {useDidShow} from "@tarojs/taro"
import TenantHeader from "../../components/TenantHeader"
import {currentCampusName, currentTenant} from "../../store/tenant"
import type {Tenant} from "../../types/tenant"
import "./index.css"

const answers: Record<string, string> = {
  "快递": "大学西道校区的快递请前往校内菜鸟驿站领取，具体取件码和营业时间以短信为准。",
  "活动": "近期校园活动可以从首页“校园活动”或校园圈“活动”频道查看，具体时间和地点以活动发布者的最新说明为准。",
  "课表": "下一节是 10:30 的高等数学，地点为明德楼 A201。",
  "外卖": "校园外卖入口已经放入“校园服务”。商家、配送范围和营业时间需由当前高校运营方审核后展示。",
  "二手": "二手闲置内容在校园圈“二手”频道。交易前请核验物品情况，建议在校内公共区域当面交付。",
  "兼职": "兼职信息在校园圈“兼职”频道。不要提前缴纳押金、培训费或保证金，涉及转账时务必再次核验。",
  "失物": "失物招领在校园圈“失物”频道，可以按物品名称、时间和地点发布线索。"
}

export default function AIPage() {
  const [tenant, setTenant] = useState<Tenant>(currentTenant())
  const [campusName, setCampusName] = useState(currentCampusName())
  const [question, setQuestion] = useState("")
  const [answer, setAnswer] = useState("你好，我是星尘校园 AI。可以问我课表、快递、活动和校园服务。")
  useDidShow(() => { setTenant(currentTenant()); setCampusName(currentCampusName()) })
  const ask = () => {
    const key = Object.keys(answers).find(item => question.includes(item))
    setAnswer(key ? answers[key] : "暂时没有匹配到可靠答案。你可以到校园圈发布问题，或在校园服务中查找对应入口；重要校务信息请以学校官方通知为准。")
  }
  return <View className="page ai-page">
    <TenantHeader tenant={tenant} campusName={campusName}/>
    <View className="ai-title-row"><View className="ai-orb">●</View><View><Text>问校园 AI</Text><Text>{tenant.name}专属校园助手</Text></View></View>
    <View className="chat-card card"><Text>{answer}</Text></View>
    <View className="ai-suggestions">{["下一节课是什么？","快递在哪里取？","今晚有什么活动？","校园外卖怎么用？"].map(item => <Text key={item} onClick={() => setQuestion(item)}>{item}</Text>)}</View>
    <View className="ai-compose card"><Input value={question} onInput={event => setQuestion(event.detail.value)} placeholder="问问校园 AI…"/><Button onClick={ask}>发送</Button></View>
    <Text className="ai-demo-note">校园信息由各高校运营方维护，重要事项请以学校官方通知为准。</Text>
  </View>
}
