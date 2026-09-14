import sharp from '../../../server/node_modules/sharp/dist/index.mjs'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const outDir = path.dirname(fileURLToPath(import.meta.url))
const qrPath = '/Users/a/Library/Containers/com.tencent.xinWeChat/Data/Documents/xwechat_files/wxid_u3dr27l82k7l22_310e/temp/RWTemp/2026-08/9e20f478899dc29eb19741386f9343c8/4f6e7fde295b58288ce792108585a83b.jpg'
const W = 1748
const H = 2480
const font = 'Hiragino Sans GB, PingFang SC, sans-serif'

const routes = [
  {
    id: 'A-青春大片',
    bg: '/Users/a/.codex/generated_images/019fa443-4451-7cf2-91e1-61f70ff8356c/exec-da3570d8-448e-4132-8232-5e1f3c2792d4.png',
    navy: '#102A43', blue: '#1677FF', pale: '#EFF7FF', accent: '#FF6B6B',
    eyebrow: 'WELCOME TO TSU · 2026', title1: '新同学，', title2: '欢迎来到唐院',
    subtitle: '你的校园生活，从星尘校园圈开始', heroH: 1320
  },
  {
    id: 'B-日落潮流',
    bg: '/Users/a/.codex/generated_images/019fa443-4451-7cf2-91e1-61f70ff8356c/exec-e52157f1-28c2-4f9f-a736-5245aa23cb6f.png',
    navy: '#172554', blue: '#2563EB', pale: '#FFF7ED', accent: '#F97316',
    eyebrow: 'STARDUST CAMPUS · 开学季', title1: '大学新生活，', title2: '从这一站出发',
    subtitle: '课表、服务、校园动态，一个小程序就够了', heroH: 1320
  },
  {
    id: 'C-未来校园',
    bg: '/Users/a/.codex/generated_images/019fa443-4451-7cf2-91e1-61f70ff8356c/exec-b68ca8ec-446f-4a38-8583-eb7692b4b903.png',
    navy: '#082F49', blue: '#0284C7', pale: '#ECFEFF', accent: '#06B6D4',
    eyebrow: 'STARDUST · CAMPUS ECOSYSTEM', title1: '一站连接，', title2: '你的大学生活',
    subtitle: '为唐山学院同学打造的校园生活入口', heroH: 1320
  }
]

const esc = (s) => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')

async function makeFlyer(r) {
  const hero = await sharp(r.bg)
    .resize(W, r.heroH, { fit: 'cover', position: 'centre' })
    .png()
    .toBuffer()
  const qr = await sharp(qrPath)
    .resize(420, 420, { fit: 'fill', kernel: 'nearest' })
    .png()
    .toBuffer()

  const svg = `
  <svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="shade" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#06182C" stop-opacity=".72"/>
        <stop offset=".62" stop-color="#06182C" stop-opacity=".1"/>
        <stop offset="1" stop-color="#06182C" stop-opacity=".68"/>
      </linearGradient>
      <filter id="shadow"><feDropShadow dx="0" dy="16" stdDeviation="22" flood-opacity=".16"/></filter>
    </defs>
    <rect width="${W}" height="${r.heroH}" fill="url(#shade)"/>
    <rect x="90" y="94" width="410" height="64" rx="32" fill="#FFFFFF" fill-opacity=".18" stroke="#FFFFFF" stroke-opacity=".5"/>
    <text x="125" y="137" fill="#FFFFFF" font-family="${font}" font-size="28" font-weight="700" letter-spacing="2">${esc(r.eyebrow)}</text>
    <text x="92" y="300" fill="#FFFFFF" font-family="${font}" font-size="96" font-weight="700">${esc(r.title1)}</text>
    <text x="92" y="414" fill="#FFFFFF" font-family="${font}" font-size="112" font-weight="800">${esc(r.title2)}</text>
    <rect x="94" y="465" width="124" height="12" rx="6" fill="${r.accent}"/>
    <text x="94" y="544" fill="#FFFFFF" font-family="${font}" font-size="38" font-weight="500">${esc(r.subtitle)}</text>

    <rect y="${r.heroH - 50}" width="${W}" height="${H-r.heroH+50}" rx="50" fill="#FFFFFF"/>
    <text x="92" y="1438" fill="${r.navy}" font-family="${font}" font-size="60" font-weight="800">星尘校园圈</text>
    <text x="92" y="1500" fill="#64748B" font-family="${font}" font-size="30">新生入学后真正用得上的校园生活工具</text>

    <g font-family="${font}">
      <g transform="translate(92 1575)">
        <rect width="520" height="178" rx="34" fill="${r.pale}"/>
        <circle cx="74" cy="72" r="40" fill="${r.blue}"/><text x="74" y="85" text-anchor="middle" fill="#fff" font-size="34" font-weight="800">01</text>
        <text x="136" y="65" fill="${r.navy}" font-size="36" font-weight="750">智能课表</text>
        <text x="136" y="111" fill="#64748B" font-size="27">图片导入 · 今日课程</text>
      </g>
      <g transform="translate(642 1575)">
        <rect width="520" height="178" rx="34" fill="${r.pale}"/>
        <circle cx="74" cy="72" r="40" fill="${r.blue}"/><text x="74" y="85" text-anchor="middle" fill="#fff" font-size="34" font-weight="800">02</text>
        <text x="136" y="65" fill="${r.navy}" font-size="36" font-weight="750">校园服务</text>
        <text x="136" y="111" fill="#64748B" font-size="27">外卖 · 快递 · 闲置</text>
      </g>
      <g transform="translate(92 1780)">
        <rect width="520" height="178" rx="34" fill="${r.pale}"/>
        <circle cx="74" cy="72" r="40" fill="${r.blue}"/><text x="74" y="85" text-anchor="middle" fill="#fff" font-size="34" font-weight="800">03</text>
        <text x="136" y="65" fill="${r.navy}" font-size="36" font-weight="750">校园圈</text>
        <text x="136" y="111" fill="#64748B" font-size="27">动态 · 交流 · 失物招领</text>
      </g>
      <g transform="translate(642 1780)">
        <rect width="520" height="178" rx="34" fill="${r.pale}"/>
        <circle cx="74" cy="72" r="40" fill="${r.blue}"/><text x="74" y="85" text-anchor="middle" fill="#fff" font-size="34" font-weight="800">04</text>
        <text x="136" y="65" fill="${r.navy}" font-size="36" font-weight="750">校园榜单</text>
        <text x="136" y="111" fill="#64748B" font-size="27">同学推荐 · 真实点赞</text>
      </g>
    </g>

    <g filter="url(#shadow)">
      <rect x="1210" y="1390" width="476" height="690" rx="46" fill="#FFFFFF"/>
      <rect x="1238" y="1418" width="420" height="420" rx="18" fill="#fff"/>
      <rect x="1280" y="1870" width="336" height="74" rx="37" fill="${r.blue}"/>
      <text x="1448" y="1919" text-anchor="middle" fill="#fff" font-family="${font}" font-size="30" font-weight="750">微信扫码体验</text>
      <text x="1448" y="1992" text-anchor="middle" fill="${r.navy}" font-family="${font}" font-size="28" font-weight="700">星尘校园圈</text>
      <text x="1448" y="2032" text-anchor="middle" fill="#94A3B8" font-family="${font}" font-size="22">唐山学院校园生活入口</text>
    </g>

    <line x1="92" y1="2165" x2="1656" y2="2165" stroke="#E2E8F0" stroke-width="2"/>
    <text x="92" y="2255" fill="${r.navy}" font-family="${font}" font-size="46" font-weight="800">开学不迷路，校园生活一步到位</text>
    <text x="92" y="2320" fill="#64748B" font-family="${font}" font-size="29">微信搜索“星尘校园圈”，或扫描右侧小程序码立即进入</text>
    <rect x="92" y="2375" width="1564" height="4" fill="${r.blue}"/>
    <text x="92" y="2435" fill="#94A3B8" font-family="${font}" font-size="21">本宣传单用于唐山学院迎新场景 · 页面功能以小程序实际开放为准</text>
  </svg>`

  const out = path.join(outDir, `星尘校园圈-迎新传单-${r.id}.png`)
  await sharp({ create: { width: W, height: H, channels: 4, background: '#FFFFFF' } })
    .composite([
      { input: hero, top: 0, left: 0 },
      { input: Buffer.from(svg), top: 0, left: 0 },
      { input: qr, top: 1418, left: 1238 }
    ])
    .withMetadata({ density: 300 })
    .png({ compressionLevel: 9 })
    .toFile(out)
  return out
}

await fs.mkdir(outDir, { recursive: true })
const outputs = []
for (const route of routes) outputs.push(await makeFlyer(route))

const thumbs = await Promise.all(outputs.map(p => sharp(p).resize(520, 738, { fit: 'contain', background: '#EEF2F7' }).png().toBuffer()))
const sheet = path.join(outDir, '星尘校园圈-迎新传单-三版对比.png')
await sharp({ create: { width: 1680, height: 830, channels: 4, background: '#E9EEF5' } })
  .composite(thumbs.map((input, i) => ({ input, left: 30 + i * 550, top: 30 })))
  .png()
  .toFile(sheet)

console.log(outputs.concat(sheet).join('\n'))
