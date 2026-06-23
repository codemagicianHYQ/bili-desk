export function normalizeBiliImage(url: string): string {
  if (!url) return ''
  if (url.startsWith('//')) return `https:${url}`
  if (url.startsWith('http://') || url.startsWith('https://')) return url
  return `https://${url}`
}
