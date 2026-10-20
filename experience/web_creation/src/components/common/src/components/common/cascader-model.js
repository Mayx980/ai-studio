export const flattenPaths = (items, parentPath = [], parentLabels = [], output = []) => {
  for (const item of items || []) {
    const path = [...parentPath, item.value]
    const labels = [...parentLabels, item.label]
    output.push({ item, path, key: path.join('/'), label: labels.join(' / ') })
    flattenPaths(item.children, path, labels, output)
  }
  return output
}

export const filterCascaderPaths = (items, keyword) => {
  const needle = keyword.trim().toLocaleLowerCase()
  return flattenPaths(items).filter(entry => entry.label.toLocaleLowerCase().includes(needle))
}

export const toggleCascaderPath = (current, path, multiple) => {
  if (!multiple) return path
  const paths = Array.isArray(current) ? current : []
  const key = path.join('/')
  return paths.some(item => item.join('/') === key)
    ? paths.filter(item => item.join('/') !== key)
    : [...paths, path]
}
