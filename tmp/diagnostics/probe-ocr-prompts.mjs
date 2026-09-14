import fs from "node:fs/promises"

const buffer = await fs.readFile("/tmp/schedule-cell-probe.jpg")
const imageData = `data:image/jpeg;base64,${buffer.toString("base64")}`
const endpoint = `${String(process.env.DEEPSEEK_OCR_API_URL || "").replace(/\/$/, "")}/chat/completions`
const prompts = [
  "<image>\nFree OCR.",
  "<image>\n<|grounding|>OCR this image.",
  "<image>\n<|grounding|>Convert the document to markdown."
]

const results = await Promise.all(prompts.map(async prompt => {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${process.env.DEEPSEEK_OCR_API_KEY}`
    },
    body: JSON.stringify({
      model: process.env.DEEPSEEK_OCR_MODEL,
      temperature: 0,
      max_tokens: 1200,
      messages: [{role: "user", content: [
        {type: "text", text: prompt},
        {type: "image_url", image_url: {url: imageData}}
      ]}]
    })
  })
  const payload = await response.json()
  return {prompt, status: response.status, content: String(payload?.choices?.[0]?.message?.content || "").slice(0, 1200)}
}))

console.log(JSON.stringify(results, null, 2))
