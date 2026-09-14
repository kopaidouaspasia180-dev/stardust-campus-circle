import crypto from "node:crypto"

const carriers = ["顺丰", "中通", "圆通", "韵达", "申通", "极兔", "京东", "邮政", "EMS", "菜鸟", "丹鸟", "德邦", "多多"]

function clean(value, max) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max)
}

const stationSuffix = "(?:菜鸟驿站|驿站|快递柜|服务站|代收点|快递点|丰巢(?:柜)?|取件点|自提点)"
const arrivalVerb = "(?:已到|送至|存放于|请到|请前往|到达|已放入|已放至|已存入|放在|可到|前往)"

function extractPickupCode(value) {
  const patterns = [
    /(?:取件码|取货码|提货码|取件号码|取件编号|取件凭证|提货凭证|身份码|验证码|货架号|架号)\s*(?:为|是)?\s*[：:]?\s*[【\[]?\s*([A-Z0-9][A-Z0-9\s\-—–_]{1,30})/i,
    /(?:凭|请凭)\s*[【\[]?\s*([A-Z0-9][A-Z0-9\s\-—–_]{1,30})\s*[】\]]?\s*(?:到|至|前往|取|领取|开柜)/i,
    /(?:码|编号)\s*[：:]\s*[【\[]?\s*([A-Z0-9][A-Z0-9\s\-—–_]{1,30})/i
  ]
  for (const pattern of patterns) {
    const match = String(value || "").match(pattern)
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

function extractStation(value) {
  const source = String(value || "").replace(/\s+/g, " ").trim()
  if (!source) return ""
  const afterArrival = source.match(new RegExp(`${arrivalVerb}\\s*([^，,。；;]{2,40}?${stationSuffix})`, "i"))?.[1]
  if (afterArrival) return clean(afterArrival, 80)
  const fallback = source.match(new RegExp(`([^，,。；;：:]{2,40}?${stationSuffix})`, "i"))?.[1] || ""
  return clean(fallback.replace(new RegExp(`^.*${arrivalVerb}\\s*`, "i"), ""), 80)
}

function parseJson(value) {
  const raw = String(value || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "")
  const start = raw.indexOf("{")
  const end = raw.lastIndexOf("}")
  if (start < 0 || end <= start) return null
  try { return JSON.parse(raw.slice(start, end + 1)) } catch { return null }
}

export function parseExpressNotice(value) {
  const original = String(value || "").trim()
  if (!original) return null
  const parsed = parseJson(original)
  const source = parsed?.rawText || parsed?.text || original
  const flat = String(source).replace(/[，,]/g, " ").replace(/\s+/g, " ")
  const carrier = clean(parsed?.carrier || carriers.find(item => flat.toUpperCase().includes(item.toUpperCase())) || "快递包裹", 30)
  const pickupCode = clean(parsed?.pickupCode || extractPickupCode(flat), 40)
  const trackingNo = clean(parsed?.trackingNo || flat.match(/(?:运单号|快递单号|物流单号|单号)\s*[：:]?\s*([A-Z0-9-]{6,40})/i)?.[1], 80)
  const station = extractStation(parsed?.station || source) || "校内快递点"
  if (!pickupCode) return null
  const fallbackTracking = `NOTICE-${crypto.createHash("sha256").update(String(source)).digest("hex").slice(0, 16).toUpperCase()}`
  return {carrier, trackingNo: trackingNo || fallbackTracking, pickupCode, station, rawPreview: clean(source, 300)}
}

function completionUrl(baseUrl) {
  return `${String(baseUrl || "").trim().replace(/\/$/, "")}/chat/completions`
}

export function createExpressNoticeRecognizer({ocrApiUrl, ocrApiKey, ocrModel, fetchImpl = globalThis.fetch} = {}) {
  const configured = Boolean(ocrApiUrl && ocrModel)
  return {
    configured,
    async recognizeImage({buffer, mimeType}) {
      if (!configured) throw Object.assign(new Error("图片识别尚未配置，可先复制通知文字后一键读取"), {status: 503})
      const imageData = `data:${mimeType};base64,${buffer.toString("base64")}`
      let remote
      try {
        remote = await fetchImpl(completionUrl(ocrApiUrl), {
          method: "POST",
          headers: {"content-type": "application/json", ...(ocrApiKey ? {authorization: `Bearer ${ocrApiKey}`} : {})},
          body: JSON.stringify({
            model: ocrModel,
            temperature: 0,
            max_tokens: 1200,
            messages: [{role: "user", content: [
              {type: "text", text: "识别这张快递到件通知截图。只提取截图中真实出现的快递公司、运单号、取件码和取件点，不得猜测。输出严格 JSON：{\"carrier\":\"\",\"trackingNo\":\"\",\"pickupCode\":\"\",\"station\":\"\",\"rawText\":\"\"}。"},
              {type: "image_url", image_url: {url: imageData}}
            ]}]
          }),
          signal: AbortSignal.timeout(45_000)
        })
      } catch (error) {
        throw Object.assign(new Error("取件通知识别连接失败，请稍后重试"), {status: 503, cause: error})
      }
      const payload = await remote.json().catch(() => ({}))
      const content = payload?.choices?.[0]?.message?.content
      const recognized = parseExpressNotice(Array.isArray(content) ? content.map(item => item?.text || "").join("\n") : content)
      if (!remote.ok || !recognized) throw Object.assign(new Error("没有识别到清晰取件码，请换一张完整截图或复制通知文字"), {status: 422})
      return recognized
    }
  }
}
