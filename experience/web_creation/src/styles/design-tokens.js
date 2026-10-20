const cssVariablePattern = /^var\((--[a-z0-9-]+)\)$/i

export const readCssToken = (name, element = document.documentElement, seen = new Set()) => {
  if (seen.has(name)) throw new Error(`Circular design token reference: ${name}`)
  const nextSeen = new Set(seen).add(name)
  const value = getComputedStyle(element).getPropertyValue(name).trim()
  if (!value) throw new Error(`Missing design token: ${name}`)
  const reference = value.match(cssVariablePattern)?.[1]
  return reference ? readCssToken(reference, element, nextSeen) : value
}

export const readCssLengthInPixels = (name, element = document.documentElement) => {
  const value = readCssToken(name, element)
  const numeric = Number.parseFloat(value)
  if (!Number.isFinite(numeric)) throw new Error(`Design token is not a length: ${name}`)
  if (value.endsWith('px')) return numeric
  if (value.endsWith('rem')) {
    const rootSize = Number.parseFloat(getComputedStyle(document.documentElement).fontSize)
    if (!Number.isFinite(rootSize)) throw new Error('Unable to resolve root font size')
    return numeric * rootSize
  }
  throw new Error(`Unsupported design token length unit: ${name}`)
}

export const readBelowBreakpointMediaQuery = (name, element = document.documentElement) =>
  `(width < ${readCssToken(name, element)})`

export const readResponsiveCssLengthInPixels = (
  belowBreakpoint,
  { below, atOrAbove },
  element = document.documentElement
) => readCssLengthInPixels(belowBreakpoint ? below : atOrAbove, element)

export const resolveCssTokens = (value, element = document.documentElement) => {
  if (Array.isArray(value)) return value.map(item => resolveCssTokens(item, element))
  if (value && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, resolveCssTokens(item, element)])
    )
  }
  if (typeof value !== 'string') return value
  const token = value.match(cssVariablePattern)?.[1]
  return token ? readCssToken(token, element) : value
}
