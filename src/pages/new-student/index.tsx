import {useState} from "react"
import {View, Text} from "@tarojs/components"
import Taro, {useDidShow} from "@tarojs/taro"
import {currentTenant} from "../../store/tenant"
import type {Tenant} from "../../types/tenant"
import "./index.css"

const topics = [
  ["01", "报到准备", "证件、缴费、路线与流程", "报到日期、入口和材料以录取通知书及学校官方通知为准。建议提前整理身份证、录取通知书、个人档案和所需照片，并预留交通时间。"],
  ["02", "校园宿舍", "宿舍条件、床铺、浴室与快递", "宿舍安排通常以学院或迎新系统为准。床铺尺寸、限电规则和可携带电器请在购买用品前再次核验，贵重物品随身保管。"],
  ["03", "军训生活", "训练安排、服装与注意事项", "军训时间以学校通知为准。准备透气衣物、防晒用品和常用药品，身体不适应及时向辅导员和教官说明。"],
  ["04", "校园入门", "食堂、快递和常用地点", "入校后先熟悉教学楼、食堂、快递点、校医院和保卫处。营业时间、路线和服务规则可能变化，请以现场与官方通知为准。"]
]

export default function NewStudentPage() {
  const [tenant, setTenant] = useState<Tenant>(currentTenant())
  useDidShow(() => setTenant(currentTenant()))
  return <View className="page new-page">
    <Text className="new-kicker">A SMALL PART OF CAMPUS LIFE</Text>
    <Text className="new-heading">{tenant.shortName}新同学指南</Text>
    <Text className="new-intro">这里只保留刚入学阶段最需要的内容。进入校园后，日常功能都在首页、校园圈和校园服务中。</Text>
    <View className="topic-list">
      {topics.map(item => <View className="topic-card card" key={item[0]} onClick={() => Taro.showModal({title: item[1], content: item[3], showCancel: false, confirmText: "知道了"})}><Text>{item[0]}</Text><View><Text>{item[1]}</Text><Text>{item[2]}</Text></View><Text>›</Text></View>)}
    </View>
  </View>
}
