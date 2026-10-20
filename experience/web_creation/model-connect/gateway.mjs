import text from './providers/text.ts'
import image from './providers/image.ts'
import video from './providers/video.ts'
import audio from './providers/audio.ts'
const endpoint = 'https://llm-d7hnbcsabhzqr44p.cn-beijing.maas.aliyuncs.com'
const providers = { text, image, video, audio }
export async function callModel(
  { kind, apiKey, request = {}, count = 1 },
  signal,
  transport = fetch
) {
  if (!providers[kind]) throw new Error('不支持的模型能力')
  if (typeof apiKey !== 'string' || !apiKey.trim()) throw new Error('请先在模型设置中填写 API Key')
  if (!Number.isInteger(count) || count < 1 || count > 4) throw new Error('生成数量须为1到4')
  const safeFetch = (url, options = {}) => {
    const parsed = new URL(String(url))
    if (
      parsed.protocol !== 'https:' ||
      !(
        parsed.hostname === 'openspeech.bytedance.com' ||
        parsed.hostname === 'dashscope.aliyuncs.com' ||
        parsed.hostname === 'llm-d7hnbcsabhzqr44p.cn-beijing.maas.aliyuncs.com' ||
        /^[a-z0-9.-]+\.aliyuncs\.com$/.test(parsed.hostname)
      )
    )
      throw new Error('适配器访问了未允许的服务域名')
    return transport(url, { ...options, redirect: 'error' })
  }
  const ctx = {
    config: { apiKey: apiKey.trim(), endpoint },
    signal,
    tool: {
      fetch: safeFetch,
      errorMessage: value => String(value?.message || value?.code || '接口返回错误')
    }
  }
  try {
    if (kind === 'text') {
      const result = await safeFetch(text.apiUrl + '/chat/completions', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + apiKey.trim(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: text.models[0].id,
          messages: request.messages || [{ role: 'user', content: request.prompt }],
          stream: false,
          enable_thinking: true
        }),
        signal: AbortSignal.any([AbortSignal.timeout(180000), signal].filter(Boolean))
      })
      if (!result.ok) throw new Error('文本请求失败，HTTP ' + result.status)
      const data = await result.json()
      const content = data?.choices?.[0]?.message?.content
      if (typeof content !== 'string' || !content.trim()) throw new Error('文本接口未返回有效正文')
      return { text: content }
    }
    const outputs = []
    const rounds = kind === 'image' ? 1 : count
    for (let i = 0; i < rounds; i++) {
      signal?.throwIfAborted()
      const method =
        kind === 'image' ? 'generateImage' : kind === 'video' ? 'generateVideo' : 'generateAudio'
      outputs.push(...(await providers[kind][method].call(ctx, request)))
    }
    return { outputs }
  } catch (error) {
    const safe = String(error?.message || '模型请求失败')
      .split(apiKey)
      .join('[已隐藏]')
    throw new Error(safe)
  }
}
export function modelGateway() {
  return {
    name: 'local-model-gateway',
    configureServer(server) {
      if (server.httpServer) server.httpServer.requestTimeout = 31 * 60 * 1000
      server.middlewares.use('/__models/run', async (req, res) => {
        const origin = req.headers.origin
        const host = req.headers.host || ''
        if (
          !/^(127\.0\.0\.1|localhost):\d+$/.test(host) ||
          (origin && origin !== 'http://' + host) ||
          req.headers['x-ai-studio-client'] !== '1'
        ) {
          res.writeHead(403)
          res.end('Forbidden')
          return
        }
        if (
          req.method !== 'POST' ||
          !String(req.headers['content-type']).startsWith('application/json')
        ) {
          res.writeHead(405)
          res.end()
          return
        }
        const controller = new AbortController()
        res.on('close', () => {
          if (!res.writableEnded) controller.abort()
        })
        let input
        try {
          const chunks = []
          let bytes = 0
          for await (const chunk of req) {
            bytes += chunk.length
            if (bytes > 45 * 1024 * 1024) throw new Error('请求内容超过45MB')
            chunks.push(chunk)
          }
          input = JSON.parse(Buffer.concat(chunks).toString())
          const result = await callModel(input, controller.signal)
          if (res.destroyed) return
          res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
          res.end(JSON.stringify(result))
        } catch (error) {
          if (res.destroyed) return
          let message = input
            ? String(error?.message || '调用失败')
            : '模型请求格式不正确或文件超过45MB'
          if (input?.apiKey) message = message.split(input.apiKey).join('[已隐藏]')
          res.writeHead(400, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
          res.end(JSON.stringify({ error: message.slice(0, 700) }))
        }
      })
    }
  }
}
