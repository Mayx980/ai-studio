import { extendWorkflow } from './workflow'
import { extendCanvasTools } from './canvas-tools'
import { extendReferences } from './references'
import { reactive } from 'vue'
const columns = [
  '镜头号',
  '时长',
  '景别',
  '运镜方式',
  '画面',
  '台词/音效',
  '角色表情反应',
  '环境场景',
  '分镜图提示词',
  '视频运动提示词'
]
const seedRows = [
  {
    id: 'shot-a',
    number: '01',
    duration: '5s',
    scale: '特写',
    camera: '缓慢推进',
    visual: '晨光穿过纱帘，琥珀色香水瓶静立于石台，水珠沿瓶身滑落。',
    sound: '清晨，让灵感苏醒。',
    emotion: '无人出镜',
    environment: '暖色晨光，米色石台，柔和阴影',
    imagePrompt: '琥珀色玻璃香水瓶，晨光侧逆光，米色石台，商业产品摄影，细腻水珠。',
    motionPrompt: '镜头缓慢推进，晨光移动，瓶身水珠滑落，保持产品形态。'
  },
  {
    id: 'shot-b',
    number: '02',
    duration: '6s',
    scale: '中景',
    camera: '环绕镜头',
    visual: '柑橘与白色花瓣围绕瓶身，清新香调具象化展开。',
    sound: '把一整个夏天，装进日常。',
    emotion: '轻盈、愉悦',
    environment: '深绿色背景，柑橘，白色花瓣',
    imagePrompt: '香水产品与切片柑橘、白色花瓣，深绿背景，通透自然质感。',
    motionPrompt: '缓慢环绕产品，花瓣轻轻飘动，柑橘保持静止，光线柔和。'
  },
  {
    id: 'shot-c',
    number: '03',
    duration: '4s',
    scale: '近景',
    camera: '固定镜头',
    visual: '产品居中定格，画面右侧留出品牌与活动信息空间。',
    sound: '夏日序曲，即刻开启。',
    emotion: '自信、明亮',
    environment: '简洁暖灰背景，柔和顶部光',
    imagePrompt: '居中香水瓶，暖灰背景，右侧留白，极简品牌广告定格。',
    motionPrompt: '固定机位，轻微光影变化，保持产品与留白稳定。'
  }
]
let sequence = 10
export function createWorkspace(scenario = 'default') {
  const rowCopy = seedRows.map(x => ({ ...x }))
  const state = reactive({
    available: true,
    scenario,
    page: 'home',
    modal: null,
    modalData: null,
    prompt: '',
    projectName: '夏日序曲 · 香水新品宣传',
    search: '',
    assetType: '全部',
    category: '全部',
    selectedRows: [],
    selectedNode: null,
    pendingRow: null,
    busy: false,
    toast: '',
    error: '',
    agentText: '',
    activeSession: '灵感探索',
    sessions: ['灵感探索', '产品镜头优化'],
    columns,
    rows: rowCopy,
    assets: [
      {
        id: 'asset-1',
        name: '琥珀香水 · 产品参考',
        type: '图片',
        category: '物品',
        tags: ['物品', '风格'],
        scene: 'amber'
      },
      {
        id: 'asset-2',
        name: '自然晨光 · 摄影提示词',
        type: '提示词',
        category: '风格',
        tags: ['风格', '场景'],
        text: '自然晨光，柔和侧逆光，米色石台，商业产品摄影，干净留白。'
      },
      {
        id: 'asset-3',
        name: '柑橘花园 · 场景参考',
        type: '图片',
        category: '场景',
        tags: ['场景'],
        scene: 'garden'
      }
    ],
    nodes: [
      { id: 'script', type: '脚本', name: '夏日序曲 · 分镜脚本', x: 44, y: 74 },
      {
        id: 'image-1',
        type: '图片',
        name: '产品主视觉',
        x: 2750,
        y: 112,
        rowId: 'shot-a',
        prompt: '',
        status: 'success',
        scene: 'amber',
        ratio: '16:9',
        refs: ['产品参考图']
      },
      {
        id: 'video-1',
        type: '视频',
        name: '晨光产品特写',
        x: 3110,
        y: 112,
        rowId: 'shot-a',
        prompt: '',
        status: 'idle',
        scene: 'amber',
        ratio: '16:9',
        refs: [],
        mode: '图生视频',
        imageConfirmed: false
      }
    ],
    messages: [
      { role: 'user', text: '为这款香水制作一支15秒夏日新品宣传视频，风格自然、通透。' },
      {
        role: 'assistant',
        text: '已整理为 3 个镜头。你可以编辑分镜，并将每一行连接到图片、视频或音频节点。',
        tool: '已创建分镜表 · 3 个镜头'
      }
    ],
    tasks: [],
    references: [],
    readonly: scenario === 'permission',
    loading: scenario === 'loading',
    failed: scenario === 'error',
    zoom: 100,
    interactionMode: 'move',
    clipboard: null
  })
  if (scenario === 'empty') {
    state.rows = []
    state.assets = []
    state.nodes = []
  }
  if (scenario === 'paging')
    state.rows.push(
      ...Array.from({ length: 9 }, (_, i) => ({
        ...seedRows[i % 3],
        id: 'more-' + i,
        number: String(i + 4).padStart(2, '0')
      }))
    )
  const histories = {}
  const port = {
    state,
    removeReference(id, index) {
      if (state.readonly) return
      const n = state.nodes.find(n => n.id === id)
      if (!n) return
      if (index === 'row') n.rowId = null
      else {
        n.refs.splice(index, 1)
        n.imageConfirmed = false
      }
    },
    copyNode(id) {
      const n = state.nodes.find(n => n.id === id)
      if (n) {
        state.clipboard = JSON.parse(JSON.stringify(n))
        port.notify('节点已复制，可在画布右键粘贴')
      }
    },
    pasteNode(x, y) {
      if (state.readonly || !state.clipboard) return
      const n = JSON.parse(JSON.stringify(state.clipboard))
      n.id = 'node-' + sequence++
      n.name += ' 副本'
      n.x = x
      n.y = y
      state.nodes.push(n)
    },
    resizeScript(id, width, height) {
      if (state.readonly) return
      const n = state.nodes.find(n => n.id === id)
      if (n) {
        n.width = Math.max(600, width)
        n.tableHeight = Math.max(150, height)
      }
    },
    isScenario: true,
    changeScenario(v) {
      location.search = '?scenario=' + v
    },
    notify(text) {
      state.toast = text
      setTimeout(() => {
        state.toast = ''
      }, 3500)
    },
    openModal(type, data = {}) {
      state.modal = type
      state.modalData = data
      state.error = ''
    },
    closeModal() {
      state.modal = null
      state.modalData = null
      state.error = ''
    },
    go(page) {
      state.page = page
      state.modal = null
      state.pendingRow = null
    },
    newProject(name) {
      state.projectName = name
      state.nodes = []
      state.rows = []
      state.messages = []
      state.sessions = ['灵感探索']
      state.activeSession = '灵感探索'
      state.page = 'workspace'
    },
    openProject(name) {
      state.projectName = name || state.projectName
      state.page = 'workspace'
      state.loading = false
    },
    start() {
      if (!state.prompt.trim() && !state.references.length) {
        state.error = '请输入创作需求，或先引用参考内容'
        return
      }
      if (state.readonly) return
      state.projectName = '未命名项目'
      state.nodes = []
      state.rows = []
      state.selectedRows = []
      state.sessions = ['灵感探索']
      state.activeSession = '灵感探索'
      state.messages = [
        { role: 'user', text: state.prompt || '根据参考内容创作' },
        { role: 'assistant', text: '已建立新项目。你可以添加脚本节点，用参考资料生成分镜。' }
      ]
      state.page = 'workspace'
      state.error = ''
    },
    addNode(type, rowId) {
      if (state.readonly) {
        port.notify('当前项目为只读')
        return
      }
      const id = 'node-' + sequence++
      state.nodes.push({
        id,
        type,
        name: type + '节点 ' + sequence,
        x: 1150 + (state.nodes.length % 2) * 355,
        y: 490 + Math.floor((state.nodes.length - 3) / 2) * 330,
        rowId,
        prompt: '',
        text: '',
        status: 'idle',
        scene: 'amber',
        refs: [],
        ratio: '16:9',
        mode: '图生视频',
        imageConfirmed: false
      })
      state.selectedNode = id
      state.pendingRow = null
      port.notify(
        rowId
          ? '已连接镜头 ' + state.rows.find(x => x.id === rowId)?.number
          : '已添加' + type + '节点'
      )
      return id
    },
    connect(rowId, nodeId) {
      if (state.readonly) return
      const n = state.nodes.find(x => x.id === nodeId)
      if (n) {
        n.rowId = rowId
        state.pendingRow = null
        port.notify('已引用所选分镜行，不会自动生成')
      }
    },
    moveNode(id, x, y) {
      if (state.readonly) return
      const n = state.nodes.find(n => n.id === id)
      if (n) {
        n.x = Math.max(0, x)
        n.y = Math.max(0, y)
      }
    },
    setNode(id, key, value) {
      if (state.readonly) return
      const n = state.nodes.find(n => n.id === id)
      if (n) n[key] = value
    },
    row(id) {
      return state.rows.find(x => x.id === id)
    },
    referenceText(n) {
      const row = port.row(n.rowId)
      if (!row) return ''
      return [
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
        .map((key, i) => columns[i] + '：' + (row[key] || '—'))
        .join('\n')
    },
    editRow(id, key, value) {
      if (state.readonly) return
      const row = port.row(id)
      if (row) {
        row[key] = value
        state.nodes
          .filter(n => n.rowId === id && n.status === 'success')
          .forEach(n => (n.stale = true))
      }
    },
    addRow() {
      if (state.readonly) return
      state.rows.push({
        id: 'shot-' + sequence++,
        number: String(state.rows.length + 1).padStart(2, '0'),
        duration: '5s',
        scale: '中景',
        camera: '固定',
        visual: '',
        sound: '',
        emotion: '',
        environment: '',
        imagePrompt: '',
        motionPrompt: ''
      })
    },
    generateScript() {
      if (state.readonly) return
      if (!state.prompt.trim() && !state.references.length) {
        state.error = '文字和有效参考均为空，无法生成分镜'
        return
      }
      if (state.rows.length) {
        port.openModal('confirm', {
          title: '重新生成分镜表？',
          description:
            '替换当前表并解除旧行连接，下游节点和生成结果保留。新表不会按镜头号自动接续旧连接。',
          action: 'script'
        })
        return
      }
      port.performScript()
    },
    performScript() {
      state.nodes.filter(n => n.rowId).forEach(n => (n.rowId = null))
      state.rows = seedRows.map(r => ({ ...r, id: 'new-' + r.id }))
      port.closeModal()
      port.notify('分镜表已生成（交互示意）')
    },
    moveRow(id, offset) {
      if (state.readonly) return
      const i = state.rows.findIndex(r => r.id === id),
        j = i + offset
      if (j < 0 || j >= state.rows.length) return
      const [r] = state.rows.splice(i, 1)
      state.rows.splice(j, 0, r)
    },
    toggleRow(id) {
      const i = state.selectedRows.indexOf(id)
      if (i < 0) state.selectedRows.push(id)
      else state.selectedRows.splice(i, 1)
    },
    deleteRow(id) {
      port.openModal('confirm', {
        title: '删除这个镜头？',
        description: '将移除该行引用，下游节点、手写内容和已生成结果会保留。',
        action: 'delete-row',
        id
      })
    },
    deleteNode(id) {
      port.openModal('confirm', {
        title: '删除节点？',
        description: '需要额外确认；已有生成素材不会随节点一起删除。',
        action: 'delete-node',
        id
      })
    },
    confirm() {
      if (state.readonly) return
      const d = state.modalData || {}
      if (d.action === 'delete-row') {
        state.rows = state.rows.filter(r => r.id !== d.id)
        state.nodes.filter(n => n.rowId === d.id).forEach(n => (n.rowId = null))
      }
      if (d.action === 'delete-node') state.nodes = state.nodes.filter(n => n.id !== d.id)
      if (d.action === 'script') {
        port.performScript()
        return
      }
      if (d.action === 'apply') {
        const n = state.nodes.find(n => n.id === d.nodeId)
        if (n) n.prompt = d.text
        port.notify('已应用提示词；模型、参数与参考媒体保持不变')
      }
      if (d.action === 'generate') port.runGeneration(d.nodeId)
      port.closeModal()
    },
    requestGenerate(id) {
      const n = state.nodes.find(n => n.id === id)
      if (!n || state.readonly) return
      if (n.type === '视频' && n.mode === '图生视频' && !n.imageConfirmed) {
        port.notify('请先引用并确认图片版本')
        return
      }
      if (!n.prompt.trim() && !n.rowId && n.refs.length === 0) {
        port.notify('请输入提示词或引用参考内容')
        return
      }
      port.openModal('confirm', {
        title: '确认本次生成',
        description:
          n.name +
          ' · ' +
          (n.type === '视频' ? '万相 3.0' : '千问图像生成 3.0 Pro') +
          ' · ' +
          n.ratio +
          ' · 1份结果。采用当前输入和参考版本。',
        action: 'generate',
        nodeId: id
      })
    },
    runGeneration(id) {
      const n = state.nodes.find(n => n.id === id)
      if (!n) return
      n.status = 'running'
      state.tasks.unshift({ id, name: n.name, status: '生成中' })
      setTimeout(() => {
        n.status = 'success'
        n.stale = false
        const t = state.tasks.find(t => t.id === id)
        if (t) t.status = '已完成'
        port.notify('生成完成（模拟结果，未调用模型）')
      }, 1300)
    },
    referenceImage(id) {
      const n = state.nodes.find(n => n.id === id)
      if (n) {
        n.refs = ['产品主视觉 · 版本1']
        n.imageConfirmed = true
        port.notify('已引用并确认图片版本1')
      }
    },
    saveAsset(d) {
      if (state.readonly) {
        port.notify('当前为只读预览')
        return
      }
      if (!d.name.trim()) {
        state.error = '请填写资产名称'
        return
      }
      if (!d.category) {
        state.error = '请选择保存位置'
        return
      }
      if (d.type === '提示词' && !d.text?.trim()) {
        state.error = '不能保存空提示词'
        return
      }
      state.assets.unshift({
        id: 'asset-' + sequence++,
        name: d.name,
        type: d.type,
        category: d.category,
        tags: [...d.tags],
        text: d.text,
        scene: d.scene || 'amber'
      })
      port.closeModal()
      port.notify('已保存为个人资产')
    },
    applyAsset(asset, nodeId) {
      if (state.readonly) return
      const n = state.nodes.find(n => n.id === nodeId)
      if (!n) return
      if (asset.type === '提示词') {
        if (n.prompt.trim()) {
          port.openModal('confirm', {
            title: '替换当前提示词？',
            description: '将应用所选文本，不修改模型、参数和参考媒体。',
            action: 'apply',
            nodeId,
            text: asset.text
          })
          return
        }
        n.prompt = asset.text
      } else n.refs.push(asset.name)
      port.closeModal()
      port.notify('已引用资产，不会自动生成')
    },
    sendAgent() {
      const t = state.agentText.trim()
      if (!t) return
      state.messages.push({ role: 'user', text: t })
      state.agentText = ''
      state.busy = true
      setTimeout(() => {
        state.messages.push({
          role: 'assistant',
          text: '可以。建议保留当前分镜，先创建一个引用镜头01的图片节点。请确认本次操作范围。',
          plan: true
        })
        state.busy = false
      }, 650)
    },
    acceptPlan() {
      port.addNode('图片', state.rows[0]?.id)
      state.messages.push({
        role: 'assistant',
        text: '已创建并连接图片节点。生成素材前仍需确认模型、参数及输入范围。',
        tool: '创建节点 → 引用镜头01 · 已完成'
      })
    },
    switchSession(name) {
      histories[state.activeSession] = state.messages.map(m => ({ ...m }))
      state.activeSession = name
      state.messages = (histories[name] || []).map(m => ({ ...m }))
    },
    newSession() {
      histories[state.activeSession] = state.messages.map(m => ({ ...m }))
      state.sessions.push('新对话 ' + (state.sessions.length + 1))
      state.activeSession = state.sessions.at(-1)
      state.messages = []
    },
    renameSession(name) {
      if (name.trim()) {
        state.sessions = state.sessions.map(x => (x === state.activeSession ? name : x))
        histories[name] = histories[state.activeSession]
        state.activeSession = name
      }
    },
    deleteSession() {
      state.sessions = state.sessions.filter(x => x !== state.activeSession)
      state.activeSession = state.sessions[0] || '新对话'
      state.messages = (histories[state.activeSession] || []).map(m => ({ ...m }))
      port.closeModal()
      port.notify('会话已删除，画布与生成结果保留')
    },
    exportPreview(kind) {
      port.openModal('export', { kind })
    },
    retry() {
      state.failed = false
      state.loading = false
    },
    prepareDownload() {
      state.busy = true
      setTimeout(() => {
        state.busy = false
        port.notify('素材交付清单已准备（原型不包含真实视频文件）')
      }, 850)
    }
  }
  extendWorkflow(port, seedRows)
  extendReferences(port)
  extendCanvasTools(port)
  return port
}
