import { chromium } from '@playwright/test'
import assert from 'node:assert/strict'
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || chromium.executablePath(),
  args: ['--no-sandbox']
})
const page = await browser.newPage({ viewport: { width: 1800, height: 1200 } }),
  errors = []
page.on('pageerror', e => errors.push(e.message))
await page.goto('http://127.0.0.1:5174')
await page.getByRole('button', { name: '我的项目', exact: true }).click()
await page.getByPlaceholder('请输入项目名', { exact: true }).fill('不存在的名字')
assert.equal(await page.locator('.project-card').count(), 0)
await page.getByPlaceholder('请输入项目名', { exact: true }).fill('香水')
assert.equal(await page.locator('.project-card').count(), 1)
await page.getByPlaceholder('请输入项目名', { exact: true }).fill('')
await page.locator('.project-create-card').click()
await page.getByPlaceholder('请输入项目名称', { exact: true }).fill('近期验证项目')
await page.locator('.modal-footer .primary-button').click()
assert.match(await page.locator('.project-title').innerText(), /近期验证项目/)
await page.getByTitle('收起画布层级', { exact: true }).click()
await page.waitForTimeout(250)
assert.ok((await page.locator('.main-sidebar').boundingBox()).x < 0)
await page.getByTitle('展开画布层级', { exact: true }).click()
await page.waitForTimeout(250)
assert.equal(await page.locator('.canvas-tab').count(), 0)
assert.equal(
  await page
    .locator('.workspace-toolbar')
    .getByRole('button', { name: '文字', exact: true })
    .count(),
  0
)
const center = await page.locator('.canvas-viewport').boundingBox(),
  tools = await page.locator('.canvas-top-tools').boundingBox()
assert.ok(Math.abs(tools.x + tools.width / 2 - center.x - center.width / 2) < 4)
await page.keyboard.press('Tab')
await page.getByRole('menuitem', { name: '文字节点', exact: true }).click()
const text = page.locator('.media-node').last()
assert.equal(await text.locator('.text-node-preview').count(), 0)
await text.locator('textarea').fill('需要优化的产品文案')
await text.getByLabel('选择文本模型').selectOption('mock-copy')
assert.equal(await text.getByLabel('选择文本模型').inputValue(), 'mock-copy')
assert.equal(await text.getByTitle('保存提示词为资产').count(), 0)
await text.getByTitle('优化提示词', { exact: true }).click()
const bubble = page.locator('.canvas-bubble')
await bubble.waitFor()
assert.equal(await bubble.getAttribute('aria-modal'), 'false')
assert.equal(
  await page.locator('.bubble-shell').evaluate(e => getComputedStyle(e).backdropFilter),
  'none'
)
await page.screenshot({ path: '/tmp/r9-bubble.png' })
await bubble.getByTitle('关闭', { exact: true }).click()
await page.getByTitle('快捷键', { exact: true }).click()
assert.match(
  await page.getByRole('dialog', { name: '画布快捷键' }).innerText(),
  /Option \/ Alt \+ 拖动/
)
await page.getByTitle('关闭快捷键').click()
await page.getByTitle('返回项目', { exact: true }).click()
await page.getByRole('button', { name: '灵感创作', exact: true }).click()
assert.equal(await page.locator('.home-page .project-card h3').first().innerText(), '近期验证项目')
assert.equal(await page.locator('.recent-link').first().innerText(), '近期验证项目')
await page.locator('.recent-link').filter({ hasText: '夏日序曲' }).click()
await page.getByTitle('返回项目', { exact: true }).click()
await page.getByRole('button', { name: '灵感创作', exact: true }).click()
assert.match(await page.locator('.home-page .project-card h3').first().innerText(), /夏日序曲/)
await page.getByRole('button', { name: '个人资产', exact: false }).first().click()
assert.equal(await page.getByRole('button', { name: '保存提示词', exact: true }).count(), 0)
assert.equal(
  await page.locator('.filter-tabs').getByRole('button', { name: '提示词', exact: true }).count(),
  0
)
assert.equal(await page.locator('.assets-heading h1 span').count(), 0)
assert.deepEqual(errors, [])
console.log(
  '通过：项目搜索与最近项目刷新、占位文案、侧栏收起展开、工具栏居中、文本模拟模型选择、气泡面板及提示词资产取消。'
)
await browser.close()
