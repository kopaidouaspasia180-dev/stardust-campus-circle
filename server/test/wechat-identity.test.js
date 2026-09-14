import assert from "node:assert/strict"
import test from "node:test"
import {createWechatIdentityService} from "../src/wechat-identity.js"

test("exchanges a one-time WeChat login code on the server", async () => {
  const calls = []
  const service = createWechatIdentityService({
    appid: "wx-test",
    appSecret: "server-only-secret",
    fetchImpl: async (url) => {
      calls.push(String(url))
      return {ok: true, json: async () => ({openid: "openid-1", session_key: "session-key-1"})}
    }
  })

  assert.deepEqual(await service.resolve("one-time-code"), {
    openid: "openid-1",
    sessionKey: "session-key-1",
    unionid: ""
  })
  assert.equal(calls.length, 1)
  assert.match(calls[0], /appid=wx-test/)
  assert.match(calls[0], /js_code=one-time-code/)
  assert.doesNotMatch(calls[0], /session-key-1/)
})

test("rejects an invalid WeChat login response", async () => {
  const service = createWechatIdentityService({
    appid: "wx-test",
    appSecret: "server-only-secret",
    fetchImpl: async () => ({ok: true, json: async () => ({errcode: 40029, errmsg: "invalid code"})})
  })

  await assert.rejects(() => service.resolve("expired-code"), /微信登录失败/)
})
