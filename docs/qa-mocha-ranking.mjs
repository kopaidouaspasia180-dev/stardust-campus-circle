import {chromium} from "playwright-core"
import path from "node:path"
import process from "node:process"
import {resolveBrowserExecutable} from "./qa-browser.mjs"

const base = process.env.QA_BASE ?? "http://127.0.0.1:4176/campus-circle/"
const browser = await chromium.launch({executablePath: resolveBrowserExecutable(), headless: true})
const page = await browser.newPage({
  viewport: {width: 390, height: 844},
  deviceScaleFactor: 1,
  isMobile: true,
  hasTouch: true
})

const result = {}
try {
  await page.route("**/rankings/places**", async route => {
    const category = new URL(route.request().url()).searchParams.get("category")
    const items = category === "life" ? [{
      id: "qa-yongxin",
      category: "life",
      name: "永鑫便利店（大学西道店）",
      note: "校园周边日常补给便利店",
      location: "大学西道42号",
      imageUrl: "",
      coverKey: "life-yongxin",
      likes: 0,
      weeklyLikes: 0,
      favorites: 0,
      comments: 0,
      liked: false,
      favorited: false,
      mine: false,
      campusSlug: "daxuexidao",
      campusName: "南院",
      status: "active",
      moderationNote: "",
      studentSubmitted: false,
      referenceSource: "吉屋周边配套",
      referenceRating: null,
      referenceCount: 0,
      referenceUrl: "https://tangshan.jiwu.com/loupan/1303216.html",
      createdAt: "2026-08-31T00:00:00.000Z"
    }, {
      id: "qa-yida",
      category: "life",
      name: "依达便利店（大学道店）",
      note: "靠近大学西道校区的便利店",
      location: "大学西道9号",
      imageUrl: "",
      coverKey: "life-yida",
      likes: 0,
      weeklyLikes: 0,
      favorites: 0,
      comments: 0,
      liked: false,
      favorited: false,
      mine: false,
      campusSlug: "daxuexidao",
      campusName: "南院",
      status: "active",
      moderationNote: "",
      studentSubmitted: false,
      referenceSource: "吉屋周边配套",
      referenceRating: null,
      referenceCount: 0,
      referenceUrl: "https://tangshan.jiwu.com/loupan/1303216.html",
      createdAt: "2026-08-31T00:00:00.000Z"
    }, {
      id: "qa-mocha-pro",
      category: "life",
      name: "摩卡 Pro 美发（唐山吾悦广场店）",
      note: "剪发、烫染与造型作品展示，具体方案及价格以到店沟通为准",
      location: "唐山吾悦广场 · 具体楼层以商场导视为准",
      imageUrl: "",
      coverKey: "life-mocha-pro",
      likes: 0,
      weeklyLikes: 0,
      favorites: 0,
      comments: 0,
      liked: false,
      favorited: false,
      mine: false,
      campusSlug: "daxuexidao",
      campusName: "南院",
      status: "active",
      moderationNote: "",
      studentSubmitted: false,
      referenceSource: "门店提供",
      referenceRating: null,
      referenceCount: 0,
      referenceUrl: "",
      createdAt: "2026-08-23T00:00:00.000Z"
    }] : []
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({items, total: items.length})
    })
  })
  await page.goto(`${base}#/campus-circle/pages/rankings/index`, {waitUntil: "networkidle"})
  await page.waitForSelector(".rankings-page")
  await page.getByText("摩卡 Pro 美发（唐山吾悦广场店）", {exact: true}).first().waitFor()

  result.bodyScrollWidth = await page.evaluate(() => document.documentElement.scrollWidth)
  result.listingVisible = await page.getByText("摩卡 Pro 美发（唐山吾悦广场店）", {exact: true}).isVisible()
  result.realPlaceCount = await page.locator(".ranking-podium-card").count()
  result.referenceLabelVisible = await page.getByText("公开地点已核验", {exact: true}).first().isVisible()
  await page.screenshot({path: path.join(process.cwd(), "qa-rankings-list.png")})
  await page.locator(".ranking-podium-card").filter({hasText: "摩卡 Pro"}).click()
  await page.waitForSelector(".ranking-detail")
  result.detailVisible = await page.locator(".ranking-detail").isVisible()
  result.galleryCount = await page.locator(".ranking-gallery img, .ranking-gallery image").count()
  result.detailBox = await page.locator(".ranking-detail").boundingBox()
  await page.screenshot({path: path.join(process.cwd(), "qa-mocha-ranking-detail.png")})
  result.ok = result.listingVisible
    && result.detailVisible
    && result.galleryCount === 3
    && result.realPlaceCount === 3
    && result.referenceLabelVisible
    && result.bodyScrollWidth <= 390
    && result.detailBox
    && result.detailBox.width <= 390
} finally {
  await browser.close()
}

console.log(JSON.stringify(result, null, 2))
if (!result.ok) process.exitCode = 1
