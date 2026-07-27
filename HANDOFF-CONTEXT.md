# 给下一位 Codex 的工作上下文

继续开发本目录中的“星尘校园圈”，不要重新建项目。

## 当前状态

产品已经从新生助手升级为大学生日常校园生态系统。首页包含学校/校区切换、今日校园、8 个自定义常用功能、校园论坛信息流、榜单和悬浮 AI。底部导航为：首页、校园服务、校园圈、榜单、我的。

前端业务页面已经接入真实 API：

- 外卖：菜单、购物车、下单、订单记录
- 二手：发布、图片、收藏、校内交易
- 跑腿：发布、其他账号接单、完成
- 快递：运单、取件码、驿站、已取状态
- 兼职：核验岗位与申请
- 活动：详情与报名
- 课表：本机课程管理
- 匿名匹配：资料、候选人、匿名招呼
- 校园论坛：发帖、图片、点赞、评论、频道
- 校园花店、水果、零食、生活服务：需求提交和记录
- 失物招领：论坛失物频道
- 二手电动车：二手交易分类

数据库结构见 `server/schema.sql`。API 根据 `x-tenant-id` 和 `x-device-id` 隔离学校与设备用户。预留租户为 `tangshan`、`stdu`、`lyit`。

## 线上

- 网站：https://stardust.sale/campus-circle/
- API：https://stardust.sale/campus-circle/api/
- SSH：`stardust-server`
- 静态目录：`/var/www/stardust-campus-circle`
- API 目录：`/opt/stardust-campus-circle-api`
- 上传目录：`/var/lib/stardust-campus-circle/uploads`
- PM2：`stardust-campus-circle-api`
- 端口：`4310`
- 数据库：`stardust_campus_circle`

最近验证结果：H5 和微信小程序构建通过；10 个业务页面在 390×844 手机视口无横向溢出、无控制台错误；网站和 API HTTPS 均为 200；PM2 online；`nginx -t` successful。

## 仍需外部资料

正式上架需要真实企业小程序 AppID、AppSecret，并在微信公众平台配置 `https://stardust.sale` 为 request/uploadFile 合法域名。真实支付还需要微信支付商户号、证书和 API v3 密钥。当前订单后端可用，但没有伪造微信支付。

## 开发约束

1. 保留现有修改和多租户隔离。
2. 不修改或覆盖其他学校项目。
3. 没有第三方凭据时，不能把手动快递状态描述成实时物流，也不能伪造支付。
4. 任何部署都先备份，只更新 `/campus-circle/`。
5. 部署后验证 H5、小程序构建、API、PM2、`nginx -t` 和 HTTPS。
