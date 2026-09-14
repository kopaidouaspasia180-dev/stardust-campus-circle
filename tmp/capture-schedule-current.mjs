import {chromium} from "playwright-core"
import path from "node:path"
import {resolveBrowserExecutable} from "../docs/qa-browser.mjs"

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
await page.route("**/v1/schedule", route => route.fulfill({
  status: 200,
  contentType: "application/json",
  body: JSON.stringify({items: []})
}))
await page.goto("http://127.0.0.1:4176/campus-circle/#/campus-circle/pages/schedule/index", {waitUntil: "networkidle"})
await page.waitForSelector(".schedule-page")
await page.screenshot({path: path.join(process.cwd(), "tmp/schedule-current-390x844.png"), fullPage: false})
console.log(JSON.stringify(await page.evaluate(() => ({
  scrollWidth: document.documentElement.scrollWidth,
  clientWidth: document.documentElement.clientWidth,
  scrollHeight: document.documentElement.scrollHeight
})), null, 2))
await browser.close()
