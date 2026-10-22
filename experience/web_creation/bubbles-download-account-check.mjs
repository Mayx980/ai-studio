import { chromium } from '@playwright/test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || chromium.executablePath(),
  args: ['--no-sandbox']
})
const page = await browser.newPage({
    viewport: { width: 1800, height: 1100 },
    acceptDownloads: true
  }),
  errors = []
page.on('pageerror', e => errors.push(e.message))
await page.goto('http://127.0.0.1:5174')
await page.locator('.home-hero').waitFor()
await page.waitForLoadState('networkidle')
await page.evaluate(() => {
  const provides = document.querySelector('#app').__vue_app__._context.provides
  const p =
    provides[Object.getOwnPropertySymbols(provides).find(k => String(k).includes('creation-port'))]
  p.state.prompt = '目的：产品宣传；风格：电影感；30秒；16:9；核心内容：咖啡；受众：上班族'
  p.start()
  p.guideChoosePlan(p.currentGuide(), 0)
})
const card = page.locator('.story-guide')
await card.getByRole('button', { name: '展开编辑剧情脚本', exact: true }).click()
const story = page.getByRole('dialog', { name: '编辑剧情脚本草稿', exact: true }),
  storyBox = await story.boundingBox()
assert.ok(storyBox.width <= 700 && storyBox.height <= 560)
assert.equal(await story.getAttribute('aria-modal'), 'false')
await story
  .getByRole('textbox', { name: '剧情脚本草稿', exact: true })
  .fill('一、故事定义\n正文下载验证\n二、剧情结构\n开场：开始\n推进：冲突\n收束：结束')
await story.getByRole('button', { name: '保存草稿，返回确认', exact: true }).click()
await card
  .getByRole('button', { name: '确定剧情脚本，创建并保存文字节点，进入下一步', exact: true })
  .click()
await card.getByRole('button', { name: '展开分镜表并编辑', exact: true }).click()
const table = page.getByRole('dialog', { name: '分镜脚本表格', exact: true }),
  tableBox = await table.boundingBox()
assert.ok(tableBox.width > 1700 && tableBox.height > 1000)
const shortCell = table.getByLabel('镜头01number', { exact: true })
assert.ok((await shortCell.boundingBox()).height < 60)
const longCell = table.getByLabel('镜头01visual', { exact: true })
await longCell.fill(Array.from({ length: 12 }, (_, i) => '第' + i + '行画面描述').join('\n'))
await page.waitForTimeout(100)
assert.ok((await longCell.boundingBox()).height > 120)
assert.ok(await longCell.evaluate(el => el.scrollHeight <= el.clientHeight + 2))
await table.getByRole('button', { name: '保存草稿，返回确认', exact: true }).click()
await card
  .getByRole('button', { name: '确定分镜脚本，创建并保存脚本节点，进入下一步', exact: true })
  .click()
await card.getByRole('button', { name: '暂不生图', exact: true }).click()
await card.getByRole('button', { name: '选择部分镜头生成视频', exact: true }).click()
await card.getByRole('button', { name: '选择镜头', exact: true }).click()
assert.ok((await table.boundingBox()).width <= 700)
assert.equal(await table.getAttribute('aria-modal'), 'false')
await table.getByRole('button', { name: '返回', exact: true }).click()
await page.evaluate(() => {
  const provides = document.querySelector('#app').__vue_app__._context.provides
  const p =
    provides[Object.getOwnPropertySymbols(provides).find(k => String(k).includes('creation-port'))]
  const id = p.addNode('图片')
  Object.assign(
    p.state.nodes.find(n => n.id === id),
    { name: '下载图片', status: 'success', version: 3 }
  )
  const audio = p.addNode('音频')
  Object.assign(
    p.state.nodes.find(n => n.id === audio),
    { name: '下载音频', status: 'success' }
  )
  p.state.selectedRows = []
})
await page
  .locator('.workspace-header')
  .getByRole('button', { name: '下载素材', exact: true })
  .click()
const dialog = page.getByRole('dialog', { name: '下载镜头素材', exact: true })
assert.equal(await dialog.locator('.download-summary').count(), 0)
assert.equal(await dialog.getByText('仅下载当前可用素材，跳过缺失项', { exact: true }).count(), 0)
const checks = dialog.locator('.download-list input[type=checkbox]')
assert.equal(await checks.count(), 3)
for (const check of await checks.all()) {
  assert.equal(await check.isEnabled(), true)
  await check.uncheck()
}
assert.equal(await dialog.getByRole('button', { name: '准备下载', exact: true }).isDisabled(), true)
await dialog.getByLabel('下载剧情脚本', { exact: true }).check()
let downloadEvent = page.waitForEvent('download')
await dialog.getByRole('button', { name: '准备下载', exact: true }).click()
let download = await downloadEvent
assert.ok(download.suggestedFilename().endsWith('.txt'))
assert.ok((await fs.readFile(await download.path(), 'utf8')).includes('正文下载验证'))
await dialog.getByLabel('下载剧情脚本', { exact: true }).uncheck()
await dialog.getByLabel('下载下载图片', { exact: true }).check()
await dialog.getByLabel('下载下载音频', { exact: true }).check()
downloadEvent = page.waitForEvent('download')
await dialog.getByRole('button', { name: '准备下载', exact: true }).click()
download = await downloadEvent
assert.ok(download.suggestedFilename().endsWith('.zip'))
const bytes = await fs.readFile(await download.path()),
  names = []
let offset = 0
while (bytes.readUInt32LE(offset) === 0x04034b50) {
  const size = bytes.readUInt32LE(offset + 18),
    length = bytes.readUInt16LE(offset + 26),
    extra = bytes.readUInt16LE(offset + 28)
  names.push(bytes.subarray(offset + 30, offset + 30 + length).toString())
  offset += 30 + length + extra + size
}
assert.equal(names.length, 2)
assert.ok(names.some(n => n.endsWith('.png')))
assert.ok(names.some(n => n.endsWith('.wav')))
assert.ok(!names.some(n => n.endsWith('.txt')))
await dialog.getByRole('button', { name: '关闭', exact: true }).click()
assert.equal(await page.locator('.workspace-note').count(), 0)
await page.locator('.user-card').click()
await page.getByRole('menuitem', { name: '退出登录', exact: true }).click()
await page.getByRole('heading', { name: '已退出登录', exact: true }).waitFor()
assert.equal(await page.locator('.app-shell').count(), 0)
await page.getByRole('button', { name: '使用演示账号登录', exact: true }).click()
assert.equal(await page.locator('.app-shell').count(), 1)
assert.deepEqual(errors, [])
await browser.close()
console.log(
  'small/full-screen bubbles, content-fit cells, selected TXT/ZIP download and mock logout/login passed'
)
