const shapeKeys = ['purpose', 'style', 'duration', 'ratio', 'content', 'audience']
function json(text) {
  if (typeof text !== 'string' || text.length > 200000)
    throw new Error('模型返回内容过长或格式不正确')
  try {
    return JSON.parse(
      text
        .trim()
        .replace(/^```(?:json)?\s*/, '')
        .replace(/\s*```$/, '')
    )
  } catch {
    throw new Error('模型未返回有效JSON，原草稿保留，请修改要求后重试')
  }
}
function text(value, label, max = 20000) {
  if (typeof value !== 'string' || !value.trim() || value.length > max)
    throw new Error('模型返回的' + label + '缺失或过长，原草稿保留')
  return value.trim()
}
export function parsePlans(content) {
  const list = json(content)
  if (!Array.isArray(list) || list.length < 2 || list.length > 5)
    throw new Error('方案必须为2到5个')
  return list
    .map(a => ({
      name: text(a.name, '方案名称', 100),
      outline: text(a.outline, '方案内容'),
      reason: text(a.reason, '推荐理由'),
      score: Number(a.score)
    }))
    .map(a => {
      if (!Number.isFinite(a.score)) throw new Error('方案缺少推荐评分')
      return a
    })
    .sort((a, b) => b.score - a.score)
}
export function parseBrief(content) {
  const value = json(content),
    brief = {}
  if (!value || Array.isArray(value) || typeof value !== 'object')
    throw new Error('方向解析格式不正确')
  for (const key of shapeKeys)
    if (typeof value[key] === 'string' && value[key].trim())
      brief[key] = value[key].trim().slice(0, 5000)
  return brief
}
export function validateStory(content) {
  text(content, '剧情正文', 100000)
  for (const key of [
    '故事定义',
    '剧情结构',
    '创作约束',
    '参考时长',
    '角色形象',
    '道具',
    '场景',
    '剪辑方式',
    '画面与动作',
    '台词'
  ])
    if (!content.includes(key)) throw new Error('剧情缺少“' + key + '”，原草稿保留，请重试')
  return content.trim()
}
export function parsePrompts(content, rows) {
  const items = json(content)
  if (!Array.isArray(items) || items.length < 1 || items.length > 30)
    throw new Error('素材提示词须为1到30项')
  return items.map((a, index) => {
    if (!['角色', '道具', '场景'].includes(a.type))
      throw new Error('提示词类型只能为角色、道具或场景')
    const rowIds = rows
      .filter(r => (a.shotNumbers || []).map(String).includes(String(r.number)))
      .map(r => r.id)
    if (!rowIds.length) throw new Error('素材提示词未关联有效镜头')
    let name = text(a.name, '素材名称', 100)
    if (a.type === '角色' && !name.endsWith('角色图')) name += '角色图'
    return {
      id: 'real-prompt-' + Date.now() + '-' + index,
      type: a.type,
      name,
      prompt: text(a.prompt, '素材提示词'),
      rowIds,
      selected: true
    }
  })
}
export function imageOutputs(references) {
  const images = references.filter(a => a.type === '图片')
  const outputs = images.map(a => a.outputs?.[a.outputIndex || 0]).filter(Boolean)
  if (outputs.length !== images.length)
    throw new Error('参考中存在没有实际图片数据的示例封面，请上传或生成真实图片')
  return outputs
}
export function outputAsset(output) {
  if (
    !output ||
    !['image', 'video', 'audio'].includes(output.mediaType) ||
    !['url', 'base64'].includes(output.type)
  )
    throw new Error('供应商未返回有效媒体结果')
  if (
    output.type === 'url' &&
    (typeof output.url !== 'string' || !output.url.startsWith('https://'))
  )
    throw new Error('媒体结果地址无效')
  if (output.type === 'base64' && (!output.data || !output.mimeType))
    throw new Error('媒体结果数据为空')
  return {
    outputs: [output],
    outputIndex: 0,
    mediaUrl:
      output.type === 'url' ? output.url : 'data:' + output.mimeType + ';base64,' + output.data,
    mediaMime: output.mimeType,
    poster: output.poster
  }
}
function mediaAssets(response, type, count) {
  if (!Array.isArray(response.outputs) || !response.outputs.length)
    throw new Error('供应商未返回媒体')
  const accepted = []
  for (const output of response.outputs) {
    if (output?.mediaType !== type) continue
    try {
      accepted.push(outputAsset(output))
    } catch {
      /* Other valid outputs remain usable. */
    }
    if (accepted.length === count) break
  }
  if (!accepted.length) throw new Error('供应商未返回有效的' + (type === 'image' ? '图片' : '视频'))
  return accepted
}
export function createGuideEngine(run, parseShots) {
  const ask = async (system, value) => {
    const response = await run('text', {
      messages: [
        { role: 'system', content: '默认用简体中文，严格保留用户事实，不编造未知信息。' + system },
        { role: 'user', content: JSON.stringify(value) }
      ]
    })
    return response.text
  }
  const storyFormat =
    '剧情必须包含故事定义（故事、地点、规则）、剧情结构（动机、冲突、阶段变化）、创作约束层（用户指定、已有事实、AI判断和改写权限），以及参考时长、角色形象、道具、场景、剪辑方式、画面与动作设计、台词/音效及素材提示词。仅返回完整正文。'
  return {
    async brief(input) {
      return parseBrief(
        await ask(
          '仅从用户已有输入提取方向，禁止自行补齐。仅返回JSON对象，字段purpose/style/duration/ratio/content/audience；缺失填空字符串。',
          { input }
        )
      )
    },
    async plans(brief, revision = '') {
      return parsePlans(
        await ask(
          '提供2到5种不同视频创意方案，给出与目标受众、目的有关的理由并按推荐度排序。仅返回JSON数组，每项包含name/outline/reason字符串和score数值。',
          { brief, revision }
        )
      )
    },
    async story(brief, plan, previous = '', revision = '') {
      return validateStory(
        await ask(storyFormat + '有修改要求时改写完整正文，不要只附加修改说明。', {
          brief,
          plan,
          previous,
          revision
        })
      )
    },
    async shots(story, previous = [], revision = '') {
      return parseShots(
        await ask(
          '根据已确认剧情编写分镜，仅返回JSON数组。每行必须含number,duration,scale,camera,visual,sound,emotion,environment,imagePrompt,motionPrompt十个字符串字段。画面和两个提示词不得为空。有修改要求时输出修改后的完整分镜。',
          { story, previous, revision }
        )
      )
    },
    async prompts(story, rows) {
      return parsePrompts(
        await ask(
          '提取真正需要生成的主要角色、道具和场景，不强加无关人物。仅返回JSON数组，每项type为角色/道具/场景，name为具体名称，prompt为完整生图提示词，shotNumbers为适用镜头号字符串数组。',
          { story, rows }
        ),
        rows
      )
    },
    async image(item) {
      const params = item.params,
        images = imageOutputs(item.references || [])
      if (images.length > 3) throw new Error('图片模型最多支持3张参考图，请先删减')
      const response = await run('image', {
        model: 'qwen-image-3.0-pro',
        prompt: item.prompt + '\n背景要求：' + params.background + '；画质要求：' + params.quality,
        ratio: params.ratio,
        size: params.resolution === '2K' ? '2K' : '1K',
        n: params.count,
        images
      })
      return mediaAssets(response, 'image', params.count)
    },
    async video(item) {
      const params = item.params,
        images = imageOutputs(item.references || [])
      if (images.length > 10) throw new Error('视频最多支持10张参考图')
      const response = await run(
        'video',
        {
          model: 'wan3Video',
          prompt: [
            item.prompt,
            ...(item.references || [])
              .filter(a => a.type !== '图片' && a.text)
              .map(a => a.name + '：' + a.text)
          ].join('\n'),
          mode:
            images.length === 0
              ? 'text'
              : images.length === 1
                ? 'singleImage'
                : ['imageReference:10', 'videoReference:5'],
          ratio: params.ratio,
          resolution: params.resolution,
          duration: parseInt(params.duration),
          images
        },
        params.count
      )
      return mediaAssets(response, 'video', params.count)
    }
  }
}
