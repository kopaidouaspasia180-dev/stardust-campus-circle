import {useState} from "react"
import {Button, Input, Text, Textarea, View} from "@tarojs/components"
import Taro, {useDidShow} from "@tarojs/taro"
import {apiRequest, showApiError} from "../../api/client"
import "./index.css"

type PostingOrder = {
  id: string
  order_no: string
  title: string
  amount_cents: number
  status: string
  payment_status: string
  moderation_note?: string
  created_at: string
}

type PaymentParams = {timeStamp: string; nonceStr: string; package: string; signType: "RSA"; paySign: string}

const emptyForm = {title: "", organization: "", location: "", salaryText: "", description: ""}
const statusLabels: Record<string, string> = {
  payment_required: "等待支付",
  pending_contact: "待添加运营微信",
  pending_review: "审核中",
  approved: "已发布",
  rejected: "未通过",
  cancelled: "已取消"
}

export default function JobPublishPage() {
  const [form, setForm] = useState(emptyForm)
  const [orders, setOrders] = useState<PostingOrder[]>([])
  const [paymentConfigured, setPaymentConfigured] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const load = async () => {
    try {
      const result = await apiRequest<{items: PostingOrder[]; paymentConfigured: boolean}>("/job-postings/mine")
      setOrders(result.items)
      setPaymentConfigured(result.paymentConfigured)
    } catch {
      setOrders([])
      setPaymentConfigured(false)
    }
  }
  useDidShow(() => { void load() })

  const showContact = async (id: string) => {
    try {
      const result = await apiRequest<{contact: {wechat: string; note: string}}>(`/job-postings/${id}/contact`)
      const modal = await Taro.showModal({title: "添加运营微信", content: `${result.contact.wechat}\n\n${result.contact.note}`, confirmText: "复制微信号"})
      if (modal.confirm) await Taro.setClipboardData({data: result.contact.wechat})
    } catch (error) {
      showApiError(error)
    }
  }

  const pay = async (order: PostingOrder) => {
    if (!paymentConfigured || Taro.getEnv() !== Taro.ENV_TYPE.WEAPP) {
      Taro.showModal({title: "支付尚未开放", content: "发布单已安全保存。正式微信支付配置完成前不会伪造支付，也不会进入公开审核。", showCancel: false})
      return
    }
    try {
      const result = await apiRequest<{paymentParams: PaymentParams}>(`/job-postings/${order.id}/payment-intent`, {method: "POST"})
      await Taro.requestPayment(result.paymentParams)
      Taro.showToast({title: "支付成功", icon: "success"})
      await load()
      await new Promise(resolve => setTimeout(resolve, 900))
      await showContact(order.id)
    } catch (error) {
      if (!String(error).includes("cancel")) showApiError(error)
    }
  }

  const submit = async () => {
    if (submitting) return
    if (!paymentConfigured) {
      await Taro.showModal({
        title: "付费发布暂未开放",
        content: "当前没有可用的微信支付与退款通道，暂不接收新的付费兼职发布单。已有草稿仍可在下方查看。",
        showCancel: false
      })
      return
    }
    setSubmitting(true)
    try {
      const result = await apiRequest<{item: PostingOrder}>("/job-postings", {method: "POST", data: form})
      setForm(emptyForm)
      await load()
      const modal = await Taro.showModal({
        title: "发布单已创建",
        content: "发布服务费为 ¥10。支付成功后添加运营微信，沟通核验通过才会公开展示。",
        confirmText: paymentConfigured ? "去支付" : "知道了",
        showCancel: paymentConfigured
      })
      if (modal.confirm && paymentConfigured) await pay(result.item)
    } catch (error) {
      showApiError(error)
    } finally {
      setSubmitting(false)
    }
  }

  return <View className="job-publish-page">
    <View className="job-publish-hero"><Text>CAMPUS JOB POST</Text><Text>发布校园兼职</Text><Text>当前校区展示 · 人工沟通核验 · 不接受刷单与收费培训</Text></View>
    {!paymentConfigured && <View className="job-publish-form"><Text className="job-payment-note">本期不开放付费岗位发布，也不会向同学发起微信支付。岗位由校区运营完成资质核验后统一录入。</Text><Button className="job-submit" onClick={() => Taro.navigateBack()}>返回岗位列表</Button></View>}
    {paymentConfigured && <View>
    <View className="job-publish-flow"><View><Text>1</Text><Text>填写岗位</Text></View><View><Text>2</Text><Text>支付 ¥10</Text></View><View><Text>3</Text><Text>添加运营微信</Text></View><View><Text>4</Text><Text>审核发布</Text></View></View>
    <View className="job-publish-form">
      <View><Text>岗位名称</Text><Input value={form.title} placeholder="例如：周末活动协助" onInput={event => setForm({...form, title: event.detail.value})}/></View>
      <View><Text>发布方</Text><Input value={form.organization} placeholder="企业、社团或个人名称" onInput={event => setForm({...form, organization: event.detail.value})}/></View>
      <View><Text>地点</Text><Input value={form.location} placeholder="校内具体位置或线上" onInput={event => setForm({...form, location: event.detail.value})}/></View>
      <View><Text>报酬说明</Text><Input value={form.salaryText} placeholder="例如：20 元/小时" onInput={event => setForm({...form, salaryText: event.detail.value})}/></View>
      <View><Text>工作内容</Text><Textarea value={form.description} maxlength={800} placeholder="写清时间、职责、人数、结算方式和真实风险提示" onInput={event => setForm({...form, description: event.detail.value})}/></View>
      <View className="job-fee-line"><Text>发布服务费</Text><Text>¥10.00</Text></View>
      <Button className="job-submit" disabled={submitting} onClick={submit}>{submitting ? "正在创建…" : "创建发布单"}</Button>
    </View>
    </View>}

    <View className="job-order-head"><Text>我的发布单</Text><Text>{orders.length} 条</Text></View>
    <View className="job-order-list">
      {orders.map(item => <View className="job-order-card" key={item.id}>
        <View><Text>{item.title}</Text><Text>{item.order_no}</Text></View>
        <Text className={`job-order-status status-${item.status}`}>{statusLabels[item.status] || item.status}</Text>
        <View className="job-order-actions">
          <Text>¥{(Number(item.amount_cents) / 100).toFixed(2)} · {new Date(item.created_at).toLocaleDateString("zh-CN")}</Text>
          {item.status === "payment_required" && <Button onClick={() => pay(item)}>继续支付</Button>}
          {["pending_contact", "pending_review", "approved"].includes(item.status) && item.payment_status === "paid" && <Button onClick={() => showContact(item.id)}>运营微信</Button>}
        </View>
        {item.moderation_note && <Text className="job-order-note">审核说明：{item.moderation_note}</Text>}
      </View>)}
      {orders.length === 0 && <View className="job-order-empty">还没有发布单</View>}
    </View>
  </View>
}
