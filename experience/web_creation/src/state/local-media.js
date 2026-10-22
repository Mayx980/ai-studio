import worksheetTemplate from './export-templates/worksheet.xml?raw'
import contentTypes from './export-templates/content-types.xml?raw'
import rootRelationships from './export-templates/relationships.xml?raw'
import workbookTemplate from './export-templates/workbook.xml?raw'
import workbookRelationships from './export-templates/workbook-relationships.xml?raw'
const encoder = new TextEncoder()
function crc32(bytes) {
  let c = -1
  for (const b of bytes) {
    c ^= b
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0)
  }
  return (c ^ -1) >>> 0
}
export function zipFiles(files) {
  const parts = [],
    directory = []
  let offset = 0,
    size = 0
  for (const { name, bytes } of files) {
    const filename = encoder.encode(name),
      crc = crc32(bytes)
    const header = new Uint8Array(30 + filename.length),
      v = new DataView(header.buffer)
    v.setUint32(0, 0x04034b50, true)
    v.setUint16(4, 20, true)
    v.setUint16(6, 0x800, true)
    v.setUint32(14, crc, true)
    v.setUint32(18, bytes.length, true)
    v.setUint32(22, bytes.length, true)
    v.setUint16(26, filename.length, true)
    header.set(filename, 30)
    const central = new Uint8Array(46 + filename.length),
      d = new DataView(central.buffer)
    d.setUint32(0, 0x02014b50, true)
    d.setUint16(4, 20, true)
    d.setUint16(6, 20, true)
    d.setUint16(8, 0x800, true)
    d.setUint32(16, crc, true)
    d.setUint32(20, bytes.length, true)
    d.setUint32(24, bytes.length, true)
    d.setUint16(28, filename.length, true)
    d.setUint32(42, offset, true)
    central.set(filename, 46)
    parts.push(header, bytes)
    directory.push(central)
    offset += header.length + bytes.length
    size += central.length
  }
  const end = new Uint8Array(22),
    v = new DataView(end.buffer)
  v.setUint32(0, 0x06054b50, true)
  v.setUint16(8, files.length, true)
  v.setUint16(10, files.length, true)
  v.setUint32(12, size, true)
  v.setUint32(16, offset, true)
  return new Blob([...parts, ...directory, end], { type: 'application/zip' })
}
function save(blob, name) {
  const url = URL.createObjectURL(blob),
    a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 30000)
}
async function imageBlob(name) {
  const c = document.createElement('canvas')
  c.width = 960
  c.height = 540
  const x = c.getContext('2d')
  x.fillStyle = '#251b33'
  x.fillRect(0, 0, 960, 540)
  x.fillStyle = '#b69add'
  x.fillRect(370, 100, 220, 300)
  x.fillStyle = '#fff'
  x.font = '24px sans-serif'
  x.fillText('本地模拟素材 · ' + name, 40, 490)
  return new Promise(resolve => c.toBlob(resolve, 'image/png'))
}
function audioBlob() {
  const samples = 24000,
    bytes = new Uint8Array(44 + samples * 2),
    v = new DataView(bytes.buffer)
  const str = (at, s) => {
    for (let i = 0; i < s.length; i++) v.setUint8(at + i, s.charCodeAt(i))
  }
  str(0, 'RIFF')
  v.setUint32(4, bytes.length - 8, true)
  str(8, 'WAVEfmt ')
  v.setUint32(16, 16, true)
  v.setUint16(20, 1, true)
  v.setUint16(22, 1, true)
  v.setUint32(24, 24000, true)
  v.setUint32(28, 48000, true)
  v.setUint16(32, 2, true)
  v.setUint16(34, 16, true)
  str(36, 'data')
  v.setUint32(40, samples * 2, true)
  for (let i = 0; i < samples; i++)
    v.setInt16(
      44 + i * 2,
      Math.sin((i * 440 * Math.PI * 2) / 24000) * 1500 * (1 - i / samples),
      true
    )
  return new Blob([bytes], { type: 'audio/wav' })
}
export function installLocalMedia(p, demoVideo) {
  p.previewMedia = n => n.mediaUrl || (n.type === '视频' && n.status === 'success' ? demoVideo : '')
  p.exportSpreadsheet = (rows = p.state.rows) => {
    const escape = value =>
      String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
    const keys = [
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
    const table = [
      p.state.columns,
      ...rows.map(row => [
        ...keys.map(k => row[k] || ''),
        p
          .rowImages(row.id)
          .map(a => a.name)
          .join('、')
      ])
    ]
    const column = i => {
      let result = ''
      for (i++; i; i = Math.floor((i - 1) / 26))
        result = String.fromCharCode(65 + ((i - 1) % 26)) + result
      return result
    }
    const sheet = worksheetTemplate.replace(
      '__ROWS__',
      table
        .map(
          (row, i) =>
            '<row r="' +
            (i + 1) +
            '">' +
            row
              .map(
                (value, j) =>
                  '<c r="' +
                  column(j) +
                  (i + 1) +
                  '" t="inlineStr"><is><t xml:space="preserve">' +
                  escape(value) +
                  '</t></is></c>'
              )
              .join('') +
            '</row>'
        )
        .join('')
    )
    const files = {
      '[Content_Types].xml': contentTypes,
      '_rels/.rels': rootRelationships,
      'xl/workbook.xml': workbookTemplate,
      'xl/_rels/workbook.xml.rels': workbookRelationships,
      'xl/worksheets/sheet1.xml': sheet
    }

    save(
      new Blob(
        [
          zipFiles(
            Object.entries(files).map(([name, text]) => ({ name, bytes: encoder.encode(text) }))
          )
        ],
        { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }
      ),
      (p.state.projectName + '_分镜脚本').replace(/[\\/:*?"<>|]/g, '_') + '.xlsx'
    )
    p.notify('已导出当前分镜Excel表格')
  }
  p.localDownloads = true
  p.prepareDownload = async nodes => {
    if (p.state.busy) return
    p.state.busy = true
    p.state.error = ''
    try {
      const files = []
      for (const n of nodes) {
        const rows = p.rowIds(n),
          numbers =
            rows
              .map(id => p.row(id)?.number)
              .filter(Boolean)
              .join('-') || '独立素材'
        const ext = n.type === '视频' ? 'webm' : n.type === '音频' ? 'wav' : 'png'
        const blob =
          n.type === '视频'
            ? new Blob([Uint8Array.from(atob(demoVideo.split(',')[1]), c => c.charCodeAt(0))], {
                type: 'video/webm'
              })
            : n.type === '音频'
              ? audioBlob()
              : await imageBlob(n.name)
        let name =
          (numbers + '_' + n.name + '_v' + (n.version || 1)).replace(/[\\/:*?"<>|]/g, '_') +
          '.' +
          ext
        if (files.some(f => f.name === name))
          name = name.replace('.' + ext, '_' + (files.length + 1) + '.' + ext)
        files.push({ name, bytes: new Uint8Array(await blob.arrayBuffer()), blob })
      }
      if (!files.length) throw new Error('暂无可下载素材')
      if (files.length === 1) save(files[0].blob, files[0].name)
      else save(zipFiles(files), '镜头素材_本地模拟.zip')
      p.notify('本地模拟素材已下载；文件为示例，不代表模型生成结果')
    } catch (e) {
      p.state.error = '下载失败：' + e.message
    } finally {
      p.state.busy = false
    }
  }
}
