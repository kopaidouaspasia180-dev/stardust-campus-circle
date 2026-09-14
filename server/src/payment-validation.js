export function hasExpectedWechatMoney(amount, expectedCents) {
  return Boolean(amount) && Number(amount.total) === expectedCents && String(amount.currency || "") === "CNY"
}

export function isExpectedWechatPayment(payment, order, provider) {
  return payment.out_trade_no === order.order_no
    && payment.mchid === provider.mchid
    && payment.appid === provider.appid
    && hasExpectedWechatMoney(payment.amount, order.total_amount_cents)
}

export function isExpectedWechatRefund(refund, record, provider) {
  return refund.out_refund_no === record.out_refund_no
    && refund.transaction_id === record.transaction_id
    && refund.mchid === provider.mchid
    && hasExpectedWechatMoney(refund.amount, record.amount_cents)
    && Number(refund.amount?.refund) === record.amount_cents
}
