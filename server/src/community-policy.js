export const COMMUNITY_POST_IMAGE_LIMIT = 9

const defaultBlockedTerms = ["兼职", "钱", "微信", "微", "jz", "v", "r"]

function normalize(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{Script=Han}a-z0-9]+/gu, "")
}

export function communityBlockedTerms(value = process.env.COMMUNITY_BLOCKED_WORDS) {
  const configured = String(value || "")
    .split(/[，,\n]/)
    .map(item => item.trim())
    .filter(Boolean)
  return configured.length ? configured : defaultBlockedTerms
}

export function findBlockedCommunityTerm(content, configuredTerms) {
  const normalizedContent = normalize(content)
  return communityBlockedTerms(configuredTerms).find(term => normalizedContent.includes(normalize(term))) || ""
}

export function assertCommunityContentAllowed(content, configuredTerms) {
  if (!findBlockedCommunityTerm(content, configuredTerms)) return
  throw Object.assign(new Error("内容包含不允许发布的词语，请修改后再试"), {
    status: 422,
    code: "community_blocked_term"
  })
}
