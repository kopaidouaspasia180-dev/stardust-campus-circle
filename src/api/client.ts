import Taro from "@tarojs/taro"
import {currentTenant} from "../store/tenant"

const API_ROOT = "https://stardust.sale/campus-circle/api/v1"
const DEVICE_KEY = "stardust_device_session_v1"

function deviceId() {
  let value = Taro.getStorageSync<string>(DEVICE_KEY)
  if (!value) {
    value = `device-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`
    Taro.setStorageSync(DEVICE_KEY, value)
  }
  return value
}

type RequestOptions = {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE"
  data?: unknown
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const result = await Taro.request<T & {error?: string}>({
    url: `${API_ROOT}${path}`,
    method: options.method || "GET",
    data: options.data,
    timeout: 12000,
    header: {
      "content-type": "application/json",
      "x-tenant-id": currentTenant().id,
      "x-device-id": deviceId()
    }
  })
  if (result.statusCode < 200 || result.statusCode >= 300) {
    throw new Error(result.data?.error || `服务请求失败（${result.statusCode}）`)
  }
  return result.data
}

export async function uploadMedia(filePath: string): Promise<string> {
  const result = await Taro.uploadFile({
    url: `${API_ROOT}/uploads`,
    filePath,
    name: "file",
    timeout: 20000,
    header: {
      "x-tenant-id": currentTenant().id,
      "x-device-id": deviceId()
    }
  })
  const data = JSON.parse(result.data || "{}") as {url?: string; error?: string}
  if (result.statusCode < 200 || result.statusCode >= 300 || !data.url) {
    throw new Error(data.error || "图片上传失败")
  }
  return data.url.startsWith("http") ? data.url : `https://stardust.sale${data.url}`
}

export function showApiError(error: unknown) {
  Taro.showToast({title: error instanceof Error ? error.message : "服务暂时不可用", icon: "none", duration: 2600})
}
