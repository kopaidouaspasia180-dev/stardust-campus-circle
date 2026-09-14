import {useEffect, useMemo, useState} from "react"
import {Button, Image, Input, Text, View} from "@tarojs/components"
import Taro, {useDidShow} from "@tarojs/taro"
import {apiRequest, hasPhoneLogin, requirePhoneLogin, showApiError, uploadMedia} from "../../api/client"
import {
  buildStoredScheduleSummary,
  getStoredSchedule,
  parseCourseSchedule,
  scheduleStorageKey,
  type StoredCourse
} from "../../data/demoSchedule"
import {currentCampusName, currentTenant} from "../../store/tenant"
import calendarIcon from "../../assets/icons/svg/calendar-week.svg"
import plusIcon from "../../assets/icons/svg/circle-plus.svg"
import "./index.css"

type Course = StoredCourse

type RemoteCourse = {
  id: number
  name: string
  time_text: string
  room?: string
  teacher?: string
}

const dayDefinitions = [
  {dayIndex: 1, label: "一", text: "周一"},
  {dayIndex: 2, label: "二", text: "周二"},
  {dayIndex: 3, label: "三", text: "周三"},
  {dayIndex: 4, label: "四", text: "周四"},
  {dayIndex: 5, label: "五", text: "周五"},
  {dayIndex: 6, label: "六", text: "周六"},
  {dayIndex: 0, label: "日", text: "周日"}
]

const emptyCourse = (): Course => ({name: "", time: "", room: "", teacher: ""})
const toCourse = (item: RemoteCourse): Course => ({
  id: item.id,
  name: item.name,
  time: item.time_text,
  room: item.room || "",
  teacher: item.teacher || ""
})

function startOfCurrentWeek(now: Date) {
  const date = new Date(now)
  const diff = date.getDay() === 0 ? -6 : 1 - date.getDay()
  date.setDate(date.getDate() + diff)
  date.setHours(0, 0, 0, 0)
  return date
}

function dateForDay(dayIndex: number, now: Date) {
  const monday = startOfCurrentWeek(now)
  const date = new Date(monday)
  date.setDate(monday.getDate() + (dayIndex === 0 ? 6 : dayIndex - 1))
  return date
}

function periodText(course: Course) {
  const parsed = parseCourseSchedule(course)
  return parsed?.periods ? `第${parsed.periods}节` : ""
}

function weekText(course: Course) {
  return course.time.split("·").map(item => item.trim()).find(item => /周/.test(item) && !/^(周|星期)[一二三四五六日天]/.test(item)) || ""
}

function courseState(course: Course, selectedDay: number, now: Date) {
  if (selectedDay !== now.getDay()) return "待上课"
  const parsed = parseCourseSchedule(course)
  if (!parsed) return "待确认"
  const minutes = now.getHours() * 60 + now.getMinutes()
  if (minutes >= parsed.endMinutes) return "已结束"
  if (minutes >= parsed.startMinutes) return "进行中"
  return "待上课"
}

function countdownText(minutes: number | null | undefined, ongoing?: boolean) {
  if (ongoing) return "正在上课"
  if (minutes === null || minutes === undefined) return "时间待确认"
  if (minutes < 60) return `${Math.max(1, minutes)} 分钟后`
  if (minutes < 24 * 60) return `${Math.floor(minutes / 60)} 小时 ${minutes % 60} 分后`
  return `${Math.floor(minutes / (24 * 60))} 天后`
}

export default function SchedulePage() {
  const [items, setItems] = useState<Course[]>([])
  const [form, setForm] = useState<Course>(emptyCourse)
  const [selectedDay, setSelectedDay] = useState(new Date().getDay())
  const [storageMode, setStorageMode] = useState("正在同步")
  const [drafts, setDrafts] = useState<Course[]>([])
  const [previewImage, setPreviewImage] = useState("")
  const [recognizing, setRecognizing] = useState(false)
  const [recognitionStage, setRecognitionStage] = useState("")
  const [savingDrafts, setSavingDrafts] = useState(false)
  const [manualOpen, setManualOpen] = useState(false)
  const [manageMode, setManageMode] = useState(false)
  const [clock, setClock] = useState(Date.now())
  const tenant = currentTenant()
  const campusName = currentCampusName()
  const now = useMemo(() => new Date(clock), [clock])

  useEffect(() => {
    const timer = setInterval(() => setClock(Date.now()), 60_000)
    return () => clearInterval(timer)
  }, [])

  const saveLocal = (next: Course[]) => {
    setItems(next)
    Taro.setStorageSync(scheduleStorageKey(), next)
  }

  const loadSchedule = async () => {
    if (!hasPhoneLogin()) {
      setItems([])
      setForm(emptyCourse())
      setDrafts([])
      setPreviewImage("")
      setManualOpen(false)
      setManageMode(false)
      setStorageMode("登录后同步")
      return
    }
    try {
      const result = await apiRequest<{items: RemoteCourse[]}>("/schedule")
      const next = result.items.map(toCourse)
      // 云端请求成功后以云端为准。空数组代表这个账号确实尚未导入课表，
      // 不能再用旧缓存或演示数据填充，否则会造成账号间数据串用的错觉。
      saveLocal(next)
      setStorageMode(next.length ? "云端已同步" : "待导入")
    } catch {
      const local = getStoredSchedule()
      setItems(local)
      setStorageMode(Taro.getStorageSync<Course[]>(scheduleStorageKey())?.length ? "本机已保存" : "本机课表")
    }
  }

  useDidShow(() => { void loadSchedule() })

  const add = async () => {
    if (!await requirePhoneLogin("登录后才能添加并同步个人课表。")) return
    if (!form.name.trim() || !form.time.trim()) {
      Taro.showToast({title: "请填写课程和时间", icon: "none"})
      return
    }
    const course = {
      name: form.name.trim(),
      time: form.time.trim(),
      room: form.room.trim(),
      teacher: form.teacher.trim()
    }
    try {
      const result = await apiRequest<{item: RemoteCourse}>("/schedule", {method: "POST", data: course})
      saveLocal([...items, toCourse(result.item)])
      setStorageMode("云端已同步")
      Taro.showToast({title: "已同步课表", icon: "success"})
    } catch {
      saveLocal([...items, course])
      setStorageMode("本机已保存")
      Taro.showToast({title: "已保存到本机", icon: "none"})
    }
    setForm(emptyCourse())
    setManualOpen(false)
  }

  const remove = async (course: Course) => {
    const modal = await Taro.showModal({
      title: "删除这门课程？",
      content: course.id ? "删除后会同步到你的云端课表。" : "只会从当前设备的课表中移除。",
      confirmText: "删除",
      confirmColor: "#e2545f"
    })
    if (!modal.confirm) return
    if (course.id) {
      try {
        await apiRequest(`/schedule/${course.id}`, {method: "DELETE"})
      } catch (error) {
        showApiError(error)
        return
      }
    }
    saveLocal(items.filter(item => item !== course))
    Taro.showToast({title: "已删除", icon: "success"})
  }

  const recognizeImage = async () => {
    if (recognizing) return
    if (!await requirePhoneLogin("登录后才能导入课表，识别结果会同步到你的个人账号。")) return
    try {
      const selection = await Taro.chooseImage({count: 1, sizeType: ["compressed"], sourceType: ["album", "camera"]})
      const filePath = selection.tempFilePaths[0]
      if (!filePath) return
      setPreviewImage(filePath)
      setDrafts([])
      setRecognizing(true)
      setRecognitionStage("正在上传课表图片")
      const imageUrl = await uploadMedia(filePath)
      setRecognitionStage("正在按星期识别，通常需要 30–60 秒")
      const result = await apiRequest<{items: Course[]; provider: string}>("/schedule/import-image", {
        method: "POST",
        data: {imageUrl},
        timeoutMs: 240_000
      })
      setRecognitionStage("识别完成，请核对课程")
      setDrafts(result.items)
      Taro.showToast({title: `识别到 ${result.items.length} 门`, icon: "none"})
    } catch (error) {
      setRecognitionStage("")
      const message = error instanceof Error ? error.message : String(error || "")
      if (!/cancel/i.test(message)) showApiError(error)
    } finally {
      setRecognizing(false)
    }
  }

  const updateDraft = (index: number, field: keyof Course, value: string) => {
    setDrafts(current => current.map((item, itemIndex) => itemIndex === index ? {...item, [field]: value} : item))
  }

  const removeDraft = (index: number) => {
    setDrafts(current => current.filter((_, itemIndex) => itemIndex !== index))
  }

  const importDrafts = async () => {
    if (!await requirePhoneLogin("登录后才能保存并同步识别出的课表。")) return
    const valid = drafts.filter(item => item.name.trim().length >= 2 && item.time.trim().length >= 2)
    if (!valid.length) {
      Taro.showToast({title: "没有可导入的完整课程", icon: "none"})
      return
    }
    setSavingDrafts(true)
    try {
      const result = await apiRequest<{items?: RemoteCourse[]; inserted: number; skipped: number}>("/schedule/import", {
        method: "POST",
        data: {items: valid}
      })
      setDrafts([])
      setPreviewImage("")
      await loadSchedule()
      Taro.showToast({
        title: result.skipped ? `导入 ${result.inserted} 门，跳过 ${result.skipped} 门` : `已导入 ${result.inserted} 门`,
        icon: "none",
        duration: 2600
      })
    } catch (error) {
      showApiError(error)
    } finally {
      setSavingDrafts(false)
    }
  }

  const scheduleSummary = buildStoredScheduleSummary(items, now)
  const visibleItems = items
    .filter(item => parseCourseSchedule(item)?.dayIndex === selectedDay)
    .sort((left, right) => (parseCourseSchedule(left)?.startMinutes || 9999) - (parseCourseSchedule(right)?.startMinutes || 9999))
  const selectedDate = dateForDay(selectedDay, now)

  return <View className="schedule-v4">
    <View className="schedule-topbar">
      <View>
        <Text className="schedule-page-title">个人课表</Text>
        <Text className="schedule-campus">{tenant.name} · {campusName}</Text>
      </View>
      <View className="schedule-sync"><Text className="schedule-sync-dot"/><Text>{storageMode}</Text></View>
    </View>

    <View className="schedule-next-card">
      <View className="schedule-next-time">
        <Text>{scheduleSummary.nextCourse?.isOngoing ? "当前课程" : "下一节课"}</Text>
        <Text>{scheduleSummary.nextCourse?.startTime || "--:--"}</Text>
        <Text>{countdownText(scheduleSummary.nextCourse?.minutesUntil, scheduleSummary.nextCourse?.isOngoing)}</Text>
      </View>
      <View className="schedule-next-divider"/>
      <View className="schedule-next-copy">
        <View className="schedule-next-title-row">
          <Text>{scheduleSummary.nextCourse?.name || "本周暂无课程"}</Text>
          {scheduleSummary.nextCourse && <Text>{scheduleSummary.nextCourse.isOngoing ? "进行中" : "待上课"}</Text>}
        </View>
        <Text>{scheduleSummary.nextCourse?.room || "导入课表后自动显示教室"}</Text>
        <View className="schedule-next-meta">
          <Text>{scheduleSummary.nextCourse?.teacher || "教师待定"}</Text>
          <Text>{scheduleSummary.nextCourse ? `${scheduleSummary.nextCourse.startTime}–${scheduleSummary.nextCourse.endTime}` : ""}</Text>
        </View>
      </View>
    </View>

    <View className="schedule-import-row" onClick={recognizeImage}>
      <View className="schedule-import-icon"><Image src={calendarIcon} mode="aspectFit"/></View>
      <View className="schedule-import-copy">
        <Text>一张图导入整周课表</Text>
        <Text>智能识别课程、节次、周次、教室和老师</Text>
      </View>
      <Text className="schedule-import-action">{recognizing ? "识别中" : "立即导入"}</Text>
    </View>
    <View className="schedule-quiet-actions">
      <Text>识别结果会先确认，不会直接覆盖</Text>
      <View onClick={() => void requirePhoneLogin("登录后才能添加并同步个人课表。").then(allowed => allowed && setManualOpen(value => !value))}><Image src={plusIcon} mode="aspectFit"/><Text>{manualOpen ? "收起" : "手动添加"}</Text></View>
    </View>

    {previewImage && <View className="schedule-preview-card">
      <Image src={previewImage} mode="aspectFill"/>
      <View><Text>{drafts.length ? `识别到 ${drafts.length} 门课程` : recognitionStage || "课表图片已选择"}</Text><Text>{drafts.length ? "请核对后一次导入" : "会自动拆分星期，不需要手动裁剪"}</Text></View>
      <Text onClick={recognizing ? undefined : recognizeImage}>{recognizing ? "处理中" : "换图"}</Text>
    </View>}

    {drafts.length > 0 && <View className="schedule-draft-section">
      <View className="schedule-draft-title"><View><Text>核对识别结果</Text><Text>点进输入框即可修正</Text></View><Text>{drafts.length} 门</Text></View>
      <View className="schedule-draft-list">
        {drafts.map((course, index) => <View className="schedule-draft-card" key={`${course.name}-${course.time}-${index}`}>
          <View className="schedule-draft-head"><Text>课程 {index + 1}</Text><Text onClick={() => removeDraft(index)}>删除</Text></View>
          <Input value={course.name} onInput={event => updateDraft(index, "name", event.detail.value)} placeholder="课程名称"/>
          <Input value={course.time} onInput={event => updateDraft(index, "time", event.detail.value)} placeholder="星期、节次与周次"/>
          <View className="schedule-draft-row">
            <Input value={course.room} onInput={event => updateDraft(index, "room", event.detail.value)} placeholder="教室"/>
            <Input value={course.teacher} onInput={event => updateDraft(index, "teacher", event.detail.value)} placeholder="教师"/>
          </View>
        </View>)}
      </View>
      <View className="schedule-draft-actions">
        <Button onClick={() => { setDrafts([]); setPreviewImage("") }}>取消</Button>
        <Button loading={savingDrafts} disabled={savingDrafts} onClick={importDrafts}>确认导入</Button>
      </View>
    </View>}

    {manualOpen && <View className="schedule-manual-form">
      <View className="schedule-manual-title"><Text>手动添加课程</Text><Text>只需填写课程与时间</Text></View>
      <Input placeholder="课程名称" value={form.name} onInput={event => setForm({...form, name: event.detail.value})}/>
      <Input placeholder="如：周一 1-2节 · 08:00 · 第1-16周" value={form.time} onInput={event => setForm({...form, time: event.detail.value})}/>
      <View className="schedule-manual-row">
        <Input placeholder="教室" value={form.room} onInput={event => setForm({...form, room: event.detail.value})}/>
        <Input placeholder="教师（可选）" value={form.teacher} onInput={event => setForm({...form, teacher: event.detail.value})}/>
      </View>
      <Button onClick={add}>保存课程</Button>
    </View>}

    <View className="schedule-week-strip">
      {dayDefinitions.map(definition => {
        const date = dateForDay(definition.dayIndex, now)
        const active = selectedDay === definition.dayIndex
        const today = now.getDay() === definition.dayIndex
        return <View key={definition.dayIndex} className={`${active ? "active" : ""} ${today ? "today" : ""}`} onClick={() => setSelectedDay(definition.dayIndex)}>
          <Text>{definition.label}</Text><Text>{date.getDate()}</Text><Text>{today ? "今" : ""}</Text>
        </View>
      })}
    </View>

    <View className="schedule-agenda-head">
      <View><Text>{selectedDate.getMonth() + 1}月{selectedDate.getDate()}日 · {dayDefinitions.find(item => item.dayIndex === selectedDay)?.text}</Text><Text>{visibleItems.length ? `${visibleItems.length} 节课，按上课时间排列` : "今天没有课程安排"}</Text></View>
      <View><Text>本学期</Text><Text onClick={() => setManageMode(value => !value)}>{manageMode ? "完成" : "管理"}</Text></View>
    </View>

    <View className="schedule-agenda">
      {visibleItems.map((course, index) => {
        const state = courseState(course, selectedDay, now)
        const parsed = parseCourseSchedule(course)
        const afternoon = (parsed?.startMinutes || 0) >= 12 * 60
        const previous = index ? parseCourseSchedule(visibleItems[index - 1]) : null
        const showPeriod = index === 0 || afternoon !== ((previous?.startMinutes || 0) >= 12 * 60)
        return <View key={`${course.id || "local"}-${course.name}-${course.time}-${index}`}>
          {showPeriod && <View className="schedule-period-label"><Text>{afternoon ? "下午" : "上午"}</Text><View/></View>}
          <View className={`schedule-agenda-row ${state === "已结束" ? "ended" : ""}`}>
            <View className="schedule-agenda-time"><Text>{parsed?.startTime || "--:--"}</Text><Text>至</Text><Text>{parsed?.endTime || "--:--"}</Text></View>
            <View className="schedule-agenda-line"><Text/></View>
            <View className="schedule-agenda-main">
              <View className="schedule-course-title"><Text>{course.name}</Text>{periodText(course) && <Text>{periodText(course)}</Text>}<Text className={state === "进行中" ? "state-ongoing" : state === "已结束" ? "state-ended" : "state-upcoming"}>{state}</Text></View>
              <Text className="schedule-course-place">{course.room || "教室待定"}</Text>
              <View className="schedule-course-meta"><Text>{course.teacher || "教师待定"}</Text>{weekText(course) && <Text>{weekText(course)}</Text>}</View>
              {manageMode && <Button onClick={() => remove(course)}>删除课程</Button>}
            </View>
          </View>
        </View>
      })}
      {!visibleItems.length && <View className="schedule-empty">
        <Image src={calendarIcon} mode="aspectFit"/>
        <Text>这一天还没有课程</Text>
        <Text onClick={recognizeImage}>导入一张完整课表，自动生成整周安排</Text>
      </View>}
    </View>

    <View className="schedule-footer-note"><Text>课表以教务系统最新安排为准</Text></View>
  </View>
}
