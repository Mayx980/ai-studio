import { describe, expect, it } from 'vitest'
import { createWorkspace } from './creation'
import { uniqueName } from './naming'
import { mediaDefaults, mediaFields } from './media-parameters'
describe('节点种类与命名', () => {
  it('仅允许五种节点，重复重命名及复制自动去重', () => {
    const p = createWorkspace('empty')
    p.addNode('文档')
    expect(p.state.nodes).toHaveLength(0)
    const a = p.addNode('文字'),
      b = p.addNode('脚本')
    p.setNode(a, 'name', '剧情')
    p.setNode(b, 'name', '剧情')
    expect(p.state.nodes.map(n => n.name)).toEqual(['剧情', '剧情 2'])
    p.duplicateNode(a)
    p.duplicateNode(a)
    expect(new Set(p.state.nodes.map(n => n.name)).size).toBe(p.state.nodes.length)
    expect(uniqueName(' A ', ['a', 'A 2'])).toBe('A 3')
  })
  it('项目、资产、会话在各自列表内不重名', () => {
    const p = createWorkspace('empty')
    p.newProject('咖啡')
    p.newProject('咖啡')
    expect(p.state.projectName).toBe('咖啡 2')
    p.saveAsset({ name: '咖啡', type: '图片', category: '物品', tags: [] })
    p.saveAsset({ name: '咖啡', type: '图片', category: '物品', tags: [] })
    expect(p.state.assets[0].name).toBe('咖啡 2')
    p.newSession()
    p.newSession()
    p.renameSession('灵感探索')
    expect(new Set(p.state.sessions).size).toBe(p.state.sessions.length)
  })
  it('媒体参数默认值属于相应节点和助手共用的选项范围', () => {
    for (const type of ['图片', '视频']) {
      const defaults = mediaDefaults(type)
      for (const field of mediaFields(type))
        expect(field.options.map(o => o.value ?? o)).toContain(defaults[field.key])
    }
    expect(mediaFields('图片').map(f => f.key)).toContain('background')
    expect(mediaFields('图片').map(f => f.key)).not.toContain('duration')
    expect(mediaFields('视频').map(f => f.key)).toContain('duration')
  })
})
