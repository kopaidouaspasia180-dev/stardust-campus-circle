import {readFileSync} from "node:fs"
import {chromium} from "playwright-core"
import {resolveBrowserExecutable} from "./qa-browser.mjs"

const base = process.env.QA_BASE ?? "http://127.0.0.1:4176/campus-circle/"
const manifest = JSON.parse(readFileSync("dist/app.json", "utf8"))
const browser = await chromium.launch({executablePath: resolveBrowserExecutable(), headless: true})
const page = await browser.newPage({viewport: {width: 390, height: 844}, isMobile: true, hasTouch: true})
const results = {}

await page.goto(base, {waitUntil: "networkidle"})
for (const route of manifest.pages) {
  const errors = []
  const pageErrors = []
  page.removeAllListeners("console")
  page.removeAllListeners("pageerror")
  page.on("console", message => {
    const text = message.text()
    const expected = /blocked by CORS policy|Failed to load resource: (?:net::ERR_FAILED|the server responded with a status of 401)/.test(text)
    if (message.type() === "error" && !expected) errors.push(text)
  })
  page.on("pageerror", error => pageErrors.push(error.message))
  await page.evaluate(hash => { window.location.hash = hash }, `#/campus-circle/${route}`)
  await page.waitForTimeout(220)
  results[route] = await page.evaluate(({errors, pageErrors}) => {
    const activePage = [...document.querySelectorAll(".taro_page")].find(node => getComputedStyle(node).display !== "none")
    const rect = activePage?.getBoundingClientRect()
    return {
      rendered: Boolean(activePage && rect && rect.height > 40 && (activePage.textContent?.trim() || activePage.querySelector("img"))),
      overflow: document.documentElement.scrollWidth > window.innerWidth,
      errors,
      pageErrors
    }
  }, {errors, pageErrors})
}

await browser.close()
console.log(JSON.stringify(results, null, 2))
if (Object.values(results).some(item => !item.rendered || item.overflow || item.errors.length || item.pageErrors.length)) process.exitCode = 1
