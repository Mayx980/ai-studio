import { chromium } from '@playwright/test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || chromium.executablePath(),
  args: ['--no-sandbox']
})
const page = await browser.newPage({ viewport: { width: 1800, height: 1200 } }),
  calls = [],
  errors = []
page.on('pageerror', e => errors.push(e.message))
const png =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a6gAAAABJRU5ErkJggg=='
const webm = (
  await fs.readFile(new URL('./src/scenarios/assets/local-demo.webm', import.meta.url))
).toString('base64')
await page.route('**/__models/run', async route => {
  const body = route.request().postDataJSON()
  assert.equal(body.apiKey, 'test-only-not-a-real-key')
  calls.push({ kind: body.kind, request: body.request })
  let result
  if (body.kind === 'text')
    result = {
      text: '故事定义：真实接口替身正文\n剧情结构：开场到收束\n创作约束层：保留事实\n参考时长：30秒\n角色形象：小夏\n道具：咖啡\n场景：办公室\n剪辑方式：自然\n画面与动作设计：推门\n台词/音效：早安'
    }
  else if (body.kind === 'image')
    result = { outputs: [{ mediaType: 'image', type: 'base64', data: png, mimeType: 'image/png' }] }
  else if (body.kind === 'video')
    result = {
      outputs: [{ mediaType: 'video', type: 'base64', data: webm, mimeType: 'video/webm' }]
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
await page.goto('http://127.0.0.1:5174')
await page.locator('.connected-banner').waitFor()
await page.waitForLoadState('networkidle')
const ids = await page.evaluate(() => {
  const v = document.querySelector('#app').__vue_app__._context.provides,
    p = v[Object.getOwnPropertySymbols(v).find(k => String(k).includes('creation-port'))],
    ids = {}
  for (const type of ['文字', '图片', '视频', '音频']) {
    const id = p.addNode(type)
    p.setNode(id, 'prompt', '新品宣传素材')
    ids[type] = id
  }
  p.requestGenerate(ids['图片'])
  return ids
})
await page.getByRole('dialog', { name: '真实模型接入', exact: true }).waitFor()
assert.equal(calls.length, 0)
for (const input of await page.locator('.model-key-field input').all())
  await input.fill('test-only-not-a-real-key')
await page.getByRole('button', { name: '完成配置', exact: true }).click()
async function generate(type) {
  await page.evaluate(id => {
    const v = document.querySelector('#app').__vue_app__._context.provides,
      p = v[Object.getOwnPropertySymbols(v).find(k => String(k).includes('creation-port'))]
    p.requestGenerate(id)
  }, ids[type])
  if (type === '文字') {
    await page
      .getByRole('dialog', { name: '剧情脚本预览', exact: true })
      .getByRole('button', { name: '确定并保存文字节点', exact: true })
      .click()
  } else
    await page
      .getByRole('dialog', { name: /确认.*生成/ })
      .getByRole('button', { name: '确认', exact: true })
      .click()
  await page.waitForFunction(id => {
    const v = document.querySelector('#app').__vue_app__._context.provides,
      p = v[Object.getOwnPropertySymbols(v).find(k => String(k).includes('creation-port'))]
    return p.state.nodes.find(n => n.id === id)?.status === 'success'
  }, ids[type])
}
await generate('文字')
await generate('图片')
await page.evaluate(
  ({ image, video }) => {
    const v = document.querySelector('#app').__vue_app__._context.provides,
      p = v[Object.getOwnPropertySymbols(v).find(k => String(k).includes('creation-port'))]
    p.connectNodes(image, video)
  },
  { image: ids['图片'], video: ids['视频'] }
)
await generate('视频')
await generate('音频')
assert.deepEqual(
  calls.map(c => c.kind),
  ['text', 'image', 'video', 'audio']
)
assert.equal(calls.find(c => c.kind === 'video').request.images.length, 1)
assert.equal(calls.find(c => c.kind === 'image').request.size, '1K')
const leak = await page.evaluate(() =>
  JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } }).includes(
    'test-only-not-a-real-key'
  )
)
assert.equal(leak, false)
await page.locator('.user-card').click()
await page.getByRole('menuitem', { name: '退出登录', exact: true }).click()
const keysCleared = await page.evaluate(() => {
  const v = document.querySelector('#app').__vue_app__._context.provides,
    p = v[Object.getOwnPropertySymbols(v).find(k => String(k).includes('creation-port'))]
  return ['text', 'image', 'video', 'audio'].every(k => !p.models[k])
})
assert.equal(keysCleared, true)
assert.deepEqual(errors, [])
await browser.close()
console.log(
  'connected entry: missing-key guard, four node request paths, image-to-video input and logout key clearing passed with fixture responses; no supplier call performed'
)
