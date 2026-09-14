const clean = (value, max) => String(value || "").trim().slice(0, max)

export function normalizeStoreFulfillment(input = {}) {
  const fulfillmentType = clean(input.fulfillmentType, 20) || "pickup"
  if (!new Set(["pickup", "delivery"]).has(fulfillmentType)) {
    throw Object.assign(new Error("取货方式无效"), {status: 400})
  }
  const contactName = clean(input.contactName, 30)
  const contactPhone = clean(input.contactPhone, 20)
  const deliveryAddress = clean(input.deliveryAddress, 120)
  if (!contactName) throw Object.assign(new Error("请填写联系人"), {status: 400})
  if (!/^1\d{10}$/.test(contactPhone)) throw Object.assign(new Error("请填写正确手机号"), {status: 400})
  if (fulfillmentType === "delivery" && deliveryAddress.length < 4) {
    throw Object.assign(new Error("请填写校内送达位置"), {status: 400})
  }
  return {
    fulfillmentType,
    contactName,
    contactPhone,
    deliveryAddress: fulfillmentType === "delivery" ? deliveryAddress : ""
  }
}

export function maskStorePhone(value) {
  const phone = clean(value, 20)
  return /^1\d{10}$/.test(phone) ? `${phone.slice(0, 3)}****${phone.slice(-4)}` : ""
}

export function normalizeStoreOccasion(input = {}, serviceType = "") {
  if (serviceType !== "flowers") return {desiredDate: null, desiredTime: "", giftMessage: ""}
  const desiredDate = clean(input.desiredDate, 10)
  const desiredTime = clean(input.desiredTime, 5)
  const giftMessage = clean(input.giftMessage, 120)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(desiredDate) || Number.isNaN(Date.parse(`${desiredDate}T00:00:00`))) {
    throw Object.assign(new Error("请选择有效的送达日期"), {status: 400})
  }
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(desiredTime)) {
    throw Object.assign(new Error("请选择有效的期望时间"), {status: 400})
  }
  return {desiredDate, desiredTime, giftMessage}
}
