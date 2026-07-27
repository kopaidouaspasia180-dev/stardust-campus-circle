import {useMemo, useState} from "react"
import {Button, Text, View} from "@tarojs/components"
import Taro, {useDidShow, usePullDownRefresh} from "@tarojs/taro"
import TenantHeader from "../../components/TenantHeader"
import CommunityPostCard from "../../components/CommunityPostCard"
import {communityChannels, type CommunityPost} from "../../data/community"
import {readCommunityPosts, syncCommunityPosts, toggleCommunityPostLikeRemote} from "../../store/community"
import {currentCampusName, currentTenant} from "../../store/tenant"
import "./index.css"

const PENDING_CHANNEL_KEY = "stardust_community_pending_channel"

export default function CommunityPage() {
  const [channel, setChannel] = useState("推荐")
  const [posts, setPosts] = useState<CommunityPost[]>(readCommunityPosts())
  const tenant = currentTenant()
  const campusName = currentCampusName()

  const refresh = () => {
    const pendingChannel = Taro.getStorageSync<string>(PENDING_CHANNEL_KEY)
    if (pendingChannel && communityChannels.includes(pendingChannel)) {
      setChannel(pendingChannel)
      Taro.removeStorageSync(PENDING_CHANNEL_KEY)
    }
    setPosts(readCommunityPosts())
    syncCommunityPosts().then(setPosts).catch(()=>{})
  }

  useDidShow(refresh)
  usePullDownRefresh(() => {
    refresh()
    Taro.stopPullDownRefresh()
  })

  const visiblePosts = useMemo(
    () => channel === "推荐" ? posts : posts.filter(post => post.channel === channel),
    [channel, posts]
  )

  const openPost = (post: CommunityPost) => {
    Taro.navigateTo({url: `/pages/post-detail/index?id=${encodeURIComponent(post.id)}`})
  }

  const likePost = async (post: CommunityPost) => {
    setPosts(await toggleCommunityPostLikeRemote(post.id))
  }

  return (
    <View className="page community-page">
      <TenantHeader tenant={tenant} campusName={campusName}/>

      <View className="community-head">
        <View>
          <Text className="community-title">校园论坛</Text>
          <Text className="community-subtitle">同学日常、吐槽与校园互助</Text>
        </View>
        <Button className="publish-button" onClick={() => Taro.navigateTo({url: "/pages/publish/index"})}>＋ 发布</Button>
      </View>

      <View className="channel-row">
        {communityChannels.map(item => (
          <Text key={item} className={channel === item ? "active" : ""} onClick={() => setChannel(item)}>{item}</Text>
        ))}
      </View>

      <View className="community-feed">
        {visiblePosts.map(post => (
          <CommunityPostCard key={post.id} post={post} onOpen={openPost} onLike={likePost}/>
        ))}
      </View>

      {visiblePosts.length === 0 && (
        <View className="community-empty">
          <Text>这个频道还没有内容</Text>
          <Text>发布第一条校园动态吧</Text>
        </View>
      )}

      <Text className="community-source">首版内置账号仅用于展示内容结构；正式运营时将接入真实用户、内容审核与举报流程。</Text>
    </View>
  )
}
