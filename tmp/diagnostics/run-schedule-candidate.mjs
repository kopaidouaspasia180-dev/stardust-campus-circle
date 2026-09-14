import fs from "node:fs/promises"
import {createScheduleRecognizer} from "/opt/stardust-campus-circle-api/src/schedule-ai-candidate.mjs"

const buffer = await fs.readFile("/opt/stardust-campus-circle-api/tmp-schedule-real.jpg")
let ocrBlocks = []
const recognizer = createScheduleRecognizer({
  deepseekApiBase: process.env.DEEPSEEK_API_BASE,
  deepseekApiKey: process.env.DEEPSEEK_API_KEY,
  deepseekModel: process.env.DEEPSEEK_MODEL,
  ocrApiUrl: process.env.DEEPSEEK_OCR_API_URL,
  ocrApiKey: process.env.DEEPSEEK_OCR_API_KEY,
  ocrModel: process.env.DEEPSEEK_OCR_MODEL,
  onOcrBlocks(value) {
    ocrBlocks = value
  }
})
const startedAt = Date.now()
const result = await recognizer.recognize({buffer, mimeType: "image/jpeg"})
console.log(JSON.stringify({
  elapsedSeconds: Number(((Date.now() - startedAt) / 1000).toFixed(2)),
  count: result.items.length,
  items: result.items,
  ocrBlocks: ocrBlocks.map(item => ({label: item.label, length: item.content.length, preview: item.content.slice(0, 240)}))
}, null, 2))
