import assert from "node:assert/strict"
import test from "node:test"
import {alignItemsToLayout, createScheduleRecognizer, extractScheduleLayoutHints, normalizeScheduleItems, parseScheduleJson, scheduleRecognitionMinimum, splitScheduleCells, splitScheduleColumns} from "../src/schedule-ai.js"
import sharp from "sharp"

test("normalizeScheduleItems keeps complete unique courses and trims untrusted fields", () => {
  const items = normalizeScheduleItems([
    {courseName: " 数据结构（B） ", timeText: " 周二 1-2节（1-16周） ", classroom: "B-204", instructor: "张老师"},
    {name: "数据结构（B）", time: "周二 1-2节（1-16周）", room: "B-204", teacher: "张老师"},
    {name: "缺少时间", time: ""},
    null
  ])
  assert.deepEqual(items, [{
    name: "数据结构（B）",
    time: "周二 1-2节（1-16周）",
    room: "B-204",
    teacher: "张老师"
  }])
})

test("parseScheduleJson accepts fenced DeepSeek JSON output", () => {
  const items = parseScheduleJson(`\`\`\`json
  {"items":[
    {"name":"大学英语","time":"周一 3-4节（1-8周）","room":"A-102","teacher":"李老师"},
    {"name":"高等数学","time":"周三 1-2节","room":"","teacher":""}
  ]}
  \`\`\``)
  assert.equal(items.length, 2)
  assert.equal(items[0].name, "大学英语")
  assert.equal(items[1].time, "周三 1-2节")
})

test("alignItemsToLayout corrects weekday shifts from wide timetable OCR", () => {
  const items = [
    {name: "A", time: "星期一 5-6节", room: "", teacher: ""},
    {name: "B", time: "星期五 7-8节", room: "", teacher: ""}
  ]
  alignItemsToLayout(items, [
    {row: 1, weekdays: ["星期五"]},
    {row: 2, weekdays: ["星期一"]}
  ])
  assert.equal(items[0].time, "星期五 5-6节")
  assert.equal(items[1].time, "星期一 7-8节")
})

test("alignItemsToLayout matches layout by period instead of model output order", () => {
  const items = [
    {name: "C", time: "星期二 5-6节", room: "", teacher: ""},
    {name: "A", time: "星期一 1-2节", room: "", teacher: ""},
    {name: "B", time: "星期二 1-2节", room: "", teacher: ""},
    {name: "D", time: "星期三 1-2节", room: "", teacher: ""}
  ]
  alignItemsToLayout(items, [
    {row: 1, periods: "1-2", weekdays: ["星期二", "星期四", "星期五"]},
    {row: 3, periods: "5-6", weekdays: ["星期一"]}
  ])
  assert.deepEqual(items.map(item => item.time), [
    "星期一 5-6节",
    "星期二 1-2节",
    "星期四 1-2节",
    "星期五 1-2节"
  ])
})

test("wide timetable recognition does not accept an implausibly small partial result", () => {
  assert.equal(scheduleRecognitionMinimum(17, true), 12)
  assert.equal(scheduleRecognitionMinimum(2, true), 5)
  assert.equal(scheduleRecognitionMinimum(17, false), 1)
})

test("schedule recognizer reads the whole timetable text first, then uses weekday columns and a precision pass", async () => {
  const calls = []
  const recognizer = createScheduleRecognizer({
    deepseekApiBase: "https://api.deepseek.test",
    deepseekApiKey: "deepseek-key",
    deepseekModel: "deepseek-v4-flash",
    ocrApiUrl: "https://ocr.deepseek.test/v1",
    ocrApiKey: "ocr-key",
    ocrModel: "deepseek-ai/DeepSeek-OCR",
    extractLayoutHints: async () => [],
    fetchImpl: async (url, options) => {
      calls.push({url, body: JSON.parse(options.body)})
      if (String(url).includes("ocr.deepseek")) {
        return new Response(JSON.stringify({choices: [{message: {content: "周一 1-2节 数据结构 B-204 张老师"}}]}), {
          status: 200,
          headers: {"content-type": "application/json"}
        })
      }
      return new Response(JSON.stringify({choices: [{message: {content: "{\"items\":[{\"name\":\"数据结构\",\"time\":\"周一 1-2节\",\"room\":\"B-204\",\"teacher\":\"张老师\"}]}"}}]}), {
        status: 200,
        headers: {"content-type": "application/json"}
      })
    }
  })
  const wideImage = await sharp({
    create: {width: 1400, height: 500, channels: 3, background: "white"}
  }).png().toBuffer()
  const result = await recognizer.recognize({buffer: wideImage, mimeType: "image/png"})
  assert.equal(result.items.length, 1)
  assert.equal(result.provider, "星尘智能识别")
  assert.equal(calls.length, 11)
  assert.equal(calls[0].body.model, "Qwen/Qwen3-VL-235B-A22B-Instruct")
  assert.match(calls[0].body.messages[0].content[1].text, /星期一到星期日/)
  assert.ok(calls.slice(1, 8).every(call => call.body.model === "deepseek-ai/DeepSeek-OCR"))
  assert.ok(calls.slice(1, 8).every(call => /^data:image\/jpeg;base64,/.test(call.body.messages[0].content[0].image_url.url)))
  assert.ok(calls.slice(0, 8).every(call => call.body.messages[0].content[0].image_url.detail === "high"))
  assert.ok(calls.slice(1, 8).every(call => call.body.messages[0].content[1].text === "Free OCR."))
  assert.equal(calls[8].body.model, "deepseek-v4-flash")
  assert.equal(typeof calls[8].body.messages[1].content, "string")
  assert.match(calls[8].body.messages[1].content, /【整张课表文字】/)
  assert.match(calls[8].body.messages[1].content, /【星期一】/)
  assert.match(calls[8].body.messages[1].content, /【星期日】/)
  assert.doesNotMatch(calls[8].body.messages[1].content, /data:image/)
  assert.equal(calls[9].body.model, "Qwen/Qwen3-VL-235B-A22B-Instruct")
  assert.match(calls[9].body.messages[0].content[1].text, /不能只摘录/)
  assert.equal(calls[10].body.model, "deepseek-v4-flash")
  assert.match(calls[10].body.messages[1].content, /整张课表补充识别/)
})

test("schedule recognizer falls back to the existing OCR model when the stronger vision model is unavailable", async () => {
  const calls = []
  const recognizer = createScheduleRecognizer({
    deepseekApiBase: "https://api.deepseek.test",
    deepseekApiKey: "deepseek-key",
    deepseekModel: "deepseek-v4-flash",
    ocrApiUrl: "https://api.siliconflow.test/v1",
    ocrApiKey: "ocr-key",
    ocrModel: "deepseek-ai/DeepSeek-OCR",
    visionModel: "Qwen/Qwen3-VL-235B-A22B-Instruct",
    extractLayoutHints: async () => [],
    fetchImpl: async (url, options) => {
      const body = JSON.parse(options.body)
      calls.push(body)
      if (body.model === "Qwen/Qwen3-VL-235B-A22B-Instruct") {
        return new Response(JSON.stringify({message: "model unavailable"}), {status: 400})
      }
      if (String(url).includes("siliconflow")) {
        return new Response(JSON.stringify({choices: [{message: {content: "周一 1-2节 数据结构 B-204 张老师"}}]}), {status: 200})
      }
      return new Response(JSON.stringify({choices: [{message: {content: "{\"items\":[{\"name\":\"数据结构\",\"time\":\"周一 1-2节\",\"room\":\"B-204\",\"teacher\":\"张老师\"}]}"}}]}), {status: 200})
    }
  })
  const image = await sharp({create: {width: 600, height: 900, channels: 3, background: "white"}}).png().toBuffer()
  const result = await recognizer.recognize({buffer: image, mimeType: "image/png"})
  assert.equal(result.items.length, 1)
  assert.deepEqual(calls.slice(0, 2).map(call => call.model), [
    "Qwen/Qwen3-VL-235B-A22B-Instruct",
    "deepseek-ai/DeepSeek-OCR"
  ])
  assert.match(calls[1].messages[0].content[1].text, /Extract all tables/)
})

test("schedule recognizer keeps the more complete result from the precision pass", async () => {
  const image = await sharp({create: {width: 1400, height: 500, channels: 3, background: "white"}}).png().toBuffer()
  const crop = await sharp({create: {width: 80, height: 80, channels: 3, background: "white"}}).jpeg().toBuffer()
  let structuringCalls = 0
  const course = index => ({name: `课程${index + 1}`, time: `周${index < 5 ? "一" : "二"} ${index % 5 * 2 + 1}-${index % 5 * 2 + 2}节`, room: `教室${index + 1}`, teacher: "老师"})
  const recognizer = createScheduleRecognizer({
    deepseekApiBase: "https://api.deepseek.test",
    deepseekApiKey: "deepseek-key",
    deepseekModel: "deepseek-v4-flash",
    ocrApiUrl: "https://ocr.deepseek.test/v1",
    ocrApiKey: "ocr-key",
    ocrModel: "deepseek-ai/DeepSeek-OCR",
    extractLayoutHints: async () => [
      {row: 1, weekdays: ["星期一", "星期二", "星期三", "星期四", "星期五"]},
      {row: 2, weekdays: ["星期一", "星期二", "星期三", "星期四", "星期五"]}
    ],
    splitColumns: async () => ["星期一", "星期二", "星期三", "星期四", "星期五", "星期六", "星期日"].map(weekday => ({weekday, buffer: crop, mimeType: "image/jpeg"})),
    splitCells: async () => Array.from({length: 10}, (_, index) => ({weekday: index < 5 ? "星期一" : "星期二", label: `${index < 5 ? "星期一" : "星期二"} 第${index % 5 * 2 + 1}-${index % 5 * 2 + 2}节`, buffer: crop, mimeType: "image/jpeg"})),
    fetchImpl: async url => {
      if (String(url).includes("ocr.deepseek")) {
        return new Response(JSON.stringify({choices: [{message: {content: "课程文字 教室 老师"}}]}), {status: 200})
      }
      structuringCalls += 1
      const count = structuringCalls === 1 ? 2 : 10
      return new Response(JSON.stringify({choices: [{message: {content: JSON.stringify({items: Array.from({length: count}, (_, index) => course(index))})}}]}), {status: 200})
    }
  })
  const result = await recognizer.recognize({buffer: image, mimeType: "image/png"})
  assert.equal(structuringCalls, 2)
  assert.equal(result.items.length, 10)
})

test("splitScheduleColumns finds the last eight grid boundaries and returns seven readable crops", async () => {
  const width = 1200
  const height = 500
  const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <rect width="100%" height="100%" fill="white"/>
    <path d="M20 25H1180 M20 80H1180" stroke="black" stroke-width="3"/>
    ${[20, 70, 120, 270, 420, 570, 720, 870, 1020, 1180].map(x => `<path d="M${x} 25V480" stroke="black" stroke-width="3"/>`).join("")}
    <text x="145" y="65" font-size="24">星期一</text><text x="1040" y="65" font-size="24">星期日</text>
  </svg>`
  const input = await sharp(Buffer.from(svg)).jpeg().toBuffer()
  const columns = await splitScheduleColumns(input, "image/jpeg")
  assert.equal(columns.length, 7)
  assert.deepEqual(columns.map(item => item.weekday), ["星期一", "星期二", "星期三", "星期四", "星期五", "星期六", "星期日"])
  assert.ok(columns.every(item => Buffer.isBuffer(item.buffer) && item.buffer.length > 100))
  const hints = await extractScheduleLayoutHints(input)
  assert.ok(Array.isArray(hints))
})

test("splitScheduleCells extracts only occupied weekday and period cells", async () => {
  const width = 1400
  const height = 620
  const xs = [20, 90, 160, 330, 500, 670, 840, 1010, 1180, 1380]
  const ys = [25, 75, 180, 285, 390, 495, 600]
  const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <rect width="100%" height="100%" fill="white"/>
    ${ys.map(y => `<path d="M20 ${y}H1380" stroke="black" stroke-width="3"/>`).join("")}
    ${xs.map(x => `<path d="M${x} 25V600" stroke="black" stroke-width="3"/>`).join("")}
    <text x="175" y="135" font-size="24">大学英语 第1-6周</text>
    <text x="515" y="240" font-size="24">高等数学 单周</text>
  </svg>`
  const input = await sharp(Buffer.from(svg)).jpeg().toBuffer()
  const cells = await splitScheduleCells(input, "image/jpeg")
  assert.deepEqual(cells.map(item => item.label), ["星期一 第1-2节", "星期三 第3-4节"])
  assert.ok(cells.every(item => item.required && item.buffer.length > 100))
})

test("splitScheduleCells ignores a page heading rule above a lower timetable", async () => {
  const width = 1225
  const height = 741
  const xs = [48, 88, 127, 301, 475, 648, 821, 994, 1097, 1200]
  const ys = [112, 141, 217, 294, 371, 448, 544]
  const occupied = [
    [1, 0], [3, 0], [4, 0],
    [1, 1], [2, 1], [3, 1],
    [0, 2], [6, 4]
  ]
  const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <rect width="100%" height="100%" fill="white"/>
    <path d="M48 68H1200" stroke="black" stroke-width="7"/>
    ${ys.map(y => `<path d="M48 ${y}H1200" stroke="black" stroke-width="3"/>`).join("")}
    ${xs.map(x => `<path d="M${x} 112V544" stroke="black" stroke-width="3"/>`).join("")}
    ${occupied.map(([day, row], index) => `<text x="${xs[day + 2] + 10}" y="${ys[row + 1] + 44}" font-size="20">Course ${index + 1}</text>`).join("")}
  </svg>`
  const input = await sharp(Buffer.from(svg)).jpeg().toBuffer()
  const cells = await splitScheduleCells(input, "image/jpeg")
  assert.deepEqual(cells.map(item => item.label), [
    "星期二 第1-2节",
    "星期四 第1-2节",
    "星期五 第1-2节",
    "星期二 第3-4节",
    "星期三 第3-4节",
    "星期四 第3-4节",
    "星期一 第5-6节",
    "星期日 第9-10节"
  ])
})

test("schedule recognizer rejects a partial result after the precision pass", async () => {
  const image = await sharp({create: {width: 1225, height: 741, channels: 3, background: "white"}}).jpeg().toBuffer()
  const crop = await sharp({create: {width: 120, height: 80, channels: 3, background: "white"}}).jpeg().toBuffer()
  const weekdays = ["星期一", "星期二", "星期三", "星期四", "星期五", "星期六", "星期日"]
  const partial = {
    items: Array.from({length: 3}, (_, index) => ({
      name: `课程${index + 1}`,
      time: `星期一 第${index * 2 + 1}-${index * 2 + 2}节`,
      room: `A${index + 1}`,
      teacher: "老师"
    }))
  }
  const recognizer = createScheduleRecognizer({
    deepseekApiBase: "https://api.deepseek.test",
    deepseekApiKey: "deepseek-key",
    deepseekModel: "deepseek-v4-flash",
    ocrApiUrl: "https://ocr.deepseek.test/v1",
    ocrApiKey: "ocr-key",
    ocrModel: "deepseek-ai/DeepSeek-OCR",
    extractLayoutHints: async () => [{row: 1, weekdays}],
    splitColumns: async () => weekdays.map(weekday => ({weekday, buffer: crop, mimeType: "image/jpeg"})),
    splitCells: async () => Array.from({length: 8}, (_, index) => ({
      weekday: weekdays[index % weekdays.length],
      label: `${weekdays[index % weekdays.length]} 第1-2节`,
      buffer: crop,
      mimeType: "image/jpeg"
    })),
    fetchImpl: async url => new Response(JSON.stringify({
      choices: [{message: {content: String(url).includes("ocr.deepseek") ? "课程文字" : JSON.stringify(partial)}}]
    }), {status: 200})
  })
  await assert.rejects(
    () => recognizer.recognize({buffer: image, mimeType: "image/jpeg"}),
    /预计有 8 个有课单元格，仅识别出 3 条/
  )
})

test("schedule recognizer fails clearly when DeepSeek OCR is not configured", async () => {
  const recognizer = createScheduleRecognizer({deepseekApiKey: "key"})
  await assert.rejects(
    () => recognizer.recognize({buffer: Buffer.from("image"), mimeType: "image/png"}),
    /课表识别服务尚未配置/
  )
})
