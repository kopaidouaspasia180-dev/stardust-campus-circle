import {Button, Text, View} from "@tarojs/components"
import Taro from "@tarojs/taro"
import {deleteAccount, showApiError} from "../../api/client"
import "./index.css"

const sections = [
  {
    title: "我们处理哪些信息",
    body: "为完成登录与校区隔离，会处理微信登录产生的服务端账号标识；当你主动使用功能时，还会处理课表、快递通知、帖子、图片、评论、私信与举报记录。"
  },
  {
    title: "信息如何被使用",
    body: "信息只用于提供课表管理、快递通知识别、校园圈互动、内容安全与账号风险处理。课表和快递通知图片仅在你主动选择并发起识别时上传。"
  },
  {
    title: "公开内容与安全",
    body: "校园圈帖子和评论可能面向同一学校的同学展示，同校院区互通、不同学校隔离。请不要公开发布手机号、学号、宿舍号、证件或违法信息；如你主动绑定收件手机号，系统只会在微信明确授权后取得，并仅用于匹配到件信息。涉嫌违规的内容、聊天或账号可被删除或限制。"
  },
  {
    title: "你的控制权",
    body: "你可以在页面内删除课程、快递记录和自己发布的信息，也可退出登录或通过下方入口申请注销。为处理内容举报与安全事件，法律或运营所必需的最小记录可能按规则留存。"
  }
]

export default function LegalPage() {
  const removeAccount = async () => {
    const first = await Taro.showModal({
      title: "注销账号？",
      content: "注销会退出当前微信会话，并匿名化账号资料。已发布内容及安全审计可能保留必要的最小记录。",
      confirmText: "继续",
      confirmColor: "#df4c53"
    })
    if (!first.confirm) return
    const final = await Taro.showModal({
      title: "再次确认注销",
      content: "请确认你已备份需要保留的课表和快递信息。此操作不能恢复。",
      confirmText: "确认注销",
      confirmColor: "#df4c53"
    })
    if (!final.confirm) return
    try {
      await deleteAccount()
      await Taro.showModal({title: "账号已注销", content: "已清除当前会话并匿名化账号资料。再次进入小程序需要重新使用手机号登录。", showCancel: false})
      Taro.reLaunch({url: "/pages/login/index"})
    } catch (error) {
      showApiError(error)
    }
  }

  return <View className="page legal-page">
    <View className="legal-hero">
      <Text className="legal-kicker">STARDUST · TRUST CENTER</Text>
      <Text className="legal-title">账号、隐私与社区规则</Text>
      <Text className="legal-subtitle">我们只收集完成课表、快递和校园圈功能所需要的信息，并让你能管理自己的数据。</Text>
    </View>

    <View className="legal-callout">
      <Text>重要提示</Text>
      <Text>你可以在登录前分别阅读《用户服务协议》和《隐私政策》，未主动勾选同意时不会发起手机号授权。</Text>
    </View>

    <View className="legal-sections">
      {sections.map((item, index) => <View className="legal-section" key={item.title}>
        <Text className="legal-index">0{index + 1}</Text>
        <View><Text className="legal-section-title">{item.title}</Text><Text className="legal-section-body">{item.body}</Text></View>
      </View>)}
    </View>

    <View className="legal-help">
      <Text>遇到问题怎么办？</Text>
      <Text>请先使用对应页面的举报、取消、撤回功能；涉及内容安全、交易纠纷或账号问题，请通过小程序公告中的当前校区运营联系方式反馈。</Text>
    </View>

    <View className="legal-actions">
      <Button className="legal-back" onClick={() => Taro.navigateBack()}>返回我的</Button>
      <Button className="legal-delete" onClick={removeAccount}>注销账号与删除身份资料</Button>
    </View>
  </View>
}
