import fs from "node:fs/promises"
import path from "node:path"
import sharp from "../../server/node_modules/sharp/dist/index.mjs"

const root = "/Users/a/.codex/worktrees/7417/校园ai助手"
const outDir = path.join(root, ".codex-artifacts/posters/campus-circle-20260828")
const pinkSky = path.join(root, "src/assets/campus/real/tangshan-pink-sky-fengchui.jpg")
const sunset = path.join(root, "src/assets/campus/real/tangshan-sunset-path-momo.jpg")
const miniCode = "/Users/a/Library/Containers/com.tencent.xinWeChat/Data/Documents/xwechat_files/wxid_u3dr27l82k7l22_310e/temp/RWTemp/2026-08/9e20f478899dc29eb19741386f9343c8/4f6e7fde295b58288ce792108585a83b.jpg"
const qrCode = "/Users/a/Library/Containers/com.tencent.xinWeChat/Data/Documents/xwechat_files/wxid_u3dr27l82k7l22_310e/temp/RWTemp/2026-08/9e20f478899dc29eb19741386f9343c8/4ee0a9838b98bb5438fbc584f92dd10e.jpg"

await fs.mkdir(outDir, {recursive: true})

const esc = value => String(value).replace(/[&<>]/g, item => ({"&": "&amp;", "<": "&lt;", ">": "&gt;"})[item])
const text = (x, y, value, size, fill, weight = 500, anchor = "start", extra = "") =>
  `<text x="${x}" y="${y}" font-family="PingFang SC,Microsoft YaHei,sans-serif" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}" ${extra}>${esc(value)}</text>`

async function crop(file, width, height, position = "centre") {
  return sharp(file).resize(width, height, {fit: "cover", position}).jpeg({quality: 92}).toBuffer()
}

async function code(file, width, height) {
  return sharp(file).resize(width, height, {fit: "fill", kernel: sharp.kernel.nearest}).png().toBuffer()
}

async function render(name, background, overlay, composites = []) {
  const target = path.join(outDir, name)
  await sharp({create: {width: 1080, height: 1440, channels: 4, background}})
    .composite([{input: Buffer.from(overlay)}, ...composites])
    .png({compressionLevel: 9})
    .toFile(target)
  return target
}

const photoPink = await crop(pinkSky, 1080, 820, "centre")
const photoSunset = await crop(sunset, 1080, 1440, "centre")
const photoBuildingTall = await crop(pinkSky, 520, 1440, "centre")
const photoSunsetCard = await crop(sunset, 920, 470, "centre")
const miniCode260 = await code(miniCode, 260, 260)
const miniCode238 = await code(miniCode, 238, 238)
const qrCode245 = await code(qrCode, 245, 279)
const qrCode220 = await code(qrCode, 220, 251)

const v1 = `<svg width="1080" height="1440" xmlns="http://www.w3.org/2000/svg">
  <defs><linearGradient id="fade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#eff8ff" stop-opacity="0"/><stop offset="1" stop-color="#eff8ff"/></linearGradient></defs>
  <rect x="0" y="0" width="1080" height="820" fill="url(#fade)"/>
  <rect x="54" y="58" width="166" height="50" rx="25" fill="#ffffff" fill-opacity=".9"/>
  ${text(137, 92, "唐山学院", 24, "#1677d2", 700, "middle")}
  ${text(62, 196, "把校园生活", 72, "#0b2743", 800)}
  ${text(62, 284, "装进口袋", 72, "#1677d2", 800)}
  ${text(66, 344, "课表 · 校园服务 · 校园圈 · 榜单", 27, "#40566c", 500)}
  <rect x="42" y="760" width="996" height="620" rx="48" fill="#ffffff"/>
  ${text(84, 858, "星尘校园圈", 58, "#0b2743", 800)}
  ${text(84, 910, "唐山学院学生校园生活入口", 26, "#718096", 500)}
  <rect x="84" y="972" width="455" height="72" rx="36" fill="#eaf5ff"/>
  ${text(312, 1018, "找服务  ·  看校园  ·  逛论坛", 24, "#1677d2", 700, "middle")}
  <rect x="686" y="884" width="300" height="300" rx="40" fill="#ffffff" stroke="#dcecff" stroke-width="4"/>
  ${text(836, 1234, "微信扫码，打开小程序", 24, "#0b2743", 700, "middle")}
  ${text(84, 1270, "让每一天的校园生活", 30, "#40566c", 500)}
  ${text(84, 1318, "更简单，也更有趣。", 35, "#0b2743", 700)}
</svg>`

const v2 = `<svg width="1080" height="1440" xmlns="http://www.w3.org/2000/svg">
  <defs><linearGradient id="shade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#091a2e" stop-opacity=".08"/><stop offset=".65" stop-color="#091a2e" stop-opacity=".55"/><stop offset="1" stop-color="#071426" stop-opacity=".96"/></linearGradient><linearGradient id="blue" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#39a9ff"/><stop offset="1" stop-color="#2f64ff"/></linearGradient></defs>
  <rect width="1080" height="1440" fill="url(#shade)"/>
  ${text(64, 105, "STARDUST CAMPUS", 22, "#cdeaff", 700, "start", "letter-spacing='5'")}
  ${text(64, 240, "唐院生活", 82, "#ffffff", 800)}
  ${text(64, 330, "一站搞定", 82, "#ffffff", 800)}
  ${text(66, 390, "从下一节课，到校园里的每件小事", 29, "#e4f3ff", 500)}
  <rect x="54" y="942" width="972" height="400" rx="48" fill="#ffffff" fill-opacity=".94"/>
  <rect x="82" y="982" width="356" height="58" rx="29" fill="url(#blue)"/>
  ${text(260, 1020, "星尘校园圈", 27, "#ffffff", 700, "middle")}
  ${text(82, 1105, "课表 · 服务 · 校园圈 · 榜单", 28, "#12243a", 700)}
  ${text(82, 1152, "一个入口，连接你的校园日常", 25, "#6a7a8e", 500)}
  <rect x="730" y="986" width="270" height="270" rx="36" fill="#ffffff" stroke="#d9e8f5" stroke-width="3"/>
  ${text(865, 1300, "微信扫码进入", 23, "#12243a", 700, "middle")}
</svg>`

const v3 = `<svg width="1080" height="1440" xmlns="http://www.w3.org/2000/svg">
  <defs><linearGradient id="blue3" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#075bd8"/><stop offset="1" stop-color="#0bb8ee"/></linearGradient></defs>
  <rect x="520" y="0" width="560" height="1440" fill="#0b66df" fill-opacity=".72"/>
  <circle cx="954" cy="158" r="280" fill="#4cc9ff" fill-opacity=".25"/>
  <circle cx="616" cy="1270" r="240" fill="#ffffff" fill-opacity=".12"/>
  ${text(64, 94, "STARDUST", 27, "#0875e1", 800, "start", "font-style='italic'")}
  ${text(64, 238, "校园生活", 74, "#0c2847", 800)}
  ${text(64, 324, "不止一种", 74, "#0c2847", 800)}
  ${text(64, 396, "星尘校园圈", 38, "#0875e1", 700)}
  <rect x="62" y="472" width="390" height="3" fill="#b9d8f5"/>
  ${text(64, 535, "课表", 27, "#40566c", 700)}
  ${text(188, 535, "校园服务", 27, "#40566c", 700)}
  ${text(64, 590, "校园圈", 27, "#40566c", 700)}
  ${text(188, 590, "同学榜单", 27, "#40566c", 700)}
  <rect x="74" y="860" width="364" height="360" rx="44" fill="#ffffff" stroke="#dcecff" stroke-width="3"/>
  ${text(256, 1262, "微信扫一扫", 26, "#0c2847", 700, "middle")}
  ${text(256, 1302, "进入星尘校园圈", 22, "#6f8296", 500, "middle")}
  ${text(800, 1285, "唐山学院", 28, "#ffffff", 700, "middle")}
  ${text(800, 1332, "校园生活新入口", 24, "#dff6ff", 500, "middle")}
</svg>`

const v4 = `<svg width="1080" height="1440" xmlns="http://www.w3.org/2000/svg">
  <rect x="0" y="0" width="18" height="1440" fill="#137ee8"/>
  ${text(64, 92, "STARDUST CAMPUS", 21, "#137ee8", 700, "start", "letter-spacing='5'")}
  ${text(64, 200, "星尘校园圈", 68, "#102942", 800)}
  ${text(64, 256, "唐山学院学生校园生活入口", 27, "#627387", 500)}
  <rect x="64" y="318" width="952" height="470" rx="40" fill="#edf7ff" fill-opacity=".08" stroke="#d9e9f7" stroke-width="3"/>
  <rect x="64" y="826" width="596" height="410" rx="40" fill="#f2f8fd" stroke="#d9e9f7" stroke-width="3"/>
  ${text(104, 900, "你需要的校园日常", 34, "#102942", 700)}
  ${text(104, 964, "查课表", 28, "#137ee8", 700)}
  ${text(274, 964, "找服务", 28, "#137ee8", 700)}
  ${text(444, 964, "逛校园圈", 28, "#137ee8", 700)}
  ${text(104, 1035, "更清晰的入口", 26, "#52677c", 500)}
  ${text(104, 1080, "更真实的校园信息", 26, "#52677c", 500)}
  ${text(104, 1125, "更方便的同学互动", 26, "#52677c", 500)}
  <rect x="714" y="826" width="302" height="410" rx="40" fill="#ffffff" stroke="#d9e9f7" stroke-width="3"/>
  ${text(865, 1280, "微信扫码进入", 23, "#102942", 700, "middle")}
  <rect x="64" y="1290" width="952" height="2" fill="#dde8f1"/>
  ${text(64, 1355, "连接校园，也连接身边的同学。", 27, "#102942", 600)}
</svg>`

const outputs = []
outputs.push(await render("01-blue-campus.png", {r: 239, g: 248, b: 255, alpha: 1}, v1, [
  {input: photoPink, top: 0, left: 0},
  {input: Buffer.from(v1), top: 0, left: 0},
  {input: miniCode260, top: 904, left: 706}
]))
outputs.push(await render("02-sunset-youth.png", {r: 7, g: 20, b: 38, alpha: 1}, v2, [
  {input: photoSunset, top: 0, left: 0},
  {input: Buffer.from(v2), top: 0, left: 0},
  {input: miniCode238, top: 1002, left: 746}
]))
outputs.push(await render("03-geometric-premium.png", {r: 244, g: 249, b: 255, alpha: 1}, v3, [
  {input: photoBuildingTall, top: 0, left: 560},
  {input: Buffer.from(v3), top: 0, left: 0},
  {input: qrCode245, top: 886, left: 134}
]))
outputs.push(await render("04-clean-print.png", {r: 255, g: 253, b: 248, alpha: 1}, v4, [
  {input: photoSunsetCard, top: 318, left: 64},
  {input: Buffer.from(v4), top: 0, left: 0},
  {input: qrCode220, top: 885, left: 755}
]))

const thumbs = await Promise.all(outputs.map(file => sharp(file).resize(405, 540).png().toBuffer()))
const contact = `<svg width="900" height="1200" xmlns="http://www.w3.org/2000/svg">
  <rect width="900" height="1200" fill="#eef3f8"/>
  ${text(48, 62, "星尘校园圈 · 宣传海报方向", 32, "#102942", 800)}
  ${text(48, 100, "选择 1—4，我再输出最终发布版", 20, "#627387", 500)}
  ${[1,2,3,4].map((n, index) => {
    const x = index % 2 ? 463 : 32
    const y = index < 2 ? 132 : 685
    return `<rect x="${x}" y="${y}" width="405" height="540" rx="20" fill="#fff"/><circle cx="${x + 34}" cy="${y + 34}" r="23" fill="#137ee8"/>${text(x + 34, y + 42, n, 24, "#fff", 800, "middle")}`
  }).join("")}
</svg>`
const contactPath = path.join(outDir, "00-comparison.png")
const numberLabels = `<svg width="900" height="1200" xmlns="http://www.w3.org/2000/svg">
  ${[1,2,3,4].map((n, index) => {
    const x = (index % 2 ? 463 : 32) + 34
    const y = (index < 2 ? 132 : 685) + 34
    return `<circle cx="${x}" cy="${y}" r="23" fill="#137ee8"/>${text(x, y + 8, n, 24, "#fff", 800, "middle")}`
  }).join("")}
</svg>`
await sharp({create: {width: 900, height: 1200, channels: 4, background: "#eef3f8"}})
  .composite([
    {input: Buffer.from(contact)},
    {input: thumbs[0], top: 132, left: 32},
    {input: thumbs[1], top: 132, left: 463},
    {input: thumbs[2], top: 685, left: 32},
    {input: thumbs[3], top: 685, left: 463},
    {input: Buffer.from(numberLabels)}
  ])
  .png({compressionLevel: 9})
  .toFile(contactPath)

await fs.writeFile(path.join(outDir, "manifest.json"), JSON.stringify({
  size: {width: 1080, height: 1440},
  sourceAssets: {miniCode, qrCode, pinkSky, sunset},
  exports: outputs,
  comparison: contactPath,
  note: "二维码和小程序码均由用户提供，按原始比例以最近邻缩放叠加；校园照片来自项目现有真实素材。"
}, null, 2))

console.log(JSON.stringify({outputs, contactPath}, null, 2))
