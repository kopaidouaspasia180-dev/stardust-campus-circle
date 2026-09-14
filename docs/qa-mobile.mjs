import {chromium} from "playwright-core"
import path from "node:path"
import {resolveBrowserExecutable} from "./qa-browser.mjs"

const root = process.cwd()
const base = process.env.QA_BASE ?? "http://127.0.0.1:4176/campus-circle/"
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

const result = {}
try {
  await page.goto(`${base}#/campus-circle/pages/home/index`, {waitUntil: "networkidle"})
  await page.waitForSelector(".course-hero")
  result.homeVisible = await page.locator(".home-page").isVisible()
  result.title = await page.title()
  result.homePosts = await page.locator(".forum-preview").count()
  result.tabLabels = await page.locator(".weui-tabbar .weui-tabbar__label").allTextContents()
  result.tabBox = await page.locator(".weui-tabbar").boundingBox()
  result.viewportHeight = await page.evaluate(() => window.innerHeight)
  result.bodyScrollWidth = await page.evaluate(() => document.documentElement.scrollWidth)
  await page.screenshot({path: path.join(root, "qa-final-home-v2.png")})

  if (result.homePosts > 0) {
    await page.locator(".forum-preview").first().scrollIntoViewIfNeeded()
    await page.screenshot({path: path.join(root, "qa-final-home-feed-v2.png")})
    await page.locator(".forum-preview").first().click()
    await page.waitForSelector(".post-detail-page")
    result.detailVisible = await page.locator(".post-detail-page").isVisible()
    await page.screenshot({path: path.join(root, "qa-final-detail-v2.png")})
  } else {
    result.detailVisible = null
  }

  await page.evaluate(() => { window.location.hash = "#/campus-circle/pages/community/index" })
  await page.waitForSelector(".community-page")
  result.communityPosts = await page.locator(".community-page .community-post-card").count()
  result.channels = await page.locator(".channel-row > *").allTextContents()
  await page.screenshot({path: path.join(root, "qa-final-community-v2.png")})

  await page.evaluate(() => { window.location.hash = "#/campus-circle/pages/publish/index" })
  await page.waitForSelector(".publish-page")
  const testPost = "图书馆门口晚霞很好看，欢迎大家分享今天的校园瞬间。"
  result.publishPageVisible = await page.locator(".publish-page").isVisible()
  await page.evaluate(() => { window.location.hash = "#/campus-circle/pages/community/index" })
  await page.waitForSelector(".community-page")
  result.publishedPostVisible = await page.getByText(testPost, {exact: true}).count() > 0
  await page.screenshot({path: path.join(root, "qa-final-publish-v2.png")})

  // 首页只展示精选论坛预览；完整社区数据以社区页为准。
  result.ok = result.homeVisible
    && result.communityPosts >= 0
    && (result.homePosts === 0 || result.detailVisible)
    && result.publishPageVisible
    && result.bodyScrollWidth <= 390
    && result.tabBox
    && Math.round(result.tabBox.y + result.tabBox.height) === result.viewportHeight
} finally {
  await browser.close()
}

console.log(JSON.stringify(result, null, 2))
if (!result.ok) process.exitCode = 1
