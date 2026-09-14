import assert from "node:assert/strict"
import test from "node:test"
import {assertContentAllowed, ContentSafetyError, createWechatContentSafety} from "../src/wechat-content-safety.js"

function jsonResponse(body, ok = true) {
  return {ok, async json() { return body }}
}

test("content safety obtains and reuses a server-side access token", async () => {
  const calls = []
  const checker = createWechatContentSafety({
    appid: "wx-test",
    appSecret: "server-secret",
    mode: "required",
    fetchImpl: async (url, options = {}) => {
      calls.push({url: String(url), options})
      if (String(url).includes("cgi-bin/token")) return jsonResponse({access_token: "token-one", expires_in: 7200})
      return jsonResponse({errcode: 0, errmsg: "ok", result: {suggest: "pass", label: 100}, trace_id: "trace-one"})
    }
  })
  const first = await checker.checkText({content: "正常的校园互助信息", openid: "openid-one"})
  const second = await checker.checkText({content: "第二条正常信息", openid: "openid-one"})
  assert.equal(first.suggest, "pass")
  assert.equal(second.checked, true)
  assert.equal(calls.filter(item => item.url.includes("cgi-bin/token")).length, 1)
  const requestBody = JSON.parse(calls.find(item => item.url.includes("msg_sec_check")).options.body)
  assert.deepEqual(requestBody, {content: "正常的校园互助信息", version: 2, scene: 2, openid: "openid-one"})
})

test("required mode fails closed when credentials or openid are missing", async () => {
  const unconfigured = createWechatContentSafety({mode: "required"})
  await assert.rejects(() => unconfigured.checkText({content: "内容", openid: "openid"}), error => error instanceof ContentSafetyError && error.status === 503)
  const configured = createWechatContentSafety({appid: "wx-test", appSecret: "secret", mode: "required"})
  await assert.rejects(() => configured.checkText({content: "内容"}), error => error instanceof ContentSafetyError && error.status === 401)
})

test("risky and review results obey the visibility boundary", async () => {
  assert.throws(() => assertContentAllowed({suggest: "risky", label: 20001}), error => error.status === 422)
  assert.throws(() => assertContentAllowed({suggest: "review", label: 20001}), error => error.status === 422)
  assert.equal(assertContentAllowed({suggest: "review", label: 20001}, {allowReview: true}).suggest, "review")
})

test("observe mode degrades to manual review without claiming a pass", async () => {
  const checker = createWechatContentSafety({
    appid: "wx-test",
    appSecret: "secret",
    mode: "observe",
    fetchImpl: async () => { throw new Error("network unavailable") }
  })
  const result = await checker.checkText({content: "需要进入人工队列的内容", openid: "openid-one"})
  assert.equal(result.suggest, "review")
  assert.equal(result.checked, false)
})
