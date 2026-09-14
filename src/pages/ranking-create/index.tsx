import {useState} from "react"
import {Button, Image, Input, Text, Textarea, View} from "@tarojs/components"
import Taro from "@tarojs/taro"
import {requirePhoneLogin, showApiError} from "../../api/client"
import {createRankingList} from "../../store/rankings"
import {currentCampusName, currentTenant} from "../../store/tenant"
import plusIcon from "../../assets/icons/svg/circle-plus.svg"
import "./index.css"

export default function RankingCreatePage() {
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [entryLabel, setEntryLabel] = useState("")
  const [cover, setCover] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const tenant = currentTenant()
  const campusName = currentCampusName()

  const chooseCover = async () => {
    try {
      const result = await Taro.chooseMedia({count: 1, mediaType: ["image"], sourceType: ["album", "camera"], sizeType: ["compressed"]})
      const path = result.tempFiles[0]?.tempFilePath
      if (path) setCover(path)
    } catch {
      // The native picker was cancelled.
    }
  }

  const submit = async () => {
    const cleanTitle = title.trim()
    const cleanDescription = description.trim()
    const cleanEntryLabel = entryLabel.trim()
    if (!cleanTitle || !cleanDescription || !cleanEntryLabel || !cover) {
      Taro.showToast({title: "请补全名称、介绍、项目称呼和封面", icon: "none"})
      return
    }
    if (cleanTitle.length > 20 || cleanDescription.length > 80 || cleanEntryLabel.length > 8) {
      Taro.showToast({title: "内容有点长，请按提示精简", icon: "none"})
      return
    }
    if (!await requirePhoneLogin("登录后才能创建校园榜单。")) return
    setSubmitting(true)
    try {
      await createRankingList({title: cleanTitle, description: cleanDescription, entryLabel: cleanEntryLabel, coverPath: cover})
      await Taro.showModal({title: "榜单已提交", content: "管理员审核通过后，同校同学就能看到榜单并上传内容。", showCancel: false, confirmText: "知道了"})
      Taro.navigateBack()
    } catch (error) {
      showApiError(error)
    } finally {
      setSubmitting(false)
    }
  }

  return <View className="page ranking-create-page">
    <View className="ranking-create-topbar"><Button onClick={() => Taro.navigateBack()}>返回</Button><Text>创建新榜单</Text><Text>{campusName}</Text></View>
    <View className="ranking-create-hero"><Text>让全校同学一起排</Text><Text>例如“校园小动物排行榜”“最美晚霞”“宿舍神器”。榜单通过审核后对{tenant.shortName}全部校区开放。</Text></View>
    <View className="ranking-create-examples"><Text>校园小动物排行榜</Text><Text>最美晚霞</Text><Text>自习宝地</Text></View>
    <View className="ranking-create-form">
      <View className="ranking-create-field"><View><Text>榜单名称</Text><Text>{title.length}/20</Text></View><Input maxlength={20} value={title} placeholder="例如：校园小动物排行榜" onInput={event => setTitle(event.detail.value)}/></View>
      <View className="ranking-create-field"><View><Text>榜单介绍</Text><Text>{description.length}/80</Text></View><Textarea maxlength={80} value={description} placeholder="说清楚这个榜单要评什么，什么内容可以参加" onInput={event => setDescription(event.detail.value)}/></View>
      <View className="ranking-create-field"><View><Text>参榜项目怎么称呼</Text><Text>{entryLabel.length}/8</Text></View><Input maxlength={8} value={entryLabel} placeholder="例如：小动物、晚霞、地点" onInput={event => setEntryLabel(event.detail.value)}/><Text className="ranking-create-help">通过后按钮会显示“上传小动物”或“上传晚霞”。</Text></View>
      <View className="ranking-create-field"><View><Text>榜单封面</Text><Text>必填 · 1张</Text></View>{cover ? <View className="ranking-create-cover"><Image src={cover} mode="aspectFill"/><View><Button onClick={chooseCover}>更换</Button><Button onClick={() => setCover("")}>移除</Button></View></View> : <View className="ranking-create-picker" onClick={chooseCover}><Image src={plusIcon}/><Text>上传真实封面</Text><Text>建议使用与榜单主题相关的清晰横图</Text></View>}</View>
    </View>
    <View className="ranking-create-policy"><Text>创建规则</Text><Text>不接受广告引流、联系方式、针对个人的恶意排名、侵犯隐私或可能伤害动物的内容。榜单和后续参榜内容均由学校管理员审核。</Text></View>
    <Button className="ranking-create-primary" loading={submitting} disabled={submitting} onClick={submit}>{submitting ? "正在提交…" : "提交榜单审核"}</Button>
  </View>
}
