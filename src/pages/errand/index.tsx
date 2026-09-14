import {useEffect, useMemo, useState} from "react"
import {Button, Image, Input, Text, Textarea, View} from "@tarojs/components"
import Taro, {useDidShow} from "@tarojs/taro"
import ServiceDock from "../../components/ServiceDock"
import ServiceMiniHeader from "../../components/ServiceMiniHeader"
import {accountStorageKey, apiRequest, hasPhoneLogin, requirePhoneLogin, showApiError} from "../../api/client"
import {currentCampus, currentTenant} from "../../store/tenant"
import rider from "../../assets/services-real/errand-rider.mini.webp"
import packageIcon from "../../assets/icons/services/service-08.mini.webp"
import scooterIcon from "../../assets/icons/services/service-04.mini.webp"
import "../service-shared.css"
import "../service-visual-v2.css"
import "./index.css"

type TaskKind = "代取快递" | "校内帮送"
type TabName = "任务大厅" | "我发布的" | "我接到的" | "已完成"
type Errand = {
  id: string
  title: string
  description: string
  pickup_place: string
  delivery_place: string
  reward: string
  deadline: string
  status: "open" | "claimed" | "completed" | "cancelled"
  mine: boolean
  accepted_by_me: boolean
  creator_name: string
  runner_name?: string
  conversation_id?: string
  creator_confirmed_at?: string | null
  runner_confirmed_at?: string | null
  created_at?: string
}
type FormState = {
  taskKind: TaskKind
  description: string
  pickupPlace: string
  deliveryPlace: string
  reward: string
  deadline: string
}

const pickupOptions = ["菜鸟驿站", "南院快递点", "北院快递点", "校外快递柜"]
const deliveryOptions = ["宿舍楼下", "教学楼门口", "图书馆门口", "校门口"]
const deadlineOptions = ["尽快送达", "30分钟内", "1小时内", "今天送达"]
const rewardOptions = ["3", "5", "8", "10"]
const defaultForm: FormState = {
  taskKind: "代取快递",
  description: "",
  pickupPlace: "菜鸟驿站",
  deliveryPlace: "宿舍楼下",
  reward: "5",
  deadline: "尽快送达"
}

function preferenceKey() {
  return accountStorageKey("errand_preferences_v2")
}

function taskKindOf(item: Errand): TaskKind {
  return item.title.includes("快递") || item.title.includes("取") ? "代取快递" : "校内帮送"
}

function statusLabel(item: Errand) {
  if (item.status === "open") return item.mine ? "等待接单" : "可接单"
  if (item.status === "completed") return "已完成"
  if (item.status === "cancelled") return "已撤销"
  if (item.creator_confirmed_at && !item.runner_confirmed_at) return "等待跑腿同学确认"
  if (item.runner_confirmed_at && !item.creator_confirmed_at) return "等待发布人确认"
  return "配送中"
}

export default function ErrandPage() {
  const [items, setItems] = useState<Errand[]>([])
  const [form, setForm] = useState<FormState>(defaultForm)
  const [showForm, setShowForm] = useState(false)
  const [tab, setTab] = useState<TabName>("任务大厅")
  const [acting, setActing] = useState("")
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!hasPhoneLogin()) {
      setForm(defaultForm)
      return
    }
    const saved = Taro.getStorageSync<Partial<FormState>>(preferenceKey())
    if (saved && typeof saved === "object") setForm(current => ({...current, ...saved, description: ""}))
  }, [])

  const load = async () => {
    setLoading(true)
    try {
      const result = await apiRequest<{items: Errand[]}>("/errands")
      const readable = (value: string) => {
        const content = String(value || "").trim()
        const meaningful = content.replace(/[?？�\s()[\]（）·:：,，.。_-]/g, "")
        const corrupt = (content.match(/[?？�]/g) || []).length
        return meaningful.length >= 2 && corrupt / Math.max(1, content.length) < 0.35
      }
      setItems(result.items.filter(item => [item.title, item.description, item.pickup_place, item.delivery_place].every(readable)))
    } catch {
      setItems([])
    } finally {
      setLoading(false)
    }
  }
  useDidShow(() => {
    if (!hasPhoneLogin()) {
      setForm(defaultForm)
      setTab("任务大厅")
      setShowForm(false)
    }
    void load()
  })

  const begin = async (taskKind: TaskKind) => {
    if (!await requirePhoneLogin("登录后才能发布跑腿需求。")) return
    setForm(current => ({...current, taskKind, description: ""}))
    setShowForm(true)
  }

  const submit = async () => {
    if (!await requirePhoneLogin("登录后才能发布跑腿需求。")) return
    const pickupPlace = form.pickupPlace.trim()
    const deliveryPlace = form.deliveryPlace.trim()
    const reward = Number(form.reward)
    if (pickupPlace.length < 2 || deliveryPlace.length < 2) {
      Taro.showToast({title: "请补充取件点和送达位置", icon: "none"})
      return
    }
    if (!Number.isFinite(reward) || reward < 0 || reward > 100) {
      Taro.showToast({title: "酬金请填写 0～100 元", icon: "none"})
      return
    }
    const defaultDescription = form.taskKind === "代取快递"
      ? "接单后请在校内聊天联系，我会私下发送必要的取件信息。"
      : "请按约定时间送达，物品细节可在校内聊天确认。"
    const title = form.taskKind === "代取快递" ? `代取快递 · ${pickupPlace}` : `校内帮送 · ${pickupPlace}`
    setActing("publish")
    try {
      await apiRequest("/errands", {
        method: "POST",
        data: {
          title,
          description: form.description.trim() || defaultDescription,
          pickupPlace,
          deliveryPlace,
          reward,
          deadline: form.deadline
        }
      })
      Taro.setStorageSync(preferenceKey(), {
        taskKind: form.taskKind,
        pickupPlace,
        deliveryPlace,
        reward: form.reward,
        deadline: form.deadline
      })
      setForm(current => ({...current, description: ""}))
      setShowForm(false)
      setTab("我发布的")
      await load()
      Taro.showToast({title: "已发布，等待同学接单", icon: "success"})
    } catch (error) {
      showApiError(error)
    } finally {
      setActing("")
    }
  }

  const startChat = async (item: Errand) => {
    if (!await requirePhoneLogin("登录后才能使用校内聊天。")) return false
    try {
      if (item.conversation_id) {
        Taro.navigateTo({url: `/pages/chat/index?id=${encodeURIComponent(item.conversation_id)}`})
        return true
      }
      const result = await apiRequest<{item: {id: string}}>("/conversations", {method: "POST", data: {resourceType: "errand", resourceId: item.id}})
      Taro.navigateTo({url: `/pages/chat/index?id=${encodeURIComponent(result.item.id)}`})
      return true
    } catch (error) {
      showApiError(error)
      return false
    }
  }

  const claim = async (item: Errand) => {
    if (!await requirePhoneLogin("登录后才能接取跑腿任务。")) return
    const modal = await Taro.showModal({
      title: "确认接下这单？",
      content: `${item.pickup_place} → ${item.delivery_place}\n完成后可获得 ¥${item.reward}，酬金由双方线下结算。`,
      confirmText: "确认接单"
    })
    if (!modal.confirm) return
    setActing(`${item.id}-claim`)
    try {
      await apiRequest(`/errands/${item.id}/claim`, {method: "POST"})
      await load()
      Taro.showToast({title: "接单成功", icon: "success"})
      await startChat(item)
    } catch (error) {
      showApiError(error)
    } finally {
      setActing("")
    }
  }

  const confirmComplete = async (item: Errand) => {
    const isCreator = item.mine
    const modal = await Taro.showModal({
      title: isCreator ? "确认已经收到？" : "确认已经送达？",
      content: "双方都确认后任务才会完成。请在实际交接完成后操作。",
      confirmText: "确认完成"
    })
    if (!modal.confirm) return
    setActing(`${item.id}-complete`)
    try {
      await apiRequest(`/errands/${item.id}/complete`, {method: "POST"})
      await load()
      Taro.showToast({title: "已确认，等待对方", icon: "success"})
    } catch (error) {
      showApiError(error)
    } finally {
      setActing("")
    }
  }

  const release = async (item: Errand) => {
    const modal = await Taro.showModal({title: "放弃这次接单？", content: "任务会重新回到大厅，请先在聊天里告知发布人。", confirmText: "确认放弃"})
    if (!modal.confirm) return
    setActing(`${item.id}-release`)
    try {
      await apiRequest(`/errands/${item.id}/release`, {method: "POST"})
      await load()
      Taro.showToast({title: "已放回任务大厅", icon: "success"})
    } catch (error) {
      showApiError(error)
    } finally {
      setActing("")
    }
  }

  const cancel = async (item: Errand) => {
    const modal = await Taro.showModal({title: "撤销这条需求？", content: "撤销后其他同学将无法接单。", confirmText: "确认撤销"})
    if (!modal.confirm) return
    setActing(`${item.id}-cancel`)
    try {
      await apiRequest(`/errands/${item.id}/cancel`, {method: "POST"})
      await load()
    } catch (error) {
      showApiError(error)
    } finally {
      setActing("")
    }
  }

  const filtered = useMemo(() => items.filter(item => {
    if (tab === "任务大厅") return item.status === "open" && !item.mine
    if (tab === "我发布的") return item.mine
    if (tab === "我接到的") return item.accepted_by_me && item.status !== "completed"
    return item.status === "completed" && (item.mine || item.accepted_by_me)
  }), [items, tab])

  const dock = (index: number) => {
    if (index === 0) {
      setTab("任务大厅")
      setShowForm(false)
    } else if (index === 1) {
      setTab("我发布的")
      setShowForm(false)
    } else {
      begin("代取快递")
    }
  }

  return <View className="service-v2 theme-errand">
    <ServiceMiniHeader title="跑腿代取" badge="同校互助"/>
    <View className="errand-hero">
      <Image src={rider} mode="aspectFill"/>
      <View className="errand-hero-copy"><Text>有快递，不想跑？</Text><Text>发布后由同校同学帮你送到约定位置</Text><Text>不公开取件码 · 全程可沟通</Text></View>
      <Button className="errand-hero-button" onClick={() => begin("代取快递")}>立即找人代取</Button>
    </View>

    <View className="errand-quick-actions">
      <View onClick={() => begin("代取快递")}><Image src={packageIcon}/><View><Text>代取快递</Text><Text>默认记住常用取件点</Text></View><Text>›</Text></View>
      <View onClick={() => begin("校内帮送")}><Image src={scooterIcon}/><View><Text>校内帮送</Text><Text>文件和物品校内送达</Text></View><Text>›</Text></View>
    </View>

    <View className="errand-safety"><Text>隐私提醒</Text><Text>取件码、手机号不要写在公开需求里，接单后通过校内聊天发送。</Text></View>

    {showForm && <View className="errand-publish-card">
      <View className="errand-form-head"><View><Text>发布需求</Text><Text>常用信息会自动记住，下次更快</Text></View><Text onClick={() => setShowForm(false)}>收起</Text></View>
      <View className="errand-step"><Text>1</Text><View><Text>要做什么</Text><View className="errand-choice-row">{(["代取快递", "校内帮送"] as TaskKind[]).map(kind => <Text key={kind} className={form.taskKind === kind ? "active" : ""} onClick={() => setForm(current => ({...current, taskKind: kind}))}>{kind}</Text>)}</View></View></View>
      <View className="errand-step"><Text>2</Text><View><Text>从哪里取</Text><Input value={form.pickupPlace} maxlength={80} placeholder="填写驿站、快递柜或取物地点" onInput={event => setForm(current => ({...current, pickupPlace: event.detail.value}))}/><View className="errand-choice-row compact">{pickupOptions.map(place => <Text key={place} className={form.pickupPlace === place ? "active" : ""} onClick={() => setForm(current => ({...current, pickupPlace: place}))}>{place}</Text>)}</View></View></View>
      <View className="errand-step"><Text>3</Text><View><Text>送到哪里</Text><Input value={form.deliveryPlace} maxlength={80} placeholder="如：3号宿舍楼下" onInput={event => setForm(current => ({...current, deliveryPlace: event.detail.value}))}/><View className="errand-choice-row compact">{deliveryOptions.map(place => <Text key={place} className={form.deliveryPlace === place ? "active" : ""} onClick={() => setForm(current => ({...current, deliveryPlace: place}))}>{place}</Text>)}</View></View></View>
      <View className="errand-form-grid">
        <View><Text>希望多久送到</Text><View className="errand-choice-row compact">{deadlineOptions.map(value => <Text key={value} className={form.deadline === value ? "active" : ""} onClick={() => setForm(current => ({...current, deadline: value}))}>{value}</Text>)}</View></View>
        <View><Text>给跑腿同学的酬金</Text><View className="errand-choice-row compact reward">{rewardOptions.map(value => <Text key={value} className={form.reward === value ? "active" : ""} onClick={() => setForm(current => ({...current, reward: value}))}>¥{value}</Text>)}</View><Input className="errand-reward-input" type="digit" value={form.reward} maxlength={5} placeholder="其他金额" onInput={event => setForm(current => ({...current, reward: event.detail.value}))}/></View>
      </View>
      <Textarea className="errand-note" value={form.description} maxlength={200} placeholder="备注（选填）：包裹数量、大小、楼栋入口等；不要填写取件码" onInput={event => setForm(current => ({...current, description: event.detail.value}))}/>
      <View className="errand-publish-summary"><Text>{form.pickupPlace || "取件点"} → {form.deliveryPlace || "送达位置"}</Text><Text>线下酬金 ¥{form.reward || "0"}</Text></View>
      <Button className="errand-publish-button" loading={acting === "publish"} disabled={Boolean(acting)} onClick={submit}>一键发布</Button>
      <Text className="errand-offline-note">平台暂不代收酬金，请在交接完成后由双方线下结算。</Text>
    </View>}

    <View className="v2-chip-row errand-tabs">{(["任务大厅", "我发布的", "我接到的", "已完成"] as TabName[]).map(item => <Text key={item} className={`v2-chip ${tab === item ? "active" : ""}`} onClick={() => {setTab(item); setShowForm(false)}}>{item}</Text>)}</View>
    <View className="v2-section-head"><View><Text>{tab === "任务大厅" ? "附近待接" : tab}</Text><Text>{tab === "任务大厅" ? "同校区任务，先沟通再交接" : "任务状态会实时更新"}</Text></View><Text>{filtered.length} 条</Text></View>

    <View className="v2-list">{filtered.map(item => {
      const kind = taskKindOf(item)
      const ownConfirmed = item.mine ? item.creator_confirmed_at : item.runner_confirmed_at
      return <View className={`errand-task v2-card status-${item.status}`} key={item.id}>
        <View className="errand-task-top"><View className="errand-task-icon"><Image src={kind === "代取快递" ? packageIcon : scooterIcon}/></View><View className="errand-task-heading"><View><Text>{kind}</Text><Text className={`errand-status ${item.status}`}>{statusLabel(item)}</Text></View><Text>{item.title}</Text></View><Text className="errand-price">¥{item.reward}</Text></View>
        <View className="errand-route"><View><Text>取</Text><Text>{item.pickup_place}</Text></View><View className="errand-route-line"/><View><Text>送</Text><Text>{item.delivery_place}</Text></View></View>
        <Text className="errand-description">{item.description}</Text>
        <View className="errand-meta"><Text>{item.deadline || "尽快送达"}</Text><Text>{item.status === "claimed" && item.runner_name ? `${item.runner_name}配送中` : item.mine ? "我发布的" : `${item.creator_name || "校园同学"}发布`}</Text><Text>同校区</Text></View>
        {item.status === "claimed" && <View className="errand-progress"><View className={item.runner_confirmed_at ? "done" : "active"}><Text>1</Text><Text>跑腿同学送达</Text></View><View/><View className={item.creator_confirmed_at ? "done" : item.runner_confirmed_at ? "active" : ""}><Text>2</Text><Text>发布人确认收到</Text></View></View>}
        <View className="errand-task-actions">
          {item.status === "open" && !item.mine && <><Button className="secondary" disabled={Boolean(acting)} onClick={() => startChat(item)}>先聊聊</Button><Button className="primary" loading={acting === `${item.id}-claim`} disabled={Boolean(acting)} onClick={() => claim(item)}>我要接单</Button></>}
          {item.status === "open" && item.mine && <Button className="danger-light" loading={acting === `${item.id}-cancel`} disabled={Boolean(acting)} onClick={() => cancel(item)}>撤销需求</Button>}
          {item.status === "claimed" && (item.mine || item.accepted_by_me) && <Button className="secondary" disabled={Boolean(acting)} onClick={() => startChat(item)}>去沟通</Button>}
          {item.status === "claimed" && !ownConfirmed && <Button className="primary" loading={acting === `${item.id}-complete`} disabled={Boolean(acting)} onClick={() => confirmComplete(item)}>{item.mine ? "确认已收到" : "确认已送达"}</Button>}
          {item.status === "claimed" && ownConfirmed && <Text className="errand-waiting">你已确认，等待对方</Text>}
          {item.status === "claimed" && item.accepted_by_me && !item.runner_confirmed_at && !item.creator_confirmed_at && <Button className="text-button" loading={acting === `${item.id}-release`} disabled={Boolean(acting)} onClick={() => release(item)}>放弃接单</Button>}
        </View>
      </View>
    })}</View>
    {!loading && filtered.length === 0 && <View className="errand-empty"><Image src={packageIcon}/><Text>{tab === "任务大厅" ? "当前校区暂时没有待接任务" : "这里还没有相关任务"}</Text><Text>{tab === "任务大厅" ? "你可以先发布一条代取需求" : "完成操作后，任务会出现在这里"}</Text>{tab === "任务大厅" && <Button onClick={() => begin("代取快递")}>发布代取快递</Button>}</View>}
    {loading && <View className="errand-loading">正在加载同校区任务…</View>}
    <ServiceDock labels={["任务大厅", "我的任务", "发布"]} active={showForm ? 2 : tab === "任务大厅" ? 0 : 1} onSelect={dock}/>
  </View>
}
