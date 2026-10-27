import { reactive } from 'vue'
import { mediaDefaults } from '../state/media-parameters'
import { storyDraft, inferDirection } from '../state/story-format'
const clone = x => JSON.parse(JSON.stringify(x))
const illustration = (label, color = '#bd9aeb') =>
  'data:image/svg+xml;charset=utf-8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="800" viewBox="0 0 640 800"><defs><linearGradient id="g" x2="1" y2="1"><stop stop-color="${color}"/><stop offset="1" stop-color="#34283e"/></linearGradient></defs><rect width="640" height="800" fill="url(#g)"/><circle cx="320" cy="265" r="110" fill="#f2d8c4"/><path d="M205 260q-5-200 120-160 130 0 110 190-45-130-90-105-85 90-140 75" fill="#352c36"/><path d="M115 800V550q10-170 205-170t205 170v250" fill="#eee5da"/><rect x="335" y="500" width="120" height="155" rx="18" fill="#bb8a59"/><text x="320" y="740" text-anchor="middle" fill="#42314b" font-size="25" font-family="sans-serif">${label} · 演示素材</text></svg>`
  )
function tone() {
  const bytes = new Uint8Array(44 + 16000),
    v = new DataView(bytes.buffer)
  const word = (i, s) => [...s].forEach((c, n) => v.setUint8(i + n, c.charCodeAt(0)))
  word(0, 'RIFF')
  v.setUint32(4, bytes.length - 8, true)
  word(8, 'WAVEfmt ')
  v.setUint32(16, 16, true)
  v.setUint16(20, 1, true)
  v.setUint16(22, 1, true)
  v.setUint32(24, 8000, true)
  v.setUint32(28, 16000, true)
  v.setUint16(32, 2, true)
  v.setUint16(34, 16, true)
  word(36, 'data')
  v.setUint32(40, 16000, true)
  for (let i = 0; i < 8000; i++)
    v.setInt16(
      44 + i * 2,
      Math.sin((i / 8000) * 440 * Math.PI * 2) * 1800 * Math.sin((i / 8000) * Math.PI),
      true
    )
  return URL.createObjectURL(new Blob([bytes], { type: 'audio/wav' }))
}
export function installStudio(p, video) {
  const s = p.state
  let serial = 0,
    timer,
    active
  const pic = (name, color) => ({
    id: 'studio-ref-' + serial++,
    name,
    type: '图片',
    mediaUrl: illustration(name, color),
    origin: '案例示例',
    role: name.includes('角色') ? '角色' : '商品'
  })
  const cases = [
    {
      id: 'talk',
      name: '达人口播种草',
      description: '达人对镜真心分享，朋友式安利可信度高',
      category: '产品展示',
      type: '视频',
      scene: 'amber',
      ratio: '9:16',
      prompt:
        '制作一支达人口播种草短视频。产品为夏日序曲香水，围绕清新香气和轻松日常展开，朋友式分享，配自然旁白、字幕和轻柔音乐。',
      refs: [pic('商品1', '#bea27d'), pic('角色1', '#9da98d')]
    },
    {
      id: 'product',
      name: '让产品成为主角',
      description: '光影与细节，让好产品自己说话',
      category: '产品展示',
      type: '视频',
      scene: 'amber',
      ratio: '9:16',
      prompt: '制作15秒香水产品展示短视频，晨光、产品细节、品牌定格，电影感，带字幕和背景音乐。',
      refs: [pic('商品1', '#d8b078')]
    },
    {
      id: 'pet',
      name: '今天也被可爱到',
      description: '把萌宠的日常，变成一个小故事',
      category: '萌宠',
      type: '视频',
      scene: 'garden',
      ratio: '9:16',
      prompt:
        '制作一支萌宠搞笑故事短视频，主题是一只猫第一次见到自动喂食器，轻松幽默，配字幕和趣味音效。',
      refs: []
    },
    {
      id: 'poster',
      name: '一张图，打开想象',
      description: '让日常灵感成为你的下一张封面',
      category: '封面海报',
      type: '图片',
      scene: 'event',
      ratio: '1:1',
      prompt: '生成一张夏日花园主题封面海报，柔和绿色，清新简洁，保留标题排版空间。',
      refs: []
    },
    {
      id: 'life',
      name: '把周末留在镜头里',
      description: '细碎的日常，也值得认真记录',
      category: '生活记录',
      type: '视频',
      scene: 'garden',
      ratio: '9:16',
      prompt: '制作一支周末花园生活记录短视频，自然晨光、散步和咖啡，温柔配音、字幕和轻音乐。',
      refs: []
    },
    {
      id: 'event',
      name: '给活动一个开场',
      description: '三秒抓住目光，把期待感拉满',
      category: '活动宣传',
      type: '视频',
      scene: 'event',
      ratio: '16:9',
      prompt:
        '制作一支品牌开放日活动预热短视频，展示体验、互动和产品，活动时间地点用待填写文字，不虚构事实。',
      refs: []
    }
  ]
  p.studio = reactive({
    mode: '灵活模式',
    caseState: ['loading', 'error', 'empty'].includes(s.scenario) ? s.scenario : 'ready',
    messages: [],
    cases,
    selected: null,
    conflict: null,
    type: '视频',
    audioKind: '旁白',
    frameMode: false,
    frames: { first: null, last: null },
    picker: null,
    replaceIndex: null,
    preview: null,
    params: mediaDefaults('视频'),
    parameterOpen: false,
    category: '全部',
    more: false,
    error: '',
    busy: false,
    paused: false,
    progress: 0,
    guideStarted: false,
    settings: false,
    appearance:
      (typeof localStorage !== 'undefined' && localStorage.getItem('studio-appearance')) || '深色',
    target: null,
    edit: null,
    inspect: null,
    forceFail: false
  })
  const d = p.studio
  p.studioTheme = value => {
    d.appearance = value
    localStorage.setItem('studio-appearance', value)
    p.syncStudioTheme()
  }
  p.syncStudioTheme = () => {
    if (typeof document === 'undefined') return
    document.documentElement.dataset.appearance =
      d.appearance === '跟随系统'
        ? matchMedia('(prefers-color-scheme: light)').matches
          ? 'light'
          : 'dark'
        : d.appearance === '浅色'
          ? 'light'
          : 'dark'
  }
  p.syncStudioTheme()
  const saveStudio = () => {
    const project = s.projects.find(x => x.id === s.projectId)
    if (project)
      project.studioData = {
        messages: d.messages,
        mode: d.mode,
        selected: d.selected,
        guideStarted: d.guideStarted,
        frames: d.frames
      }
  }
  const openProject = p.openProject
  p.openProject = id => {
    openProject(id)
    const project = s.projects.find(x => x.id === s.projectId)
    if (project?.studioData) {
      Object.assign(d, project.studioData)
      s.page = 'agent'
    }
  }
  p.newStudio = () => {
    if (d.busy) {
      p.notify('请先完成或停止当前演示任务')
      return
    }
    saveStudio()
    d.messages = []
    d.guideStarted = false
    d.selected = null
    d.target = null
    s.prompt = ''
    s.references = []
    d.frames = { first: null, last: null }
    d.error = ''
    d.type = '视频'
    d.params = mediaDefaults('视频')
    d.frameMode = false
    p.go('home')
  }
  p.studioApply = (c, choice) => {
    if (!choice && (s.prompt.trim() || s.references.length)) {
      d.conflict = c
      return
    }
    if (choice !== 'keep') s.prompt = c.prompt
    d.selected = c
    d.type = c.type
    d.params = { ...mediaDefaults(c.type), ratio: c.ratio }
    d.conflict = null
    for (const a of c.refs) if (!s.references.some(r => r.id === a.id)) s.references.push(clone(a))
    d.error = ''
    p.notify('创意与示例素材已带入，可修改后发送')
  }
  p.studioType = type => {
    d.type = type
    d.params = mediaDefaults(type)
    if (type !== '视频') d.frameMode = false
  }
  p.studioReference = (a, role) => {
    const v = { ...clone(a), role: role || a.role || '参考' }
    if (d.picker === 'first' || d.picker === 'last') d.frames[d.picker] = v
    else if (d.replaceIndex !== null) {
      s.references[d.replaceIndex] = v
      d.replaceIndex = null
    } else if (!s.references.some(x => x.id === a.id)) s.references.push(v)
    d.picker = null
    d.error = ''
  }
  p.studioUpload = async files => {
    for (const file of files) {
      if (!/^(image|video|audio)\//.test(file.type)) {
        d.error = '请选择图片、视频或音频文件'
        continue
      }
      if ((d.picker === 'first' || d.picker === 'last') && !file.type.startsWith('image/')) {
        d.error = '首尾帧只能使用图片'
        continue
      }
      const a = {
        id: 'upload-' + serial++,
        name: file.name,
        type: file.type.startsWith('image/')
          ? '图片'
          : file.type.startsWith('video/')
            ? '视频'
            : '音频',
        mediaUrl: URL.createObjectURL(file),
        origin: '本地上传'
      }
      p.studioReference(a)
    }
  }
  p.studioDownload = a => {
    const link = document.createElement('a')
    link.href =
      a.mediaUrl ||
      URL.createObjectURL(
        new Blob([a.text || JSON.stringify(a.rows, null, 2)], { type: 'text/plain' })
      )
    link.download =
      a.name +
      ({ 图片: '.svg', 视频: '.webm', 音频: '.wav', 文字: '.txt', 脚本: '.json' }[a.type] || '')
    link.click()
  }
  p.studioSave = a => {
    if (!['图片', '视频', '音频'].includes(a.type)) return
    p.saveAsset({ ...clone(a), id: undefined, category: '物品', tags: [] })
    p.notify('已保存到个人资产')
  }
  p.studioCanvas = a => {
    if (a.nodeId && s.nodes.some(n => n.id === a.nodeId)) {
      p.notify('此版本已添加到画布')
      return
    }
    const id = p.addNode(a.type)
    const n = s.nodes.find(n => n.id === id)
    if (n) {
      Object.assign(n, clone(a), {
        id,
        name: p.uniqueName(
          a.name,
          s.nodes.filter(n => n.id !== id)
        ),
        status: 'success'
      })
      if (a.type === '脚本') p.activateScript(id)
      a.nodeId = id
      p.notify('已添加到画布，原会话结果保留')
    }
  }
  p.studioEdit = a => {
    d.edit = { source: a, rect: null, note: '', time: 0 }
    d.error = ''
  }
  const complete = () => {
    const job = active
    if (!job) return
    if (d.forceFail) {
      job.status = 'failed'
      job.error = '模拟生成失败，输入和已有结果已保留'
      d.forceFail = false
      d.busy = false
      return
    }
    const type = job.type,
      previous = job.source
    const a = {
      id: 'result-' + serial++,
      name: p.uniqueName(
        previous?.name ||
          {
            图片: '创意图片',
            视频: '创意短片',
            音频: d.audioKind,
            文字: '剧情脚本',
            脚本: '分镜脚本'
          }[type],
        d.messages.flatMap(m => (m.result ? [m.result] : []))
      ),
      type,
      version: previous ? previous.version + 1 : 1,
      params: clone(job.params),
      scene: 'amber',
      prompt: job.text,
      snapshot: clone(job.refs),
      annotation: job.annotation,
      status: 'success'
    }
    if (type === '视频') {
      a.mediaUrl = video
      a.shots = previous?.shots
        ? clone(previous.shots)
        : [
            { number: '01', duration: '5秒', visual: '晨光与主体建立' },
            { number: '02', duration: '6秒', visual: '展现产品与细节' },
            { number: '03', duration: '4秒', visual: '主题定格' }
          ]
      a.volume = previous?.volume ?? 65
      a.color = previous?.color || '自然'
      a.caption = '本地示例视频 · 用于演示预览与修改流程'
    }
    if (type === '图片')
      a.mediaUrl = illustration(
        job.annotation ? '局部修改示意' : '创意图片',
        job.annotation ? '#8bbaa8' : '#be9acc'
      )
    if (type === '音频') {
      a.mediaUrl = tone()
      a.text = d.audioKind === '旁白' ? '让灵感走进日常，把美好留在这一刻。' : ''
      a.caption = '本地演示提示音，不代表真实配音、音乐或音效'
    }
    if (type === '文字')
      a.text = storyDraft(
        { ...inferDirection(job.text), input: job.text, content: job.text },
        '从日常走向惊喜'
      )
    if (type === '脚本')
      a.rows = [1, 2, 3].map(n => ({
        id: 'row-' + serial++,
        number: '0' + n,
        duration: '5秒',
        scale: '中景',
        camera: '缓慢推进',
        visual: ['建立场景与主体', '展示行动与核心细节', '主题定格与收束'][n - 1],
        sound: '自然环境音',
        imagePrompt: job.text,
        motionPrompt: '动作连贯，主体一致'
      }))
    job.result = a
    job.status = 'success'
    d.busy = false
    d.progress = 4
    active = null
  }
  const tick = () => {
    if (!d.busy || d.paused) return
    d.progress++
    if (d.progress >= 4) complete()
    else timer = setTimeout(tick, 450)
  }
  p.studioPause = () => {
    d.paused = !d.paused
    if (!d.paused) tick()
    else clearTimeout(timer)
  }
  p.studioStop = () => {
    clearTimeout(timer)
    if (active) active.status = 'cancelled'
    active = null
    d.busy = false
    d.paused = false
  }
  p.studioSend = (override, source, annotation) => {
    if (s.readonly) {
      p.notify('当前项目为只读')
      return
    }
    const text = (override || s.prompt).trim()
    if (!text || d.busy) return
    if (/https?:\/\//i.test(text)) {
      d.error = '此演示不支持视频链接输入，请上传或引用素材'
      return
    }
    if (d.frameMode && (!d.frames.first || !d.frames.last)) {
      d.error = '请补齐首帧和尾帧图片后发送'
      return
    }
    if (d.mode === '灵感模式' && !source) {
      if (!d.guideStarted) {
        s.prompt = text
        p.start()
        d.guideStarted = true
      } else {
        s.agentText = text
        p.sendAgent()
      }
      s.page = 'agent'
      s.prompt = ''
      return
    }
    const requested = /视频|短片/.test(text)
      ? '视频'
      : /分镜/.test(text)
        ? '脚本'
        : /剧情/.test(text)
          ? '文字'
          : /图片|海报/.test(text)
            ? '图片'
            : /音频|旁白|音乐|音效/.test(text)
              ? '音频'
              : d.type
    const type = source?.type || requested
    if (!d.messages.length) {
      const refs = clone(s.references)
      p.newProject('灵活创作 · ' + text.slice(0, 12))
      s.references = refs
    }
    const req = {
      id: 'message-' + serial++,
      role: 'assistant',
      text,
      type,
      source: source ? clone(source) : null,
      annotation: annotation ? clone(annotation) : null,
      params: clone(d.params),
      refs: clone([
        ...s.references,
        ...(d.frameMode
          ? [
              { ...d.frames.first, role: '首帧' },
              { ...d.frames.last, role: '尾帧' }
            ]
          : [])
      ]),
      status: 'running'
    }
    d.messages.push({ id: 'message-' + serial++, role: 'user', text, refs: clone(req.refs) }, req)
    saveStudio()
    s.prompt = ''
    s.page = 'agent'
    d.busy = true
    d.paused = false
    d.progress = 0
    d.error = ''
    d.target = null
    active = req
    timer = setTimeout(tick, 450)
  }
  p.studioRetry = job => {
    const refs = s.references,
      params = d.params,
      frames = d.frameMode
    s.references = clone(job.refs)
    d.params = clone(job.params)
    d.frameMode = false
    p.studioSend(job.text, job.source, job.annotation)
    s.references = refs
    d.params = params
    d.frameMode = frames
  }
  p.studioApplyEdit = () => {
    if (!d.edit?.rect || !d.edit.note.trim()) return
    const e = d.edit
    p.studioSend('局部修改：' + e.note, e.source, {
      rect: e.rect,
      note: e.note,
      time: e.time,
      scope: e.source.type === '视频' ? '整个镜头同一对象' : '圈选区域'
    })
    d.edit = null
  }
  p.studioRestore = a => {
    d.target = a
    p.notify('已采用此历史版本，后续修改以该版本为基础')
  }
  p.studioFrame = (a, url) =>
    p.studioReference({
      id: 'frame-' + serial++,
      name: a.name + '选帧',
      type: '图片',
      mediaUrl: url,
      origin: '视频选帧'
    })
}
