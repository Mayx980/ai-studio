import { chromium } from '@playwright/test'
import assert from 'node:assert/strict'
const origin = process.env.PREVIEW_URL || 'http://127.0.0.1:5173'
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || chromium.executablePath(),
  args: ['--no-sandbox']
})
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
  const errors = [],
    external = []
  page.on('pageerror', e => errors.push(e.message))
  page.on('request', r => {
    if (r.url().startsWith('http') && !r.url().startsWith(origin)) external.push(r.url())
  })
  await page.goto(origin + '/?demo=1')
  await page.getByRole('button', { name: /01 \/ 自主编排/ }).click()
  await page.locator('.canvas-node').first().waitFor()
  assert.equal(await page.locator('.canvas-node').count(), 9)
  for (const name of ['1 · 剧情脚本', '2 · 分镜脚本', '3 · 图片生成', '4 · 视频生成'])
    await page.getByRole('button', { name, exact: true }).click()
  const video = page.locator('video').first()
  await video.waitFor()
  assert.ok(await video.getAttribute('src'))
  await page.getByRole('button', { name: '收起提示', exact: true }).click()
  await page.getByRole('button', { name: '展开提示', exact: true }).click()
  await page.getByRole('button', { name: '切换演示', exact: true }).click()
  await page.getByRole('button', { name: /02 \/ 对话引导/ }).click()
  await page.locator('.story-guide .guide-plan').first().waitFor()
  assert.equal(await page.locator('.canvas-node').count(), 0)
  await page.getByRole('button', { name: '选择此方案', exact: true }).first().click()
  await page.getByRole('button', { name: '展开编辑剧情脚本', exact: true }).click()
  await page.getByLabel('剧情脚本草稿', { exact: true }).waitFor()
  assert.deepEqual(errors, [])
  assert.deepEqual(external, [])
  await page.screenshot({ path: '/tmp/presentation-demo.png' })
  console.log(
    'presentation: both entry paths, 9 seeded nodes, four focus steps, local video, compact controls, assistant story editing and zero external requests passed'
  )
} finally {
  await browser.close()
}
