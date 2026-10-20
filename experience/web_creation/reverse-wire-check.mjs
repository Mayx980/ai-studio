import { chromium } from '@playwright/test'
import assert from 'node:assert/strict'
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || chromium.executablePath(),
  args: ['--no-sandbox']
})
const page = await browser.newPage({ viewport: { width: 1800, height: 1200 } })
await page.goto('http://127.0.0.1:5173')
await page.getByRole('button', { name: '夏日序曲 · 香水新品宣传' }).first().click()
await page.getByRole('button', { name: '收起助手', exact: true }).click()
await page.locator('.workspace-toolbar').getByRole('button', { name: '文字', exact: true }).click()
const text = page
  .locator('.media-node')
  .filter({ has: page.locator('.node-mini-tag', { hasText: '文字' }) })
  .last()
await text.locator('textarea').fill('从文字到视频的参考')
const video = page
  .locator('.media-node')
  .filter({ has: page.locator('.node-mini-tag', { hasText: '视频' }) })
await page.getByTitle('缩小', { exact: true }).click()
await page.getByTitle('缩小', { exact: true }).click()
async function drag(from, to) {
  await from.scrollIntoViewIfNeeded()
  let a = await from.boundingBox()
  await to.scrollIntoViewIfNeeded()
  const b = await to.boundingBox()
  a = await from.boundingBox()
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2)
  await page.mouse.down()
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 12 })
  await page.mouse.up()
}
await drag(video.locator('.node-inlet'), text.locator('.node-outlet'))
assert.match(await video.locator('.input-references').innerText(), /文字节点/)
const script = page.locator('.script-node')
await drag(
  video.locator('.node-inlet'),
  script.getByRole('button', { name: '连接镜头02', exact: true })
)
assert.match(await video.locator('.input-references').innerText(), /镜头 02/)
const image = page
  .locator('.media-node')
  .filter({ has: page.locator('.node-header strong', { hasText: '产品主视觉' }) })
await drag(
  script.getByRole('button', { name: '连接镜头03', exact: true }),
  image.locator('.node-inlet')
)
assert.match(await image.locator('.input-references').innerText(), /镜头 03/)
console.log('通过：从下游输入端反向拖到上游输出端、反向拖到分镜行、分镜行分别连接多个下游。')
await browser.close()
