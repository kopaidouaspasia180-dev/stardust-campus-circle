import assert from "node:assert/strict"
import test from "node:test"
import {canSendSocialMessage, normalizeProfileUpdate} from "../src/profile.js"

test("accepts a nickname and a built-in campus avatar", () => {
  assert.deepEqual(normalizeProfileUpdate({nickname: "  小唐 同学  ", avatar: "campus-avatar-4"}), {
    nickname: "小唐 同学",
    avatar: "campus-avatar-4"
  })
})

test("accepts only trusted uploaded avatars", () => {
  const result = normalizeProfileUpdate({avatar: "https://stardust.sale/campus-circle/api/uploads/avatar.png"}, {
    isTrustedAvatar: value => value.startsWith("https://stardust.sale/campus-circle/api/uploads/")
  })
  assert.equal(result.avatar, "https://stardust.sale/campus-circle/api/uploads/avatar.png")
  assert.throws(() => normalizeProfileUpdate({avatar: "https://example.com/avatar.png"}), /头像必须/)
})

test("rejects empty or oversized nicknames", () => {
  assert.throws(() => normalizeProfileUpdate({nickname: "我"}), /2—16/)
  assert.throws(() => normalizeProfileUpdate({nickname: "这是一个明显超过十六个字符长度限制的昵称"}), /2—16/)
})

test("normalizes a customizable public profile", () => {
  const trusted = value => String(value).startsWith("https://stardust.sale/")
  assert.deepEqual(normalizeProfileUpdate({
    profileBackground: "https://stardust.sale/uploads/cover.webp",
    profileBio: "  喜欢摄影，也想认识新朋友  ",
    profileInterests: ["摄影", "羽毛球", "摄影"],
    profileGallery: ["https://stardust.sale/uploads/one.webp"]
  }, {isTrustedAvatar: trusted}), {
    profileBackground: "https://stardust.sale/uploads/cover.webp",
    profileBio: "喜欢摄影，也想认识新朋友",
    profileInterests: ["摄影", "羽毛球"],
    profileGallery: ["https://stardust.sale/uploads/one.webp"]
  })
})

test("rejects untrusted profile photos and oversized interest lists", () => {
  assert.throws(() => normalizeProfileUpdate({profileGallery: ["https://example.com/one.jpg"]}), /照片墙/)
  assert.throws(() => normalizeProfileUpdate({profileInterests: Array.from({length: 13}, (_, index) => `兴趣${index}`)}), /最多设置/)
})

test("allows one greeting before mutual follow and unlocks chat after mutual follow", () => {
  assert.equal(canSendSocialMessage({resourceType:"user_profile",initiatorId:1,userId:1,messageCount:0}), true)
  assert.equal(canSendSocialMessage({resourceType:"user_profile",initiatorId:1,userId:1,messageCount:1}), false)
  assert.equal(canSendSocialMessage({resourceType:"user_profile",initiatorId:1,userId:2,messageCount:1}), false)
  assert.equal(canSendSocialMessage({resourceType:"user_profile",initiatorId:1,userId:2,messageCount:1,mutualFollowing:true}), true)
  assert.equal(canSendSocialMessage({resourceType:"errand",initiatorId:1,userId:2,messageCount:9}), true)
})
