import {useMemo, useState} from "react"
import {Button, Image, Input, ScrollView, Text, View} from "@tarojs/components"
import Taro, {useDidShow, usePullDownRefresh} from "@tarojs/taro"
import {requirePhoneLogin, showApiError} from "../../api/client"
import {currentCampusName, currentTenant} from "../../store/tenant"
import {deleteRankingComment, fetchRankingComments, fetchRankingLists, fetchRankingPlaces, reportRankingComment, reportRankingPlace, submitRankingComment, toggleRankingFavorite, toggleRankingLike, withdrawRankingList, withdrawRankingPlace, type RankingCategory, type RankingComment, type RankingList, type RankingPlace, type RankingSort} from "../../store/rankings"
import type {Tenant} from "../../types/tenant"
import foodGuide from "../../assets/campus/tangshan-food-guide.mini.webp"
import tangshanNanhu from "../../assets/campus/tangshan-nanhu.mini.webp"
import tangshanMuseum from "../../assets/campus/tangshan-museum.mini.webp"
import tangshanPhoenix from "../../assets/campus/tangshan-phoenix.mini.webp"
import campusLocomotive from "../../assets/campus/campus-locomotive.mini.webp"
import campusGate from "../../assets/campus/campus-gate.mini.webp"
import snackShelf from "../../assets/services-real/snacks-pexels.mini.webp"
import campusBooks from "../../assets/services-real/market-books.mini.webp"
import yuSistersCover from "../../assets/rankings/places/food-yu-sisters.mini.webp"
import jinseDuckCover from "../../assets/rankings/places/food-jinse-duck.mini.webp"
import xiaosongCover from "../../assets/rankings/places/food-xiaosong.mini.webp"
import liujiaBbqCover from "../../assets/rankings/places/food-liujia-bbq.mini.webp"
import pizzaHutWuyueCover from "../../assets/rankings/places/food-pizzahut-wuyue.mini.webp"
import yuanyangCover from "../../assets/rankings/places/fun-yuanyang.mini.webp"
import wuyueCover from "../../assets/rankings/places/fun-wuyue.mini.webp"
import cool8Cover from "../../assets/rankings/places/fun-cool8.mini.webp"
import opticalCover from "../../assets/rankings/places/life-xueyuan-optical.mini.webp"
import fruitCover from "../../assets/rankings/places/life-natural-fruit.mini.webp"
import hairCover from "../../assets/rankings/places/life-run-hair.mini.webp"
import mochaProLogo from "../../assets/rankings/mocha-pro/logo.mini.webp"
import mochaProWave from "../../assets/rankings/mocha-pro/wave.mini.webp"
import mochaProLong from "../../assets/rankings/mocha-pro/long.mini.webp"
import mochaProColor from "../../assets/rankings/mocha-pro/color.mini.webp"
import heartIcon from "../../assets/icons/community/heart.svg"
import mapPinIcon from "../../assets/icons/community/map-pin.svg"
import trustedIcon from "../../assets/icons/community/rosette-discount-check.svg"
import plusIcon from "../../assets/icons/svg/circle-plus.svg"
import "./index.css"

type MerchantProfile = {avatar: string; services: string[]; gallery: string[]; sourceNote: string}
type DisplayPlace = RankingPlace & {cover: string; coverNote: string; merchantProfile?: MerchantProfile}
type CoverAsset = {src: string; note: string}

const groups: Array<{id: Exclude<RankingCategory, "custom">; label: string; caption: string; fallbackCover: string}> = [
  {id: "food", label: "美食", caption: "同学聚餐与校园周边餐饮", fallbackCover: foodGuide},
  {id: "fun", label: "玩乐", caption: "周末散步、看展与城市游玩", fallbackCover: tangshanNanhu},
  {id: "life", label: "生活", caption: "自习、办事与校园生活便利地点", fallbackCover: campusLocomotive}
]
const defaultRankingLists: RankingList[] = groups.map(item => ({id: item.id, title: item.label, description: item.caption, entryLabel: "地点", coverUrl: item.fallbackCover, builtIn: true, mine: false, status: "active", moderationNote: "", itemCount: 0, createdAt: null}))
const sortOptions: Array<{id: RankingSort; label: string}> = [{id: "top", label: "总榜"}, {id: "week", label: "本周热度"}, {id: "new", label: "新上榜"}]
const coverByKey: Record<string, CoverAsset> = {
  "food-yu-sisters": {src: yuSistersCover, note: "地点公开资料图"},
  "food-jinse-duck": {src: jinseDuckCover, note: "地点公开资料图"},
  "food-xiaosong": {src: xiaosongCover, note: "地点公开资料图"},
  "food-liujia-bbq": {src: liujiaBbqCover, note: "地点公开资料图"},
  "food-pizzahut-wuyue": {src: pizzaHutWuyueCover, note: "地点公开资料图"},
  "food-two-worlds": {src: foodGuide, note: "同类餐饮实景示意"},
  "food-tangshanyan": {src: foodGuide, note: "地点公开资料图"},
  "food-yuanyang": {src: yuanyangCover, note: "所在商圈公开资料图"},
  "food-university": {src: jinseDuckCover, note: "校园周边餐饮实景示意"},
  "fun-yuanyang": {src: yuanyangCover, note: "地点公开资料图"},
  "fun-wuyue": {src: wuyueCover, note: "地点公开资料图"},
  "fun-cool8": {src: cool8Cover, note: "同类台球场实景示意"},
  "fun-nanhu": {src: tangshanNanhu, note: "地点公开资料图"},
  "fun-museum": {src: tangshanMuseum, note: "地点公开资料图"},
  "fun-phoenix": {src: tangshanPhoenix, note: "地点公开资料图"},
  "life-yongxin": {src: snackShelf, note: "同类便利店实景示意"},
  "life-yida": {src: snackShelf, note: "同类便利店实景示意"},
  "life-xueyuan-optical": {src: opticalCover, note: "同类眼镜店实景示意"},
  "life-natural-fruit": {src: fruitCover, note: "同类水果店实景示意"},
  "life-run-hair": {src: hairCover, note: "同类美发店实景示意"},
  "life-library": {src: campusBooks, note: "同类自习空间实景示意"},
  "life-longhua": {src: tangshanPhoenix, note: "同类城市公园实景示意"},
  "life-yuanyang": {src: yuanyangCover, note: "所在商圈公开资料图"},
  "life-mocha-pro": {src: mochaProWave, note: "门店提供图片"}
}
const merchantByCoverKey: Record<string, MerchantProfile> = {"life-mocha-pro": {avatar: mochaProLogo, services: ["剪发设计", "烫染造型", "发色沟通"], gallery: [mochaProWave, mochaProLong, mochaProColor], sourceNote: "作品图片由门店提供；具体方案、价格与营业信息请到店确认。"}}
const reportReasons = ["地点信息不准确", "广告或虚假推荐", "内容不适宜", "地点已关闭"]
const commentReportReasons = ["广告或联系方式", "辱骂或骚扰", "不实内容", "其他不适宜内容"]

function referenceSummary(place: RankingPlace) {
  if (typeof place.referenceRating === "number" && place.referenceCount > 0) {
    return `${place.referenceSource} ${place.referenceRating.toFixed(1)} 分 · ${place.referenceCount} 条评价`
  }
  if (place.referenceSource) return `${place.referenceSource} · 地点资料已核验`
  return "校内同学投稿"
}

function rankingScore(place: RankingPlace, sort: RankingSort) {
  const campusLikes = sort === "week" ? place.weeklyLikes : place.likes
  if (campusLikes > 0) return sort === "week" ? `${campusLikes} 本周校内赞` : `${campusLikes} 校内赞`
  if (typeof place.referenceRating === "number" && place.referenceCount > 0) return `参考 ${place.referenceRating.toFixed(1)} 分`
  return "公开地点已核验"
}

function PlaceCover({place, className}: {place: DisplayPlace; className: string}) {
  if (place.cover) return <View className={`place-cover ${className}`}><Image className="place-cover-image" src={place.cover} mode="aspectFill"/></View>
  const tone = Math.abs(Array.from(place.coverKey || place.name).reduce((total, character) => total + character.charCodeAt(0), 0)) % 5
  return <View className={`place-cover place-cover-tone-${tone} ${className}`}><Text>{place.name.slice(0, 2)}</Text><Text>{place.referenceSource || "校园地点"}</Text></View>
}

function friendlyTime(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? "刚刚" : `${date.getMonth() + 1}月${date.getDate()}日`
}

export default function RankingsPage() {
  const [tenant, setTenant] = useState<Tenant>(currentTenant())
  const [campusName, setCampusName] = useState(currentCampusName())
  const [rankingLists, setRankingLists] = useState<RankingList[]>(defaultRankingLists)
  const [listId, setListId] = useState("life")
  const [sort, setSort] = useState<RankingSort>("top")
  const [searchDraft, setSearchDraft] = useState("")
  const [query, setQuery] = useState("")
  const [places, setPlaces] = useState<RankingPlace[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState("")
  const [actingId, setActingId] = useState("")
  const [selectedPlace, setSelectedPlace] = useState<DisplayPlace | null>(null)
  const [comments, setComments] = useState<RankingComment[]>([])
  const [commentsLoading, setCommentsLoading] = useState(false)
  const [commentDraft, setCommentDraft] = useState("")

  const publicLists = rankingLists.filter(item => item.status === "active")
  const ownListSubmissions = rankingLists.filter(item => item.mine && item.status !== "active" && item.status !== "removed")
  const activeList = publicLists.find(item => item.id === listId) || defaultRankingLists[2]
  const activeGroup = groups.find(item => item.id === activeList.id) || {fallbackCover: activeList.coverUrl || campusGate, caption: activeList.description}
  const displayPlaces = useMemo<DisplayPlace[]>(() => places.map(item => {
    const bundledCover = coverByKey[item.coverKey]
    return {...item, cover: item.imageUrl || bundledCover?.src || activeGroup.fallbackCover, coverNote: item.imageUrl ? "同学投稿图片" : bundledCover?.note || "榜单类别实景图", merchantProfile: merchantByCoverKey[item.coverKey]}
  }), [activeGroup.fallbackCover, places])
  const activePlaces = displayPlaces.filter(item => item.status === "active")
  const podium = activePlaces.slice(0, 3)
  const remaining = activePlaces.slice(3)
  const ownPending = displayPlaces.filter(item => item.mine && item.status !== "active" && item.status !== "removed")

  const loadCategory = async (target = listId, targetSort = sort, targetQuery = query, notify = false) => {
    setLoading(true); setLoadError("")
    try {
      const result = await fetchRankingPlaces(target, {sort: targetSort, query: targetQuery})
      setPlaces(result.items); setTotal(result.total)
    } catch (error) {
      setPlaces([]); setTotal(0); setLoadError("暂时没连上校园榜单")
      if (notify) showApiError(error)
    } finally { setLoading(false); Taro.stopPullDownRefresh() }
  }

  useDidShow(() => {
    setTenant(currentTenant()); setCampusName(currentCampusName())
    void (async () => {
      const pendingGroup = Taro.getStorageSync<string>("stardust_ranking_pending_group")
      try {
        const result = await fetchRankingLists()
        setRankingLists(result.items)
        const available = result.items.filter(item => item.status === "active")
        const target = pendingGroup && available.some(item => item.id === pendingGroup)
          ? pendingGroup
          : available.some(item => item.id === listId) ? listId : available[0]?.id || "life"
        setListId(target)
        await loadCategory(target, sort, query)
      } catch (error) {
        await loadCategory(listId, sort, query)
        showApiError(error)
      } finally {
        if (pendingGroup) Taro.removeStorageSync("stardust_ranking_pending_group")
      }
    })()
  })
  usePullDownRefresh(() => void (async () => {
    try { setRankingLists((await fetchRankingLists()).items) } catch (error) { showApiError(error) }
    await loadCategory(listId, sort, query, true)
  })())

  const updatePlace = (id: string, patch: Partial<RankingPlace>) => {
    setPlaces(current => current.map(item => item.id === id ? {...item, ...patch} : item))
    setSelectedPlace(current => current?.id === id ? {...current, ...patch} : current)
  }
  const selectCategory = (target: string) => { if (target !== listId) { setListId(target); setSelectedPlace(null); void loadCategory(target, sort, query) } }
  const selectSort = (target: RankingSort) => { if (target !== sort) { setSort(target); setSelectedPlace(null); void loadCategory(listId, target, query) } }
  const runSearch = () => { const next = searchDraft.trim(); setQuery(next); setSelectedPlace(null); void loadCategory(listId, sort, next) }

  const likePlace = async (place: DisplayPlace) => {
    if (place.status !== "active" || actingId || !await requirePhoneLogin(`登录后才能支持这个${activeList.entryLabel}。`)) return
    if (!place.liked) {
      const confirmation = await Taro.showModal({title: `确认支持这个${activeList.entryLabel}？`, content: "请根据真实体验和真实内容投票，每个账号只能支持一次。", confirmText: "确认支持", cancelText: "再看看", confirmColor: "#2f7fe8"})
      if (!confirmation.confirm) return
    }
    setActingId(place.id)
    try { updatePlace(place.id, await toggleRankingLike(place.id)) } catch (error) { showApiError(error) } finally { setActingId("") }
  }
  const favoritePlace = async (place: DisplayPlace) => {
    if (!await requirePhoneLogin("登录后才能收藏校园地点。")) return
    setActingId(place.id)
    try { updatePlace(place.id, await toggleRankingFavorite(place.id)) } catch (error) { showApiError(error) } finally { setActingId("") }
  }
  const reportPlace = async (place: DisplayPlace) => {
    if (!await requirePhoneLogin("登录后才能举报不准确的地点信息。")) return
    try { const selected = await Taro.showActionSheet({itemList: reportReasons}); const reason = reportReasons[selected.tapIndex]; if (reason) { await reportRankingPlace(place.id, reason); Taro.showToast({title: "举报已提交", icon: "success"}) } }
    catch (error) { const message = error instanceof Error ? error.message : ""; if (message && !/cancel/i.test(message)) showApiError(error) }
  }
  const withdrawPlace = async (place: DisplayPlace) => {
    const confirmation = await Taro.showModal({title: "撤回这个地点？", content: "撤回后将不再审核，且无法恢复。", confirmText: "确认撤回", confirmColor: "#d94b61"})
    if (!confirmation.confirm) return
    try { await withdrawRankingPlace(place.id); setSelectedPlace(null); await loadCategory(listId, sort, query); Taro.showToast({title: "已撤回", icon: "success"}) } catch (error) { showApiError(error) }
  }
  const withdrawList = async (list: RankingList) => {
    const confirmation = await Taro.showModal({title: "撤回这个榜单？", content: "撤回后将不再审核，且无法恢复。", confirmText: "确认撤回", confirmColor: "#d94b61"})
    if (!confirmation.confirm) return
    try { await withdrawRankingList(list.id); setRankingLists(current => current.filter(item => item.id !== list.id)); Taro.showToast({title: "已撤回", icon: "success"}) } catch (error) { showApiError(error) }
  }
  const showPlace = async (place: DisplayPlace) => {
    setSelectedPlace(place); setComments([]); setCommentDraft("")
    if (place.status !== "active") return
    setCommentsLoading(true)
    try { setComments((await fetchRankingComments(place.id)).items) } catch (error) { showApiError(error) } finally { setCommentsLoading(false) }
  }
  const publishComment = async () => {
    if (!selectedPlace || !commentDraft.trim() || !await requirePhoneLogin("登录后才能评论校园地点。")) return
    setActingId(`comment-${selectedPlace.id}`)
    try { const result = await submitRankingComment(selectedPlace.id, commentDraft.trim()); setComments(current => [...current, result.item]); setCommentDraft(""); updatePlace(selectedPlace.id, {comments: selectedPlace.comments + 1}) }
    catch (error) { showApiError(error) } finally { setActingId("") }
  }
  const manageComment = async (comment: RankingComment) => {
    try {
      if (comment.mine) {
        if ((await Taro.showActionSheet({itemList: ["删除评论"]})).tapIndex !== 0) return
        await deleteRankingComment(comment.id); setComments(current => current.filter(item => item.id !== comment.id))
        if (selectedPlace) updatePlace(selectedPlace.id, {comments: Math.max(0, selectedPlace.comments - 1)})
      } else {
        if (!await requirePhoneLogin("登录后才能举报不适宜的评论。")) return
        const action = await Taro.showActionSheet({itemList: commentReportReasons}); const reason = commentReportReasons[action.tapIndex]
        if (reason) { await reportRankingComment(comment.id, reason); Taro.showToast({title: "举报已提交", icon: "success"}) }
      }
    } catch (error) { const message = error instanceof Error ? error.message : ""; if (message && !/cancel/i.test(message)) showApiError(error) }
  }
  const previewPlaceImage = (place: DisplayPlace, current: string) => Taro.previewImage({current, urls: place.merchantProfile?.gallery || [place.cover]})

  return <View className="page rankings-page">
    <View className="ranking-topbar"><View className="ranking-brand"><Image src={campusGate} mode="aspectFill"/><Text>{tenant.shortName} · 校园榜单</Text></View><View className="ranking-campus-switch" onClick={() => Taro.navigateTo({url: "/pages/school-select/index"})}><Text>{campusName}</Text><Text>切换</Text></View></View>
    <View className="ranking-heading"><Text>本校校园榜单</Text><Text>同学可以发起新榜单，用真实图片和校内点赞一起排出名次</Text></View>
    <View className="ranking-create-entry" onClick={() => Taro.navigateTo({url: "/pages/ranking-create/index"})}><View><Text>想排点不一样的？</Text><Text>发起“校园小动物”“最美晚霞”等新榜单</Text></View><Text>创建榜单</Text></View>
    <View className="ranking-search"><Input value={searchDraft} maxlength={30} confirmType="search" placeholder={`搜索${activeList.entryLabel}、位置或推荐理由`} onInput={event => setSearchDraft(event.detail.value)} onConfirm={runSearch}/><Button onClick={runSearch}>搜索</Button></View>
    <ScrollView className="ranking-tabs-scroll" scrollX enhanced showScrollbar={false}><View className="ranking-tabs">{publicLists.map(item => <Text key={item.id} className={listId === item.id ? "active" : ""} onClick={() => selectCategory(item.id)}>{item.title}</Text>)}</View></ScrollView>
    <View className="ranking-sort-tabs">{sortOptions.map(item => <Text key={item.id} className={sort === item.id ? "active" : ""} onClick={() => selectSort(item.id)}>{item.label}</Text>)}</View>
    <View className="ranking-trust-note"><Image src={trustedIcon}/><View><Text>{activeList.title}</Text><Text>{activeList.description} · {loading ? "正在更新" : `${total} 个${activeList.entryLabel}`}</Text></View><Text className="ranking-school-label">全校共享</Text></View>
    {loading && displayPlaces.length === 0 && <View className="ranking-loading"><Text>正在加载榜单…</Text></View>}
    {!loading && podium.length > 0 && <View className="ranking-podium">{podium.map((place, index) => <View className={`ranking-podium-card rank-${index + 1}`} key={place.id} onClick={() => void showPlace(place)}><Text className="ranking-podium-rank">{index + 1}</Text><PlaceCover place={place} className="ranking-podium-cover"/><Text className="ranking-podium-name">{place.name}</Text><Text className="ranking-podium-campus">{place.campusName || campusName}</Text><Text className="ranking-podium-score">{rankingScore(place, sort)}</Text></View>)}</View>}
    {!loading && remaining.length > 0 && <View className="ranking-entries">{remaining.map((place, index) => <View className="ranking-entry" key={place.id} onClick={() => void showPlace(place)}><Text className="rank-ordinal">{index + 4}</Text><View className="rank-photo-wrap"><PlaceCover place={place} className="rank-photo"/>{place.merchantProfile && <Image className="rank-merchant-avatar" src={place.merchantProfile.avatar} mode="aspectFill"/>}</View><View className="rank-copy"><View className="rank-name-line"><Text>{place.name}</Text>{place.featured && <Text>精选</Text>}</View><Text className="rank-note">{place.note}</Text><View className="rank-location-line"><Image src={mapPinIcon}/><Text>{place.campusName || campusName} · {place.location}</Text></View><Text className="rank-reference">{referenceSummary(place)}</Text><Text className="rank-stats">{place.likes > 0 ? `${place.likes} 个校内赞` : "等待首位校内推荐"} · {place.comments} 条评论</Text></View><Button className={`rank-like ${place.liked ? "liked" : ""}`} loading={actingId === place.id} disabled={Boolean(actingId)} onClick={event => {event.stopPropagation(); void likePlace(place)}}><Image src={heartIcon}/><Text>{place.likes}</Text></Button></View>)}</View>}
    {!loading && ownPending.length > 0 && <View className="ranking-own-submissions"><Text>我的投稿</Text>{ownPending.map(place => <View key={place.id} onClick={() => void showPlace(place)}><Text>{place.name}</Text><Text>{place.status === "pending" ? "审核中" : "未通过"}</Text></View>)}</View>}
    {ownListSubmissions.length > 0 && <View className="ranking-own-lists"><Text className="ranking-own-lists-title">我创建的榜单</Text>{ownListSubmissions.map(item => <View className="ranking-own-list" key={item.id}><View><Text>{item.title}</Text><Text>{item.status === "pending" ? "管理员审核中" : item.moderationNote || "未通过审核"}</Text></View><Button onClick={() => void withdrawList(item)}>撤回</Button></View>)}</View>}
    {!loading && activePlaces.length === 0 && <View className="ranking-empty"><Image src={activeGroup.fallbackCover} mode="aspectFill"/><Text>{loadError || (query ? `没有找到相关${activeList.entryLabel}` : `这个榜单还没有${activeList.entryLabel}`)}</Text><Text>{loadError ? "检查网络后重新加载，已经提交的内容不会丢失。" : `上传真实的${activeList.entryLabel}和图片，审核通过后参与全校同学投票。`}</Text><Button onClick={() => loadError ? void loadCategory(listId, sort, query, true) : Taro.navigateTo({url: `/pages/ranking-submit/index?listId=${encodeURIComponent(listId)}`})}>{loadError ? "重新加载" : `上传${activeList.entryLabel}`}</Button></View>}
    <View className="ranking-submit-bar" onClick={() => Taro.navigateTo({url: `/pages/ranking-submit/index?listId=${encodeURIComponent(listId)}`})}><Image src={plusIcon}/><View><Text>提交新{activeList.entryLabel}</Text><Text>审核通过后加入“{activeList.title}”</Text></View><Text>去上传</Text></View>
    {selectedPlace && <View className="ranking-detail-backdrop" onClick={() => setSelectedPlace(null)}><View className="ranking-detail" onClick={event => event.stopPropagation()}><View className="ranking-detail-header"><Text>{activeList.entryLabel}详情</Text><Button onClick={() => setSelectedPlace(null)}>关闭</Button></View><View onClick={() => selectedPlace.cover && previewPlaceImage(selectedPlace, selectedPlace.cover)}><PlaceCover place={selectedPlace} className="ranking-detail-cover"/></View><Text className="ranking-image-source">{selectedPlace.coverNote}</Text><Text className="ranking-detail-name">{selectedPlace.name}</Text><View className="ranking-detail-location"><Image src={mapPinIcon}/><Text>{selectedPlace.campusName || campusName} · {selectedPlace.location}</Text></View><View className="ranking-detail-meta"><Text>{selectedPlace.likes > 0 ? `${selectedPlace.likes} 个校内赞` : "等待首位校内推荐"}</Text><Text>{selectedPlace.favorites} 人收藏</Text><Text>{selectedPlace.comments} 条评论</Text></View><Text className="ranking-detail-reference">{referenceSummary(selectedPlace)} · 仅作起榜参考</Text><Text className="ranking-detail-note">{selectedPlace.note}</Text>
      {selectedPlace.status !== "active" && <View className={`ranking-detail-status ${selectedPlace.status}`}><Text>{selectedPlace.status === "pending" ? "地点正在等待审核" : "地点未通过审核"}</Text>{selectedPlace.moderationNote && <Text>{selectedPlace.moderationNote}</Text>}</View>}
      {selectedPlace.merchantProfile && <><View className="ranking-service-list">{selectedPlace.merchantProfile.services.map(service => <Text key={service}>{service}</Text>)}</View><View className="ranking-gallery-heading"><Text>作品图片</Text><Text>点击查看大图</Text></View><View className="ranking-gallery">{selectedPlace.merchantProfile.gallery.map(image => <Image key={image} src={image} mode="aspectFill" onClick={() => previewPlaceImage(selectedPlace, image)}/>)}</View><Text className="ranking-source-note">{selectedPlace.merchantProfile.sourceNote}</Text></>}
      {selectedPlace.status === "active" && <View className="ranking-detail-actions two-columns"><Button className={`detail-favorite ${selectedPlace.favorited ? "active" : ""}`} loading={actingId === selectedPlace.id} onClick={() => void favoritePlace(selectedPlace)}>{selectedPlace.favorited ? "已收藏" : "收藏"}</Button><Button className={`detail-like ${selectedPlace.liked ? "liked" : ""}`} loading={actingId === selectedPlace.id} onClick={() => void likePlace(selectedPlace)}><Image src={heartIcon}/><Text>{selectedPlace.liked ? "已支持" : "我支持"} · {selectedPlace.likes}</Text></Button></View>}
      {selectedPlace.status === "active" && <View className="ranking-comments"><View className="ranking-comments-head"><Text>同学评价</Text><Text>{selectedPlace.comments} 条</Text></View>{commentsLoading && <Text className="ranking-comments-empty">正在加载评论…</Text>}{!commentsLoading && comments.length === 0 && <Text className="ranking-comments-empty">还没有评论，说说你的真实体验</Text>}{comments.map(comment => <View className="ranking-comment" key={comment.id} onClick={() => void manageComment(comment)}><View><Text>{comment.author.nickname}</Text><Text>{friendlyTime(comment.createdAt)} · 点按{comment.mine ? "删除" : "举报"}</Text></View><Text>{comment.content}</Text></View>)}<View className="ranking-comment-compose"><Input value={commentDraft} maxlength={200} confirmType="send" placeholder="写下真实体验，不留联系方式" onInput={event => setCommentDraft(event.detail.value)} onConfirm={() => void publishComment()}/><Button loading={actingId === `comment-${selectedPlace.id}`} disabled={!commentDraft.trim() || Boolean(actingId)} onClick={() => void publishComment()}>发送</Button></View></View>}
      <View className="ranking-detail-actions">{selectedPlace.status === "active" && !selectedPlace.mine && <Button className="detail-secondary" onClick={() => void reportPlace(selectedPlace)}>举报信息</Button>}{selectedPlace.mine && ["pending", "rejected"].includes(selectedPlace.status) && <Button className="detail-secondary danger" onClick={() => void withdrawPlace(selectedPlace)}>撤回投稿</Button>}</View>
    </View></View>}
  </View>
}
