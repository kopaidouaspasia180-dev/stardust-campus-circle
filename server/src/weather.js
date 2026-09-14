const DEFAULT_TTL_MS = 10 * 60 * 1000

const campusWeatherLocations = {
  tangshan: {city: "唐山", location: "118.18,39.63"},
  stdu: {city: "石家庄", location: "114.52,38.05"},
  lyit: {city: "洛阳", location: "112.45,34.62"}
}

function safeApiHost(value) {
  const host = String(value || "").trim().replace(/^https?:\/\//i, "").replace(/\/$/, "")
  return /^[a-z0-9.-]+\.qweatherapi\.com$/i.test(host) ? host : ""
}

function fallbackWeather(fallback, city) {
  if (!fallback || (!fallback.weather_temperature && !fallback.weather_condition)) return null
  return {
    temperature: String(fallback.weather_temperature || ""),
    condition: String(fallback.weather_condition || ""),
    note: String(fallback.weather_note || ""),
    updatedAt: fallback.updated_at || null,
    city,
    source: "校园运营",
    automatic: false
  }
}

export function createWeatherService(options = {}) {
  const apiHost = safeApiHost(options.apiHost)
  const apiKey = String(options.apiKey || "").trim()
  const fetchImpl = options.fetchImpl || fetch
  const ttlMs = Math.max(60_000, Number(options.ttlMs || DEFAULT_TTL_MS))
  const cache = new Map()
  const configured = Boolean(apiHost && apiKey)

  async function current({tenant, fallback = null}) {
    const location = campusWeatherLocations[tenant]
    if (!location) return fallbackWeather(fallback, "当前校区")
    if (!configured) return fallbackWeather(fallback, location.city)

    const cached = cache.get(tenant)
    if (cached && cached.expiresAt > Date.now()) return cached.value

    try {
      const url = new URL(`https://${apiHost}/v7/weather/now`)
      url.searchParams.set("location", location.location)
      url.searchParams.set("lang", "zh")
      const response = await fetchImpl(url, {
        headers: {"X-QW-Api-Key": apiKey, accept: "application/json"},
        signal: AbortSignal.timeout(6_000)
      })
      const payload = await response.json().catch(() => ({}))
      const now = payload?.now
      if (!response.ok || payload?.code !== "200" || !now?.temp || !now?.text) {
        return fallbackWeather(fallback, location.city)
      }
      const details = []
      if (now.feelsLike) details.push(`体感 ${now.feelsLike}°`)
      if (now.windDir) details.push(`${now.windDir}${now.windScale ? `${now.windScale}级` : ""}`)
      const value = {
        temperature: `${now.temp}°`,
        condition: String(now.text),
        note: `${details.join(" · ") || "实时天气"} · 和风天气`,
        updatedAt: now.obsTime || payload.updateTime || new Date().toISOString(),
        city: location.city,
        source: "和风天气",
        automatic: true
      }
      cache.set(tenant, {value, expiresAt: Date.now() + ttlMs})
      return value
    } catch {
      return fallbackWeather(fallback, location.city)
    }
  }

  return {configured, current}
}

export {campusWeatherLocations}
