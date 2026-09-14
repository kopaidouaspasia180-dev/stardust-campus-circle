import {useState} from "react"
import {View, Text, Input, Button} from "@tarojs/components"
import Taro, {useDidShow} from "@tarojs/taro"
import TenantHeader from "../../components/TenantHeader"
import {currentCampusName, currentTenant} from "../../store/tenant"
import type {Tenant} from "../../types/tenant"
import {apiRequest} from "../../api/client"
import "./index.css"

type CampusAnswer = {text:string;source:string;mode?:string}

const answers: Record<string, CampusAnswer> = {
  "快递": {text:"当前校区的快递信息请以取件短信和驿站现场通知为准，也可以在“快递动态”中手动记录取件码。",source:"取件短信与用户记录"},
  "活动": {text:"近期校园活动可以从首页“校园活动”或校园圈“活动”频道查看，时间和地点以活动发布者的最新说明为准。",source:"校园圈活动信息"},
  "课表": {text:"当前设备尚未绑定课程。请先在“课表”中导入或添加课程，校园助手才能结合课表回答。",source:"本机课表"},
  "外卖": {text:"点击“校园服务”里的“校园外卖”，可查看当前校区已上架菜单、选择餐品并提交订单。",source:"校园服务运营信息"},
  "二手": {text:"二手闲置内容在校园圈“二手”频道。交易前请核验物品情况，建议在校内公共区域当面交付。",source:"校园圈与安全提示"},
  "兼职": {text:"兼职信息在校园圈“兼职”频道。不要提前缴纳押金、培训费或保证金，涉及转账时务必再次核验。",source:"校园圈与反诈提示"},
  "失物": {text:"失物招领在校园圈“失物”频道，可以按物品名称、时间和地点发布线索。",source:"校园圈失物频道"}
}

export default function AIPage() {
  const [tenant, setTenant] = useState<Tenant>(currentTenant())
  const [campusName, setCampusName] = useState(currentCampusName())
  const [question, setQuestion] = useState("")
  const [loading, setLoading] = useState(false)
  const [answer, setAnswer] = useState<CampusAnswer>({text:"你好，我是星尘校园助手。可以帮你定位课表、快递、活动和校园服务入口。",source:"校园知识库"})
  useDidShow(() => { setTenant(currentTenant()); setCampusName(currentCampusName()) })
  const ask = async () => {
    if (!question.trim()) {
      Taro.showToast({title:"先输入问题吧",icon:"none"})
      return
    }
    setLoading(true)
    try {
      const result = await apiRequest<{item:{answer:string;source:string;mode:string};provider:string}>("/ai/ask", {
        method: "POST",
        data: {question: question.trim()}
      })
      setAnswer({text: result.item.answer, source: result.item.source, mode: result.item.mode})
    } catch {
      const key = Object.keys(answers).find(item => question.includes(item))
      setAnswer(key
        ? {...answers[key], source: `${answers[key].source}（智能服务暂不可用）`, mode: "local"}
        : {text:"智能问答暂时不可用。你可以到校园圈发布问题，或在校园服务中查找对应入口；重要校务信息请以学校官方通知为准。",source:"本地安全降级提示",mode:"local"})
    } finally {
      setLoading(false)
    }
  }
  return <View className="page ai-page">
    <TenantHeader tenant={tenant} campusName={campusName}/>
    <View className="ai-title-row"><View className="ai-orb">AI</View><View><Text>问校园助手</Text><Text>{tenant.name}专属校园助手</Text></View></View>
    <View className="chat-card card">
      <Text>{answer.text}</Text>
      <View className="answer-source"><Text>信息依据：{answer.source}</Text><Text onClick={() => Taro.showToast({title:"感谢反馈",icon:"none"})}>回答有误？</Text></View>
    </View>
    <View className="ai-suggestions">{["下一节课是什么？","快递在哪里取？","今晚有什么活动？","校园外卖怎么用？"].map(item => <Text key={item} onClick={() => setQuestion(item)}>{item}</Text>)}</View>
    <View className="ai-compose card"><Input value={question} onInput={event => setQuestion(event.detail.value)} placeholder="问问星尘校园助手…"/><Button loading={loading} disabled={loading} onClick={ask}>{loading ? "思考中" : "发送"}</Button></View>
    <View className="ai-safety-note">
      <Text>使用说明</Text>
      <Text>星尘校园助手会优先使用本校已核验知识库，用于查找入口和整理信息，不替代学校正式通知。涉及缴费、考试、处分和人身安全时，请向学校官方渠道核实。</Text>
    </View>
  </View>
}
