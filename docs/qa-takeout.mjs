import {chromium} from "playwright-core"
import path from "node:path"
import {resolveBrowserExecutable} from "./qa-browser.mjs"

const base = process.env.QA_BASE ?? "http://127.0.0.1:4176/campus-circle/"
const browser = await chromium.launch({executablePath: resolveBrowserExecutable(), headless: true})
const page = await browser.newPage({viewport: {width: 390, height: 844}, isMobile: true, hasTouch: true})
const consoleErrors = []
page.on("console", message => {
  if (message.type() === "error" && !/favicon|Failed to load resource/.test(message.text())) consoleErrors.push(message.text())
})

await page.route("**/campus-circle/api/v1/**", async route => {
  const url = new URL(route.request().url())
  if (url.pathname.endsWith("/takeout/menu")) {
    return route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({source: "live_catalog", items: [
        {id: 101, name: "招牌鸡腿谷物饭", description: "去骨鸡腿、时蔬与杂粮饭", price: "15.90", original_price: "18.90", category: "午餐套餐", available: 18, merchant_id: 1, merchant_name: "西道食堂一号窗口", delivery_minutes: 28, data_mode: "live"},
        {id: 102, name: "家常双拼饭", description: "两荤一素，米饭现蒸", price: "13.90", category: "家常菜", available: 12, merchant_id: 1, merchant_name: "西道食堂一号窗口", delivery_minutes: 28, data_mode: "live"},
        {id: 201, name: "黑椒牛肉轻食", description: "牛肉、蔬菜与紫米", price: "19.90", category: "减脂餐", available: 9, merchant_id: 2, merchant_name: "南院轻食铺", delivery_minutes: 32, data_mode: "live"}
      ]})
    })
  }
  if (url.pathname.endsWith("/takeout/context")) {
    return route.fulfill({contentType: "application/json", body: JSON.stringify({lunch: {cutoff: "23:59", pickupWindow: "11:00–13:30", deliveryFeeCents: 300}, merchantCount: 2, paymentEnabled: true})})
  }
  return route.fulfill({contentType: "application/json", body: "{}"})
})

const result = {}
try {
  await page.goto(`${base}#/campus-circle/pages/takeout/index`, {waitUntil: "networkidle"})
  await page.waitForSelector(".takeout-v4")
  await page.waitForSelector(".takeout-product-row")
  result.visible = await page.locator(".takeout-v4").isVisible()
  result.products = await page.locator(".takeout-product-row").count()
  result.liveNames = await page.locator(".takeout-product-copy > :first-child").allTextContents()
  result.loadedImages = await page.locator(".takeout-product-row img").evaluateAll(images => images.filter(image => image.naturalWidth > 0).length)
  result.horizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)

  await page.locator(".takeout-product-row").first().locator(".quantity-control > :last-child").click()
  await page.waitForSelector(".takeout-cart.show")
  result.firstMerchant = await page.locator(".takeout-cart > :first-child > :last-child").textContent()

  await page.screenshot({path: path.join(process.cwd(), "design-qa-takeout-live.png"), fullPage: true})
  result.consoleErrors = consoleErrors
  result.ok = result.visible
    && result.products === 3
    && result.loadedImages === 3
    && !result.horizontalOverflow
    && result.firstMerchant === "西道食堂一号窗口"
    && result.liveNames.includes("黑椒牛肉轻食")
    && !consoleErrors.length
} finally {
  await browser.close()
}

console.log(JSON.stringify(result, null, 2))
if (!result.ok) process.exitCode = 1
