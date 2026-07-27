import {chromium} from "playwright-core"
import path from "node:path"

const root = process.cwd()
const base = process.env.QA_BASE ?? "http://127.0.0.1:4174/campus-circle/"
const browser = await chromium.launch({
  executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
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
  await page.waitForSelector(".today-panel")
  result.title = await page.title()
  result.homePosts = await page.locator(".home-forum-feed .community-post-card").count()
  result.tabLabels = await page.locator(".weui-tabbar .weui-tabbar__label").allTextContents()
  result.tabBox = await page.locator(".weui-tabbar").boundingBox()
  result.viewportHeight = await page.evaluate(() => window.innerHeight)
  result.bodyScrollWidth = await page.evaluate(() => document.documentElement.scrollWidth)
  await page.screenshot({path: path.join(root, "qa-final-home-v2.png")})

  await page.locator(".home-forum-feed .community-post-card").first().scrollIntoViewIfNeeded()
  await page.screenshot({path: path.join(root, "qa-final-home-feed-v2.png")})

  await page.locator(".home-forum-feed .community-post-card").first().click()
  await page.waitForSelector(".post-detail-page")
  result.detailVisible = await page.locator(".post-detail-page").isVisible()
  await page.screenshot({path: path.join(root, "qa-final-detail-v2.png")})

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

  result.ok = result.homePosts >= 9
    && result.communityPosts >= 9
    && result.detailVisible
    && result.publishPageVisible
    && result.publishedPostVisible
    && result.bodyScrollWidth <= 390
    && result.tabBox
    && Math.round(result.tabBox.y + result.tabBox.height) === result.viewportHeight
} finally {
  await browser.close()
}

console.log(JSON.stringify(result, null, 2))
if (!result.ok) process.exitCode = 1
