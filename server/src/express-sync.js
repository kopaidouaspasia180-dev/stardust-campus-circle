import crypto from "node:crypto"
import {normalizeMainlandPhone} from "./wechat-phone.js"

function text(value, max) {
  return String(value || "").trim().slice(0, max)
}

export function verifyExpressWebhook(rawBody, signature, secret) {
  if (!secret || !signature) return false
  const expected = crypto.createHmac("sha256", secret).update(String(rawBody || ""), "utf8").digest("hex")
  const actualBuffer = Buffer.from(String(signature).trim().toLowerCase(), "utf8")
  const expectedBuffer = Buffer.from(expected, "utf8")
  return actualBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(actualBuffer, expectedBuffer)
}

export function normalizeExpressArrival(input = {}) {
  const eventId = text(input.eventId, 120)
  const tenant = text(input.tenant, 40)
  const campus = text(input.campus, 40)
  const phone = normalizeMainlandPhone(input.phone)
  const carrier = text(input.carrier, 30)
  const trackingNo = text(input.trackingNo, 80)
  const pickupCode = text(input.pickupCode, 40)
  const station = text(input.station, 80) || "校内快递点"
  if (!eventId || !/^[a-z0-9_-]{2,40}$/i.test(tenant) || !/^[a-z0-9_-]{2,40}$/i.test(campus)) return null
  if (!phone || !carrier || trackingNo.length < 5 || !pickupCode) return null
  return {eventId, tenant, campus, phone, carrier, trackingNo, pickupCode, station}
}

export function looksReadable(value, minimum = 2) {
  const content = String(value || "").trim()
  if (!content) return false
  const meaningful = content.replace(/[?？�\s()[\]（）·:：,，.。_-]/g, "")
  const corrupt = (content.match(/[?？�]/g) || []).length
  return meaningful.length >= minimum && corrupt / Math.max(1, content.length) < 0.35
}
