export type ExpressNoticeDraft = {
  carrier: string
  trackingNo: string
  pickupCode: string
  station: string
  rawPreview?: string
}

const carriers = ["顺丰", "中通", "圆通", "韵达", "申通", "极兔", "京东", "邮政", "EMS", "菜鸟", "丹鸟", "德邦", "多多"]

function clean(value: string | undefined, max: number) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max)
}

const stationSuffix = "(?:菜鸟驿站|驿站|快递柜|服务站|代收点|快递点|丰巢(?:柜)?|取件点|自提点)"
const arrivalVerb = "(?:已到|送至|存放于|请到|请前往|到达|已放入|已放至|已存入|放在|可到|前往)"

function extractPickupCode(value: string) {
  const patterns = [
    /(?:取件码|取货码|提货码|取件号码|取件编号|取件凭证|提货凭证|身份码|验证码|货架号|架号)\s*(?:为|是)?\s*[：:]?\s*[【\[]?\s*([A-Z0-9][A-Z0-9\s\-—–_]{1,30})/i,
    /(?:凭|请凭)\s*[【\[]?\s*([A-Z0-9][A-Z0-9\s\-—–_]{1,30})\s*[】\]]?\s*(?:到|至|前往|取|领取|开柜)/i,
    /(?:码|编号)\s*[：:]\s*[【\[]?\s*([A-Z0-9][A-Z0-9\s\-—–_]{1,30})/i
  ]
  for (const pattern of patterns) {
    const match = value.match(pattern)
    if (match?.[1]) {
      const candidate = clean(match[1], 40)
        .replace(/[】\]，,。；;：:]+.*$/, "")
        .replace(/\s*(?:请|到|至|前往|领取|取件|开柜|有效期).*$/i, "")
        .replace(/[—–_\s]+/g, "-")
        .replace(/^-+|-+$/g, "")
      if (/\d/.test(candidate) && candidate.length >= 2) return candidate
    }
  }
  return ""
}

function extractStation(value: string) {
  const source = String(value || "").replace(/\s+/g, " ").trim()
  if (!source) return ""
  const afterArrival = source.match(new RegExp(`${arrivalVerb}\\s*([^，,。；;]{2,40}?${stationSuffix})`, "i"))?.[1]
  if (afterArrival) return clean(afterArrival, 80)
  const fallback = source.match(new RegExp(`([^，,。；;：:]{2,40}?${stationSuffix})`, "i"))?.[1] || ""
  return clean(fallback.replace(new RegExp(`^.*${arrivalVerb}\\s*`, "i"), ""), 80)
}

/**
 * Parses ordinary arrival SMS text on-device. This keeps the primary copy and
 * paste flow useful when remote recognition is unavailable and never invents
 * a pickup code that was not present in the copied notice.
 */
export function parseExpressNoticeText(value: string): ExpressNoticeDraft | null {
  const original = clean(value, 4000)
  if (!original) return null
  const flat = original.replace(/[，,]/g, " ").replace(/\s+/g, " ")
  const pickupCode = extractPickupCode(flat)
  if (!pickupCode) return null
  const trackingNo = clean(flat.match(/(?:运单号|快递单号|物流单号|单号)\s*[：:]?\s*([A-Z0-9-]{6,40})/i)?.[1], 80)
  const station = extractStation(original) || "校内快递点"
  const carrier = clean(carriers.find(item => flat.toUpperCase().includes(item.toUpperCase())), 30) || "快递包裹"
  return {carrier, trackingNo, pickupCode, station, rawPreview: clean(original, 300)}
}
