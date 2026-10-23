export const mediaModels = {
  图片: [{ value: 'qwen-image-3.0-pro', label: '千问图像 3.0 Pro' }],
  视频: [{ value: 'wan3.0', label: '万相 3.0' }]
}
export function mediaDefaults(type) {
  return {
    model: mediaModels[type]?.[0].value,
    ratio: '16:9',
    quality: '标准',
    resolution: '1080P',
    background: '自动',
    count: 1,
    duration: '5秒'
  }
}
export function mediaFields(type, connected = false) {
  const fields = [
    { key: 'model', label: '模型', options: mediaModels[type] || [] },
    { key: 'ratio', label: '比例', options: ['16:9', '9:16', '1:1', '4:3'] },
    { key: 'quality', label: '画质', options: ['标准', '高品质'] },
    {
      key: 'resolution',
      label: '清晰度',
      options:
        type === '图片'
          ? connected
            ? ['1K', 'auto', '2K']
            : ['720P', '1080P', '2K']
          : ['720P', '1080P']
    }
  ]
  if (type === '图片')
    fields.push({ key: 'background', label: '背景', options: ['自动', '纯色', '透明'] })
  else fields.push({ key: 'duration', label: '时长', options: ['5秒', '10秒', '15秒'] })
  fields.push({ key: 'count', label: '生成数量', options: [1, 2, 4] })
  return fields
}
export function modelName(type, value) {
  return (
    mediaModels[type]?.find(m => m.value === value)?.label || mediaModels[type]?.[0].label || value
  )
}
