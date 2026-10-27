import { describe, it, expect, vi, afterEach } from 'vitest'
import { createScenario } from './creation'
afterEach(() => vi.useRealTimers())
describe('灵活模式本地交互边界', () => {
  it('应用案例仅准备内容，已有草稿等待选择，移除创意保留素材', () => {
    const p = createScenario()
    p.state.prompt = '用户自己的产品'
    p.studioApply(p.studio.cases[0])
    expect(p.studio.conflict).toBeTruthy()
    expect(p.state.prompt).toBe('用户自己的产品')
    expect(p.studio.messages).toHaveLength(0)
    p.studioApply(p.studio.cases[0], 'keep')
    expect(p.state.references).toHaveLength(2)
    expect(p.state.prompt).toBe('用户自己的产品')
    p.studio.selected = null
    expect(p.state.references).toHaveLength(2)
  })
  it('首尾帧缺失阻止发送，双帧角色与参数固定，生成不自动建节点', () => {
    vi.useFakeTimers()
    const p = createScenario()
    p.studio.frameMode = true
    p.state.prompt = '生成视频'
    p.studioSend()
    expect(p.studio.messages).toHaveLength(0)
    const refs = p.studio.cases[0].refs
    p.studio.frames = { first: refs[0], last: refs[1] }
    p.studioSend()
    p.studio.params.ratio = '1:1'
    vi.runAllTimers()
    const result = p.studio.messages.at(-1).result
    expect(result.snapshot.map(a => a.role)).toEqual(['首帧', '尾帧'])
    expect(result.params.ratio).toBe('16:9')
    expect(p.state.nodes).toHaveLength(0)
  })
  it('失败主动重试沿用输入快照，暂停不推进，旧版本及项目历史保留', () => {
    vi.useFakeTimers()
    const p = createScenario()
    p.state.prompt = '生成图片'
    p.studio.forceFail = true
    p.studioSend()
    p.studioPause()
    vi.advanceTimersByTime(3000)
    expect(p.studio.progress).toBe(0)
    p.studioPause()
    vi.runAllTimers()
    const job = p.studio.messages.at(-1)
    expect(job.status).toBe('failed')
    p.state.references = [{ id: 'new', name: '新参考', type: '图片' }]
    p.studioRetry(job)
    vi.runAllTimers()
    expect(p.studio.messages.at(-1).result.snapshot).toHaveLength(0)
    const id = p.state.projectId
    p.newStudio()
    p.openProject(id)
    expect(p.studio.messages).toHaveLength(4)
  })
})
