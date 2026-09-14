import assert from "node:assert/strict"
import test from "node:test"
import {isExpectedWechatPayment, isExpectedWechatRefund} from "../src/payment-validation.js"

const provider = {mchid: "1900000001", appid: "wx-lunch"}

test("payment callback must match the local order, merchant, app, and cent amount", () => {
  const order = {order_no: "CF260729123456", total_amount_cents: 2280}
  const payment = {
    out_trade_no: order.order_no,
    mchid: provider.mchid,
    appid: provider.appid,
    amount: {total: 2280, currency: "CNY"}
  }
  assert.equal(isExpectedWechatPayment(payment, order, provider), true)
  assert.equal(isExpectedWechatPayment({...payment, amount: {total: 1, currency: "CNY"}}, order, provider), false)
  assert.equal(isExpectedWechatPayment({...payment, appid: "wx-other"}, order, provider), false)
  assert.equal(isExpectedWechatPayment({...payment, out_trade_no: "CF-other"}, order, provider), false)
})

test("refund callback must match refund number, transaction, merchant, and both refund amounts", () => {
  const record = {out_refund_no: "RF260729123456", transaction_id: "420000000000", amount_cents: 2280}
  const refund = {
    out_refund_no: record.out_refund_no,
    transaction_id: record.transaction_id,
    mchid: provider.mchid,
    amount: {refund: 2280, total: 2280, currency: "CNY"}
  }
  assert.equal(isExpectedWechatRefund(refund, record, provider), true)
  assert.equal(isExpectedWechatRefund({...refund, amount: {refund: 2200, total: 2280, currency: "CNY"}}, record, provider), false)
  assert.equal(isExpectedWechatRefund({...refund, transaction_id: "other"}, record, provider), false)
})
