import {useState} from "react"
import {Button, Image, Input, Text, Textarea, View} from "@tarojs/components"
import Taro, {useDidShow} from "@tarojs/taro"
import {communityChannels} from "../../data/community"
import {addCommunityPostRemote} from "../../store/community"
import {requirePhoneLogin, showApiError} from "../../api/client"
import {currentCampusName} from "../../store/tenant"
import locationIcon from "../../assets/icons/community/map-pin.svg"
import {COMMUNITY_POST_IMAGE_LIMIT, findBlockedCommunityTerm} from "../../utils/communityPolicy"
import "./index.css"

const topics = communityChannels.filter(item => item !== "推荐")

export default function PublishPage() {
  const [topic, setTopic] = useState(topics[0])
  const [contextTag, setContextTag] = useState("")
  const [content, setContent] = useState("")
  const [location, setLocation] = useState(currentCampusName())
  const [images, setImages] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [accepted, setAccepted] = useState(false)
  const canSubmit = content.trim().length >= 5 && accepted && !submitting
  useDidShow(() => {
    void requirePhoneLogin("登录后才能发布校园动态，登录后内容会保存在你的账号下。")
    const pendingTopic = Taro.getStorageSync<string>("stardust_publish_pending_topic")
    if (pendingTopic && topics.includes(pendingTopic)) {
      setTopic(pendingTopic)
    }
    setContextTag("")
    Taro.removeStorageSync("stardust_publish_pending_topic")
    Taro.removeStorageSync("stardust_publish_pending_tag")
  })

  const chooseImage = async () => {
    if (images.length >= COMMUNITY_POST_IMAGE_LIMIT) {
      Taro.showToast({title: `最多添加 ${COMMUNITY_POST_IMAGE_LIMIT} 张图片`, icon: "none"})
      return
    }
    try {
      const result = await Taro.chooseImage({count: COMMUNITY_POST_IMAGE_LIMIT - images.length, sizeType: ["compressed"], sourceType: ["album", "camera"]})
      const paths = (result.tempFilePaths || []).filter(Boolean)
      if (paths.length) setImages(current => [...current, ...paths.filter(path => !current.includes(path))].slice(0, COMMUNITY_POST_IMAGE_LIMIT))
    } catch (error) {
      const message = String((error as {errMsg?: string})?.errMsg || error)
      if (!message.includes("cancel")) Taro.showToast({title: "暂时无法选择图片", icon: "none"})
    }
  }

  const submit = async () => {
    if (submitting) return
    if (content.trim().length < 5) {
      Taro.showToast({title: "至少写 5 个字吧", icon: "none"})
      return
    }
    if (!accepted) {
      Taro.showToast({title: "请先确认发布规范", icon: "none"})
      return
    }
    if (findBlockedCommunityTerm(`${content}\n${location}`)) {
      Taro.showToast({title: "内容包含不允许发布的词语，请修改后再试", icon: "none", duration: 3600})
      return
    }
    setSubmitting(true)
    try {
      const result = await addCommunityPostRemote({channel: topic, tag: contextTag || undefined, content, images, location})
      Taro.setStorageSync("stardust_community_scope", "public")
      Taro.setStorageSync("stardust_community_pending_channel", topic)
      await Taro.showModal({
        title: "发布成功",
        content: "内容已经直接发布到当前学校的校园圈，管理员可根据社区规范进行管理。",
        showCancel: false,
        confirmText: "去校园圈"
      })
      Taro.switchTab({url: "/pages/community/index"})
    } catch (error) {
      showApiError(error)
      setSubmitting(false)
    }
  }

  return (
    <View className={`page publish-page ${contextTag ? "lost-context-page" : ""}`}>
      <Text className="publish-kicker">{contextTag ? "CAMPUS · LOST & FOUND" : "CAMPUS · CREATE"}</Text>
      <Text className="publish-title">{contextTag === "寻物" ? "发布寻物线索" : contextTag === "招领" ? "发布招领线索" : "分享此刻校园"}</Text>
      <Text className="publish-tip">{contextTag ? "写清物品特征、时间和地点，请勿公开完整证件号码" : "友善表达，不公开他人隐私与联系方式"}</Text>

      {!contextTag && <View className="topic-row">
        {topics.map(item => (
          <Text key={item} className={topic === item ? "active" : ""} onClick={() => setTopic(item)}>{item}</Text>
        ))}
      </View>}

      {contextTag && <View className="lost-publish-context card">
        <Text>{contextTag === "寻物" ? "正在寻找" : "等待失主"}</Text>
        <Text>{contextTag === "寻物" ? "建议写：物品名称 + 外观特征 + 遗失时间" : "建议写：物品名称 + 拾取地点 + 保管方式"}</Text>
      </View>}

      <View className="publish-box card">
        <Textarea
          value={content}
          onInput={event => setContent(event.detail.value)}
          maxlength={500}
          placeholder={contextTag === "寻物" ? "例：遗失黑色钥匙包，今天中午可能落在图书馆二层……" : contextTag === "招领" ? "例：在一食堂门口捡到校园卡，请提供有效特征核对……" : "记录校园生活，分享有用信息……"}
        />

        {images.length ? (
          <View className={`selected-image-grid count-${images.length}`}>
            {images.map((source, index) => <View className="selected-image-wrap" key={source}>
              <Image className="selected-image" src={source} mode="aspectFill"/>
              <Text className="remove-image" onClick={() => setImages(current => current.filter((_, itemIndex) => itemIndex !== index))}>删除</Text>
            </View>)}
            {images.length < COMMUNITY_POST_IMAGE_LIMIT && <View className="upload-entry is-inline" onClick={chooseImage}><Text>继续添加</Text><Text>{images.length}/{COMMUNITY_POST_IMAGE_LIMIT}</Text></View>}
          </View>
        ) : (
          <View className="upload-entry" onClick={chooseImage}>
            <Text>添加图片</Text>
            <Text>最多 {COMMUNITY_POST_IMAGE_LIMIT} 张</Text>
          </View>
        )}

        <View className="location-row">
          <Image src={locationIcon}/>
          <Input value={location} maxlength={30} onInput={event => setLocation(event.detail.value)} placeholder="添加校园位置"/>
        </View>
        <View className="publish-meta"><Text>内容发布后可在首页和校园圈看到</Text><Text>{content.length}/500</Text></View>
      </View>

      <View className="publish-rules">
        <Text>发布须知</Text>
        <Text>禁止广告刷屏、辱骂攻击、虚假兼职、违规交易及侵犯隐私的内容。请勿公开手机号、学号、宿舍号等个人信息。</Text>
      </View>

      <View className={`publish-agreement ${accepted ? "accepted" : ""}`} onClick={() => setAccepted(value => !value)}>
        <Text>{accepted ? "✓" : ""}</Text>
        <Text>我已阅读发布规范，并确认内容不包含他人隐私或联系方式</Text>
      </View>

      <Button className="publish-submit" loading={submitting} disabled={!canSubmit} aria-disabled={!canSubmit} onClick={submit}>
        {submitting ? "正在发布" : contextTag ? "发布线索" : "发布到校园圈"}
      </Button>
      <Text className="publish-review-note">发布后立即向本校同学展示；违规内容可能被管理员删除。</Text>
    </View>
  )
}
