import crypto from "node:crypto"

const CIPHER_PREFIX = "enc:v1:"

function decodeKey(rawKey) {
  const value = String(rawKey || "").trim()
  if (!value) return null
  if (/^[a-f0-9]{64}$/i.test(value)) return Buffer.from(value, "hex")
  try {
    const decoded = Buffer.from(value, "base64")
    return decoded.length === 32 ? decoded : null
  } catch {
    return null
  }
}

export function createPiiCodec(rawKey) {
  const key = decodeKey(rawKey)
  return {
    configured: Boolean(key),
    encrypt(value) {
      const plain = String(value || "")
      if (!plain || !key) return plain
      const iv = crypto.randomBytes(12)
      const cipher = crypto.createCipheriv("aes-256-gcm", key, iv)
      const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()])
      const tag = cipher.getAuthTag()
      return `${CIPHER_PREFIX}${iv.toString("base64url")}:${tag.toString("base64url")}:${encrypted.toString("base64url")}`
    },
    decrypt(value) {
      const encoded = String(value || "")
      if (!encoded || !encoded.startsWith(CIPHER_PREFIX)) return encoded
      if (!key) throw new Error("PII_ENCRYPTION_KEY is required to decrypt protected data")
      const [ivText, tagText, dataText] = encoded.slice(CIPHER_PREFIX.length).split(":")
      if (!ivText || !tagText || !dataText) throw new Error("invalid protected data")
      const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(ivText, "base64url"))
      decipher.setAuthTag(Buffer.from(tagText, "base64url"))
      return Buffer.concat([decipher.update(Buffer.from(dataText, "base64url")), decipher.final()]).toString("utf8")
    }
  }
}

export function hashIdentity(value, secret) {
  const key = String(secret || "")
  if (!key) throw new Error("IDENTITY_HASH_SECRET is required")
  return crypto.createHmac("sha256", key).update(String(value || ""), "utf8").digest("hex")
}
