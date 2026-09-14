import {useState} from "react"
import {Button, Image, Input, Text, Textarea, View} from "@tarojs/components"
import Taro, {useDidShow, useRouter} from "@tarojs/taro"
import {showApiError} from "../../api/client"
import {fetchRankingLists, submitRankingPlace, type RankingList} from "../../store/rankings"
import {currentCampusName, currentTenant} from "../../store/tenant"
import buildingIcon from "../../assets/icons/community/building-community.svg"
import mapPinIcon from "../../assets/icons/community/map-pin.svg"
import plusIcon from "../../assets/icons/svg/circle-plus.svg"
import "./index.css"

const defaultLists: RankingList[] = [
  {id: "food", title: "美食", description: "餐厅、小吃与聚餐地点", entryLabel: "地点", coverUrl: "", builtIn: true, mine: false, status: "active", moderationNote: "", itemCount: 0, createdAt: null},
  {id: "fun", title: "玩乐", description: "散步、看展与周末去处", entryLabel: "地点", coverUrl: "", builtIn: true, mine: false, status: "active", moderationNote: "", itemCount: 0, createdAt: null},
  {id: "life", title: "生活", description: "自习、办事与便利服务", entryLabel: "地点", coverUrl: "", builtIn: true, mine: false, status: "active", moderationNote: "", itemCount: 0, createdAt: null}
]

export default function RankingSubmitPage() {
  const route = useRouter()
  const [lists, setLists] = useState<RankingList[]>(defaultLists)
  const [listId, setListId] = useState(String(route.params.listId || "life"))
  const [name, setName] = useState("")
  const [location, setLocation] = useState("")
  const [note, setNote] = useState("")
  const [cover, setCover] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const tenant = currentTenant()
  const campusName = currentCampusName()
  const selectedList = lists.find(item => item.id === listId) || lists[0] || defaultLists[2]

  useDidShow(() => {
    void (async () => {
      try {
        const result = await fetchRankingLists()
        const available = result.items.filter(item => item.status === "active")
        setLists(available)
        if (!available.some(item => item.id === listId)) setListId(available[0]?.id || "life")
      } catch (error) {
        showApiError(error)
      }
    })()
  })

  const chooseCover = async () => {
    try {
      const result = await Taro.chooseMedia({
        count: 1,
        mediaType: ["image"],
        sourceType: ["album", "camera"],
        sizeType: ["compressed"]
      })
      const path = result.tempFiles[0]?.tempFilePath
      if (path) setCover(path)
    } catch {
      // Cancelling the system picker needs no extra prompt.
    }
  }

  const submit = async () => {
    const cleanName = name.trim()
    const cleanLocation = location.trim()
    const cleanNote = note.trim()
    if (!cleanName || !cleanLocation || !cleanNote || !cover) {
      Taro.showToast({title: "请补全地点、位置、理由和真实照片", icon: "none"})
      return
    }
    if (cleanName.length > 30 || cleanLocation.length > 40 || cleanNote.length > 80) {
      Taro.showToast({title: "内容有点长，请按提示精简", icon: "none"})
      return
    }

    setSubmitting(true)
    try {
      await submitRankingPlace({listId, name: cleanName, location: cleanLocation, note: cleanNote, coverPath: cover})
      Taro.setStorageSync("stardust_ranking_pending_group", listId)
      await Taro.showToast({title: "已提交审核", icon: "success", duration: 1400})
      setTimeout(() => Taro.navigateBack(), 950)
    } catch (error) {
      showApiError(error)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <View className="page ranking-submit-page">
      <View className="ranking-submit-topbar">
        <Button onClick={() => Taro.navigateBack()}>返回</Button>
        <Text>上传{selectedList.entryLabel}</Text>
        <Text>{campusName}</Text>
      </View>

      <View className="ranking-submit-intro">
        <View className="ranking-submit-mark"><Image src={buildingIcon} /><Text>同学共建</Text></View>
        <Text>向“{selectedList.title}”提交{selectedList.entryLabel}</Text>
        <Text>审核通过后进入{tenant.shortName}全校榜单，内容会保留“{campusName}”校区标签。</Text>
      </View>

      <View className="ranking-submit-section">
        <View className="ranking-submit-label"><Text>选择榜单</Text><Text>{selectedList.description}</Text></View>
        <View className="ranking-submit-categories">
          {lists.map(item => <Text key={item.id} className={listId === item.id ? "active" : ""} onClick={() => setListId(item.id)}>{item.title}</Text>)}
        </View>
      </View>

      <View className="ranking-submit-form">
        <View className="ranking-submit-field">
          <Text>{selectedList.entryLabel}名称</Text>
          <Input maxlength={30} value={name} placeholder={`填写${selectedList.entryLabel}的准确名称`} onInput={event => setName(event.detail.value)} />
        </View>
        <View className="ranking-submit-field">
          <Text>发现位置</Text>
          <View className="ranking-location-input"><Image src={mapPinIcon} /><Input maxlength={40} value={location} placeholder="例如：南院图书馆门口" onInput={event => setLocation(event.detail.value)} /></View>
        </View>
        <View className="ranking-submit-field">
          <View className="ranking-submit-label"><Text>上榜理由</Text><Text>{note.length}/80</Text></View>
          <Textarea maxlength={80} value={note} placeholder={`说清楚这个${selectedList.entryLabel}为什么值得上榜，不填写联系方式`} onInput={event => setNote(event.detail.value)} />
        </View>
        <View className="ranking-submit-field">
          <View className="ranking-submit-label"><Text>真实照片</Text><Text>必填 · 1 张</Text></View>
          {cover ? (
            <View className="ranking-cover-preview">
              <Image src={cover} mode="aspectFill" />
              <View><Button onClick={chooseCover}>更换照片</Button><Button onClick={() => setCover("")}>移除</Button></View>
            </View>
          ) : (
            <View className="ranking-cover-picker" onClick={chooseCover}><Image src={plusIcon} /><Text>拍照或选择相册</Text><Text>请上传与{selectedList.entryLabel}相关的清晰真实照片</Text></View>
          )}
        </View>
      </View>

      <View className="ranking-submit-policy">
        <Text>提交规则</Text>
        <Text>不接受广告、虚假内容、盗用图片、联系方式或他人隐私。学校运营人员会核对内容和图片，通过后向同一学校全部校区公开。</Text>
        <Text>{tenant.name} · {campusName}</Text>
      </View>

      <Button className="ranking-submit-primary" loading={submitting} disabled={submitting} onClick={submit}>{submitting ? "正在提交…" : "提交审核"}</Button>
    </View>
  )
}
