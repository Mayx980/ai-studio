import { chromium } from '@playwright/test'
import assert from 'node:assert/strict'
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || chromium.executablePath(),
  args: ['--no-sandbox']
})
const page = await browser.newPage({ viewport: { width: 1800, height: 1100 } }),
  errors = []
page.on('pageerror', e => errors.push(e.message))
await page.goto('http://127.0.0.1:5174')
await page.getByRole('button', { name: '新建创作', exact: true }).click()
await page.getByPlaceholder('请输入项目名称').fill('布局验证')
await page.locator('.modal-footer .primary-button').click()
const panel = page.locator('.agent-panel'),
  before = await panel.boundingBox()
assert.ok(before.width >= 450)
let handle = await page.getByRole('separator', { name: '调整助手宽度' }).boundingBox()
await page.mouse.move(handle.x + 5, handle.y + 100)
await page.mouse.down()
await page.mouse.move(handle.x - 120, handle.y + 100)
await page.mouse.up()
assert.ok((await panel.boundingBox()).width > before.width + 100)
handle = await page.getByRole('button', { name: '调整助手大小', exact: true }).boundingBox()
const heightBefore = (await panel.boundingBox()).height
await page.mouse.move(handle.x + 10, handle.y + 10)
await page.mouse.down()
await page.mouse.move(handle.x + 10, handle.y - 100)
await page.mouse.up()
assert.ok((await panel.boundingBox()).height < heightBefore - 80)
async function add(type) {
  await page.getByRole('button', { name: '添加节点：Tab', exact: true }).click()
  await page.getByRole('menuitem', { name: type + '节点', exact: true }).click()
}
await add('文字')
const input = page.locator('.direct-story-input')
await input.fill(
  '一、故事定义\n用户直接填写的完整剧情\n二、剧情结构\n推进与收束\n三、创作约束层\n禁止改写品牌事实'
)
assert.ok((await input.inputValue()).includes('完整剧情'))
await add('脚本')
await page.locator('.script-node .node-header strong').click()
const full = await page.locator('.fullscreen-script-editor').boundingBox()
assert.ok(full.width > 1700 && full.height > 1000)
await page
  .locator('.fullscreen-script-editor .modal-header')
  .getByRole('button', { name: '关闭', exact: true })
  .click()
await add('图片')
const image = page
  .locator('.media-node')
  .filter({ has: page.locator('.parameter-summary') })
  .last()
await image.locator('.parameter-summary button').click()
const fields = await page.locator('.shared-media-parameters label').allTextContents()
assert.ok(fields.some(x => x.includes('背景')))
assert.ok(fields.some(x => x.includes('模型')))
await page.getByLabel('背景', { exact: true }).selectOption('透明')
await page.locator('.modal-footer .primary-button').click()
assert.ok((await image.locator('.parameter-summary').innerText()).includes('透明'))
await page.screenshot({ path: '/tmp/assistant-layout.png', fullPage: true })
assert.deepEqual(errors, [])
await browser.close()
console.log(
  'assistant resizing, direct story input, full-screen script editor and shared media parameters passed'
)
