import { reactive } from 'vue'
import { inferDirection, storyDraft } from '../state/story-format'
const brief =
  '制作目的：香水新品广告；风格：自然电影感；时长：15秒；画面比例：9:16；核心内容：夏日序曲香水从晨光、柑橘花园到产品定格，表达清新与松弛；目标受众：年轻女性'
const copy = value => JSON.parse(JSON.stringify(value))
export function installPresentation(p) {
  const s = p.state,
    rows = copy(s.rows)
  p.presentation = reactive({ mode: '', step: 0, menu: true, compact: false })
  p.launchPresentation = mode => {
    s.modal = null
    s.editorOpen = false
    s.layersCollapsed = false
    p.presentation.mode = mode
    p.presentation.step = 0
    p.presentation.menu = false
    if (mode === 'assistant') {
      s.prompt = brief
      p.start()
      return
    }
    p.newProject('画布演示 · 夏日序曲')
    const add = (type, name, x, y, extra = {}) => {
      const id = p.addNode(type, undefined, { x, y })
      const n = s.nodes.find(n => n.id === id)
      Object.assign(n, { name, x, y, status: 'success', version: 1, ratio: '9:16' }, extra)
      return n
    }
    const text = add('文字', '夏日序曲 · 剧情脚本', 40, 80, {
      text: storyDraft({ ...inferDirection(brief), input: brief }, '晨光唤醒夏日'),
      prompt: brief
    })
    const script = add('脚本', '夏日序曲 · 分镜脚本', 450, 80, {
      rows: copy(rows),
      prompt: text.text
    })
    p.activateScript(script.id)
    s.rows = script.rows
    p.connectToRow(text.id, s.rows[0].id)
    for (let i = 0; i < 3; i++) {
      const row = s.rows[i]
      const image = add(
        '图片',
        ['晨光产品图', '柑橘花园场景图', '品牌定格图'][i],
        3150,
        80 + i * 560,
        { scene: i === 1 ? 'garden' : 'amber', prompt: row.imagePrompt }
      )
      p.assignImageToRows({ ...image, sourceNodeId: image.id }, [row.id], script.id)
      const video = add('视频', '镜头' + row.number + '视频', 3570, 80 + i * 560, {
        scene: image.scene,
        rowId: row.id,
        prompt: row.motionPrompt,
        mode: '图生视频'
      })
      p.connect(row.id, video.id)
    }
    const audio = add('音频', '夏日序曲 · 旁白', 3990, 80, {
      prompt: '清晨，让灵感苏醒。把一整个夏天，装进日常。夏日序曲，即刻开启。'
    })
    p.connectNodes(text.id, audio.id)
    s.messages = [
      {
        role: 'assistant',
        text: '这是准备好的画布演示案例。可编辑剧情、展开分镜表、修改参数并模拟生成；图片为示意图，视频为本地演示片段。'
      }
    ]
    p.focusPresentation(0)
  }
  p.focusPresentation = step => {
    p.presentation.step = step
    const type = ['文字', '脚本', '图片', '视频'][step]
    const n = s.nodes.find(n => n.type === type)
    if (n) {
      s.selectedNode = n.id
      s.focusRequest = { id: n.id, time: Date.now() }
    }
  }
}
