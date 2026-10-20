import { chromium } from '@playwright/test'
import assert from 'node:assert/strict'
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || chromium.executablePath(),
  headless: true,
  args: ['--no-sandbox']
})
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
const errors = []
page.on('pageerror', e => errors.push(e.message))
await page.goto('http://127.0.0.1:5173')
await page.getByRole('button', { name: '夏日序曲 · 香水新品宣传' }).first().click()
await page.getByRole('button', { name: '收起助手' }).click()
assert.equal(await page.getByRole('textbox', { name: '脚本节点输入', exact: true }).count(), 1)
const view = page.locator('.canvas-viewport')
await view.evaluate(el => el.scrollTo(400, 100))
await page.getByRole('button', { name: '抓手模式', exact: true }).click()
const b = await view.boundingBox()
await page.mouse.move(b.x + 500, b.y + 650)
await page.mouse.down()
await page.mouse.move(b.x + 380, b.y + 600, { steps: 8 })
await page.mouse.up()
assert.ok((await view.evaluate(el => el.scrollLeft)) > 400)
await page.getByRole('button', { name: '移动模式', exact: true }).click()
await view.evaluate(el => el.scrollTo(0, 0))
const node = page.locator('.script-node')
const header = await node.locator('.node-header').boundingBox()
const old = await node.evaluate(el => el.offsetLeft)
await page.mouse.move(header.x + 180, header.y + 20)
await page.mouse.down()
await page.mouse.move(header.x + 210, header.y + 40, { steps: 6 })
await page.mouse.up()
assert.ok((await node.evaluate(el => el.offsetLeft)) > old)
const handle = page.getByRole('button', { name: '调整分镜表格大小', exact: true })
await handle.scrollIntoViewIfNeeded()
const h = await handle.boundingBox()
const w = await node.evaluate(el => el.offsetWidth)
await page.mouse.move(h.x + 5, h.y + 5)
await page.mouse.down()
await page.mouse.move(h.x - 75, h.y - 45, { steps: 6 })
await page.mouse.up()
assert.ok((await node.evaluate(el => el.offsetWidth)) < w)
await view.evaluate(el => el.scrollTo(850, 0))
const img = page
  .locator('.media-node')
  .filter({ has: page.locator('strong', { hasText: '产品主视觉' }) })
  .first()
await img.locator('.node-header').click({ button: 'right' })
await page.getByRole('menuitem', { name: '保存到我的资产', exact: true }).click()
await page.getByRole('button', { name: '取消', exact: true }).click()
const input = img.getByRole('textbox', { name: '产品主视觉提示词', exact: true })
await input.fill('清晨的香水产品')
await img.getByRole('button', { name: '优化提示词', exact: true }).click()
assert.equal(
  await page.getByRole('textbox', { name: '优化提示词预览', exact: true }).inputValue(),
  '清晨的香水产品'
)
await page.getByRole('textbox', { name: '提示词优化要求', exact: true }).fill('柔和侧逆光')
await page.getByTitle('生成优化提示词', { exact: true }).click()
await page.waitForTimeout(650)
assert.match(
  await page.getByRole('textbox', { name: '优化提示词预览', exact: true }).inputValue(),
  /柔和侧逆光/
)
await page.getByRole('textbox', { name: '优化提示词预览', exact: true }).fill('手动修订后的预览')
await page.screenshot({ path: '/tmp/ai-studio-optimize-v2.png' })
await page.getByRole('button', { name: '生成并应用', exact: true }).click()
assert.equal(await input.inputValue(), '手动修订后的预览')
await img.locator('.reference-chip').first().hover()
await img.getByRole('button', { name: '取消引用镜头 01', exact: true }).click()
assert.equal(await img.getByRole('button', { name: '取消引用镜头 01', exact: true }).count(), 0)
await img.locator('.node-header').click({ button: 'right' })
await page.getByRole('menuitem', { name: '复制节点', exact: true }).click()
await view.click({ button: 'right', position: { x: 250, y: 700 } })
assert.equal(await page.getByRole('menuitem', { name: '粘贴', exact: true }).isEnabled(), true)
await page.getByRole('menuitem', { name: '粘贴', exact: true }).click()
assert.equal(await page.locator('.media-node').count(), 3)
assert.deepEqual(errors, [])
console.log(
  '交互验证通过：画布抓手/节点拖动、表格缩放、右键保存与复制粘贴、预览编辑应用、取消引用。'
)
await browser.close()
