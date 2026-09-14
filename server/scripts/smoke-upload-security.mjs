import fs from "node:fs"
import crypto from "node:crypto"
import path from "node:path"
import process from "node:process"
import pg from "pg"
import "dotenv/config"

const apiBase = process.env.SMOKE_API_BASE || "http://127.0.0.1:4310/v1"
const uploadDir = path.resolve(process.env.UPLOAD_DIR || "data/uploads")
const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) throw new Error("DATABASE_URL is required")

const sessionToken = crypto.randomBytes(32).toString("base64url")
const sessionHash = crypto.createHash("sha256").update(sessionToken).digest("hex")
const deviceId = `upload-security-smoke-${crypto.randomBytes(8).toString("hex")}`
const pool = new pg.Pool({connectionString: databaseUrl})
const userResult = await pool.query("insert into users(device_id,nickname) values($1,$2) returning id", [deviceId, "上传安全测试"])
const smokeUserId = userResult.rows[0].id
await pool.query(
  "insert into user_sessions(user_id,token_hash,expires_at) values($1,$2,now()+interval '5 minutes')",
  [smokeUserId, sessionHash]
)

const headers = {
  "x-session-token": sessionToken,
  "x-tenant-id": process.env.SMOKE_TENANT || "tangshan",
  "x-campus-id": process.env.SMOKE_CAMPUS || "daxuexidao"
}

async function upload(bytes, type, name) {
  const form = new FormData()
  form.append("file", new Blob([bytes], {type}), name)
  const response = await fetch(`${apiBase}/uploads`, {method: "POST", headers, body: form})
  const payload = await response.json().catch(() => ({}))
  return {response, payload}
}

let uploadedPath = ""
try {
  const png = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360f8cfc0000004010100b10c02d90000000049454e44ae426082", "hex")
  const valid = await upload(png, "image/png", "payload.html")
  if (valid.response.status !== 201 || !/\/[a-z0-9-]+\.png$/i.test(valid.payload.url || "")) {
    throw new Error(`valid disguised upload was not normalized: ${valid.response.status} ${JSON.stringify(valid.payload)}`)
  }

  const filename = path.basename(new URL(valid.payload.url, "https://stardust.sale").pathname)
  uploadedPath = path.resolve(uploadDir, filename)
  if (!uploadedPath.startsWith(`${uploadDir}${path.sep}`)) throw new Error("unsafe smoke-test cleanup path")

  const invalid = await upload(Buffer.from("<script>alert(1)</script>"), "image/png", "payload.png")
  if (invalid.response.status !== 400) {
    throw new Error(`invalid image signature was accepted: ${invalid.response.status}`)
  }
  console.log(JSON.stringify({normalizedExtension: ".png", invalidSignatureStatus: invalid.response.status}))
} finally {
  if (uploadedPath) await fs.promises.unlink(uploadedPath).catch(() => {})
  await pool.query("delete from users where id=$1", [smokeUserId]).catch(() => {})
  await pool.end()
}
