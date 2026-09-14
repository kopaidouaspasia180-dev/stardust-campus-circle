import {existsSync, readdirSync, readFileSync, statSync} from "node:fs"
import {join, relative} from "node:path"

const root = process.argv[2] || "dist"
const MAX_MAIN_PACKAGE_BYTES = 2 * 1024 * 1024
const MAX_MEDIA_FILE_BYTES = 200 * 1024
const errors = []
const warnings = []
const mediaExtensions = /\.(?:png|jpe?g|webp|gif|svg|mp3|wav|m4a|aac)$/i

function listFiles(directory) {
  return readdirSync(directory, {withFileTypes: true}).flatMap(entry => {
    const fullPath = join(directory, entry.name)
    if (entry.isDirectory()) return listFiles(fullPath)
    return entry.isFile() ? [fullPath] : []
  })
}

function requireFile(pathname, label) {
  if (!existsSync(pathname)) errors.push(`${label} 不存在：${pathname}`)
}

if (!existsSync(root)) {
  console.error(`微信小程序构建目录不存在：${root}`)
  process.exit(1)
}

const appPath = join(root, "app.json")
requireFile(appPath, "小程序清单")

let appConfig = {}
try {
  appConfig = JSON.parse(readFileSync(appPath, "utf8"))
} catch {
  errors.push("dist/app.json 不是有效 JSON")
}

const pages = Array.isArray(appConfig.pages) ? appConfig.pages : []
if (!pages.length) errors.push("dist/app.json 未注册页面")
for (const page of pages) {
  requireFile(join(root, `${page}.js`), `页面脚本 ${page}`)
  requireFile(join(root, `${page}.wxml`), `页面模板 ${page}`)
  requireFile(join(root, `${page}.json`), `页面配置 ${page}`)
}

const tabs = Array.isArray(appConfig.tabBar?.list) ? appConfig.tabBar.list : []
const expectedTabs = ["pages/home/index", "pages/community/index", "pages/services/index", "pages/rankings/index", "pages/profile/index"]
if (tabs.length !== expectedTabs.length) errors.push(`底部导航应有 ${expectedTabs.length} 项，当前为 ${tabs.length} 项`)
for (const pagePath of expectedTabs) {
  if (!tabs.some(tab => tab.pagePath === pagePath)) errors.push(`底部导航缺少：${pagePath}`)
}
for (const tab of tabs) {
  requireFile(join(root, tab.iconPath || ""), `底部导航图标 ${tab.text || tab.pagePath}`)
  requireFile(join(root, tab.selectedIconPath || ""), `底部导航选中图标 ${tab.text || tab.pagePath}`)
}

const excludedPages = [
  "pages/takeout-merchant/index", "pages/takeout-rider/index", "pages/takeout-admin/index", "pages/market/index",
  "pages/errand/index", "pages/jobs/index", "pages/job-publish/index", "pages/events/index",
  "pages/campus-store/index", "pages/lost/index", "pages/pdd-express/index"
]
for (const pagePath of excludedPages) {
  if (pages.includes(pagePath)) errors.push(`快速上线版不应注册页面：${pagePath}`)
  if (existsSync(join(root, `${pagePath}.js`))) errors.push(`快速上线包中残留页面：${pagePath}`)
}

const files = listFiles(root)
const totalBytes = files.reduce((total, pathname) => total + statSync(pathname).size, 0)
const mediaFiles = files
  .filter(pathname => mediaExtensions.test(pathname))
  .map(pathname => ({pathname, bytes: statSync(pathname).size}))
  .sort((left, right) => right.bytes - left.bytes)
const oversizedMedia = mediaFiles.filter(item => item.bytes > MAX_MEDIA_FILE_BYTES)
const totalMediaBytes = mediaFiles.reduce((total, item) => total + item.bytes, 0)
for (const item of oversizedMedia) {
  errors.push(
    `图片/音频资源 ${(item.bytes / 1024).toFixed(1)} KiB，超过微信 200 KiB 建议上限：${relative(process.cwd(), item.pathname)}`
  )
}
if (totalMediaBytes > MAX_MEDIA_FILE_BYTES) {
  warnings.push(
    `微信代码质量建议将包内图片/音频总量控制在 200 KiB 内；当前为 ${(totalMediaBytes / 1024).toFixed(1)} KiB，后续应迁移到 HTTPS 静态资源服务`
  )
}
if (totalBytes >= MAX_MAIN_PACKAGE_BYTES) {
  errors.push(`主包原始文件总量 ${(totalBytes / 1024 / 1024).toFixed(2)} MiB，达到或超过微信 2 MiB 限制`)
}

const summary = {
  root: relative(process.cwd(), root) || root,
  pageCount: pages.length,
  tabCount: tabs.length,
  fileCount: files.length,
  totalBytes,
  totalMiB: Number((totalBytes / 1024 / 1024).toFixed(3)),
  maxMainPackageMiB: 2,
  mediaFileCount: mediaFiles.length,
  largestMediaKiB: mediaFiles.length
    ? Number((mediaFiles[0].bytes / 1024).toFixed(1))
    : 0,
  maxMediaFileKiB: 200,
  totalMediaKiB: Number((totalMediaBytes / 1024).toFixed(1)),
  recommendedMediaTotalKiB: 200,
  warnings,
  errors
}

console.log(JSON.stringify(summary, null, 2))
if (errors.length) process.exitCode = 1
