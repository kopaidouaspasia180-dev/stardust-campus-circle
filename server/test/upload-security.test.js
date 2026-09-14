import assert from "node:assert/strict"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import {decodeBase64Image, hasSupportedImageSignature, imageExtensionForMime} from "../src/upload-security.js"

test("upload filenames use a server-controlled extension", () => {
  assert.equal(imageExtensionForMime("image/jpeg"), ".jpg")
  assert.equal(imageExtensionForMime("image/png"), ".png")
  assert.equal(imageExtensionForMime("image/webp"), ".webp")
  assert.equal(imageExtensionForMime("text/html"), "")
})

test("image signature must match its declared MIME type", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "stardust-upload-test-"))
  const imagePath = path.join(directory, "payload.html")
  try {
    await fs.writeFile(imagePath, Buffer.from("89504e470d0a1a0a", "hex"))
    assert.equal(await hasSupportedImageSignature(imagePath, "image/png"), true)
    assert.equal(await hasSupportedImageSignature(imagePath, "image/jpeg"), false)
    assert.equal(await hasSupportedImageSignature(imagePath, "text/html"), false)
  } finally {
    await fs.rm(directory, {recursive: true, force: true})
  }
})

test("base64 fallback accepts only bounded images with matching signatures", () => {
  const validPng = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360f8cfc0000004010100b10c02d90000000049454e44ae426082", "hex")
  assert.deepEqual(decodeBase64Image(validPng.toString("base64"), "image/png"), validPng)
  assert.equal(decodeBase64Image(validPng.toString("base64"), "image/jpeg"), null)
  assert.equal(decodeBase64Image("not-base64", "image/png"), null)
  assert.equal(decodeBase64Image(validPng.toString("base64"), "image/png", 16), null)
})
