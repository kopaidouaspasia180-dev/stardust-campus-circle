import "dotenv/config"
import crypto from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import cors from "cors"
import express from "express"
import helmet from "helmet"
import multer from "multer"
import pg from "pg"

const {Pool} = pg
const port = Number(process.env.PORT || 4310)
const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) throw new Error("DATABASE_URL is required")

const pool = new Pool({connectionString: databaseUrl})
const uploadDir = process.env.UPLOAD_DIR || path.resolve("data/uploads")
fs.mkdirSync(uploadDir, {recursive: true})

const app = express()
app.disable("x-powered-by")
app.use(helmet({crossOriginResourcePolicy: {policy: "cross-origin"}}))
app.use(cors({
  origin(origin, callback) {
    if (!origin || origin === "https://stardust.sale" || /^http:\/\/127\.0\.0\.1:\d+$/.test(origin)) return callback(null, true)
    callback(new Error("origin not allowed"))
  }
}))
app.use(express.json({limit: "1mb"}))
app.use("/uploads", express.static(uploadDir, {maxAge: "7d", immutable: true}))

const storage = multer.diskStorage({
  destination: uploadDir,
  filename(_request, file, callback) {
    const ext = path.extname(file.originalname || "").toLowerCase()
    callback(null, `${Date.now()}-${crypto.randomBytes(8).toString("hex")}${ext}`)
  }
})
const upload = multer({
  storage,
  limits: {fileSize: 5 * 1024 * 1024},
  fileFilter(_request, file, callback) {
    callback(null, ["image/jpeg", "image/png", "image/webp"].includes(file.mimetype))
  }
})

const asyncRoute = handler => (request, response, next) => Promise.resolve(handler(request, response, next)).catch(next)

async function context(request, response, next) {
  const tenant = String(request.header("x-tenant-id") || "tangshan").trim()
  const deviceId = String(request.header("x-device-id") || "").trim()
  if (!/^[a-z0-9_-]{2,40}$/i.test(tenant)) return response.status(400).json({error: "invalid tenant"})
  if (!/^[a-z0-9_-]{8,100}$/i.test(deviceId)) return response.status(401).json({error: "device session required"})

  const tenantResult = await pool.query("select slug,name,status from tenants where slug=$1 and status='active'", [tenant])
  if (!tenantResult.rowCount) return response.status(404).json({error: "tenant not active"})
  const userResult = await pool.query(
    "insert into users(device_id) values($1) on conflict(device_id) do update set device_id=excluded.device_id returning id,nickname,avatar",
    [deviceId]
  )
  request.platform = {tenant, tenantName: tenantResult.rows[0].name, user: userResult.rows[0]}
  next()
}

function requireAdmin(request, response, next) {
  const expected = process.env.ADMIN_TOKEN
  const actual = request.header("x-admin-token")
  const expectedHash = crypto.createHash("sha256").update(expected || "").digest()
  const actualHash = crypto.createHash("sha256").update(actual || "").digest()
  if (!expected || !actual || !crypto.timingSafeEqual(expectedHash, actualHash)) {
    return response.status(401).json({error: "admin authorization required"})
  }
  next()
}

function text(value, max = 300) {
  return String(value || "").trim().slice(0, max)
}

function money(value) {
  const number = Number(value)
  if (!Number.isFinite(number) || number < 0 || number > 10000) throw Object.assign(new Error("invalid amount"), {status: 400})
  return Number(number.toFixed(2))
}

async function audit(client, platform, action, resourceType, resourceId, detail = {}) {
  await client.query(
    "insert into audit_logs(tenant_slug,user_id,action,resource_type,resource_id,detail) values($1,$2,$3,$4,$5,$6)",
    [platform.tenant, platform.user.id, action, resourceType, resourceId, detail]
  )
}

app.get("/health", asyncRoute(async (_request, response) => {
  await pool.query("select 1")
  response.json({ok: true, service: "stardust-campus-circle-api", version: "1.0.0"})
}))

app.use("/v1", asyncRoute(context))

app.get("/v1/takeout/merchants", asyncRoute(async (request, response) => {
  const result = await pool.query(
    `select m.id,m.name,m.category,m.description,m.delivery_minutes,m.min_order,
      coalesce(json_agg(json_build_object('id',p.id,'name',p.name,'description',p.description,'price',p.price,'category',p.category,'image_url',p.image_url,'stock',p.stock)
      order by p.id) filter(where p.id is not null),'[]') products
     from merchants m left join products p on p.merchant_id=m.id and p.status='active'
     where m.tenant_slug=$1 and m.status='active' group by m.id order by m.id`,
    [request.platform.tenant]
  )
  response.json({items: result.rows})
}))

app.get("/v1/orders", asyncRoute(async (request, response) => {
  const result = await pool.query(
    `select o.id,o.total_amount,o.status,o.pickup_note,o.created_at,m.name merchant_name,
      coalesce(json_agg(json_build_object('name',i.product_name,'price',i.unit_price,'quantity',i.quantity) order by i.id),'[]') items
     from orders o join merchants m on m.id=o.merchant_id join order_items i on i.order_id=o.id
     where o.tenant_slug=$1 and o.user_id=$2 group by o.id,m.name order by o.created_at desc limit 50`,
    [request.platform.tenant, request.platform.user.id]
  )
  response.json({items: result.rows})
}))

app.post("/v1/orders", asyncRoute(async (request, response) => {
  const items = Array.isArray(request.body.items) ? request.body.items : []
  if (!items.length || items.length > 30) return response.status(400).json({error: "order items required"})
  const normalized = items.map(item => ({productId: Number(item.productId), quantity: Math.max(1, Math.min(20, Number(item.quantity) || 1))}))
  const productIds = normalized.map(item => item.productId)
  const client = await pool.connect()
  try {
    await client.query("begin")
    const products = await client.query(
      `select p.id,p.name,p.price,p.stock,p.merchant_id from products p join merchants m on m.id=p.merchant_id
       where p.id=any($1::bigint[]) and p.status='active' and m.status='active' and m.tenant_slug=$2 for update`,
      [productIds, request.platform.tenant]
    )
    if (products.rowCount !== new Set(productIds).size) throw Object.assign(new Error("product unavailable"), {status: 400})
    const merchantIds = new Set(products.rows.map(item => String(item.merchant_id)))
    if (merchantIds.size !== 1) throw Object.assign(new Error("one merchant per order"), {status: 400})
    let total = 0
    const rows = normalized.map(item => {
      const product = products.rows.find(row => Number(row.id) === item.productId)
      if (!product || item.quantity > product.stock) throw Object.assign(new Error("insufficient stock"), {status: 400})
      total += Number(product.price) * item.quantity
      return {...item, product}
    })
    const order = await client.query(
      "insert into orders(tenant_slug,user_id,merchant_id,total_amount,pickup_note) values($1,$2,$3,$4,$5) returning id,total_amount,status,created_at",
      [request.platform.tenant, request.platform.user.id, [...merchantIds][0], total.toFixed(2), text(request.body.pickupNote, 120)]
    )
    for (const item of rows) {
      await client.query(
        "insert into order_items(order_id,product_id,product_name,unit_price,quantity) values($1,$2,$3,$4,$5)",
        [order.rows[0].id, item.product.id, item.product.name, item.product.price, item.quantity]
      )
    }
    await audit(client, request.platform, "create", "order", order.rows[0].id, {total})
    await client.query("commit")
    response.status(201).json({item: order.rows[0], payment: {enabled: false, message: "当前版本仅创建订单，不发起微信支付"}})
  } catch (error) {
    await client.query("rollback")
    throw error
  } finally {
    client.release()
  }
}))

app.get("/v1/market/listings", asyncRoute(async (request, response) => {
  const result = await pool.query(
    `select l.id,l.title,l.description,l.category,l.price,l.image_url,l.condition_label,l.status,l.created_at,
      u.nickname author,exists(select 1 from marketplace_favorites f where f.listing_id=l.id and f.user_id=$2) favorite
     from marketplace_listings l join users u on u.id=l.user_id
     where l.tenant_slug=$1 and l.status='active' order by l.created_at desc limit 100`,
    [request.platform.tenant, request.platform.user.id]
  )
  response.json({items: result.rows})
}))

app.post("/v1/market/listings", asyncRoute(async (request, response) => {
  const title = text(request.body.title, 60)
  const description = text(request.body.description, 500)
  if (title.length < 2 || description.length < 5) return response.status(400).json({error: "title and description required"})
  const result = await pool.query(
    `insert into marketplace_listings(tenant_slug,user_id,title,description,category,price,image_url,condition_label)
     values($1,$2,$3,$4,$5,$6,$7,$8) returning *`,
    [request.platform.tenant, request.platform.user.id, title, description, text(request.body.category, 30) || "其他", money(request.body.price), text(request.body.imageUrl, 500) || null, text(request.body.conditionLabel, 30) || "正常使用"]
  )
  await audit(pool, request.platform, "create", "market_listing", result.rows[0].id)
  response.status(201).json({item: result.rows[0]})
}))

app.post("/v1/market/listings/:id/favorite", asyncRoute(async (request, response) => {
  const found = await pool.query("select 1 from marketplace_favorites where listing_id=$1 and user_id=$2", [request.params.id, request.platform.user.id])
  if (found.rowCount) await pool.query("delete from marketplace_favorites where listing_id=$1 and user_id=$2", [request.params.id, request.platform.user.id])
  else await pool.query("insert into marketplace_favorites(listing_id,user_id) values($1,$2)", [request.params.id, request.platform.user.id])
  response.json({favorite: !found.rowCount})
}))

app.get("/v1/errands", asyncRoute(async (request, response) => {
  const result = await pool.query(
    `select e.*,u.nickname creator_name,(e.creator_id=$2) mine,(e.runner_id=$2) accepted_by_me
     from errands e join users u on u.id=e.creator_id where e.tenant_slug=$1
     order by case e.status when 'open' then 0 when 'claimed' then 1 else 2 end,e.created_at desc limit 100`,
    [request.platform.tenant, request.platform.user.id]
  )
  response.json({items: result.rows})
}))

app.post("/v1/errands", asyncRoute(async (request, response) => {
  const title = text(request.body.title, 60)
  const description = text(request.body.description, 500)
  const pickup = text(request.body.pickupPlace, 80)
  const delivery = text(request.body.deliveryPlace, 80)
  if (!title || description.length < 5 || !pickup || !delivery) return response.status(400).json({error: "incomplete errand"})
  const result = await pool.query(
    `insert into errands(tenant_slug,creator_id,title,description,pickup_place,delivery_place,reward,deadline)
     values($1,$2,$3,$4,$5,$6,$7,$8) returning *`,
    [request.platform.tenant, request.platform.user.id, title, description, pickup, delivery, money(request.body.reward), text(request.body.deadline, 60)]
  )
  await audit(pool, request.platform, "create", "errand", result.rows[0].id)
  response.status(201).json({item: result.rows[0]})
}))

app.post("/v1/errands/:id/claim", asyncRoute(async (request, response) => {
  const result = await pool.query(
    `update errands set runner_id=$1,status='claimed' where id=$2 and tenant_slug=$3 and status='open' and creator_id<>$1 returning *`,
    [request.platform.user.id, request.params.id, request.platform.tenant]
  )
  if (!result.rowCount) return response.status(409).json({error: "task unavailable"})
  await audit(pool, request.platform, "claim", "errand", request.params.id)
  response.json({item: result.rows[0]})
}))

app.post("/v1/errands/:id/complete", asyncRoute(async (request, response) => {
  const result = await pool.query(
    `update errands set status='completed' where id=$1 and tenant_slug=$2 and status='claimed' and (creator_id=$3 or runner_id=$3) returning *`,
    [request.params.id, request.platform.tenant, request.platform.user.id]
  )
  if (!result.rowCount) return response.status(409).json({error: "task cannot be completed"})
  response.json({item: result.rows[0]})
}))

app.get("/v1/express/packages", asyncRoute(async (request, response) => {
  const result = await pool.query(
    "select * from express_packages where tenant_slug=$1 and user_id=$2 order by created_at desc limit 100",
    [request.platform.tenant, request.platform.user.id]
  )
  response.json({items: result.rows})
}))

app.post("/v1/express/packages", asyncRoute(async (request, response) => {
  const carrier = text(request.body.carrier, 30)
  const tracking = text(request.body.trackingNo, 80)
  if (!carrier || tracking.length < 5) return response.status(400).json({error: "carrier and tracking number required"})
  const result = await pool.query(
    `insert into express_packages(tenant_slug,user_id,carrier,tracking_no,pickup_code,station,status)
     values($1,$2,$3,$4,$5,$6,$7) returning *`,
    [request.platform.tenant, request.platform.user.id, carrier, tracking, text(request.body.pickupCode, 40), text(request.body.station, 80) || "校内快递点", text(request.body.status, 20) || "waiting"]
  )
  response.status(201).json({item: result.rows[0], note: "快递状态由用户或学校运营方维护，未接第三方物流查询接口"})
}))

app.patch("/v1/express/packages/:id/picked", asyncRoute(async (request, response) => {
  const result = await pool.query(
    "update express_packages set status='picked' where id=$1 and tenant_slug=$2 and user_id=$3 returning *",
    [request.params.id, request.platform.tenant, request.platform.user.id]
  )
  if (!result.rowCount) return response.status(404).json({error: "package not found"})
  response.json({item: result.rows[0]})
}))

app.get("/v1/jobs", asyncRoute(async (request, response) => {
  const result = await pool.query(
    `select j.*,j.salary_text pay_label,''::text deadline,exists(select 1 from job_applications a where a.job_id=j.id and a.user_id=$2) applied
     from jobs j where j.tenant_slug=$1 and j.status='active' order by j.verified desc,j.created_at desc`,
    [request.platform.tenant, request.platform.user.id]
  )
  response.json({items: result.rows})
}))

app.post("/v1/jobs/:id/apply", asyncRoute(async (request, response) => {
  await pool.query(
    `insert into job_applications(job_id,user_id,message) values($1,$2,$3)
     on conflict(job_id,user_id) do update set message=excluded.message`,
    [request.params.id, request.platform.user.id, text(request.body.message, 300)]
  )
  response.json({applied: true})
}))

app.get("/v1/events", asyncRoute(async (request, response) => {
  const result = await pool.query(
    `select e.*,count(s.user_id)::int signup_count,
      exists(select 1 from event_signups mine where mine.event_id=e.id and mine.user_id=$2) signed
     from events e left join event_signups s on s.event_id=e.id
     where e.tenant_slug=$1 and e.status='active' group by e.id order by e.created_at desc`,
    [request.platform.tenant, request.platform.user.id]
  )
  response.json({items: result.rows})
}))

app.post("/v1/events/:id/signup", asyncRoute(async (request, response) => {
  const event = await pool.query("select capacity from events where id=$1 and tenant_slug=$2 and status='active'", [request.params.id, request.platform.tenant])
  if (!event.rowCount) return response.status(404).json({error: "event not found"})
  const count = await pool.query("select count(*)::int count from event_signups where event_id=$1", [request.params.id])
  if (event.rows[0].capacity > 0 && count.rows[0].count >= event.rows[0].capacity) return response.status(409).json({error: "event is full"})
  await pool.query("insert into event_signups(event_id,user_id) values($1,$2) on conflict do nothing", [request.params.id, request.platform.user.id])
  response.json({signed: true})
}))

app.get("/v1/community/posts", asyncRoute(async (request, response) => {
  const result = await pool.query(
    `select p.id,p.channel,p.tag,p.content,p.location,p.image_url,p.created_at,u.nickname author,u.avatar,
      count(distinct l.user_id)::int likes,
      exists(select 1 from community_likes mine where mine.post_id=p.id and mine.user_id=$2) liked,
      coalesce(json_agg(distinct jsonb_build_object('id',c.id,'user',cu.nickname,'content',c.content,'created_at',c.created_at))
        filter(where c.id is not null),'[]') comments
     from community_posts p join users u on u.id=p.user_id
     left join community_likes l on l.post_id=p.id
     left join community_comments c on c.post_id=p.id and c.status='active'
     left join users cu on cu.id=c.user_id
     where p.tenant_slug=$1 and p.status='active'
     group by p.id,u.nickname,u.avatar order by p.created_at desc limit 100`,
    [request.platform.tenant, request.platform.user.id]
  )
  response.json({items: result.rows})
}))

app.post("/v1/community/posts", asyncRoute(async (request, response) => {
  const content = text(request.body.content, 500)
  if (content.length < 5) return response.status(400).json({error: "content too short"})
  const channel = text(request.body.channel, 20) || "日常"
  const result = await pool.query(
    `insert into community_posts(tenant_slug,user_id,channel,tag,content,location,image_url)
     values($1,$2,$3,$4,$5,$6,$7) returning id,channel,tag,content,location,image_url,created_at`,
    [request.platform.tenant,request.platform.user.id,channel,channel==="推荐"?"校园日常":channel,content,text(request.body.location,60)||request.platform.tenantName,text(request.body.imageUrl,500)||null]
  )
  await audit(pool,request.platform,"create","community_post",result.rows[0].id)
  response.status(201).json({item:result.rows[0]})
}))

app.post("/v1/community/posts/:id/like", asyncRoute(async (request, response) => {
  const found=await pool.query("select 1 from community_likes where post_id=$1 and user_id=$2",[request.params.id,request.platform.user.id])
  if(found.rowCount) await pool.query("delete from community_likes where post_id=$1 and user_id=$2",[request.params.id,request.platform.user.id])
  else await pool.query("insert into community_likes(post_id,user_id) values($1,$2)",[request.params.id,request.platform.user.id])
  response.json({liked:!found.rowCount})
}))

app.post("/v1/community/posts/:id/comments", asyncRoute(async (request,response)=>{
  const content=text(request.body.content,150)
  if(!content)return response.status(400).json({error:"comment required"})
  const result=await pool.query(
    "insert into community_comments(post_id,user_id,content) values($1,$2,$3) returning id,content,created_at",
    [request.params.id,request.platform.user.id,content]
  )
  response.status(201).json({item:result.rows[0]})
}))

app.get("/v1/service/requests", asyncRoute(async (request,response)=>{
  const serviceType=text(request.query.type,30)
  const result=await pool.query(
    `select id,service_type,title,detail,status,created_at,(user_id=$2) mine
     from service_requests where tenant_slug=$1 and ($3='' or service_type=$3)
     order by created_at desc limit 80`,
    [request.platform.tenant,request.platform.user.id,serviceType]
  )
  response.json({items:result.rows})
}))

app.post("/v1/service/requests", asyncRoute(async (request,response)=>{
  const serviceType=text(request.body.serviceType,30),title=text(request.body.title,60),detail=text(request.body.detail,400)
  if(!serviceType||title.length<2||detail.length<5)return response.status(400).json({error:"incomplete service request"})
  const result=await pool.query(
    "insert into service_requests(tenant_slug,user_id,service_type,title,detail) values($1,$2,$3,$4,$5) returning *",
    [request.platform.tenant,request.platform.user.id,serviceType,title,detail]
  )
  await audit(pool,request.platform,"create","service_request",result.rows[0].id)
  response.status(201).json({item:result.rows[0]})
}))

app.get("/v1/match/candidates", asyncRoute(async (request,response)=>{
  const result=await pool.query(
    `select p.user_id,p.anonymous_name,p.interests,p.intro,
      exists(select 1 from match_greetings g where g.tenant_slug=p.tenant_slug and g.sender_id=$2 and g.target_id=p.user_id) greeted
     from match_profiles p where p.tenant_slug=$1 and p.user_id<>$2 and p.status='active'
     order by p.updated_at desc limit 30`,
    [request.platform.tenant,request.platform.user.id]
  )
  response.json({items:result.rows})
}))

app.post("/v1/match/profile", asyncRoute(async (request,response)=>{
  const interests=text(request.body.interests,100),intro=text(request.body.intro,240)
  if(interests.length<2||intro.length<5)return response.status(400).json({error:"complete profile required"})
  const names=["星河同学","晚风同学","小岛同学","云朵同学","青柠同学","月光同学"]
  const anonymousName=names[Number(request.platform.user.id)%names.length]
  const result=await pool.query(
    `insert into match_profiles(tenant_slug,user_id,anonymous_name,interests,intro) values($1,$2,$3,$4,$5)
     on conflict(tenant_slug,user_id) do update set interests=excluded.interests,intro=excluded.intro,status='active',updated_at=now()
     returning *`,
    [request.platform.tenant,request.platform.user.id,anonymousName,interests,intro]
  )
  response.json({item:result.rows[0]})
}))

app.post("/v1/match/:userId/greet", asyncRoute(async (request,response)=>{
  if(Number(request.params.userId)===Number(request.platform.user.id))return response.status(400).json({error:"cannot greet yourself"})
  await pool.query(
    `insert into match_greetings(tenant_slug,sender_id,target_id,message) values($1,$2,$3,$4)
     on conflict(tenant_slug,sender_id,target_id) do update set message=excluded.message,created_at=now()`,
    [request.platform.tenant,request.platform.user.id,request.params.userId,text(request.body.message,120)||"想和你认识一下"]
  )
  response.json({greeted:true})
}))

app.post("/v1/uploads", upload.single("file"), (request, response) => {
  if (!request.file) return response.status(400).json({error: "image required"})
  response.status(201).json({url: `/campus-circle/api/uploads/${request.file.filename}`})
})

app.get("/v1/admin/stats", requireAdmin, asyncRoute(async (request, response) => {
  const tenant = text(request.query.tenant, 40) || "tangshan"
  const [orders, listings, errands, packages] = await Promise.all([
    pool.query("select count(*)::int count from orders where tenant_slug=$1", [tenant]),
    pool.query("select count(*)::int count from marketplace_listings where tenant_slug=$1", [tenant]),
    pool.query("select count(*)::int count from errands where tenant_slug=$1", [tenant]),
    pool.query("select count(*)::int count from express_packages where tenant_slug=$1", [tenant])
  ])
  response.json({tenant, orders: orders.rows[0].count, listings: listings.rows[0].count, errands: errands.rows[0].count, packages: packages.rows[0].count})
}))

app.use((error, _request, response, _next) => {
  console.error(error)
  response.status(error.status || 500).json({error: error.status ? error.message : "internal server error"})
})

const server = app.listen(port, "127.0.0.1", () => console.log(`stardust campus circle api listening on ${port}`))

async function shutdown() {
  server.close()
  await pool.end()
  process.exit(0)
}
process.on("SIGTERM", shutdown)
process.on("SIGINT", shutdown)
