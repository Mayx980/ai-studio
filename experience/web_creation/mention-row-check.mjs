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
await page.locator('.canvas-viewport').click({ position: { x: 700, y: 900 } })
await page.evaluate(() => {
  const transfer = new DataTransfer()
  for (let i = 0; i < 2; i++) {
    const c = document.createElement('canvas')
    c.width = 80
    c.height = 60
    const ctx = c.getContext('2d')
    ctx.fillStyle = i ? '#75ae93' : '#ae80cf'
    ctx.fillRect(0, 0, 80, 60)
    const bytes = Uint8Array.from(atob(c.toDataURL().split(',')[1]), x => x.charCodeAt(0))
    transfer.items.add(new File([bytes], '测试引用图' + (i + 1) + '.png', { type: 'image/png' }))
  }
  document
    .querySelector('.canvas-viewport')
    .dispatchEvent(new ClipboardEvent('paste', { bubbles: true, clipboardData: transfer }))
})
await page.waitForFunction(() =>
  [...document.querySelectorAll('.node-header strong')].some(
    el => el.textContent === '测试引用图2.png'
  )
)
const image = page
  .locator('.media-node')
  .filter({ has: page.locator('.node-header strong', { hasText: '产品主视觉' }) })
  .first()
const input = image.getByLabel('产品主视觉提示词', { exact: true })
assert.equal(await input.inputValue(), '')
await image.getByTitle('优化提示词', { exact: true }).click()
assert.match(await page.getByLabel('优化提示词预览', { exact: true }).inputValue(), /镜头号：01/)
assert.match(await page.getByLabel('优化提示词预览', { exact: true }).inputValue(), /晨光/)
await page.getByRole('button', { name: '取消', exact: true }).click()
await input.fill('保留要求 @')
await page.getByRole('dialog', { name: '选择引用内容' }).waitFor()
await page.locator('.mention-panel').getByRole('button', { name: '图片', exact: true }).click()
await page
  .locator('.mention-panel')
  .getByRole('button', { name: '测试引用图1.png', exact: true })
  .click()
assert.equal(await input.inputValue(), '保留要求 ')
assert.ok(await image.locator('.input-references .reference-chip-cover img').count())
await input.fill('保留要求 @')
await page.locator('.mention-panel').getByRole('button', { name: '资产', exact: true }).click()
await page
  .locator('.mention-panel')
  .getByRole('button', { name: '自然晨光 · 摄影提示词', exact: true })
  .click()
assert.equal(await input.inputValue(), '保留要求 ')
assert.match(await image.locator('.input-references').innerText(), /摄影提示词/)
const script = page.locator('.script-node'),
  pasted = page
    .locator('.media-node')
    .filter({ has: page.locator('.node-header strong', { hasText: '测试引用图1.png' }) })
await pasted.locator('.node-outlet').click()
await script.locator('.node-inlet').click()
await page.getByRole('checkbox', { name: '应用到镜头01', exact: true }).check()
await page.getByRole('checkbox', { name: '应用到镜头03', exact: true }).check()
await page.getByRole('button', { name: '确认应用', exact: true }).click()
assert.equal(await script.locator('tbody tr').nth(0).locator('.row-reference-cell img').count(), 1)
assert.equal(await script.locator('tbody tr').nth(1).locator('.row-reference-cell img').count(), 0)
assert.equal(await script.locator('tbody tr').nth(2).locator('.row-reference-cell img').count(), 1)
await page.screenshot({ path: '/tmp/ai-studio-row-references-v5.png' })
await script.getByTitle('编辑分镜表', { exact: true }).click()
const editor = page.getByRole('dialog', { name: '编辑分镜脚本', exact: true })
await editor.waitFor()
await editor.getByTitle('删除镜头', { exact: true }).nth(1).click()
await page.getByRole('dialog', { name: '确认删除镜头', exact: true }).waitFor()
assert.equal(await editor.count(), 1)
await page.getByRole('button', { name: '确定删除', exact: true }).click()
assert.equal(await editor.locator('tbody tr').count(), 2)
await page.keyboard.press('Escape')
assert.equal(await editor.count(), 1)
await page.mouse.click(12, 12)
assert.equal(await editor.count(), 1)
await editor.getByTitle('关闭', { exact: true }).click()
assert.equal(await editor.count(), 0)
const video = page
  .locator('.media-node')
  .filter({ has: page.locator('.node-header strong', { hasText: '晨光产品特写' }) })
await video.getByRole('button', { name: '选择并确认图片', exact: true }).click()
await page.locator('.reference-list button').filter({ hasText: '测试引用图1.png' }).click()
await page.locator('.reference-list button').filter({ hasText: '测试引用图2.png' }).click()
assert.equal(await page.getByRole('dialog', { name: '引用内容', exact: true }).count(), 1)
await page.screenshot({ path: '/tmp/ai-studio-multi-images-v5.png' })
await page.getByRole('button', { name: '确认并保存', exact: true }).click()
assert.equal(await video.getByLabel('视频生成方式', { exact: true }).inputValue(), '参考图生视频')
assert.match(await video.innerText(), /已确认 2 张图片/)
assert.deepEqual(errors, [])
console.log(
  '通过：@图片/资产封面、保留手写内容、空输入优化带入分镜、按镜头分配图片、编辑页删除不退出和仅X关闭、多图确认保存。'
)
await browser.close()
