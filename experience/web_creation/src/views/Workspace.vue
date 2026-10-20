<script setup>
import { computed, ref, onMounted, onUnmounted, nextTick, watch } from 'vue'
import { useCreation } from '@/ports/creation'
import Icon from '../components/CreationIcon.vue'
import ProductScene from '../components/ProductScene.vue'
const p = useCreation(),
  s = p.state
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
const nodeIcons = { 文字: 'text', 图片: 'image', 视频: 'video', 音频: 'audio', 脚本: 'script' }
const contextMenu = ref(null),
  linkPoint = ref(null)
const sessionMenu = ref(false),
  showAgent = ref(true),
  canvas = ref(null)
const edges = computed(() => {
  const source = s.nodes.find(n => n.type === '脚本')
  if (!source) return []
  return s.nodes
    .filter(n => n.rowId && p.row(n.rowId))
    .map(n => {
      const x = source.x + (source.width || 1046),
        y = source.y + 146 + s.rows.findIndex(r => r.id === n.rowId) * 102
      return {
        id: n.id,
        path: `M ${x} ${y} C ${x + 50} ${y}, ${n.x - 70} ${n.y + 88}, ${n.x} ${n.y + 88}`
      }
    })
})
const nodeEdges = computed(() =>
  s.connections
    .map(c => {
      const a = s.nodes.find(n => n.id === c.source),
        b = s.nodes.find(n => n.id === c.target)
      if (!a || !b) return null
      const x = a.x + (a.type === '脚本' ? a.width || 1046 : 320),
        y = a.y + 80
      return {
        id: c.id,
        path: `M ${x} ${y} C ${x + 90} ${y}, ${b.x - 90} ${b.y + 80}, ${b.x} ${b.y + 80}`
      }
    })
    .filter(Boolean)
)
const temporaryEdge = computed(() => {
  const a = s.nodes.find(n => n.id === s.linkSource)
  if (!a || !linkPoint.value) return ''
  const x = a.x + (a.type === '脚本' ? a.width || 1046 : 320),
    y = a.y + 80
  return `M ${x} ${y} C ${x + 70} ${y}, ${linkPoint.value.x - 70} ${linkPoint.value.y}, ${linkPoint.value.x} ${linkPoint.value.y}`
})
function updateViewport() {
  if (!canvas.value) return
  const z = s.zoom / 100
  s.viewport = {
    x: canvas.value.scrollLeft / z,
    y: canvas.value.scrollTop / z,
    width: canvas.value.clientWidth / z,
    height: canvas.value.clientHeight / z
  }
}
function createNode(type) {
  updateViewport()
  const id = p.addNode(type)
  if (id)
    nextTick(() =>
      document
        .querySelector(`[data-node-id="${id}"]`)
        ?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' })
    )
}
function startLink(e, n) {
  if (s.readonly || s.interactionMode === 'hand') return
  e.preventDefault()
  s.linkSource = n.id
  const move = ev => {
    const b = canvas.value.getBoundingClientRect()
    linkPoint.value = {
      x: (ev.clientX - b.left + canvas.value.scrollLeft) / (s.zoom / 100),
      y: (ev.clientY - b.top + canvas.value.scrollTop) / (s.zoom / 100)
    }
  }
  move(e)
  const end = ev => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', end)
    const target = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('[data-node-id]')
      ?.dataset.nodeId
    if (target && target !== n.id) p.connectNodes(n.id, target)
    linkPoint.value = null
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', end)
}
function endLink(n) {
  if (s.linkSource) {
    p.connectNodes(s.linkSource, n.id)
    linkPoint.value = null
  } else p.notify('从上游节点右侧连接点拖到这里，或先点击上游连接点')
}
function zoomAt(value, x, y) {
  const el = canvas.value
  if (!el) return
  const before = s.zoom / 100,
    next = Math.max(40, Math.min(180, value)) / 100,
    px = (el.scrollLeft + x) / before,
    py = (el.scrollTop + y) / before
  s.zoom = Math.round(next * 100)
  nextTick(() => {
    el.scrollLeft = px * next - x
    el.scrollTop = py * next - y
    updateViewport()
  })
}
function wheelZoom(e) {
  if (!e.ctrlKey && !e.metaKey) return
  e.preventDefault()
  const b = canvas.value.getBoundingClientRect()
  zoomAt(s.zoom * Math.exp(-e.deltaY * 0.008), e.clientX - b.left, e.clientY - b.top)
}
let gestureZoom = 100
function gestureStart(e) {
  e.preventDefault()
  gestureZoom = s.zoom
}
function gestureChange(e) {
  e.preventDefault()
  zoomAt(gestureZoom * e.scale, canvas.value.clientWidth / 2, canvas.value.clientHeight / 2)
}
function dismissMenu(e) {
  if (e.type === 'keydown' && e.key !== 'Escape') return
  if (e.type === 'pointerdown' && e.target.closest('.canvas-context-menu')) return
  contextMenu.value = null
  if (e.key === 'Escape') {
    s.linkSource = null
    linkPoint.value = null
  }
}
onMounted(() => {
  document.addEventListener('pointerdown', dismissMenu)
  document.addEventListener('keydown', dismissMenu)
  canvas.value?.addEventListener('wheel', wheelZoom, { passive: false })
  canvas.value?.addEventListener('gesturestart', gestureStart, { passive: false })
  canvas.value?.addEventListener('gesturechange', gestureChange, { passive: false })
  updateViewport()
  if (s.autoFit) { nextTick(reset); s.autoFit = false }
})
watch(() => s.autoFit, value => { if(value) nextTick(() => { reset(); s.autoFit=false }) }, {flush:'post'})
onUnmounted(() => {
  document.removeEventListener('pointerdown', dismissMenu)
  document.removeEventListener('keydown', dismissMenu)
  canvas.value?.removeEventListener('wheel', wheelZoom)
  canvas.value?.removeEventListener('gesturestart', gestureStart)
  canvas.value?.removeEventListener('gesturechange', gestureChange)
})
function drag(e, n) {
  if (
    e.button !== 0 ||
    s.readonly ||
    s.interactionMode === 'hand' ||
    e.target.closest('button,input,textarea,select,a')
  )
    return
  const x = e.clientX,
    y = e.clientY,
    ox = n.x,
    oy = n.y
  const move = ev =>
    p.moveNode(n.id, ox + (ev.clientX - x) / (s.zoom / 100), oy + (ev.clientY - y) / (s.zoom / 100))
  const end = () => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', end)
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', end)
}
function pan(e) {
  contextMenu.value = null
  if (
    e.button !== 0 ||
    s.interactionMode !== 'hand' ||
    e.target.closest('button,input,textarea,select')
  )
    return
  e.preventDefault()
  const el = canvas.value,
    x = e.clientX,
    y = e.clientY,
    left = el.scrollLeft,
    top = el.scrollTop
  const move = ev => {
    el.scrollLeft = left - (ev.clientX - x)
    el.scrollTop = top - (ev.clientY - y)
  }
  const end = () => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', end)
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', end)
}
function menu(e, n) {
  e.preventDefault()
  e.stopPropagation()
  contextMenu.value = {
    x: Math.min(e.clientX, window.innerWidth - 210),
    y: Math.min(e.clientY, window.innerHeight - 450),
    node: n,
    canvasX:
      (canvas.value.scrollLeft + e.clientX - canvas.value.getBoundingClientRect().left) /
      (s.zoom / 100),
    canvasY:
      (canvas.value.scrollTop + e.clientY - canvas.value.getBoundingClientRect().top) /
      (s.zoom / 100)
  }
}
function addAt(type) {
  if (type === '脚本') {
    if (s.nodes.some(n => n.type === '脚本')) {
      p.notify('当前已有脚本节点')
      contextMenu.value = null
      return
    }
    s.nodes.push({
      id: 'script',
      type: '脚本',
      name: '分镜脚本',
      x: contextMenu.value.canvasX,
      y: contextMenu.value.canvasY
    })
  } else {
    const id = p.addNode(type)
    if (id) p.moveNode(id, contextMenu.value.canvasX, contextMenu.value.canvasY)
  }
  contextMenu.value = null
}
function saveNode(n) {
  if (n.type === '脚本') {
    p.notify('脚本表格可导出 Excel；个人资产保存图片、视频、音频和提示词')
    return
  }
  if (n.status === 'success' && n.type !== '文字')
    p.openModal('save', { type: n.type, name: n.name, scene: n.scene })
  else
    p.openModal('save', {
      type: '提示词',
      name: n.name,
      text: n.prompt || n.text || p.referenceText(n)
    })
  contextMenu.value = null
}
function resize(e, n) {
  e.preventDefault()
  e.stopPropagation()
  if (s.readonly || s.interactionMode === 'hand') return
  const x = e.clientX,
    y = e.clientY,
    w = n.width || 1046,
    h = n.tableHeight || 365
  const move = ev =>
    p.resizeScript(
      n.id,
      w + (ev.clientX - x) / (s.zoom / 100),
      h + (ev.clientY - y) / (s.zoom / 100)
    )
  const end = () => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', end)
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', end)
}
function focusNode() {
  canvas.value?.scrollTo({ left: 1000, top: 80, behavior: 'smooth' })
}
function reset() {
  if (!canvas.value || !s.nodes.length) return
  const minX = Math.min(...s.nodes.map(n => n.x)),
    minY = Math.min(...s.nodes.map(n => n.y)),
    right = Math.max(...s.nodes.map(n => n.x + (n.type === '脚本' ? n.width || 1046 : 320))),
    bottom = Math.max(...s.nodes.map(n => n.y + (n.type === '脚本' ? 800 : 480)))
  s.zoom = Math.max(
    40,
    Math.min(
      100,
      Math.floor(
        Math.min(
          (canvas.value.clientWidth - 80) / (right - minX),
          (canvas.value.clientHeight - 80) / (bottom - minY)
        ) * 100
      )
    )
  )
  nextTick(() => {
    canvas.value.scrollLeft = Math.max(0, (minX * s.zoom) / 100 - 40)
    canvas.value.scrollTop = Math.max(0, (minY * s.zoom) / 100 - 40)
    updateViewport()
  })
}
</script>
<template>
  <div class="workspace-page">
    <header class="workspace-header">
      <div class="project-breadcrumb">
        <button class="icon-button" title="返回项目" @click="p.go('projects')">
          <Icon name="back" /></button
        ><span class="small-project-icon"><Icon name="folder" /></span
        ><button class="project-title" @click="p.openModal('rename-project')">
          {{ s.projectName }}<Icon name="down" :size="13" /></button
        ><span class="subtle-chip"><i></i>已保存</span>
      </div>
      <div class="header-actions">
        <span v-if="s.readonly" class="readonly-label">只读项目</span
        ><button class="ghost-button" @click="p.openModal('tasks')">
          <Icon name="clock" />任务<span v-if="s.tasks.length" class="tiny-count">{{
            s.tasks.length
          }}</span></button
        ><button class="secondary-button" @click="p.openModal('feedback')">确认与反馈</button
        ><button class="primary-button" @click="p.openModal('download')">
          <Icon name="download" :size="16" />下载素材
        </button>
      </div>
    </header>
    <div class="workspace-toolbar">
      <div class="canvas-tab"><Icon name="layers" :size="16" />主画布<span>01</span></div>
      <div class="toolbar-divider"></div>
      <button
        v-for="[type, icon] in Object.entries(nodeIcons)"
        :key="type"
        :disabled="s.readonly"
        @click="createNode(type)"
      >
        <Icon :name="icon" :size="16" />{{ type }}
      </button>
      <div class="toolbar-spacer"></div>
      <button @click="p.openModal('reference', { for: 'canvas' })">
        <Icon name="attach" :size="15" />引用</button
      ><button class="active-tool" @click="showAgent = !showAgent">
        <Icon name="spark" :size="15" />灵感助手
      </button>
    </div>
    <div class="workspace-body">
      <section
        ref="canvas"
        class="canvas-viewport"
        aria-label="创作画布"
        :class="{ 'hand-mode': s.interactionMode === 'hand' }"
        @pointerdown="pan"
        @scroll="updateViewport"
        @contextmenu="menu($event, null)"
      >
        <div v-if="s.loading" class="canvas-state">
          <div class="spinner"></div>
          <h3>正在载入你的创作…</h3>
          <button class="secondary-button" @click="p.retry()">显示内容</button>
        </div>
        <div v-else-if="s.failed" class="canvas-state">
          <h3>画布暂时加载失败</h3>
          <p>已有节点和素材仍然保留。</p>
          <button class="secondary-button" @click="p.retry()">重新加载</button>
        </div>
        <div v-else class="canvas-stage" :style="{ transform: `scale(${s.zoom / 100})` }">
          <svg class="edge-layer" width="5000" height="2800" aria-label="镜头行连接">
            <defs>
              <linearGradient id="edgeGradient">
                <stop stop-color="#9b7cf8" />
                <stop offset="1" stop-color="#6e58af" />
              </linearGradient>
            </defs>
            <path
              v-for="e in [...edges, ...nodeEdges]"
              :key="e.id"
              :d="e.path"
              stroke="url(#edgeGradient)"
              stroke-width="1.8"
              fill="none"
            />
            <path
              v-if="temporaryEdge"
              :d="temporaryEdge"
              stroke="#c7a0ff"
              stroke-width="2"
              stroke-dasharray="5 4"
              fill="none"
            />
          </svg>
          <article
            v-for="n in s.nodes"
            :key="n.id"
            :data-node-id="n.id"
            class="canvas-node"
            :class="[
              n.type === '脚本' ? 'script-node' : 'media-node',
              { selected: s.selectedNode === n.id }
            ]"
            :style="{
              left: n.x + 'px',
              top: n.y + 'px',
              width: n.type === '脚本' ? (n.width || 1046) + 'px' : undefined
            }"
            @contextmenu="menu($event, n)"
            @pointerdown="drag($event, n)"
            @click="s.selectedNode = n.id"
          >
            <button
              class="node-inlet"
              :title="'连接到' + n.name"
              :aria-label="'连接到' + n.name"
              :class="{ linking: s.linkSource && s.linkSource !== n.id }"
              @pointerdown.stop
              @click.stop="endLink(n)"
            ></button
            ><button
              class="node-outlet"
              :title="'从' + n.name + '连线'"
              :aria-label="'从' + n.name + '连线'"
              @pointerdown.stop="startLink($event, n)"
              @click.stop
            ></button>
            <header class="node-header">
              <span class="node-type-icon" :class="n.type"
                ><Icon :name="nodeIcons[n.type]" :size="16" /></span
              ><strong>{{ n.name }}</strong
              ><span class="node-mini-tag">{{ n.type }}</span
              ><button
                class="icon-button"
                :title="n.type === '脚本' ? '编辑分镜表' : '删除节点'"
                @pointerdown.stop
                @click.stop="n.type === '脚本' ? p.openModal('script-editor') : p.deleteNode(n.id)"
              >
                <Icon :name="n.type === '脚本' ? 'expand' : 'more'" :size="16" />
              </button>
            </header>
            <template v-if="n.type === '脚本'"
              ><div class="script-caption">
                <span
                  ><i class="status-dot"></i>{{ s.rows.length }} 个镜头<span class="muted">
                    · 每行独立连接下游节点</span
                  ></span
                ><button class="subtle-button" @click="p.exportPreview('excel')">
                  <Icon name="download" :size="14" />Excel
                </button>
              </div>
              <div
                class="script-table-scroll"
                :style="{ height: (n.tableHeight || 365) + 'px', maxHeight: 'none' }"
              >
                <table class="script-table">
                  <thead>
                    <tr>
                      <th class="row-selection">
                        <input
                          type="checkbox"
                          aria-label="全选镜头"
                          :checked="s.rows.length > 0 && s.selectedRows.length === s.rows.length"
                          @change="($event) => {
                            s.selectedRows = $event.target.checked ? s.rows.map(x => x.id) : []
                          }"
                        />
                      </th>
                      <th v-for="c in s.columns" :key="c">{{ c }}</th>
                      <th class="row-outlet-heading">连接</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr
                      v-for="row in s.rows"
                      :key="row.id"
                      :class="{ chosen: s.selectedRows.includes(row.id) }"
                    >
                      <td class="row-selection">
                        <input
                          type="checkbox"
                          :aria-label="'选择镜头' + row.number"
                          :checked="s.selectedRows.includes(row.id)"
                          @change="p.toggleRow(row.id)"
                        />
                      </td>
                      <td v-for="key in keys" :key="key">
                        <span v-if="key === 'number'" class="shot-number">{{ row[key] }}</span
                        ><span v-else-if="key === 'duration'" class="duration-pill">{{
                          row[key]
                        }}</span>
                        <p v-else :title="row[key]">{{ row[key] || '—' }}</p>
                      </td>
                      <td class="row-outlet-cell">
                        <button
                          class="row-outlet"
                          :aria-label="'连接镜头' + row.number"
                          :title="'连接镜头' + row.number + '到下游节点'"
                          @click.stop="s.pendingRow = s.pendingRow === row.id ? null : row.id"
                        >
                          <Icon name="plus" :size="13" />
                        </button>
                      </td>
                    </tr>
                    <tr v-if="!s.rows.length">
                      <td colspan="12" class="table-empty">
                        输入故事或引用资料，生成你的第一份分镜。
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div class="script-inline-input">
                <div class="reference-pills">
                  <span v-for="ref in p.upstream(n)" :key="ref.id" class="input-reference-card"
                    ><span :title="ref.text">{{ ref.name }}</span
                    ><button title="取消引用" @click="p.removeConnection(ref.id)">×</button></span
                  ><span v-for="(a, i) in s.references" :key="a.id" class="input-reference-card"
                    >{{ a.name
                    }}<button
                      title="取消引用"
                      :aria-label="'取消引用' + a.name"
                      @click="s.references.splice(i, 1)"
                    >
                      ×
                    </button></span
                  >
                </div>
                <textarea
                  v-model="s.prompt"
                  aria-label="脚本节点输入"
                  placeholder="输入故事情节、目标设定与风格；已引用有效内容时可留空…"
                  :disabled="s.readonly"
                ></textarea>
                <div class="script-inline-tools">
                  <button title="引用" @click="p.openModal('reference', { for: 'script' })">
                    <Icon name="attach" :size="15" /></button
                  ><button title="上传文件或表格" @click="p.openModal('script-input')">
                    <Icon name="upload" :size="15" /></button
                  ><span>Qwen 3.8 Flash</span
                  ><button
                    class="primary-button"
                    title="生成分镜脚本"
                    :disabled="s.readonly"
                    @click="p.generateScript()"
                  >
                    <Icon name="spark" :size="14" />生成分镜
                  </button>
                </div>
                <p v-if="s.error && !s.modal" class="field-error">{{ s.error }}</p>
              </div>
              <div class="script-footer">
                <button class="subtle-button" :disabled="s.readonly" @click="p.addRow()">
                  <Icon name="plus" :size="15" />添加镜头</button
                ><span><Icon name="link" :size="13" />点击行右侧连接点，将内容引用到节点</span
                ><button class="subtle-button" @click="p.openModal('script-input')">
                  输入与引用<Icon name="arrow" :size="14" />
                </button>
              </div>
              <button
                class="script-resize-handle"
                title="拖动调整表格大小"
                aria-label="调整分镜表格大小"
                @pointerdown="resize($event, n)"
              >
                ◢
              </button></template
            ><template v-else
              ><div v-if="n.status === 'running'" class="node-render-state">
                <div class="spinner"></div>
                <b>正在生成创作结果</b><span>当前输入和参考版本已固定</span>
              </div>
              <div v-else-if="n.status === 'success'" class="node-media">
                <div v-if="n.type === '音频'" class="audio-result">
                  <Icon name="audio" :size="26" />
                  <div class="audio-wave">
                    <i
                      v-for="i in 24"
                      :key="i"
                      :style="{ height: 10 + ((i * 17) % 42) + 'px' }"
                    ></i>
                  </div>
                  <span>Seed Audio · 模拟音频结果</span>
                </div>
                <ProductScene v-else :variant="n.scene" /><button
                  v-if="n.type === '视频'"
                  class="video-play"
                  title="播放预览"
                  @click="p.openModal('media-preview', n)"
                >
                  <Icon name="play" :size="25" /></button
                ><span class="image-resolution"
                  >{{ n.type === '图片' ? '1920 × 1080' : p.params(n).duration
                  }}<span>版本 {{ n.version || 1 }}</span></span
                >
                <div class="media-hover-actions">
                  <button
                    title="保存为资产"
                    @click="p.openModal('save', { type: n.type, name: n.name, scene: n.scene })"
                  >
                    <Icon name="save" :size="15" /></button
                  ><button title="下载素材" @click="p.openModal('download', { node: n })">
                    <Icon name="download" :size="15" />
                  </button>
                </div>
              </div>
              <div v-else-if="n.type === '文字'" class="text-node-preview">
                <p>{{ n.text || '设定创作目标与风格，让灵感在这里展开。' }}</p>
                <button class="subtle-button" @click="p.openModal('text-editor', { node: n })">
                  详情<Icon name="arrow" :size="14" />
                </button>
              </div>
              <div v-else class="empty-media">
                <Icon :name="nodeIcons[n.type]" :size="28" /><span
                  >你的{{ n.type }}将在这里呈现</span
                >
              </div>
              <p v-if="n.stale" class="node-stale">来源已更新 · 原结果保留</p>
              <div class="node-input">
                <div
                  v-if="n.rowId || n.refs?.length || p.upstream(n).length"
                  class="input-references"
                >
                  <span v-if="n.rowId" class="input-reference-card"
                    ><button
                      class="reference-label"
                      :title="p.referenceText(n)"
                      @click="p.openModal('row-reference', { node: n })"
                    >
                      <Icon name="script" :size="13" />镜头 {{ p.row(n.rowId)?.number }}</button
                    ><button
                      class="remove-reference"
                      title="取消引用"
                      :aria-label="'取消镜头引用' + n.name"
                      @click="p.removeReference(n.id, 'row')"
                    >
                      ×
                    </button></span
                  ><span v-for="ref in p.upstream(n)" :key="ref.id" class="input-reference-card"
                    ><span :title="ref.text || '等待上游内容就绪'"
                      ><Icon :name="nodeIcons[ref.type]" :size="12" />{{ ref.name }} ·
                      {{ ref.text ? '版本 ' + ref.version : '待就绪' }}</span
                    ><button
                      class="remove-reference"
                      title="取消引用并断开连线"
                      :aria-label="'取消上游引用' + ref.name"
                      @click="p.removeConnection(ref.id)"
                    >
                      ×
                    </button></span
                  ><span v-for="(ref, i) in n.refs" :key="i" class="input-reference-card"
                    ><span :title="ref"><Icon name="attach" :size="12" />{{ ref }}</span
                    ><button
                      class="remove-reference"
                      title="取消引用"
                      :aria-label="'取消引用' + ref"
                      @click="p.removeReference(n.id, i)"
                    >
                      ×
                    </button></span
                  >
                </div>
                <textarea
                  :value="n.prompt"
                  :aria-label="n.name + '提示词'"
                  :placeholder="
                    n.rowId
                      ? '添加补充要求，或直接使用已引用的分镜内容…'
                      : '输入目标设定与风格，或引用参考内容…'
                  "
                  :disabled="s.readonly"
                  @input="p.setNode(n.id, 'prompt', $event.target.value)"
                ></textarea>
                <div class="node-input-tools">
                  <button title="引用" @click="p.openModal('reference', { for: 'node', node: n })">
                    <Icon name="attach" :size="14" /></button
                  ><button
                    v-if="n.type !== '文字'"
                    title="优化提示词"
                    @click="p.openModal('optimize', { node: n })"
                  >
                    <Icon name="spark" :size="14" /></button
                  ><button
                    title="保存提示词为资产"
                    @click="($event) => {
                      p.openModal('save', {
                        type: '提示词',
                        text: n.prompt || p.referenceText(n),
                        name: ''
                      })
                    }"
                  >
                    <Icon name="save" :size="14" /></button
                  ><span v-if="n.rowId">已引用 1 行</span>
                </div>
              </div>
              <div v-if="n.type === '视频'" class="video-mode">
                <select
                  :value="n.mode"
                  aria-label="视频生成方式"
                  @change="p.setNode(n.id, 'mode', $event.target.value)"
                >
                  <option>图生视频</option>
                  <option>文生视频</option></select
                ><button
                  v-if="n.mode === '图生视频'"
                  :class="{ confirmed: n.imageConfirmed }"
                  @click="p.referenceImage(n.id)"
                >
                  <Icon :name="n.imageConfirmed ? 'check' : 'image'" :size="13" />{{
                    n.imageConfirmed ? '图片版本已确认' : '选择并确认图片'
                  }}
                </button>
              </div>
              <div v-if="n.type !== '文字'" class="parameter-summary">
                <button
                  title="打开生成参数"
                  :aria-label="n.name + '生成参数'"
                  :disabled="s.readonly"
                  @click="p.openModal('parameters', { node: n })"
                >
                  <template v-if="n.type === '图片'"
                    ><span>{{ n.ratio }}</span
                    ><span>{{ p.params(n).quality }}</span
                    ><span>{{ p.params(n).resolution }}</span
                    ><span>{{ p.params(n).background }}背景</span
                    ><span>{{ p.params(n).count }}张</span></template
                  ><template v-else-if="n.type === '视频'"
                    ><span>{{ n.ratio }}</span
                    ><span>{{ p.params(n).quality }}</span
                    ><span>{{ p.params(n).resolution }}</span
                    ><span>{{ p.params(n).duration }}</span
                    ><span>{{ p.params(n).count }}条</span></template
                  ><template v-else
                    ><span>{{ p.params(n).voice }}</span
                    ><span>{{ p.params(n).format }}</span
                    ><span>{{ p.params(n).duration }}</span
                    ><span>{{ p.params(n).volume }}%</span
                    ><span>{{ p.params(n).count }}条</span></template
                  ><Icon name="settings" :size="13" />
                </button>
              </div>
              <div class="node-controls">
                <span class="node-model"
                  >{{
                    n.type === '视频'
                      ? '万相 3.0'
                      : n.type === '音频'
                        ? 'Seed Audio1.0'
                        : n.type === '文字'
                          ? 'Qwen Flash'
                          : '千问图像 3.0'
                  }}<Icon name="down" :size="11" /></span
                ><button
                  class="node-generate"
                  :title="n.type === '文字' ? '编辑文本' : '生成' + n.type"
                  :disabled="n.status === 'running' || s.readonly"
                  @click="($event) => {
                    n.type === '文字'
                      ? p.openModal('text-editor', { node: n })
                      : p.requestGenerate(n.id)
                  }"
                >
                  <Icon name="spark" :size="14" />{{
                    n.type === '文字' ? '编辑' : n.status === 'success' ? '再生成' : '生成'
                  }}
                </button>
              </div></template
            >
          </article>
          <div
            v-if="s.pendingRow"
            class="connect-popover"
            :style="{
              left: '1100px',
              top: 225 + s.rows.findIndex(r => r.id === s.pendingRow) * 102 + 'px'
            }"
          >
            <span class="eyebrow">引用镜头 {{ p.row(s.pendingRow)?.number }}</span>
            <h4>连接到新节点</h4>
            <button
              v-for="t in ['图片', '视频', '音频', '文字']"
              :key="t"
              @click="p.addNode(t, s.pendingRow)"
            >
              <Icon :name="nodeIcons[t]" />{{ t }}节点<Icon name="plus" :size="14" />
            </button>
            <div class="popover-label">或连接到已有节点</div>
            <button
              v-for="n in s.nodes.filter(n => n.type !== '脚本')"
              :key="n.id"
              @click="p.connect(s.pendingRow, n.id)"
            >
              <Icon :name="nodeIcons[n.type]" />{{ n.name }}
            </button>
          </div>
        </div>
        <div v-if="!s.nodes.length && !s.loading" class="canvas-state">
          <Icon name="layers" :size="35" />
          <h3>画布，准备好了</h3>
          <p>添加节点，或让灵感助手帮你开始。</p>
          <button
            class="primary-button"
            @click="s.nodes.push({ id: 'script', type: '脚本', name: '分镜脚本', x: 44, y: 74 })"
          >
            添加脚本节点
          </button>
        </div>
      </section>
      <aside v-if="showAgent" class="agent-panel">
        <header>
          <span class="agent-avatar"><Icon name="spark" :size="18" /></span>
          <div><strong>灵感助手</strong><small>一起把想法变成画面</small></div>
          <button class="icon-button" title="收起助手" @click="showAgent = false">
            <Icon name="close" :size="16" />
          </button>
        </header>
        <div class="session-selector">
          <select
            :value="s.activeSession"
            @change="p.switchSession($event.target.value)"
            aria-label="切换会话"
          >
            <option v-for="name in s.sessions" :key="name">{{ name }}</option></select
          ><button class="icon-button" title="创建会话" @click="p.newSession()">
            <Icon name="plus" :size="16" /></button
          ><button class="icon-button" title="会话操作" @click="sessionMenu = !sessionMenu">
            <Icon name="more" :size="16" />
          </button>
          <div v-if="sessionMenu" class="session-menu">
            <button
              @click="($event) => {
                p.openModal('rename-session')
                sessionMenu = false
              }"
            >
              重命名会话</button
            ><button
              @click="($event) => {
                p.openModal('delete-session')
                sessionMenu = false
              }"
            >
              删除会话
            </button>
          </div>
        </div>
        <div class="agent-messages">
          <div class="chat-date">今天</div>
          <article v-for="(m, i) in s.messages" :key="i" class="chat-message" :class="m.role">
            <div class="message-role">
              <Icon v-if="m.role === 'assistant'" name="spark" :size="13" />{{
                m.role === 'assistant' ? '灵感助手' : '你'
              }}
            </div>
            <p>{{ m.text }}</p>
            <button
              v-if="m.role === 'user'"
              class="message-edit"
              title="编辑消息后重发"
              @click="s.agentText = m.text"
            >
              <Icon name="edit" :size="12" />编辑重发
            </button>
            <div v-if="m.tool" class="tool-result">
              <Icon name="check" :size="12" />{{ m.tool }}
            </div>
            <div v-if="m.plan" class="agent-plan">
              <b>画布操作计划</b><span>创建 1 个图片节点</span
              ><span>引用镜头 01 · 保留已有内容</span
              ><button
                class="primary-button"
                @click="($event) => {
                  p.acceptPlan()
                  m.plan = false
                }"
              >
                确认创建<Icon name="arrow" :size="13" />
              </button>
            </div>
          </article>
          <div v-if="s.busy" class="typing-dots">
            <i></i><i></i><i></i><span>正在整理思路…</span>
          </div>
          <div class="agent-suggestion">
            <span>接下来可以试试</span
            ><button @click="s.agentText = '为镜头01创建一个图片节点'">
              为分镜创建图片节点<Icon name="arrow" :size="13" /></button
            ><button @click="p.openModal('question')">
              调整整片的视觉风格<Icon name="arrow" :size="13" />
            </button>
          </div>
        </div>
        <div class="agent-composer">
          <div v-if="s.references.length" class="reference-pills">
            <span v-for="(ref, i) in s.references" :key="ref.id" class="input-reference-card"
              >{{ ref.name
              }}<button title="取消引用" @click="s.references.splice(i, 1)">×</button></span
            >
          </div>
          <textarea
            v-model="s.agentText"
            aria-label="与Agent对话"
            placeholder="告诉我你的想法，或 @ 引用内容…"
            @keydown.ctrl.enter="p.sendAgent()"
          ></textarea>
          <div>
            <button
              class="icon-button"
              title="引用项目或资产"
              @click="p.openModal('reference', { for: 'agent' })"
            >
              <Icon name="attach" :size="16" /></button
            ><span>Qwen 3.8 Flash</span
            ><button class="send-button" title="发送" :disabled="s.busy" @click="p.sendAgent()">
              <Icon name="arrow" :size="16" />
            </button>
          </div>
        </div>
        <p class="agent-disclaimer">场景助手演示 · 媒体生成前确认范围</p>
      </aside>
    </div>
    <div
      v-if="contextMenu"
      class="canvas-context-menu"
      :style="{ left: contextMenu.x + 'px', top: contextMenu.y + 'px' }"
      role="menu"
      @pointerdown.stop
    >
      <template v-if="contextMenu.node"
        ><div class="context-caption">{{ contextMenu.node.name }}</div>
        <button
          role="menuitem"
          :disabled="s.readonly"
          @click="($event) => {
            p.deleteNode(contextMenu.node.id)
            contextMenu = null
          }"
        >
          <Icon name="trash" :size="15" />删除节点</button
        ><button role="menuitem" :disabled="s.readonly" @click="saveNode(contextMenu.node)">
          <Icon name="save" :size="15" />保存到我的资产</button
        ><button
          role="menuitem"
          @click="($event) => {
            p.copyNode(contextMenu.node.id)
            contextMenu = null
          }"
        >
          <Icon name="layers" :size="15" />复制节点
        </button></template
      >
      <div class="context-caption">添加节点</div>
      <button
        v-for="[type, icon] in Object.entries(nodeIcons)"
        :key="type"
        role="menuitem"
        :disabled="s.readonly"
        @click="addAt(type)"
      >
        <Icon :name="icon" :size="15" />添加{{ type }}节点</button
      ><button
        v-if="!contextMenu.node"
        role="menuitem"
        title="粘贴已复制的节点"
        :disabled="!s.clipboard || s.readonly"
        @click="($event) => {
          p.pasteNode(contextMenu.canvasX, contextMenu.canvasY)
          contextMenu = null
        }"
      >
        <Icon name="attach" :size="15" />粘贴
      </button>
    </div>
    <div class="canvas-bottom-toolbar">
      <button
        class="icon-button mode-button"
        title="移动：选择并拖动节点"
        aria-label="移动模式"
        :aria-pressed="s.interactionMode === 'move'"
        :class="{ active: s.interactionMode === 'move' }"
        @click="s.interactionMode = 'move'"
      >
        ↖</button
      ><button
        class="icon-button mode-button"
        title="抓手：拖动画布"
        aria-label="抓手模式"
        :aria-pressed="s.interactionMode === 'hand'"
        :class="{ active: s.interactionMode === 'hand' }"
        @click="s.interactionMode = 'hand'"
      >
        ✋</button
      ><span class="toolbar-divider"></span
      ><button class="icon-button" title="撤销" @click="p.notify('当前没有可撤销的编辑')">
        <Icon name="undo" :size="16" /></button
      ><span class="toolbar-divider"></span
      ><button class="icon-button" title="缩小" @click="s.zoom = Math.max(50, s.zoom - 10)">
        −</button
      ><span>{{ s.zoom }}%</span
      ><button class="icon-button" title="放大" @click="s.zoom = Math.min(150, s.zoom + 10)">
        +</button
      ><span class="toolbar-divider"></span
      ><button class="icon-button" title="适应画布" @click="reset()">
        <Icon name="expand" :size="16" />
      </button>
    </div>
    <div class="canvas-position-note">无限画布<span>双指滑动平移 · 双指捏合缩放</span></div>
  </div>
</template>
