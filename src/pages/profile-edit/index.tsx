import {Button, Image, Input, Text, Textarea, View} from "@tarojs/components"
import Taro, {useDidShow} from "@tarojs/taro"
import {useRef, useState} from "react"
import CampusAvatar from "../../components/CampusAvatar"
import {campusAvatars, defaultAvatarKey} from "../../data/avatars"
import {readAccount, refreshAccount, requirePhoneLogin, resolveMediaUrl, showApiError, updateProfile, uploadMedia} from "../../api/client"
import "./index.css"
import "./social.css"

export default function ProfileEditPage() {
  const cached = readAccount()
  const [nickname, setNickname] = useState(cached?.nickname || "校园同学")
  const [avatar, setAvatar] = useState(cached?.avatar || defaultAvatarKey(cached?.id || "校园同学"))
  const [background, setBackground] = useState(cached?.profileBackground || "")
  const [bio, setBio] = useState(cached?.profileBio || "")
  const [interests, setInterests] = useState<string[]>(cached?.profileInterests || [])
  const [interestInput, setInterestInput] = useState("")
  const [gallery, setGallery] = useState<string[]>(cached?.profileGallery || [])
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  // 选择相册/相机会让小程序页面再次触发 onShow。资料只在本次编辑页首次
  // 成功显示时同步一次，避免上传返回后用服务器旧值覆盖尚未保存的草稿。
  const profileHydratedRef = useRef(false)

  useDidShow(() => {
    void (async () => {
      if (!await requirePhoneLogin("登录后才能修改个人主页。") || profileHydratedRef.current) return
      profileHydratedRef.current = true
      try {
        const account = await refreshAccount()
        setNickname(account.nickname)
        setAvatar(account.avatar || defaultAvatarKey(account.id))
        setBackground(account.profileBackground || "")
        setBio(account.profileBio || "")
        setInterests(account.profileInterests || [])
        setGallery(account.profileGallery || [])
      } catch {
        profileHydratedRef.current = false
      }
    })()
  })

  const chooseCustomAvatar = async () => {
    if (uploading || saving) return
    try {
      const result = await Taro.chooseImage({count: 1, sizeType: ["compressed"], sourceType: ["album", "camera"]})
      const filePath = result.tempFilePaths?.[0]
      if (!filePath) return
      setUploading(true)
      const uploaded = await uploadMedia(filePath)
      setAvatar(uploaded)
      Taro.showToast({title: "头像已选，记得保存", icon: "none"})
    } catch (error) {
      const message = String((error as {errMsg?: string})?.errMsg || error)
      if (!message.includes("cancel")) showApiError(error)
    } finally {
      setUploading(false)
    }
  }

  const chooseBackground = async () => {
    if (uploading || saving) return
    try {
      const result = await Taro.chooseImage({count:1,sizeType:["compressed"],sourceType:["album","camera"]})
      if (!result.tempFilePaths?.[0]) return
      setUploading(true)
      setBackground(await uploadMedia(result.tempFilePaths[0]))
    } catch (error) {
      if (!String((error as {errMsg?:string})?.errMsg || error).includes("cancel")) showApiError(error)
    } finally { setUploading(false) }
  }

  const chooseGallery = async () => {
    if (uploading || saving || gallery.length >= 6) return
    try {
      const result = await Taro.chooseImage({count:6-gallery.length,sizeType:["compressed"],sourceType:["album","camera"]})
      if (!result.tempFilePaths?.length) return
      setUploading(true)
      const uploaded:string[] = []
      for (const filePath of result.tempFilePaths) uploaded.push(await uploadMedia(filePath))
      setGallery(current => [...current, ...uploaded].slice(0,6))
    } catch (error) {
      if (!String((error as {errMsg?:string})?.errMsg || error).includes("cancel")) showApiError(error)
    } finally { setUploading(false) }
  }

  const addInterest = () => {
    const value = interestInput.trim().replace(/\s+/g," ")
    if (!value || interests.includes(value)) return setInterestInput("")
    if (value.length > 12 || interests.length >= 12) return Taro.showToast({title:"最多 12 个兴趣，每个不超过 12 字",icon:"none"})
    setInterests(current => [...current,value])
    setInterestInput("")
  }

  const save = async () => {
    const nextName = nickname.trim().replace(/\s+/g, " ")
    if (nextName.length < 2 || nextName.length > 16) {
      Taro.showToast({title: "昵称需为 2—16 个字符", icon: "none"})
      return
    }
    if (saving || uploading) return
    setSaving(true)
    try {
      await updateProfile({nickname: nextName, avatar, profileBackground:background, profileBio:bio.trim(), profileInterests:interests, profileGallery:gallery})
      Taro.showToast({title: "资料已保存", icon: "success"})
      setTimeout(() => Taro.navigateBack(), 500)
    } catch (error) {
      showApiError(error)
    } finally {
      setSaving(false)
    }
  }

  return <View className="page profile-edit-page">
    <View className="profile-edit-hero">
      <CampusAvatar avatar={avatar} seed={cached?.id || nickname} className="profile-edit-current-avatar"/>
      <View><Text>让同学更容易认出你</Text><Text>头像和昵称会同步显示在帖子、评论与个人中心</Text></View>
    </View>

    <View className="profile-edit-section">
      <View className="profile-edit-section-title"><Text>选择卡通头像</Text><Text>原创校园系列</Text></View>
      <View className="profile-avatar-grid">
        {campusAvatars.map(item => <View className={`profile-avatar-option ${avatar === item.key ? "active" : ""}`} key={item.key} onClick={() => setAvatar(item.key)}>
          <CampusAvatar avatar={item.key} seed={item.key}/>
          <Text>{item.label}</Text>
          {avatar === item.key && <Text className="avatar-selected">✓</Text>}
        </View>)}
      </View>
      <Button className="custom-avatar-button" loading={uploading} disabled={uploading || saving} onClick={chooseCustomAvatar}>{uploading ? "正在上传" : "从相册或相机选择头像"}</Button>
    </View>

    <View className="profile-edit-section nickname-section">
      <View className="profile-edit-section-title"><Text>我的昵称</Text><Text>{nickname.length}/16</Text></View>
      <Input type="nickname" value={nickname} maxlength={16} onInput={event => setNickname(event.detail.value)} placeholder="输入 2—16 个字符"/>
      <Text className="nickname-note">请勿填写手机号、微信号或冒充学校官方账号</Text>
    </View>

    <View className="profile-edit-section">
      <View className="profile-edit-section-title"><Text>主页背景</Text><Text>展示你的风格</Text></View>
      <View className={`profile-cover-editor ${background ? "has-image" : ""}`} onClick={chooseBackground}>
        {background && <Image src={resolveMediaUrl(background)} mode="aspectFill"/>}<Text>{background ? "更换背景" : "+ 选择主页背景"}</Text>
      </View>
    </View>

    <View className="profile-edit-section nickname-section">
      <View className="profile-edit-section-title"><Text>关于我</Text><Text>{bio.length}/120</Text></View>
      <Textarea value={bio} maxlength={120} placeholder="写写你的性格、年级或想认识怎样的朋友" onInput={event => setBio(event.detail.value)}/>
    </View>

    <View className="profile-edit-section">
      <View className="profile-edit-section-title"><Text>兴趣爱好</Text><Text>{interests.length}/12</Text></View>
      <View className="profile-interest-list">{interests.map(item => <Text key={item} onClick={() => setInterests(current => current.filter(value => value !== item))}>#{item} ×</Text>)}</View>
      <View className="profile-interest-input"><Input value={interestInput} maxlength={12} placeholder="例如 摄影、羽毛球、动漫" onInput={event => setInterestInput(event.detail.value)} onConfirm={addInterest}/><Button onClick={addInterest}>添加</Button></View>
    </View>

    <View className="profile-edit-section">
      <View className="profile-edit-section-title"><Text>照片墙</Text><Text>{gallery.length}/6</Text></View>
      <View className="profile-gallery-editor">{gallery.map(item => <View key={item}><Image src={resolveMediaUrl(item)} mode="aspectFill"/><Text onClick={() => setGallery(current => current.filter(value => value !== item))}>×</Text></View>)}{gallery.length < 6 && <View className="profile-gallery-add" onClick={chooseGallery}><Text>＋</Text><Text>挂照片</Text></View>}</View>
    </View>

    <Button className="profile-save-button" loading={saving} disabled={saving || uploading} onClick={save}>{saving ? "正在保存" : "保存个人资料"}</Button>
  </View>
}
