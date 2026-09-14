export const COMMUNITY_POST_IMAGE_LIMIT = 9

const blockedTerms = ["兼职", "钱", "微信", "微", "jz", "v", "r"]

const normalize = (value: string) => value
  .normalize("NFKC")
  .toLowerCase()
  .replace(/[^\u3400-\u9fffa-z0-9]+/g, "")

export function findBlockedCommunityTerm(content: string) {
  const normalizedContent = normalize(content)
  return blockedTerms.find(term => normalizedContent.includes(normalize(term))) || ""
}
