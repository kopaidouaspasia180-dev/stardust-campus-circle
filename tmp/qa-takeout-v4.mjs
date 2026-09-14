import {chromium} from "playwright-core"
import path from "node:path"
import {readFile} from "node:fs/promises"
import {resolveBrowserExecutable} from "../docs/qa-browser.mjs"

const root = process.cwd()
const base = process.env.QA_BASE || "http://127.0.0.1:4176/campus-circle/"
const errors = []
let submittedOrder = null

const browser = await chromium.launch({
  executablePath: resolveBrowserExecutable(),
  headless: true
})
const page = await browser.newPage({
  viewport: {width: 390, height: 844},
  deviceScaleFactor: 1,
  isMobile: true,
  hasTouch: true
})

page.on("console", message => {
  if (message.type() === "error") errors.push(message.text())
})
page.on("pageerror", error => errors.push(error.message))

await page.route("**/v1/takeout/context**", route => route.fulfill({
  status: 200,
  contentType: "application/json",
  body: JSON.stringify({
    school: {id: "tangshan", name: "唐山学院"},
    campus: {id: "daxuexidao", name: "大学西道校区"},
    lunch: {cutoff: "10:30", pickupWindow: "11:00–13:30", deliveryFeeCents: 300},
    merchantCount: 1
  })
}))

await page.route("**/v1/takeout/menu**", route => route.fulfill({
  status: 200,
  contentType: "application/json",
  body: JSON.stringify({
    serviceDate: "2026-08-24",
    items: [
      {id: 101, name: "今日精选套餐", description: "照烧鸡腿 · 时蔬 · 米饭 · 例汤", category: "午餐套餐", price: 18, original_price: 22, available: 32, merchant_name: "校园午餐厨房", delivery_minutes: 30},
      {id: 102, name: "黑椒牛肉饭", description: "现炒现送 · 人气热卖", category: "家常菜", price: 16.8, available: 25, merchant_name: "校园午餐厨房", delivery_minutes: 28},
      {id: 103, name: "宫保鸡丁饭", description: "香辣下饭 · 精选好料", category: "家常菜", price: 15.8, available: 18, merchant_name: "校园午餐厨房", delivery_minutes: 30},
      {id: 104, name: "肉酱拌面", description: "经典口味 · 分量十足", category: "面食", price: 13.8, available: 20, merchant_name: "校园午餐厨房", delivery_minutes: 25}
    ]
  })
}))

await page.route("**/v1/orders", async route => {
  if (route.request().method() !== "POST") return route.continue()
  submittedOrder = route.request().postDataJSON()
  return route.fulfill({
    status: 201,
    contentType: "application/json",
    body: JSON.stringify({item: {id: "demo-order", order_no: "TS202608240001", total_amount_cents: 2100}, payment: {enabled: false}})
  })
})

await page.goto(`${base}#/campus-circle/pages/takeout/index`, {waitUntil: "networkidle"})
await page.waitForSelector(".takeout-v4")
await page.screenshot({path: path.join(root, "tmp/takeout-v4-390x844.png")})

const dimensions = await page.evaluate(() => ({
  scrollWidth: document.documentElement.scrollWidth,
  clientWidth: document.documentElement.clientWidth,
  viewportHeight: window.innerHeight
}))

await page.locator(".hero-price").click()
await page.locator(".takeout-cart taro-button-core").click()
await page.locator(".fulfillment-switch").getByText("送到校内", {exact: true}).click()
const fields = page.locator(".checkout-fields input")
await fields.nth(0).fill("小唐")
await fields.nth(1).fill("13800138000")
await fields.nth(2).fill("南院宿舍 3 号楼下")
await page.screenshot({path: path.join(root, "tmp/takeout-v4-checkout-390x844.png")})
await page.locator(".checkout-panel > taro-button-core").click()
await page.waitForTimeout(500)

const result = {
  dimensions,
  productRows: await page.locator(".takeout-product-row").count(),
  submittedOrder,
  consoleErrors: errors,
  ok: dimensions.scrollWidth <= dimensions.clientWidth
    && Boolean(submittedOrder)
    && submittedOrder.fulfillmentType === "delivery"
    && submittedOrder.deliveryAddress === "南院宿舍 3 号楼下"
    && errors.length === 0
}

const comparison = await browser.newPage({viewport: {width: 780, height: 844}, deviceScaleFactor: 1})
const referenceData = (await readFile(path.join(root, "tmp/takeout-v4-reference-390x844.png"))).toString("base64")
const implementationData = (await readFile(path.join(root, "tmp/takeout-v4-390x844.png"))).toString("base64")
await comparison.setContent(`<style>*{box-sizing:border-box}html,body{margin:0;width:780px;height:844px;overflow:hidden;background:#eef3fa}main{display:flex;width:780px;height:844px}img{display:block;width:390px;height:844px;object-fit:cover}</style><main><img src="data:image/png;base64,${referenceData}"><img src="data:image/png;base64,${implementationData}"></main>`)
await comparison.screenshot({path: path.join(root, "tmp/takeout-v4-comparison.png")})

await browser.close()
console.log(JSON.stringify(result, null, 2))
if (!result.ok) process.exitCode = 1
