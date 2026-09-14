import {Button, Image, Text, View} from "@tarojs/components"
import Taro, {useDidShow, useRouter} from "@tarojs/taro"
import {useState} from "react"
import {apiRequest, readAccount, refreshAccount, requirePhoneLogin, resolveMediaUrl, showApiError} from "../../api/client"
import CampusAvatar from "../../components/CampusAvatar"
import CommunityPostCard from "../../components/CommunityPostCard"
import type {CommunityPost} from "../../data/community"
import {fetchMyCommunityPosts, fetchProfileCommunityPosts, toggleCommunityPostLikeRemote} from "../../store/community"
import {readCommunityProfilePreview} from "../../utils/communityProfile"
import "./index.css"

type PublicProfile = {
  publicId:string; nickname:string; avatar:string; profileBackground:string; profileBio:string
  profileInterests:string[]; profileGallery:string[]; joinedDays:number; mine:boolean
  following:boolean; followsMe:boolean; mutualFollowing:boolean; followerCount:number; followingCount:number; postCount:number
}

export default function UserProfilePage() {
  const router = useRouter()
  const mineRequested = String(router.params.mine || "") === "1"
  const previewRequested = String(router.params.preview || "") === "1"
  const routePublicId = decodeURIComponent(String(router.params.id || ""))
  const [profile, setProfile] = useState<PublicProfile | null>(null)
  const [posts, setPosts] = useState<CommunityPost[]>([])
  const [loading, setLoading] = useState(true)
  const [following, setFollowing] = useState(false)
  const [chatting, setChatting] = useState(false)
  const [fallbackPostId, setFallbackPostId] = useState("")

  const load = async () => {
    let publicId = routePublicId || readAccount()?.publicId || ""
    if (!/^\d{6}$/.test(publicId) && mineRequested) {
      try {
        const account = await refreshAccount()
        publicId = account.publicId || ""
      } catch {
        // The local profile below keeps the page usable during a brief outage.
      }
    }
    if (!/^\d{6}$/.test(publicId)) {
      if (previewRequested) {
        const preview = readCommunityProfilePreview()
        if (!preview) { setLoading(false); return }
        const previewPosts = preview.post ? [preview.post] : []
        setFallbackPostId(preview.post?.id || "")
        setProfile({
          publicId:"", nickname:preview.nickname, avatar:preview.avatar,
          profileBackground:"", profileBio:"", profileInterests:[], profileGallery:[],
          joinedDays:1, mine:false, following:Boolean(preview.post?.following), followsMe:false, mutualFollowing:false,
          followerCount:Number(preview.post?.followerCount)||0, followingCount:0, postCount:previewPosts.length
        })
        setPosts(previewPosts)
        setLoading(false)
        return
      }
      if (!mineRequested) { setLoading(false); return }
      const account = readAccount()
      if (!account?.phoneVerified) { setLoading(false); return }
      setLoading(true)
      setProfile({
        publicId:"", nickname:account.nickname || "校园同学", avatar:account.avatar || "",
        profileBackground:account.profileBackground || "", profileBio:account.profileBio || "",
        profileInterests:account.profileInterests || [], profileGallery:account.profileGallery || [],
        joinedDays:1, mine:true, following:false, followsMe:false, mutualFollowing:false,
        followerCount:0, followingCount:0, postCount:0
      })
      try {
        const postItems = await fetchMyCommunityPosts()
        setPosts(postItems)
        setProfile(current => current ? {...current, postCount:postItems.length} : current)
      } catch {
        setPosts([])
      } finally {
        setLoading(false)
      }
      return
    }
    setFallbackPostId("")
    setLoading(true)
    try {
      const [profileResult, postItems] = await Promise.all([
        apiRequest<{user:PublicProfile}>(`/community/profiles/${encodeURIComponent(publicId)}`),
        fetchProfileCommunityPosts(publicId)
      ])
      setProfile(profileResult.user)
      setPosts(postItems)
    } catch (error) { showApiError(error) }
    finally { setLoading(false) }
  }
  useDidShow(() => { void load() })

  const toggleFollow = async () => {
    if (!await requirePhoneLogin("登录后才能关注这位同学。") || !profile || following) return
    if (!profile.publicId && !fallbackPostId) {
      Taro.showToast({title:"暂时无法识别这位同学", icon:"none"})
      return
    }
    setFollowing(true)
    try {
      if (profile.publicId) {
        const result = await apiRequest<{following:boolean;follower_count:number;follows_me:boolean;mutualFollowing:boolean}>(`/community/profiles/${profile.publicId}/follow`, {method:"POST"})
        setProfile(current => current ? {...current, following:result.following, followsMe:result.follows_me,
          mutualFollowing:result.mutualFollowing, followerCount:Number(result.follower_count)||0} : current)
        Taro.showToast({title:result.following ? "已关注" : "已取消关注", icon:"success"})
        return
      }
      const result = await apiRequest<{following:boolean;followerCount:number}>(`/community/posts/${fallbackPostId}/follow`, {method:"POST"})
      setProfile(current => current ? {...current, following:result.following, followerCount:Number(result.followerCount)||0} : current)
      Taro.showToast({title:result.following ? "已关注" : "已取消关注", icon:"success"})
    } catch (error) { showApiError(error) }
    finally { setFollowing(false) }
  }

  const startChat = async () => {
    if (!await requirePhoneLogin("登录后才能私信这位同学。") || !profile || chatting) return
    if (!profile.publicId && !fallbackPostId) {
      Taro.showToast({title:"暂时无法识别这位同学", icon:"none"})
      return
    }
    setChatting(true)
    try {
      const result = await apiRequest<{item:{id:string}}>("/conversations", {method:"POST", data:profile.publicId
        ? {resourceType:"user_profile", resourceId:profile.publicId}
        : {resourceType:"community_post", resourceId:fallbackPostId}})
      Taro.navigateTo({url:`/pages/chat/index?id=${encodeURIComponent(result.item.id)}`})
    } catch (error) { showApiError(error) }
    finally { setChatting(false) }
  }

  const likePost = async (post:CommunityPost) => {
    if (!await requirePhoneLogin("登录后才能点赞。")) return
    try {
      const items = await toggleCommunityPostLikeRemote(post.id)
      const updated = items.find(item => item.id === post.id)
      if (updated) setPosts(current => current.map(item => item.id === post.id ? updated : item))
    } catch (error) { showApiError(error) }
  }

  if (!profile) return <View className="user-profile-page user-profile-empty"><Text>{loading ? "正在打开同学主页…" : "这个主页暂时无法访问"}</Text></View>
  const gallery = profile.profileGallery || []
  const hasCustomProfile = Boolean(profile.profileBackground || profile.profileBio || profile.profileInterests?.length || gallery.length)
  const canSocialInteract = Boolean(profile.publicId || fallbackPostId)
  return <View className={`user-profile-page ${profile.mine ? "" : "has-social-dock"}`}>
    <View className="user-profile-hero">
      {profile.profileBackground ? <Image className="user-profile-cover" src={resolveMediaUrl(profile.profileBackground)} mode="aspectFill"/> : <View className="user-profile-cover user-profile-cover-default"/>}
      <View className="user-profile-shade"/>
      <View className="user-profile-main">
        <CampusAvatar avatar={profile.avatar} seed={profile.publicId} className="user-profile-avatar"/>
        <View className="user-profile-name"><Text>{profile.nickname}</Text><Text>{profile.publicId ? `ID ${profile.publicId}` : "默认主页"}</Text></View>
        <Text className="user-profile-days">来到校园圈第 {profile.joinedDays} 天</Text>
      </View>
    </View>

    <View className="user-profile-stats">
      <View><Text>{profile.postCount}</Text><Text>动态</Text></View><View><Text>{profile.followerCount}</Text><Text>关注者</Text></View><View><Text>{profile.followingCount}</Text><Text>关注</Text></View>
    </View>

    {profile.mine && <View className="user-profile-actions">
      <Button className="user-profile-edit-button" onClick={() => Taro.navigateTo({url:"/pages/profile-edit/index"})}>编辑主页</Button>
    </View>}
    {!profile.mine && !profile.publicId && <View className="user-profile-basic-badge"><Text>同校同学</Text><Text>{fallbackPostId ? "默认主页 · 可通过校园帖子联系" : "该同学暂未留下可联系的校园动态"}</Text></View>}
    {profile.mine && !hasCustomProfile && <View className="user-profile-default-note"><Text>你的默认主页已经准备好</Text><Text>补充背景、介绍、兴趣和照片，让同学更快认识你</Text></View>}
    {!profile.mine && canSocialInteract && !profile.mutualFollowing && <Text className="user-profile-chat-rule">还未互关 · 现在可以发送 1 条问候</Text>}
    {!profile.mine && canSocialInteract && profile.mutualFollowing && <Text className="user-profile-chat-rule is-mutual">已互相关注 · 可以自由聊天</Text>}

    <View className="user-profile-card">
      <View className="user-profile-section-title"><Text>关于我</Text><Text>同校可见</Text></View>
      <Text className={`user-profile-bio ${profile.profileBio ? "" : "is-empty"}`}>{profile.profileBio || (profile.mine ? "这是你的校园主页，记录生活，也认识同校的新朋友。" : "刚来到校园圈，期待认识更多同校朋友。")}</Text>
      {!!profile.profileInterests?.length
        ? <View className="user-profile-interests">{profile.profileInterests.map(item => <Text key={item}>#{item}</Text>)}</View>
        : <View className="user-profile-interests user-profile-interests-default"><Text>#校园新同学</Text><Text>#期待认识你</Text></View>}
    </View>

    <View className="user-profile-card">
      <View className="user-profile-section-title"><Text>照片墙</Text><Text>{gallery.length}/6</Text></View>
      {gallery.length ? <View className="user-profile-gallery">{gallery.map(item => <Image key={item} src={resolveMediaUrl(item)} mode="aspectFill" onClick={() => Taro.previewImage({current:resolveMediaUrl(item), urls:gallery.map(value => resolveMediaUrl(value))})}/>)}</View> : <View className="user-profile-gallery-placeholder"><View><Text>✦</Text><Text>校园日常</Text></View><View><Text>☁</Text><Text>我的瞬间</Text></View><View><Text>＋</Text><Text>{profile.mine ? "去挂照片" : "等待更新"}</Text></View></View>}
    </View>

    <View className="user-profile-feed-title"><Text>{profile.mine ? "我的校园动态" : "TA 的校园动态"}</Text><Text>{posts.length} 条</Text></View>
    <View className="user-profile-feed">{posts.map(post => <CommunityPostCard key={post.id} post={post} variant="editorial" onOpen={() => Taro.navigateTo({url:`/pages/post-detail/index?id=${encodeURIComponent(post.id)}`})} onLike={likePost}/>)}</View>
    {!loading && !posts.length && <View className="user-profile-no-posts">{profile.mine ? "还没有发布校园动态" : "还没有公开动态"}</View>}
    {!profile.mine && <View className="user-profile-social-dock">
      <View className="user-profile-social-dock-inner">
        <Button className={`user-profile-follow-button ${profile.following ? "is-following" : ""}`} disabled={!canSocialInteract} loading={following} onClick={toggleFollow}>{profile.following ? "已关注" : "＋ 关注"}</Button>
        <Button className="user-profile-chat-button" disabled={!canSocialInteract} loading={chatting} onClick={startChat}>私聊</Button>
      </View>
    </View>}
  </View>
}
