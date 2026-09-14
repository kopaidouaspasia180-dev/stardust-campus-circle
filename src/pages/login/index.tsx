import {useState} from "react"
import {Button, Checkbox, CheckboxGroup, Label, Text, View} from "@tarojs/components"
import Taro, {useDidShow} from "@tarojs/taro"
import {loginWithPhone, readAccount, showApiError} from "../../api/client"
import {currentCampusName, currentTenant} from "../../store/tenant"
import "./index.css"
import "./guest.css"

type PhoneEvent = {detail?: {code?: string; errMsg?: string}}

export default function LoginPage() {
  const [loading, setLoading] = useState(false)
  const [agreed, setAgreed] = useState(false)
  const tenant = currentTenant()
  const campusName = currentCampusName()

  useDidShow(() => {
    const saved = readAccount()
    if (saved?.phoneVerified) {
      Taro.switchTab({url: "/pages/home/index"})
    }
  })

  const finishLogin = () => {
    if (Taro.getCurrentPages().length > 1) Taro.navigateBack()
    else Taro.switchTab({url: "/pages/home/index"})
  }

  const openPlatformPrivacyContract = () => {
    Taro.openPrivacyContract({
      fail: () => Taro.navigateTo({url: "/pages/privacy-policy/index"})
    })
  }

  const authorizePhone = async (event: PhoneEvent) => {
    if (!agreed) {
      Taro.showToast({title: "请先阅读并同意协议", icon: "none"})
      return
    }
    const code = String(event.detail?.code || "")
    if (!code) {
      if (!/cancel|deny/i.test(String(event.detail?.errMsg || ""))) Taro.showToast({title: "未取得手机号授权，请重试", icon: "none"})
      return
    }
    setLoading(true)
    try {
      await loginWithPhone(code)
      Taro.showToast({title: "登录成功", icon: "success"})
      finishLogin()
    } catch (error) {
      showApiError(error)
    } finally {
      setLoading(false)
    }
  }

  return <View className="login-page">
    <View className="login-orbit orbit-one"/>
    <View className="login-orbit orbit-two"/>
    <View className="login-brand">
      <Text className="login-script">Stardust</Text>
      <Text className="login-title">星尘校园圈</Text>
      <Text className="login-slogan">一部手机，装下你的校园生活</Text>
    </View>

    <View className="login-card">
      <View className="login-school">
        <Text>{tenant.name}</Text>
        <Text>{campusName}</Text>
      </View>
      <Text className="login-heading">登录你的校园账号</Text>
      <Text className="login-description">使用微信绑定手机号识别同一个账号。课表和快递只属于你；校园圈、关注和私信按学校隔离，同校院区互通。</Text>
      <Button
        className="login-button"
        loading={loading}
        disabled={loading || !agreed}
        openType="getPhoneNumber|agreePrivacyAuthorization"
        onGetPhoneNumber={authorizePhone}
      >手机号快捷登录</Button>
      <Button className="login-guest-button" disabled={loading} onClick={() => Taro.switchTab({url: "/pages/home/index"})}>暂不登录，先逛校园</Button>
      <View className="login-assurance"><Text>仅用于账号识别</Text><Text>加密保存</Text><Text>支持注销</Text></View>
      <View className="login-agreement">
        <CheckboxGroup onChange={event => setAgreed(event.detail.value.includes("agree"))}>
          <Label className="login-agreement-check">
            <Checkbox value="agree" checked={agreed} color="#278bea"/>
            <Text>我已阅读并同意</Text>
          </Label>
        </CheckboxGroup>
        <View className="login-agreement-links">
          <Text onClick={() => Taro.navigateTo({url: "/pages/user-agreement/index"})}>《用户服务协议》</Text>
          <Text>和</Text>
          <Text onClick={() => Taro.navigateTo({url: "/pages/privacy-policy/index"})}>《隐私政策》</Text>
          <Text onClick={openPlatformPrivacyContract}>《小程序用户隐私保护指引》</Text>
        </View>
      </View>
    </View>
  </View>
}
