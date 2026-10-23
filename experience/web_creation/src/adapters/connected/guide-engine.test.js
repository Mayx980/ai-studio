import { describe, it, expect, vi } from 'vitest'
import {
  parsePlans,
  parseBrief,
  parsePrompts,
  validateStory,
  createGuideEngine
} from './guide-engine'
const story =
  '故事定义\n剧情结构\n创作约束层\n参考时长：30秒\n角色形象：小夏\n道具：咖啡\n场景：办公室\n剪辑方式：自然\n画面与动作设计：推门\n台词/音效：早安'
describe('真实助手结果校验', () => {
  it('排序推荐方案并拒绝缺失字段', () => {
    const plans = parsePlans(
      JSON.stringify([
        { name: '乙', outline: '内容乙', reason: '理由乙', score: 20 },
        { name: '甲', outline: '内容甲', reason: '理由甲', score: 90 }
      ])
    )
    expect(plans[0].name).toBe('甲')
    expect(() => parsePlans('[]')).toThrow()
    expect(() => parsePlans('不是JSON')).toThrow()
  })
  it('只采纳实际方向字段，剧情缺少必要模块时拒绝', () => {
    expect(parseBrief('{"purpose":"广告","ratio":"","unexpected":"忽略"}')).toEqual({
      purpose: '广告'
    })
    expect(validateStory(story)).toContain('剧情结构')
    expect(() => validateStory('简单故事')).toThrow('故事定义')
  })
  it('提示词关联有效镜头，角色命名统一', () => {
    expect(
      parsePrompts('[{"type":"角色","name":"小夏","prompt":"蓝衣","shotNumbers":["01"]}]', [
        { id: 'r1', number: '01' }
      ])[0]
    ).toMatchObject({ name: '小夏角色图', rowIds: ['r1'] })
    expect(() =>
      parsePrompts('[{"type":"场景","name":"屋内","prompt":"暖光","shotNumbers":["99"]}]', [
        { id: 'r1', number: '01' }
      ])
    ).toThrow('有效镜头')
  })
  it('媒体请求固定参数和参考数据，缺少实际数据不调用', async () => {
    const run = vi
      .fn()
      .mockResolvedValue({
        outputs: [{ mediaType: 'image', type: 'base64', data: 'YQ==', mimeType: 'image/png' }]
      })
    const engine = createGuideEngine(run, () => []),
      params = {
        count: 1,
        ratio: '9:16',
        quality: '标准',
        background: '自动',
        resolution: '2K',
        duration: '10秒'
      }
    const out = await engine.image({ prompt: '咖啡', params, references: [] })
    expect(run.mock.calls[0][1]).toMatchObject({ n: 1, size: '2K', ratio: '9:16' })
    expect(out[0].mediaUrl).toBe('data:image/png;base64,YQ==')
    await expect(
      engine.image({ prompt: '咖啡', params, references: [{ type: '图片', name: '仅封面' }] })
    ).rejects.toThrow('实际图片数据')
    expect(run).toHaveBeenCalledTimes(1)
  })
})
