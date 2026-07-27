import {View, Text} from "@tarojs/components"
import "./index.css"

const messages = [
  {icon:"♥", title:"互动消息", copy:"有人赞了你的校园动态", time:"刚刚"},
  {icon:"✦", title:"校园通知", copy:"今晚音乐社招新活动开始报名", time:"10分钟前"},
  {icon:"◎", title:"系统消息", copy:"欢迎加入星尘校园圈", time:"今天"}
]

export default function MessagesPage() {
  return <View className="page messages-page">
    <Text className="messages-kicker">STARDUST · MESSAGE</Text><Text className="messages-title">消息</Text>
    <View className="message-list card">{messages.map(item => <View className="message-row" key={item.title}>
      <View className="message-icon">{item.icon}</View><View className="message-copy"><Text>{item.title}</Text><Text>{item.copy}</Text></View><Text className="message-time">{item.time}</Text>
    </View>)}</View>
  </View>
}
