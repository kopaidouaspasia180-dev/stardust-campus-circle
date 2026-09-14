import assert from "node:assert/strict"
import test from "node:test"
import {maskStorePhone, normalizeStoreFulfillment, normalizeStoreOccasion} from "../src/store-order.js"

test("normalizes pickup contact without retaining an address", () => {
  assert.deepEqual(normalizeStoreFulfillment({
    fulfillmentType: "pickup",
    contactName: " 小唐 ",
    contactPhone: "13800138000",
    deliveryAddress: "南院 3 号楼"
  }), {
    fulfillmentType: "pickup",
    contactName: "小唐",
    contactPhone: "13800138000",
    deliveryAddress: ""
  })
})

test("requires a campus address for delivery", () => {
  assert.throws(() => normalizeStoreFulfillment({
    fulfillmentType: "delivery",
    contactName: "小唐",
    contactPhone: "13800138000",
    deliveryAddress: "南院"
  }), /校内送达位置/)
})

test("rejects invalid contact phone and masks valid phone", () => {
  assert.throws(() => normalizeStoreFulfillment({contactName: "小唐", contactPhone: "123"}), /正确手机号/)
  assert.equal(maskStorePhone("13800138000"), "138****8000")
})

test("normalizes flower occasion details without applying them to other stores", () => {
  assert.deepEqual(normalizeStoreOccasion({desiredDate: "2026-08-25", desiredTime: "18:30", giftMessage: " 毕业快乐 "}, "flowers"), {
    desiredDate: "2026-08-25",
    desiredTime: "18:30",
    giftMessage: "毕业快乐"
  })
  assert.deepEqual(normalizeStoreOccasion({desiredDate: "bad", desiredTime: "bad"}, "fruit"), {
    desiredDate: null,
    desiredTime: "",
    giftMessage: ""
  })
  assert.throws(() => normalizeStoreOccasion({desiredDate: "2026-08-25", desiredTime: "25:00"}, "flowers"), /期望时间/)
})
