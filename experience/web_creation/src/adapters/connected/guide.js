import { installStoryGuide } from '../../state/story-guide'
import { directionFields } from '../../state/story-format'
import { createGuideEngine, imageOutputs } from './guide-engine'
const copy = a => JSON.parse(JSON.stringify(a))
export function installConnectedGuide(p, run, parseShots) {
  installStoryGuide(p, { deferDirection: true })
  const s = p.state,
    engine = createGuideEngine(run, parseShots)
  let serial = 0
  const active = g => g && p.currentGuide() === g && !g.busy && !s.readonly && g.stage !== 'done'
  async function perform(g, label, operation, apply) {
    if (!active(g)) return false
    const owner = s.projects.find(a => a.id === (g.projectId || s.projectId))
    if (owner) {
      owner.guideRecords ||= []
      const record = owner.guideRecords.find(a => a.guide.id === g.id)
      if (record) record.guide = g
      else owner.guideRecords.push({ session: s.activeSession, guide: g })
    }
    g.busy = true
    g.error = ''
    g.activity = label
    const task = {
      id: 'guide-task-' + Date.now() + '-' + serial++,
      name: label,
      status: '正在调用供应商'
    }
    s.tasks.unshift(task)
    try {
      const value = await operation()
      apply(value)
      task.status = '已完成'
      return true
    } catch (e) {
      g.error = e.message || '调用失败，原草稿保留'
      task.status = '失败'
      task.error = g.error
      return false
    } finally {
      g.busy = false
      g.activity = ''
    }
  }
  const recoverState = () => {
    const project = s.projects.find(a => a.id === s.projectId)
    for (const m of s.messages)
      if (m.guide?.id) {
        const record = project?.guideRecords?.find(r => r.guide.id === m.guide.id)
        if (record) m.guide = record.guide
      }
    for (const n of s.nodes)
      if (project?.pendingTextDrafts?.[n.id]) n.pendingStory = project.pendingTextDrafts[n.id]
  }
  for (const method of ['openProject', 'switchSession']) {
    const previous = p[method]
    p[method] = (...args) => {
      const result = previous(...args)
      recoverState()
      return result
    }
  }
  p.recoverableGuides = () =>
    s.projects
      .find(a => a.id === s.projectId)
      ?.guideRecords?.filter(
        r =>
          !r.guide.busy &&
          r.guide.stage !== 'done' &&
          !s.messages.some(m => m.guide?.id === r.guide.id)
      ) || []
  p.recoverGuide = id => {
    const record = p.recoverableGuides().find(r => r.guide.id === id)
    if (!record) return
    p.newSession()
    s.messages = [
      { role: 'assistant', text: '已恢复本项目此前的真实调用草稿。', guide: record.guide }
    ]
  }
  p.openPendingStory = id => {
    const n = s.nodes.find(n => n.id === id)
    if (n?.pendingStory) s.storyPreview = n.pendingStory
  }
  const freshRows = rows =>
    rows.map(r => ({ ...r, id: 'real-guide-shot-' + Date.now() + '-' + serial++ }))
  const baseBegin = p.beginGuide
  p.beginGuide = text => {
    const g = baseBegin(text)
    if (!g) return
    g.real = true
    g.projectId = s.projectId
    p.guideParseDirection(g, true)
    return g
  }
  p.guideParseDirection = async (g, advance = false) => {
    const parsed = await perform(
      g,
      '解析创作方向',
      () => engine.brief(g.brief.input),
      brief => {
        for (const [key] of directionFields)
          if (brief[key]) {
            g.brief[key] = brief[key]
            g.known[key] = true
          }
        g.editKnown = true
      }
    )
    if (
      advance &&
      parsed &&
      p.currentGuide() === g &&
      directionFields.every(([key]) => g.brief[key]?.trim())
    )
      await p.guidePlans(g)
  }
  p.guidePlans = async g => {
    if (!active(g)) return
    if (directionFields.some(([key]) => !g.brief[key]?.trim())) {
      g.error = '请补齐尚未确认的方向信息'
      return
    }
    await perform(
      g,
      '生成创意方案',
      () => engine.plans(copy(g.brief)),
      plans => {
        g.plans = plans
        g.stage = 'plans'
      }
    )
  }
  p.guideOtherPlans = async g => {
    if (!g.planRequest?.trim()) {
      g.error = '请填写方案修改要求'
      return
    }
    await perform(
      g,
      '按要求重新生成方案',
      () => engine.plans(copy(g.brief), g.planRequest),
      plans => {
        g.plans = plans
        g.otherPlan = false
      }
    )
  }
  p.guideChoosePlan = async (g, index) => {
    if (!active(g) || g.stage !== 'plans' || !g.plans[index]) return
    const plan = copy(g.plans[index])
    await perform(
      g,
      '生成剧情脚本',
      () => engine.story(copy(g.brief), plan),
      story => {
        g.plan = plan
        g.story = story
        g.stage = 'story'
      }
    )
  }
  const baseConfirmStory = p.guideConfirmStory
  const baseConfirmStoryboard = p.guideConfirmStoryboard
  p.guideRetryStoryboard = async g => {
    const n = s.nodes.find(n => n.id === g.textId)
    if (!n) {
      g.error = '剧情节点已删除'
      return
    }
    const story = n.text
    await perform(
      g,
      '根据已保存剧情生成分镜',
      () => engine.shots(story),
      rows => {
        if (n.text !== story) {
          g.staleDrafts ||= []
          g.staleDrafts.push({ rows, story })
          throw new Error('生成期间剧情正文已改变，返回分镜已保留，请按当前剧情重新生成')
        }
        g.story = story
        g.rows = freshRows(rows)
        g.stage = 'storyboard'
      }
    )
  }
  p.guideConfirmStory = g => {
    if (!active(g) || g.stage !== 'story' || !g.story.trim()) return
    baseConfirmStory(g)
    g.rows = []
    g.stage = 'storyboard-pending'
    p.guideRetryStoryboard(g)
  }
  p.guideRetryPrompts = async g => {
    const n = s.nodes.find(n => n.id === g.scriptId)
    if (!n) {
      g.error = '分镜节点已删除'
      return
    }
    const rows = copy(n.rows),
      signature = JSON.stringify(rows)
    await perform(
      g,
      '提取角色、道具和场景提示词',
      () => engine.prompts(g.story, rows),
      prompts => {
        if (JSON.stringify(n.rows) !== signature) {
          g.staleDrafts ||= []
          g.staleDrafts.push({ prompts, rows })
          throw new Error('生成期间分镜已修改，提示词结果已保留，请按当前分镜重新提取')
        }
        const used = []
        for (const a of prompts) {
          a.name = p.uniqueName(a.name, used)
          used.push(a)
        }
        g.rows = rows
        g.prompts = prompts
        g.stage = 'prompts'
      }
    )
  }
  p.guideConfirmStoryboard = g => {
    if (!active(g) || g.stage !== 'storyboard') return
    if (s.nodes.find(n => n.id === g.textId)?.text !== g.story) {
      g.error = '剧情正文已更新，请按当前剧情重新生成分镜'
      return
    }
    baseConfirmStoryboard(g)
    g.prompts = []
    g.stage = 'prompts-pending'
    p.guideRetryPrompts(g)
  }
  const imageConfig = p.guideImageConfig
  p.guideImageConfig = (g, mode) => {
    imageConfig(g, mode)
    if (g.stage === 'image-config') g.params.resolution = '1K'
  }
  const snapshotReferences = () => copy((s.references || []).filter(a => a.type === '图片'))
  function setJobPreview(g, job, assets) {
    const used = [
      ...s.nodes.map(n => ({ name: n.name })),
      ...g.preview.map(a => ({ name: a.name }))
    ]
    for (const asset of assets) {
      const name = p.uniqueName(job.item.name, used)
      used.push({ name })
      g.preview.push({
        ...copy(job.item),
        ...asset,
        name,
        status: 'success',
        outputKey: 'real-preview-' + serial++,
        revision: 0
      })
    }
  }
  async function executeJobs(g, onlyFailed = false) {
    if (!active(g)) return
    const jobs = g.mediaJobs.filter(j =>
      onlyFailed ? j.status === 'failed' : j.status === 'pending'
    )
    if (!jobs.length) return
    g.allowPartial = false
    await perform(
      g,
      '生成' + (g.mediaKind === 'image' ? '图片' : '视频') + '预览',
      async () => {
        for (const job of jobs) {
          job.status = 'running'
          job.error = ''
          try {
            const outputs = await engine[g.mediaKind](copy(job.item))
            setJobPreview(g, job, outputs)
            job.returned = (job.returned || 0) + outputs.length
            if (outputs.length < job.item.params.count) {
              job.item.params.count -= outputs.length
              throw new Error('接口仅返回部分结果，成功结果已保留，可重试缺少的数量')
            }
            job.status = 'success'
          } catch (e) {
            job.status = 'failed'
            job.error = e.message
          }
        }
        const failed = g.mediaJobs.filter(j => j.status === 'failed')
        g.failedMedia = failed.length
        if (failed.length) throw new Error(failed.map(j => j.item.name + '：' + j.error).join('\n'))
      },
      () => {}
    )
  }
  p.guideGenerateImages = async g => {
    if (!active(g) || g.stage !== 'image-config') return
    const selected = g.prompts.filter(a => a.selected)
    if (
      !selected.length ||
      selected.some(a => !a.name.trim() || !a.prompt.trim() || !a.rowIds.length)
    ) {
      g.error = '请填写所选图片名称、提示词和适用镜头'
      return
    }
    const refs = snapshotReferences()
    try {
      imageOutputs(refs)
      if (refs.length > 3) throw new Error('生图最多支持3张参考图片，请从引用区删减')
    } catch (e) {
      g.error = e.message
      return
    }
    if (g.preview?.length) {
      g.mediaHistory ||= []
      g.mediaHistory.push(copy(g.preview))
    }
    g.preview = []
    g.mediaKind = 'image'
    g.mediaJobs = selected.map(a => ({
      status: 'pending',
      item: { ...copy(a), type: '图片', params: copy(g.params), references: refs }
    }))
    g.stage = 'image-preview'
    await executeJobs(g)
  }
  p.guideGenerateVideos = async g => {
    if (!active(g) || g.stage !== 'video-config') return
    const rows = g.rows.filter(r => g.selection.includes(r.id))
    if (!rows.length) {
      g.error = '请至少选择一个镜头'
      return
    }
    const jobs = rows.map(r => ({
      status: 'pending',
      item: {
        id: r.id,
        number: r.number,
        name: '镜头' + r.number + '视频',
        type: '视频',
        prompt: p.rowText(r) + '\n' + g.story,
        params: copy(g.params),
        references: copy(p.guideRowReferences(g, r.id)),
        excludedRowMedia: p
          .rowImages(r.id)
          .filter(a => !p.guideRowReferences(g, r.id).some(b => b.id === a.id))
          .map(a => 'row-media:' + r.id + ':' + a.id)
      }
    }))
    try {
      for (const job of jobs) {
        const images = imageOutputs(job.item.references)
        if (images.length > 10) throw new Error('每个镜头最多引用10张图片')
        if (job.item.references.some(a => ['音频', '视频'].includes(a.type)))
          throw new Error(
            '当前助手视频调用暂不支持音频或视频文件参考，请移除这些引用；音效可写入提示词'
          )
      }
    } catch (e) {
      g.error = e.message
      return
    }
    if (g.preview?.length) {
      g.mediaHistory ||= []
      g.mediaHistory.push(copy(g.preview))
    }
    g.preview = []
    g.mediaKind = 'video'
    g.mediaJobs = jobs
    g.stage = 'video-preview'
    await executeJobs(g)
  }
  p.guideRetryMedia = g => executeJobs(g, true)
  p.guideBackToParameters = g => {
    if (active(g)) {
      g.stage = g.mediaKind === 'image' ? 'image-config' : 'video-config'
      g.error = ''
    }
  }
  const acceptImages = p.guideAcceptImages,
    acceptVideos = p.guideAcceptVideos
  p.guideAcceptImages = g => {
    if (active(g) && g.preview.length && (!g.failedMedia || g.allowPartial)) acceptImages(g)
  }
  p.guideAcceptVideos = g => {
    if (active(g) && g.preview.length && (!g.failedMedia || g.allowPartial)) acceptVideos(g)
  }
  p.guideRevise = async (g, requirement) => {
    if (!active(g) || !requirement?.trim()) {
      if (g) g.error = '请填写修改要求'
      return
    }
    if (g.stage === 'story')
      await perform(
        g,
        '修改剧情脚本',
        () => engine.story(copy(g.brief), g.plan, g.story, requirement),
        story => {
          g.story = story
          g.modify = false
          g.revision = ''
        }
      )
    else if (g.stage === 'storyboard')
      await perform(
        g,
        '修改分镜脚本',
        () => engine.shots(g.story, copy(g.rows), requirement),
        rows => {
          g.rows = freshRows(rows)
          g.modify = false
          g.revision = ''
        }
      )
    else if (['image-preview', 'video-preview'].includes(g.stage)) {
      const targets = g.preview.filter(
        a => !g.revisionTarget || a.name.includes(g.revisionTarget) || a.number === g.revisionTarget
      )
      if (!targets.length) {
        g.error = '未找到对应名称或镜头号'
        return
      }
      await perform(
        g,
        '按要求修改媒体预览',
        async () => {
          for (const asset of targets) {
            const item = {
              ...copy(asset),
              prompt: asset.prompt + '\n修改要求：' + requirement,
              params: { ...asset.params, count: 1 }
            }
            const outputs = await engine[asset.type === '图片' ? 'image' : 'video'](item)
            asset.versions ||= []
            asset.versions.push(copy({ ...asset, versions: undefined }))
            Object.assign(asset, outputs[0], {
              prompt: item.prompt,
              revision: (asset.revision || 0) + 1
            })
          }
        },
        () => {
          g.modify = false
          g.revision = ''
        }
      )
    }
  }
  p.guideRestoreBatch = (g, index) => {
    const batch = g.mediaHistory?.[index]
    if (
      !active(g) ||
      !batch?.length ||
      batch.some(a => a.type !== (g.mediaKind === 'image' ? '图片' : '视频'))
    )
      return
    if (g.preview.length) g.mediaHistory.push(copy(g.preview))
    g.preview = copy(batch)
    g.failedMedia = 0
    g.mediaJobs = []
    g.error = ''
    g.allowPartial = false
  }
  p.guideRestoreVersion = (g, asset, index) => {
    if (!active(g) || !asset.versions?.[index]) return
    const previous = copy(asset.versions[index]),
      history = copy(asset.versions)
    history.push(copy({ ...asset, versions: undefined }))
    Object.assign(asset, previous, { versions: history })
  }
  p.generateStoryPreview = async id => {
    const n = s.nodes.find(n => n.id === id)
    if (!n || s.readonly || n.storyBusy) return
    const input = [n.prompt, n.text, p.referenceText(n)].filter(Boolean).join('\n')
    if (!input.trim()) {
      p.notify('请先输入剧情内容或添加参考')
      return
    }
    n.storyBusy = true
    n.lastError = ''
    const task = {
      id: 'story-task-' + Date.now() + '-' + serial++,
      name: n.name + '剧情草稿',
      status: '正在调用供应商'
    }
    s.tasks.unshift(task)
    const projectId = s.projectId,
      original = n.text
    try {
      const story = await engine.story({ input }, null)
      task.status = '已完成'
      n.pendingStory = { nodeId: id, text: story, projectId, original }
      const project = s.projects.find(a => a.id === projectId)
      if (project) {
        project.pendingTextDrafts ||= {}
        project.pendingTextDrafts[id] = n.pendingStory
      }
      if (s.projectId === projectId) {
        const live = s.nodes.find(a => a.id === id)
        if (live) live.pendingStory = n.pendingStory
        s.storyPreview = n.pendingStory
      }
    } catch (e) {
      task.status = '失败'
      task.error = e.message
      n.lastError = e.message
      p.notify(e.message)
    } finally {
      n.storyBusy = false
    }
  }
  const confirmText = p.confirmTextStory
  p.confirmTextStory = () => {
    const d = s.storyPreview,
      n = s.nodes.find(n => n.id === d?.nodeId)
    if (n && d.original !== undefined && n.text !== d.original) {
      p.notify('正文已在其他位置修改，请先核对，暂不覆盖')
      return
    }
    confirmText()
    if (!s.storyPreview && n) {
      delete n.pendingStory
      const project = s.projects.find(a => a.id === s.projectId)
      if (project?.pendingTextDrafts) delete project.pendingTextDrafts[n.id]
    }
  }
  const send = p.sendAgent
  p.sendAgent = () => {
    const g = p.currentGuide()
    if (g?.busy) return
    if (g?.stage === 'direction' && s.agentText.trim()) {
      const text = s.agentText.trim()
      s.agentText = ''
      s.messages.push({ role: 'user', text })
      g.brief.input += '\n' + text
      p.guideParseDirection(g, true)
      return
    }
    return send()
  }
}
