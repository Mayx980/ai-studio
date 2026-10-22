export async function readLocalReferences(files) {
  const accepted = [],
    errors = []
  for (const file of Array.from(files).slice(0, 10)) {
    const ext = file.name.split('.').pop().toLowerCase(),
      image =
        /^image\/(png|jpeg|webp|gif|bmp)$/.test(file.type) || /^(png|jpe?g|webp|gif|bmp)$/.test(ext)
    if (!image && !['md', 'doc', 'docx', 'pdf', 'txt', 'csv', 'xlsx'].includes(ext)) {
      errors.push(file.name + '：不支持此格式')
      continue
    }
    const max = image ? 10 : ext === 'md' || ext === 'txt' ? 2 : 20
    if (file.size > max * 1024 * 1024) {
      errors.push(file.name + '：文件超过' + max + 'MB')
      continue
    }
    const asset = {
      id: 'local-' + Date.now() + '-' + Math.random().toString(36).slice(2),
      name: file.name,
      type: image ? '图片' : '文档',
      local: true,
      size: file.size,
      extension: ext,
      version: 1
    }
    try {
      if (image) {
        const bytes = new Uint8Array(await file.arrayBuffer()),
          chunks = []
        for (let offset = 0; offset < bytes.length; offset += 32768)
          chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + 32768)))
        asset.mediaUrl =
          'data:' + (file.type || 'image/' + ext) + ';base64,' + btoa(chunks.join(''))
        asset.mediaMime = file.type || 'image/' + ext
        asset.outputs = [
          {
            mediaType: 'image',
            type: 'base64',
            mimeType: asset.mediaMime,
            data: asset.mediaUrl.split(',')[1]
          }
        ]
      } else if (['md', 'txt', 'csv'].includes(ext)) {
        asset.text = await file.text()
        asset.readStatus = '本地文本已读取'
      } else {
        asset.text =
          '【模拟文档解析】' + file.name + '，作为本次创作参考附件。正式文档正文解析尚未接入。'
        asset.readStatus = '已附加文件 · 解析为模拟'
      }
      accepted.push(asset)
    } catch {
      errors.push(file.name + '：读取失败，请重新选择')
    }
  }
  if (files.length > 10) errors.push('单次最多选择10个文件，其余文件未添加')
  return { accepted, errors }
}
