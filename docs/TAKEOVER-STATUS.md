# 接管状态（2026-07-27）

## 已完成

- 交接包已完整导入当前 Git 仓库根目录，中文文件名正常。
- 根目录与 `server/` 依赖已安装。
- 修复了交接包遗漏的主页及底部导航 PNG 图标，共 25 个。
- `npm run typecheck` 通过。
- `npm --prefix server run check` 通过。
- `npm run build:weapp` 通过。
- `npm run build:h5` 通过。

统一验证命令：

```bash
npm run check
```

## 已确认的系统边界

- 前端：Taro 4、React、TypeScript，输出微信小程序和 H5。
- 后端：Node.js、Express、PostgreSQL。
- 数据通过 `x-tenant-id` 和 `x-device-id` 隔离；预留租户为 `tangshan`、`stdu`、`lyit`。
- API 当前使用设备 ID 会话，不等同于正式微信登录。
- 订单创建已实现，但微信支付尚未接入。
- 快递状态由用户或运营方维护，不是第三方实时物流。

## 发布前阻塞项

1. 企业小程序 AppID 与 AppSecret。
2. 微信公众平台合法域名配置：`https://stardust.sale`。
3. 微信登录与服务端会话。
4. 社区文本/图片审核、举报、封禁及审计闭环。
5. 隐私协议、用户信息用途说明和相关上架材料。
6. 如需真实支付：微信支付商户号、证书与 API v3 密钥。

## 已知技术债

- `docs/qa-mobile.mjs` 与 `docs/qa-services.mjs` 写死 Windows Edge 路径，Mac 上不能直接执行。
- H5 首屏构建资源约 331 KiB，Pacifico 字体约 245 KiB，Webpack 给出体积警告。
- 当前锁定依赖的 `npm audit` 报告包含 54 项漏洞（16 moderate、29 high、9 critical），需要按生产可达性逐项评估，不能直接使用 `npm audit fix --force`。
- `project.config.json` 仍使用 `touristappid`，只适合本地预览。

## 线上信息

- H5：`https://stardust.sale/campus-circle/`
- 健康检查：`https://stardust.sale/campus-circle/api/health`
- 本次接管未修改或部署线上环境；当前沙箱 DNS 无法解析该域名，因此线上状态尚未在本机复核。
