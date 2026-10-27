import { chromium } from '@playwright/test'
import assert from 'node:assert/strict'
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || chromium.executablePath(),
  args: ['--no-sandbox']
})
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1050 } }),
    errors = [],
    external = []
  page.on('pageerror', e => errors.push(e.message))
  page.on('request', r => {
    if (r.url().startsWith('http') && !r.url().startsWith('http://127.0.0.1:5173'))
      external.push(r.url())
  })
  await page.goto('http://127.0.0.1:5173/')
  assert.ok(
    await page
      .getByRole('button', { name: '灵活模式', exact: true })
      .getAttribute('class')
      .then(c => c.includes('active'))
  )
  await page.getByRole('button', { name: '预览达人口播种草', exact: true }).click()
  await page.getByRole('dialog', { name: '放大预览' }).waitFor()
  assert.equal(await page.locator('.studio-message').count(), 0)
  await page.getByLabel('关闭预览').click()
  await page.locator('.studio-case-copy').first().hover()
  await page.getByLabel('使用达人口播种草', { exact: true }).click()
  assert.equal(await page.locator('.studio-ref').count(), 2)
  assert.equal(await page.locator('.studio-message').count(), 0)
  await page.getByLabel('发送创作需求').click()
  await page.locator('.studio-result').first().waitFor()
  assert.equal(await page.locator('.canvas-node').count(), 0)
  assert.ok(await page.locator('.studio-result video').getAttribute('src'))
  await page.locator('.studio-result').first().getByTitle('引用此结果').click()
  assert.ok(await page.locator('.studio-target').textContent())
  await page.locator('.studio-result').first().getByTitle('圈选局部修改').click()
  const area = page.locator('.studio-draw')
  const b = await area.boundingBox()
  await page.mouse.move(b.x + 80, b.y + 70)
  await page.mouse.down()
  await page.mouse.move(b.x + 260, b.y + 220)
  await page.mouse.up()
  await page.getByLabel('区域修改要求').fill('把圈选物体改成绿色，其他保持不变')
  await page.getByRole('button', { name: '生成修改版本', exact: true }).click()
  await page.locator('.studio-result').nth(1).waitFor()
  assert.equal(await page.locator('.studio-result').count(), 2)
  await page
    .locator('.studio-result')
    .last()
    .getByRole('button', { name: '保存到个人资产', exact: true })
    .click()
  await page
    .locator('.studio-result')
    .last()
    .getByRole('button', { name: '添加到画布', exact: true })
    .click()
  await page.getByRole('button', { name: '设置与外观', exact: true }).click()
  await page.getByRole('button', { name: '浅色', exact: true }).click()
  assert.equal(await page.locator('html').getAttribute('data-appearance'), 'light')
  await page.getByLabel('关闭设置').click()
  await page.screenshot({ path: '/tmp/studio-light-result.png' })
  await page.reload()
  assert.equal(await page.locator('html').getAttribute('data-appearance'), 'light')
  await page.getByRole('button', { name: '设置与外观', exact: true }).click()
  await page.getByRole('button', { name: '深色', exact: true }).click()
  await page.getByLabel('关闭设置').click()
  await page.getByLabel('产出类型').selectOption('音频')
  await page.getByLabel('音频用途').selectOption('环境音效')
  await page.getByLabel('创作需求', { exact: true }).fill('生成森林雨声环境音效')
  await page.getByLabel('发送创作需求').click()
  await page.locator('.studio-result audio').waitFor()
  await page.getByRole('button', { name: '新会话', exact: true }).click()
  await page.getByRole('button', { name: '首尾帧', exact: true }).click()
  await page.getByLabel('创作需求', { exact: true }).fill('生成首尾帧视频')
  await page.getByLabel('发送创作需求').click()
  await page.getByRole('alert').waitFor()
  assert.equal(await page.locator('.studio-message').count(), 0)
  for (const name of ['首帧', '尾帧']) {
    await page.getByRole('button', { name, exact: true }).click()
    await page.locator('.studio-picker-grid>button').first().click()
  }
  await page.getByLabel('发送创作需求').click()
  await page.locator('.studio-result').waitFor()
  assert.ok((await page.locator('.studio-tiny-refs').textContent()).includes('首帧'))
  await page.getByRole('button', { name: '新会话', exact: true }).click()
  await page.getByRole('button', { name: '灵感模式', exact: true }).click()
  await page
    .getByLabel('创作需求', { exact: true })
    .fill('目的：产品宣传；风格：电影感；时长15秒；比例9:16；核心内容：香水；目标受众：年轻女性')
  await page.getByLabel('发送创作需求').click()
  await page.locator('.story-guide .guide-plan').first().waitFor()
  await page.getByRole('button', { name: '选择此方案', exact: true }).first().click()
  await page.getByRole('button', { name: '展开编辑剧情脚本', exact: true }).click()
  await page.getByLabel('剧情脚本草稿', { exact: true }).waitFor()
  assert.deepEqual(errors, [])
  assert.deepEqual(external, [])
  console.log(
    'studio browser: creative preview/application, no auto generation, video output, region new version, references, asset/canvas save, persistent light/dark, audio, first/last frames and guided story preview passed; no external requests'
  )
} finally {
  await browser.close()
}
