# 多租户校园生态 API 契约

## 基本规则

- API 根路径：`/campus-platform/api/v1`
- 学生登录使用微信 `code` 换取平台会话。
- 服务端从会话读取用户 ID，从请求头 `X-Tenant-Id` 读取当前高校，再验证用户是否有权访问。
- 管理端的租户 ID 由管理员会话绑定，不能仅信任客户端传值。
- 所有写操作写入审计日志。

## 学生端

### 高校与校区

- `GET /tenants`：可用高校列表。
- `GET /tenants/:tenantId/bootstrap`：高校主题、校区、功能开关和首页配置。
- `PUT /me/context`：保存默认高校和校区。

### 首页与指南

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

### AI

- `POST /ai/ask`：根据当前 `tenant_id` 选择知识库和模型配置。
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

## 商家后台

- `GET /merchant/profile`
- `CRUD /merchant/products`
- `GET /merchant/orders`
- `POST /merchant/orders/:id/accept`
- `POST /merchant/orders/:id/complete`

## 首期不接入

- 不接微信支付。
- 不开放跨校私信。
- 不开放未经审核的商家自助入驻。
- 不把 720 云直接作为核心地图，只保留外部 VR 入口。
