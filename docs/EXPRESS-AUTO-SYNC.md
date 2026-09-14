# 快递自动同步接入说明

## 学生端体验

1. 学生在微信小程序的“我的快递”页点击“微信绑定”。
2. 服务端使用微信一次性授权码换取手机号；AppSecret 不进入小程序代码。
3. 手机号加密保存，并以不可逆摘要用于当前学校、当前校区内匹配。
4. 驿站将包裹入库后，调用签名回调；小程序自动展示快递公司、取件点与真实取件码。
5. 学生可以确认已取件，也可以随时解绑手机号。

在尚未取得驿站或服务商授权时，正式学生端使用无需授权的替代流程：选择到件通知截图，或复制通知文字后点击“读取剪贴板”。系统自动识别字段并让用户一次确认，不要求逐项填写。

## 不能伪造的外部前提

微信小程序不能读取用户短信，也不能读取其他小程序的包裹数据。只绑定手机号并不等于已经获得物流数据。正式启用自动出码前，必须满足以下任一条件：

- 学校快递驿站同意在包裹入库时向本项目推送到件数据；
- 与具备相应授权的物流聚合服务商签约，由其提供合法的到件数据；
- 电商或物流订单系统已经合法地把运单号和收件手机号同步给本项目。

在没有完成上述接入时，页面会明确显示“已绑定 · 等待驿站接入”，不会生成演示取件码。

## 回调协议

- 地址：`POST /campus-circle/api/v1/integrations/express/arrival`
- 请求头：`x-express-signature`
- 签名：`HMAC-SHA256(raw JSON body, EXPRESS_WEBHOOK_SECRET)`，小写十六进制
- 服务端环境变量：
  - `EXPRESS_WEBHOOK_SECRET`：高熵签名密钥
  - `EXPRESS_PROVIDER_NAME`：学生端展示的服务方名称

示例请求体：

```json
{
  "eventId": "station-event-20260824-0001",
  "tenant": "tangshan",
  "campus": "daxuexidao",
  "phone": "13800138000",
  "carrier": "中通快递",
  "trackingNo": "ZT1234567890",
  "pickupCode": "3-2-18",
  "station": "北院快递驿站"
}
```

回调会按手机号摘要匹配绑定用户，以 `eventId` 幂等写入。手机号和取件码不写入日志；取件码使用 `PII_ENCRYPTION_KEY` 加密落库。

## 上线前检查

- 执行数据库迁移 `017_express_auto_binding.sql`。
- 微信公众平台隐私保护指引中如实声明手机号的用途。
- 在服务端配置 `WECHAT_APPID`、`WECHAT_APPSECRET`、`PII_ENCRYPTION_KEY`、`IDENTITY_HASH_SECRET`。
- 与驿站完成签名联调、重复事件、错误手机号、解绑用户和重放请求测试。
- 不得宣传“自动同步已开启”，直到 `/ready` 返回 `expressAutoSyncConfigured: true` 且真实到件联调通过。
