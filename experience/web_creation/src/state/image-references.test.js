import { afterEach, describe, expect, it, vi } from 'vitest'
import { createScenario } from '../scenarios/creation'
afterEach(() => vi.useRealTimers())
function setup() {
  const p = createScenario(),
    s = p.state,
    image = s.nodes.find(n => n.type === '图片'),
    video = s.nodes.find(n => n.type === '视频')
  p.connectToRow(image.id, 'shot-a')
  p.connectNodes(image.id, video.id)
  return { p, s, image, video }
}
describe('统一图生视频引用', () => {
  it('同图通过镜头和节点引用只展示一次，生成前确认清单后固定版本', () => {
    vi.useFakeTimers()
    const { p, s, image, video } = setup()
    expect(p.referenceImages(video)).toHaveLength(1)
    video.prompt = '场景参考@' + image.name
    p.requestGenerate(video.id)
    expect(s.modalData.referenceImages).toHaveLength(1)
    expect(video.status).not.toBe('running')
    p.confirm()
    expect(video.status).toBe('running')
    expect(video.inputSnapshot.images).toHaveLength(1)
    const version = video.inputSnapshot.images[0].version
    image.version = 9
    expect(video.inputSnapshot.images[0].version).toBe(version)
  })
  it('参考版本变化必须重新确认，不沿用旧清单生成', () => {
    const { p, s, image, video } = setup()
    p.requestGenerate(video.id)
    image.version = 3
    p.confirm()
    expect(video.status).not.toBe('running')
    expect(s.modalData.referenceImages[0].version).toBe(3)
  })
  it('移除一张图会清除该节点的所有重复引用路径及@标记，不删除原图', () => {
    const { p, s, image, video } = setup()
    video.prompt = '参考@' + image.name
    p.requestGenerate(video.id)
    p.removeImageReference(video.id, p.referenceImages(video)[0])
    expect(p.referenceImages(video)).toHaveLength(0)
    expect(s.modalData.referenceImages).toHaveLength(0)
    expect(video.prompt).not.toContain('@')
    expect(s.nodes.some(n => n.id === image.id)).toBe(true)
    p.confirm()
    expect(video.status).not.toBe('running')
  })
  it('超过十张阻止，文生视频不携带图片，单图多图统一显示图生视频', () => {
    const { p, s, video } = setup()
    video.assetRefs = Array.from({ length: 10 }, (_, i) => ({
      id: 'extra-' + i,
      name: '图' + i,
      type: '图片',
      version: 1
    }))
    p.requestGenerate(video.id)
    expect(s.modal).toBeNull()
    video.mode = '文生视频'
    p.requestGenerate(video.id)
    expect(s.modalData.referenceImages).toHaveLength(0)
  })
})
