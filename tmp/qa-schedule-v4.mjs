import {chromium} from "playwright-core"
import path from "node:path"
import {readFile} from "node:fs/promises"
import {resolveBrowserExecutable} from "../docs/qa-browser.mjs"

const root = process.cwd()
const base = process.env.QA_BASE || "http://127.0.0.1:4176/campus-circle/"
const errors = []
let importedCourses = null
let manualCourse = null

const scheduleItems = [
  {id: 1, name: "高级英语A（二）", time_text: "周一 1-2节 · 08:00 · 第1-14、16周", room: "西多媒体二 · 大学西道校区南院", teacher: "隋雨"},
  {id: 2, name: "外国文化概论A", time_text: "周一 3-4节 · 10:10 · 第1-14、16周", room: "西多媒体一 · 大学西道校区南院", teacher: "沈玉婵"},
  {id: 3, name: "日语A", time_text: "周一 7-8节 · 16:20 · 第1-14、16周", room: "南院中央406 · 大学西道校区南院", teacher: "刘犀灵"},
  {id: 4, name: "英汉/汉英口译A", time_text: "周二 1-2节 · 08:00 · 第1-14、16周", room: "东院A604 · 大学西道校区东院", teacher: "林琳"}
]

const browser = await chromium.launch({executablePath: resolveBrowserExecutable(), headless: true})
const page = await browser.newPage({viewport: {width: 390, height: 844}, deviceScaleFactor: 1, isMobile: true, hasTouch: true})
page.on("console", message => { if (message.type() === "error") errors.push(message.text()) })
page.on("pageerror", error => errors.push(error.message))

await page.route("**/v1/schedule", async route => {
  if (route.request().method() === "POST") {
    manualCourse = route.request().postDataJSON()
    return route.fulfill({status: 201, contentType: "application/json", body: JSON.stringify({item: {id: 99, ...manualCourse, time_text: manualCourse.time}})})
  }
  return route.fulfill({status: 200, contentType: "application/json", body: JSON.stringify({items: scheduleItems})})
})
await page.route("**/v1/uploads", route => route.fulfill({status: 201, contentType: "application/json", body: JSON.stringify({url: "/uploads/schedule-demo.jpg"})}))
await page.route("**/v1/schedule/import-image", route => route.fulfill({
  status: 200,
  contentType: "application/json",
  body: JSON.stringify({provider: "星尘智能识别", items: [
    {name: "高级英语A（二）", time: "周一 1-2节 · 08:00 · 第1-14、16周", room: "西多媒体二", teacher: "隋雨"},
    {name: "外国文化概论A", time: "周一 3-4节 · 10:10 · 第1-14、16周", room: "西多媒体一", teacher: "沈玉婵"}
  ]})
}))
await page.route("**/v1/schedule/import", route => {
  importedCourses = route.request().postDataJSON()
  return route.fulfill({status: 201, contentType: "application/json", body: JSON.stringify({items: [], inserted: 2, skipped: 0})})
})

await page.goto(`${base}#/campus-circle/pages/schedule/index`, {waitUntil: "networkidle"})
await page.waitForSelector(".schedule-v4")
await page.screenshot({path: path.join(root, "tmp/schedule-v4-390x844.png")})

const dimensions = await page.evaluate(() => ({
  scrollWidth: document.documentElement.scrollWidth,
  clientWidth: document.documentElement.clientWidth,
  scrollHeight: document.documentElement.scrollHeight
}))

const chooserPromise = page.waitForEvent("filechooser")
await page.locator(".schedule-import-row").click()
const chooser = await chooserPromise
await chooser.setFiles("/var/folders/l6/mhg6802n72s46x9pjlq6skw80000gn/T/codex-clipboard-0cc9156a-65d5-478d-a105-e48456e734a0.jpg")
await page.waitForSelector(".schedule-draft-section")
await page.screenshot({path: path.join(root, "tmp/schedule-v4-import-review.png")})
await page.locator(".schedule-draft-actions taro-button-core").last().click()
await page.waitForTimeout(300)

await page.locator(".schedule-quiet-actions").getByText("手动添加", {exact: true}).click()
const fields = page.locator(".schedule-manual-form input")
await fields.nth(0).fill("大学体育")
await fields.nth(1).fill("周二 3-4节 · 10:10 · 第1-16周")
await fields.nth(2).fill("东操场")
await fields.nth(3).fill("王老师")
await page.screenshot({path: path.join(root, "tmp/schedule-v4-manual.png")})
await page.locator(".schedule-manual-form taro-button-core").click()
await page.waitForTimeout(300)

const result = {
  dimensions,
  initialAgendaRows: await page.locator(".schedule-agenda-row").count(),
  importedCourses,
  manualCourse,
  consoleErrors: errors,
  ok: dimensions.scrollWidth <= dimensions.clientWidth
    && importedCourses?.items?.length === 2
    && manualCourse?.name === "大学体育"
    && errors.length === 0
}

const comparison = await browser.newPage({viewport: {width: 780, height: 844}, deviceScaleFactor: 1})
const referenceData = (await readFile(path.join(root, "tmp/schedule-v4-reference-390x844.png"))).toString("base64")
const implementationData = (await readFile(path.join(root, "tmp/schedule-v4-390x844.png"))).toString("base64")
await comparison.setContent(`<style>*{box-sizing:border-box}html,body{margin:0;width:780px;height:844px;overflow:hidden;background:#eef3fa}main{display:flex;width:780px;height:844px}img{display:block;width:390px;height:844px;object-fit:cover}</style><main><img src="data:image/png;base64,${referenceData}"><img src="data:image/png;base64,${implementationData}"></main>`)
await comparison.screenshot({path: path.join(root, "tmp/schedule-v4-comparison.png")})

await browser.close()
console.log(JSON.stringify(result, null, 2))
if (!result.ok) process.exitCode = 1
