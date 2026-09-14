const weekdayIndex = new Map([
  ["一", 1], ["二", 2], ["三", 3], ["四", 4], ["五", 5], ["六", 6], ["日", 7], ["天", 7]
])

function shanghaiClock(now) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(now)
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]))
  const weekdays = {Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7}
  return {
    weekday: weekdays[values.weekday],
    minutes: Number(values.hour) * 60 + Number(values.minute)
  }
}

export function parseScheduleMoment(timeText, now = new Date()) {
  const source = String(timeText || "")
  const clockMatch = source.match(/(?:^|\D)([01]?\d|2[0-3])[:：]([0-5]\d)(?:\D|$)/)
  if (!clockMatch) return null
  const dayMatch = source.match(/(?:周|星期)([一二三四五六日天])/)
  const current = shanghaiClock(now)
  const targetWeekday = dayMatch ? weekdayIndex.get(dayMatch[1]) : current.weekday
  const hour = Number(clockMatch[1])
  const minute = Number(clockMatch[2])
  const targetMinutes = hour * 60 + minute
  let dayDelta = (targetWeekday - current.weekday + 7) % 7
  let minutesUntil = dayDelta * 24 * 60 + targetMinutes - current.minutes
  if (minutesUntil < 0 || (minutesUntil === 0 && dayMatch)) {
    minutesUntil += dayMatch ? 7 * 24 * 60 : 24 * 60
    dayDelta += dayMatch ? 7 : 1
  }
  return {
    weekday: targetWeekday,
    startTime: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
    minutesUntil,
    dayDelta
  }
}

export function buildHomeScheduleSummary(items, now = new Date()) {
  const current = shanghaiClock(now)
  const parsed = items
    .map(item => ({item, moment: parseScheduleMoment(item.time_text, now)}))
    .filter(entry => entry.moment)
    .sort((left, right) => left.moment.minutesUntil - right.moment.minutesUntil)
  const next = parsed[0]
  const today = items.filter(item => {
    const dayMatch = String(item.time_text || "").match(/(?:周|星期)([一二三四五六日天])/) 
    return dayMatch ? weekdayIndex.get(dayMatch[1]) === current.weekday : Boolean(parseScheduleMoment(item.time_text, now))
  }).length
  return {
    today,
    total: items.length,
    nextCourse: next ? {
      id: Number(next.item.id),
      name: next.item.name,
      timeText: next.item.time_text,
      room: next.item.room || "",
      teacher: next.item.teacher || "",
      startTime: next.moment.startTime,
      minutesUntil: next.moment.minutesUntil
    } : items[0] ? {
      id: Number(items[0].id),
      name: items[0].name,
      timeText: items[0].time_text,
      room: items[0].room || "",
      teacher: items[0].teacher || "",
      startTime: "",
      minutesUntil: null
    } : null
  }
}
