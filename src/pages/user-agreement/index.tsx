import {Text, View} from "@tarojs/components"
import Taro from "@tarojs/taro"
import "./index.css"

const sections = [
  {title: "服务范围", body: "星尘校园圈向当前学校及校区用户提供课表管理、天气信息、快递通知识别和校园论坛功能。功能会根据运营情况及平台规则调整，具体以小程序实际展示为准。"},
  {title: "账号与使用", body: "你可以以游客身份浏览公开内容。导入课表、保存快递信息、发布、评论或私信时，需要你主动选择手机号登录。请妥善保护账号，不得冒用他人身份或将账号用于违法活动。"},
  {title: "校园圈规则", body: "发布内容应真实、友善并尊重他人权利。禁止发布违法违规、虚假诈骗、辱骂攻击、广告引流、侵犯隐私或知识产权的内容。管理员可依社区规则删除内容、处理举报或限制违规账号。"},
  {title: "服务中断与责任", body: "遇到网络故障、第三方接口异常、系统维护或不可抗力时，部分功能可能短暂不可用。天气、课表识别和快递识别结果仅作为信息辅助，使用前请核对原始信息。"},
  {title: "协议更新", body: "如服务范围或规则发生重大变化，我们会在小程序内显著告知。如你不同意更新后的协议，可停止使用需登录的功能并申请注销账号。"}
]

export default function UserAgreementPage() {
  return <View className="page legal-page">
    <View className="legal-hero"><Text className="legal-kicker">STARDUST · TERMS</Text><Text className="legal-title">用户服务协议</Text><Text className="legal-subtitle">请在选择手机号登录前阅读。你可以不同意并继续以游客身份浏览公开内容。</Text></View>
    <View className="legal-callout"><Text>运营主体与生效日期</Text><Text>星思人工智能科技（唐山）有限公司 · 2026 年 8 月 29 日生效</Text></View>
    <View className="legal-sections">{sections.map((item, index) => <View className="legal-section" key={item.title}><Text className="legal-index">0{index + 1}</Text><View><Text className="legal-section-title">{item.title}</Text><Text className="legal-section-body">{item.body}</Text></View></View>)}</View>
    <View className="legal-actions"><View className="legal-page-back" onClick={() => Taro.navigateBack()}>已阅读，返回</View></View>
  </View>
}
