import fs from "node:fs"

const imageTypes = new Map([
  ["image/jpeg", ".jpg"],
  ["image/png", ".png"],
  ["image/webp", ".webp"]
])

export function imageExtensionForMime(mimeType) {
  return imageTypes.get(String(mimeType || "").toLowerCase()) || ""
}

export function hasSupportedImageBuffer(data, mimeType) {
  if (!Buffer.isBuffer(data)) return false
  const normalizedMime = String(mimeType || "").toLowerCase()
  const jpeg = data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff
  const png = data.length >= 8 && data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  const webp = data.length >= 12 && data.subarray(0, 4).equals(Buffer.from("RIFF")) && data.subarray(8, 12).equals(Buffer.from("WEBP"))
  return (normalizedMime === "image/jpeg" && jpeg) || (normalizedMime === "image/png" && png) || (normalizedMime === "image/webp" && webp)
}

export function decodeBase64Image(value, mimeType, maxBytes = 720 * 1024) {
  const base64 = String(value || "").trim()
  if (!imageExtensionForMime(mimeType) || !base64 || base64.length > 980_000) return null
  if (base64.length % 4 !== 0 || !/^[a-z0-9+/]+={0,2}$/i.test(base64)) return null
  const buffer = Buffer.from(base64, "base64")
  if (!buffer.length || buffer.length > maxBytes || !hasSupportedImageBuffer(buffer, mimeType)) return null
  return buffer
}

export async function hasSupportedImageSignature(filePath, mimeType) {
  const data = await fs.promises.readFile(filePath)
  return hasSupportedImageBuffer(data, mimeType)
}
