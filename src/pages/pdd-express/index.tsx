import {Button, Text, View} from "@tarojs/components"
import Taro, {useLoad} from "@tarojs/taro"
import "./index.css"

// 多多快递提供的官方取件页。该域名不归本项目所有，微信不允许把它
// 稳定嵌入第三方小程序；这里仅提供官方地址与取件说明，不绕过校验。
const PDD_EXPRESS_URL = "https://mdkd.pinduoduo.com/weixin/pdd-packages"
const PDD_OPENED_KEY = "stardust_pdd_express_opened_at"

export default function PddExpressPage() {
  useLoad(() => {
    Taro.setStorageSync(PDD_OPENED_KEY, Date.now())
  })

  return <View className="pdd-guide-page">
    <View className="pdd-guide-icon"><Text>取</Text></View>
    <Text className="pdd-guide-title">多多快递取件</Text>
    <Text className="pdd-guide-copy">
      多多官方网页不支持从其他小程序直接打开。为了避免出现“无法打开该页面”，请复制官方地址后按多多页面指引取件。
    </Text>
    <View className="pdd-guide-note">
      <Text>取件方式</Text>
      <Text>1. 点击下方复制官方取件地址</Text>
      <Text>2. 在手机浏览器或多多官方入口中粘贴并按页面提示操作</Text>
      <Text>3. 如页面提示需授权，请按多多官方流程完成验证</Text>
    </View>
    <Button className="pdd-primary" onClick={() => Taro.setClipboardData({data: PDD_EXPRESS_URL})}>复制官方取件地址</Button>
    <Button className="pdd-secondary" onClick={() => Taro.navigateBack()}>返回快递服务</Button>
    <Text className="pdd-privacy">取件登录和快递数据由多多官方页面处理，星尘校园圈不会读取你的拼多多账号密码，也不会获取包裹信息。</Text>
  </View>
}
