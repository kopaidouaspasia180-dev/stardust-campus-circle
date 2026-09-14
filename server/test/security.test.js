import assert from "node:assert/strict"
import test from "node:test"
import {createPiiCodec, hashIdentity} from "../src/security.js"

const key = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"

test("PII codec encrypts with randomized authenticated ciphertext", () => {
  const codec = createPiiCodec(key)
  const first = codec.encrypt("唐山学院 3 号宿舍楼")
  const second = codec.encrypt("唐山学院 3 号宿舍楼")
  assert.equal(codec.configured, true)
  assert.notEqual(first, second)
  assert.match(first, /^enc:v1:/)
  assert.equal(codec.decrypt(first), "唐山学院 3 号宿舍楼")
})

test("PII codec rejects ciphertext with the wrong key", () => {
  const encrypted = createPiiCodec(key).encrypt("13800000000")
  assert.throws(() => createPiiCodec("abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789").decrypt(encrypted))
})

test("identity hash is stable and keyed", () => {
  assert.equal(hashIdentity("openid-1", "secret-a"), hashIdentity("openid-1", "secret-a"))
  assert.notEqual(hashIdentity("openid-1", "secret-a"), hashIdentity("openid-1", "secret-b"))
  assert.throws(() => hashIdentity("openid-1", ""))
})
