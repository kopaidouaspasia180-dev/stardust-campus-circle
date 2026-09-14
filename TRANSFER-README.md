# 星尘校园圈跨电脑交接说明

本压缩包是可独立转交的完整项目，不依赖原电脑上的 `C:`、`F:` 盘文件。

## 项目定位

- 名称：星尘校园圈（Stardust）
- 前端：Taro 4 + React + TypeScript
- 输出：微信小程序与 H5
- 后端：Node.js + Express + PostgreSQL
- 已实现：校园外卖、二手交易、跑腿、快递、兼职、活动、课表、匿名匹配、论坛、失物、校园商店与生活服务

## 目录

- `src/`：前端源码
- `server/`：API 源码和 `schema.sql`
- `dist/`：已经构建好的微信小程序产物
- `dist-h5/`：已经构建好的 H5 产物
- `project.config.json`：微信开发者工具导入入口
- `docs/`：自动化 QA 和项目资料
- `HANDOFF-CONTEXT.md`：给新 Codex 的完整上下文

## 新电脑启动

要求安装 Node.js 20 或更高版本。

```powershell
npm.cmd install
npm.cmd --prefix server install
npm.cmd run build:weapp
npm.cmd run build:h5
```

微信开发者工具直接选择解压后的项目根目录。当前 `project.config.json` 使用 `touristappid`，正式发布前必须替换为企业小程序真实 AppID。

后端环境变量参考 `server/.env.example`。压缩包不包含线上密码、数据库密码、AppSecret 或支付密钥。

## 当前线上环境

- H5：https://stardust.sale/campus-circle/
- API 健康检查：https://stardust.sale/campus-circle/api/health
- 静态目录：`/var/www/stardust-campus-circle`
- API 目录：`/opt/stardust-campus-circle-api`
- PM2：`stardust-campus-circle-api`
- PostgreSQL：`stardust_campus_circle`

## 验证

```powershell
npm.cmd run build:h5
npm.cmd run build:weapp
npm.cmd --prefix server run check
node docs/qa-services.mjs
$env:QA_BASE='https://stardust.sale/campus-circle/'
node docs/qa-mobile.mjs
```

两套 QA 脚本会自动查找 Chrome、Edge 或 Chromium。若浏览器安装在非标准位置，
可通过 `QA_BROWSER` 指定可执行文件；通过 `QA_BASE` 指定待测 H5 地址。

不要覆盖工作区里的其他学校项目。不要把其他学校的二维码、API、内容或后台数据接入本项目。
