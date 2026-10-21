import { chromium } from '@playwright/test'
import assert from 'node:assert/strict'
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || chromium.executablePath(),
  args: ['--no-sandbox']
})
const page = await browser.newPage({
  viewport: { width: 1800, height: 1200 },
  acceptDownloads: true
})
const errors = []
page.on('pageerror', e => errors.push(e.message))
await page.goto('http://127.0.0.1:5173')
await page.getByRole('button', { name: '夏日序曲 · 香水新品宣传' }).first().click()
await page.getByRole('button', { name: '收起助手', exact: true }).click()
const script = page.locator('.script-node')
const dimensions = await script
  .locator('.script-table-scroll')
  .evaluate(e => ({ w: e.clientWidth, sw: e.scrollWidth, h: e.clientHeight, sh: e.scrollHeight }))
assert.ok(dimensions.sw <= dimensions.w + 2, JSON.stringify(dimensions))
assert.ok(dimensions.sh <= dimensions.h + 2, JSON.stringify(dimensions))
const row = script.locator('tbody tr').first()
assert.equal(await row.locator('td').first().locator('[data-row-target]').count(), 1)
assert.equal(await row.locator('td').last().locator('[data-row-source]').count(), 1)
await page.locator('.workspace-toolbar').getByRole('button', { name: '文字', exact: true }).click()
const text = page
  .locator('.media-node')
  .filter({ has: page.locator('.node-mini-tag', { hasText: '文字' }) })
  .last()
const old = await text.locator('.text-node-preview').boundingBox()
await text.getByRole('button', { name: '详情', exact: true }).click()
await page
  .getByRole('textbox', { name: '文本正文', exact: true })
  .fill('用于验证滚动的长文本。\n'.repeat(250))
await page.getByRole('button', { name: '确定', exact: true }).click()
const size = await text.locator('.text-node-preview').boundingBox()
assert.equal(Math.round(old.height), Math.round(size.height))
assert.ok(await text.locator('.text-node-preview p').evaluate(e => e.scrollHeight > e.clientHeight))
// Inline sample video plays in the existing node.
const video = page
  .locator('.media-node')
  .filter({ has: page.locator('.node-mini-tag', { hasText: '视频' }) })
  .first()
await video.getByLabel('视频生成方式').selectOption('文生视频')
await video.locator('textarea').fill('本地视频播放示例')
await video.locator('.node-generate').click()
await page.locator('.modal-footer .primary-button').click()
await video.locator('.video-play').click()
await page.waitForFunction(() => {
  const v = document.querySelector('video.actual-media')
  return v && !v.paused && v.currentTime > 0.1
})
assert.equal(await page.getByRole('dialog').count(), 0)
// Single image download is PNG with a descriptive shot filename.
const image = page
  .locator('.media-node')
  .filter({ has: page.locator('.node-mini-tag', { hasText: '图片' }) })
  .first()
await image.getByTitle('下载素材', { exact: true }).click()
let event = page.waitForEvent('download')
await page.getByRole('button', { name: '准备下载', exact: true }).click()
let download = await event
assert.match(download.suggestedFilename(), /^01_.*\.png$/)
await download.saveAs('/tmp/r7-single.png')
await page.getByTitle('关闭', { exact: true }).click()
// Select one shot and download only its two linked media, in one ZIP.
await script.getByRole('checkbox', { name: '选择镜头01', exact: true }).check()
await page.getByRole('button', { name: '下载素材', exact: true }).first().click()
event = page.waitForEvent('download')
await page.getByRole('button', { name: '准备下载', exact: true }).click()
download = await event
assert.match(download.suggestedFilename(), /\.zip$/)
await download.saveAs('/tmp/r7-selected.zip')
await page.getByTitle('关闭', { exact: true }).click()
await page.locator('.workspace-toolbar').getByRole('button', { name: '音频', exact: true }).click()
const audio = page
  .locator('.media-node')
  .filter({ has: page.locator('.node-mini-tag', { hasText: '音频' }) })
  .last()
await audio.locator('textarea').fill('本地音效示例')
await audio.locator('.node-generate').click()
await page.locator('.modal-footer .primary-button').click()
await audio.locator('.audio-result').waitFor()
await audio.getByTitle('下载素材', { exact: true }).click()
event = page.waitForEvent('download')
await page.getByRole('button', { name: '准备下载', exact: true }).click()
download = await event
await download.saveAs('/tmp/r7-audio.wav')
assert.deepEqual(errors, [])
console.log(
  '通过：文本固定高度及滚动、分镜全部行列和首尾连接点、节点内视频播放、单图及选定镜头ZIP下载。'
)
await browser.close()
