import { chromium } from '@playwright/test'
import assert from 'node:assert/strict'
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || chromium.executablePath(),
  args: ['--no-sandbox']
})
const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } })
const errors = [],
  calls = []
page.on('pageerror', e => errors.push(e.message))
await page.goto('http://127.0.0.1:5174')
const fixture = await page.evaluate(async () => {
  const canvas = document.createElement('canvas')
  canvas.width = 120
  canvas.height = 80
  const c = canvas.getContext('2d')
  c.fillStyle = '#679f87'
  c.fillRect(0, 0, 120, 80)
  const png = canvas.toDataURL().split(',')[1]
  const stream = canvas.captureStream(10),
    recorder = new MediaRecorder(stream, { mimeType: 'video/webm' }),
    chunks = []
  const blob = await new Promise(resolve => {
    recorder.ondataavailable = e => chunks.push(e.data)
    recorder.onstop = () => resolve(new Blob(chunks, { type: 'video/webm' }))
    recorder.start()
    setTimeout(() => recorder.stop(), 350)
  })
  stream.getTracks().forEach(t => t.stop())
  const webm = await new Promise(resolve => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result.split(',')[1])
    reader.readAsDataURL(blob)
  })
  return { png, webm }
})
await page.route('**/fixture.webm', r =>
  r.fulfill({ contentType: 'video/webm', body: Buffer.from(fixture.webm, 'base64') })
)
let rejectScript = false
await page.route('**/__models/run', async route => {
  const body = route.request().postDataJSON()
  assert.equal(body.apiKey, 'test-only-not-a-real-key')
  calls.push(body)
  let result
  if (body.kind === 'text') {
    if (body.request.messages?.[0].content.includes('仅返回JSON数组')) {
      if (rejectScript) {
        rejectScript = false
        await route.fulfill({ status: 400, json: { error: '测试：供应商暂不可用' } })
        return
      }
      const visual = body.request.messages[1].content
      result = {
        text: JSON.stringify(
          Array.from({ length: 3 }, (_, i) => ({
            number: String(i + 1),
            duration: '5s',
            scale: '近景',
            camera: '推进',
            visual,
            sound: '旁白',
            emotion: '自然',
            environment: '清晨',
            imagePrompt: '产品照片',
            motionPrompt: '缓慢推进'
          }))
        )
      }
    } else result = { text: '优化后的真实格式文本响应' }
  } else if (body.kind === 'image')
    result = {
      outputs: [{ mediaType: 'image', type: 'base64', data: fixture.png, mimeType: 'image/png' }]
    }
  else if (body.kind === 'video')
    result = {
      outputs: [
        {
          mediaType: 'video',
          type: 'url',
          url: 'http://127.0.0.1:5174/fixture.webm',
          mimeType: 'video/webm'
        }
      ]
    }
  else
    result = {
      outputs: [
        {
          mediaType: 'audio',
          type: 'base64',
          data: 'UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=',
          mimeType: 'audio/wav'
        }
      ]
    }
  await route.fulfill({ json: result })
})
await page.getByRole('button', { name: '真实模型设置', exact: true }).click()
for (const input of await page.locator('.model-key-field input').all())
  await input.fill('test-only-not-a-real-key')
await page.getByRole('button', { name: '完成配置', exact: true }).click()
await page.getByRole('button', { name: '收起助手', exact: true }).click()
await page.locator('.workspace-toolbar').getByRole('button', { name: '脚本', exact: true }).click()
const script = page.locator('.script-node')
await script.getByLabel('脚本节点输入', { exact: true }).fill('第一版产品介绍')
await script.getByTitle('生成分镜脚本', { exact: true }).click()
await page.waitForFunction(() => document.querySelectorAll('.script-table tbody tr').length === 3)
await script.getByLabel('脚本节点输入', { exact: true }).fill('第二版活动预热')
await script.getByTitle('生成分镜脚本', { exact: true }).click()
await page.getByRole('button', { name: '确定并重新生成', exact: true }).click()
await page.waitForFunction(() =>
  document.querySelector('.script-table tbody').textContent.includes('第二版活动')
)
rejectScript = true
await script.getByLabel('脚本节点输入', { exact: true }).fill('失败后仍保留旧表')
await script.getByTitle('生成分镜脚本', { exact: true }).click()
await page.getByRole('button', { name: '确定并重新生成', exact: true }).click()
await page.getByRole('alert').filter({ hasText: '测试：供应商暂不可用' }).waitFor()
assert.match(await page.locator('.script-table tbody').innerText(), /第二版活动/)
await page.getByRole('button', { name: '取消', exact: true }).click()
async function add(type) {
  await page.locator('.workspace-toolbar').getByRole('button', { name: type, exact: true }).click()
  return page
    .locator('.media-node')
    .filter({ has: page.locator('.node-mini-tag', { hasText: type }) })
    .last()
}
async function generate(node) {
  await node.locator('.node-generate').click()
  await page.locator('.modal-footer').getByRole('button', { name: '确认', exact: true }).click()
  await page.waitForFunction(() => !document.querySelector('.node-render-state'))
}
const image = await add('图片')
await image.locator('textarea').fill('咖啡产品')
await generate(image)
await image.locator('.actual-media').waitFor()
const video = await add('视频')
await video.getByLabel('视频生成方式', { exact: true }).selectOption('文生视频')
await video.locator('textarea').fill('咖啡缓慢旋转')
await generate(video)
await video.locator('video.actual-media').waitFor()
assert.equal(calls.filter(x => x.kind === 'video')[0].request.mode, 'text')
assert.deepEqual(calls.filter(x => x.kind === 'video')[0].request.images, [])
await video.getByLabel('视频生成方式', { exact: true }).selectOption('图生视频')
await video.getByRole('button', { name: '选择并确认图片', exact: true }).click()
const imageName = await image.locator('.node-header strong').innerText()
await page.locator('.reference-list button').filter({ hasText: imageName }).click()
await page.getByRole('button', { name: '确认并保存', exact: true }).click()
await generate(video)
assert.equal(calls.filter(x => x.kind === 'video').at(-1).request.mode, 'singleImage')
assert.equal(calls.filter(x => x.kind === 'video').at(-1).request.images[0].data, fixture.png)
await page.evaluate(() => {
  const canvas = document.createElement('canvas')
  canvas.width = 12
  canvas.height = 12
  canvas.getContext('2d').fillRect(0, 0, 12, 12)
  const raw = atob(canvas.toDataURL().split(',')[1])
  const dt = new DataTransfer()
  dt.items.add(
    new File([Uint8Array.from(raw, c => c.charCodeAt(0))], '第二参考图.png', { type: 'image/png' })
  )
  document
    .querySelector('.canvas-viewport')
    .dispatchEvent(new ClipboardEvent('paste', { bubbles: true, clipboardData: dt }))
})
await page.waitForFunction(() =>
  [...document.querySelectorAll('.node-header strong')].some(
    n => n.textContent === '第二参考图.png'
  )
)
await video.getByRole('button', { name: '已确认 1 张图片', exact: true }).click()
await page.locator('.reference-list button').filter({ hasText: '第二参考图.png' }).click()
await page.getByRole('button', { name: '确认并保存', exact: true }).click()
await generate(video)
assert.deepEqual(calls.filter(x => x.kind === 'video').at(-1).request.mode, [
  'imageReference:10',
  'videoReference:5'
])
assert.equal(calls.filter(x => x.kind === 'video').at(-1).request.images.length, 2)
await image.getByTitle('引用', { exact: true }).click()
await page.locator('.reference-tabs').getByRole('button', { name: '当前画布', exact: true }).click()
await page.locator('.reference-list video').waitFor()
await page.waitForFunction(() => document.querySelector('.reference-list video')?.readyState >= 2)
assert.ok((await page.locator('.reference-list video').evaluate(v => v.videoWidth)) > 0)
await page.screenshot({ path: '/tmp/ai-studio-video-reference-v4.png' })
await page.getByRole('button', { name: '取消', exact: true }).click()
const audio = await add('音频')
await audio.locator('textarea').fill('轻快的背景音乐')
await generate(audio)
await audio.locator('audio.actual-audio').waitFor()
assert.ok(calls.some(x => x.kind === 'audio'))
assert.equal(await page.evaluate(() => Object.keys(localStorage).length), 0)
await page.reload()
await page.getByRole('button', { name: '真实模型设置', exact: true }).click()
for (const input of await page.locator('.model-key-field input').all())
  assert.equal(await input.inputValue(), '')
assert.deepEqual(errors, [])
console.log(
  '联调界面通过（替身供应商响应）：分镜重生成/失败保留、图片、文生视频、实际单图生视频、视频首帧封面、音频及Key刷新清除；未调用付费服务。'
)
await browser.close()
