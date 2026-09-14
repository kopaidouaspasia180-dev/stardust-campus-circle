import assert from "node:assert/strict"
import test from "node:test"
import {assertCommunityContentAllowed, COMMUNITY_POST_IMAGE_LIMIT, findBlockedCommunityTerm} from "../src/community-policy.js"

test("community posts support up to nine images", () => {
  assert.equal(COMMUNITY_POST_IMAGE_LIMIT, 9)
})

test("blocks configured forum terms even when separated by punctuation", () => {
  assert.equal(findBlockedCommunityTerm("加微 信详聊"), "微信")
  assert.equal(findBlockedCommunityTerm("有兴趣可加 J Z"), "jz")
  assert.equal(findBlockedCommunityTerm("联系 V 获取信息"), "v")
  assert.throws(() => assertCommunityContentAllowed("这里有兼职信息"), /不允许发布/)
})

test("allows ordinary campus sharing text", () => {
  assert.equal(findBlockedCommunityTerm("今天图书馆人不多，一起自习吧"), "")
  assert.doesNotThrow(() => assertCommunityContentAllowed("今天图书馆人不多，一起自习吧"))
})
