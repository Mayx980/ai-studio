import { chromium } from '@playwright/test'
import assert from 'node:assert/strict'
const b = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || chromium.executablePath(),
  args: ['--no-sandbox']
})
const page = await b.newPage({ viewport: { width: 1800, height: 1200 }, acceptDownloads: true }),
  errors = [],
  requests = []
page.on('pageerror', e => errors.push(e.message))
page.on('request', r => requests.push(r.url()))
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a6gAAAABJRU5ErkJggg==',
  'base64'
)
const files = [
  {
    name: '创作说明.md',
    mimeType: 'text/markdown',
    buffer: Buffer.from('# 产品目标\n展示新品特点，采用自然风格。')
  },
  {
    name: '活动方案.docx',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    buffer: Buffer.from('mock word')
  },
  { name: '品牌资料.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 mock') },
  { name: '参考.png', mimeType: 'image/png', buffer: png }
]
await page.goto('http://127.0.0.1:5174')
await page.getByRole('button', { name: '新建创作', exact: true }).click()
await page.getByPlaceholder('请输入项目名称').fill('文件引用验证')
await page.locator('.modal-footer .primary-button').click()
assert.equal(await page.getByRole('button', { name: '确认与反馈', exact: true }).count(), 0)
const tools = await page.locator('.canvas-top-tools').boundingBox(),
  header = await page.locator('.workspace-header').boundingBox()
assert.ok(Math.abs(tools.y - header.y - header.height) < 3)
await page.keyboard.press('Tab')
await page.getByRole('menuitem', { name: '文字节点', exact: true }).click()
const text = page.locator('.media-node').last()
await text.getByTitle('引用', { exact: true }).click()
await page
  .getByRole('dialog', { name: '引用内容' })
  .getByRole('button', { name: '本地上传', exact: true })
  .click()
await page.getByLabel('上传本地引用', { exact: true }).setInputFiles(files)
await page.waitForFunction(
  () => document.querySelectorAll('.selected-image-strip .reference-chip').length === 4
)
assert.equal(await text.locator('.reference-chip').count(), 0)
await page.screenshot({ path: '/tmp/r10-upload.png' })
await page
  .getByRole('dialog', { name: '引用内容' })
  .getByRole('button', { name: '确定', exact: true })
  .click()
assert.equal(await text.locator('.reference-chip').count(), 4)
assert.ok(await text.locator('.reference-chip-cover img').count())
await text.getByTitle('优化提示词', { exact: true }).click()
assert.match(await page.getByLabel('提示词预览').inputValue(), /产品目标/)
assert.match(await page.getByLabel('提示词预览').inputValue(), /模拟文档解析/)
await page.getByTitle('关闭', { exact: true }).click()
await page.getByTitle('引用项目或资产', { exact: true }).click()
await page
  .getByRole('dialog', { name: '引用内容' })
  .getByRole('button', { name: '本地上传', exact: true })
  .click()
await page.getByLabel('上传本地引用', { exact: true }).setInputFiles(files.slice(0, 1))
await page
  .getByRole('dialog', { name: '引用内容' })
  .getByRole('button', { name: '确定', exact: true })
  .click()
assert.match(await page.locator('.agent-composer .reference-pills').innerText(), /创作说明.md/)
assert.equal(await page.getByPlaceholder('告诉我你的想法，或从下方选择引用内容').count(), 1)
await page.getByTitle('返回项目', { exact: true }).click()
await page.getByRole('button', { name: '灵感创作', exact: true }).click()
assert.equal(await page.locator('.nav-count').count(), 0)
await page.getByRole('button', { name: '引用内容', exact: true }).click()
await page
  .getByRole('dialog', { name: '引用内容' })
  .getByRole('button', { name: '本地上传', exact: true })
  .click()
await page.getByLabel('上传本地引用', { exact: true }).setInputFiles([files[3]])
await page
  .getByRole('dialog', { name: '引用内容' })
  .getByRole('button', { name: '确定', exact: true })
  .click()
assert.ok(await page.locator('.home-reference-input .reference-chip-cover img').count())
assert.ok(
  await page
    .locator('.home-reference-input')
    .evaluate(
      e =>
        e.querySelector('.reference-pills').compareDocumentPosition(e.querySelector('textarea')) &
        Node.DOCUMENT_POSITION_FOLLOWING
    )
)
await page.locator('.recent-link').filter({ hasText: '夏日序曲' }).click()
await page.getByTitle('收起助手', { exact: true }).click()
const script = page.locator('.script-node')
assert.equal(await script.getByRole('button', { name: '输入与引用', exact: true }).count(), 0)
assert.ok(!(await script.innerText()).includes('点击行右侧连接点'))
await script.getByTitle('编辑分镜表', { exact: true }).click()
await page.getByRole('textbox', { name: '01 visual', exact: true }).fill('测试导出 & 产品<展示>')
await page
  .getByRole('dialog', { name: '编辑分镜脚本', exact: true })
  .getByRole('button', { name: '确定', exact: true })
  .click()
await page.getByTitle('关闭', { exact: true }).click()
await script.getByRole('button', { name: 'Excel', exact: true }).click()
const pending = page.waitForEvent('download')
await page.getByRole('button', { name: '导出', exact: true }).click()
const download = await pending
assert.match(download.suggestedFilename(), /\.xlsx$/)
await download.saveAs('/tmp/r10-shots.xlsx')
assert.ok(!requests.some(url => url.includes('/__models/')))
assert.deepEqual(errors, [])
console.log(
  '通过：本地MD/Word/PDF/图片引用、确认后应用、真实图片封面、输入框内卡片、新建命名及精简入口、Excel本地导出。'
)
await b.close()
