import assert from "node:assert/strict"
import test from "node:test"
import {parseExpressNotice} from "../src/express-notice.js"

test("parses a copied arrival notice without asking for each field", () => {
  const item = parseExpressNotice("【中通快递】您的包裹已到北院菜鸟驿站，取件码：3-2-18，运单号 ZT123456789")
  assert.equal(item.carrier, "中通")
  assert.equal(item.pickupCode, "3-2-18")
  assert.equal(item.trackingNo, "ZT123456789")
  assert.equal(item.station, "北院菜鸟驿站")
})

test("does not invent a pickup code", () => {
  assert.equal(parseExpressNotice("您的快递正在运输中"), null)
})

test("generates a stable fallback tracking number for notices without one", () => {
  const notice = "【极兔】包裹已到大学西道校区快递点，取件码：A-108"
  const first = parseExpressNotice(notice)
  const second = parseExpressNotice(notice)
  assert.match(first.trackingNo, /^NOTICE-[A-F0-9]{16}$/)
  assert.equal(first.trackingNo, second.trackingNo)
  assert.equal(first.station, "大学西道校区快递点")
})

test("extracts clean stations from common delivery wording", () => {
  assert.equal(parseExpressNotice("顺丰：快件已放入图书馆东侧丰巢柜，取件码 A901").station, "图书馆东侧丰巢柜")
  assert.equal(parseExpressNotice("圆通包裹送至南院综合服务站；取件码：B-77").station, "南院综合服务站")
})

test("parses common code wording used by parcel stations", () => {
  assert.equal(parseExpressNotice("【菜鸟】请凭 4-12-06 到南院自提点领取包裹").pickupCode, "4-12-06")
  assert.equal(parseExpressNotice("您的申通快递已到，取货码为 A108，请前往北院取件点").pickupCode, "A108")
  assert.equal(parseExpressNotice("极兔包裹到达大学西道快递点，取件编号：6-3-21").pickupCode, "6-3-21")
})

test("parses shelf numbers and spaced codes used by campus stations", () => {
  const item = parseExpressNotice("【校园驿站】包裹已到南院菜鸟驿站，货架号：6 2 1234，请及时领取")
  assert.equal(item.pickupCode, "6-2-1234")
  assert.equal(item.station, "南院菜鸟驿站")
})

test("parses bracketed identity codes", () => {
  const item = parseExpressNotice("您的快递已放入北院快递柜，身份码【A1-9527】，请凭码开柜")
  assert.equal(item.pickupCode, "A1-9527")
  assert.equal(item.station, "北院快递柜")
})
