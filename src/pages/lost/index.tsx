import {useMemo, useState} from "react"
import {Button, Image, Input, Text, View} from "@tarojs/components"
import Taro, {useDidShow, usePullDownRefresh} from "@tarojs/taro"
import ServiceDock from "../../components/ServiceDock"
import ServiceMiniHeader from "../../components/ServiceMiniHeader"
import type {CommunityPost} from "../../data/community"
import {fetchMyCommunityPosts, readCommunityPosts, syncCommunityPosts, withdrawCommunityPostRemote} from "../../store/community"
import {apiRequest, requirePhoneLogin, showApiError} from "../../api/client"
import cardPhoto from "../../assets/services-real/market-books.mini.webp"
import zoomIcon from "../../assets/icons/services/service-08.mini.webp"
import packageIcon from "../../assets/icons/services/service-03.mini.webp"
import "../service-shared.css"
import "../service-visual-v2.css"
import "./index.css"

type LostKind = "全部" | "寻物" | "招领"

function kindOf(post: CommunityPost): Exclude<LostKind, "全部"> {
  return post.tag === "招领" || post.tag.includes("招领") ? "招领" : "寻物"
}

function kindClassOf(post: CommunityPost) {
  return kindOf(post) === "招领" ? "kind-found" : "kind-lost"
}

function titleOf(post: CommunityPost) {
  return post.content.split(/[，。,.!！?？\n]/).find(Boolean)?.trim().slice(0, 15) || (kindOf(post) === "招领" ? "招领物品" : "寻找物品")
}

export default function LostPage() {
  const [posts, setPosts] = useState<CommunityPost[]>([])
  const [minePosts, setMinePosts] = useState<CommunityPost[]>([])
  const [scope, setScope] = useState<"全部线索" | "我发布的">("全部线索")
  const [kind, setKind] = useState<LostKind>("全部")
  const [query, setQuery] = useState("")
  const [selected, setSelected] = useState<CommunityPost | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = async () => {
    setLoading(true)
    setPosts(readCommunityPosts().filter(item => item.channel === "失物"))
    try {
      const [all, mine] = await Promise.all([syncCommunityPosts(), fetchMyCommunityPosts()])
      setPosts(all.filter(item => item.channel === "失物"))
      setMinePosts(mine.filter(item => item.channel === "失物"))
    } catch {
      setMinePosts(readCommunityPosts().filter(item => item.channel === "失物" && item.mine))
    } finally {
      setLoading(false)
    }
  }

  useDidShow(() => { void refresh() })
  usePullDownRefresh(() => { void refresh().finally(() => Taro.stopPullDownRefresh()) })

  const publish = async (tag: "寻物" | "招领") => {
    if (!await requirePhoneLogin("登录后才能发布失物招领线索。")) return
    Taro.setStorageSync("stardust_publish_pending_topic", "失物")
    Taro.setStorageSync("stardust_publish_pending_tag", tag)
    Taro.navigateTo({url: "/pages/publish/index"})
  }

  const source = scope === "我发布的" ? minePosts : posts
  const shown = useMemo(() => {
    const keyword = query.trim().toLowerCase()
    return source.filter(post => {
      if (kind !== "全部" && kindOf(post) !== kind) return false
      if (!keyword) return true
      return [post.content, post.location, post.tag, post.user].some(value => value.toLowerCase().includes(keyword))
    })
  }, [kind, query, source])

  const chat = async (post: CommunityPost) => {
    if (!await requirePhoneLogin("登录后才能联系线索发布者。")) return
    if (post.demo) {
      Taro.showToast({title: "示例线索暂无发布者", icon: "none"})
      return
    }
    if (post.mine) {
      Taro.showToast({title: "这是你发布的线索", icon: "none"})
      return
    }
    try {
      const result = await apiRequest<{item:{id:string}}>("/conversations", {method: "POST", data: {resourceType: "lost_post", resourceId: post.id}})
      Taro.navigateTo({url: `/pages/chat/index?id=${encodeURIComponent(result.item.id)}`})
    } catch (error) {
      showApiError(error)
    }
  }

  const resolve = async (post: CommunityPost) => {
    if (!await requirePhoneLogin("登录后才能管理你发布的线索。")) return
    const result = await Taro.showModal({
      title: kindOf(post) === "招领" ? "确认已归还？" : "确认已找回？",
      content: "完成后该线索将从公开列表移除，避免同学继续联系。",
      confirmText: "确认完成",
      confirmColor: "#2c7ad8"
    })
    if (!result.confirm) return
    try {
      await withdrawCommunityPostRemote(post.id)
      setSelected(null)
      await refresh()
      Taro.showToast({title: "线索已完成", icon: "success"})
    } catch (error) {
      showApiError(error)
    }
  }

  const dock = (index: number) => {
    if (index === 0) setScope("全部线索")
    if (index === 1) void publish("寻物")
    if (index === 2) void requirePhoneLogin("登录后才能查看自己发布的线索。").then(allowed => allowed && setScope("我发布的"))
  }

  const resetFilters = () => { setKind("全部"); setQuery("") }

  return <View className="service-v2 theme-lost">
    <ServiceMiniHeader title="失物招领" badge="本校范围⌟"/>

    <View className="lost-v2-actions">
      <View onClick={() => void publish("寻物")}>
        <View><Image className="lost-action-icon" src={zoomIcon}/></View>
        <View><Text>我丢了东西</Text><Text>发布寻物线索</Text></View>
      </View>
      <View onClick={() => void publish("招领")}>
        <View><Image className="lost-action-icon" src={packageIcon}/></View>
        <View><Text>我捡到东西</Text><Text>发布招领线索</Text></View>
      </View>
    </View>

    <View className="lost-search">
      <Image src={zoomIcon}/>
      <Input value={query} onInput={event => setQuery(event.detail.value)} placeholder="搜索物品、地点或特征"/>
      {query && <Text onClick={() => setQuery("")}>清除</Text>}
    </View>

    <View className="lost-filter-row">
      {["全部", "寻物", "招领"].map(item => <Text key={item} className={kind === item ? "active" : ""} onClick={() => setKind(item as LostKind)}>{item}</Text>)}
      <Text className={scope === "我发布的" ? "active mine" : "mine"} onClick={() => setScope(scope === "我发布的" ? "全部线索" : "我发布的")}>{scope === "我发布的" ? "返回公开" : "我发布的"}</Text>
    </View>

    <View className="v2-section-head lost-section-head">
      <View><Text>{scope === "我发布的" ? "我的线索" : "最新线索"}</Text><Text>证件只展示局部信息，领取前当面核对</Text></View>
      <Text>{shown.length} 条</Text>
    </View>

    <View className="lost-v2-list">
      {shown.map(post => <View className="lost-v2-row" key={post.id} onClick={() => setSelected(post)}>
        <Image src={post.image || cardPhoto} mode="aspectFill"/>
        <View>
          <View className="lost-row-title"><Text>{titleOf(post)}</Text><Text className={kindClassOf(post)}>{kindOf(post)}</Text></View>
          <Text>{post.content}</Text>
          <Text>{post.location || "当前校区"} · {post.time}</Text>
        </View>
        <View>
          <Button onClick={event => {event.stopPropagation(); setSelected(post)}}>{post.mine ? "管理" : "查看线索"}</Button>
          <Text>{kindOf(post) === "招领" ? "待失主核对" : "寻找中"}</Text>
        </View>
      </View>)}

      {!shown.length && <View className="lost-empty">
        <View><Image src={scope === "我发布的" ? packageIcon : zoomIcon}/></View>
        <Text>{loading ? "正在同步当前校区线索…" : query || kind !== "全部" ? "没有找到符合条件的线索" : scope === "我发布的" ? "你还没有发布过失物线索" : "当前校区还没有公开线索"}</Text>
        <Text>{query || kind !== "全部" ? "试试更换关键词或清除筛选" : "丢失或拾取物品时，可以在这里留下安全线索"}</Text>
        <Button onClick={() => query || kind !== "全部" ? resetFilters() : publish("寻物")}>{query || kind !== "全部" ? "清除筛选" : "发布线索"}</Button>
      </View>}
    </View>

    {selected && <View className="lost-detail-mask" onClick={() => setSelected(null)}>
      <View className="lost-detail-sheet" onClick={event => event.stopPropagation()}>
        <View className="lost-detail-grabber"/>
        <Image className="lost-detail-image" src={selected.image || cardPhoto} mode="aspectFill"/>
        <View className="lost-detail-heading">
          <View><Text>{titleOf(selected)}</Text><Text>{kindOf(selected) === "招领" ? "待失主核对" : "正在寻找"}</Text></View>
          <Text className={kindClassOf(selected)}>{kindOf(selected)}</Text>
        </View>
        <View className="lost-detail-meta"><Text>地点</Text><Text>{selected.location || "当前校区"}</Text><Text>发布</Text><Text>{selected.time}</Text></View>
        <Text className="lost-detail-content">{selected.content}</Text>
        <View className="lost-safety"><Text>安全提醒</Text><Text>领取时请让对方说明物品特征；证件、快递码和手机号不要公开发布。</Text></View>
        <View className="lost-detail-actions">
          <Button onClick={() => Taro.navigateTo({url: `/pages/post-detail/index?id=${encodeURIComponent(selected.id)}`})}>查看帖子</Button>
          {selected.mine ? <Button onClick={() => void resolve(selected)}>标记已完成</Button> : <Button onClick={() => void chat(selected)}>联系发布者</Button>}
        </View>
      </View>
    </View>}

    <ServiceDock labels={["线索", "发布", "我的"]} active={scope === "我发布的" ? 2 : 0} onSelect={dock}/>
  </View>
}
