import { chromium } from '@playwright/test'
import assert from 'node:assert/strict'
const b = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || chromium.executablePath(),
  args: ['--no-sandbox']
})
const page = await b.newPage({ viewport: { width: 1800, height: 1200 } }),
  errors = []
page.on('pageerror', e => errors.push(e.message))
await page.goto('http://127.0.0.1:5174')
await page.evaluate(() => {
  const provides = document.querySelector('#app').__vue_app__._context.provides
  const p =
    provides[Object.getOwnPropertySymbols(provides).find(k => String(k).includes('creation-port'))]
  p.openProject('project-summer')
  p.state.zoom = 100
  p.state.nodes.find(n => n.id === 'script').x = 2500
  p.connectToRow('image-1', 'shot-a')
  p.connectNodes('image-1', 'video-1')
  const video = p.state.nodes.find(n => n.id === 'video-1')
  video.x = 30
  video.y = 30
  video.mode = '图生视频'
  const id = p.addNode('图片', undefined, { x: 400, y: 30 })
  p.connectNodes('image-1', id)
})
for (const id of [
  'video-1',
  await page.locator('.canvas-node[data-node-id^="node-"]').last().getAttribute('data-node-id')
]) {
  const node = page.locator(`[data-node-id="${id}"]`),
    editor = node.locator('.media-mention-editor')
  await editor.fill('这个场景参考@')
  const picker = page.getByRole('dialog', { name: '选择引用内容', exact: true })
  assert.equal(await picker.getByText('已引用的图片', { exact: true }).count(), 1)
  const name = await picker.locator('.mention-group button').first().getAttribute('aria-label')
  await picker.locator('.mention-group button').first().click()
  await picker.getByRole('button', { name: '确定', exact: true }).click()
  assert.equal(
    await editor.locator('.inline-image-mention').getAttribute('data-mention-name'),
    name.trim()
  )
  assert.equal(await editor.locator('.inline-image-mention').count(), 1)
  await editor.press('End')
  await editor.press('Space')
  await editor.pressSequentially('后续动作')
  assert.ok((await editor.innerText()).includes('后续动作'))
}
const video = page.locator('[data-node-id="video-1"]')
assert.deepEqual(await video.getByLabel('视频生成方式').locator('option').allTextContents(), [
  '图生视频',
  '文生视频'
])
assert.equal(await video.getByRole('button', { name: /确认.*图片|选择并确认图片/ }).count(), 0)
await video.getByRole('button', { name: '生成', exact: true }).click()
const confirm = page.getByRole('dialog', { name: '确认本次生成', exact: true })
assert.equal(await confirm.locator('.generation-reference-review .reference-chip').count(), 1)
await confirm.getByRole('button', { name: /取消引用/ }).click()
assert.equal(await confirm.locator('.generation-reference-review .reference-chip').count(), 0)
assert.equal(await confirm.getByRole('button', { name: '确认', exact: true }).isDisabled(), true)
await page.screenshot({ path: '/tmp/image-mentions.png', fullPage: true })
assert.deepEqual(errors, [])
await b.close()
console.log(
  'image/video inline image mentions, unified mode, deduplicated pre-generation review and removal passed'
)
