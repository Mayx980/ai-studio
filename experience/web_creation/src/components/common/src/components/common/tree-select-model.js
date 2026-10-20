export const flattenTree = (items, output = []) => {
  for (const item of items || []) {
    output.push(item)
    flattenTree(item.children, output)
  }
  return output
}

export const filterTree = (items, keyword) => {
  const needle = keyword.trim().toLocaleLowerCase()
  if (!needle) return items
  return (items || []).flatMap(item => {
    const children = filterTree(item.children || [], needle)
    return String(item.label).toLocaleLowerCase().includes(needle) || children.length
      ? [{ ...item, children }]
      : []
  })
}

export const toggleTreeValue = (current, value, multiple) => {
  if (!multiple) return value
  const values = Array.isArray(current) ? current : []
  return values.includes(value) ? values.filter(item => item !== value) : [...values, value]
}

const loadStates = new WeakMap()

export const loadTreeChildren = (item, loader) => {
  if (item.children?.length) return Promise.resolve(item.children)
  const state = loadStates.get(item)
  if (state?.loaded) return Promise.resolve(item.children || [])
  if (state?.promise) return state.promise
  if (!loader) return Promise.resolve(item.children || [])
  item.loading = true
  const promise = Promise.resolve()
    .then(() => loader(item))
    .then(children => {
      item.children = children || []
      loadStates.set(item, { loaded: true })
      return item.children
    })
    .catch(error => {
      loadStates.delete(item)
      throw error
    })
    .finally(() => {
      item.loading = false
    })
  loadStates.set(item, { promise })
  return promise
}
