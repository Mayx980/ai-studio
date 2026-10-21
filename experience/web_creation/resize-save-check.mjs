import { chromium } from '@playwright/test'
import assert from 'node:assert/strict'
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || chromium.executablePath(),
  args: ['--no-sandbox']
})
const page = await browser.newPage({ viewport: { width: 1800, height: 1200 } })
const errors = []
page.on('pageerror', e => errors.push(e.message))
await page.goto('http://127.0.0.1:5173')
await page.getByRole('button', { name: '夏日序曲 · 香水新品宣传' }).first().click()
await page.getByRole('button', { name: '收起助手', exact: true }).click()
await page.locator('.workspace-toolbar').getByRole('button', { name: '文字', exact: true }).click()
const text = page
  .locator('.media-node')
  .filter({ has: page.locator('.node-mini-tag', { hasText: '文字' }) })
  .last()
await text.locator('textarea').fill('中文创作目标')
await text.scrollIntoViewIfNeeded()
const old = await text.boundingBox(),
  handle = text.locator('.resize-se'),
  b = await handle.boundingBox()
await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2)
await page.mouse.down()
await page.mouse.move(b.x + b.width / 2 + 140, b.y + b.height / 2 + 120, { steps: 12 })
await page.mouse.up()
const resized = await text.boundingBox()
assert.ok(resized.width > old.width + 100)
assert.ok(resized.height > old.height + 80)
assert.ok((await text.locator('textarea').boundingBox()).width < resized.width)
// @ selection is staged until explicit confirmation.
await text.locator('textarea').fill('保留正文 @')
await page.locator('.mention-panel').getByRole('button', { name: '文本', exact: true }).click()
const candidate = page
  .locator('.mention-panel .mention-group button')
  .filter({ has: page.locator('.mention-thumb') })
  .first()
await candidate.click()
assert.equal(await text.locator('.reference-chip').count(), 0)
await page.locator('.mention-panel').getByRole('button', { name: '确定', exact: true }).click()
assert.ok((await text.locator('.reference-chip').count()) > 0)
assert.equal(await text.locator('textarea').inputValue(), '保留正文 ')
// General reference picker: multi select doesn't close or mutate until confirmation.
await text.getByTitle('引用', { exact: true }).click()
const modal = page.locator('.modal').last()
await modal.getByRole('button', { name: '个人资产', exact: true }).click()
const choices = modal.locator('.reference-list > button')
await choices.nth(0).click()
await choices.nth(1).click()
assert.equal(await choices.locator('[aria-pressed="true"]').count(), 0) // pressed belongs to button itself
assert.equal(await modal.locator('.reference-list > button[aria-pressed="true"]').count(), 2)
const before = await text.locator('.reference-chip').count()
assert.ok(await modal.isVisible())
await modal.getByRole('button', { name: '确定', exact: true }).click()
assert.ok((await text.locator('.reference-chip').count()) >= before + 2)
// Editor fields are drafts; save updates canvas, delete is staged.
const script = page.locator('.script-node')
await script.getByTitle('编辑分镜表', { exact: true }).click()
const editor = page
  .locator('.modal')
  .filter({ has: page.getByRole('heading', { name: '编辑分镜脚本', exact: true }) })
const field = page.getByRole('textbox', { name: '01 visual', exact: true })
await field.fill('已确认的中文分镜画面')
assert.ok(!(await script.innerText()).includes('已确认的中文分镜画面'))
await editor.getByRole('button', { name: '确定', exact: true }).click()
assert.match(await script.innerText(), /已确认的中文分镜画面/)
assert.ok(await editor.isVisible())
await editor.getByTitle('删除镜头', { exact: true }).nth(1).click()
await page.locator('.row-delete-overlay').getByRole('button', { name: /删除/ }).click()
assert.equal(await editor.locator('tbody tr').count(), 2)
assert.equal(await script.locator('tbody tr').count(), 3)
await editor.getByRole('button', { name: '确定', exact: true }).click()
assert.equal(await script.locator('tbody tr').count(), 2)
await page.screenshot({ path: '/tmp/r6-editor.png', fullPage: true })
assert.deepEqual(errors, [])
console.log('通过：节点边框缩放与输入自适应、@及引用面板确认多选、分镜草稿编辑及删除确认保存。')
await browser.close()
