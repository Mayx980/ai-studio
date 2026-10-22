export function uniqueName(value, items, fallback = '未命名') {
  const base = String(value || '').trim() || fallback
  const key = name => name.normalize('NFKC').toLocaleLowerCase()
  const used = new Set(items.map(a => key(typeof a === 'string' ? a : a.name || '')))
  let name = base,
    number = 2
  while (used.has(key(name))) name = `${base} ${number++}`
  return name
}
export function extendNaming(p) {
  const s = p.state
  p.uniqueName = uniqueName
  for (const n of s.nodes) if (n.type === '视频' && n.mode === '参考图生视频') n.mode = '图生视频'
  const add = p.addNode
  p.addNode = (type, ...args) => {
    if (!['文字', '脚本', '图片', '视频', '音频'].includes(type)) {
      p.notify('仅支持文字、脚本、图片、视频、音频节点')
      return
    }
    const id = add(type, ...args),
      n = s.nodes.find(a => a.id === id)
    if (n)
      n.name = uniqueName(
        n.name,
        s.nodes.filter(a => a.id !== id)
      )
    return id
  }
  const set = p.setNode
  p.setNode = (id, key, value) =>
    set(
      id,
      key,
      key === 'name'
        ? uniqueName(
            value,
            s.nodes.filter(a => a.id !== id)
          )
        : value
    )
  const duplicate = p.duplicateNode
  p.duplicateNode = (...args) => {
    const id = duplicate(...args),
      n = s.nodes.find(a => a.id === id)
    if (n)
      n.name = uniqueName(
        n.name,
        s.nodes.filter(a => a.id !== id)
      )
    return id
  }
  const save = p.saveAsset
  p.saveAsset = data =>
    save({ ...data, name: data.name?.trim() ? uniqueName(data.name, s.assets) : '' })
  const create = p.newProject
  p.newProject = name => create(uniqueName(name, s.projects, '新项目'))
  p.renameProject = name => {
    if (s.readonly || !name.trim()) return
    s.projectName = uniqueName(
      name,
      s.projects.filter(a => a.id !== s.projectId)
    )
    const project = s.projects.find(a => a.id === s.projectId)
    if (project) project.name = s.projectName
  }
  const paste = p.pasteImages
  p.pasteImages = async (...args) => {
    if (s.readonly) return
    const result = await paste(...args),
      used = []
    for (const n of s.nodes) {
      n.name = uniqueName(n.name, used)
      used.push(n)
    }
    return result
  }
}
