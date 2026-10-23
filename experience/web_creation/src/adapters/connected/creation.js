import { installConnectedGuide } from './guide'
import { reactive } from 'vue'
import { createWorkspace } from '../../state/creation'
const fields = [
  'number',
  'duration',
  'scale',
  'camera',
  'visual',
  'sound',
  'emotion',
  'environment',
  'imagePrompt',
  'motionPrompt'
]
export function parseShots(content) {
  const cleaned = content
    .trim()
    .replace(/^```(?:json)?\s*/, '')
    .replace(/\s*```$/, '')
  let data
  try {
    data = JSON.parse(cleaned)
  } catch {
    throw new Error('文本模型未返回合法分镜JSON，原表已保留，请修改要求后重试')
  }
  const rows = Array.isArray(data) ? data : data.shots
  if (!Array.isArray(rows) || !rows.length || rows.length > 100)
    throw new Error('分镜结果须为1到100行')
  return rows.map((r, i) => {
    if (!r || typeof r !== 'object' || !r.visual || !r.imagePrompt || !r.motionPrompt)
      throw new Error('分镜结果缺少画面或提示词，原表已保留')
    return Object.fromEntries(
      fields.map(key => [key, String(r[key] ?? (key === 'number' ? i + 1 : '')).slice(0, 10000)])
    )
  })
}
export function createConnectedPort() {
  const p = createWorkspace('empty'),
    s = p.state
  let revision = 0
  p.isConnected = true
  p.isScenario = false
  p.models = reactive({ open: false, text: '', image: '', video: '', audio: '' })
  p.newProject('真实模型联调')
  const key = kind => {
    const value = p.models[kind]?.trim()
    if (!value) {
      p.models.open = true
      throw new Error(
        '请先填写' +
          { text: '文本', image: '图片', video: '视频', audio: '音频' }[kind] +
          '模型 API Key'
      )
    }
    return value
  }
  async function run(kind, request, count = 1) {
    const apiKey = key(kind)
    const response = await fetch('/__models/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-AI-Studio-Client': '1' },
      body: JSON.stringify({ kind, apiKey, request, count })
    })
    const result = await response.json()
    if (!response.ok) throw new Error(result.error || '请求失败')
    return result
  }
  p.clearModelKeys = () => {
    for (const kind of ['text', 'image', 'video', 'audio']) p.models[kind] = ''
    p.notify('已清除本页面的 API Key')
  }
  const logout = p.logout
  p.logout = () => {
    p.clearModelKeys()
    p.models.open = false
    logout()
  }
  p.optimizePrompt = async (current, requirements) => {
    const result = await run('text', {
      messages: [
        {
          role: 'system',
          content:
            '你是视频创作提示词编辑。默认使用简体中文输出，只有用户明确要求其他语言时才切换。保留原文主体与事实，根据要求优化，仅返回优化后的提示词正文。'
        },
        { role: 'user', content: '原文：\n' + current + '\n优化要求：\n' + requirements }
      ]
    })
    return result.text
  }
  p.performScript = async (text = s.prompt) => {
    if (s.scriptGenerating || s.readonly) return
    s.error = ''
    try {
      key('text')
      const script = p.activeScript?.() || s.nodes.find(n => n.type === '脚本')
      const context = script ? p.referenceText(script) : ''
      const refs = s.references.map(a => a.text || '').join('\n')
      if (!text?.trim() && !context.trim() && !refs.trim())
        throw new Error(
          '文本模型需要故事文字或文字参考，请补充描述；图片本身不能作为此文本模型的输入'
        )
      s.scriptGenerating = true
      const result = await run('text', {
        messages: [
          {
            role: 'system',
            content:
              '根据用户内容生成宣传视频分镜。所有自然语言字段默认使用简体中文（JSON字段名保持英文），只有用户明确要求其他语言时才切换。仅返回JSON数组，不能使用Markdown。每行必须包含number,duration,scale,camera,visual,sound,emotion,environment,imagePrompt,motionPrompt这十个字符串字段。画面和两个提示词必须非空。输出3到8个镜头。'
          },
          { role: 'user', content: [text, context, refs].filter(Boolean).join('\n') }
        ]
      })
      const rows = parseShots(result.text)
      revision++
      s.rows = rows.map((r, i) => ({ ...r, id: 'real-shot-' + revision + '-' + i }))
      s.nodes.forEach(n => {
        n.rowId = null
        n.rowRefs = []
        if (n.type === '脚本') n.version = revision
      })
      s.connections.forEach(c => {
        if (c.rowIds) c.rowIds = []
      })
      s.selectedRows = []
      s.scriptRevision = revision
      p.closeModal()
      p.notify('真实分镜已生成 · 第' + revision + '版')
    } catch (e) {
      s.error = e.message
      p.notify(e.message)
    } finally {
      s.scriptGenerating = false
    }
  }
  const plan = p.buildWorkflow
  p.buildWorkflow = (text, initial) => {
    const hadRows = s.rows.length
    plan(text, initial)
    if (!hadRows) s.rows = []
    const last = s.messages.at(-1)
    if (last?.role === 'assistant')
      last.text =
        '已创建并连接节点。脚本与媒体结果需要点击生成，才会通过已配置的 Key 调用真实服务。'
  }
  const baseParams = p.params
  p.params = n => {
    const value = baseParams(n)
    if (n.type === '图片' && !n.connectedParameters) {
      value.resolution = '1K'
      n.connectedParameters = true
    }
    return value
  }
  const apply = p.applyAsset
  p.applyAsset = (a, id) => {
    const n = s.nodes.find(n => n.id === id)
    if (n && a.outputs?.length && !a.sourceNodeId) {
      n.assetRefs ||= []
      if (!n.assetRefs.some(x => x.id === a.id)) n.assetRefs.push(a)
    }
    apply(a, id)
  }
  const originalRequest = p.requestGenerate
  p.requestGenerate = id => {
    const n = s.nodes.find(n => n.id === id)
    if (!n) return
    const kind = { 文字: 'text', 图片: 'image', 视频: 'video', 音频: 'audio' }[n.type]
    try {
      key(kind)
    } catch (e) {
      p.notify(e.message)
      return
    }
    if (n.type === '文字') {
      if (!n.prompt.trim() && !p.referenceText(n)) {
        p.notify('请填写文本要求')
        return
      }
      p.openModal('confirm', {
        title: '确认真实文本生成',
        description: 'Qwen3.8 Flash · 生成1份文案，使用当前输入与引用，可能产生供应商费用。',
        action: 'generate',
        nodeId: id
      })
      return
    }
    originalRequest(id)
    if (s.modal === 'confirm' && s.modalData?.action === 'generate')
      s.modalData.description = s.modalData.description.replace(
        '当前为模拟生成。',
        '将真实调用供应商并可能产生费用。'
      )
  }
  function media(n, type) {
    return p
      .inputReferences(n)
      .filter(a => a.type === type)
      .flatMap(a => (a.outputs?.length ? [a.outputs[a.outputIndex || 0]] : []))
      .filter((a, i, all) => all.findIndex(b => (b.url || b.data) === (a.url || a.data)) === i)
  }
  function outputUrl(output) {
    return output.type === 'url' ? output.url : 'data:' + output.mimeType + ';base64,' + output.data
  }
  p.selectOutput = (id, index) => {
    const n = s.nodes.find(n => n.id === id)
    const output = n?.outputs?.[index]
    if (!output) return
    n.outputIndex = index
    n.mediaUrl = outputUrl(output)
    n.mediaMime = output.mimeType
  }
  p.runGeneration = async id => {
    const n = s.nodes.find(n => n.id === id)
    if (!n || n.status === 'running') return
    const params = { ...p.params(n) },
      prompt = [n.prompt, p.referenceText(n)].filter(Boolean).join('\n')
    const kind = { 文字: 'text', 图片: 'image', 视频: 'video', 音频: 'audio' }[n.type]
    const oldStatus = n.status
    const task = { id: 'real-' + Date.now(), name: n.name, status: '准备提交' }
    try {
      key(kind)
      let request
      if (kind === 'text')
        request = {
          messages: [
            {
              role: 'system',
              content: '默认使用简体中文输出正文，只有用户明确要求其他语言时才切换。'
            },
            { role: 'user', content: prompt }
          ]
        }
      if (kind === 'image')
        request = {
          model: 'qwen-image-3.0-pro',
          prompt:
            prompt +
            (params.background !== '自动' ? '\n背景要求：' + params.background : '') +
            (params.quality !== '标准' ? '\n画质要求：' + params.quality : ''),
          ratio: n.ratio,
          size: params.resolution === '2K' ? '2K' : '1K',
          n: params.count,
          images: media(n, '图片')
        }
      if (kind === 'video') {
        const chosen = n.confirmedImages?.length
          ? n.confirmedImages
          : n.confirmedImage
            ? [n.confirmedImage]
            : []
        const images =
          n.mode === '文生视频'
            ? []
            : chosen.length
              ? chosen.flatMap(a => (a.outputs?.length ? [a.outputs[a.outputIndex || 0]] : []))
              : media(n, '图片')
        if (
          n.mode !== '文生视频' &&
          (!n.imageConfirmed ||
            !images.length ||
            images.length > 10 ||
            (chosen.length && images.length !== chosen.length))
        )
          throw new Error('请确认1到10张实际图片，示例封面不能用于真实生成')
        const mode =
          n.mode === '文生视频'
            ? 'text'
            : images.length === 1
              ? 'singleImage'
              : ['imageReference:10', 'videoReference:5']
        request = {
          model: 'wan3Video',
          prompt,
          mode,
          ratio: n.ratio,
          resolution: params.resolution,
          duration: parseInt(params.duration),
          images
        }
      }
      if (kind === 'audio')
        request = {
          model: 'seed-audio-1.0',
          prompt: prompt + '\n音色风格：' + params.voice + '；期望时长：' + params.duration,
          format: params.format.toLowerCase(),
          volume: Number(params.volume) / 100
        }
      n.inputSnapshot = JSON.parse(JSON.stringify({ prompt, params, request }))
      s.tasks.unshift(task)
      n.status = 'running'
      task.status = '正在调用供应商'
      const result = await run(
        kind,
        request,
        kind === 'text' || kind === 'image' ? 1 : params.count
      )
      if (kind === 'text') n.text = result.text
      else {
        if (!Array.isArray(result.outputs) || !result.outputs.length)
          throw new Error('供应商未返回媒体')
        n.outputs = result.outputs
        p.selectOutput(id, 0)
      }
      n.version = (n.version || 0) + 1
      n.status = 'success'
      n.stale = false
      task.status = '已完成'
      p.notify('真实生成已完成 · ' + n.name)
    } catch (e) {
      n.status = oldStatus === 'success' ? 'success' : 'error'
      n.lastError = e.message
      task.status = '失败'
      task.error = e.message
      if (!s.tasks.includes(task)) s.tasks.unshift(task)
      p.notify(e.message)
    }
  }
  p.previewMedia = n => n.mediaUrl || ''
  installConnectedGuide(p, run, parseShots)
  return p
}
