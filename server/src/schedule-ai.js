import sharp from "sharp"

const DEFAULT_DEEPSEEK_BASE = "https://api.deepseek.com"
const DEFAULT_DEEPSEEK_MODEL = "deepseek-ai/DeepSeek-V3.2"
const DEFAULT_OCR_MODEL = "deepseek-ai/DeepSeek-OCR"
const DEFAULT_VISION_MODEL = "Qwen/Qwen3-VL-235B-A22B-Instruct"
const WEEKDAYS = ["星期一", "星期二", "星期三", "星期四", "星期五", "星期六", "星期日"]
const PERIOD_LABELS = ["1-2", "3-4", "5-6", "7-8", "9-10", "11-12"]

function cleanText(value, max) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max)
}

function completionUrl(baseUrl) {
  return `${String(baseUrl || "").trim().replace(/\/$/, "")}/chat/completions`
}

function providerError(message, detail) {
  const error = new Error(message)
  error.status = 503
  if (detail) error.cause = detail
  return error
}

function extractCompletionText(payload) {
  const content = payload?.choices?.[0]?.message?.content
  if (typeof content === "string") return content.trim()
  if (Array.isArray(content)) {
    return content.map(item => typeof item === "string" ? item : item?.text || "").join("\n").trim()
  }
  return ""
}

function cleanOcrText(value) {
  return String(value || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\[\[\s*\d+(?:\s*,\s*\d+){3}\s*\]\]/g, " ")
    .replace(/^[\s"'>]+/, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

function isDeepSeekOcrModel(model) {
  return /deepseek[-_/]?ocr/i.test(String(model || ""))
}

function visionPrompt(model, kind) {
  if (isDeepSeekOcrModel(model)) {
    if (kind === "cell") return "<|grounding|>Convert the document to markdown."
    if (kind === "whole") return "<|grounding|>Extract all tables and convert to markdown format."
    return "Free OCR."
  }
  const scope = kind === "whole"
    ? "整张大学课表"
    : kind === "column"
      ? "这一列星期课表"
      : "这个课程单元格"
  return [
    `请逐字识别${scope}中的全部可见文字，并保留原始表格含义。`,
    "重点读取每个非空课程格的课程名、教师、周次、单双周、节次、教室和校区。",
    "整张课表必须覆盖星期一到星期日以及从上午到晚上的所有非空单元格，不能只摘录最清晰的几门课。",
    "按星期和节次组织为 Markdown 表格或分组清单；不要总结、不要改写、不要合并同名但上课时间不同的课程。",
    "看不清的局部原样保留并标记为[不清晰]，不要凭空补写。只输出识别结果。"
  ].join("\n")
}

async function mapWithConcurrency(items, concurrency, handler) {
  const results = new Array(items.length)
  let cursor = 0
  async function worker() {
    while (cursor < items.length) {
      const index = cursor
      cursor += 1
      results[index] = await handler(items[index], index)
    }
  }
  await Promise.all(Array.from({length: Math.min(concurrency, items.length)}, () => worker()))
  return results
}

function groupNearbyXs(xs, gap = 4) {
  const groups = []
  for (const x of xs) {
    const current = groups.at(-1)
    if (!current || x - current.at(-1) > gap) groups.push([x])
    else current.push(x)
  }
  return groups.map(group => Math.round(group.reduce((sum, x) => sum + x, 0) / group.length))
}

async function findWeekdayBounds(buffer) {
  const image = sharp(buffer).grayscale()
  const {width = 0, height = 0} = await image.metadata()
  if (width < 280 || height < 180) return null
  const {data} = await image.raw().toBuffer({resolveWithObject: true})
  const selectBounds = lineXs => {
    const lines = groupNearbyXs(lineXs).filter(x => x > width * 0.001 && x < width - 1)
    if (lines.length < 8) return null
    const bounds = lines.slice(-8)
    return bounds.every((x, index) => index === 0 || x - bounds[index - 1] >= width * 0.045)
      ? bounds
      : null
  }
  const bands = [
    [0.045, 0.18],
    [0.055, 0.14],
    [0.03, 0.12]
  ]
  for (const [startRatio, endRatio] of bands) {
    const startY = Math.max(0, Math.floor(height * startRatio))
    const endY = Math.min(height, Math.ceil(height * endRatio))
    const bandHeight = Math.max(1, endY - startY)
    const lineXs = []
    for (let x = 0; x < width; x += 1) {
      let consecutive = 0
      let longestRun = 0
      for (let y = startY; y < endY; y += 1) {
        if (data[y * width + x] < 105) {
          consecutive += 1
          longestRun = Math.max(longestRun, consecutive)
        } else {
          consecutive = 0
        }
      }
      if (longestRun / bandHeight >= 0.65) lineXs.push(x)
    }
    const bounds = selectBounds(lineXs)
    if (bounds) return bounds
  }

  // 学校导出的课表常带有较高的页眉，竖向表格线可能要到图片 15%
  // 以后才开始。固定扫描顶部窄区间会完全错过这类课表，并让后续
  // 按宽度均分的兜底逻辑将课程文字从中间切断。因此再扫描主体区域，
  // 只接受跨越多个节次行的长竖线，避免把普通文字笔画当成表格线。
  const startY = Math.max(0, Math.floor(height * 0.08))
  const endY = Math.min(height, Math.ceil(height * 0.96))
  const lineXs = []
  for (let x = 0; x < width; x += 1) {
    let consecutive = 0
    let longestRun = 0
    let darkPixels = 0
    for (let y = startY; y < endY; y += 1) {
      if (data[y * width + x] < 175) {
        consecutive += 1
        darkPixels += 1
        longestRun = Math.max(longestRun, consecutive)
      } else {
        consecutive = 0
      }
    }
    if (longestRun >= height * 0.28 || darkPixels >= height * 0.38) lineXs.push(x)
  }
  return selectBounds(lineXs)
}

async function findHorizontalBounds(buffer, weekdayBounds) {
  const image = sharp(buffer).grayscale()
  const {width = 0, height = 0} = await image.metadata()
  if (!width || !height || !weekdayBounds?.length) return []
  const {data} = await image.raw().toBuffer({resolveWithObject: true})
  const horizontalYs = []
  for (let y = 0; y < height; y += 1) {
    let dark = 0
    let total = 0
    for (let x = weekdayBounds[0]; x <= weekdayBounds[7]; x += 1) {
      total += 1
      if (data[y * width + x] < 150) dark += 1
    }
    if (total && dark / total >= 0.5) horizontalYs.push(y)
  }
  const candidates = groupNearbyXs(horizontalYs)
  // 页眉分隔线也可能横跨整张图，但它不会与星期列的竖线交叉。
  // 只保留在至少 6 个星期列边界处存在深色交点的横线，避免把标题
  // 下划线当成课表顶边，导致所有节次整体向下错一行。
  return candidates.filter(y => {
    let intersections = 0
    for (const x of weekdayBounds) {
      let verticalDark = 0
      for (let offsetY = -20; offsetY <= 20; offsetY += 1) {
        if (Math.abs(offsetY) <= 4) continue
        const sampleY = y + offsetY
        if (sampleY < 0 || sampleY >= height) continue
        let foundAtY = false
        for (let offsetX = -2; offsetX <= 2; offsetX += 1) {
          const sampleX = x + offsetX
          if (sampleX < 0 || sampleX >= width) continue
          if (data[sampleY * width + sampleX] < 180) {
            foundAtY = true
            break
          }
        }
        if (foundAtY) verticalDark += 1
      }
      if (verticalDark >= 10) intersections += 1
    }
    return intersections >= 6
  })
}

export async function splitScheduleCells(buffer, mimeType = "image/jpeg") {
  const image = sharp(buffer).grayscale()
  const {width = 0, height = 0} = await image.metadata()
  const weekdayBounds = await findWeekdayBounds(buffer)
  if (!weekdayBounds || !width || !height) return []
  const horizontalBounds = await findHorizontalBounds(buffer, weekdayBounds)
  if (horizontalBounds.length < 3) return []
  const firstGap = horizontalBounds[1] - horizontalBounds[0]
  const rowBounds = firstGap < height * 0.12 ? horizontalBounds.slice(1) : horizontalBounds
  if (rowBounds.length < 2) return []
  const {data} = await image.raw().toBuffer({resolveWithObject: true})
  const cells = []
  for (let rowIndex = 0; rowIndex < Math.min(rowBounds.length - 1, PERIOD_LABELS.length); rowIndex += 1) {
    const top = rowBounds[rowIndex] + 5
    const bottom = rowBounds[rowIndex + 1] - 5
    if (bottom - top < 20) continue
    for (let dayIndex = 0; dayIndex < 7; dayIndex += 1) {
      const left = weekdayBounds[dayIndex] + 5
      const right = weekdayBounds[dayIndex + 1] - 5
      if (right - left < 20) continue
      let dark = 0
      let total = 0
      for (let y = top; y < bottom; y += 1) {
        for (let x = left; x < right; x += 1) {
          total += 1
          if (data[y * width + x] < 150) dark += 1
        }
      }
      if (!total || dark / total < 0.012) continue
      const output = await sharp(buffer)
        .extract({left, top, width: right - left, height: bottom - top})
        .resize({width: 900, withoutEnlargement: false})
        .extend({left: 80, right: 80, top: 50, bottom: 50, background: "white"})
        .jpeg({quality: 90, chromaSubsampling: "4:4:4"})
        .toBuffer()
      cells.push({
        weekday: WEEKDAYS[dayIndex],
        periods: PERIOD_LABELS[rowIndex],
        label: `${WEEKDAYS[dayIndex]} 第${PERIOD_LABELS[rowIndex]}节`,
        buffer: output,
        mimeType: "image/jpeg",
        sourceMimeType: mimeType,
        required: true
      })
    }
  }
  return cells
}

export async function splitScheduleColumns(buffer, mimeType = "image/jpeg") {
  const image = sharp(buffer)
  const {width = 0, height = 0} = await image.metadata()
  if (!width || !height) throw providerError("课表图片格式无法识别")
  const detected = await findWeekdayBounds(buffer)
  const bounds = detected || Array.from({length: 8}, (_, index) => Math.round(width * (0.06 + index * 0.88 / 7)))
  const top = Math.max(0, Math.floor(height * 0.045))
  return Promise.all(WEEKDAYS.map(async (weekday, index) => {
    const left = Math.max(0, bounds[index] + 2)
    const right = Math.min(width, bounds[index + 1] - 2)
    const cropWidth = Math.max(8, right - left)
    const output = await sharp(buffer)
      .extract({left, top, width: cropWidth, height: height - top})
      .resize({width: 700, withoutEnlargement: false})
      .extend({left: 220, right: 220, top: 70, bottom: 70, background: "white"})
      .jpeg({quality: 88, chromaSubsampling: "4:4:4"})
      .toBuffer()
    return {weekday, buffer: output, mimeType: "image/jpeg", sourceMimeType: mimeType}
  }))
}

export async function extractScheduleLayoutHints(buffer) {
  const image = sharp(buffer).grayscale()
  const {width = 0, height = 0} = await image.metadata()
  const bounds = await findWeekdayBounds(buffer)
  if (!bounds || !width || !height) return []
  const {data} = await image.raw().toBuffer({resolveWithObject: true})
  const lines = await findHorizontalBounds(buffer, bounds)
  if (lines.length < 3) return []
  const rows = []
  for (let rowIndex = 1; rowIndex < lines.length - 1; rowIndex += 1) {
    const top = lines[rowIndex] + 6
    const bottom = lines[rowIndex + 1] - 6
    if (bottom - top < 20) continue
    const occupied = []
    for (let dayIndex = 0; dayIndex < 7; dayIndex += 1) {
      const left = bounds[dayIndex] + 8
      const right = bounds[dayIndex + 1] - 8
      let dark = 0
      let total = 0
      for (let y = top; y < bottom; y += 1) {
        for (let x = left; x < right; x += 1) {
          total += 1
          if (data[y * width + x] < 150) dark += 1
        }
      }
      if (total && dark / total >= 0.018) occupied.push(WEEKDAYS[dayIndex])
    }
    if (occupied.length) rows.push({
      row: rowIndex,
      periods: PERIOD_LABELS[rowIndex - 1] || "",
      weekdays: occupied
    })
  }
  return rows
}

export function normalizeScheduleItems(value, limit = 80) {
  const source = Array.isArray(value) ? value : []
  const seen = new Set()
  const items = []
  for (const entry of source) {
    if (!entry || typeof entry !== "object") continue
    const name = cleanText(entry.name || entry.course || entry.courseName, 80)
    const time = cleanText(entry.time || entry.time_text || entry.timeText, 80)
    const room = cleanText(entry.room || entry.classroom || entry.location, 80)
    const teacher = cleanText(entry.teacher || entry.instructor, 80)
    if (name.length < 2 || time.length < 2) continue
    const key = `${name}\u0000${time}\u0000${room}\u0000${teacher}`.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    items.push({name, time, room, teacher})
    if (items.length >= limit) break
  }
  return items
}

export function parseScheduleJson(value) {
  const raw = String(value || "").trim()
  if (!raw) return []
  const withoutFence = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim()
  const candidates = [withoutFence]
  const objectStart = withoutFence.indexOf("{")
  const objectEnd = withoutFence.lastIndexOf("}")
  if (objectStart >= 0 && objectEnd > objectStart) candidates.push(withoutFence.slice(objectStart, objectEnd + 1))
  const arrayStart = withoutFence.indexOf("[")
  const arrayEnd = withoutFence.lastIndexOf("]")
  if (arrayStart >= 0 && arrayEnd > arrayStart) candidates.push(withoutFence.slice(arrayStart, arrayEnd + 1))
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate)
      const items = normalizeScheduleItems(Array.isArray(parsed) ? parsed : parsed?.items || parsed?.courses)
      if (items.length) return items
    } catch {}
  }
  return []
}

function periodKey(time) {
  const match = String(time || "").match(/(\d{1,2})\s*[-~—至]\s*(\d{1,2})\s*节/)
  return match ? `${match[1]}-${match[2]}` : ""
}

export function alignItemsToLayout(items, layoutHints) {
  if (!Array.isArray(items) || !Array.isArray(layoutHints) || !layoutHints.length) return items
  const groups = []
  const byPeriod = new Map()
  for (const item of items) {
    const key = periodKey(item.time)
    if (!key) continue
    if (!byPeriod.has(key)) {
      const group = {key, items: []}
      byPeriod.set(key, group)
      groups.push(group)
    }
    byPeriod.get(key).items.push(item)
  }
  const hasPeriodHints = layoutHints.some(item => cleanText(item?.periods, 20))
  for (let index = 0; index < groups.length; index += 1) {
    const group = groups[index]
    const hint = hasPeriodHints
      ? layoutHints.find(item => cleanText(item?.periods, 20) === group.key)
      : layoutHints[index]
    const weekdays = hint?.weekdays || []
    if (group.items.length !== weekdays.length) continue
    group.items.forEach((item, itemIndex) => {
      const weekday = weekdays[itemIndex]
      item.time = /(?:星期|周)[一二三四五六日天]/.test(item.time)
        ? item.time.replace(/(?:星期|周)[一二三四五六日天]/, weekday)
        : `${weekday} ${item.time}`
    })
  }
  return items
}

export function scheduleRecognitionMinimum(expectedVisualCount, wideSchedule = true) {
  if (!wideSchedule) return 1
  const expected = Math.max(0, Number(expectedVisualCount) || 0)
  // 横向课表即使像素定位暂时只找到少数格子，也不应因为先识别出 1-2 门课
  // 就提前结束。5 门是触发第二轮精细识别的下限，不是导入门槛。
  return expected >= 6 ? Math.max(5, Math.ceil(expected * 0.65)) : 5
}

export function createScheduleRecognizer(options = {}) {
  const fetchImpl = options.fetchImpl || fetch
  const deepseekApiBase = String(options.deepseekApiBase || DEFAULT_DEEPSEEK_BASE).trim().replace(/\/$/, "")
  const deepseekApiKey = String(options.deepseekApiKey || "").trim()
  const deepseekModel = String(options.deepseekModel || DEFAULT_DEEPSEEK_MODEL).trim()
  const ocrApiUrl = String(options.ocrApiUrl || "").trim().replace(/\/$/, "")
  const ocrApiKey = String(options.ocrApiKey || "").trim()
  const ocrModel = String(options.ocrModel || DEFAULT_OCR_MODEL).trim()
  // 强视觉模型只负责整图理解；若未单独配置服务，复用现有 OCR 托管地址和密钥。
  // 分栏和单元格精读仍走专用 OCR，既控制成本，也保留小字识别兜底。
  const visionApiUrl = String(options.visionApiUrl || ocrApiUrl).trim().replace(/\/$/, "")
  const visionApiKey = String(options.visionApiKey || ocrApiKey).trim()
  const visionModel = String(options.visionModel || DEFAULT_VISION_MODEL).trim()
  const extractLayoutHints = options.extractLayoutHints || extractScheduleLayoutHints
  const splitCells = options.splitCells || splitScheduleCells
  const splitColumns = options.splitColumns || splitScheduleColumns
  const configured = Boolean(deepseekApiBase && deepseekApiKey && deepseekModel && ocrApiUrl && ocrModel)

  async function requestCompletion(url, key, body, timeoutMs, {allowEmpty = false} = {}) {
    let response
    try {
      response = await fetchImpl(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(key ? {authorization: `Bearer ${key}`} : {})
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs)
      })
    } catch (error) {
      throw providerError("智能识别服务连接失败，请稍后重试", error)
    }
    const payload = await response.json().catch(() => ({}))
    const content = extractCompletionText(payload)
    if (!response.ok || (!content && !allowEmpty)) {
      throw providerError(response.ok ? "智能识别未返回有效结果" : "智能识别服务暂不可用")
    }
    return content
  }

  async function recognize({buffer, mimeType}) {
    if (!configured) {
      throw providerError("课表识别服务尚未配置，请联系运营方完成智能识别服务配置")
    }
    if (!Buffer.isBuffer(buffer) || !buffer.length) {
      const error = new Error("schedule image is required")
      error.status = 400
      throw error
    }

    const metadata = await sharp(buffer).metadata()
    const wideSchedule = Number(metadata.width || 0) >= 900 && Number(metadata.width || 0) >= Number(metadata.height || 1) * 1.55
    const [layoutHints, gridCells] = await Promise.all([
      extractLayoutHints(buffer),
      wideSchedule
        ? splitCells(buffer, mimeType)
        : Promise.resolve([])
    ])
    const expectedVisualCount = Math.max(
      gridCells.length,
      layoutHints.reduce((sum, item) => sum + (Array.isArray(item.weekdays) ? item.weekdays.length : 0), 0)
    )
    const minimumExpected = scheduleRecognitionMinimum(expectedVisualCount, wideSchedule)
    const layoutText = layoutHints.length
      ? layoutHints.map(item => `第${item.row}行有课的列：${item.weekdays.join("、")}`).join("\n")
      : "未能可靠提取表格占位，请只依据 OCR 明确内容。"

    const runOcr = async sources => mapWithConcurrency(sources, 4, async source => {
      const imageData = `data:${source.mimeType};base64,${source.buffer.toString("base64")}`
      const candidates = source.kind === "whole" && visionApiUrl && visionModel
        ? [
            {apiUrl: visionApiUrl, apiKey: visionApiKey, model: visionModel},
            ...(!isDeepSeekOcrModel(visionModel) || visionApiUrl !== ocrApiUrl || visionModel !== ocrModel
              ? [{apiUrl: ocrApiUrl, apiKey: ocrApiKey, model: ocrModel}]
              : [])
          ]
        : [{apiUrl: ocrApiUrl, apiKey: ocrApiKey, model: ocrModel}]
      let lastError
      for (const candidate of candidates) {
        const attempts = candidate.model === visionModel ? 1 : 2
        for (let attempt = 0; attempt < attempts; attempt += 1) {
          try {
            const content = await requestCompletion(
              completionUrl(candidate.apiUrl),
              candidate.apiKey,
              {
                model: candidate.model,
                temperature: 0,
                max_tokens: source.kind === "column" ? 3500 : source.kind === "whole" ? 8000 : 1400,
                messages: [{
                  role: "user",
                  content: [
                    {type: "image_url", image_url: {url: imageData, detail: "high"}},
                    {type: "text", text: visionPrompt(candidate.model, source.kind)}
                  ]
                }]
              },
              source.kind === "whole" ? 120_000 : 75_000,
              {allowEmpty: !source.required}
            )
            return {weekday: source.weekday, label: source.label || source.weekday, content: cleanOcrText(content)}
          } catch (error) {
            lastError = error
          }
        }
      }
      if (!source.required) return {weekday: source.weekday, label: source.label || source.weekday, content: ""}
      throw lastError
    })

    const structure = async blocks => {
      const usable = blocks.filter(item => item.content.trim())
      if (!usable.length) throw providerError("没有从图片中识别到课程文字，请稍后重试")
      const ocrText = usable.map(item => `【${item.label}】\n${item.content}`).join("\n\n")
      const structured = await requestCompletion(
        completionUrl(deepseekApiBase),
        deepseekApiKey,
        {
          model: deepseekModel,
          temperature: 0,
          max_tokens: 7000,
          messages: [
            {
              role: "system",
              content: [
                "你是大学课表结构化助手。把 OCR 文本整理为严格 JSON，根对象只能包含 items 数组。",
                "每项字段固定为 name、time、room、teacher，全部为字符串。",
                "必须逐格保留课表中的每一次上课安排；同名课程出现在不同星期或节次时必须分别输出，绝对不能合并。",
                "系统同时提供了按课表从上到下的每一行中哪些星期列实际有文字，这是由图像像素位置确定的可靠信息。",
                "【星期X 第Y-Z节】标签同时确定星期和节次，优先级最高；只有【星期X】标签时，从该列 OCR 原文提取节次。",
                "每项 time 必须包含星期和节次，再拼接 OCR 中明确出现的周次和单双周信息；绝对不能移动到相邻星期或节次。",
                "一门课程通常按：课程名、学分、教师、周次、单双周、节次、教室、校区排列；学分和校区不是课程名。",
                "课程名末尾的 A、B 等字母可能是课程名的一部分，但其后紧跟的独立数字通常是学分，必须删除。例如“人工智能基础A2许淼”应拆为 name=人工智能基础A、teacher=许淼。",
                "如果同一内容在星期列、单元格或整图 OCR 中重复出现，只保留一条完全相同的安排。",
                "如果 OCR 只给出校区或院区、没有具体教室，也要把该地点原文写入 room，不要丢弃。",
                "忽略空白单元格、页眉、日期、校名和非课程信息；不得补写 OCR 中不存在的课程。",
                "OCR 可能出现重复词、英文看图描述或乱码，必须忽略这些噪声。",
                "无法确定的 room 或 teacher 留空；name 或 time 无法确定时不要输出该项。"
              ].join("\n")
            },
            {role: "user", content: `视觉占位预计约 ${expectedVisualCount || "未知"} 个有课单元格。\n课表视觉占位（从上到下）：\n${layoutText}\n\n请完整结构化以下课表 OCR 文本：\n\n${ocrText.slice(0, 64_000)}`}
          ]
        },
        90_000
      )
      return {items: alignItemsToLayout(parseScheduleJson(structured), layoutHints), ocrText}
    }

    const primarySources = wideSchedule
      ? [
          // 整张图文字是第一手证据：页眉、跨行课程和边缘单元格都可能在
          // 分栏/切格时被裁掉。分栏 OCR 只负责补清小字并帮助定位星期。
          {weekday: "整张课表", label: "整张课表文字", buffer, mimeType, kind: "whole", required: true},
          ...(await splitColumns(buffer, mimeType)).map(source => ({...source, kind: "column", required: false}))
        ]
      : [{weekday: "整张课表", label: "整张课表文字", buffer, mimeType, kind: "whole", required: true}]
    let allBlocks = await runOcr(primarySources)
    let result = await structure(allBlocks)

    if (wideSchedule && result.items.length < minimumExpected) {
      // 第一轮整列识别明显不完整时，再按有文字的单元格精读。像素定位本身
      // 不可靠时，同时补一次整图 OCR，避免“检测到两格就只返回两门”的提前结束。
      const fallbackSources = gridCells.length >= 5
        ? gridCells.map(source => ({...source, kind: "cell", required: false}))
        : [
            ...gridCells.map(source => ({...source, kind: "cell", required: false})),
            {weekday: "整张课表", label: "整张课表补充识别", buffer, mimeType, kind: "whole", required: true}
          ]
      const fallbackBlocks = await runOcr(fallbackSources)
      allBlocks = [...allBlocks, ...fallbackBlocks]
      const supplemented = await structure(allBlocks)
      if (supplemented.items.length >= result.items.length) result = supplemented
    }

    const items = normalizeScheduleItems(result.items)
    if (!items.length) throw providerError("没有从图片中识别到完整课程，请换一张更清晰的课表截图")
    if (wideSchedule && expectedVisualCount >= 5 && items.length < minimumExpected) {
      throw providerError(`课表识别不完整：预计有 ${expectedVisualCount} 个有课单元格，仅识别出 ${items.length} 条，请重试`)
    }
    return {
      items,
      ocrPreview: allBlocks.filter(item => item.content.trim()).map(item => `【${item.label}】\n${item.content}`).join("\n\n").slice(0, 1200),
      provider: "星尘智能识别"
    }
  }

  return {configured, recognize}
}
