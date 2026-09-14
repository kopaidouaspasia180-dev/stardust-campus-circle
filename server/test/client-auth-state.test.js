import assert from "node:assert/strict"
import test from "node:test"
import {build} from "../../node_modules/esbuild/lib/main.js"
import path from "node:path"
import {fileURLToPath} from "node:url"
import {createRequire} from "node:module"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")
const localRequire = createRequire(import.meta.url)

async function loadClient(taro) {
  globalThis.__stardustTaroMock = taro
  const output = await build({
    entryPoints: [path.join(root, "src/api/client.ts")],
    bundle: true,
    format: "cjs",
    platform: "node",
    write: false,
    plugins: [{
      name: "client-auth-test-mocks",
      setup(builder) {
        builder.onResolve({filter: /^@tarojs\/taro$/}, () => ({path: "taro", namespace: "auth-test"}))
        builder.onResolve({filter: /^\.\.\/store\/tenant$/}, () => ({path: "tenant", namespace: "auth-test"}))
        builder.onLoad({filter: /.*/, namespace: "auth-test"}, args => ({
          loader: "js",
          contents: args.path === "taro"
            ? "export default globalThis.__stardustTaroMock"
            : "export const currentTenant=()=>({id:'tangshan'}); export const currentCampus=()=>({id:'daxuexidao'})"
        }))
      }
    }]
  })
  const module = {exports: {}}
  Function("module", "exports", "require", output.outputFiles[0].text)(module, module.exports, localRequire)
  return module.exports
}

function createTaro(request) {
  const storage = new Map()
  let loginIndex = 0
  let modalCount = 0
  const loginCodes = ["guest-code", "bind-code", "recover-code"]
  return {
    storage,
    modalCount: () => modalCount,
    ENV_TYPE: {WEAPP: "WEAPP"},
    getEnv: () => "WEAPP",
    getStorageSync: key => storage.get(key),
    setStorageSync: (key, value) => storage.set(key, value),
    removeStorageSync: key => storage.delete(key),
    login: async () => ({code: loginCodes[loginIndex++] || "extra-code"}),
    request,
    showModal: async () => { modalCount += 1; return {confirm: false} },
    navigateTo: async () => undefined
  }
}

test("phone login verifies once and protected actions immediately see the account", async () => {
  const calls = []
  const taro = createTaro(async options => {
    calls.push(options)
    if (options.url.endsWith("/auth/wechat")) return {statusCode: 201, data: {sessionToken: "guest-token", expiresAt: "2099-01-01T00:00:00.000Z"}}
    if (options.url.endsWith("/auth/phone")) return {statusCode: 201, data: {sessionToken: "phone-token", expiresAt: "2099-01-01T00:00:00.000Z", user: {id: 42, nickname: "同学", avatar: "campus-avatar-1"}, phoneMasked: "181****7945"}}
    if (options.url.endsWith("/me")) return {statusCode: 200, data: {user: {id: 42, nickname: "同学", avatar: "campus-avatar-1", phoneVerified: true, phoneMasked: "181****7945"}}}
    throw new Error(`unexpected request: ${options.url}`)
  })
  const client = await loadClient(taro)

  const account = await client.loginWithPhone("phone-code")

  assert.equal(account.id, 42)
  assert.equal(account.phoneVerified, true)
  assert.equal(calls.filter(call => call.url.endsWith("/me")).length, 1)
  assert.equal(await client.requirePhoneLogin(), true)
  assert.equal(taro.modalCount(), 0)
  assert.equal(taro.storage.get("stardust_wechat_session_v1"), "phone-token")
})

test("a current-session 401 keeps the bound account and silently restores it", async () => {
  let phase = "login"
  const taro = createTaro(async options => {
    if (options.url.endsWith("/auth/wechat")) {
      if (phase === "recover") {
        assert.equal(options.data.guestMode, false)
        return {statusCode: 201, data: {sessionToken: "recovered-token", expiresAt: "2099-01-01T00:00:00.000Z", user: {id: 42, nickname: "同学", avatar: "campus-avatar-1", phoneVerified: true}}}
      }
      return {statusCode: 201, data: {sessionToken: "guest-token", expiresAt: "2099-01-01T00:00:00.000Z"}}
    }
    if (options.url.endsWith("/auth/phone")) return {statusCode: 201, data: {sessionToken: "phone-token", expiresAt: "2099-01-01T00:00:00.000Z", user: {id: 42, nickname: "同学", avatar: "campus-avatar-1"}}}
    if (options.url.endsWith("/me")) return {statusCode: 200, data: {user: {id: 42, nickname: "同学", avatar: "campus-avatar-1", phoneVerified: true}}}
    if (options.url.endsWith("/protected") && phase === "login") return {statusCode: 401, data: {error: "expired"}}
    if (options.url.endsWith("/protected") && phase === "recover") return {statusCode: 200, data: {ok: true}}
    throw new Error(`unexpected request: ${options.url}`)
  })
  const client = await loadClient(taro)
  await client.loginWithPhone("phone-code")

  await assert.rejects(() => client.apiRequest("/protected"), /expired/)
  assert.equal(client.hasPhoneLogin(), true)
  assert.equal(client.readAccount().id, 42)
  assert.equal(taro.storage.has("stardust_wechat_session_v1"), false)

  phase = "recover"
  assert.deepEqual(await client.apiRequest("/protected"), {ok: true})
  assert.equal(taro.storage.get("stardust_wechat_session_v1"), "recovered-token")
  assert.equal(client.hasPhoneLogin(), true)
})

test("returning phone login keeps previously saved profile when verification briefly fails", async () => {
  const taro = createTaro(async options => {
    if (options.url.endsWith("/auth/wechat")) return {statusCode: 201, data: {sessionToken: "guest-token", expiresAt: "2099-01-01T00:00:00.000Z"}}
    if (options.url.endsWith("/auth/phone")) return {statusCode: 201, data: {
      sessionToken: "phone-token",
      expiresAt: "2099-01-01T00:00:00.000Z",
      user: {id: 42, nickname: "同学", avatar: "campus-avatar-1"}
    }}
    if (options.url.endsWith("/me")) throw new Error("temporary network failure")
    throw new Error(`unexpected request: ${options.url}`)
  })
  taro.storage.set("stardust_phone_account_v1", {
    id: 42,
    nickname: "同学",
    avatar: "campus-avatar-1",
    phoneVerified: true,
    publicId: "000042",
    profileBackground: "/campus-circle/api/uploads/background.jpg",
    profileBio: "已经填写过的个人资料",
    profileInterests: ["摄影"],
    profileGallery: ["/campus-circle/api/uploads/gallery.jpg"]
  })
  taro.storage.set("stardust_auth_level_v1", "phone")
  const client = await loadClient(taro)

  const account = await client.loginWithPhone("phone-code")
  assert.equal(account.profileBio, "已经填写过的个人资料")
  assert.equal(account.profileBackground, "/campus-circle/api/uploads/background.jpg")
  assert.deepEqual(account.profileInterests, ["摄影"])
  assert.deepEqual(client.readAccount().profileGallery, ["/campus-circle/api/uploads/gallery.jpg"])
})
