import {useState} from "react"
import {Button, Image, Input, Text, Textarea, View} from "@tarojs/components"
import Taro from "@tarojs/taro"
import {communityChannels} from "../../data/community"
import {addCommunityPostRemote} from "../../store/community"
import {showApiError} from "../../api/client"
import "./index.css"

const topics = communityChannels.filter(item => item !== "推荐")

export default function PublishPage() {
  const [topic, setTopic] = useState(topics[0])
  const [content, setContent] = useState("")
  const [location, setLocation] = useState("唐山学院")
  const [image, setImage] = useState("")
  const [submitting, setSubmitting] = useState(false)

  const chooseImage = async () => {
    try {
      const result = await Taro.chooseImage({count: 1, sizeType: ["compressed"], sourceType: ["album", "camera"]})
      const path = result.tempFilePaths?.[0]
      if (path) setImage(path)
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
    setSubmitting(true)
    try {
      await addCommunityPostRemote({channel: topic, content, image: image || undefined, location})
      Taro.showToast({title: "发布成功", icon: "success"})
      setTimeout(() => Taro.navigateBack(), 450)
    } catch (error) {
      showApiError(error)
      setSubmitting(false)
    }
  }

  return (
    <View className="page publish-page">
      <Text className="publish-kicker">STARDUST · CREATE</Text>
      <Text className="publish-title">分享此刻校园</Text>
      <Text className="publish-tip">友善表达，不公开他人隐私与联系方式</Text>

      <View className="topic-row">
        {topics.map(item => (
          <Text key={item} className={topic === item ? "active" : ""} onClick={() => setTopic(item)}>{item}</Text>
        ))}
      </View>

      <View className="publish-box card">
        <Textarea
          value={content}
          onInput={event => setContent(event.detail.value)}
          maxlength={500}
          placeholder="记录校园生活，分享有用信息……"
        />

        {image ? (
          <View className="selected-image-wrap">
            <Image className="selected-image" src={image} mode="aspectFill"/>
            <Text className="remove-image" onClick={() => setImage("")}>删除</Text>
          </View>
        ) : (
          <View className="upload-entry" onClick={chooseImage}>
            <Text>＋</Text>
            <Text>添加图片</Text>
          </View>
        )}

        <View className="location-row">
          <Text>⌖</Text>
          <Input value={location} maxlength={30} onInput={event => setLocation(event.detail.value)} placeholder="添加校园位置"/>
        </View>
        <View className="publish-meta"><Text>内容发布后可在首页和校园圈看到</Text><Text>{content.length}/500</Text></View>
      </View>

      <View className="publish-rules">
        <Text>发布须知</Text>
        <Text>禁止广告刷屏、辱骂攻击、虚假兼职、违规交易及侵犯隐私的内容。正式运营版本需接入内容安全审核。</Text>
      </View>

      <Button className="publish-submit" loading={submitting} disabled={submitting} onClick={submit}>发布到校园圈</Button>
    </View>
  )
}
