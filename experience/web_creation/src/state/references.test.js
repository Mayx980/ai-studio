import { describe, it, expect } from 'vitest'
import { createWorkspace } from './creation'
describe('封面与分镜引用', () => {
  it('每行可连接多节点，同一下游保留多个镜头的正文', () => {
    const p = createWorkspace()
    p.connect('shot-b', 'image-1')
    p.connect('shot-a', 'video-1')
    expect(p.rowIds(p.state.nodes[1])).toEqual(['shot-a', 'shot-b'])
    expect(p.referenceText(p.state.nodes[1])).toContain('镜头号：02')
    p.disconnectRow('image-1', 'shot-a')
    expect(p.rowIds(p.state.nodes[1])).toEqual(['shot-b'])
  })
  it('图片按选定镜头绑定，并透传到行下游节点的参考卡片', () => {
    const p = createWorkspace()
    const id = p.addNode('图片')
    const n = p.state.nodes.find(n => n.id === id)
    n.status = 'success'
    n.mediaUrl = 'data:image/png;base64,YQ=='
    n.outputs = [{ type: 'base64', mediaType: 'image', mimeType: 'image/png', data: 'YQ==' }]
    const asset = p.materials().find(a => a.sourceNodeId === id)
    expect(p.assignImageToRows(asset, ['shot-a', 'shot-c'], 'script')).toBe(true)
    expect(p.rowImages('shot-a')[0].mediaUrl).toBe(n.mediaUrl)
    expect(p.rowImages('shot-b')).toHaveLength(0)
    expect(
      p
        .inputReferences(p.state.nodes[1])
        .some(a => a.kind === 'row-media' && a.outputs[0].data === 'YQ==')
    ).toBe(true)
  })
  it('图片连到整个脚本先选择镜头，取消不写入连接', () => {
    const p = createWorkspace()
    expect(p.connectNodes('image-1', 'script')).toBe(false)
    expect(p.state.modal).toBe('row-assignment')
    expect(p.state.connections).toHaveLength(0)
    p.closeModal()
    expect(p.state.connections).toHaveLength(0)
  })
  it('@媒体资产作为参考，不覆盖手写提示词', () => {
    const p = createWorkspace()
    const n = p.state.nodes[1]
    n.prompt = '保留原文'
    p.attachReference(p.state.assets[1], n.id)
    expect(n.prompt).toBe('保留原文')
    expect(p.referenceText(n)).toContain(p.state.assets[1].name)
  })
  it('编辑面板在确认对话与删除行后仍保持打开，删除不清除其他行连接', () => {
    const p = createWorkspace()
    p.openModal('script-editor')
    p.connect('shot-b', 'image-1')
    p.openModal('confirm', { action: 'delete-row', id: 'shot-a' })
    p.confirm()
    expect(p.state.editorOpen).toBe(true)
    expect(p.state.rows).toHaveLength(2)
    expect(p.rowIds(p.state.nodes[1])).toEqual(['shot-b'])
    expect(p.state.nodes[1].status).toBe('success')
  })
  it('确认多图后切换参考图模式，超过10张不提交', () => {
    const p = createWorkspace()
    const asset = p.materials().find(a => a.type === '图片')
    expect(p.confirmImages('video-1', [asset, { ...asset, id: 'another' }])).toBe(true)
    expect(p.state.nodes[2].mode).toBe('参考图生视频')
    expect(p.state.nodes[2].confirmedImages).toHaveLength(2)
    expect(
      p.confirmImages(
        'video-1',
        Array.from({ length: 11 }, (_, i) => ({ ...asset, id: String(i) }))
      )
    ).toBe(false)
    expect(p.state.nodes[2].confirmedImages).toHaveLength(2)
  })
})
