import Taro from "@tarojs/taro"
import {accountStorageKey, hasPhoneLogin} from "../api/client"

export type StoredCourse = {
  id?: number
  name: string
  time: string
  room: string
  teacher: string
}

// v2 intentionally ignores caches written by older builds, because those builds could seed
// a sample timetable into every newly logged-in account. The cloud schedule remains authoritative.
export const SCHEDULE_STORAGE_KEY = "stardust_schedule_v2"

export function scheduleStorageKey() {
  return accountStorageKey(SCHEDULE_STORAGE_KEY)
}

const weekdayIndex: Record<string, number> = {日: 0, 天: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6}
const periodRange: Record<string, {start: string; end: string}> = {
  "1-2": {start: "08:00", end: "09:40"},
  "3-4": {start: "10:10", end: "11:50"},
  "5-6": {start: "14:30", end: "16:10"},
  "7-8": {start: "16:20", end: "18:00"},
  "9-10": {start: "19:00", end: "20:40"}
}

export type ParsedCourseSchedule = {
  dayIndex: number
  startTime: string
  endTime: string
  startMinutes: number
  endMinutes: number
  periods: string
}

export function getStoredSchedule(): StoredCourse[] {
  if (!hasPhoneLogin()) return []
  try {
    const value = Taro.getStorageSync<StoredCourse[]>(scheduleStorageKey())
    return Array.isArray(value) ? value : []
  } catch {
    return []
  }
}

export function parseCourseSchedule(course: StoredCourse): ParsedCourseSchedule | null {
  const dayMatch = course.time.match(/(?:周|星期)([一二三四五六日天])/) 
  const clockMatch = course.time.match(/(?:^|\D)([01]?\d|2[0-3])[:：]([0-5]\d)(?:\D|$)/)
  const periodMatch = course.time.match(/(\d{1,2})\s*[-—~至]\s*(\d{1,2})\s*节/)
  if (!dayMatch || (!clockMatch && !periodMatch)) return null
  const periods = periodMatch ? `${periodMatch[1]}-${periodMatch[2]}` : ""
  const fallback = periodRange[periods]
  const startTime = clockMatch
    ? `${clockMatch[1].padStart(2, "0")}:${clockMatch[2]}`
    : fallback?.start || ""
  if (!startTime) return null
  const startMinutes = Number(startTime.slice(0, 2)) * 60 + Number(startTime.slice(3, 5))
  const endTime = fallback?.start === startTime ? fallback.end : `${String(Math.floor((startMinutes + 100) / 60)).padStart(2, "0")}:${String((startMinutes + 100) % 60).padStart(2, "0")}`
  const endMinutes = Number(endTime.slice(0, 2)) * 60 + Number(endTime.slice(3, 5))
  return {
    dayIndex: weekdayIndex[dayMatch[1]],
    startTime,
    endTime,
    startMinutes,
    endMinutes,
    periods
  }
}

function parseMoment(course: StoredCourse, now: Date) {
  const parsed = parseCourseSchedule(course)
  if (!parsed) return null
  const targetDay = parsed.dayIndex
  const startTime = parsed.startTime
  const targetMinutes = parsed.startMinutes
  const currentMinutes = now.getHours() * 60 + now.getMinutes()
  let dayDelta = (targetDay - now.getDay() + 7) % 7
  let minutesUntil = dayDelta * 24 * 60 + targetMinutes - currentMinutes
  const isOngoing = dayDelta === 0 && currentMinutes >= parsed.startMinutes && currentMinutes < parsed.endMinutes
  if (isOngoing) minutesUntil = 0
  else if (minutesUntil <= 0) minutesUntil += 7 * 24 * 60
  return {...parsed, targetDay, startTime, minutesUntil, isOngoing}
}

export function buildStoredScheduleSummary(items: StoredCourse[], now = new Date()) {
  const parsed = items
    .map((item, order) => ({item, order, moment: parseMoment(item, now)}))
    .filter(entry => entry.moment)
    .sort((left, right) => (left.moment?.minutesUntil || 0) - (right.moment?.minutesUntil || 0) || left.order - right.order)
  const next = parsed[0]
  return {
    today: items.filter(item => parseMoment(item, now)?.targetDay === now.getDay()).length,
    total: items.length,
    nextCourse: next ? {
      id: Number(next.item.id || 0),
      name: next.item.name,
      timeText: next.item.time,
      room: next.item.room,
      teacher: next.item.teacher,
      startTime: next.moment?.startTime || "",
      endTime: next.moment?.endTime || "",
      minutesUntil: next.moment?.minutesUntil ?? null,
      isOngoing: Boolean(next.moment?.isOngoing)
    } : null
  }
}
