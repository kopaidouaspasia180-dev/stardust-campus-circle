export function demoContentEnabled() {
  return Boolean(
    process.env.TARO_ENV === "h5" &&
    typeof window !== "undefined" &&
    /^(127\.0\.0\.1|localhost)$/.test(window.location.hostname) &&
    new URLSearchParams(window.location.search).get("demo") === "1"
  )
}
