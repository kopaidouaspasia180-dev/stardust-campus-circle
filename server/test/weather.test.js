import assert from "node:assert/strict"
import test from "node:test"
import {createWeatherService} from "../src/weather.js"

test("automatic weather maps Tangshan tenant to Tangshan coordinates", async () => {
  let requestedUrl = ""
  const service = createWeatherService({
    apiHost: "demo.qweatherapi.com",
    apiKey: "server-secret",
    fetchImpl: async url => {
      requestedUrl = String(url)
      return {
        ok: true,
        json: async () => ({code: "200", now: {temp: "27", text: "多云", feelsLike: "29", windDir: "东南风", windScale: "2", obsTime: "2026-08-24T00:00+08:00"}})
      }
    }
  })
  const result = await service.current({tenant: "tangshan"})
  assert.match(requestedUrl, /location=118.18%2C39.63/)
  assert.equal(result.city, "唐山")
  assert.equal(result.temperature, "27°")
  assert.equal(result.condition, "多云")
  assert.equal(result.automatic, true)
})

test("weather falls back to manually maintained campus data when provider is unavailable", async () => {
  const service = createWeatherService({})
  const result = await service.current({
    tenant: "tangshan",
    fallback: {weather_temperature: "25°", weather_condition: "晴", weather_note: "适合出行", updated_at: "2026-08-24T00:00:00Z"}
  })
  assert.equal(result.city, "唐山")
  assert.equal(result.temperature, "25°")
  assert.equal(result.automatic, false)
})
