import { chromium } from '@playwright/test'
import assert from 'node:assert/strict'
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || chromium.executablePath(),
  args: ['--no-sandbox']
})
const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } })
const errors = []
page.on('pageerror', e => errors.push(e.message))
await page.goto('http://127.0.0.1:5173')
await page.getByRole('button', { name: '我的项目', exact: true }).click()
await page.getByRole('button', { name: '新建项目', exact: true }).click()
await page.locator('.modal input').fill('图片粘贴与连接')
await page.locator('.modal-footer').getByRole('button', { name: '确定', exact: true }).click()
await page.getByRole('button', { name: '收起助手' }).click()
await page.locator('.workspace-toolbar').getByRole('button', { name: '文字', exact: true }).click()
const text = page.locator('.media-node').first()
await text.locator('textarea').fill('拍摄产品')
await page.locator('.canvas-viewport').click({ position: { x: 500, y: 150 } })
await page.mouse.move(800, 350)
await page.evaluate(() => {
  const canvas = document.createElement('canvas')
  canvas.width = 120
  canvas.height = 80
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#b98bea'
  ctx.fillRect(0, 0, 120, 80)
  const url = canvas.toDataURL()
  const bytes = Uint8Array.from(atob(url.split(',')[1]), c => c.charCodeAt(0))
  const transfer = new DataTransfer()
  transfer.items.add(new File([bytes], '粘贴产品.png', { type: 'image/png' }))
  document
    .querySelector('.canvas-viewport')
    .dispatchEvent(new ClipboardEvent('paste', { bubbles: true, clipboardData: transfer }))
})
await page.waitForFunction(() => document.querySelectorAll('.media-node').length === 2)
const image = page
  .locator('.media-node')
  .filter({ has: page.locator('.node-mini-tag', { hasText: '图片' }) })
assert.match(await image.locator('.actual-media').getAttribute('src'), /^data:image\/png/)
assert.equal(await image.locator('.node-header button').count(), 0)
assert.equal(await text.locator('.node-header button').count(), 0)
await text.locator('.node-outlet').click()
await image.locator('.node-inlet').click()
assert.equal(await image.locator('.reference-chip').count(), 1)
const hit = page.locator('.connection-hit').first()
const point = await hit.evaluate(el => {
  const p = el.getPointAtLength(el.getTotalLength() / 2)
  const v = new DOMPoint(p.x, p.y).matrixTransform(el.getScreenCTM())
  return { x: v.x, y: v.y }
})
await page.mouse.click(point.x, point.y, { button: 'right' })
await page.getByRole('menuitem', { name: '取消连线', exact: true }).click()
assert.equal(await image.locator('.reference-chip').count(), 0)
await text.getByTitle('引用', { exact: true }).click()
await page.locator('.reference-tabs').getByRole('button', { name: '当前画布', exact: true }).click()
assert.match(
  await page.locator('.reference-list .media-cover img').getAttribute('src'),
  /^data:image\/png/
)
await page.screenshot({ path: '/tmp/ai-studio-paste-reference.png' })
assert.deepEqual(errors, [])
console.log(
  '通过：图片实际粘贴、节点连线、右键断开、取消上游引用、当前画布图片封面、无右上角删除图标。'
)
await browser.close()
