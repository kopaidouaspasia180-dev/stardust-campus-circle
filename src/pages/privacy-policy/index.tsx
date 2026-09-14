import {Text, View} from "@tarojs/components"
import Taro from "@tarojs/taro"
import "./index.css"

const sections = [
  {title: "我们收集的信息", body: "仅在你主动使用对应功能时处理必要信息：登录时的微信账号标识及经你授权的手机号；你选择上传或拍摄的课表、快递通知、头像、主页、校园圈、榜单及闲置商品图片；你主动粘贴或点击识别的快递通知文字；你发布的帖子、评论、私信、商品与举报信息；以及你选择的学校和校区。"},
  {title: "信息用途", body: "账号信息用于识别同一用户并隔离个人数据；课表与快递信息用于完成你主动发起的识别和保存；校园圈信息用于内容展示、互动、安全审核和举报处理。我们不会因为你仅浏览首页而索取手机号。"},
  {title: "权限与第三方服务", body: "相册或相机仅在你主动点击上传或拍摄图片时调用；剪贴板仅在你点击识别已复制通知时读取。为完成你主动发起的课表或快递识别，相关图片及识别所需文字会经我们的服务器传输至受托的 OCR/AI 技术服务商，仅用于本次识别处理。天气信息由服务端按学校所在城市查询，不向天气服务提供你的手机号或微信身份。小程序权限同时受微信隐私保护机制管理。"},
  {title: "保存与安全", body: "课表和快递等私人数据按账号保存；校园圈、关注和私信按学校隔离，同一学校的院区互通，不同学校之间不可见。我们采取访问控制、传输加密、敏感字段加密和安全审计等措施。信息只保留至实现功能、解决争议或履行法定义务所必需的期限。"},
  {title: "你的权利", body: "你可在小程序内查看、更正或删除课表、快递记录和自己发布的内容，也可退出登录或申请注销账号。拒绝登录授权不影响你浏览首页、天气和公开校园圈内容。"},
  {title: "政策更新与联系", body: "如果信息处理目的、方式或范围发生重大变化，我们会重新告知并在必要时再次征得同意。你可通过小程序内的举报、账号与注销入口，或微信公众平台公示的运营主体联系方式反馈隐私问题。"}
]

export default function PrivacyPolicyPage() {
  return <View className="page legal-page">
    <View className="legal-hero"><Text className="legal-kicker">STARDUST · PRIVACY</Text><Text className="legal-title">隐私政策</Text><Text className="legal-subtitle">我们遵循最小必要原则，只在你主动选择功能时处理相应信息。</Text></View>
    <View className="legal-callout"><Text>运营主体与生效日期</Text><Text>星思人工智能科技（唐山）有限公司 · 2026 年 9 月 10 日更新。未勾选同意时不会发起手机号或微信隐私授权。</Text></View>
    <View className="legal-sections">{sections.map((item, index) => <View className="legal-section" key={item.title}><Text className="legal-index">0{index + 1}</Text><View><Text className="legal-section-title">{item.title}</Text><Text className="legal-section-body">{item.body}</Text></View></View>)}</View>
    <View className="legal-actions"><View className="legal-page-back" onClick={() => Taro.navigateBack()}>已阅读，返回</View></View>
  </View>
}
