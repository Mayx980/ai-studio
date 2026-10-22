import { reactive, watch } from 'vue'
import { readLocalReferences } from './local-references'
export function extendCanvasTools(p) {
  p.readLocalReferences = readLocalReferences
  const s = p.state,
    copy = x => JSON.parse(JSON.stringify(x))
  let serial = 0
  p.activeScript = () =>
    s.nodes.find(n => n.id === s.activeScriptId && n.type === '脚本') ||
    s.nodes.find(n => n.type === '脚本')
  p.scriptRows = n => n?.rows || (n?.id === p.activeScript()?.id ? s.rows : [])
  p.scriptForRow = id =>
    s.nodes.find(n => n.type === '脚本' && p.scriptRows(n).some(r => r.id === id))
  p.ensureScripts = () => {
    const all = s.nodes.filter(n => n.type === '脚本')
    for (const [i, n] of all.entries()) n.rows ||= i === 0 ? s.rows : []
    const active = p.activeScript()
    s.activeScriptId = active?.id
    if (active) s.rows = active.rows
    else s.rows = []
  }
  p.activateScript = id => {
    const n = s.nodes.find(n => n.id === id && n.type === '脚本')
    if (!n) return
    p.ensureScripts()
    s.activeScriptId = id
    s.rows = n.rows
    s.prompt = n.prompt || ''
  }
  const oldRow = p.row
  p.row = id =>
    s.nodes
      .filter(n => n.type === '脚本')
      .flatMap(n => p.scriptRows(n))
      .find(r => r.id === id) || oldRow(id)
  watch(
    () => s.rows,
    rows => {
      const n = p.activeScript()
      if (n) n.rows = rows
    },
    { flush: 'sync' }
  )
  for (const method of ['openProject', 'newProject']) {
    const original = p[method]
    p[method] = (...args) => {
      const result = original(...args)
      if (method === 'newProject') {
        const current = s.projects.find(p => p.id === s.projectId)
        if (current)
          current.lastOpened = new Date(
            Math.max(Date.now(), ...s.projects.map(p => Date.parse(p.lastOpened) || 0)) + 1
          ).toISOString()
      }
      s.activeScriptId = null
      p.ensureScripts()
      p.resetCanvasHistory?.()
      return result
    }
  }
  const confirm = p.confirm
  p.confirm = (...args) => {
    const result = confirm(...args)
    p.ensureScripts()
    return result
  }
  const add = p.addNode
  p.addNode = (type, rowId, position) => {
    if (s.readonly) return
    if (type !== '脚本' || !s.nodes.some(n => n.type === '脚本')) {
      const result = add(type, rowId, position)
      p.ensureScripts()
      return result
    }
    const id = 'script-' + Date.now() + '-' + serial++
    let px = position?.x ?? s.mouseBlank?.x ?? s.viewport.x + 50,
      py = position?.y ?? s.mouseBlank?.y ?? s.viewport.y + 50
    while (
      s.nodes.some(
        n =>
          px < n.x + (n.boundsWidth || n.width || (n.type === '脚本' ? 2600 : 320)) + 32 &&
          px + 2632 > n.x &&
          py < n.y + (n.boundsHeight || n.height || 800) + 32 &&
          py + 832 > n.y
      )
    )
      py += 900
    s.nodes.push({
      id,
      type,
      name: '分镜脚本 ' + (s.nodes.filter(n => n.type === '脚本').length + 1),
      x: px,
      y: py,
      width: 2600,
      rows: [],
      prompt: ''
    })
    p.activateScript(id)
    return id
  }
  p.duplicateNode = (id, exact = false) => {
    if (s.readonly) return
    const source = s.nodes.find(n => n.id === id)
    if (!source) return
    if (source.status === 'running') {
      p.notify('生成中的节点暂不能复制')
      return
    }
    const clone = copy(source),
      edges = copy(s.connections.filter(c => c.source === id || c.target === id))
    const fresh = p.addNode(source.type, source.rowId, { x: source.x + 40, y: source.y + 40 })
    if (!fresh) return
    const target = s.nodes.find(n => n.id === fresh),
      position = { x: target.x, y: target.y }
    const rowMap = {}
    if (source.type === '脚本') {
      clone.rows = copy(p.scriptRows(source)).map(r => {
        const rid = 'shot-copy-' + Date.now() + '-' + serial++
        rowMap[r.id] = rid
        return { ...r, id: rid }
      })
    }
    Object.assign(target, clone, {
      id: fresh,
      name: source.name + ' - 副本',
      playing: false,
      ...(exact ? { x: source.x, y: source.y } : position)
    })
    for (const c of edges)
      s.connections.push({
        ...c,
        id: 'wire-copy-' + Date.now() + '-' + serial++,
        source: c.source === id ? fresh : c.source,
        target: c.target === id ? fresh : c.target,
        rowIds: c.rowIds?.map(r => rowMap[r] || r)
      })
    if (source.type === '脚本') {
      for (const n of s.nodes.filter(n => n.id !== fresh)) {
        const old = p.rowIds(n),
          extra = old.filter(r => rowMap[r]).map(r => rowMap[r])
        if (extra.length) n.rowRefs = [...new Set([...old, ...extra])]
      }
      p.activateScript(fresh)
    }
    s.selectedNode = fresh
    return fresh
  }
  s.assets = s.assets.filter(a => ['图片', '视频', '音频'].includes(a.type))
  if (s.assetType === '提示词') s.assetType = '全部'
  const saveAsset = p.saveAsset
  p.saveAsset = data => {
    if (!['图片', '视频', '音频'].includes(data.type)) {
      p.notify('个人资产仅支持图片、视频和音频')
      return false
    }
    return saveAsset(data)
  }
  const applyAsset = p.applyAsset
  p.applyAsset = (asset, ...args) => {
    if (asset.type === '提示词') {
      p.notify('个人资产仅支持图片、视频和音频')
      return false
    }
    return applyAsset(asset, ...args)
  }
  p.ensureScripts()
  const snapshot = () =>
    JSON.stringify(
      {
        nodes: s.nodes,
        rows: s.rows,
        connections: s.connections,
        activeScriptId: s.activeScriptId
      },
      (k, v) => (['boundsWidth', 'boundsHeight', 'playing'].includes(k) ? undefined : v)
    )
  let entries = [snapshot()],
    index = 0,
    timer,
    restoring = false,
    depth = 0
  p.history = reactive({ canUndo: false, canRedo: false })
  const flags = () => {
    p.history.canUndo = index > 0
    p.history.canRedo = index < entries.length - 1
  }
  const save = () => {
    clearTimeout(timer)
    if (restoring || depth) return
    const next = snapshot()
    if (next === entries[index]) return
    const a = JSON.parse(next),
      b = JSON.parse(entries[index])
    if (JSON.stringify([a.nodes, a.connections]) === JSON.stringify([b.nodes, b.connections]))
      return
    entries = entries.slice(0, index + 1)
    entries.push(next)
    if (entries.length > 50) entries.shift()
    index = entries.length - 1
    flags()
  }
  p.resetCanvasHistory = () => {
    clearTimeout(timer)
    entries = [snapshot()]
    index = 0
    flags()
  }
  watch(
    snapshot,
    () => {
      if (restoring || depth) return
      clearTimeout(timer)
      timer = setTimeout(save, 180)
    },
    { flush: 'sync' }
  )
  function restore(delta) {
    if (s.readonly) return
    save()
    const next = index + delta
    if (next < 0 || next >= entries.length) return
    restoring = true
    const v = JSON.parse(entries[next])
    s.nodes = v.nodes
    s.activeScriptId = v.activeScriptId
    s.rows = v.rows
    s.connections = v.connections
    p.ensureScripts()
    s.selectedNode = null
    index = next
    flags()
    restoring = false
  }
  p.commitHistory = save
  p.beginHistoryGesture = () => {
    save()
    depth++
  }
  p.endHistoryGesture = () => {
    depth = Math.max(0, depth - 1)
    save()
  }
  for (const name of [
    'addNode',
    'duplicateNode',
    'confirm',
    'connect',
    'connectNodes',
    'connectToRow',
    'removeConnection',
    'removeInputReference'
  ]) {
    const command = p[name]
    p[name] = (...args) => {
      if (depth) return command(...args)
      save()
      depth++
      try {
        return command(...args)
      } finally {
        depth--
        save()
      }
    }
  }
  p.undo = () => restore(-1)
  p.redo = () => restore(1)
}
