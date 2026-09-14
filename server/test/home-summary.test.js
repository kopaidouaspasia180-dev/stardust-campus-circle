import assert from "node:assert/strict"
import test from "node:test"
import {buildHomeScheduleSummary, parseScheduleMoment} from "../src/home-summary.js"

const mondayMorning = new Date("2026-08-03T01:00:00.000Z")

test("parses the next explicit weekly class in Shanghai time", () => {
  const result = parseScheduleMoment("周一 10:10 1-16周", mondayMorning)
  assert.equal(result.startTime, "10:10")
  assert.equal(result.minutesUntil, 70)
})

test("moves a passed weekly class to the following week", () => {
  const result = parseScheduleMoment("星期一 08:00", mondayMorning)
  assert.equal(result.minutesUntil, 6 * 24 * 60 + 23 * 60)
})

test("builds next-course and real today counts without inventing entries", () => {
  const result = buildHomeScheduleSummary([
    {id: 1, name: "高等数学", time_text: "周五 14:00", room: "A-201", teacher: "王老师"},
    {id: 2, name: "数据结构", time_text: "周一 10:10", room: "B-204", teacher: "李老师"},
    {id: 3, name: "体育", time_text: "周一 16:20", room: "操场", teacher: ""}
  ], mondayMorning)
  assert.equal(result.today, 2)
  assert.equal(result.total, 3)
  assert.equal(result.nextCourse.name, "数据结构")
  assert.equal(result.nextCourse.minutesUntil, 70)
})

test("keeps an unparsed course visible without a fake countdown", () => {
  const result = buildHomeScheduleSummary([
    {id: 4, name: "形势与政策", time_text: "时间待定", room: "", teacher: ""}
  ], mondayMorning)
  assert.equal(result.today, 0)
  assert.equal(result.nextCourse.name, "形势与政策")
  assert.equal(result.nextCourse.minutesUntil, null)
})
