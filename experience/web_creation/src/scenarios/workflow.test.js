import { describe, it, expect, vi, afterEach } from 'vitest'
import { createScenario } from './creation'
afterEach(() => vi.useRealTimers())
describe('画布体验回归', () => {
  it('空画布的新文字节点落在可视范围并可移动', () => {
    const p = createScenario('empty')
    p.state.viewport = { x: 200, y: 300, width: 900, height: 700 }
    const id = p.addNode('文字'),
      n = p.state.nodes[0]
    expect(n.x).toBeGreaterThanOrEqual(200)
    expect(n.y).toBeGreaterThanOrEqual(300)
    p.moveNode(id, 420, 430)
    expect(n).toMatchObject({ x: 420, y: 430 })
  })
  it('确认重新生成采用最新输入并创建不同版本，保留下游结果', () => {
    const p = createScenario()
    p.state.prompt = '为新耳机设计三镜头'
    p.generateScript()
    expect(p.state.modalData.action).toBe('script')
    p.confirm()
    const id = p.state.rows[0].id
    expect(p.state.rows[0].visual).toContain('新耳机')
    p.state.prompt = '宣传一场秋季活动'
    p.generateScript()
    p.confirm()
    expect(p.state.rows[0].id).not.toBe(id)
    expect(p.state.rows[0].visual).toContain('秋季活动')
    expect(p.state.nodes.find(n => n.id === 'image-1').status).toBe('success')
  })
  it('普通节点连接自动传入上游内容，拒绝循环，取消不改手写内容', () => {
    const p = createScenario()
    const id = p.addNode('文字')
    p.setNode(id, 'text', '产品卖点')
    p.connectNodes(id, 'image-1')
    expect(p.referenceText(p.state.nodes[1])).toContain('产品卖点')
    expect(p.connectNodes('image-1', id)).toBe(false)
    p.removeConnection(p.state.connections[0].id)
    expect(p.upstream(p.state.nodes[1])).toHaveLength(0)
  })
  it('当前画布引用列表随新生成的音视频实时刷新并展示版本', () => {
    vi.useFakeTimers()
    const p = createScenario()
    const id = p.addNode('音频')
    expect(p.materials().some(m => m.sourceNodeId === id)).toBe(false)
    p.runGeneration(id)
    vi.advanceTimersByTime(800)
    expect(p.materials().find(m => m.sourceNodeId === id)).toMatchObject({
      type: '音频',
      version: 1
    })
    p.runGeneration(id)
    vi.advanceTimersByTime(800)
    expect(p.materials().find(m => m.sourceNodeId === id).version).toBe(2)
  })
  it('灵感入口创建独立项目并自主编排已连接节点，仍不自动生成媒体', () => {
    const p = createScenario()
    p.state.prompt = '制作一支咖啡宣传视频'
    p.start()
    expect(p.state.nodes.map(n => n.type)).toEqual(['文字', '脚本', '图片', '视频'])
    expect(p.state.connections).toHaveLength(3)
    expect(p.state.nodes.find(n => n.type === '图片').status).toBe('idle')
    expect(p.state.projects).toHaveLength(3)
  })
  it('我的项目保留各自画布和名称并可重新打开', () => {
    const p = createScenario()
    p.newProject('新产品')
    const projectId = p.state.projectId
    p.addNode('文字')
    p.go('projects')
    p.openProject('project-summer')
    expect(p.state.nodes[0].type).toBe('脚本')
    p.openProject(projectId)
    expect(p.state.projectName).toBe('新产品')
    expect(p.state.nodes).toHaveLength(1)
  })
})
