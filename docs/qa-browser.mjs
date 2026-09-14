import {existsSync} from "node:fs"
import process from "node:process"

const browserCandidates = {
  darwin: [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    "/Applications/Chromium.app/Contents/MacOS/Chromium"
  ],
  win32: [
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"
  ],
  linux: [
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/microsoft-edge",
    "/usr/bin/microsoft-edge-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser"
  ]
}

export function resolveBrowserExecutable() {
  const configuredPath = process.env.QA_BROWSER?.trim()
  if (configuredPath) {
    if (existsSync(configuredPath)) return configuredPath
    throw new Error(`QA_BROWSER 指向的浏览器不存在：${configuredPath}`)
  }

  const executablePath = browserCandidates[process.platform]?.find(existsSync)
  if (executablePath) return executablePath

  throw new Error(
    `未找到可用的 Chromium 浏览器（当前平台：${process.platform}）。`
    + "请安装 Chrome、Edge 或 Chromium，或通过 QA_BROWSER 指定浏览器可执行文件。"
  )
}
