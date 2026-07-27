import {useState} from "react"
import {Button, Image, Input, Text, Textarea, View} from "@tarojs/components"
import Taro, {useDidShow} from "@tarojs/taro"
import ServicePageHeader from "../../components/ServicePageHeader"
import {apiRequest, showApiError, uploadMedia} from "../../api/client"
import "../service-shared.css"
import "./index.css"

type Listing = {id:string;title:string;description:string;category:string;price:string;image_url?:string;condition_label:string;author:string;favorite:boolean}
const emptyForm = {title:"",description:"",category:"数码",price:"",conditionLabel:"正常使用",imageUrl:""}

export default function MarketPage() {
  const [items,setItems] = useState<Listing[]>([])
  const [form,setForm] = useState(emptyForm)
  const [creating,setCreating] = useState(false)
  const [loading,setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    try { setItems((await apiRequest<{items:Listing[]}>("/market/listings")).items) }
    catch(error) { showApiError(error) }
    finally { setLoading(false) }
  }
  useDidShow(load)
  const choose = async () => {
    try {
      const selected = await Taro.chooseImage({count:1,sizeType:["compressed"],sourceType:["album","camera"]})
      if (selected.tempFilePaths[0]) {
        const imageUrl = await uploadMedia(selected.tempFilePaths[0])
        setForm(current => ({...current, imageUrl}))
      }
    } catch(error) { if (!String(error).includes("cancel")) showApiError(error) }
  }
  const submit = async () => {
    try {
      await apiRequest("/market/listings",{method:"POST",data:{...form,price:Number(form.price)}})
      setForm(emptyForm);setCreating(false);Taro.showToast({title:"发布成功",icon:"success"});await load()
    } catch(error) { showApiError(error) }
  }
  const favorite = async (id:string) => {
    try { await apiRequest(`/market/listings/${id}/favorite`,{method:"POST"});await load() }
    catch(error) { showApiError(error) }
  }

  return <View className="page business-page">
    <ServicePageHeader title="二手交易" subtitle="本校发布、收藏与当面验货"/>
    <View className="business-toolbar"><Button className="business-button" onClick={() => setCreating(!creating)}>{creating?"收起发布":"＋ 发布闲置"}</Button></View>
    {creating && <View className="business-form">
      <Input value={form.title} onInput={e => setForm({...form,title:e.detail.value})} placeholder="物品标题"/>
      <Textarea value={form.description} onInput={e => setForm({...form,description:e.detail.value})} placeholder="描述成色、配件和交易地点"/>
      <View className="form-row"><Input value={form.price} type="digit" onInput={e => setForm({...form,price:e.detail.value})} placeholder="价格"/><Input value={form.category} onInput={e => setForm({...form,category:e.detail.value})} placeholder="分类"/></View>
      <Button className="business-button secondary" onClick={choose}>{form.imageUrl?"重新选择图片":"添加实物图片"}</Button>
      {form.imageUrl && <Image className="market-preview" src={form.imageUrl} mode="aspectFill"/>}
      <Text className="form-note">禁止发布违法物品、账号、票据和虚假信息。建议在校内公共区域当面验货。</Text>
      <Button className="business-button" onClick={submit}>确认发布</Button>
    </View>}
    <View className="business-section"><Text className="business-section-title">最新闲置</Text>
      {loading?<View className="loading-card">正在加载…</View>:<View className="market-grid">{items.map(item => <View className="business-card market-card" key={item.id}>
        {item.image_url?<Image src={item.image_url} mode="aspectFill"/>:<View className="market-placeholder">闲</View>}
        <Text className="business-card-title">{item.title}</Text><Text className="business-copy">{item.description}</Text>
        <View className="business-meta"><Text>{item.condition_label}</Text><Text>{item.category}</Text><Text>{item.author}</Text></View>
        <View className="market-bottom"><Text className="business-price">¥{item.price}</Text><Text onClick={() => favorite(item.id)}>{item.favorite?"★ 已收藏":"☆ 收藏"}</Text></View>
      </View>)}</View>}
      {!loading&&items.length===0&&<View className="business-empty">还没有闲置物品，发布第一条吧</View>}
    </View>
  </View>
}
