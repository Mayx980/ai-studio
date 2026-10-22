import { describe, it, expect } from 'vitest'
import { createWorkspace } from './creation'
describe('canvas tools', () => {
  it('duplicates script rows with distinct identities and preserves independent editing', () => {
    const p = createWorkspace(),
      s = p.state,
      original = s.nodes.find(n => n.type === '脚本'),
      old = p.scriptRows(original)[0],
      id = p.duplicateNode(original.id),
      clone = s.nodes.find(n => n.id === id)
    expect(clone.rows).toHaveLength(3)
    expect(clone.rows[0].id).not.toBe(old.id)
    p.activateScript(id)
    p.editRow(clone.rows[0].id, 'visual', '只改副本')
    expect(p.scriptRows(original)[0].visual).not.toBe('只改副本')
    expect(p.row(old.id)).toBeTruthy()
    expect(s.nodes.find(n => n.type === '图片').rowRefs).toContain(clone.rows[0].id)
  })
  it('undo and redo preserve independent scripts and their links', () => {
    const p = createWorkspace(),
      s = p.state,
      id = p.duplicateNode('script')
    expect(s.nodes.some(n => n.id === id)).toBe(true)
    p.undo()
    expect(s.nodes.some(n => n.id === id)).toBe(false)
    p.redo()
    expect(s.nodes.some(n => n.id === id)).toBe(true)
    expect(p.row(s.nodes.find(n => n.id === id).rows[0].id)).toBeTruthy()
  })
  it('regenerating a copy keeps original rows and original references', () => {
    const p = createWorkspace(),
      s = p.state,
      original = p.activeScript(),
      before = JSON.stringify(p.scriptRows(original)),
      old = p.scriptRows(original)[0].id,
      id = p.duplicateNode(original.id)
    p.activateScript(id)
    p.performScript('副本新故事')
    expect(JSON.stringify(p.scriptRows(original))).toBe(before)
    expect(p.row(old)).toBeTruthy()
    expect(p.rowIds(s.nodes.find(n => n.type === '图片'))).toContain(old)
  })
  it('copy ordinary node includes wire connections and can be undone', () => {
    const p = createWorkspace(),
      s = p.state
    p.connectNodes('image-1', 'video-1')
    const id = p.duplicateNode('image-1')
    expect(s.connections.some(c => c.source === id && c.target === 'video-1')).toBe(true)
    p.undo()
    expect(s.connections.some(c => c.source === id)).toBe(false)
  })
})
