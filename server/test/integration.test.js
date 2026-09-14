import assert from "node:assert/strict"
import crypto from "node:crypto"
import {spawn} from "node:child_process"
import test, {after, before} from "node:test"
import {fileURLToPath} from "node:url"
import path from "node:path"
import pg from "pg"
import {createPiiCodec, hashIdentity} from "../src/security.js"

const enabled = process.env.RUN_INTEGRATION_TESTS === "true"
const databaseUrl = process.env.DATABASE_URL
const port = Number(process.env.INTEGRATION_PORT || 4321)
const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const base = `http://127.0.0.1:${port}`
const piiKey = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
const identitySecret = "integration-identity-secret"
const expressWebhookSecret = "integration-express-webhook-secret"
const headers = {
  "content-type": "application/json",
  "x-tenant-id": "tangshan",
  "x-campus-id": "daxuexidao",
  "x-device-id": "integration-audit-device"
}

let server
let output = ""
let pool

function shanghaiTomorrow() {
  const parts = new Intl.DateTimeFormat("en-CA", {timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit"}).formatToParts(new Date())
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]))
  const date = new Date(Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day) + 1))
  return date.toISOString().slice(0, 10)
}

function shanghaiDateAfter(days) {
  const parts = new Intl.DateTimeFormat("en-CA", {timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit"}).formatToParts(new Date())
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]))
  const date = new Date(Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day) + days))
  return date.toISOString().slice(0, 10)
}

async function waitForServer() {
  const endAt = Date.now() + 10_000
  while (Date.now() < endAt) {
    try {
      const response = await fetch(`${base}/health`)
      if (response.ok) return
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  throw new Error(`integration API did not start\n${output}`)
}

async function seedTomorrowLunchMenu() {
  const merchant = await pool.query(
    `select m.id,p.id product_id,p.name,p.description,p.category,p.price,p.image_url,p.stock
     from merchants m join products p on p.merchant_id=m.id
     where m.tenant_slug='tangshan' and m.campus_slug='daxuexidao' and m.name='吃啥不愁小饭桌' and p.status='active'
     order by p.id limit 1`
  )
  assert.ok(merchant.rowCount)
  const item = merchant.rows[0]
  await pool.query(
    `insert into daily_menu_items(tenant_slug,campus_slug,merchant_id,product_id,service_date,name,description,category,price,image_url,capacity,status)
     values('tangshan','daxuexidao',$1,$2,$3,$4,$5,$6,$7,$8,$9,'active')
     on conflict(service_date,product_id) do nothing`,
    [item.id, item.product_id, shanghaiTomorrow(), item.name, item.description, item.category, item.price, item.image_url, item.stock]
  )
}

async function request(pathname, options = {}) {
  const response = await fetch(`${base}/v1${pathname}`, {
    ...options,
    headers: {...headers, ...(options.headers || {})}
  })
  const raw = await response.text()
  const body = raw ? JSON.parse(raw) : null
  if (!response.ok) throw new Error(`${pathname} ${response.status}: ${JSON.stringify(body)}`)
  return body
}

async function rawRequest(pathname, options = {}) {
  const requestHeaders = {...headers, ...(options.headers || {})}
  if (options.body instanceof FormData) delete requestHeaders["content-type"]
  const response = await fetch(`${base}/v1${pathname}`, {
    ...options,
    headers: requestHeaders
  })
  const raw = await response.text()
  return {response, body: raw ? JSON.parse(raw) : null}
}

if (!enabled) {
  test("integration suite requires RUN_INTEGRATION_TESTS=true", {skip: "requires PostgreSQL and migrated DATABASE_URL"}, () => {})
} else {
  if (!databaseUrl) throw new Error("DATABASE_URL is required for integration tests")

  before(async () => {
    pool = new pg.Pool({connectionString: databaseUrl})
    server = spawn(process.execPath, ["src/server.js"], {
      cwd: serverDir,
      env: {
        ...process.env,
        DATABASE_URL: databaseUrl,
        PORT: String(port),
        HOST: "127.0.0.1",
        ALLOW_DEVICE_AUTH: "true",
        PII_ENCRYPTION_KEY: piiKey,
        IDENTITY_HASH_SECRET: identitySecret,
        EXPRESS_WEBHOOK_SECRET: expressWebhookSecret,
        NOTIFY_WEBHOOK_URL: "",
        WECHAT_CONTENT_SAFETY_MODE: "off",
        COMMUNITY_BLOCKED_WORDS: "兼职,钱,微信,微,jz,v,r"
      },
      stdio: ["ignore", "pipe", "pipe"]
    })
    server.stdout.on("data", chunk => { output += chunk.toString() })
    server.stderr.on("data", chunk => { output += chunk.toString() })
    await waitForServer()
    await seedTomorrowLunchMenu()
  })

  after(async () => {
    if (server && !server.killed) {
      server.kill("SIGINT")
      await new Promise(resolve => server.once("close", resolve))
    }
    await pool?.end()
  })

  test("order lifecycle is isolated, idempotent, and stores PII encrypted", async () => {
    const dailyMenu = await request(`/takeout/menu?serviceDate=${shanghaiTomorrow()}`)
    assert.equal(dailyMenu.items.length, 1)
    assert.ok(dailyMenu.items[0].available > 0)
    const menu = await request("/takeout/merchants")
    const merchant = menu.items.find(item => item.name === "吃啥不愁小饭桌")
    assert.ok(merchant?.products?.length)
    const idempotencyKey = `it-${crypto.randomBytes(12).toString("hex")}`
    const payload = {
      items: [{productId: merchant.products[0].id, quantity: 1}],
      fulfillmentType: "delivery",
      contactName: "集成测试同学",
      contactPhone: "13800000000",
      deliveryAddress: "唐山学院大学西道校区测试宿舍",
      serviceDate: shanghaiTomorrow(),
      idempotencyKey
    }
    const created = await request("/orders", {method: "POST", body: JSON.stringify(payload)})
    const duplicate = await request("/orders", {method: "POST", body: JSON.stringify(payload)})
    assert.equal(duplicate.idempotent, true)
    assert.equal(duplicate.item.id, created.item.id)
    const detail = await request(`/orders/${created.item.id}`)
    assert.equal(detail.item.contact_phone, payload.contactPhone)
    assert.equal(detail.delivery.dropoff_address, payload.deliveryAddress)
    const messages = await request("/messages")
    assert.ok(messages.items.some(item => item.type === "lunch_order" && item.content.includes(created.item.order_no)))
    const crossCampus = await fetch(`${base}/v1/orders/${created.item.id}`, {headers: {...headers, "x-campus-id": "huayanbeilu"}})
    assert.equal(crossCampus.status, 404)
    const stored = await pool.query("select contact_name,contact_phone,delivery_address from orders where id=$1", [created.item.id])
    assert.match(stored.rows[0].contact_name, /^enc:v1:/)
    assert.match(stored.rows[0].contact_phone, /^enc:v1:/)
    assert.match(stored.rows[0].delivery_address, /^enc:v1:/)
    await request(`/orders/${created.item.id}/cancel`, {method: "POST", body: JSON.stringify({reason: "integration cancellation"})})
  })

  test("live catalog remains orderable when no daily menu is published", async () => {
    const serviceDate = shanghaiDateAfter(2)
    await pool.query(
      "delete from daily_menu_items where tenant_slug='tangshan' and campus_slug='daxuexidao' and service_date=$1",
      [serviceDate]
    )
    const menu = await request(`/takeout/menu?serviceDate=${serviceDate}`)
    assert.equal(menu.source, "live_catalog")
    assert.ok(menu.items.length > 0)
    assert.ok(menu.items.every(item => item.data_mode === "live"))
    const product = menu.items.find(item => item.available > 0)
    assert.ok(product)
    const created = await request("/orders", {method: "POST", body: JSON.stringify({
      items: [{productId: product.id, quantity: 1}],
      fulfillmentType: "pickup",
      contactName: "正式菜单测试同学",
      contactPhone: "13800000000",
      serviceDate,
      idempotencyKey: `live-${crypto.randomBytes(12).toString("hex")}`
    })})
    assert.equal(created.item.service_date, serviceDate)
    await request(`/orders/${created.item.id}/cancel`, {method: "POST", body: JSON.stringify({reason: "live catalog integration cleanup"})})
  })

  test("school admin can provision merchant and rider workspaces", async () => {
    const me = await request("/me")
    const schedule = await request("/schedule", {method: "POST", body: JSON.stringify({name: "集成课表", time: "周三 1-2 节", room: "测试教室", teacher: "测试老师"})})
    const ownSchedule = await request("/schedule")
    assert.ok(ownSchedule.items.some(item => item.id === schedule.item.id && item.time_text === "周三 1-2 节"))
    const importedSchedule = await request("/schedule/import", {
      method: "POST",
      body: JSON.stringify({items: [
        {name: "图片识别课程", time: "周五 3-4 节（1-16周）", room: "识别教室", teacher: "识别老师"},
        {name: "图片识别课程", time: "周五 3-4 节（1-16周）", room: "识别教室", teacher: "识别老师"}
      ]})
    })
    assert.equal(importedSchedule.inserted, 1)
    const duplicateImport = await request("/schedule/import", {
      method: "POST",
      body: JSON.stringify({items: [{name: "图片识别课程", time: "周五 3-4 节（1-16周）", room: "识别教室", teacher: "识别老师"}]})
    })
    assert.equal(duplicateImport.inserted, 0)
    assert.equal(duplicateImport.skipped, 1)
    const foreignSchedule = await rawRequest("/schedule", {headers: {"x-device-id": "integration-schedule-other-user"}})
    assert.equal(foreignSchedule.body.items.length, 0)
    const foreignDelete = await rawRequest(`/schedule/${schedule.item.id}`, {method: "DELETE", headers: {"x-device-id": "integration-schedule-other-user"}})
    assert.equal(foreignDelete.response.status, 404)
    await request(`/schedule/${schedule.item.id}`, {method: "DELETE"})
    await pool.query("delete from user_schedule_entries where tenant_slug='tangshan' and campus_slug='daxuexidao' and user_id=$1 and name='图片识别课程'", [me.user.id])
    await pool.query(
      `insert into platform_admins(user_id,tenant_slug,role,status) values($1,'tangshan','school_admin','active')
       on conflict(user_id,tenant_slug) do update set role='school_admin',status='active'`,
      [me.user.id]
    )
    const merchant = await request("/admin/merchants", {method: "POST", body: JSON.stringify({name: "集成授权档口", category: "午餐", description: "integration", deliveryMinutes: 20, minOrder: 0})})
    const product = await request(`/admin/merchants/${merchant.item.id}/products`, {method: "POST", body: JSON.stringify({name: "集成午餐套餐", description: "integration", price: 19.9, category: "午餐套餐", stock: 10})})
    const dailyMenu = await request(`/admin/merchants/${merchant.item.id}/daily-menu`, {method: "POST", body: JSON.stringify({productId: product.item.id, serviceDate: shanghaiTomorrow(), name: "集成每日套餐", description: "每日菜单回归", price: 20.5, capacity: 4})})
    const adminDailyMenu = await request(`/admin/merchants/${merchant.item.id}/daily-menu?serviceDate=${shanghaiTomorrow()}`)
    assert.equal(adminDailyMenu.items[0].available, 4)
    const customerDailyMenu = await request(`/takeout/menu?serviceDate=${shanghaiTomorrow()}`)
    assert.ok(customerDailyMenu.items.some(item => item.id === product.item.id && Number(item.price) === 20.5))
    const dailyOrder = await request("/orders", {method: "POST", body: JSON.stringify({
      items: [{productId: product.item.id, quantity: 1}], fulfillmentType: "pickup", contactName: "集成菜单同学", contactPhone: "13800000000", serviceDate: shanghaiTomorrow(), idempotencyKey: `daily-${crypto.randomBytes(12).toString("hex")}`
    })})
    const belowReserved = await rawRequest(`/admin/daily-menu/${dailyMenu.item.id}`, {method: "PATCH", body: JSON.stringify({capacity: 0})})
    assert.equal(belowReserved.response.status, 409)
    await request(`/admin/daily-menu/${dailyMenu.item.id}`, {method: "PATCH", body: JSON.stringify({capacity: 3, price: 21.5, status: "inactive"})})
    const hiddenDailyMenu = await request(`/takeout/menu?serviceDate=${shanghaiTomorrow()}`)
    assert.ok(!hiddenDailyMenu.items.some(item => item.id === product.item.id))
    await request(`/admin/daily-menu/${dailyMenu.item.id}`, {method: "PATCH", body: JSON.stringify({status: "active"})})
    const resumedDailyMenu = await request(`/takeout/menu?serviceDate=${shanghaiTomorrow()}`)
    const resumedProduct = resumedDailyMenu.items.find(item => item.id === product.item.id)
    assert.equal(Number(resumedProduct.price), 21.5)
    assert.equal(resumedProduct.available, 2)
    await request(`/orders/${dailyOrder.item.id}/cancel`, {method: "POST", body: JSON.stringify({reason: "daily menu integration cleanup"})})
    await request(`/admin/merchants/${merchant.item.id}/staff`, {method: "POST", body: JSON.stringify({userId: me.user.id, role: "operator"})})
    const courier = await request("/admin/couriers", {method: "POST", body: JSON.stringify({name: "集成测试骑手", phone: "13800000000"})})
    await request(`/admin/couriers/${courier.item.id}/accounts`, {method: "POST", body: JSON.stringify({userId: me.user.id})})
    const faq = await request("/admin/campus-faqs", {method: "POST", body: JSON.stringify({keywords: "集成问答", answer: "这是由运营知识库返回的集成测试答案。", sourceLabel: "集成知识库"})})
    await request(`/admin/campus-faqs/${faq.item.id}`, {method: "PATCH", body: JSON.stringify({answer: "这是已更新的运营知识库答案。"})})
    const [adminMerchants, adminCouriers, access, faqs] = await Promise.all([request("/admin/takeout/merchants"), request("/admin/couriers"), request("/ops/access"), request("/admin/campus-faqs")])
    assert.ok(adminMerchants.items.some(item => item.id === merchant.item.id && item.products.some(entry => entry.id === product.item.id)))
    assert.ok(adminCouriers.items.some(item => item.id === courier.item.id))
    assert.ok(access.merchants.some(item => item.id === merchant.item.id))
    assert.ok(access.couriers.some(item => item.id === courier.item.id))
    assert.ok(faqs.items.some(item => item.id === faq.item.id && item.answer.includes("已更新")))
  })

  test("admin web login uses a short-lived one-time code from an authorized mini-program session", async () => {
    const me = await request("/me")
    await pool.query(
      `insert into platform_admins(user_id,tenant_slug,role,status) values($1,'tangshan','school_admin','active')
       on conflict(user_id,tenant_slug) do update set role='school_admin',status='active'`,
      [me.user.id]
    )
    const issued = await request("/admin/auth/code", {method: "POST", body: "{}"})
    assert.match(issued.code, /^\d{8}$/)
    const exchange = await fetch(`${base}/v1/admin/auth/exchange`, {
      method: "POST",
      headers: {"content-type": "application/json", "x-tenant-id": "tangshan", "x-campus-id": "daxuexidao"},
      body: JSON.stringify({code: issued.code})
    })
    assert.equal(exchange.status, 200)
    const session = await exchange.json()
    assert.match(session.sessionToken, /^cs_/)
    const contextResponse = await fetch(`${base}/v1/admin/context`, {
      headers: {"x-tenant-id": "tangshan", "x-campus-id": "daxuexidao", "x-session-token": session.sessionToken}
    })
    assert.equal(contextResponse.status, 200)
    const replay = await fetch(`${base}/v1/admin/auth/exchange`, {
      method: "POST",
      headers: {"content-type": "application/json", "x-tenant-id": "tangshan", "x-campus-id": "daxuexidao"},
      body: JSON.stringify({code: issued.code})
    })
    assert.equal(replay.status, 401)
  })

  test("social, marketplace, jobs, events, and uploads enforce commercial boundaries", async () => {
    const socialMe = await request("/me")
    await pool.query("update users set phone_verified_at=coalesce(phone_verified_at,now()) where id=$1", [socialMe.user.id])
    await pool.query("insert into tenants(slug,name) values('foreign-test','隔离测试高校') on conflict(slug) do nothing")
    await pool.query("insert into campus_sites(tenant_slug,slug,name,address) values('foreign-test','main','隔离测试校区','仅用于自动化测试') on conflict(tenant_slug,slug) do nothing")
    const nineImages = Array.from({length: 9}, (_, index) => `/campus-circle/api/uploads/community-${index + 1}.jpg`)
    const post = await request("/community/posts", {method: "POST", body: JSON.stringify({channel: "日常", content: "跨校边界集成测试帖子", location: "测试地点", imageUrls: nineImages})})
    assert.equal(post.moderation, "published")
    assert.equal(post.item.status, "active")
    assert.equal(post.item.image_urls.length, 9)
    const myPublishedPosts = await request("/community/posts?scope=mine")
    assert.ok(myPublishedPosts.items.some(item => item.id === post.item.id && item.status === "active"))
    const active = await request("/admin/community/posts?status=active")
    assert.ok(active.items.some(item => item.id === post.item.id))
    const tooManyImages = await rawRequest("/community/posts", {
      method: "POST",
      body: JSON.stringify({channel: "日常", content: "验证图片数量上限的校园动态", imageUrls: [...nineImages, "/campus-circle/api/uploads/community-10.jpg"]})
    })
    assert.equal(tooManyImages.response.status, 400)
    const blockedPost = await rawRequest("/community/posts", {
      method: "POST",
      body: JSON.stringify({channel: "日常", content: "请加微 信继续联系", location: "测试地点"})
    })
    assert.equal(blockedPost.response.status, 422)
    const crossSchool = await rawRequest(`/community/posts/${post.item.id}/like`, {
      method: "POST",
      headers: {"x-tenant-id": "foreign-test", "x-campus-id": "main"}
    })
    assert.equal(crossSchool.response.status, 404)
    const postDetail = await request(`/community/posts/${post.item.id}`)
    assert.equal(postDetail.item.id, post.item.id)
    assert.equal(postDetail.item.image_urls.length, 9)

    await request(`/admin/community/posts/${post.item.id}`, {method: "PATCH", body: JSON.stringify({status: "removed", note: "集成测试管理员下架"})})
    const publicAfterAdminRemoval = await request("/community/posts")
    assert.ok(!publicAfterAdminRemoval.items.some(item => item.id === post.item.id))

    const publishedToWithdraw = await request("/community/posts", {method: "POST", body: JSON.stringify({channel: "日常", content: "用于验证用户主动撤回已公开内容", location: "测试地点"})})
    await request(`/community/posts/${publishedToWithdraw.item.id}`, {method: "DELETE"})
    const mineAfterWithdraw = await request("/community/posts?scope=mine")
    assert.ok(!mineAfterWithdraw.items.some(item => item.id === publishedToWithdraw.item.id))

    const anotherAuthor = await rawRequest("/community/posts", {
      method: "POST",
      headers: {"x-device-id": "integration-community-author"},
      body: JSON.stringify({channel: "互助", content: "用于举报闭环的第二位同学帖子", location: "测试地点"})
    })
    assert.equal(anotherAuthor.response.status, 201)
    await pool.query("update users set phone_verified_at=coalesce(phone_verified_at,now()) where device_id=$1", ["integration-community-author"])
    assert.equal(anotherAuthor.body.item.status, "active")
    const myPosts = await request("/community/posts?scope=mine")
    assert.ok(!myPosts.items.some(item => item.id === anotherAuthor.body.item.id))
    const comment = await rawRequest(`/community/posts/${anotherAuthor.body.item.id}/comments`, {
      method: "POST",
      headers: {"x-device-id": "integration-community-commenter"},
      body: JSON.stringify({content: "用于验证评论举报与删除闭环"})
    })
    assert.equal(comment.response.status, 201)
    const followed = await request(`/community/posts/${anotherAuthor.body.item.id}/follow`, {method: "POST"})
    assert.equal(followed.following, true)
    assert.ok(followed.followerCount >= 1)
    const reply = await request(`/community/posts/${anotherAuthor.body.item.id}/comments`, {
      method: "POST",
      body: JSON.stringify({content: "这是对指定评论的回复", parentCommentId: comment.body.item.id})
    })
    const detailWithReply = await request(`/community/posts/${anotherAuthor.body.item.id}`)
    const replyItem = detailWithReply.item.comments.find(item => item.id === reply.item.id)
    assert.equal(replyItem.parent_comment_id, comment.body.item.id)
    assert.ok(replyItem.reply_to_name)
    assert.equal(replyItem.parent_comment_content, "用于验证评论举报与删除闭环")
    assert.equal(detailWithReply.item.following, true)
    const communityConversation = await request("/conversations", {
      method: "POST",
      body: JSON.stringify({resourceType: "community_post", resourceId: anotherAuthor.body.item.id})
    })
    assert.equal(communityConversation.item.resource_type, "community_post")
    const communityMessage = await request(`/conversations/${communityConversation.item.id}/messages`, {
      method: "POST",
      body: JSON.stringify({content: "你好，我是从校园圈帖子发来的私信"})
    })
    assert.equal(communityMessage.item.mine, true)
    const blockedSecondGreeting = await rawRequest(`/conversations/${communityConversation.item.id}/messages`, {
      method: "POST",
      body: JSON.stringify({content: "未互关前的第二条消息应被阻止"})
    })
    assert.equal(blockedSecondGreeting.response.status, 409)
    const conversations = await request("/conversations")
    assert.ok(conversations.items.some(item => item.id === communityConversation.item.id && item.resource_type === "community_post"))
    const authorConversations = await rawRequest("/conversations", {
      headers: {"x-device-id": "integration-community-author"}
    })
    assert.equal(authorConversations.response.status, 200)
    const authorConversation = authorConversations.body.items.find(item => item.id === communityConversation.item.id)
    assert.ok(authorConversation)
    assert.equal(authorConversation.unread_count, 1)
    const authorMessages = await rawRequest(`/conversations/${communityConversation.item.id}/messages`, {
      headers: {"x-device-id": "integration-community-author"}
    })
    assert.equal(authorMessages.response.status, 200)
    assert.equal(authorMessages.body.items.at(-1).content, "你好，我是从校园圈帖子发来的私信")
    const authorFollowBack = await rawRequest(`/community/profiles/${socialMe.user.publicId}/follow`, {
      method: "POST",
      headers: {"x-device-id": "integration-community-author"}
    })
    assert.equal(authorFollowBack.response.status, 200)
    assert.equal(authorFollowBack.body.mutualFollowing, true)
    const replyAfterMutualFollow = await rawRequest(`/conversations/${communityConversation.item.id}/messages`, {
      method: "POST",
      headers: {"x-device-id": "integration-community-author"},
      body: JSON.stringify({content: "互关后可以正常回复"})
    })
    assert.equal(replyAfterMutualFollow.response.status, 201)
    const commentReport = await request(`/community/comments/${comment.body.item.id}/reports`, {method: "POST", body: JSON.stringify({reason: "评论内容不适宜"})})
    assert.equal(commentReport.reported, true)
    const commentReports = await request("/admin/community/comment-reports")
    const targetCommentReport = commentReports.items.find(item => item.comment_id === comment.body.item.id)
    assert.ok(targetCommentReport)
    await request(`/admin/community/comment-reports/${targetCommentReport.id}/resolve`, {method: "POST", body: JSON.stringify({remove: true})})
    const detailAfterCommentRemoval = await request(`/community/posts/${anotherAuthor.body.item.id}`)
    assert.ok(!detailAfterCommentRemoval.item.comments.some(item => item.id === comment.body.item.id))
    const report = await request(`/community/posts/${anotherAuthor.body.item.id}/reports`, {method: "POST", body: JSON.stringify({reason: "诈骗或交易风险"})})
    assert.equal(report.reported, true)
    const reports = await request("/admin/community/reports")
    assert.equal(reports.items[0].post_id, anotherAuthor.body.item.id)
    await request(`/admin/community/reports/${reports.items[0].id}/resolve`, {method: "POST"})

    const invalidImage = await rawRequest("/market/listings", {
      method: "POST",
      body: JSON.stringify({title: "测试闲置", description: "用于校验非受信图片地址", price: 1, imageUrl: "https://example.com/not-ours.png"})
    })
    assert.equal(invalidImage.response.status, 400)

    const foreignJob = await pool.query(
      "insert into jobs(tenant_slug,campus_slug,title,organization,location,salary_text,description) values('foreign-test','main','跨校测试兼职','测试组织','测试地点','10 元/时','仅用于权限测试') returning id"
    )
    const jobApply = await rawRequest(`/jobs/${foreignJob.rows[0].id}/apply`, {method: "POST", body: JSON.stringify({message: "测试"})})
    assert.equal(jobApply.response.status, 404)

    const event = await pool.query(
      "insert into events(tenant_slug,campus_slug,title,organizer,event_time,location,description,capacity) values('tangshan','daxuexidao','并发容量测试','测试组织','明天','测试地点','仅用于并发容量校验',1) returning id"
    )
    const signups = await Promise.all(["capacity-a", "capacity-b"].map(device => rawRequest(`/events/${event.rows[0].id}/signup`, {
      method: "POST",
      headers: {"x-device-id": `integration-${device}-device`}
    })))
    assert.deepEqual(signups.map(item => item.response.status).sort(), [200, 409])

    const invalidForm = new FormData()
    invalidForm.append("file", new Blob(["not an image"], {type: "image/png"}), "invalid.png")
    const invalidUpload = await rawRequest("/uploads", {method: "POST", body: invalidForm})
    assert.equal(invalidUpload.response.status, 400)
    const validPng = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360f8cfc0000004010100b10c02d90000000049454e44ae426082", "hex")
    const validForm = new FormData()
    validForm.append("file", new Blob([validPng], {type: "image/png"}), "valid.png")
    const validUpload = await rawRequest("/uploads", {method: "POST", body: validForm})
    assert.equal(validUpload.response.status, 201)
    const listing = await request("/market/listings", {method: "POST", body: JSON.stringify({title: "收藏筛选测试", description: "用于验证跨设备同步的收藏筛选结果", category: "数码", price: 9.9})})
    assert.equal(listing.moderation, "pending_review")
    assert.equal(listing.item.status, "pending")
    const hiddenListing = await rawRequest("/market/listings", {headers: {"x-device-id": "integration-market-viewer"}})
    assert.ok(!hiddenListing.body.items.some(item => item.id === listing.item.id))
    await request(`/admin/market/listings/${listing.item.id}`, {method: "PATCH", body: JSON.stringify({status: "active"})})
    await request(`/market/listings/${listing.item.id}/favorite`, {method: "POST"})
    const favorites = await request("/market/listings?scope=favorites")
    assert.ok(favorites.items.some(item => item.id === listing.item.id && item.favorite))
    const mine = await request("/market/listings?scope=mine")
    assert.ok(mine.items.some(item => item.id === listing.item.id && item.mine))
  })

  test("Tangshan University and Tangshan Normal University social data stay mutually isolated", async () => {
    const tangshanAuthorDevice = `integration-school-tangshan-${crypto.randomBytes(5).toString("hex")}`
    const normalAuthorDevice = `integration-school-tstc-${crypto.randomBytes(5).toString("hex")}`
    const tangshanHeaders = {"x-tenant-id": "tangshan", "x-campus-id": "daxuexidao", "x-device-id": tangshanAuthorDevice}
    const normalHeaders = {"x-tenant-id": "tstc", "x-campus-id": "daxuedao", "x-device-id": normalAuthorDevice}

    const tangshanMe = await rawRequest("/me", {headers: tangshanHeaders})
    const normalMe = await rawRequest("/me", {headers: normalHeaders})
    assert.equal(tangshanMe.response.status, 200)
    assert.equal(normalMe.response.status, 200)
    await pool.query("update users set phone_verified_at=coalesce(phone_verified_at,now()) where device_id=any($1::text[])", [[tangshanAuthorDevice, normalAuthorDevice]])

    const tangshanPost = await rawRequest("/community/posts", {
      method: "POST",
      headers: tangshanHeaders,
      body: JSON.stringify({channel: "日常", content: "唐山学院学校隔离验证动态", location: "大学西道校区"})
    })
    const normalPost = await rawRequest("/community/posts", {
      method: "POST",
      headers: normalHeaders,
      body: JSON.stringify({channel: "日常", content: "唐山师范学院学校隔离验证动态", location: "大学道校区"})
    })
    assert.equal(tangshanPost.response.status, 201)
    assert.equal(normalPost.response.status, 201)

    const normalViewOfTangshan = await rawRequest("/community/posts", {headers: normalHeaders})
    const tangshanViewOfNormal = await rawRequest("/community/posts", {headers: tangshanHeaders})
    assert.ok(!normalViewOfTangshan.body.items.some(item => item.id === tangshanPost.body.item.id))
    assert.ok(!tangshanViewOfNormal.body.items.some(item => item.id === normalPost.body.item.id))

    for (const [foreignHeaders, foreignPost, foreignPublicId] of [
      [normalHeaders, tangshanPost.body.item, tangshanMe.body.user.publicId],
      [tangshanHeaders, normalPost.body.item, normalMe.body.user.publicId]
    ]) {
      const detail = await rawRequest(`/community/posts/${foreignPost.id}`, {headers: foreignHeaders})
      assert.equal(detail.response.status, 404)
      const profile = await rawRequest(`/community/profiles/${foreignPublicId}`, {headers: foreignHeaders})
      assert.equal(profile.response.status, 404)
      const followByPost = await rawRequest(`/community/posts/${foreignPost.id}/follow`, {method: "POST", headers: foreignHeaders})
      assert.equal(followByPost.response.status, 404)
      const followByProfile = await rawRequest(`/community/profiles/${foreignPublicId}/follow`, {method: "POST", headers: foreignHeaders})
      assert.equal(followByProfile.response.status, 404)
      const conversation = await rawRequest("/conversations", {
        method: "POST",
        headers: foreignHeaders,
        body: JSON.stringify({resourceType: "community_post", resourceId: foreignPost.id})
      })
      assert.equal(conversation.response.status, 404)
    }

    await pool.query("delete from community_posts where id=any($1::uuid[])", [[tangshanPost.body.item.id, normalPost.body.item.id]])
  })

  test("Tangshan University campuses share community profiles, follows, and private messages", async () => {
    const southDevice = `integration-tangshan-south-${crypto.randomBytes(5).toString("hex")}`
    const northDevice = `integration-tangshan-north-${crypto.randomBytes(5).toString("hex")}`
    const southHeaders = {"x-tenant-id": "tangshan", "x-campus-id": "daxuexidao", "x-device-id": southDevice}
    const northHeaders = {"x-tenant-id": "tangshan", "x-campus-id": "beiyuan", "x-device-id": northDevice}
    const huayanHeaders = {"x-tenant-id": "tangshan", "x-campus-id": "huayanbeilu", "x-device-id": southDevice}

    const southMe = await rawRequest("/me", {headers: southHeaders})
    const northMe = await rawRequest("/me", {headers: northHeaders})
    assert.equal(southMe.response.status, 200)
    assert.equal(northMe.response.status, 200)
    await pool.query("update users set phone_verified_at=coalesce(phone_verified_at,now()) where device_id=any($1::text[])", [[southDevice, northDevice]])

    const southPost = await rawRequest("/community/posts", {
      method: "POST",
      headers: southHeaders,
      body: JSON.stringify({channel: "日常", content: "唐山学院同校跨院区互通验证动态", location: "南院"})
    })
    assert.equal(southPost.response.status, 201)

    const northFeed = await rawRequest("/community/posts", {headers: northHeaders})
    assert.equal(northFeed.response.status, 200)
    assert.ok(northFeed.body.items.some(item => item.id === southPost.body.item.id))

    const northDetail = await rawRequest(`/community/posts/${southPost.body.item.id}`, {headers: northHeaders})
    assert.equal(northDetail.response.status, 200)
    const southProfile = await rawRequest(`/community/profiles/${southMe.body.user.publicId}`, {headers: northHeaders})
    assert.equal(southProfile.response.status, 200)

    const followed = await rawRequest(`/community/profiles/${southMe.body.user.publicId}/follow`, {
      method: "POST",
      headers: northHeaders
    })
    assert.equal(followed.response.status, 200)
    assert.equal(followed.body.following, true)

    const conversation = await rawRequest("/conversations", {
      method: "POST",
      headers: northHeaders,
      body: JSON.stringify({resourceType: "community_post", resourceId: southPost.body.item.id})
    })
    assert.equal(conversation.response.status, 201)
    const greeting = await rawRequest(`/conversations/${conversation.body.item.id}/messages`, {
      method: "POST",
      headers: northHeaders,
      body: JSON.stringify({content: "你好，我在北院看到了你在南院发布的帖子"})
    })
    assert.equal(greeting.response.status, 201)

    const southInbox = await rawRequest("/conversations", {headers: southHeaders})
    assert.equal(southInbox.response.status, 200)
    assert.ok(southInbox.body.items.some(item => item.id === conversation.body.item.id && item.unread_count === 1))

    const huayanMe = await rawRequest("/me", {headers: huayanHeaders})
    assert.equal(huayanMe.response.status, 200)
    const huayanInbox = await rawRequest("/conversations", {headers: huayanHeaders})
    assert.equal(huayanInbox.response.status, 200)
    assert.ok(huayanInbox.body.items.some(item => item.id === conversation.body.item.id))

    await pool.query("delete from resource_conversations where id=$1", [conversation.body.item.id])
    await pool.query("delete from community_follows where tenant_slug='tangshan' and follower_id=$1 and followed_id=$2", [northMe.body.user.id, southMe.body.user.id])
    await pool.query("delete from community_posts where id=$1", [southPost.body.item.id])
  })

  test("campus admin, conversations, and paid job-posting drafts stay inside one campus", async () => {
    const listing = await request("/market/listings", {
      method: "POST",
      body: JSON.stringify({title: `会话测试闲置-${crypto.randomBytes(4).toString("hex")}`, description: "用于验证校区内买卖双方自由沟通", category: "生活", price: 12})
    })
    await request(`/admin/market/listings/${listing.item.id}`, {method: "PATCH", body: JSON.stringify({status: "active"})})
    const buyerHeaders = {"x-device-id": "integration-chat-buyer"}
    const started = await rawRequest("/conversations", {
      method: "POST",
      headers: buyerHeaders,
      body: JSON.stringify({resourceType: "market_listing", resourceId: listing.item.id})
    })
    assert.equal(started.response.status, 201)
    const conversationId = started.body.item.id
    const sent = await rawRequest(`/conversations/${conversationId}/messages`, {
      method: "POST",
      headers: buyerHeaders,
      body: JSON.stringify({content: "你好，方便在校内公共区域当面验货吗？"})
    })
    assert.equal(sent.response.status, 201)
    const ownerInbox = await request("/conversations")
    assert.ok(ownerInbox.items.some(item => item.id === conversationId && item.unread_count === 1))
    const ownerMessages = await request(`/conversations/${conversationId}/messages`)
    assert.equal(ownerMessages.items[0].content, "你好，方便在校内公共区域当面验货吗？")

    const ebike = await request("/market/listings", {
      method: "POST",
      body: JSON.stringify({
        title: "集成测试校园通勤电动车",
        description: "用于验证结构化车辆资料和校内验车预约闭环",
        category: "电动车",
        price: 1680,
        vehicleBrand: "雅迪",
        vehicleRangeKm: 45,
        batteryYear: new Date().getFullYear(),
        registrationStatus: "registered"
      })
    })
    assert.equal(ebike.item.vehicle_range_km, 45)
    await request(`/admin/market/listings/${ebike.item.id}`, {method: "PATCH", body: JSON.stringify({status: "active"})})
    const appointment = await rawRequest(`/market/listings/${ebike.item.id}/inspection-appointments`, {
      method: "POST",
      headers: buyerHeaders,
      body: JSON.stringify({requestedDate: shanghaiTomorrow(), requestedSlot: "下午", meetingPlace: "图书馆东门", note: "重点检查电池"})
    })
    assert.equal(appointment.response.status, 201)
    const sellerAppointments = await request("/market/inspection-appointments")
    assert.ok(sellerAppointments.items.some(item => item.id === appointment.body.item.id && item.seller))
    await request(`/market/inspection-appointments/${appointment.body.item.id}`, {method: "PATCH", body: JSON.stringify({status: "confirmed"})})
    const buyerAppointments = await rawRequest("/market/inspection-appointments", {headers: buyerHeaders})
    assert.ok(buyerAppointments.body.items.some(item => item.id === appointment.body.item.id && item.status === "confirmed" && item.buyer))

    const crossCampusConversation = await rawRequest(`/conversations/${conversationId}/messages`, {
      headers: {"x-device-id": "integration-chat-cross-campus", "x-campus-id": "huayanbeilu"}
    })
    assert.equal(crossCampusConversation.response.status, 404)
    const crossCampusListings = await rawRequest("/market/listings", {
      headers: {"x-device-id": "integration-market-cross-campus", "x-campus-id": "huayanbeilu"}
    })
    assert.ok(!crossCampusListings.body.items.some(item => item.id === listing.item.id))

    const posting = await rawRequest("/job-postings", {
      method: "POST",
      body: JSON.stringify({
        title: "集成测试兼职发布",
        organization: "集成测试发布方",
        location: "大学西道校区",
        salaryText: "20 元/小时",
        description: "用于验证十元发布费、运营沟通和审核状态不会被客户端绕过。"
      })
    })
    assert.equal(posting.response.status, 409)
    assert.match(posting.body.error, /暂未开放/)

    await request("/admin/settings", {
      method: "PATCH",
      body: JSON.stringify({operator_wechat: "integration-contact", operator_contact_note: "仅用于集成测试", ebike_contact_enabled: true})
    })
    const ebikeContact = await rawRequest("/campus/contact?purpose=ebike", {headers: buyerHeaders})
    assert.equal(ebikeContact.response.status, 200)
    assert.equal(ebikeContact.body.contact.wechat, "integration-contact")
    const crossCampusContact = await rawRequest("/campus/contact?purpose=ebike", {
      headers: {"x-device-id": "integration-contact-cross-campus", "x-campus-id": "huayanbeilu"}
    })
    assert.equal(crossCampusContact.response.status, 409)

    const adminContext = await request("/admin/context")
    assert.equal(adminContext.campus.id, "daxuexidao")
    const campusNames = Object.fromEntries(adminContext.campuses.map(item => [item.slug, item.name]))
    assert.deepEqual(campusNames, {
      daxuexidao: "南院",
      beiyuan: "北院",
      huayanbeilu: "华岩路",
      longze: "东院"
    })
    const stats = await request("/admin/stats")
    assert.equal(stats.campus, "daxuexidao")
    assert.ok(stats.users >= 1)
  })

  test("school rankings support review, favorites, comments, reports, school isolation, and profile persistence", async () => {
    const owner = await request("/me")
    await pool.query("update users set phone_verified_at=now() where id=$1", [owner.user.id])
    await request("/me", {method: "PATCH", body: JSON.stringify({
      nickname: "榜单集成同学",
      profileBackground: "/campus-circle/api/uploads/profile-bg.jpg",
      profileBio: "会持续保存在手机号账号上的个人介绍",
      profileInterests: ["摄影", "校园生活"],
      profileGallery: ["/campus-circle/api/uploads/profile-gallery.jpg"]
    })})
    const persistedProfile = await request("/me")
    assert.equal(persistedProfile.user.profileBio, "会持续保存在手机号账号上的个人介绍")
    assert.deepEqual(persistedProfile.user.profileInterests, ["摄影", "校园生活"])

    const placeName = `集成榜单地点-${crypto.randomBytes(5).toString("hex")}`
    const submitted = await request("/rankings/places", {
      method: "POST",
      body: JSON.stringify({
        category: "life",
        name: placeName,
        note: "这是用于验证校园榜单审核闭环的真实测试描述",
        location: "大学西道校区测试位置",
        imageUrl: "/campus-circle/api/uploads/ranking-place-a.jpg"
      })
    })
    assert.equal(submitted.moderation, "pending_review")
    assert.equal(submitted.item.status, "pending")
    assert.equal(submitted.item.mine, true)

    const ownerView = await request("/rankings/places?category=life")
    assert.ok(ownerView.items.some(item => item.id === submitted.item.id && item.status === "pending"))
    const mochaPro = ownerView.items.find(item => item.coverKey === "life-mocha-pro")
    assert.ok(mochaPro)
    assert.equal(mochaPro.name, "摩卡 Pro 美发（唐山吾悦广场店）")
    assert.equal(mochaPro.likes, 0)
    assert.equal(mochaPro.studentSubmitted, false)
    const verifiedConvenienceStore = ownerView.items.find(item => item.name === "永鑫便利店（大学西道店）")
    assert.ok(verifiedConvenienceStore)
    assert.equal(verifiedConvenienceStore.referenceSource, "吉屋周边配套")
    assert.equal(verifiedConvenienceStore.likes, 0)
    const verifiedFood = await request("/rankings/places?category=food")
    assert.equal(verifiedFood.items[0].name, "钰姐妹饺子城")
    assert.equal(verifiedFood.items[0].referenceRating, 4.8)
    assert.equal(verifiedFood.items[0].referenceCount, 202)
    const otherPendingView = await rawRequest("/rankings/places?category=life", {
      headers: {"x-device-id": "integration-ranking-viewer"}
    })
    assert.equal(otherPendingView.response.status, 200)
    assert.ok(!otherPendingView.body.items.some(item => item.id === submitted.item.id))

    const pending = await request("/admin/rankings/places?status=pending")
    assert.ok(pending.items.some(item => item.id === submitted.item.id))
    await request(`/admin/rankings/places/${submitted.item.id}/review`, {
      method: "POST",
      body: JSON.stringify({decision: "approve"})
    })

    const viewer = await rawRequest("/me", {headers: {"x-device-id": "integration-ranking-viewer"}})
    await pool.query("update users set phone_verified_at=now() where id=$1", [viewer.body.user.id])

    const liked = await rawRequest(`/rankings/places/${submitted.item.id}/like`, {
      method: "POST",
      headers: {"x-device-id": "integration-ranking-viewer"}
    })
    assert.equal(liked.response.status, 200)
    assert.equal(liked.body.liked, true)
    assert.equal(liked.body.likes, 1)

    const favorited = await rawRequest(`/rankings/places/${submitted.item.id}/favorite`, {
      method: "POST",
      headers: {"x-device-id": "integration-ranking-viewer"}
    })
    assert.equal(favorited.response.status, 200)
    assert.equal(favorited.body.favorited, true)

    const commented = await rawRequest(`/rankings/places/${submitted.item.id}/comments`, {
      method: "POST",
      headers: {"x-device-id": "integration-ranking-viewer"},
      body: JSON.stringify({content: "真实去过，位置和描述都很准确"})
    })
    assert.equal(commented.response.status, 201)
    assert.equal(commented.body.item.mine, true)

    const crossCampusViewer = await rawRequest("/me", {
      headers: {"x-device-id": "integration-ranking-cross-campus", "x-campus-id": "huayanbeilu"}
    })
    await pool.query("update users set phone_verified_at=now() where id=$1", [crossCampusViewer.body.user.id])
    const crossCampusLike = await rawRequest(`/rankings/places/${submitted.item.id}/like`, {
      method: "POST",
      headers: {"x-device-id": "integration-ranking-cross-campus", "x-campus-id": "huayanbeilu"}
    })
    assert.equal(crossCampusLike.response.status, 200)
    assert.equal(crossCampusLike.body.likes, 2)
    const crossCampusView = await rawRequest("/rankings/places?category=life&q=集成榜单地点", {
      headers: {"x-device-id": "integration-ranking-cross-campus", "x-campus-id": "huayanbeilu"}
    })
    assert.ok(crossCampusView.body.items.some(item => item.id === submitted.item.id && item.campusName === "南院"))
    const crossCampusComments = await rawRequest(`/rankings/places/${submitted.item.id}/comments`, {
      headers: {"x-device-id": "integration-ranking-cross-campus", "x-campus-id": "huayanbeilu"}
    })
    assert.ok(crossCampusComments.body.items.some(item => item.id === commented.body.item.id))

    const crossSchoolViewer = await rawRequest("/me", {
      headers: {"x-tenant-id": "tstc", "x-campus-id": "daxuedao", "x-device-id": "integration-ranking-cross-school"}
    })
    await pool.query("update users set phone_verified_at=now() where id=$1", [crossSchoolViewer.body.user.id])
    const crossSchoolLike = await rawRequest(`/rankings/places/${submitted.item.id}/like`, {
      method: "POST",
      headers: {"x-tenant-id": "tstc", "x-campus-id": "daxuedao", "x-device-id": "integration-ranking-cross-school"}
    })
    assert.equal(crossSchoolLike.response.status, 404)
    const crossSchoolView = await rawRequest("/rankings/places?category=life", {
      headers: {"x-tenant-id": "tstc", "x-campus-id": "daxuedao", "x-device-id": "integration-ranking-cross-school"}
    })
    assert.ok(!crossSchoolView.body.items.some(item => item.id === submitted.item.id))

    const report = await rawRequest(`/rankings/places/${submitted.item.id}/reports`, {
      method: "POST",
      headers: {"x-device-id": "integration-ranking-reporter"},
      body: JSON.stringify({reason: "地点信息不准确", detail: "集成测试举报"})
    })
    assert.equal(report.response.status, 201)
    assert.equal(report.body.reported, true)
    const reports = await request("/admin/rankings/reports")
    const placeReport = reports.items.find(item => item.place_id === submitted.item.id)
    assert.ok(placeReport)
    await request(`/admin/rankings/reports/${placeReport.id}/resolve`, {method: "POST"})

    const duplicate = await rawRequest("/rankings/places", {
      method: "POST",
      body: JSON.stringify({
        category: "life",
        name: placeName,
        note: "重复地点应该被当前学校的去重约束拒绝",
        location: "大学西道校区另一个位置",
        imageUrl: "/campus-circle/api/uploads/ranking-place-b.jpg"
      })
    })
    assert.equal(duplicate.response.status, 409)

    const withdrawnPlace = await request("/rankings/places", {
      method: "POST",
      body: JSON.stringify({category: "life", name: `待撤回地点-${crypto.randomBytes(4).toString("hex")}`, note: "用于验证投稿人主动撤回审核中地点", location: "大学西道校区测试位置", imageUrl: "/campus-circle/api/uploads/ranking-place-c.jpg"})
    })
    await request(`/rankings/places/${withdrawnPlace.item.id}`, {method: "DELETE"})
    const placesAfterWithdraw = await request("/rankings/places?category=life")
    assert.ok(!placesAfterWithdraw.items.some(item => item.id === withdrawnPlace.item.id))

    const summary = await request("/me/summary")
    assert.ok(Number.isInteger(summary.counts.posts))
    assert.ok(Number.isInteger(summary.counts.messages))
    assert.ok(Number.isInteger(summary.counts.schedule))
    assert.ok(Number.isInteger(summary.counts.market))
    assert.ok(summary.activities.some(item => item.kind === "ranking" && item.detail === placeName && item.state === "已公开"))
  })

  test("home summary uses campus announcements, truthful weather, schedule, and package data", async () => {
    const me = await request("/me")
    await pool.query(
      "delete from campus_announcements where tenant_slug='tangshan' and campus_slug='daxuexidao' and title='集成测试公告'"
    )
    await pool.query(
      `insert into platform_admins(user_id,tenant_slug,role,status) values($1,'tangshan','school_admin','active')
       on conflict(user_id,tenant_slug) do update set campus_slug=null,role='school_admin',status='active'`,
      [me.user.id]
    )
    const announcement = await request("/admin/announcements", {
      method: "POST",
      body: JSON.stringify({
        title: "集成测试公告",
        content: "当前校区首页只应展示后台启用的真实公告",
        route: "/pages/messages/index",
        status: "active",
        priority: 80
      })
    })
    await request("/admin/home-status", {
      method: "PATCH",
      body: JSON.stringify({temperature: "26°", condition: "晴", note: "集成测试天气状态"})
    })
    await request("/schedule", {
      method: "POST",
      body: JSON.stringify({name: "首页聚合测试课程", time: "周一 10:10", room: "B-204", teacher: "测试老师"})
    })
    await request("/express/packages", {
      method: "POST",
      body: JSON.stringify({carrier: "集成快递", trackingNo: `IT${Date.now()}`, pickupCode: "A-01", station: "校内测试站"})
    })
    const phone = "13800138000"
    const codec = createPiiCodec(piiKey)
    await pool.query(
      `insert into express_bindings(user_id,tenant_slug,campus_slug,phone_encrypted,phone_hash,status,provider_status)
       values($1,'tangshan','daxuexidao',$2,$3,'active','active')
       on conflict(user_id,tenant_slug,campus_slug) do update set phone_encrypted=excluded.phone_encrypted,phone_hash=excluded.phone_hash,status='active',provider_status='active'`,
      [me.user.id, codec.encrypt(phone), hashIdentity(phone, identitySecret)]
    )
    const arrivalBody = JSON.stringify({eventId: `integration-${Date.now()}`, tenant: "tangshan", campus: "daxuexidao", phone, carrier: "自动同步快递", trackingNo: `AUTO${Date.now()}`, pickupCode: "C-03", station: "学校测试驿站"})
    const arrivalSignature = crypto.createHmac("sha256", expressWebhookSecret).update(arrivalBody).digest("hex")
    const arrival = await rawRequest("/integrations/express/arrival", {method: "POST", headers: {"x-express-signature": arrivalSignature}, body: arrivalBody})
    assert.equal(arrival.response.status, 202)
    assert.equal(arrival.body.matched, true)
    const syncedPackages = await request("/express/packages")
    assert.ok(syncedPackages.items.some(item => item.carrier === "自动同步快递" && item.pickup_code === "C-03"))
    const operatedPackage = await request("/admin/express/packages", {
      method: "POST",
      body: JSON.stringify({userId: me.user.id, carrier: "后台快递", trackingNo: `ADMIN${Date.now()}`, pickupCode: "B-02", station: "校内运营站"})
    })
    const adminPackages = await request("/admin/express/packages?status=waiting")
    assert.ok(adminPackages.items.some(item => item.id === operatedPackage.item.id && item.user_id === me.user.id))
    const summary = await request("/home/summary")
    assert.equal(summary.announcement.id, announcement.item.id)
    assert.equal(summary.announcement.content, "当前校区首页只应展示后台启用的真实公告")
    assert.equal(summary.weather.condition, "晴")
    assert.ok(summary.schedule.total >= 1)
    assert.ok(summary.express.pending >= 1)
    await request(`/admin/express/packages/${operatedPackage.item.id}`, {method: "PATCH", body: JSON.stringify({status: "picked"})})
    const pickedPackages = await request("/admin/express/packages?status=picked")
    assert.ok(pickedPackages.items.some(item => item.id === operatedPackage.item.id))

    const crossCampus = await rawRequest("/home/summary", {
      headers: {"x-device-id": "integration-home-cross-campus", "x-campus-id": "huayanbeilu"}
    })
    assert.equal(crossCampus.response.status, 200)
    assert.equal(crossCampus.body.announcement, null)
    assert.equal(crossCampus.body.weather, null)

    await request(`/admin/announcements/${announcement.item.id}`, {
      method: "PATCH",
      body: JSON.stringify({status: "archived"})
    })
    const archived = await request("/home/summary")
    assert.equal(archived.announcement, null)
  })

  test("campus service commerce, activity operations, errands, and anonymous chats form real campus-scoped loops", async () => {
    const me = await request("/me")
    await pool.query(
      `insert into platform_admins(user_id,tenant_slug,role,status) values($1,'tangshan','school_admin','active')
       on conflict(user_id,tenant_slug) do update set campus_slug=null,role='school_admin',status='active'`,
      [me.user.id]
    )

    const productName = `集成水果-${crypto.randomBytes(4).toString("hex")}`
    const product = await request("/admin/service/products", {
      method: "POST",
      body: JSON.stringify({serviceType: "fruit", name: productName, description: "真实库存订单闭环测试", priceCents: 1990, stock: 2})
    })
    const publicProducts = await request("/service/products?type=fruit")
    assert.ok(publicProducts.items.some(item => item.id === product.item.id && item.stock === 2))
    const crossCampusProducts = await rawRequest("/service/products?type=fruit", {
      headers: {"x-device-id": "integration-store-cross-campus", "x-campus-id": "huayanbeilu"}
    })
    assert.ok(!crossCampusProducts.body.items.some(item => item.id === product.item.id))

    const cancelledOrder = await request("/service/orders", {
      method: "POST",
      body: JSON.stringify({serviceType: "fruit", note: "集成测试订单", contactName: "测试同学", contactPhone: "13800138000", items: [{productId: product.item.id, quantity: 1}]})
    })
    assert.equal(cancelledOrder.item.total_amount_cents, 1990)
    assert.equal(cancelledOrder.payment.required, false)
    let adminProducts = await request("/admin/service/products?type=fruit")
    assert.equal(adminProducts.items.find(item => item.id === product.item.id).stock, 1)
    await request(`/service/orders/${cancelledOrder.item.id}/cancel`, {method: "POST"})
    adminProducts = await request("/admin/service/products?type=fruit")
    assert.equal(adminProducts.items.find(item => item.id === product.item.id).stock, 2)

    const activeOrder = await request("/service/orders", {
      method: "POST",
      body: JSON.stringify({serviceType: "fruit", contactName: "测试同学", contactPhone: "13800138000", items: [{productId: product.item.id, quantity: 1}]})
    })
    for (const status of ["confirmed", "preparing", "ready", "completed"]) {
      await request(`/admin/service/orders/${activeOrder.item.id}`, {method: "PATCH", body: JSON.stringify({status})})
    }
    const ownOrders = await request("/service/orders?type=fruit")
    assert.equal(ownOrders.items.find(item => item.id === activeOrder.item.id).status, "completed")

    const eventTitle = `集成校园活动-${crypto.randomBytes(4).toString("hex")}`
    const event = await request("/admin/events", {
      method: "POST",
      body: JSON.stringify({title: eventTitle, organizer: "集成测试组织", eventTime: "本周五 19:00", location: "大学生活动中心", description: "验证活动发布与停用闭环", capacity: 30})
    })
    const publicEvents = await request("/events")
    assert.ok(publicEvents.items.some(item => item.id === event.item.id))
    await request(`/admin/events/${event.item.id}`, {method: "PATCH", body: JSON.stringify({status: "inactive"})})
    const hiddenEvents = await request("/events")
    assert.ok(!hiddenEvents.items.some(item => item.id === event.item.id))

    const errand = await request("/errands", {
      method: "POST",
      body: JSON.stringify({title: "集成跑腿沟通", description: "验证接单前能够安全沟通", pickupPlace: "图书馆", deliveryPlace: "教学楼", reward: 5, deadline: "今天"})
    })
    const errandChat = await rawRequest("/conversations", {
      method: "POST",
      headers: {"x-device-id": "integration-errand-helper"},
      body: JSON.stringify({resourceType: "errand", resourceId: errand.item.id})
    })
    assert.equal(errandChat.response.status, 201)
    const claimedErrand = await rawRequest(`/errands/${errand.item.id}/claim`, {
      method: "POST",
      headers: {"x-device-id": "integration-errand-helper"}
    })
    assert.equal(claimedErrand.response.status, 200)
    const releasedErrand = await rawRequest(`/errands/${errand.item.id}/release`, {
      method: "POST",
      headers: {"x-device-id": "integration-errand-helper"}
    })
    assert.equal(releasedErrand.response.status, 200)
    assert.equal(releasedErrand.body.item.status, "open")
    const runnerClaim = await rawRequest(`/errands/${errand.item.id}/claim`, {
      method: "POST",
      headers: {"x-device-id": "integration-errand-runner"}
    })
    assert.equal(runnerClaim.response.status, 200)
    const runnerConfirmed = await rawRequest(`/errands/${errand.item.id}/complete`, {
      method: "POST",
      headers: {"x-device-id": "integration-errand-runner"}
    })
    assert.equal(runnerConfirmed.response.status, 200)
    assert.equal(runnerConfirmed.body.item.status, "claimed")
    const creatorConfirmed = await request(`/errands/${errand.item.id}/complete`, {method: "POST"})
    assert.equal(creatorConfirmed.item.status, "completed")

    const myProfile = await request("/match/profile", {method: "POST", body: JSON.stringify({interests: "摄影 自习", intro: "寻找同校自习搭子"})})
    const otherProfile = await rawRequest("/match/profile", {
      method: "POST",
      headers: {"x-device-id": "integration-match-peer"},
      body: JSON.stringify({interests: "摄影 羽毛球", intro: "周末喜欢在校园拍照"})
    })
    assert.equal(otherProfile.response.status, 200)
    const peerId = otherProfile.body.item.user_id
    await request(`/match/${peerId}/greet`, {method: "POST", body: JSON.stringify({message: "一起拍照吗"})})
    const accepted = await rawRequest(`/match/greetings/${myProfile.item.user_id}/respond`, {
      method: "POST",
      headers: {"x-device-id": "integration-match-peer"},
      body: JSON.stringify({status: "accepted"})
    })
    assert.equal(accepted.response.status, 200)
    assert.ok(accepted.body.conversationId)
    await rawRequest(`/conversations/${accepted.body.conversationId}/messages`, {
      method: "POST",
      headers: {"x-device-id": "integration-match-peer"},
      body: JSON.stringify({content: "可以，周末校园见"})
    })
    const matchMessages = await request(`/conversations/${accepted.body.conversationId}/messages`)
    assert.equal(matchMessages.conversation.resource_type, "match")
    assert.notEqual(matchMessages.items[0].sender_name, "校园同学")
    const inbox = await request("/conversations")
    assert.ok(inbox.items.some(item => item.id === accepted.body.conversationId && item.resource_type === "match" && item.resource_title === "匿名匹配"))
  })

  test("admin readiness exposes scoped operational blockers without exposing configuration secrets", async () => {
    const me = await request("/me")
    await pool.query(
      `insert into platform_admins(user_id,tenant_slug,role,status) values($1,'tangshan','school_admin','active')
       on conflict(user_id,tenant_slug) do update set campus_slug=null,role='school_admin',status='active'`,
      [me.user.id]
    )
    await request("/admin/settings", {
      method: "PATCH",
      body: JSON.stringify({operator_wechat: "integration-operator", operator_contact_note: "请注明校区与事项"})
    })
    const readiness = await request("/admin/readiness")
    assert.equal(readiness.tenant, "tangshan")
    assert.equal(readiness.campus, "daxuexidao")
    assert.ok(readiness.checks.some(item => item.id === "contact" && item.ready))
    assert.ok(readiness.checks.some(item => item.id === "lunch" && item.ready))
    assert.ok(readiness.checks.some(item => item.id === "payment" && !item.ready))
    assert.ok(readiness.checks.some(item => item.id === "notification" && !item.ready))
    assert.equal(JSON.stringify(readiness).includes("integration-operator"), false)
  })

  test("campus assistant returns only server-managed campus knowledge when no AI provider is configured", async () => {
    const answer = await request("/ai/ask", {method: "POST", body: JSON.stringify({question: "集成问答怎么处理？"})})
    assert.equal(answer.item.source, "集成知识库")
    assert.match(answer.item.answer, /已更新/)
    const unknown = await request("/ai/ask", {method: "POST", body: JSON.stringify({question: "完全未知的校园问题"})})
    assert.equal(unknown.item.mode, "unavailable")
  })
}
