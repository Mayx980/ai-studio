import { chromium } from '@playwright/test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
const b = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || chromium.executablePath(),
  args: ['--no-sandbox']
})
const page = await b.newPage({ viewport: { width: 1800, height: 1200 } }),
  calls = [],
  errors = []
page.on('pageerror', e => errors.push(e.message))
const png =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a6gAAAABJRU5ErkJggg=='
const webm = (
  await fs.readFile(new URL('./src/scenarios/assets/local-demo.webm', import.meta.url))
).toString('base64')
const story =
  '一、故事定义\n咖啡新品宣传\n二、剧情结构\n开场：准备咖啡\n推进：上班前冲泡\n收束：端起咖啡\n三、创作约束层\n保留事实\n参考时长：30秒\n角色形象：小夏\n道具：咖啡杯\n场景：办公室\n剪辑方式：自然\n画面与动作设计：推门\n台词/音效：早安'
let failImage = true,
  delayPlans = false
await page.route('**/__models/run', async route => {
  const body = route.request().postDataJSON()
  assert.equal(body.apiKey, 'test-only-not-a-real-key')
  calls.push({ kind: body.kind, request: body.request, count: body.count })
  let result
  if (body.kind === 'text') {
    const system = body.request.messages[0].content,
      user = JSON.parse(body.request.messages[1].content)
    if (system.includes('仅从用户已有输入'))
      result = {
        text: JSON.stringify({
          purpose: '宣传',
          style: '自然',
          duration: '30秒',
          ratio: '9:16',
          content: '咖啡新品',
          audience: '上班族'
        })
      }
    else if (system.includes('提供2到5'))
      result = {
        text: JSON.stringify([
          { name: '接口方案乙', reason: '较低推荐', outline: '乙内容', score: 30 },
          { name: '接口方案甲', reason: '更适合受众', outline: '甲内容', score: 95 }
        ])
      }
    else if (system.includes('剧情必须包含')) result = { text: story }
    else if (system.includes('每行必须含number')) {
      assert.ok(user.story.includes('手改事实'))
      result = {
        text: JSON.stringify(
          ['01', '02'].map(number => ({
            number,
            duration: '5秒',
            scale: '近景',
            camera: '推进',
            visual: '接口返回镜头' + number,
            sound: '环境声',
            emotion: '自然',
            environment: '办公室',
            imagePrompt: '咖啡杯',
            motionPrompt: '缓慢推进'
          }))
        )
      }
    } else if (system.includes('提取真正需要')) {
      assert.ok(user.rows[0].visual.includes('手改分镜'))
      result = {
        text: JSON.stringify([
          { type: '道具', name: '咖啡杯', prompt: '咖啡杯真实提示词', shotNumbers: ['01', '02'] },
          { type: '场景', name: '办公室', prompt: '办公室真实提示词', shotNumbers: ['01'] }
        ])
      }
    } else throw new Error('未覆盖文本阶段')
  } else if (body.kind === 'image') {
    if (failImage && body.request.prompt.includes('办公室')) {
      failImage = false
      await route.fulfill({ status: 500, json: { error: '测试：图片接口暂不可用' } })
      return
    }
    result = {
      outputs: Array.from({ length: body.request.n }, () => ({
        mediaType: 'image',
        type: 'base64',
        data: png,
        mimeType: 'image/png'
      }))
    }
  } else if (body.kind === 'video') {
    assert.equal(body.request.images.length, 2)
    result = {
      outputs: Array.from({ length: body.count }, () => ({
        mediaType: 'video',
        type: 'base64',
        data: webm,
        mimeType: 'video/webm'
      }))
    }
  } else throw new Error('不应调用其他模型')
  if (delayPlans && body.kind === 'text' && body.request.messages[0].content.includes('提供2到5'))
    await new Promise(resolve => setTimeout(resolve, 300))
  await route.fulfill({ json: result })
})
await page.goto('http://127.0.0.1:5174')
await page.locator('.connected-banner').waitFor()
await page.waitForLoadState('networkidle')
await page.evaluate(() => {
  const v = document.querySelector('#app').__vue_app__._context.provides,
    p = v[Object.getOwnPropertySymbols(v).find(k => String(k).includes('creation-port'))]
  for (const kind of ['text', 'image', 'video', 'audio'])
    p.models[kind] = 'test-only-not-a-real-key'
  p.state.prompt = '制作一支咖啡宣传片，30秒，竖屏，自然风格，给上班族看'
  p.start()
})
const card = page.locator('.story-guide')
await card.locator('.guide-plan').filter({ hasText: '接口方案甲' }).waitFor()
assert.equal(await page.locator('.canvas-node').count(), 0)
assert.ok((await card.locator('.guide-plan').first().innerText()).includes('接口方案甲'))
await card.getByRole('button', { name: '选择此方案', exact: true }).first().click()
await card.getByRole('button', { name: '展开编辑剧情脚本', exact: true }).click()
const storyDialog = page.getByRole('dialog', { name: '编辑剧情脚本草稿', exact: true })
await storyDialog
  .getByRole('textbox', { name: '剧情脚本草稿', exact: true })
  .fill(story + '\n手改事实')
await storyDialog.getByRole('button', { name: '保存草稿，返回确认', exact: true }).click()
await card
  .getByRole('button', { name: '确定剧情脚本，创建并保存文字节点，进入下一步', exact: true })
  .click()
await card.getByRole('button', { name: '展开分镜表并编辑', exact: true }).click()
const table = page.getByRole('dialog', { name: '分镜脚本表格', exact: true })
await table.getByLabel('镜头01visual', { exact: true }).fill('手改分镜')
await table.getByRole('button', { name: '保存草稿，返回确认', exact: true }).click()
await card
  .getByRole('button', { name: '确定分镜脚本，创建并保存脚本节点，进入下一步', exact: true })
  .click()
await card.getByRole('button', { name: '生成全部图片', exact: true }).click()
await card.getByRole('button', { name: '生成图片预览', exact: true }).click()
await card.getByRole('button', { name: '仅重试失败项', exact: true }).waitFor()
assert.equal(await page.locator('.canvas-node').count(), 2)
await page.waitForFunction(() => {
  const v = document.querySelector('#app').__vue_app__._context.provides,
    p = v[Object.getOwnPropertySymbols(v).find(k => String(k).includes('creation-port'))]
  return !p.currentGuide().busy
})
assert.equal(calls.filter(c => c.kind === 'image').length, 2)
await card.getByRole('button', { name: '仅重试失败项', exact: true }).click()
await page.waitForFunction(() => {
  const v = document.querySelector('#app').__vue_app__._context.provides,
    p = v[Object.getOwnPropertySymbols(v).find(k => String(k).includes('creation-port'))]
  const g = p.currentGuide()
  return !g.busy && g.failedMedia === 0
})
assert.equal(calls.filter(c => c.kind === 'image').length, 3)
await card
  .getByRole('button', { name: '确定图片内容，创建并保存图片节点，进入下一步', exact: true })
  .click()
assert.equal(await page.locator('.canvas-node').count(), 4)
await card.getByRole('button', { name: '选择部分镜头生成视频', exact: true }).click()
await card.getByRole('button', { name: '选择镜头', exact: true }).click()
await table.getByLabel('选择镜头01', { exact: true }).check()
await table.getByRole('button', { name: '确定镜头，选择参数', exact: true }).click()
await card.getByLabel('生成数量', { exact: true }).selectOption('2')
await card.getByRole('button', { name: '生成选中镜头的视频预览', exact: true }).click()
await page.waitForFunction(() => {
  const v = document.querySelector('#app').__vue_app__._context.provides,
    p = v[Object.getOwnPropertySymbols(v).find(k => String(k).includes('creation-port'))]
  return p.currentGuide().stage === 'video-preview' && !p.currentGuide().busy
})
assert.equal(await card.locator('video').count(), 2)
await card
  .locator('video')
  .first()
  .evaluate(el => el.play())
await page.waitForTimeout(150)
assert.ok(
  (await card
    .locator('video')
    .first()
    .evaluate(el => el.currentTime)) > 0
)
await card.getByRole('button', { name: '确定视频内容，创建并保存视频节点', exact: true }).click()
const summary = await page.evaluate(() => {
  const v = document.querySelector('#app').__vue_app__._context.provides,
    p = v[Object.getOwnPropertySymbols(v).find(k => String(k).includes('creation-port'))]
  return {
    stage: p.currentGuide().stage,
    count: p.state.nodes.length,
    realImages: p.state.nodes.filter(n => n.type === '图片').every(n => n.outputs?.[0].data),
    realVideos: p.state.nodes
      .filter(n => n.type === '视频')
      .every(n => n.outputs?.[0].data && n.rowRefs.length),
    leak:
      JSON.stringify(p.state.projects).includes('test-only-not-a-real-key') ||
      JSON.stringify({ ...localStorage, ...sessionStorage }).includes('test-only-not-a-real-key')
  }
})
assert.equal(summary.stage, 'done')
assert.equal(summary.count, 6)
assert.equal(summary.realImages, true)
assert.equal(summary.realVideos, true)
assert.equal(summary.leak, false)
delayPlans = true
const origin = await page.evaluate(() => {
  const v = document.querySelector('#app').__vue_app__._context.provides,
    p = v[Object.getOwnPropertySymbols(v).find(k => String(k).includes('creation-port'))]
  const id = p.state.projectId
  p.state.agentText = '再设计一个咖啡方案'
  p.sendAgent()
  return id
})
await page.waitForFunction(() => {
  const v = document.querySelector('#app').__vue_app__._context.provides,
    p = v[Object.getOwnPropertySymbols(v).find(k => String(k).includes('creation-port'))]
  return p.currentGuide()?.activity === '生成创意方案'
})
await page.evaluate(() => {
  const v = document.querySelector('#app').__vue_app__._context.provides,
    p = v[Object.getOwnPropertySymbols(v).find(k => String(k).includes('creation-port'))]
  p.newProject('切换项目验证')
})
await page.waitForFunction(id => {
  const v = document.querySelector('#app').__vue_app__._context.provides,
    p = v[Object.getOwnPropertySymbols(v).find(k => String(k).includes('creation-port'))]
  return p.state.projects.find(a => a.id === id)?.guideRecords.at(-1).guide.stage === 'plans'
}, origin)
await page.evaluate(id => {
  const v = document.querySelector('#app').__vue_app__._context.provides,
    p = v[Object.getOwnPropertySymbols(v).find(k => String(k).includes('creation-port'))]
  p.openProject(id)
}, origin)
assert.ok((await card.locator('.guide-plan').first().innerText()).includes('接口方案甲'))
assert.deepEqual(errors, [])
await b.close()
console.log(
  'connected guided pipeline: real request adapters for all stages, editable drafts, partial failure retry, image references, video playback and explicit node saves passed using fixture responses; no supplier request performed'
)
