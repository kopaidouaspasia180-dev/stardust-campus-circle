import campusGate from "../assets/campus/campus-gate.webp"
import campusCeremony from "../assets/campus/campus-ceremony.webp"
import campusLocomotive from "../assets/campus/campus-locomotive.webp"
import campusMotto from "../assets/campus/campus-motto.webp"

export type CommunityComment = {
  id: string
  user: string
  content: string
  time: string
}

export type CommunityPost = {
  id: string
  user: string
  avatar: string
  avatarTone: "blue" | "orange" | "pink" | "violet" | "gold" | "green"
  time: string
  demo: boolean
  channel: string
  tag: string
  content: string
  location: string
  image?: string
  comments: CommunityComment[]
  likes: number
  liked?: boolean
  createdAt: number
}

export const communityChannels = ["推荐", "日常", "吐槽", "二手", "互助", "活动", "兼职", "失物"]

export const seedCommunityPosts: CommunityPost[] = [
  {
    id: "seed-early-class",
    user: "早八逃生员",
    avatar: "早",
    avatarTone: "blue",
    time: "2小时前",
    demo: true,
    channel: "吐槽",
    tag: "日常吐槽",
    content: "今天第一节课的风比闹钟还管用，从宿舍一路清醒到教学楼。到底是谁发明的早八，我先去买杯豆浆缓一缓。",
    location: "大学西道校区",
    image: campusGate,
    comments: [
      {id: "c-early-1", user: "食堂排队观察员", content: "豆浆窗口今天排队还挺快，冲！", time: "1小时前"},
      {id: "c-early-2", user: "小唐今天不困", content: "早八结束以后的一整天都像赚来的。", time: "48分钟前"}
    ],
    likes: 42,
    createdAt: 1785070800000
  },
  {
    id: "seed-canteen",
    user: "食堂排队观察员",
    avatar: "饭",
    avatarTone: "orange",
    time: "38分钟前",
    demo: true,
    channel: "日常",
    tag: "校园日常",
    content: "下课铃一响，所有人都像接到了同一个隐藏任务：冲向食堂。今天窗口排队速度还可以，就是想吃的菜又在我前面售罄了。",
    location: "校内食堂",
    comments: [{id: "c-food-1", user: "充电线失踪案受害者", content: "建议错峰十分钟，体验会好很多。", time: "20分钟前"}],
    likes: 65,
    createdAt: 1785070200000
  },
  {
    id: "seed-locomotive",
    user: "小唐今天不困",
    avatar: "唐",
    avatarTone: "pink",
    time: "昨天 18:24",
    demo: true,
    channel: "日常",
    tag: "随手拍",
    content: "路过机车景观的时候刚好有一束光落下来，随手拍了一张。校园里这种不经意的小画面，反而最像大学生活。",
    location: "校园机车景观",
    image: campusLocomotive,
    comments: [{id: "c-photo-1", user: "镜头盖又丢了", content: "傍晚的光线真的很适合拍照。", time: "昨天"}],
    likes: 88,
    createdAt: 1784984640000
  },
  {
    id: "seed-cable",
    user: "充电线失踪案受害者",
    avatar: "线",
    avatarTone: "violet",
    time: "昨天 16:10",
    demo: true,
    channel: "互助",
    tag: "求助",
    content: "有没有同学在教学楼捡到一根白色 Type-C 充电线？应该落在靠窗的位置了，找到的话请在帖子下面留言，谢谢！",
    location: "教学楼",
    comments: [{id: "c-cable-1", user: "路过的同学", content: "二楼值班台好像放着一根，可以去问问。", time: "昨天"}],
    likes: 19,
    createdAt: 1784976600000
  },
  {
    id: "seed-ceremony",
    user: "毕业典礼前排观众",
    avatar: "礼",
    avatarTone: "gold",
    time: "2天前",
    demo: true,
    channel: "活动",
    tag: "校园活动",
    content: "礼堂今天的气氛太好了，虽然还没到毕业的时候，但看到学长学姐上台还是会突然对未来多一点期待。",
    location: "校园礼堂",
    image: campusCeremony,
    comments: [{id: "c-event-1", user: "早八逃生员", content: "祝学长学姐毕业快乐！", time: "2天前"}],
    likes: 126,
    createdAt: 1784890200000
  },
  {
    id: "seed-fan",
    user: "二手小风扇求购中",
    avatar: "闲",
    avatarTone: "green",
    time: "2天前",
    demo: true,
    channel: "二手",
    tag: "求购",
    content: "想收一个宿舍桌面小风扇，能正常使用就行，最好可以在校内当面验货。有闲置的同学可以留言。",
    location: "唐山学院",
    comments: [],
    likes: 11,
    createdAt: 1784884800000
  },
  {
    id: "seed-part-time",
    user: "周末不想躺平",
    avatar: "职",
    avatarTone: "blue",
    time: "3天前",
    demo: true,
    channel: "兼职",
    tag: "经验交流",
    content: "大家找兼职一定先核验企业和工作地点，不交押金、不租设备、不刷单。有没有做过校内勤工助学的同学分享一下申请流程？",
    location: "大学西道校区",
    comments: [{id: "c-job-1", user: "校园互助站", content: "可以先关注学院和学生工作部门发布的正式通知。", time: "3天前"}],
    likes: 34,
    createdAt: 1784802000000
  },
  {
    id: "seed-lost-card",
    user: "捡到一卡通的同学",
    avatar: "寻",
    avatarTone: "orange",
    time: "3天前",
    demo: true,
    channel: "失物",
    tag: "失物招领",
    content: "在操场入口附近捡到一张校园证件，已经交到值班处，请失主带有效信息前往核对领取。",
    location: "校园操场",
    comments: [],
    likes: 27,
    createdAt: 1784798400000
  },
  {
    id: "seed-motto",
    user: "晚课结束去散步",
    avatar: "晚",
    avatarTone: "violet",
    time: "4天前",
    demo: true,
    channel: "日常",
    tag: "校园随拍",
    content: "晚课结束以后慢慢走回宿舍，白天匆匆路过的地方突然都安静了下来。偶尔放慢一点，校园也会变得很不一样。",
    location: "校园文化景观",
    image: campusMotto,
    comments: [],
    likes: 73,
    createdAt: 1784712000000
  }
]
