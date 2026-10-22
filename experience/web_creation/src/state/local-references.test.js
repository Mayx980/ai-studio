import { describe, it, expect } from 'vitest'
import { readLocalReferences } from './local-references'
describe('本地引用附件', () => {
  it('Markdown读取本地正文而不写入任何外部服务', async () => {
    const r = await readLocalReferences([
      new File(['# 标题\n产品内容'], '故事.md', { type: 'text/markdown' })
    ])
    expect(r.errors).toEqual([])
    expect(r.accepted[0]).toMatchObject({
      name: '故事.md',
      type: '文档',
      text: '# 标题\n产品内容',
      local: true,
      readStatus: '本地文本已读取'
    })
  })
  it('Word和PDF明确标注模拟解析', async () => {
    const r = await readLocalReferences([
      new File(['word'], '方案.docx'),
      new File(['pdf'], '方案.pdf')
    ])
    expect(r.accepted).toHaveLength(2)
    for (const a of r.accepted) {
      expect(a.text).toContain('模拟文档解析')
      expect(a.readStatus).toContain('模拟')
    }
  })
  it('非法或超限文件给出错误，其他有效文件仍可选择', async () => {
    const r = await readLocalReferences([
      new File(['a'], '资料.exe'),
      { name: '超大.pdf', type: 'application/pdf', size: 21 * 1024 * 1024 },
      new File(['有效文字'], '有效.md')
    ])
    expect(r.errors).toHaveLength(2)
    expect(r.accepted).toHaveLength(1)
    expect(r.accepted[0].name).toBe('有效.md')
  })
  it('单次最多处理10个附件，余下文件明确提示', async () => {
    const r = await readLocalReferences(
      Array.from({ length: 11 }, (_, i) => new File(['x'], i + '.md'))
    )
    expect(r.accepted).toHaveLength(10)
    expect(r.errors.join()).toContain('最多选择10')
  })
})
