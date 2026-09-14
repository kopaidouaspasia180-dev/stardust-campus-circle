import fs from "node:fs"
import path from "node:path"
import process from "node:process"
import dotenv from "dotenv"
import pg from "pg"
import {createPiiCodec} from "../src/security.js"
import {createWechatContentSafety} from "../src/wechat-content-safety.js"

const args = process.argv.slice(2)
const envFlag = args.indexOf("--env")
const envPath = path.resolve(envFlag >= 0 && args[envFlag + 1] ? args[envFlag + 1] : process.env.ENV_FILE || ".env")
if (!fs.existsSync(envPath)) throw new Error(`environment file not found (${envPath})`)
const env = dotenv.parse(fs.readFileSync(envPath, "utf8"))
const codec = createPiiCodec(env.PII_ENCRYPTION_KEY)
if (!codec.configured) throw new Error("PII_ENCRYPTION_KEY is required")

const pool = new pg.Pool({connectionString: env.DATABASE_URL})
try {
  const user = await pool.query("select wechat_openid from users where wechat_openid is not null order by id desc limit 1")
  if (!user.rowCount) throw new Error("no WeChat-authenticated user is available for a live content-safety check")
  const checker = createWechatContentSafety({appid: env.WECHAT_APPID, appSecret: env.WECHAT_APPSECRET, mode: "required"})
  const result = await checker.checkText({content: "唐山学院校园生活服务安全检测", openid: codec.decrypt(user.rows[0].wechat_openid), scene: 2})
  if (result.suggest !== "pass") throw new Error(`content-safety smoke check did not pass (${result.suggest})`)
  console.log("WeChat content-safety credentials and text check are valid.")
} finally {
  await pool.end()
}
