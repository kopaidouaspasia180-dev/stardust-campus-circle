import assert from "node:assert/strict"
import test from "node:test"
import {createWechatPhoneService, maskPhone, normalizeMainlandPhone} from "../src/wechat-phone.js"

test("normalizes and masks mainland phone numbers", () => {
  assert.equal(normalizeMainlandPhone("+86 138-0013-8000"), "13800138000")
  assert.equal(normalizeMainlandPhone("01012345678"), "")
  assert.equal(maskPhone("13800138000"), "138****8000")
})

test("exchanges a one-time WeChat code without exposing the secret to the client", async () => {
  const calls = []
  const service = createWechatPhoneService({
    appid: "wx-test",
    appSecret: "server-only-secret",
    fetchImpl: async (url, options = {}) => {
      calls.push({url: String(url), options})
      if (String(url).includes("stable_token")) return {ok: true, json: async () => ({access_token: "token", expires_in: 7200})}
      return {ok: true, json: async () => ({errcode: 0, phone_info: {purePhoneNumber: "13800138000"}})}
    }
  })
  assert.equal(await service.resolvePhone("one-time-code"), "13800138000")
  assert.equal(calls.length, 2)
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    grant_type: "client_credential",
    appid: "wx-test",
    secret: "server-only-secret",
    force_refresh: false
  })
  assert.deepEqual(JSON.parse(calls[1].options.body), {code: "one-time-code"})
})

test("refreshes a stale stable access token once and retries phone resolution", async () => {
  const calls = []
  const service = createWechatPhoneService({
    appid: "wx-test",
    appSecret: "server-only-secret",
    fetchImpl: async (url, options = {}) => {
      calls.push({url: String(url), options})
      if (String(url).includes("stable_token")) {
        const request = JSON.parse(options.body)
        return {ok: true, json: async () => ({access_token: request.force_refresh ? "fresh-token" : "stale-token", expires_in: 7200})}
      }
      if (String(url).includes("stale-token")) {
        return {ok: true, json: async () => ({errcode: 40001, errmsg: "invalid credential"})}
      }
      return {ok: true, json: async () => ({errcode: 0, phone_info: {purePhoneNumber: "13800138000"}})}
    }
  })

  assert.equal(await service.resolvePhone("one-time-code"), "13800138000")
  assert.equal(calls.length, 4)
  assert.equal(JSON.parse(calls[2].options.body).force_refresh, true)
  assert.match(calls[3].url, /fresh-token/)
})
