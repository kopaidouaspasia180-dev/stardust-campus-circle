import assert from "node:assert/strict"
import crypto from "node:crypto"
import test from "node:test"
import {looksReadable, normalizeExpressArrival, verifyExpressWebhook} from "../src/express-sync.js"

test("verifies signed express arrival callbacks", () => {
  const body = JSON.stringify({eventId: "evt-1"})
  const signature = crypto.createHmac("sha256", "secret").update(body).digest("hex")
  assert.equal(verifyExpressWebhook(body, signature, "secret"), true)
  assert.equal(verifyExpressWebhook(body, "bad", "secret"), false)
})

test("normalizes a provider arrival and rejects incomplete payloads", () => {
  assert.deepEqual(normalizeExpressArrival({eventId: "evt-1", tenant: "tangshan", campus: "daxuexidao", phone: "+86 13800138000", carrier: "中通", trackingNo: "ZT123456", pickupCode: "3-2-18", station: "北院驿站"}), {
    eventId: "evt-1", tenant: "tangshan", campus: "daxuexidao", phone: "13800138000", carrier: "中通", trackingNo: "ZT123456", pickupCode: "3-2-18", station: "北院驿站"
  })
  assert.equal(normalizeExpressArrival({eventId: "evt-2"}), null)
})

test("detects legacy question-mark mojibake", () => {
  assert.equal(looksReadable("代取快递 · 北院驿站"), true)
  assert.equal(looksReadable("????(????)"), false)
})
