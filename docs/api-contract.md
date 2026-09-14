# 多租户校园生态 API 契约

## 基本规则

- API 根路径：线上为 `/campus-circle/api/v1`，服务进程内部路由前缀为 `/v1`。
- 学生登录使用微信 `code` 换取平台会话。
- 服务端从会话读取用户 ID，从请求头 `X-Tenant-Id` 读取当前高校，再验证用户是否有权访问。
- 管理端的租户 ID 由管理员会话绑定，不能仅信任客户端传值。
- 学生端每个业务请求必须携带 `X-Tenant-Id`、`X-Campus-Id` 和有效会话；服务端不能只依赖客户端筛选。
- 管理写操作写入包含高校、校区、操作人、资源和详情的审计日志。

## 学生端

### 高校与校区

- `GET /tenants`：可用高校列表。
- `GET /tenants/:tenantId/bootstrap`：高校主题、校区、功能开关和首页配置。
- `PUT /me/context`：保存默认高校和校区。

### 首页与指南

- `GET /home/summary`：聚合当前用户的启用公告、下一节课/今日日程、待取快递数量和后台维护的天气状态；没有真实数据时返回空值，不填充演示内容。
- `GET /feed/home`：当前高校通知、活动、热门内容和服务推荐。
- `GET /places`：校园地点与地图导航点。
- `GET /guides`：校园指南分类和条目。
- `GET /media`：当前高校校园实景。

### 社区

- `GET /posts`：当前高校帖子列表。
- `POST /posts`：发帖。
- `POST /posts/:id/comments`：评论。
- `POST /posts/:id/like`：点赞。
- `POST /reports`：举报帖子、评论或用户。

### 校园服务

- `GET /services`：当前高校服务模块。
- `GET /merchants`：当前高校商家。
- `GET /offers`：优惠券和活动。
- `POST /orders`：创建订单。
- `GET /service/products?type=fruit|flowers|snacks`：当前校区水果店、花店或零食店的在售商品与真实库存。
- `GET /service/orders?type=...`、`POST /service/orders`、`POST /service/orders/:id/cancel`：当前用户的校园商店订单；提交扣库存，取消恢复库存，未配置支付时不会伪造已支付。花店订单额外支持 `desiredDate`、`desiredTime` 和 `giftMessage`，供预约履约和花卡制作使用。
- `GET /events`、`POST /events/:id/signup`：当前校区活动与报名。
- `GET /errands`、`POST /errands`、`POST /errands/:id/claim`、`POST /errands/:id/release`、`POST /errands/:id/complete`：校园跑腿发布、接单、接单人未交接前放回大厅与双方确认完成。
- `GET /express/packages`、`POST /express/packages`、`PATCH /express/packages/:id/picked`：当前用户的快递记录；第三方物流未开放数据接口时由用户或运营维护。
- `GET /market/listings`、`POST /market/listings`、`POST /market/listings/:id/favorite`、`PATCH /market/listings/:id/status`：当前校区二手车源与普通闲置；列表支持 `favorites`、`history`、`mine` 范围，返回收藏量、浏览量和当前用户交易意向；电动车额外保存 `vehicleBrand`、`vehicleRangeKm`、`batteryYear`、`registrationStatus`，发布后统一进入人工审核。
- `POST /market/listings/:id/view`、`GET /market/trade-intents`、`POST /market/listings/:id/trade-intents`、`PATCH /market/trade-intents/:id`：记录校内闲置浏览足迹并完成“想要—卖家保留—完成/取消”的当面交易状态流转，始终按高校与校区隔离。
- `GET /market/inspection-appointments`、`POST /market/listings/:id/inspection-appointments`、`PATCH /market/inspection-appointments/:id`：二手电动车验车预约；买家发起，车主确认/完成，双方可在交接前取消，且只允许当前高校与校区双方访问。

### 校园圈

- `GET /community/posts`：读取当前高校与校区已公开帖子；`mine=1` 时返回当前用户自己的审核中、已通过和已撤回记录。
- `GET /community/posts/:id`：读取当前校区公开帖子，或允许作者查看自己的审核状态。
- `POST /community/posts`：发布校园动态，支持 `channel`、`tag`、`content`、`location`、兼容首图字段 `imageUrl` 和最多三张的 `imageUrls`；图片必须来自可信上传地址，内容进入安全检查与人工审核。
- `DELETE /community/posts/:id`：作者撤回自己的帖子。
- `POST /community/posts/:id/like`：仅对当前高校、当前校区已公开帖子点赞或取消点赞。
- `POST /community/posts/:id/comments`、`DELETE /community/comments/:id`：发表评论及删除自己的评论。
- `POST /community/posts/:id/reports`、`POST /community/comments/:id/reports`：举报帖子或评论并进入当前校区运营队列。
- 数据迁移 `021_community_post_images.sql` 新增 `community_posts.image_urls jsonb`，最多保存三张图片；上线前必须先执行迁移。

### 校园榜单

- `GET /rankings/lists`：读取本校系统榜单、已公开的学生榜单，以及当前用户自己的待审核/未通过榜单；不同学校严格隔离。
- `POST /rankings/lists`：手机号登录学生提交榜单名称、说明、参榜项目称呼和可信封面，提交后进入本校管理员审核，不直接公开。
- `DELETE /rankings/lists/:id`：创建人撤回自己的待审核或未通过榜单。
- `GET /rankings/places?list=<榜单ID>&sort=top|week|new`：读取当前学校指定榜单的公开参榜内容，返回真实点赞、收藏和评论数。
- `POST /rankings/places`：学生向已公开榜单提交参榜内容，必须包含 `listId`、准确名称、发现位置、上榜理由和可信上传地址；提交后进入人工审核。
- `POST /rankings/places/:id/like`：对本校公开参榜内容点赞或取消点赞，服务端返回更新后的真实计数。
- `DELETE /rankings/places/:id`：投稿人撤回自己的待审核或未通过内容；运营下架使用管理端权限和审计流程。
- `POST /rankings/places/:id/reports`：举报参榜信息、图片或不实内容，进入本校运营队列。
- 本地 `demo=1` 只用于视觉验收，必须显示“本地演示”且禁止写入点赞；生产环境不得用固定赞数或虚构地点替代 API 失败。

### 校内沟通

- `POST /conversations`：为当前校区的二手商品、学生兼职、失物招领、跑腿或匿名匹配创建/复用会话。
- `GET /conversations`：当前用户在当前校区的会话列表与未读数。
- `POST /conversations/read-all`：将当前用户在当前高校、当前校区收到的未读会话消息全部标记已读，不影响其他用户或校区。
- `GET /conversations/:id/messages`：读取会话消息并更新已读时间。
- `POST /conversations/:id/messages`：发送文本消息；参与者、资源与校区必须一致。
- `POST /conversations/:id/reports`：举报会话或资源，进入当前校区运营队列。
- `POST /conversations/:id/close`：任一参与者结束当前会话；再次从同一资源发起沟通时可恢复原会话。
- `GET /messages`：读取当前用户的订单进度和校园互动通知；返回 `resource_id` 供客户端进入对应订单或帖子详情。

### 学生兼职发布

- `GET /job-postings/mine`：当前用户在当前校区的发布单。
- `POST /job-postings`：保存发布单草稿，固定服务费 1000 分。
- `POST /job-postings/:id/payment-intent`：生成微信 JSAPI 支付参数；支付未配置时明确失败，不改变订单状态。
- `GET /job-postings/:id/contact`：仅支付成功后返回当前校区运营联系方式。
- `POST /job-postings/:id/cancel`：取消未进入审核或发布流程的订单。

### 校区运营联系方式

- `GET /campus/contact?purpose=ebike`：在当前校区开放时返回二手电动车运营联系方式。

### AI

- `POST /ai/ask`：根据当前 `tenant_id` 优先匹配校园知识库，未命中时统一调用 DeepSeek。
- 当租户未启用远程模型时，仅返回本地知识库匹配结果。
- 任何租户都不能读取其他学校的提示词、密钥、联系人或知识库。

## 平台总后台

- `POST /platform/tenants`：创建高校。
- `PATCH /platform/tenants/:id`：套餐、状态、功能和品牌配置。
- `POST /platform/tenants/:id/admins`：创建学校负责人。
- `GET /platform/metrics`：平台级统计。

## 学校后台

- `GET /admin/dashboard`
- `CRUD /admin/guides`
- `CRUD /admin/media`
- `CRUD /admin/places`
- `CRUD /admin/notices`
- `CRUD /admin/services`
- `CRUD /admin/merchants`
- `GET /admin/moderation/queue`
- `POST /admin/moderation/:id/decision`
- `CRUD /admin/staff`

当前实现的统一运营后台接口：

- `GET /admin/context`：当前学校、校区、可切换校区和权限。
- `GET /admin/stats`：严格按当前校区统计。
- `GET /admin/users`、`GET /admin/roles`、`POST /admin/roles`、`PATCH /admin/roles/:userId`：用户和最小权限角色管理。
- `GET /admin/settings`、`PATCH /admin/settings`：当前校区运营微信、二维码、联系说明和功能开关。
- `GET /admin/announcements`、`POST /admin/announcements`、`PATCH /admin/announcements/:id`：首页公告创建、启用和归档。
- `GET /admin/home-status`、`PATCH /admin/home-status`：首页天气与出行提示维护。
- `GET /admin/service/products`、`POST /admin/service/products`、`PATCH /admin/service/products/:id`：校园水果店、花店和零食店商品、价格、库存与上下架。
- `GET /admin/service/orders`、`PATCH /admin/service/orders/:id`：校园商店订单确认、备货、就绪、完成与取消，取消时恢复库存。
- `GET /admin/events`、`POST /admin/events`、`PATCH /admin/events/:id`：活动创建、报名统计与启停。
- `GET /admin/express/packages`、`POST /admin/express/packages`、`PATCH /admin/express/packages/:id`：按当前校区为指定用户录入和更新快递状态。
- `GET /admin/community/posts`、`POST /admin/community/posts/:id/review`：校园圈审核。
- `GET /admin/market/listings`、`PATCH /admin/market/listings/:id`：二手内容管理。
- `GET /admin/jobs/posting-orders`、`POST /admin/jobs/posting-orders/:id/contacted`、`POST /admin/jobs/posting-orders/:id/review`：兼职付费发布闭环。
- `GET /admin/conversation-reports`、`POST /admin/conversation-reports/:id/resolve`：处理举报或冻结会话。
- `GET /admin/audit-logs`：当前权限和数据范围内的审计日志。

## 商家后台

- `GET /merchant/profile`
- `CRUD /merchant/products`
- `GET /merchant/orders`
- `POST /merchant/orders/:id/accept`
- `POST /merchant/orders/:id/complete`

## 仍禁止或尚未开放

- 禁止跨高校、跨校区私信；客户端传入其他校区不能绕过服务端数据边界。
- 微信支付代码已具备下单、回调与退款状态机，但没有正式商户号、证书、API v3 密钥时不得启用真实交易。
- 不开放未经审核的商家或学生兼职直接公开。
- 不把 720 云直接作为核心地图，只保留外部 VR 入口。
