import { chromium } from '@playwright/test'
import assert from 'node:assert/strict'
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || chromium.executablePath(),
  args: ['--no-sandbox']
})
const page = await browser.newPage({ viewport: { width: 1800, height: 1200 } }),
  errors = [],
  requests = []
page.on('pageerror', e => errors.push(e.message))
page.on('request', r => requests.push(r.url()))
await page.goto('http://127.0.0.1:5174')
await page
  .locator('.inspiration-box textarea')
  .fill('目的：产品宣传；风格：电影感；时长30秒；比例16:9；核心内容：咖啡新品；目标受众：上班族')
await page.getByRole('button', { name: '开始创作', exact: true }).click()
const card = page.locator('.story-guide')
await card.locator('[class="guide-plan"]').first().waitFor()
assert.equal(await page.locator('.canvas-node').count(), 0)
assert.equal(await page.getByRole('button', { name: '缩小', exact: true }).count(), 0)
await card.getByRole('button', { name: '选择此方案' }).first().click()
await card
  .getByLabel('剧情脚本草稿')
  .fill(
    '一、故事定义\n咖啡新品故事\n二、剧情结构\n开场：咖啡豆醒来\n推进：研磨冲泡\n收束：端起咖啡\n三、创作约束层\n不得添加健康承诺\n四、制作设计\n30秒，电影感'
  )
await card
  .getByRole('button', { name: '确定剧情脚本，创建并保存文字节点，进入下一步', exact: true })
  .click()
assert.equal(await page.locator('.canvas-node').count(), 1)
await card.getByRole('button', { name: '展开分镜表并编辑' }).click()
await page.getByLabel('镜头01visual', { exact: true }).fill('手改咖啡镜头')
await page.getByRole('button', { name: '保存草稿，返回确认' }).click()
await card
  .getByRole('button', { name: '确定分镜脚本，创建并保存脚本节点，进入下一步', exact: true })
  .click()
assert.equal(await page.locator('.canvas-node').count(), 2)
await card.getByLabel('素材提示词').first().fill('穿蓝衣的咖啡师')
await card.getByRole('button', { name: '取消替换', exact: true }).click()
await card.getByRole('button', { name: '生成全部图片', exact: true }).click()
await card.getByRole('button', { name: '生成图片预览', exact: true }).click()
assert.equal(await page.locator('.canvas-node').count(), 2)
await card
  .getByRole('button', { name: '确定图片内容，创建并保存图片节点，进入下一步', exact: true })
  .click()
assert.equal(await page.locator('.canvas-node').count(), 5)
await card.getByRole('button', { name: '选择部分镜头生成视频', exact: true }).click()
await card.getByRole('button', { name: '全屏选择镜头', exact: true }).click()
await page
  .getByRole('dialog', { name: '分镜脚本表格' })
  .getByLabel('选择镜头01', { exact: true })
  .check()
await page.getByRole('button', { name: '确定镜头，选择参数', exact: true }).click()
await card.getByRole('button', { name: '生成选中镜头的视频预览', exact: true }).click()
const video = card.locator('video')
await video.evaluate(el => el.play())
await page.waitForTimeout(400)
assert.ok((await video.evaluate(el => el.currentTime)) > 0)
await card.getByRole('button', { name: '确定视频内容，创建并保存视频节点', exact: true }).click()
assert.equal(await page.locator('.canvas-node').count(), 6)
const text = page
  .locator('.canvas-node')
  .filter({ has: page.locator('.text-node-detail-entry') })
  .first()
await text.getByRole('button', { name: '再生成', exact: true }).click({ force: true })
await page.getByLabel('编辑剧情脚本预览', { exact: true }).fill('新的手改剧情')
await page.getByRole('button', { name: '取消', exact: true }).click()
assert.equal(await page.locator('.story-preview-bubble').count(), 0)
await text.getByRole('button', { name: '再生成', exact: true }).click({ force: true })
await page.getByLabel('编辑剧情脚本预览', { exact: true }).fill('确认后的剧情')
await page.getByRole('button', { name: '确定并保存文字节点', exact: true }).click()
assert.ok((await text.innerText()).includes('确认后的剧情'))
await page.screenshot({ path: '/tmp/story-guide-final.png', fullPage: true })
assert.deepEqual(errors, [])
assert.equal(
  requests.filter(
    u => !u.startsWith('http://127.0.0.1:5174') && !u.startsWith('data:') && !u.startsWith('blob:')
  ).length,
  0
)
await browser.close()
console.log(
  'guided flow, editable drafts, explicit saves, image links, video playback, text preview and no external requests passed'
)
