import {useMemo, useState} from "react"
import {Button, Image, Input, Text, Textarea, View} from "@tarojs/components"
import Taro, {useDidShow} from "@tarojs/taro"
import ServiceDock from "../../components/ServiceDock"
import ServiceMiniHeader from "../../components/ServiceMiniHeader"
import {apiRequest, hasPhoneLogin, requirePhoneLogin, showApiError, uploadMedia} from "../../api/client"
import packageIcon from "../../assets/icons/services/service-08.mini.webp"
import shieldIcon from "../../assets/icons/services/service-07.mini.webp"
import {parseExpressNoticeText, type ExpressNoticeDraft} from "../../utils/expressNotice"
import "../service-shared.css"
import "../service-visual-v2.css"
import "./index.css"

type Package = {id: string; carrier: string; tracking_no: string; pickup_code: string; station: string; status: string; source?: string; created_at: string}
type Binding = {phoneMasked: string; providerStatus: "pending_provider" | "active" | "paused"; boundAt: string; updatedAt: string}
type BindingResult = {binding: Binding | null; autoSyncReady: boolean; providerName: string}
type NoticeDraft = ExpressNoticeDraft

export default function ExpressPage() {
  const [items, setItems] = useState<Package[]>([])
  const [bindingState, setBindingState] = useState<BindingResult>({binding: null, autoSyncReady: false, providerName: "学校快递驿站"})
  const [tab, setTab] = useState<"待取" | "取件历史">("待取")
  const [loading, setLoading] = useState(true)
  const [acting, setActing] = useState(false)
  const [recognizing, setRecognizing] = useState(false)
  const [savingNotice, setSavingNotice] = useState(false)
  const [reviewDraft, setReviewDraft] = useState<NoticeDraft | null>(null)
  const [noticeText, setNoticeText] = useState("")

  const load = async () => {
    setLoading(true)
    if (!hasPhoneLogin()) {
      setItems([])
      setBindingState({binding: null, autoSyncReady: false, providerName: "学校快递驿站"})
      setReviewDraft(null)
      setNoticeText("")
      setLoading(false)
      return
    }
    try {
      const [packages, binding] = await Promise.all([
        apiRequest<{items: Package[]}>("/express/packages"),
        apiRequest<BindingResult>("/express/binding")
      ])
      setItems(packages.items)
      setBindingState(binding)
    } catch (error) {
      showApiError(error)
    } finally {
      setLoading(false)
    }
  }
  useDidShow(load)

  const bindPhone = async (event: {detail?: {code?: string; errMsg?: string}}) => {
    if (!await requirePhoneLogin("登录后才能绑定收件手机号并保存个人包裹。")) return
    const code = event.detail?.code || ""
    if (!code) {
      if (event.detail?.errMsg?.includes("deny")) Taro.showToast({title: "你已取消手机号授权", icon: "none"})
      else Taro.showToast({title: "未取得微信手机号授权，请重试", icon: "none"})
      return
    }
    setActing(true)
    try {
      const result = await apiRequest<BindingResult>("/express/binding", {method: "POST", data: {code}})
      setBindingState(result)
      await Taro.showModal({
        title: "绑定成功",
        content: result.autoSyncReady
          ? `已绑定 ${result.binding?.phoneMasked}。今后驿站入库后，取件码会自动出现在这里。`
          : `已绑定 ${result.binding?.phoneMasked}。当前还在等待学校驿站接入，接通前不会生成虚假取件码。`,
        showCancel: false
      })
      await load()
    } catch (error) {
      showApiError(error)
    } finally {
      setActing(false)
    }
  }

  const unbind = async () => {
    if (!await requirePhoneLogin("登录后才能管理个人快递绑定。")) return
    const result = await Taro.showModal({title: "解除快递绑定？", content: "解绑后新的到件信息将不再自动同步，已有取件记录会保留。", confirmText: "确认解绑", confirmColor: "#df5b5b"})
    if (!result.confirm) return
    setActing(true)
    try {
      await apiRequest("/express/binding", {method: "DELETE"})
      setBindingState(current => ({...current, binding: null, autoSyncReady: false}))
      Taro.showToast({title: "已解除绑定", icon: "success"})
    } catch (error) {
      showApiError(error)
    } finally {
      setActing(false)
    }
  }

  const showPickupCode = async (item: Package) => {
    if (!await requirePhoneLogin("登录后才能查看个人取件码。")) return
    if (!item.pickup_code) return Taro.showModal({title: "取件码尚未同步", content: "请稍后刷新，或联系所在驿站核实。", showCancel: false})
    const result = await Taro.showModal({title: "取件码", content: `${item.pickup_code}\n${item.station || "校内快递点"}`, confirmText: "复制取件码", cancelText: "关闭"})
    if (result.confirm) await Taro.setClipboardData({data: item.pickup_code})
  }

  const reviewNotice = (item: NoticeDraft) => {
    setReviewDraft(item)
    Taro.pageScrollTo({scrollTop: 0, duration: 220})
    Taro.showToast({title: "识别完成，请确认", icon: "none"})
  }

  const updateDraft = (field: keyof NoticeDraft, value: string) => {
    setReviewDraft(current => current ? {...current, [field]: value} : current)
  }

  const saveNotice = async () => {
    if (!await requirePhoneLogin("登录后才能保存识别出的个人包裹。")) return
    if (!reviewDraft || savingNotice) return
    const item = {
      ...reviewDraft,
      carrier: reviewDraft.carrier.trim() || "快递包裹",
      trackingNo: reviewDraft.trackingNo.trim(),
      pickupCode: reviewDraft.pickupCode.trim(),
      station: reviewDraft.station.trim()
    }
    if (!item.pickupCode) return Taro.showToast({title: "请确认取件码", icon: "none"})
    if (!item.station) return Taro.showToast({title: "请确认取件点", icon: "none"})
    setSavingNotice(true)
    try {
      await apiRequest("/express/import-notice", {method: "POST", data: item})
      setReviewDraft(null)
      await load()
      Taro.showToast({title: "取件码已导入", icon: "success"})
    } catch (error) {
      showApiError(error)
    } finally {
      setSavingNotice(false)
    }
  }

  const recognizeNoticeText = async (content: string) => {
    const text = content.trim()
    if (!text) return Taro.showToast({title: "请先复制或粘贴完整的到件通知", icon: "none"})
    setNoticeText(text)
    const localItem = parseExpressNoticeText(text)
    if (localItem) return reviewNotice(localItem)
    const result = await apiRequest<{item: NoticeDraft}>("/express/recognize-notice", {
      method: "POST",
      data: {text},
      timeoutMs: 60_000
    })
    reviewNotice(result.item)
  }

  const recognizeClipboard = async () => {
    if (recognizing) return
    if (!await requirePhoneLogin("登录后才能识别并保存你的快递通知。")) return
    setRecognizing(true)
    try {
      const clipboard = await Taro.getClipboardData()
      const content = String(clipboard.data || "").trim()
      await recognizeNoticeText(content)
    } catch (error) {
      showApiError(error)
    } finally {
      setRecognizing(false)
    }
  }

  const recognizePastedText = async () => {
    if (recognizing) return
    if (!await requirePhoneLogin("登录后才能识别并保存你的快递通知。")) return
    setRecognizing(true)
    try {
      await recognizeNoticeText(noticeText)
    } catch (error) {
      showApiError(error)
    } finally {
      setRecognizing(false)
    }
  }

  const recognizeScreenshot = async () => {
    if (recognizing) return
    if (!await requirePhoneLogin("登录后才能识别并保存你的快递通知。")) return
    try {
      const selection = await Taro.chooseImage({count: 1, sizeType: ["compressed"], sourceType: ["album", "camera"]})
      const filePath = selection.tempFilePaths[0]
      if (!filePath) return
      setRecognizing(true)
      Taro.showLoading({title: "正在识别取件码", mask: true})
      const imageUrl = await uploadMedia(filePath)
      const result = await apiRequest<{item: NoticeDraft}>("/express/recognize-notice", {
        method: "POST",
        data: {imageUrl},
        timeoutMs: 60_000
      })
      Taro.hideLoading()
      reviewNotice(result.item)
    } catch (error) {
      Taro.hideLoading()
      const message = error instanceof Error ? error.message : String(error || "")
      if (!/cancel/i.test(message)) showApiError(error)
    } finally {
      setRecognizing(false)
    }
  }

  const picked = async (item: Package) => {
    const result = await Taro.showModal({title: "确认已取件？", content: `${item.carrier} · ${item.pickup_code || item.tracking_no}`, confirmText: "确认取件", confirmColor: "#167fbd"})
    if (!result.confirm) return
    try {
      await apiRequest(`/express/packages/${item.id}/picked`, {method: "PATCH"})
      await load()
      Taro.showToast({title: "已放入取件历史", icon: "success"})
    } catch (error) {
      showApiError(error)
    }
  }

  const waiting = useMemo(() => items.filter(item => item.status !== "picked"), [items])
  const history = useMemo(() => items.filter(item => item.status === "picked"), [items])
  const visible = tab === "待取" ? waiting : history
  const binding = bindingState.binding
  const statusText = !binding
    ? (bindingState.autoSyncReady ? "绑定后自动接收" : "未来自动同步")
    : bindingState.autoSyncReady
      ? "自动同步已开启"
      : "已绑定 · 等待驿站接入"

  const dock = (index: number) => {
    if (index === 0) setTab("待取")
    if (index === 1) setTab("取件历史")
    if (index === 2) {
      Taro.pageScrollTo({scrollTop: 0, duration: 250})
      Taro.showToast({title: binding ? "快递绑定在页面顶部" : "请在顶部完成绑定", icon: "none"})
    }
  }

  return <View className="service-v2 theme-express">
    <ServiceMiniHeader title="我的快递" badge="一键识别"/>

    <View className="express-import-hero">
      <View className="express-import-copy"><Text>复制短信，一键识别</Text><Text>自动提取快递公司、取件码和取件点</Text></View>
      <View className="express-import-actions">
        <Button loading={recognizing} onClick={recognizeClipboard}>识别复制短信</Button>
        <Button disabled={recognizing} onClick={recognizeScreenshot}>识别通知截图</Button>
      </View>
      <View className="express-paste-fallback">
        <Textarea value={noticeText} maxlength={2000} autoHeight placeholder="若剪贴板读取失败，可在这里长按粘贴到件通知" onInput={event => setNoticeText(event.detail.value)}/>
        <Button loading={recognizing} disabled={!noticeText.trim()} onClick={recognizePastedText}>识别文字</Button>
      </View>
      <Text>识别结果会先让你确认，不会读取短信，也不会擅自添加包裹</Text>
    </View>

    {reviewDraft && <View className="express-review-card">
      <View className="express-review-head">
        <View><Text>确认取件信息</Text><Text>只有点击“确认导入”后才会保存</Text></View>
        <Text onClick={() => setReviewDraft(null)}>取消</Text>
      </View>
      <View className="express-review-grid">
        <View><Text>快递公司</Text><Input value={reviewDraft.carrier} maxlength={30} placeholder="例如：中通" onInput={event => updateDraft("carrier", event.detail.value)}/></View>
        <View><Text>取件码</Text><Input value={reviewDraft.pickupCode} maxlength={40} placeholder="请确认取件码" onInput={event => updateDraft("pickupCode", event.detail.value)}/></View>
        <View className="wide"><Text>取件点</Text><Input value={reviewDraft.station} maxlength={80} placeholder="例如：北院菜鸟驿站" onInput={event => updateDraft("station", event.detail.value)}/></View>
        <View className="wide optional"><Text>运单号（可选）</Text><Input value={reviewDraft.trackingNo} maxlength={80} placeholder="短信中没有可不填" onInput={event => updateDraft("trackingNo", event.detail.value)}/></View>
      </View>
      <Button loading={savingNotice} onClick={saveNotice}>确认导入到待取件</Button>
    </View>}

    <View className={`express-binding ${binding ? "bound" : ""}`}>
      <View className="express-binding-icon"><Image src={shieldIcon}/></View>
      <View className="express-binding-copy">
        <View><Text>{binding ? binding.phoneMasked : "绑定收件手机号"}</Text><Text>{statusText}</Text></View>
        <Text>{bindingState.autoSyncReady ? `${bindingState.providerName}入库后，自动展示真实取件码` : "需要学校驿站或物流服务商授权后才能开放"}</Text>
      </View>
      {!binding
        ? (bindingState.autoSyncReady
          ? <Button className="express-bind-button" openType="getPhoneNumber" onGetPhoneNumber={bindPhone} loading={acting}>微信绑定</Button>
          : <Text className="express-disabled">暂未开放</Text>)
        : <Text className="express-unbind" onClick={unbind}>管理</Text>}
    </View>

    <View className="express-trust-line"><Text>隐私保护</Text><Text>手机号和取件码加密保存，仅用于当前校区匹配到件信息</Text></View>

    <View className="express-overview">
      <View><Text>{waiting.length}</Text><Text>待取包裹</Text></View>
      <View><Text>{history.length}</Text><Text>取件历史</Text></View>
      <View onClick={load}><Text>{loading ? "…" : "刷新"}</Text><Text>同步状态</Text></View>
    </View>

    <View className="express-switch">
      <Text className={tab === "待取" ? "active" : ""} onClick={() => setTab("待取")}>待取件</Text>
      <Text className={tab === "取件历史" ? "active" : ""} onClick={() => setTab("取件历史")}>取件历史</Text>
    </View>

    {visible.length > 0
      ? <View className="express-list">{visible.map(item => <View className="express-package-card" key={item.id}>
          <View className="express-package-head">
            <View className="express-package-brand"><Image src={packageIcon}/><View><Text>{item.carrier}</Text><Text>{item.status === "picked" ? "已取件" : "已到站 · 等待取件"}</Text></View></View>
            <Text className={item.status === "picked" ? "picked" : "waiting"}>{item.status === "picked" ? "已完成" : "待取"}</Text>
          </View>
          <View className="express-package-body">
            <View><Text>取件码</Text><Text>{item.pickup_code || "待取件短信通知"}</Text></View>
            <View><Text>取件点</Text><Text>{item.station || "校内快递点"}</Text></View>
            <View><Text>运单</Text><Text>{item.tracking_no}</Text></View>
          </View>
          {item.status !== "picked" && <View className="express-package-actions">
            <Button onClick={() => showPickupCode(item)}>查看并复制取件码</Button>
            <Button onClick={() => picked(item)}>我已取件</Button>
          </View>}
        </View>)}</View>
      : <View className="express-empty">
          <Image src={packageIcon}/>
          <Text>{tab === "取件历史" ? "还没有取件记录" : "复制短信后，取件码集中显示"}</Text>
          <Text>{tab === "取件历史" ? "完成取件后会自动保留在这里" : "复制完整到件短信，再点一次识别即可"}</Text>
        </View>}

    <ServiceDock labels={["待取", "历史", "绑定"]} active={tab === "待取" ? 0 : 1} onSelect={dock}/>
  </View>
}
