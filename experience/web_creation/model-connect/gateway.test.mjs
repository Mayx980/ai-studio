import test from 'node:test'
import assert from 'node:assert/strict'
import { callModel } from './gateway.mjs'
const key = 'test-only-not-a-real-key'
const json = x =>
  new Response(JSON.stringify(x), { headers: { 'Content-Type': 'application/json' } })
test('文本采用上传文件的公司域名、模型和鉴权，解析正文', async () => {
  const result = await callModel(
    { kind: 'text', apiKey: key, request: { prompt: '测试' } },
    undefined,
    async (url, options) => {
      assert.match(url, /compatible-mode\/v1\/chat\/completions$/)
      assert.equal(options.headers.Authorization, 'Bearer ' + key)
      assert.equal(JSON.parse(options.body).model, 'qwen3.8-flash')
      return json({ choices: [{ message: { content: '真实格式正文' } }] })
    }
  )
  assert.equal(result.text, '真实格式正文')
})
test('图片适配器接收本地base64图片和正确的数量尺寸', async () => {
  const result = await callModel(
    {
      kind: 'image',
      apiKey: key,
      request: {
        model: 'qwen-image-3.0-pro',
        prompt: '产品',
        ratio: '16:9',
        size: '1K',
        n: 2,
        images: [{ type: 'base64', mimeType: 'image/png', data: 'YQ==' }]
      }
    },
    undefined,
    async (url, options) => {
      const body = JSON.parse(options.body)
      assert.equal(body.input.messages[0].content[0].image, 'data:image/png;base64,YQ==')
      assert.equal(body.parameters.size, '1360*768')
      assert.equal(body.parameters.n, 2)
      return json({
        output: { choices: [{ message: { content: [{ image: 'data:image/png;base64,YQ==' }] } }] }
      })
    }
  )
  assert.equal(result.outputs[0].mediaType, 'image')
})
test('视频文生分流采用async任务并轮询结果', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const calls = []
  const pending = callModel(
    {
      kind: 'video',
      apiKey: key,
      request: {
        model: 'wan3Video',
        prompt: '产品运动',
        mode: 'text',
        ratio: '16:9',
        resolution: '1080P',
        duration: 5
      }
    },
    undefined,
    async (url, options) => {
      calls.push(url)
      if (calls.length === 1) {
        const body = JSON.parse(options.body)
        assert.equal(body.model, 'wan3.0-video')
        assert.equal(body.input.media, undefined)
        return json({ output: { task_id: 'test-task' } })
      }
      return json({
        output: { task_status: 'SUCCEEDED', video_url: 'https://example.com/test-video.mp4' }
      })
    }
  )
  await new Promise(setImmediate)
  t.mock.timers.tick(15000)
  const result = await pending
  assert.equal(result.outputs[0].mediaType, 'video')
  assert.equal(calls.length, 2)
})
test('音频适配器的格式、音量及base64输出', async () => {
  const result = await callModel(
    {
      kind: 'audio',
      apiKey: key,
      request: { model: 'seed-audio-1.0', prompt: '音乐', format: 'mp3', volume: 0.8 }
    },
    undefined,
    async (url, options) => {
      assert.equal(url, 'https://openspeech.bytedance.com/api/v3/tts/create')
      const b = JSON.parse(options.body)
      assert.equal(b.audio_config.loudness_rate, 40)
      return json({ code: 0, audio: 'YQ==' })
    }
  )
  assert.equal(result.outputs[0].mimeType, 'audio/mpeg')
})
test('错误不泄露Key，无Key不发请求', async () => {
  let called = false
  await assert.rejects(
    callModel({ kind: 'image', apiKey: '', request: {} }, undefined, () => {
      called = true
    }),
    /API Key/
  )
  assert.equal(called, false)
  await assert.rejects(
    callModel(
      { kind: 'image', apiKey: key, request: { model: 'qwen-image-3.0-pro', prompt: 'test' } },
      undefined,
      () => {
        throw new Error('failure ' + key)
      }
    ),
    error => !error.message.includes(key)
  )
})
test('视频图生模式按原适配器上传实际图片并使用首帧', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  let sawUpload = false
  const pending = callModel(
    {
      kind: 'video',
      apiKey: key,
      request: {
        model: 'wan3Video',
        prompt: '产品特写',
        mode: 'singleImage',
        images: [{ type: 'base64', mimeType: 'image/png', data: 'YQ==', name: 'test.png' }]
      }
    },
    undefined,
    async (url, options) => {
      if (String(url).includes('/uploads?'))
        return json({
          data: {
            upload_host: 'https://test-bucket.oss-cn-beijing.aliyuncs.com',
            upload_dir: 'test-dir',
            policy: 'test-policy',
            signature: 'test-signature',
            oss_access_key_id: 'test-access'
          }
        })
      if (String(url).includes('test-bucket')) {
        sawUpload = true
        assert.ok(options.body instanceof Blob)
        return new Response('ok')
      }
      if (String(url).includes('video-synthesis')) {
        assert.ok(sawUpload)
        const body = JSON.parse(options.body)
        assert.equal(body.input.media[0].type, 'first_frame')
        assert.match(body.input.media[0].url, /^oss:\/\/test-dir\//)
        return json({ output: { task_id: 'image-job' } })
      }
      return json({
        output: { task_status: 'SUCCEEDED', video_url: 'https://example.com/result.mp4' }
      })
    }
  )
  await new Promise(setImmediate)
  t.mock.timers.tick(15000)
  assert.equal((await pending).outputs[0].mediaType, 'video')
})
