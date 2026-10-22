import { chromium } from '@playwright/test'
import assert from 'node:assert/strict'
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || chromium.executablePath(),
  args: ['--no-sandbox']
})
const page = await browser.newPage({ viewport: { width: 1800, height: 1200 } }),
  errors = []
page.on('pageerror', e => errors.push(e.message))
await page.goto('http://127.0.0.1:5173')
await page.getByRole('button', { name: '夏日序曲 · 香水新品宣传' }).first().click()
await page.getByRole('button', { name: '收起助手', exact: true }).click()
const layers = page.getByRole('region', { name: '画布层级' })
for (const type of ['文字', '图片', '视频', '脚本', '音频'])
  assert.equal(await layers.getByRole('button', { name: new RegExp(type + '节点') }).count(), 1)
await page.locator('.canvas-viewport').click({ position: { x: 500, y: 850 } })
await page.keyboard.press('h')
assert.equal(
  await page.getByRole('button', { name: '抓手模式' }).getAttribute('aria-pressed'),
  'true'
)
await page.keyboard.press('v')
assert.equal(
  await page.getByRole('button', { name: '移动模式' }).getAttribute('aria-pressed'),
  'true'
)
const toolbar = page.getByRole('group', { name: '画布工具栏' }) // use class fallback below
assert.ok((await page.locator('.canvas-top-tools').boundingBox()).y < 220)
await page.getByTitle('快捷键', { exact: true }).click()
assert.equal(await page.getByRole('dialog', { name: '画布快捷键' }).count(), 1)
await page.getByTitle('关闭快捷键').click()
await page.keyboard.press('Tab')
await page.getByRole('menuitem', { name: '文字节点', exact: true }).click()
let text = page
  .locator('.media-node')
  .filter({ has: page.locator('.node-mini-tag', { hasText: '文字' }) })
  .last()
await text.locator('textarea').fill('测试内容')
await text.locator('.node-header strong').click()
await page.keyboard.press('Meta+d')
assert.equal(await layers.locator('.layer-card').filter({ hasText: '副本' }).count(), 1)
await page.keyboard.press('Meta+z')
assert.equal(await layers.locator('.layer-card').filter({ hasText: '副本' }).count(), 0)
await page.keyboard.press('Meta+Shift+z')
assert.equal(await layers.locator('.layer-card').filter({ hasText: '副本' }).count(), 1)
await layers.getByRole('button', { name: '定位文字节点 101', exact: true }).click()
const dragNode = page
    .locator('.media-node')
    .filter({ has: page.locator('.node-header strong', { hasText: '文字节点 101' }) })
    .first(),
  count = await page.locator('.canvas-node').count()
await dragNode.locator('.node-header strong').scrollIntoViewIfNeeded()
const box = await dragNode.locator('.node-header strong').boundingBox()
await page.keyboard.down('Alt')
await page.mouse.move(box.x + 10, box.y + 8)
await page.mouse.down()
await page.mouse.move(box.x + 150, box.y + 110, { steps: 10 })
await page.mouse.up()
await page.keyboard.up('Alt')
assert.equal(await page.locator('.canvas-node').count(), count + 1)
await page.keyboard.press('Meta+z')
assert.equal(await page.locator('.canvas-node').count(), count)
await dragNode.locator('.node-delete').click()
await page.getByRole('dialog').getByRole('button', { name: '取消', exact: true }).click()
assert.equal(await page.locator('.canvas-node').count(), count)
// Duplicate the script and edit only the copy.
await layers.getByRole('button', { name: '定位夏日序曲 · 分镜脚本', exact: true }).click()
await page.keyboard.press('Meta+d')
assert.equal(await page.locator('.script-node').count(), 2)
const copy = page
  .locator('.script-node')
  .filter({ has: page.locator('.node-header strong', { hasText: '分镜脚本 - 副本' }) })
await layers.getByRole('button', { name: '定位夏日序曲 · 分镜脚本 - 副本', exact: true }).click()
await copy.getByTitle('编辑分镜表', { exact: true }).click()
const originalText = await page.locator('.script-node').first().innerText()
await page.getByRole('textbox', { name: '01 visual', exact: true }).fill('副本独立编辑验证')
await page
  .getByRole('dialog', { name: '编辑分镜脚本', exact: true })
  .getByRole('button', { name: '确定', exact: true })
  .click()
await page.getByTitle('关闭', { exact: true }).click()
assert.match(await copy.innerText(), /副本独立编辑验证/)
assert.equal(await page.locator('.script-node').first().innerText(), originalText)
await page.keyboard.press('Delete')
await page.getByRole('dialog').getByRole('button', { name: '确认', exact: true }).click()
assert.equal(await page.locator('.script-node').count(), 1)
await page.keyboard.press('Meta+z')
assert.equal(await page.locator('.script-node').count(), 2)
await page.getByRole('button', { name: '定位产品主视觉', exact: true }).click()
await page.keyboard.press('Meta+Enter')
assert.equal(await page.getByRole('dialog').count(), 1)
await page.getByRole('dialog').getByRole('button', { name: '取消', exact: true }).click()
await page.keyboard.press('Meta+0')
await page.screenshot({ path: '/tmp/r8-layers-toolbar.png' })
assert.deepEqual(errors, [])
console.log(
  '通过：分类层级、SVG顶部工具栏、V/H/Tab、复制与撤销重做、脚本独立编辑、删除确认及撤销。'
)
await browser.close()
