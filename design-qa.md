# 首页方案 1 设计验收

## 对照基线

- source visual truth path: `/Users/a/.codex/generated_images/019fa443-4451-7cf2-91e1-61f70ff8356c/exec-76323cad-48e6-4a53-85fe-ee4007598c71.png`
- implementation screenshot path: `/Users/a/.codex/worktrees/7417/校园ai助手/.codex-artifacts/home-option1-390x844-final-v3.png`
- combined comparison path: `/Users/a/.codex/worktrees/7417/校园ai助手/.codex-artifacts/home-option1-comparison.png`
- viewport: 390 × 844 CSS px
- source pixels: 853 × 1844；归一化为 390 × 844
- implementation pixels: 390 × 844；CSS viewport 390 × 844；deviceScaleFactor 1
- state: 唐山学院 / 大学西道校区；无下一节课；天气待同步；0 个待取快递；0 节课程；生产数据为空的校园圈空状态

说明：设计稿是有校园圈示例数据的填充态，浏览器实现使用当前真实本地数据，因此为无帖子空状态。该状态差异不用于判断帖子图片与文案的像素一致性。微信右上角胶囊属于平台系统 UI，代码中不重复绘制。

## Full-view comparison evidence

在 `home-option1-comparison.png` 中以同一 390 × 844 画布对照了完整首屏。实现保留了方案 1 的五段层级：紧凑校区头部、蓝色下一节课主卡、三列今日摘要、四个首要校园服务、校园圈入口与固定五项底栏。首屏无横向溢出，底栏未遮挡主操作。

## Required fidelity surfaces

- Fonts and typography: 使用小程序系统中文字体栈；课程标题 30px/900，分区标题 24px/900，服务标题 15px，摘要标签 10–11px。无异常换行；摘要值和说明均做单行截断。
- Spacing and layout rhythm: 20px 页面边距，24px 主卡圆角，22px 摘要卡圆角；主卡、摘要、服务和校园圈的纵向节奏与方案一致。原稿系统胶囊占位未进入业务布局。
- Colors and visual tokens: 主色保持 #187BE9 系列蓝色渐变；白色底、浅灰分割线、蓝色链接和低对比说明文字与目标一致。
- Image quality and asset fidelity: 服务入口继续使用项目内 110×110 高清 PNG 图标；摘要使用项目现有 SVG 图标库；课程主卡使用同一图标库的日历装饰，不使用表情或占位方块。
- Copy and content: 保留真实功能文案与数据状态；课程、天气、快递、日程、服务和校园圈入口均与产品功能对应。

## Focused region evidence

未额外制作局部裁切：归一化后的 780 × 844 并排图在 100% 下能清楚检查课程主卡、三列摘要、四个服务图标、分区标题和底栏；这些区域的最小检查文字为 10px，未出现不可辨认的关键控件。

## Comparison history

### Iteration 1

- Earlier finding [P1]: H5 中摘要栏子节点选择器未命中 Taro 自定义元素，三列文字按单字换行，卡片高度由目标约 112px 膨胀到 279px。
- Fix: 为摘要标题、数值、单位、说明增加独立 class，并改为明确的 flex/grid 布局与单行截断。
- Post-fix evidence: `home-option1-390x844-v2.png`；摘要栏恢复为 112px，三列信息可读。

### Iteration 2

- Earlier finding [P2]: 原 PNG 摘要图标透明画布内容异常小；课程主卡缺少目标中的右侧日历装饰，视觉重心偏左。
- Fix: 摘要改用项目现有 SVG 图标库；主卡加入同源日历装饰；同时把主卡高度和内部间距压缩到更接近方案 1 的首屏比例。
- Post-fix evidence: `home-option1-390x844-final-v3.png`；图标清晰，主卡视觉平衡，校园圈入口进入首屏。

## Findings

- No actionable P0/P1/P2 findings remain.
- P3: 本地真实数据为空时，校园圈只展示空状态；有帖子后会切换为图片与摘要预览。上线前可再用一条已审核真实帖子复核填充态。

## Primary interactions tested

- “导入课表”进入 `/pages/schedule/index`
- “全部服务”进入 `/pages/services/index`
- “去校园圈”进入 `/pages/community/index`
- Chrome 控制台 error 数量：0

## Implementation checklist

- [x] 首屏层级与方案 1 一致
- [x] 390 × 844 无横向溢出
- [x] 真实功能入口可点击
- [x] 摘要栏无异常换行
- [x] H5 浏览器控制台无错误
- [x] 微信小程序构建与包体检查在最终交付前执行

final result: passed

---

# 校园外卖方案 1 设计验收

## 对照基线

- source visual truth path: `/Users/a/.codex/generated_images/019fa443-4451-7cf2-91e1-61f70ff8356c/exec-29d31d7b-45cf-4e70-8128-65102886ae0b.png`
- implementation screenshot path: `/tmp/takeout-implemented-final.jpg`
- combined comparison path: `/tmp/takeout-design-comparison-final.png`
- viewport: 430 × 747 CSS px
- source pixels: 853 × 1844；对照时按 430px 宽等比缩放并截取同高首屏
- implementation pixels: 外部 Chrome 视口 1512 × 747；校园外卖容器 430 × 747
- state: 唐山学院·南院；2026-09-01 今日菜单；本地 QA 真实风格菜单 5 款；购物车 2 件 / ¥31.8

## Full-view comparison evidence

并排图同时展示了方案 1 与实现首屏。实现对齐了紧凑标题、校区选择、下单时间/送达状态条、7 日选择、横向主推餐品、文字分类、连续菜单列表、白色悬浮购物车和三项底部导航。用户要求的“仅校内外送”与“上午 10:30 前下单”作为功能性差异，在状态条下方额外显式提示。

## Required fidelity surfaces

- Fonts and typography: 系统中文字体栈，主标题 29px，区块标题 24px，餐品标题 17–20px，价格使用高权重蓝色字。
- Spacing and layout rhythm: 16px 页边距，18px 主要圆角，状态、日期、主推、分类与菜单的纵向节奏与方案一致。
- Colors and visual tokens: 使用 `#1476F2` 主蓝、`#F5F9FF` 浅蓝背景、白色卡片、浅蓝灰边线和低对比说明文字。
- Image quality and asset fidelity: 主推和菜单使用项目内真实餐品图，不使用表情符号或纯色占位图。
- Copy and content: 保留真实校区、商家、价格、配送时间和菜单状态；正式数据仍由接口提供。

## Comparison history

- Earlier finding [P1]: H5 中 `button[disabled]` 同时匹配 `disabled="false"`，导致有效加购按钮显示为灰色。
- Fix: 选择器改为 `button[disabled="true"]`，有效餐品加购按钮恢复主蓝色。
- Post-fix evidence: 加购 2 件后购物车显示 `¥31.8`，与方案状态匹配。

## Primary interactions tested

- 主推餐品连续加购：购物车数量与金额实时更新。
- “盖饭”分类：列表按真实分类筛选，主推餐品保持展示。
- 切换明日：标题切换为“预约午餐”并重新请求当日菜单。
- 外部 Chrome 控制台 error/warn：0。
- 结算保持真实手机号登录门禁，QA 未绕过身份状态；源码与服务端都已固定为 `delivery`。

## Findings

- No actionable P0/P1/P2 findings remain.
- P3: 方案中的时间图标为圆形时钟，实现复用项目现有日历时间图标；不影响语义、操作和上线。

final result: passed

---

# 全量页面与包体最终验收

## 验收范围

- 微信小程序 `dist/app.json` 中登记的 30 个页面全部纳入 390 × 844 自动化回归。
- 校园服务覆盖外卖、二手、跑腿、快递、兼职、活动、课表、匿名匹配、水果、鲜花、零食、失物招领、电动车及服务聚合页。
- 校园圈、榜单、投稿、消息、聊天、个人中心、规则页、新生页与外卖商家/骑手/运营子页面均纳入同一轮检查。

## 最终证据

- `npm run qa:services`：14 个服务场景均可见，横向溢出为 0，控制台错误为 0。
- `npm run qa:mobile`：首页、校园圈、悬浮发布入口及五项底部导航通过 390 × 844 验证。
- `npm run qa:all-pages`：30/30 页面可渲染，30/30 页面无横向溢出，运行错误与页面异常均为 0。
- `npm run check`：TypeScript、服务端语法、微信小程序构建、包体检查和 H5 构建全部通过。
- 服务端单元测试共 37 项，36 项通过，1 项 PostgreSQL 集成测试因未提供测试数据库而按设计跳过，无失败项。
- 12 个高频服务图标改用 88 × 88 WebP；微信主包由 1.997 MiB 降至 1.795 MiB，共 197 个文件、30 个页面，单个媒体文件最大 84.5 KiB，无包体检查错误。
- 校园服务最终截图：`/Users/a/.codex/worktrees/7417/校园ai助手/tmp/services-icon-opt-final-390x844.png`。

## 上线边界

- 支付继续保持关闭，不拉起未配置微信支付，不产生真实扣款。
- 本轮只完成源码、构建产物和本地验收；未部署生产环境、未执行生产数据库迁移、未上传体验版或提交审核。
- 完整生产验收仍需有效 PostgreSQL、后台令牌、微信登录/内容安全配置及正式域名环境。

final result: passed

---

# 运营后台 V4 设计验收

## 对照基线

- selected design: `/Users/a/.codex/generated_images/019fa443-4451-7cf2-91e1-61f70ff8356c/exec-d8feeeac-11d3-41e6-8cdd-8d03a937a83b.png`
- before screenshot: `/Users/a/.codex/worktrees/7417/校园ai助手/tmp/admin-v4-before-1440x1000.png`
- implementation screenshot: `/Users/a/.codex/worktrees/7417/校园ai助手/tmp/admin-v4-final-1440x1000.png`
- combined comparison: `/Users/a/.codex/worktrees/7417/校园ai助手/tmp/admin-v4-comparison-final.png`
- viewport: 1440 × 1000 CSS px

## 对照与功能结论

- 九个原有模块完整保留，并按工作台、运营、安全、系统重新分组，职责与操作入口更清晰。
- 未连接态采用连接表单和四项锁定能力预览，不注入假统计数据；连接失败由技术错误改为中文可行动提示。
- 高校与校区数据边界固定显示在顶部和侧栏；连接成功后仍由真实 `/admin/context` 更新，不允许前端伪造范围。
- 未连接时导航与刷新被保护，提示先连接后台；支付状态在底部持续明确为关闭。
- 1440 × 1000 下 `scrollWidth = clientWidth = 1440`；JavaScript 语法、H5 构建和外部 Chrome 控制台 error 检查通过。

final result: passed

---

# 我的页面 V4 设计验收

## 对照基线

- selected design: `/Users/a/.codex/generated_images/019fa443-4451-7cf2-91e1-61f70ff8356c/exec-15dd225f-e1d0-4262-9013-7a72c3d09e7e.png`
- before screenshot: `/Users/a/.codex/worktrees/7417/校园ai助手/tmp/profile-v4-before-390x844.png`
- implementation screenshot: `/Users/a/.codex/worktrees/7417/校园ai助手/tmp/profile-v4-final-390x844.png`
- combined comparison: `/Users/a/.codex/worktrees/7417/校园ai助手/tmp/profile-v4-comparison-final.png`
- viewport: 390 × 844 CSS px

## 对照与功能结论

- 保留选定方案的身份卡、四项快捷入口、校园生活、常用管理和账号管理层级，使用项目现有图标与真实用户头像，不制造虚假身份或活动记录。
- 接口不可用时，帖子、消息、交易和包裹明确显示“暂未同步”，不再把失败状态误报为 0 条或暂无包裹；本地课表仍可独立展示。
- 消息快捷入口正确进入消息中心，“去识别”正确进入快递页，隐私与注销统一进入规则与数据管理页。
- 修复 Taro H5 多层标签选择器未命中导致字号失控的问题，改用稳定语义类名；390 × 844 下 `scrollWidth = clientWidth = 390`。
- TypeScript 与 H5 构建通过；外部 Chrome 控制台 error 为 0。

final result: passed

---

# 校园榜单 V4 设计验收

## 对照基线

- source visual truth path: `/Users/a/.codex/generated_images/019fa443-4451-7cf2-91e1-61f70ff8356c/exec-1d39dedc-d186-46c7-a3b9-0728bad922ec.png`
- before screenshot path: `/Users/a/.codex/worktrees/7417/校园ai助手/tmp/rankings-v4-before-390x844.png`
- implementation screenshot path: `/Users/a/.codex/worktrees/7417/校园ai助手/tmp/rankings-v4-final-390x844.png`
- detail screenshot path: `/Users/a/.codex/worktrees/7417/校园ai助手/tmp/rankings-v4-detail-390x844.png`
- submit screenshot path: `/Users/a/.codex/worktrees/7417/校园ai助手/tmp/ranking-submit-v4-final-390x844.png`
- combined comparison path: `/Users/a/.codex/worktrees/7417/校园ai助手/tmp/rankings-v4-comparison-final.png`
- viewport: 390 × 844 CSS px
- state: 唐山学院、大学西道校区；本地演示模式；生活榜；摩卡 Pro 详情展开态

## 对照结论

- 保留选定方案的紧凑校区头部、大字号榜单标题、三项分类、可信投票说明、连续排行和上传入口，并延续产品已确认的蓝白视觉系统。
- 实物版主动提高了中文字号、图片尺寸和行距，减少同屏条目数量，避免回到先前“字小、太挤”的问题；390 × 844 下无横向溢出。
- 榜单行支持统一地点详情；摩卡 Pro 详情额外展示作品图、服务项和到店核实说明，未写入未经证实的价格、折扣、电话或营业承诺。
- 演示数据只在本地显式 `demo=1` 状态显示并标记“本地演示”；生产请求失败时不会注入 48 赞或虚假地点热度。

## 主链路验证

- 美食、玩乐、生活切换会更新标题、说明和地点列表；生活榜首项可打开详情并正常关闭。
- 新地点上传页包含榜单类型、精确名称、具体位置、推荐理由和一张真实照片，空表提交会提示补全必填项。
- 学生投稿进入当前校区人工审核；服务端要求可信图片地址，榜单查询和数量统计均按高校、校区与分类隔离。
- 首次点赞前要求确认真实到访；本地演示数据不允许写入点赞，生产点赞只使用服务端真实计数。
- 外部 Chrome 实测 `scrollWidth = clientWidth = 390`，浏览、详情和上传页面控制台 error 为 0。

## 可接受差异

- 设计稿用七条紧凑演示数据表达信息架构；实现采用更大字号和图片，每屏显示三至四条，以满足用户此前确认的易读性方向。
- 正式环境不保留设计稿中的固定 48 赞或虚构店铺；只有本地演示会呈现这些数值并明确标识。

final result: passed

---

# 消息中心 V4 设计验收

## 对照基线

- source visual truth path: `/Users/a/.codex/generated_images/019fa443-4451-7cf2-91e1-61f70ff8356c/exec-26f117c3-26ac-47ae-aee8-e343d11e11f2.png`
- before screenshot path: `/Users/a/.codex/worktrees/7417/校园ai助手/tmp/messages-v4-before-390x844.png`
- implementation screenshot path: `/Users/a/.codex/worktrees/7417/校园ai助手/tmp/messages-v4-final-390x844.png`
- notification screenshot path: `/Users/a/.codex/worktrees/7417/校园ai助手/tmp/messages-v4-notice-390x844.png`
- combined comparison path: `/Users/a/.codex/worktrees/7417/校园ai助手/tmp/messages-v4-comparison-final.png`
- viewport: 390 × 844 CSS px
- state: 唐山学院、大学西道校区；消息 API 不可用的真实错误恢复态；沟通与通知双状态

## 对照结论

- 采用选定方案的任务型消息结构：大字号标题、校区入口、沟通/通知双标签、未读摘要、交易/互助/匿名筛选和连续会话列表。
- 保留现有五栏主导航结构，消息继续作为“我的”内的二级任务页，没有照搬概念图里错误新增的消息主导航。
- 会话头像使用项目内真实业务图片而非文字方块；正式有数据时展示对方昵称、业务来源、资源标题、最近消息、时间和未读数。
- 真实无数据和网络不可用分开处理；网络失败不伪装成“暂无消息”，提供明确重载按钮和保留消息说明。

## 主链路验证

- 沟通/通知切换、全部/交易/互助/匿名筛选、打开会话、服务通知跳转、全部已读和错误重试均有真实事件处理。
- 订单通知可进入订单页，校园互动通知携带资源 ID 可进入对应帖子详情，不再只是静态通知卡。
- 新增 `POST /conversations/read-all`，只更新当前高校、当前校区、当前用户收到且未读的消息；其他租户和会话不受影响。
- 聊天页同步统一顶部、业务类型、安全提示、举报、消息气泡和固定发送栏；未建立内容时提示隐私和交易安全边界。
- 390 × 844 下沟通与通知状态均 `scrollWidth = clientWidth = 390`，外部 Chrome 控制台 error 为 0。

## 可接受差异

- 设计稿用演示会话展示信息密度；实现验收使用真实 API 失败态，不注入虚构同学、对话、订单或未读数。
- 实现把空状态压缩在列表卡内，避免无消息时整页空白，同时保留两个真实业务入口。

final result: passed

---

# 校园圈 V4 设计验收

## 对照基线

- source visual truth path: `/Users/a/.codex/generated_images/019fa443-4451-7cf2-91e1-61f70ff8356c/exec-cb83009a-5830-4a9a-90dc-9afbd95cdac7.png`
- before screenshot path: `/Users/a/.codex/worktrees/7417/校园ai助手/tmp/community-v4-before-390x844.png`
- implementation screenshot path: `/Users/a/.codex/worktrees/7417/校园ai助手/tmp/community-v4-final-390x844.png`
- publish screenshot path: `/Users/a/.codex/worktrees/7417/校园ai助手/tmp/community-publish-v4-final-390x844.png`
- combined comparison path: `/Users/a/.codex/worktrees/7417/校园ai助手/tmp/community-v4-comparison-final.png`
- viewport: 390 × 844 CSS px
- state: 唐山学院、大学西道校区；本地 API 不可用的真实恢复态；发布页默认态

## 对照结论

- 实现保持选中方案的紧凑校区标题、五个大字号频道、轻量审核提示、论坛内容首屏和悬浮发布入口；移除了原有大面积品牌横幅与无效发现区。
- 空数据与网络失败分开表达：无内容时引导发布，连接失败时提供显式重试；已有缓存时保留内容并只显示轻量错误条，不重复堆叠错误状态。
- 发布页统一为蓝白校园内容工作流，支持日常、吐槽、二手、互助、活动、兼职、失物七类频道和最多三张压缩图片。
- 390 × 844 下 `scrollWidth = clientWidth = 390`，标题、校区、切换、频道和底部导航均未截断。

## 主链路验证

- “我的发布”可切换到当前账号的发布和审核记录，再返回公共动态。
- 日常等频道筛选具有真实选中状态；悬浮按钮可进入发布页。
- 帖子创建、审核、撤回、点赞、详情、评论、评论删除、帖子/评论举报均有前后端闭环，并按高校与校区隔离。
- 帖子支持最多三张可信上传图片；后端使用 `image_urls` 保存并保留 `image_url` 首图兼容字段。
- 发布页控制台 error 为 0；离线恢复态没有伪造帖子、点赞、评论或校园热度。

## 修正记录

- 第一轮实现同时显示网络错误条和大号重试空状态，形成重复反馈；已改为仅在存在缓存内容时展示轻量错误条，空内容只保留一个恢复动作。
- 参考稿为空内容状态，实现验收时为连接失败状态；两者的信息架构和主操作位置一致，状态文案按真实运行结果调整。

final result: passed

---

# 二手电动车设计验收

## 对照基线

- source visual truth path: `/Users/a/.codex/worktrees/7417/校园ai助手/design/concepts/campus-services-v1/12-ebike.png`
- before screenshot path: `/Users/a/.codex/worktrees/7417/校园ai助手/tmp/ebike-v4-before-390x844.png`
- implementation screenshot path: `/Users/a/.codex/worktrees/7417/校园ai助手/tmp/ebike-v4-final-390x844.png`
- publish screenshot path: `/Users/a/.codex/worktrees/7417/校园ai助手/tmp/ebike-v4-publish-390x844.png`
- appointment screenshot path: `/Users/a/.codex/worktrees/7417/校园ai助手/tmp/ebike-v4-appointments-390x844.png`
- combined comparison path: `/Users/a/.codex/worktrees/7417/校园ai助手/tmp/ebike-v4-comparison.png`
- viewport: 390 × 844 CSS px
- state: 唐山学院、大学西道校区；生产真实空车源、发布车源与预约空状态

## 对照结论

- 保留参考稿的大标题、本校标识、车源大图、价格/续航/车龄/校区筛选、预约验车、验车清单和不提前转账卡片。
- 正式环境没有公开车源时不注入虚假车辆、价格、续航、登记或热度；改用真实服务说明、发布入口和安全清单填补首屏。
- 发布页补齐品牌、标题、成色、实际续航、电池年份、登记情况、价格、描述和实拍图，字段结构化保存并进入人工审核。
- 底部导航改为车源、预约、我的；发布入口保留为页面主按钮，避免把“预约”错误替换成发布列表。

## 主链路验证

- 买家可在真实车源详情选择未来 30 天日期、上午/下午/晚上时段、校内地点和备注后发起验车预约。
- 车主可确认预约或完成验车，买卖双方可在交接前取消；重复待处理预约和预约自己车辆均由服务端拒绝。
- 继续支持收藏、站内聊天、卖家标记已交易/重新上架和校区运营咨询；平台不代收款、不提供虚假担保。
- 车辆、预约、会话和后台审核均按高校与校区隔离；运营后台可核对品牌、续航、电池年份与登记情况。
- 390 × 844 三个状态均无横向溢出，页面 `scrollWidth = clientWidth = 390`。
- TypeScript、36 项服务端单元测试、H5、微信小程序构建与包体检查通过；微信包体 1.976 MiB，无检查错误。

## 可接受差异

- 参考图展示四辆样车；正式默认状态坚持只展示服务端已审核真实车源，因此空校区展示发布引导而不是伪造商品。
- 参考图只展示“预约验车”按钮；实现增加预约状态、车主确认、双方取消、完成记录和站内沟通，属于真实交付必需能力。

final result: passed

---

# 校园水果店设计验收

## 对照基线

- source visual truth path: `/Users/a/.codex/worktrees/7417/校园ai助手/design/concepts/campus-services-v1/10-fruit.png`
- before screenshot path: `/Users/a/.codex/worktrees/7417/校园ai助手/tmp/fruit-v4-before-390x844.png`
- implementation screenshot path: `/Users/a/.codex/worktrees/7417/校园ai助手/tmp/fruit-v4-final-390x844.png`
- combined comparison path: `/Users/a/.codex/worktrees/7417/校园ai助手/tmp/fruit-v4-comparison.png`
- viewport: 390 × 844 CSS px

## 对照结论

- 保留参考稿的大标题、蓝色副标题、鲜果主视觉、四类商品、纵向推荐卡、固定购物车和三项底部导航。
- 调整首屏主图比例、左侧标题与按钮、校区切换胶囊、分类卡和空状态，使页面不再在无商品时留下大面积空白。
- 移除固定星级和“30 分钟送达”等无法由后台证明的展示，商品卡改为真实库存与“履约时间下单后确认”。
- 390 × 844 下 `scrollWidth = clientWidth = 390`，首屏结构、空状态、购物车和底部导航均无横向溢出。

## 主链路验证

- 当前分类会真实筛选商品；价格、库存、图片和上下架状态来自当前高校/校区运营后台。
- 加购、数量增减、自取/校内送达、联系人、手机号、地址、备注、提交、状态查看与待确认取消均沿用已验证的库存订单闭环。
- API 暂不可用时显示非技术化重试，不弹出 `Failed to fetch`；未配置支付时只创建待确认订单，不产生扣款。
- TypeScript、服务端语法、H5、微信小程序构建与包体检查通过；主包 1.953 MiB，无检查错误。

## 可接受差异

- 参考图展示三件演示水果；正式默认不伪造商品、甜度、价格和时效，真实商品由当前校区运营发布。
- 参考图为静态首屏；实现保留完整购物车、履约信息、订单记录、取消与库存恢复。

final result: passed

---

# 校园花店设计验收

## 对照基线

- source visual truth path: `/Users/a/.codex/worktrees/7417/校园ai助手/design/concepts/campus-services-v1/09-flowers.png`
- before screenshot path: `/Users/a/.codex/worktrees/7417/校园ai助手/tmp/flowers-v4-before-390x844.png`
- implementation screenshot path: `/Users/a/.codex/worktrees/7417/校园ai助手/tmp/flowers-v4-after2-390x844.png`
- combined comparison path: `/Users/a/.codex/worktrees/7417/校园ai助手/tmp/flowers-v4-comparison.png`
- viewport: 390 × 844 CSS px

## 对照结论

- 保留参考稿的大字花店标题、半透明校区状态、花束主视觉、四类花礼、纵向商品卡、固定预约栏和三项底部导航。
- 分类使用现有高质量实体图标，不再重复同一个花束图标；主色统一为清爽蓝白，花束照片保留柔和粉色氛围。
- 真实无商品或 API 暂不可用时展示非技术化空状态与重试操作，不再弹出 `Failed to fetch`，也不注入虚假花束、价格和送达承诺。
- 390 × 844 下 `scrollWidth = clientWidth = 390`，标题、分类、空状态、固定预约栏和底部导航均无横向溢出。

## 主链路验证

- 商品、分类、库存、购物车、数量增减、自取/校内送达、联系人、手机号、地址、订单提交、订单状态与取消库存恢复均接入现有真实服务。
- 鲜花订单新增期望日期、期望时间和花卡留言，运营工作台可看到完整履约信息；日期、时间、手机号和地址均在前后端校验。
- 提交后只创建待确认预约，不拉起未配置支付；页面明确“暂不支付”，不会伪造付款或送达成功。
- TypeScript、服务端语法、34 项单元测试、H5、微信小程序构建与包体检查通过；主包 1.969 MiB，无检查错误。

## 可接受差异

- 参考图展示三件演示花束和固定两小时送达；正式默认不伪造商品与时效，真实商品由当前校区运营发布，履约时间以下单确认结果为准。
- 参考图只有商品浏览；实现增加结构化日期、时间、花卡、自取/送达、订单状态和取消，满足真实预约所需闭环。

final result: passed

---

# 匿名匹配设计验收

## 对照基线

- source visual truth path: `/Users/a/.codex/worktrees/7417/校园ai助手/design/concepts/campus-services-v1/07-match.png`
- before screenshot path: `/Users/a/.codex/worktrees/7417/校园ai助手/tmp/match-v4-before-390x844.png`
- implementation screenshot path: `/Users/a/.codex/worktrees/7417/校园ai助手/tmp/match-v4-main-final2-390x844.png`
- profile screenshot path: `/Users/a/.codex/worktrees/7417/校园ai助手/tmp/match-v4-profile-final3-390x844.png`
- combined comparison path: `/Users/a/.codex/worktrees/7417/校园ai助手/tmp/match-v4-final-comparison.png`
- viewport: 390 × 844 CSS px

## 对照结论

- 保留参考稿的大图氛围、兴趣标签、匿名候选卡、招呼收件箱和三项底部导航，并统一到现有蓝白校园服务体系。
- 候选排序改为真实兴趣重合度，“换一个搭子”会在当前校区候选中循环，不再显示硬编码共同兴趣数。
- 资料页补齐兴趣选择、自由兴趣、自我介绍、字符限制、暂停与恢复匹配，空状态可直接跳转完善资料。
- 390 × 844 下主页面和资料页均无横向溢出，按钮、输入区与底部导航没有遮挡。

## 主链路验证

- 用户可完善匿名资料、浏览同校候选、发送自定义招呼、同意或婉拒，双方同意后才建立匿名校内会话。
- 暂停匹配会将资料标记为 inactive；重新保存会恢复，不删除历史招呼与已建立会话。
- 页面明确禁止填写姓名、手机号、微信和宿舍号；聊天只展示匿名昵称，高校与校区隔离继续生效。
- TypeScript、服务端语法、H5、微信小程序构建与包体检查通过；主包 1.960 MiB，无检查错误。

## 可接受差异

- 参考图使用演示候选；正式默认不伪造同学资料和互动热度，当前校区无候选时展示真实引导空状态。
- 参考图未包含招呼状态机；实现增加待回应、已同意、已婉拒和匿名会话入口，满足真实使用需要。

final result: passed

---

# 校园活动设计验收

## 对照基线

- source visual truth path: `/Users/a/.codex/worktrees/7417/校园ai助手/design/concepts/campus-services-v1/06-events.png`
- before screenshot path: `/Users/a/.codex/worktrees/7417/校园ai助手/tmp/events-v4-before-390x844.png`
- implementation screenshot path: `/Users/a/.codex/worktrees/7417/校园ai助手/tmp/events-v4-after-390x844.png`
- combined comparison path: `/Users/a/.codex/worktrees/7417/校园ai助手/tmp/events-v4-comparison.png`
- viewport: 390 × 844 CSS px
- state: 唐山学院、当前校区真实空状态

## 对照结论

- 保留参考稿的大图焦点位、七日日历、分类、报名筛选、活动列表和底部导航。
- 日期与社团/讲座/运动/志愿改为真实筛选，支持再次点击日期取消限制。
- 真实无活动时使用现有活动图像构建大图空状态，不伪造主办方、时间、名额或报名热度。
- 活动详情层展示主办方、时间、地点、容量、说明和到场提醒。

## 主链路验证

- 全部活动、可报名和我的报名均基于服务端真实报名状态；容量已满时禁止继续报名。
- 报名前二次确认活动、时间和地点；取消时再次确认并释放名额。
- 活动与报名按高校、校区和当前用户隔离；只展示当前校区已启用活动。
- 390 × 844 下 `scrollWidth = clientWidth = 390`；TypeScript、服务端语法、H5、微信小程序构建和包体检查通过，主包 1.950 MiB，无检查错误。

## 可接受差异

- 参考图使用三场演示活动；正式默认仅展示当前校区运营审核的真实活动。
- 参考图的分类只有视觉状态；实现根据活动标题、说明和主办方进行分类并真实过滤。

final result: passed

---

# 失物招领设计验收

## 对照基线

- source visual truth path: `/Users/a/.codex/worktrees/7417/校园ai助手/design/concepts/campus-services-v1/08-lost-found.png`
- before screenshot path: `/Users/a/.codex/worktrees/7417/校园ai助手/tmp/lost-v4-before-390x844.png`
- implementation screenshot path: `/Users/a/.codex/worktrees/7417/校园ai助手/tmp/lost-v4-final-390x844.png`
- publish screenshot path: `/Users/a/.codex/worktrees/7417/校园ai助手/tmp/lost-v4-publish-390x844.png`
- combined comparison path: `/Users/a/.codex/worktrees/7417/校园ai助手/tmp/lost-v4-final-comparison.png`
- viewport: 390 × 844 CSS px
- state: 唐山学院、当前校区真实空状态、寻物专属发布态

## 对照结论

- 保留参考稿的寻物/招领双入口、大字标题、搜索、线索卡、状态标签和三项底部导航。
- 搜索改为真实输入，覆盖物品描述、地点、标签和发布者；新增全部/寻物/招领和我的发布筛选。
- 真实空数据不注入虚假线索，改为有说明、有恢复和有发布入口的完整空状态。
- 线索详情层展示大图、物品摘要、地点、时间、详细描述和隐私安全提醒。

## 主链路验证

- 丢失和拾取入口会进入不同的专属发布语境，分别保存为“寻物”和“招领”，而不再统一写成“失物”。
- 发布要求详细特征、位置、可选实拍图和隐私确认，内容仍先经安全检查与人工审核。
- 非本人线索可建立当前校区站内会话；本人可将线索标记已找回/已归还，从公开列表移除。
- 390 × 844 下 `scrollWidth = clientWidth = 390`；TypeScript、服务端语法、H5、微信小程序构建和包体检查通过，主包 1.942 MiB，无检查错误。

## 可接受差异

- 参考图使用六条丰富演示线索；正式默认不伪造物品、位置和发布者，无公开数据时使用可行动空状态。
- 参考图直接“查看线索”；实现增加了核对提示、站内会话和发布者完成状态，属于真实交付必需的安全闭环。

final result: passed

---

# 我的快递设计验收

## 对照基线

- source visual truth path: `/Users/a/.codex/worktrees/7417/校园ai助手/design/concepts/campus-services-v1/04-express.png`
- implementation screenshot path: `/Users/a/.codex/worktrees/7417/校园ai助手/tmp/express-v4-current-390x844.png`
- combined comparison path: `/Users/a/.codex/worktrees/7417/校园ai助手/tmp/express-v4-comparison.png`
- viewport: 390 × 844 CSS px
- state: 唐山学院、大学西道校区；无待取件；短信一键识别入口与第三方同步边界可见

## 对照结论

- 保留参考稿的大标题、蓝白卡片、待取/历史切换和底部操作区；首屏改为最新需求优先的“复制短信，一键识别”。
- 绑定手机号仅在学校驿站或物流服务商真正配置回调后开放；未接通时明确显示“暂未开放”，不会用演示数据伪装自动同步。
- 普通到件短信在设备本机解析，识别后先进入可编辑复核卡；只有确认导入后才保存取件码。
- 390 × 844 页面字号、间距和层级清晰，无横向溢出；空状态与多多快递官方备用入口互不混淆。

## 主链路验证

- 中通、顺丰丰巢柜、圆通服务站三类短信可提取干净的快递公司、取件码、取件点和可纠除运单号。
- 同一条无运单号短信生成稳定通知标识，重复导入返回冲突，不产生重复包裹。
- 待取件支持查看并复制取件码、二次确认已取件和历史留存。
- TypeScript、服务端语法、12 项快递聚焦测试、H5 与微信小程序构建均通过。
- 微信包体检查通过：30 个页面、5 个底部导航、211 个文件、1.915 MiB，无错误；保留既有媒体总量优化建议。

## 可接受差异

- 参考图突出单个包裹的货架插画；实现根据用户后续明确要求改为短信导入优先，更适合没有第三方授权时的真实使用场景。
- 未展示虚构物流轨迹；只有服务商真实回调的数据才标记为自动同步。

final result: passed

---

# 个人课表设计验收

## 对照基线

- source visual truth path: `/Users/a/.codex/worktrees/7417/校园ai助手/tmp/schedule-v4-reference-390x844.png`
- implementation screenshot path: `/Users/a/.codex/worktrees/7417/校园ai助手/tmp/schedule-v4-390x844.png`
- import review screenshot path: `/Users/a/.codex/worktrees/7417/校园ai助手/tmp/schedule-v4-import-review.png`
- manual add screenshot path: `/Users/a/.codex/worktrees/7417/校园ai助手/tmp/schedule-v4-manual.png`
- combined comparison path: `/Users/a/.codex/worktrees/7417/校园ai助手/tmp/schedule-v4-comparison.png`
- viewport: 390 × 844 CSS px；deviceScaleFactor 1
- state: 唐山学院、大学西道校区；周一 3 门课填充态；图片识别复核态；手动添加态

## 对照结论

- 信息层级与选定方案一致：学校标题、下一节课、一张图导入、七日选择、当日日程。
- 不再展示专业资料大卡；手动添加收纳为小入口，主链路聚焦图片识别。
- 课程状态按当前时间自动切换为“待上课 / 进行中 / 已结束”，下一节课卡同步显示倒计时。
- 第一次实现受 Taro `px -> rpx` 转换影响，字号约只有设计意图的一半；最终以明确 `PX` 移动端指标修复标题、卡片和日程可读性。

## 主链路验证

- 使用用户提供的真实课表图执行文件选择，识别结果进入逐门校对、删除和批量导入流程。
- 批量导入请求包含课程名、星期/节次/周次、教室和教师；手动添加使用同一数据合约。
- 云端不可用时保留本机课表并如实标识“本机已保存”，不伪装云端同步。
- 390 × 844 下 `scrollWidth = clientWidth = 390`，初始 3 条周一课程正常渲染，浏览器控制台 error 为 0。
- TypeScript、课表/快递服务端聚焦测试和 H5 构建通过。

## 可接受差异

- 参考图是静态日程；实现增加学期、周次、管理与恢复演示课表入口，均为真实课表维护所必需。
- 课程较多时页面纵向滚动，不用缩小字号强行塞入一屏。

final result: passed

---

# 校园零食店设计验收

## 对照基线

- source visual truth path: `/Users/a/.codex/worktrees/7417/校园ai助手/design/concepts/campus-services-v1/11-snacks.png`
- implementation screenshot path: `/Users/a/.codex/worktrees/7417/校园ai助手/tmp/snacks-v3-390x844-pass2.png`
- combined comparison path: `/Users/a/.codex/worktrees/7417/校园ai助手/tmp/snacks-v3-comparison-pass2.png`
- viewport: 390 × 844 CSS px
- state: 唐山学院、大学西道校区；商品填充态；搜索默认收起

## 迭代记录

- Pass 1 [P1]: 首屏英雄区和常驻搜索框过高，商品列表被推到首屏以外。
- Fix: 头部 74px 降为 60px，英雄区 286px 降为 232px，搜索改为显式展开，CTA 宽度和分类卡间距同步收紧。
- Pass 2: 字号可读、图片裁切正常、首屏可见商品、无横向溢出，无 P0/P1/P2 问题。

## 主链路验证

- 分类切换、搜索展开/收起、加入购物车、自取/配送切换可用。
- 配送订单请求包含联系人、手机号、校内地址和结构化商品明细。
- 390 × 844 下 `scrollWidth = clientWidth = 390`，Chrome 控制台 error 为 0。

final result: passed

---

# 校园外卖设计验收

## 对照基线

- source visual truth path: `/Users/a/.codex/worktrees/7417/校园ai助手/design/concepts/campus-services-v1/01-takeout.png`
- implementation screenshot path: `/Users/a/.codex/worktrees/7417/校园ai助手/tmp/takeout-v4-390x844.png`
- checkout screenshot path: `/Users/a/.codex/worktrees/7417/校园ai助手/tmp/takeout-v4-checkout-390x844.png`
- combined comparison path: `/Users/a/.codex/worktrees/7417/校园ai助手/tmp/takeout-v4-comparison.png`
- viewport: 390 × 844 CSS px
- state: 唐山学院、大学西道校区；4 款当日可订餐品；配送结算填充态

## 对照结论

- Fonts: 保留设计稿的大标题、蓝色强调和白色信息卡，根据先前已确认的“更大、更舒服”方向提升了移动端字号。
- Spacing: 首屏依次为学校头部、预约状态、7 日菜单、精选套餐、分类与热卖；无拥挤、无横向溢出。
- Colors: 主色统一为 #2879F3，价格使用暖黄/橙色强调，与参考稿一致。
- Images: 全部使用本地真实餐品素材，没有表情、文字占位或代码绘图。
- Copy: 营业和送达文案与后端当日菜单、截止时间、配送费实际字段对应；未配置微信支付时明确不发起扣款。

## 主链路验证

- 日期切换、分类筛选、加减商品、购物车、自取/配送、联系信息校验均可用。
- 实际捕获的提交请求包含 `serviceDate`、`fulfillmentType`、`contactName`、`contactPhone`、`deliveryAddress`和幂等键。
- 390 × 844 下 `scrollWidth = clientWidth = 390`，4 条商品正常渲染，Chrome 控制台 error 为 0。
- 服务端订单列表已改为授权后解密回显，不再向客户端返回不可读密文。

## 可接受差异

- 增加 7 日菜单切换，保留原有预约制功能，该差异为功能必需。
- 不展示未经后端证实的营业时间和虚假销量；以截止时间、库存和预计配送时间取代。

final result: passed

---

# 校园跑腿设计验收

## 对照基线

- source visual truth path: `/Users/a/.codex/worktrees/7417/校园ai助手/design/concepts/campus-services-v1/03-errand.png`
- implementation screenshot path: `/Users/a/.codex/worktrees/7417/校园ai助手/tmp/errand-v4-390x844.png`
- publish form screenshot path: `/Users/a/.codex/worktrees/7417/校园ai助手/tmp/errand-v4-form-full.png`
- combined comparison path: `/Users/a/.codex/worktrees/7417/校园ai助手/tmp/errand-v4-comparison.png`
- viewport: 390 × 844 CSS px
- state: 唐山学院、大学西道校区；任务大厅真实空状态；代取快递发布表单展开态

## 对照结论

- 保留参考稿的大标题、同校互助标签、蓝色主操作、两类快捷服务、任务卡和三项底部操作。
- 英雄区使用项目内真实跑腿素材；任务为空时展示真实空状态，不伪造附近需求、酬金或成交量。
- 发布链路压缩为取件点、送达位置、时效和酬金，常用项按高校与校区保存在本机；备注为选填。
- 390 × 844 下 `scrollWidth = clientWidth = 390`，4 个输入控件和“一键发布”均正常渲染。

## 主链路验证

- 发布、撤销、先聊天、接单、放回大厅、跑腿同学确认送达、发布人确认收到和双方完成状态均有前后端实现。
- 公开需求明确禁止填写取件码、手机号和宿舍房间号；接单后使用当前校区会话私下沟通。
- 酬金维持线下结算，页面不拉起未配置支付、不伪造平台担保。
- 跨校区隔离、发布频率限制、0～100 元金额校验、取送地点不同校验、审计和聊天举报均保留。

## 可接受差异

- 参考图使用四条演示任务；实现默认展示真实服务端数据，无任务时用发布引导替代虚假热度。
- 参考图是单步接单；实现增加双方确认与误接放回大厅，属于真实交付必需的状态机。

final result: passed

---

# 二手闲置设计验收

## 对照基线

- source visual truth path: `/Users/a/.codex/worktrees/7417/校园ai助手/design/concepts/campus-services-v1/02-secondhand.png`
- before screenshot path: `/Users/a/.codex/worktrees/7417/校园ai助手/tmp/market-v4-current-390x844.png`
- implementation screenshot path: `/Users/a/.codex/worktrees/7417/校园ai助手/tmp/market-v4-after-390x844.png`
- publish form screenshot path: `/Users/a/.codex/worktrees/7417/校园ai助手/tmp/market-v4-publish-390x844.png`
- combined comparison path: `/Users/a/.codex/worktrees/7417/校园ai助手/tmp/market-v4-comparison.png`
- viewport: 390 × 844 CSS px
- state: 唐山学院、大学西道校区；真实空状态；发布闲置表单展开态

## 对照结论

- 保留参考稿的大标题、搜索、安全提示、分类、双列商品卡和三项底部导航。
- 修复真实空数据时首屏大片空白：使用项目内真实教材素材构建发布引导卡，并提供显式“发布闲置”主按钮。
- 发布表单提升为独立任务页视觉，字段包含标题、分类、成色、价格、描述和实拍图；打开后立即位于首屏，不再要求继续向下寻找。
- 商品卡补齐“查看详情”，详情层展示大图、价格、成色、发布校区、描述、当面验货提示、收藏和卖家聊天。

## 主链路验证

- 搜索无结果、收藏为空和校区无商品分别提供清除搜索、查看最新和发布闲置的正确操作，不会把用户带到错误流程。
- 发布强制校验标题、描述、有效价格和实物图片，提交后进入人工审核，不直接公开。
- 买家可收藏并建立校内会话；卖家可标记已交易或重新上架；商品和会话按高校与校区隔离。
- 390 × 844 下浏览态和发布态均 `scrollWidth = clientWidth = 390`，发布表单首屏顶点为 78px。
- TypeScript、H5、微信小程序构建与包体检查通过；主包 1.924 MiB，无检查错误。

## 可接受差异

- 参考图展示六件演示商品；正式默认状态不注入虚假闲置和成交热度，真实校区暂无公开商品时展示完整空状态。
- 参考图未包含商品详情；实现增加详情底部层以满足“看到想买的物品后和卖家自由沟通”的真实主链路。

final result: passed

---

# 兼职信息设计验收

## 对照基线

- source visual truth path: `/Users/a/.codex/worktrees/7417/校园ai助手/design/concepts/campus-services-v1/05-jobs.png`
- before screenshot path: `/Users/a/.codex/worktrees/7417/校园ai助手/tmp/jobs-v4-before-390x844.png`
- implementation screenshot path: `/Users/a/.codex/worktrees/7417/校园ai助手/tmp/jobs-v4-after-390x844.png`
- combined comparison path: `/Users/a/.codex/worktrees/7417/校园ai助手/tmp/jobs-v4-comparison.png`
- viewport: 390 × 844 CSS px
- state: 唐山学院、大学西道校区；真实岗位空状态；搜索和“线上”筛选恢复测试

## 对照结论

- 保留参考稿的大标题、校内/周末/线上分类、已核验标识、精选岗位、最新岗位和防诈骗提醒。
- 将原来只有外观的搜索框与分类卡改为真实筛选；查询字段覆盖岗位、机构、地点和说明。
- 岗位详情补齐发布方、地点、岗位说明、安全提醒、先聊天、提交意向和撤回投递。
- 报名说明从每张岗位卡的常驻小输入框迁移到独立确认卡，减少拥挤并避免误投。

## 主链路验证

- 搜索、校内/周末/线上筛选、全部/已核验/我的投递、清除筛选均有真实状态变化。
- 岗位意向需二次确认后提交，只有学生发布并通过审核的岗位才开放直接聊天；投递可撤回。
- 学生付费发布入口继续关闭，页面明确“本期不收取发布费”，不拉起未配置支付；岗位由校区运营完成资质核验后公开。
- 390 × 844 下 `scrollWidth = clientWidth = 390`，浏览器搜索控件和空状态正常；TypeScript、服务端语法、H5、微信小程序构建和包体检查通过。
- 微信主包 1.933 MiB，无检查错误，仅保留既有媒体总量优化建议。

## 可接受差异

- 参考图使用四个演示岗位；正式默认不伪造岗位、薪资和招聘热度，当前校区没有审核岗位时显示真实空状态。
- 付费发布流程保留在后端为未来能力，但本期界面明确关闭，符合当前上线边界。

final result: passed
