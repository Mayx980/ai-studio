import { uniqueImages, imageIdentity } from '../state/image-references'
import { mediaDefaults } from '../state/media-parameters'
import { directionFields, inferDirection, storyDraft } from '../state/story-format'
const copy = value => JSON.parse(JSON.stringify(value))
export function installStoryGuide(p) {
  const s = p.state
  let sequence = 0
  const message = text => s.messages.push({ role: 'assistant', text })
  p.currentGuide = () => [...s.messages].reverse().find(m => m.guide)?.guide
  const editable = g => !s.readonly && p.currentGuide() === g && g.stage !== 'done'
  const node = (type, name, data) => {
    const id = p.addNode(type)
    const n = s.nodes.find(n => n.id === id)
    if (n)
      Object.assign(
        n,
        {
          name: p.uniqueName(
            name,
            s.nodes.filter(a => a.id !== id)
          ),
          status: 'success',
          version: 1
        },
        data
      )
    return n
  }
  const expandOutputs = g => {
    const used = s.nodes.map(n => ({ name: n.name })),
      expanded = []
    for (const item of g.preview)
      for (let i = 0; i < Number(g.params.count || 1); i++) {
        const value = copy(item)
        value.name = p.uniqueName(item.name, used)
        used.push({ name: value.name })
        value.outputKey = item.id + ':' + i
        expanded.push(value)
      }
    g.preview = expanded
  }
  p.beginGuide = text => {
    if (s.readonly) return
    const attachments = s.references
      .map(a => a.text || a.content || '')
      .filter(Boolean)
      .join('\n')
    const input = [text, attachments].filter(Boolean).join('\n')
    const g = {
      stage: 'direction',
      brief: { ...inferDirection(input), input },
      known: {},
      plans: [],
      story: '',
      rows: [],
      prompts: [],
      selection: [],
      params: mediaDefaults('图片'),
      revision: '',
      error: '',
      scriptId: '',
      textId: '',
      preview: [],
      revisionTarget: ''
    }
    for (const [key] of directionFields) if (g.brief[key]) g.known[key] = true
    s.messages.push({
      role: 'assistant',
      text: '先确认创作方向。已从输入识别的内容会保留，只需补充缺失项。当前使用本地模拟生成。',
      guide: g
    })
    if (directionFields.every(([key]) => g.brief[key])) p.guidePlans(p.currentGuide())
    return p.currentGuide()
  }
  p.guidePlans = g => {
    if (!editable(g)) return
    if (directionFields.some(([key]) => !g.brief[key]?.trim())) {
      g.error = '请补齐尚未确认的方向信息'
      return
    }
    g.error = ''
    g.plans = [
      {
        name: '核心主题直达',
        reason: `优先推荐：围绕“${g.brief.content}”直接服务${g.brief.purpose}，适合${g.brief.audience}在${g.brief.duration}内理解重点。`,
        outline: '建立需求 → 展示关键行动/价值 → 清晰收束'
      },
      {
        name: '人物体验叙事',
        reason: `用体验与情绪带出${g.brief.content}，适合需要共鸣的表达；人物动机需要额外设计。`,
        outline: '角色遇到问题 → 探索与转折 → 体验改变'
      },
      {
        name: '视觉意象表达',
        reason: `以${g.brief.style}视觉强化记忆，适合风格展示；信息传达需要旁白或字幕辅助。`,
        outline: '主题意象 → 视觉变化 → 主题定格'
      }
    ]
    g.stage = 'plans'
  }
  p.guideParseDirection = g => {
    if (!editable(g)) return
    const parsed = inferDirection(g.brief.input)
    for (const [key] of directionFields) if (parsed[key]) g.brief[key] = parsed[key]
    g.editKnown = true
  }
  p.guideOtherPlans = g => {
    if (!editable(g) || !g.planRequest?.trim()) {
      g.error = '请填写方案修改要求'
      return
    }
    const request = g.planRequest.trim()
    p.guidePlans(g)
    g.plans = g.plans.map((plan, index) => ({
      ...plan,
      name: `${plan.name} · 调整${index + 1}`,
      outline: request + '；' + plan.outline,
      reason: `根据你的修改要求“${request}”调整。` + plan.reason
    }))
    g.error = ''
    g.otherPlan = false
  }
  p.guideChoosePlan = (g, index) => {
    if (!editable(g) || g.stage !== 'plans') return
    g.plan = g.plans[index]
    g.story = storyDraft(g.brief, g.plan.name + '：' + g.plan.outline)
    g.stage = 'story'
  }
  p.guideRevise = (g, requirement) => {
    if (!editable(g)) return
    if (!requirement?.trim()) {
      g.error = '请填写修改要求'
      return
    }
    g.error = ''
    g.revision = requirement
    if (g.stage === 'story') g.story = storyDraft(g.brief, g.plan.name, requirement)
    else if (g.stage === 'storyboard')
      g.rows.forEach(r => {
        r.visual += '\n修改：' + requirement
        r.imagePrompt += '；' + requirement
      })
    else if (['image-preview', 'video-preview'].includes(g.stage)) {
      const targets = g.preview.filter(
        a => !g.revisionTarget || a.name.includes(g.revisionTarget) || a.number === g.revisionTarget
      )
      if (!targets.length) {
        g.error = '未找到对应名称或镜头号'
        return
      }
      targets.forEach(a => {
        a.prompt += '；修改要求：' + requirement
        a.revision = (a.revision || 0) + 1
      })
    }
    g.revision = ''
    g.modify = false
    message('已按修改要求更新模拟草稿，请检查预览；可继续手动编辑后确认。')
  }
  p.guideConfirmStory = g => {
    if (!editable(g) || g.stage !== 'story' || !g.story.trim()) return
    const n = node('文字', '剧情脚本', { text: g.story, prompt: g.brief.input })
    g.textId = n.id
    const duration =
      parseFloat(g.brief.duration) * (g.brief.duration.includes('分钟') ? 60 : 1) || 30
    g.rows = ['开场', '推进', '收束'].map((part, i) => ({
      id: `guide-shot-${Date.now()}-${sequence++}`,
      number: String(i + 1).padStart(2, '0'),
      duration: `${Math.round(duration / 3)}s`,
      scale: ['全景', '中景', '近景'][i],
      camera: ['缓慢推进', '跟随', '固定'][i],
      visual: `${part}：${
        g.story
          .split('\n')
          .find(line => line.startsWith(part + '：'))
          ?.split('：')
          .slice(1)
          .join('：') || g.brief.content
      }`,
      sound: `${g.brief.content} · ${part}`,
      emotion: '自然',
      environment: '主场景',
      imagePrompt: `${g.brief.content}，${g.brief.style}，主场景，主体一致`,
      motionPrompt: `${part}阶段，动作连贯，保持主体一致`,
      references: []
    }))
    g.stage = 'storyboard'
    message('剧情已保存到文字节点。请检查分镜表，每个单元格均可编辑。')
  }
  p.guideConfirmStoryboard = g => {
    if (!editable(g) || g.stage !== 'storyboard' || !g.rows.length) return
    const n = node('脚本', '分镜脚本', { rows: copy(g.rows), prompt: g.story })
    g.scriptId = n.id
    p.activateScript(n.id)
    s.rows = n.rows
    p.connectToRow?.(g.textId, n.rows[0].id)
    g.prompts = ['角色', '道具', '场景'].map((type, i) => ({
      id: `prompt-${i}`,
      type,
      name: type === '角色' ? '主要角色图' : type === '道具' ? '核心道具' : '主场景',
      prompt: `${g.brief.content}，${type}设计，${g.brief.style}，保持外观与光线一致`,
      rowIds: g.rows.map(r => r.id),
      selected: true
    }))
    g.stage = 'prompts'
    message('分镜已保存到脚本节点。请按剧情确认角色、道具和场景名称及提示词，并勾选适用的镜头。')
  }
  p.guideImageConfig = (g, mode) => {
    if (!editable(g) || g.stage !== 'prompts') return
    if (mode === 'partial' && g.partialText?.trim()) {
      const matches = g.prompts.filter(a => g.partialText.includes(a.name))
      if (!matches.length) {
        g.error = '请填写上方素材名称，或清空范围后直接勾选'
        return
      }
      g.prompts.forEach(a => {
        a.selected = matches.some(m => m.id === a.id)
      })
    }
    if (mode === 'all')
      g.prompts.forEach(a => {
        a.selected = true
      })
    if (!g.prompts.some(a => a.selected && a.rowIds.length)) {
      g.error = '请至少选择一项图片及其适用镜头'
      return
    }
    g.error = ''
    g.stage = 'image-config'
    g.params = { ...mediaDefaults('图片'), ratio: g.brief.ratio }
    g.params.ratio = g.brief.ratio
  }
  p.guideSyncPrompts = (g, sync) => {
    if (!editable(g)) return
    if (sync) {
      const textNode = s.nodes.find(n => n.id === g.textId)
      const scriptNode = s.nodes.find(n => n.id === g.scriptId)
      if (
        !textNode ||
        !scriptNode ||
        textNode.text !== g.story ||
        g.rows.some(r => scriptNode.rows.find(a => a.id === r.id)?.imagePrompt !== r.imagePrompt)
      ) {
        g.error =
          '画布中的剧情或分镜已改变。为保留手改内容，本次不能直接替换；可取消同步，仅将提示词用于生图。'
        return
      }

      const block = g.prompts.map(a => `${a.type}提示词（${a.name}）：${a.prompt}`).join('\n')
      g.story =
        g.story.replace(/\n\n同步素材提示词：[\s\S]*$/, '') + '\n\n同步素材提示词：\n' + block

      if (textNode) textNode.text = g.story
      const script = s.nodes.find(n => n.id === g.scriptId)
      for (const r of g.rows) {
        r.imagePrompt = g.prompts
          .filter(a => a.rowIds.includes(r.id))
          .map(a => a.prompt)
          .join('；')
        const saved = script?.rows.find(a => a.id === r.id)
        if (saved) saved.imagePrompt = r.imagePrompt
      }
      if (script) script.prompt = g.story
    }
    g.error = ''
    g.editPrompts = false
    g.syncDecision = false
    message(sync ? '提示词已同步到剧情和对应分镜。' : '保留原脚本；调整后的提示词仅用于此次生图。')
  }
  p.guideGenerateImages = g => {
    if (!editable(g) || g.stage !== 'image-config') return
    if (
      g.prompts.some(a => a.selected && (!a.name.trim() || !a.prompt.trim() || !a.rowIds.length))
    ) {
      g.error = '请为选中图片填写名称、提示词及适用镜头'
      return
    }
    g.error = ''
    g.preview = g.prompts
      .filter(a => a.selected)
      .map(a => ({
        ...copy(a),
        type: '图片',
        scene: 'amber',
        status: 'success',
        params: copy(g.params),
        revision: 0
      }))
    expandOutputs(g)
    g.stage = 'image-preview'
  }
  p.guideAcceptImages = g => {
    if (!editable(g) || g.stage !== 'image-preview') return
    if (!s.nodes.some(n => n.id === g.scriptId)) {
      g.error = '分镜节点已删除，无法保存关联图片'
      return
    }
    for (const a of g.preview) {
      const n = node('图片', a.name, {
        prompt: a.prompt,
        scene: a.scene,
        params: a.params,
        ...a.params
      })
      p.assignImageToRows({ ...n, sourceNodeId: n.id }, a.rowIds, g.scriptId)
    }
    g.preview = []
    g.stage = 'video'
    message('图片节点已创建，并作为对应分镜行的上游引用。')
  }
  p.guideSkipImages = g => {
    if (editable(g)) {
      g.stage = 'video'
      g.preview = []
    }
  }
  p.guidePickShots = g => {
    if (editable(g)) {
      const script = s.nodes.find(n => n.id === g.scriptId)
      if (!script) {
        g.error = '分镜节点已删除，无法选择镜头'
        return
      }
      g.rows = copy(script.rows)
      g.stage = 'shots'
      g.selection = []
    }
  }
  p.guideRowReferences = (g, id) => {
    const refs = p
      .rowImages(id)
      .filter(a => a.type !== '图片' || !(g.excludedImages?.[id] || []).includes(imageIdentity(a)))
    return [...refs.filter(a => a.type !== '图片'), ...uniqueImages(refs)]
  }
  p.guideRowImages = (g, id) => uniqueImages(p.guideRowReferences(g, id))
  p.guideRemoveImage = (g, id, a) => {
    if (!editable(g)) return
    g.excludedImages ||= {}
    g.excludedImages[id] ||= []
    g.excludedImages[id].push(imageIdentity(a))
  }
  p.guideVideoConfig = g => {
    if (!editable(g) || !g.selection.length) {
      g.error = '请至少选择一个镜头'
      return
    }
    g.error = ''
    g.stage = 'video-config'
    g.params = { ...mediaDefaults('视频'), ratio: g.brief.ratio }
  }
  p.guideGenerateVideos = g => {
    if (!editable(g) || g.stage !== 'video-config') return
    if (g.selection.some(id => p.guideRowImages(g, id).length > 10)) {
      g.error = '每个镜头最多引用10张图片，请先删减'
      return
    }
    g.error = ''
    g.preview = g.rows
      .filter(r => g.selection.includes(r.id))
      .map(r => ({
        id: r.id,
        number: r.number,
        name: `镜头${r.number}视频`,
        type: '视频',
        status: 'success',
        prompt: [
          r.number,
          r.duration,
          r.scale,
          r.camera,
          r.visual,
          r.sound,
          r.emotion,
          r.environment,
          r.imagePrompt,
          r.motionPrompt,
          ...p.guideRowReferences(g, r.id).map(a => [a.name, a.text].filter(Boolean).join('：'))
        ].join('\n'),
        params: {
          ...copy(g.params),
          duration: g.params.duration === '按分镜时长' ? r.duration : g.params.duration
        },
        references: copy(p.guideRowReferences(g, r.id)),
        excludedRowMedia: p
          .rowImages(r.id)
          .filter(
            a => a.type === '图片' && (g.excludedImages?.[r.id] || []).includes(imageIdentity(a))
          )
          .map(a => 'row-media:' + r.id + ':' + a.id),
        revision: 0
      }))
    expandOutputs(g)
    g.stage = 'video-preview'
  }
  p.guideAcceptVideos = g => {
    if (!editable(g) || g.stage !== 'video-preview') return
    if (g.preview.some(a => !p.row(a.id))) {
      g.error = '部分镜头已删除，无法保存关联视频'
      return
    }
    for (const a of g.preview) {
      const n = node('视频', a.name, {
        prompt: a.prompt,
        params: a.params,
        rowId: a.id,
        rowRefs: [a.id],
        ...a.params,
        mode: a.references?.some(r => r.type === '图片') ? '图生视频' : '文生视频',
        guideReferences: a.references,
        generationKind: uniqueImages(a.references || []).length > 1 ? 'reference' : 'single',
        excludedRowMedia: a.excludedRowMedia
      })
      p.connect(a.id, n.id)
    }
    g.stage = 'done'
    message('视频节点已保存，并连接到对应分镜行。本次创作流程已完成（模拟素材）。')
  }
  p.guideStop = g => {
    if (editable(g)) {
      g.stage = 'done'
      g.preview = []
      message('已停止视频生成，保留已确认的脚本和节点。')
    }
  }
  p.start = () => {
    if (s.readonly) return
    const text = s.prompt.trim(),
      refs = copy(s.references)
    if (!text && !refs.length) return p.notify('请先输入创作想法或选择参考')
    p.newProject((text || '参考素材创作').slice(0, 18))
    s.references = refs
    s.messages = [{ role: 'user', text: text || '根据参考内容创作' }]
    p.beginGuide(text || '根据参考内容创作')
  }
  const sendCanvasRequest = p.sendAgent
  p.sendAgent = () => {
    if (!s.agentText.trim() || s.readonly || s.busy) return
    if (
      (!p.currentGuide() || p.currentGuide().stage === 'done') &&
      /(?:创建|添加|移动|重命名|连接).{0,20}节点/.test(s.agentText)
    )
      return sendCanvasRequest()
    const text = s.agentText.trim()
    s.agentText = ''
    s.messages.push({ role: 'user', text })
    const g = p.currentGuide()
    if (!g || g.stage === 'done') p.beginGuide(text)
    else if (g.stage === 'direction') {
      const supplied = inferDirection(text)
      for (const [key] of directionFields)
        if (supplied[key]) {
          g.brief[key] = supplied[key]
          g.known[key] = true
        }
      g.brief.input += '\n' + text
      if (directionFields.every(([key]) => g.brief[key])) p.guidePlans(p.currentGuide())
      else message('已记录补充，请在方向卡片中填写其余缺失信息。')
    } else if (['story', 'storyboard', 'image-preview', 'video-preview'].includes(g.stage))
      p.guideRevise(g, text)
    else message('已记录：' + text + '。请在当前阶段卡片中确认选择。')
  }
  const request = p.requestGenerate
  p.generateStoryPreview = id => {
    const n = s.nodes.find(a => a.id === id)
    if (!n || s.readonly) return
    const input = [n.prompt, p.referenceText?.(n)].filter(Boolean).join('\n')
    if (!input.trim()) return p.notify('请先输入剧情内容或添加参考')
    s.storyPreview = {
      nodeId: id,
      text: storyDraft({ ...inferDirection(input), input }),
      projectId: s.projectId
    }
  }
  p.confirmTextStory = () => {
    const draft = s.storyPreview
    if (!draft?.text.trim() || s.readonly || draft.projectId !== s.projectId) return
    const n = s.nodes.find(a => a.id === draft.nodeId)
    if (n) Object.assign(n, { text: draft.text, status: 'success', version: (n.version || 0) + 1 })
    s.storyPreview = null
  }
  p.requestGenerate = id => {
    const n = s.nodes.find(a => a.id === id)
    return n?.type === '文字' ? p.generateStoryPreview(id) : request(id)
  }
}
