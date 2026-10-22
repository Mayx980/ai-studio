import { describe, it, expect } from 'vitest'
import { createScenario } from './creation'
function guide() {
  const p = createScenario('empty')
  p.state.prompt =
    '目的：产品宣传；风格：电影感；时长30秒；比例16:9；核心内容：咖啡新品；目标受众：上班族'
  p.start()
  return [p, p.currentGuide()]
}
describe('分阶段创作确认', () => {
  it('完整需求跳过补问，缺失需求阻止出方案', () => {
    const [p, g] = guide()
    expect(g.stage).toBe('plans')
    expect(p.state.nodes).toHaveLength(0)
    p.newSession()
    p.beginGuide('咖啡')
    const draft = p.currentGuide()
    p.guidePlans(draft)
    expect(draft.stage).toBe('direction')
    expect(draft.error).toBeTruthy()
  })
  it('逐阶段保存，图片按镜头建立真实上游连接，视频按行引用且不得重复确认', () => {
    const [p, g] = guide()
    p.guideChoosePlan(g, 0)
    expect(g.story).toContain('创作约束层')
    expect(p.state.nodes).toHaveLength(0)
    g.story += '\n用户手动修订'
    p.guideConfirmStory(g)
    expect(p.state.nodes[0].text).toContain('用户手动修订')
    expect(p.state.nodes).toHaveLength(1)
    g.rows[0].visual = '手改镜头'
    p.guideConfirmStoryboard(g)
    const script = p.state.nodes.find(n => n.id === g.scriptId)
    expect(script.rows[0].visual).toBe('手改镜头')
    g.prompts[0].rowIds = [g.rows[0].id]
    p.guideImageConfig(g, 'partial')
    p.guideGenerateImages(g)
    expect(p.state.nodes).toHaveLength(2)
    p.guideAcceptImages(g)
    expect(p.state.nodes.filter(n => n.type === '图片')).toHaveLength(3)
    const first = p.state.nodes.find(n => n.name === '主要角色图')
    expect(
      p.state.connections.find(c => c.source === first.id && c.target === script.id).rowIds
    ).toEqual([g.rows[0].id])
    p.guidePickShots(g)
    g.selection = [g.rows[0].id]
    p.guideVideoConfig(g)
    p.guideGenerateVideos(g)
    expect(g.preview).toHaveLength(1)
    expect(g.preview[0].prompt).toContain('手改镜头')
    expect(p.state.nodes.filter(n => n.type === '视频')).toHaveLength(0)
    p.guideAcceptVideos(g)
    p.guideAcceptVideos(g)
    const video = p.state.nodes.find(n => n.type === '视频')
    expect(video.rowRefs).toEqual([g.rows[0].id])
    expect(video.guideReferences.length).toBeGreaterThan(0)
    expect(p.state.nodes.filter(n => n.type === '视频')).toHaveLength(1)
    expect(g.stage).toBe('done')
  })
  it('提示词取消同步保留原文，确定替换同步指定镜头', () => {
    const [p, g] = guide()
    p.guideChoosePlan(g, 0)
    p.guideConfirmStory(g)
    p.guideConfirmStoryboard(g)
    const before = g.story,
      script = p.state.nodes.find(n => n.id === g.scriptId),
      old = script.rows[0].imagePrompt
    g.prompts[0].prompt = '蓝衣角色'
    g.prompts[0].rowIds = [g.rows[1].id]
    p.guideSyncPrompts(g, false)
    expect(g.story).toBe(before)
    expect(script.rows[0].imagePrompt).toBe(old)
    p.guideSyncPrompts(g, true)
    expect(p.state.nodes.find(n => n.id === g.textId).text).toContain('蓝衣角色')
    expect(script.rows[1].imagePrompt).toContain('蓝衣角色')
    expect(script.rows[0].imagePrompt).not.toContain('蓝衣角色')
  })
  it('文本生成预览不覆盖已保存内容，取消不写入，确认保留手改', () => {
    const p = createScenario('empty'),
      id = p.addNode('文字'),
      n = p.state.nodes[0]
    n.prompt = '制作咖啡广告'
    n.text = '原文'
    p.requestGenerate(id)
    expect(n.text).toBe('原文')
    expect(p.state.storyPreview.text).toContain('故事定义')
    p.state.storyPreview = null
    expect(n.text).toBe('原文')
    p.requestGenerate(id)
    p.state.storyPreview.text = '手改剧情'
    p.confirmTextStory()
    expect(n.text).toBe('手改剧情')
    expect(p.state.storyPreview).toBeNull()
  })
  it('暂不生成后结束，不再追问；新会话和只读不修改旧流程', () => {
    const [p, g] = guide()
    p.guideChoosePlan(g, 0)
    p.guideConfirmStory(g)
    p.guideConfirmStoryboard(g)
    p.guideSkipImages(g)
    p.guideStop(g)
    expect(g.stage).toBe('done')
    const count = p.state.messages.length
    p.guidePickShots(g)
    expect(p.state.messages).toHaveLength(count)
    p.newSession()
    expect(p.currentGuide()).toBeUndefined()
    p.state.readonly = true
    p.guideChoosePlan(g, 1)
    expect(g.stage).toBe('done')
  })
})
