export function imageIdentity(a) {
  return [a.sourceNodeId || a.id, a.version || 1, a.outputIndex || 0].join(':')
}
export function uniqueImages(items) {
  const seen = new Set()
  return items.filter(a => {
    if (a.type !== '图片' || a.pending) return false
    const key = imageIdentity(a)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
