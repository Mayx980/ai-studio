<script setup>
import { computed, ref, onMounted, onUnmounted, nextTick, watch, onUpdated } from 'vue'
import { useCreation } from '@/ports/creation'
import Icon from '../components/CreationIcon.vue'
import ProductScene from '../components/ProductScene.vue'
import ReferenceChip from '../components/ReferenceChip.vue'
import MentionInput from '../components/MentionInput.vue'
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
function rowPoint(rowId, kind = 'source') {
  const el = canvas.value?.querySelector(`[data-row-${kind}="${rowId}"]`),
    script = s.nodes.find(n => n.type === '脚本')
  if (el && canvas.value) {
    const e = el.getBoundingClientRect(),
      v = canvas.value.getBoundingClientRect()
    return {
      x: (e.left + e.width / 2 - v.left + canvas.value.scrollLeft) / (s.zoom / 100),
      y: (e.top + e.height / 2 - v.top + canvas.value.scrollTop) / (s.zoom / 100)
    }
  }
  return {
    x: (script?.x || 0) + (script?.width || 1046) - (kind === 'target' ? 180 : 20),
    y: (script?.y || 0) + 146 + s.rows.findIndex(r => r.id === rowId) * 102
  }
}
const geometryRevision = ref(0)
const edges = computed(() => {
  geometryRevision.value
  return s.nodes.flatMap(n =>
    p.rowIds(n).map(rowId => {
      const a = rowPoint(rowId)
      return {
        id: 'row-' + n.id + '-' + rowId,
        nodeId: n.id,
        rowId,
        rowEdge: true,
        path: `M ${a.x} ${a.y} C ${a.x + 60} ${a.y}, ${n.x - 70} ${n.y + 80}, ${n.x} ${n.y + 80}`
      }
    })
  )
})
const nodeEdges = computed(() => {
  geometryRevision.value
  return s.connections.flatMap(c => {
    const a = s.nodes.find(n => n.id === c.source),
      b = s.nodes.find(n => n.id === c.target)
    if (!a || !b) return []
    const x = a.x + (a.type === '脚本' ? a.width || 1046 : 320),
      y = a.y + 80
    const targets = c.rowIds?.length
      ? c.rowIds.map(id => ({ id, ...rowPoint(id, 'target') }))
      : [{ x: b.x, y: b.y + 80 }]
    return targets.map(point => ({
      id: c.id,
      visualId: c.id + (point.id || ''),
      assignedRowId: point.id,
      path: `M ${x} ${y} C ${x + 90} ${y}, ${point.x - 90} ${point.y}, ${point.x} ${point.y}`
    }))
  })
})
const temporaryEdge = computed(() => {
  if (!linkPoint.value) return ''
  let a
  if (s.reverseLinkTarget) {
    const n = s.nodes.find(n => n.id === s.reverseLinkTarget)
    if (n) a = { x: n.x, y: n.y + 80 }
  } else if (s.linkRowSource) a = rowPoint(s.linkRowSource)
  else {
    const n = s.nodes.find(n => n.id === s.linkSource)
    if (n) a = { x: n.x + (n.type === '脚本' ? n.width || 1046 : 320), y: n.y + 80 }
  }
  if (!a) return ''
  return `M ${a.x} ${a.y} C ${a.x + 60} ${a.y}, ${linkPoint.value.x - 60} ${linkPoint.value.y}, ${linkPoint.value.x} ${linkPoint.value.y}`
})
function openReference(n, a) {
  if (n.type === '脚本' && a.type === '图片') {
    p.attachReference(a, n.id)
    return
  }
  if (a.kind === 'row') p.openModal('row-reference', { node: n, rowId: a.rowId })
  else p.openModal('asset-detail', a)
}
function updateGeometry() {
  geometryRevision.value++
}
watch(
  () =>
    s.nodes
      .map(n => [n.id, n.x, n.y, n.width, n.tableHeight])
      .flat()
      .join(',') + s.rows.map(r => r.id).join(','),
  () => nextTick(updateGeometry),
  { flush: 'post' }
)
function updateViewport() {
  geometryRevision.value++
  if (!canvas.value) return
  const z = s.zoom / 100
  s.viewport = {
    x: canvas.value.scrollLeft / z,
    y: canvas.value.scrollTop / z,
    width: canvas.value.clientWidth / z,
    height: canvas.value.clientHeight / z
  }
}
let nodeObserver
function observeNodes() {
  if (!nodeObserver) return
  canvas.value?.querySelectorAll('[data-node-id]').forEach(el => nodeObserver.observe(el))
}
onUpdated(() => {
  observeNodes()
})
function trackBlank(e) {
  if (e.target.closest('.canvas-node')) return
  const b = canvas.value.getBoundingClientRect()
  s.mouseBlank = {
    x: (e.clientX - b.left + canvas.value.scrollLeft) / (s.zoom / 100),
    y: (e.clientY - b.top + canvas.value.scrollTop) / (s.zoom / 100)
  }
}
async function pasteCanvas(e) {
  if (e.target.closest('textarea,input,[contenteditable=true]')) return
  const files = [...(e.clipboardData?.files || [])].filter(f => f.type.startsWith('image/'))
  if (files.length) {
    e.preventDefault()
    await p.pasteImages(files, s.mouseBlank || { x: s.viewport.x + 50, y: s.viewport.y + 50 })
  }
}
function edgeMenu(e, edge) {
  e.preventDefault()
  e.stopPropagation()
  contextMenu.value = {
    x: Math.min(e.clientX, window.innerWidth - 210),
    y: Math.min(e.clientY, window.innerHeight - 150),
    edge
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
function beginWire(e, { sourceId, rowId, targetId }) {
  if (s.readonly || s.interactionMode === 'hand') return
  e.preventDefault()
  e.stopPropagation()
  s.linkSource = sourceId || null
  s.linkRowSource = rowId || null
  s.reverseLinkTarget = targetId || null
  let moved = false
  const ox = e.clientX,
    oy = e.clientY
  const move = ev => {
    if (Math.abs(ev.clientX - ox) + Math.abs(ev.clientY - oy) > 4) moved = true
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
    const el = document.elementFromPoint(ev.clientX, ev.clientY),
      node = el?.closest('[data-node-id]')?.dataset.nodeId,
      rowTarget = el?.closest('[data-row-target]')?.dataset.rowTarget,
      rowSource = el?.closest('[data-row-source]')?.dataset.rowSource
    if (moved) {
      if (targetId) {
        if (rowSource) p.connect(rowSource, targetId)
        else if (node && node !== targetId) p.connectNodes(node, targetId)
      } else if (sourceId && rowTarget) p.connectImageToRow(sourceId, rowTarget)
      else if (rowId && node && node !== s.nodes.find(n => n.type === '脚本')?.id)
        p.connect(rowId, node)
      else if (sourceId && node && node !== sourceId) p.connectNodes(sourceId, node)
      s.linkSource = null
      s.linkRowSource = null
      s.reverseLinkTarget = null
    }
    linkPoint.value = null
    updateGeometry()
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', end)
}
function startLink(e, n) {
  if (s.reverseLinkTarget) {
    e.preventDefault()
    e.stopPropagation()
    return
  }
  beginWire(e, { sourceId: n.id })
}
function startReverse(e, n) {
  if (s.linkSource || s.linkRowSource) {
    e.preventDefault()
    e.stopPropagation()
    return
  }
  beginWire(e, { targetId: n.id })
}
function startRowLink(e, row) {
  beginWire(e, { rowId: row.id })
}
function endLink(n) {
  if (s.linkSource && s.linkSource !== n.id) p.connectNodes(s.linkSource, n.id)
  else if (s.linkRowSource) p.connect(s.linkRowSource, n.id)
  else return
  s.linkSource = null
  s.linkRowSource = null
  s.reverseLinkTarget = null
  updateGeometry()
}
function sourceClick(n) {
  if (s.reverseLinkTarget && s.reverseLinkTarget !== n.id) {
    p.connectNodes(n.id, s.reverseLinkTarget)
    s.reverseLinkTarget = null
    s.linkSource = null
  }
  updateGeometry()
}
function rowInput(row) {
  if (s.linkSource) {
    p.connectImageToRow(s.linkSource, row.id)
    s.linkSource = null
  } else p.openModal('reference', { for: 'row', rowId: row.id })
  updateGeometry()
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
    s.linkRowSource = null
    s.reverseLinkTarget = null
    linkPoint.value = null
  }
}
onMounted(() => {
  nodeObserver = new ResizeObserver(entries => {
    for (const entry of entries) {
      const n = s.nodes.find(n => n.id === entry.target.dataset.nodeId)
      if (n) {
        if (Math.abs((n.boundsWidth || 0) - entry.contentRect.width) > 1)
          n.boundsWidth = entry.contentRect.width
        if (Math.abs((n.boundsHeight || 0) - entry.contentRect.height) > 1)
          n.boundsHeight = entry.contentRect.height
      }
    }
  })
  observeNodes()
  document.addEventListener('paste', pasteCanvas)
  document.addEventListener('pointerdown', dismissMenu)
  document.addEventListener('keydown', dismissMenu)
  canvas.value?.addEventListener('wheel', wheelZoom, { passive: false })
  canvas.value?.addEventListener('gesturestart', gestureStart, { passive: false })
  canvas.value?.addEventListener('gesturechange', gestureChange, { passive: false })
  updateViewport()
  if (s.autoFit) {
    nextTick(reset)
    s.autoFit = false
  }
})
watch(
  () => s.autoFit,
  value => {
    if (value)
      nextTick(() => {
        reset()
        s.autoFit = false
      })
  },
  { flush: 'post' }
)
onUnmounted(() => {
  nodeObserver?.disconnect()
  document.removeEventListener('paste', pasteCanvas)
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
    e.target.closest('button,input,textarea,select,a,video,audio')
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
  p.addNode(type, undefined, { x: contextMenu.value.canvasX, y: contextMenu.value.canvasY })
  contextMenu.value = null
}

function saveNode(n) {
  if (n.type === '脚本') {
    p.notify('脚本表格可导出 Excel；个人资产保存图片、视频、音频和提示词')
    return
  }
  if (n.status === 'success' && n.type !== '文字') p.openModal('save', { ...n, type: n.type })
  else
    p.openModal('save', {
      type: '提示词',
      name: n.name,
      text: n.prompt || n.text || p.referenceText(n)
    })
  contextMenu.value = null
}
function resize(e, n, direction = 'se') {
  e.preventDefault()
  e.stopPropagation()
  if (s.readonly || s.interactionMode === 'hand') return
  const el = e.currentTarget.closest('.canvas-node'),
    box = el.getBoundingClientRect(),
    zoom = s.zoom / 100
  const x = e.clientX,
    y = e.clientY,
    w = box.width / zoom,
    h = box.height / zoom,
    left = n.x,
    top = n.y,
    initialTableHeight = n.tableHeight || 365
  const minW = n.type === '脚本' ? 600 : 260,
    minH = n.type === '脚本' ? 380 : 280
  const move = ev => {
    const dx = (ev.clientX - x) / zoom,
      dy = (ev.clientY - y) / zoom
    n.width = Math.max(minW, w + (direction.includes('w') ? -dx : direction.includes('e') ? dx : 0))
    n.height = Math.max(
      minH,
      h + (direction.includes('n') ? -dy : direction.includes('s') ? dy : 0)
    )
    n.x = direction.includes('w') ? left + w - n.width : left
    n.y = direction.includes('n') ? top + h - n.height : top
    if (n.type === '脚本') n.tableHeight = Math.max(150, n.height - (h - initialTableHeight))
    updateGeometry()
  }
  const end = () => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', end)
    window.removeEventListener('pointercancel', end)
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', end)
  window.addEventListener('pointercancel', end)
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
        @pointermove="trackBlank"
        tabindex="0"
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
              :key="e.visualId || e.id"
              :d="e.path"
              @contextmenu="edgeMenu($event, e)"
              class="connection-path"
              stroke="url(#edgeGradient)"
              stroke-width="1.8"
              fill="none"
            />
            <path
              v-for="e in [...edges, ...nodeEdges]"
              :key="'hit-' + (e.visualId || e.id)"
              :d="e.path"
              class="connection-hit"
              @contextmenu="edgeMenu($event, e)"
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
              width: n.width ? n.width + 'px' : n.type === '脚本' ? '1046px' : undefined,
              height: n.height ? n.height + 'px' : undefined
            }"
            @contextmenu="menu($event, n)"
            @pointerdown="drag($event, n)"
            @click="s.selectedNode = n.id"
          >
            <span
              v-for="edge in ['n', 'e', 's', 'w', 'ne', 'nw', 'se', 'sw']"
              :key="edge"
              class="node-resize-edge"
              :class="'resize-' + edge"
              :aria-label="'调整' + n.name + '大小 ' + edge"
              @pointerdown="resize($event, n, edge)"
            ></span>
            <button
              class="node-inlet"
              :title="'连接到' + n.name"
              :aria-label="'连接到' + n.name"
              :class="{ linking: s.linkSource && s.linkSource !== n.id }"
              @pointerdown.stop="startReverse($event, n)"
              @click.stop="endLink(n)"
            ></button
            ><button
              class="node-outlet"
              :title="'从' + n.name + '连线'"
              :aria-label="'从' + n.name + '连线'"
              @pointerdown.stop="startLink($event, n)"
              @click.stop="sourceClick(n)"
            ></button>
            <header class="node-header">
              <span class="node-type-icon" :class="n.type"
                ><Icon :name="nodeIcons[n.type]" :size="16" /></span
              ><strong>{{ n.name }}</strong
              ><span class="node-mini-tag">{{ n.type }}</span
              ><button
                v-if="n.type === '脚本'"
                class="icon-button"
                title="编辑分镜表"
                @pointerdown.stop
                @click.stop="p.openModal('script-editor')"
              >
                <Icon name="expand" :size="16" />
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
                @scroll="updateGeometry"
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
                          @change="
                            $event => {
                              s.selectedRows = $event.target.checked ? s.rows.map(x => x.id) : []
                            }
                          "
                        />
                      </th>
                      <th
                        v-for="c in s.columns"
                        :key="c"
                        :class="{ 'row-reference-heading': c === '引用' }"
                      >
                        {{ c }}
                      </th>
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
                      <td class="row-reference-cell">
                        <button
                          class="row-image-inlet"
                          :data-row-target="row.id"
                          :title="'为镜头' + row.number + '连接或引用图片'"
                          :aria-label="'为镜头' + row.number + '引用图片'"
                          @pointerdown.stop
                          @click.stop="rowInput(row)"
                        >
                          <Icon name="image" :size="12" /></button
                        ><ReferenceChip
                          v-for="a in p.rowImages(row.id)"
                          :key="a.id"
                          :asset="a"
                          @remove="p.removeRowImage(row.id, a)"
                          @open="p.openModal('asset-detail', a)"
                        /><span v-if="!p.rowImages(row.id).length" class="row-reference-empty"
                          >添加参考图</span
                        >
                      </td>
                      <td class="row-outlet-cell">
                        <button
                          class="row-outlet"
                          :data-row-source="row.id"
                          @pointerdown.stop="startRowLink($event, row)"
                          :aria-label="'连接镜头' + row.number"
                          :title="'连接镜头' + row.number + '到下游节点'"
                          @click.stop="s.pendingRow = s.pendingRow === row.id ? null : row.id"
                        >
                          <Icon name="plus" :size="13" />
                        </button>
                      </td>
                    </tr>
                    <tr v-if="!s.rows.length">
                      <td colspan="13" class="table-empty">
                        输入故事或引用资料，生成你的第一份分镜。
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div class="script-inline-input">
                <div class="reference-pills">
                  <ReferenceChip
                    v-for="a in p.inputReferences(n)"
                    :key="a.key"
                    :asset="a"
                    @remove="p.removeInputReference(n.id, a)"
                    @open="openReference(n, a)"
                  /><ReferenceChip
                    v-for="(a, i) in s.references"
                    :key="a.id"
                    :asset="a"
                    @remove="s.references.splice(i, 1)"
                    @open="p.openModal('asset-detail', a)"
                  />
                </div>
                <MentionInput
                  v-model="s.prompt"
                  :node-id="n.id"
                  label="脚本节点输入"
                  placeholder="输入故事情节、目标和风格，输入 @ 引用内容…"
                  :disabled="s.readonly"
                />
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
              <div v-else-if="n.status === 'success' && n.type !== '文字'" class="node-media">
                <audio
                  v-if="n.type === '音频' && n.mediaUrl"
                  class="actual-audio"
                  :src="n.mediaUrl"
                  controls
                ></audio>
                <div v-else-if="n.type === '音频'" class="audio-result">
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
                <img
                  v-else-if="n.type === '图片' && n.mediaUrl"
                  class="actual-media"
                  :src="n.mediaUrl"
                  :alt="n.name"
                /><video
                  v-else-if="n.type === '视频' && n.mediaUrl"
                  class="actual-media"
                  :src="n.mediaUrl"
                  :poster="n.poster"
                  controls
                  preload="metadata"
                ></video
                ><ProductScene v-else :variant="n.scene" /><button
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
                  <button title="保存为资产" @click="p.openModal('save', { ...n, type: n.type })">
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
              <p v-if="n.lastError" class="field-error node-error">{{ n.lastError }}</p>
              <div v-if="n.outputs?.length > 1" class="output-selector">
                <button
                  v-for="(output, i) in n.outputs"
                  :key="i"
                  :class="{ active: n.outputIndex === i }"
                  @click="p.selectOutput?.(n.id, i)"
                >
                  结果 {{ i + 1 }}
                </button>
              </div>
              <div class="node-input">
                <div v-if="p.inputReferences(n).length" class="input-references">
                  <ReferenceChip
                    v-for="a in p.inputReferences(n)"
                    :key="a.key"
                    :asset="a"
                    @remove="p.removeInputReference(n.id, a)"
                    @open="openReference(n, a)"
                  />
                </div>
                <MentionInput
                  :model-value="n.prompt"
                  :node-id="n.id"
                  :label="n.name + '提示词'"
                  :placeholder="
                    p.inputReferences(n).length
                      ? '添加要求或输入 @ 引用更多内容…'
                      : '输入目标设定与风格，输入 @ 引用内容…'
                  "
                  :disabled="s.readonly"
                  @update:model-value="p.setNode(n.id, 'prompt', $event)"
                />
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
                    @click="
                      $event => {
                        p.openModal('save', {
                          type: '提示词',
                          text: n.prompt || p.referenceText(n),
                          name: ''
                        })
                      }
                    "
                  >
                    <Icon name="save" :size="14" /></button
                  ><span v-if="p.rowIds(n).length">已引用 {{ p.rowIds(n).length }} 行</span>
                </div>
              </div>
              <div v-if="n.type === '视频'" class="video-mode">
                <select
                  :value="n.mode"
                  aria-label="视频生成方式"
                  @change="p.setNode(n.id, 'mode', $event.target.value)"
                >
                  <option>图生视频</option>
                  <option>文生视频</option>
                  <option>参考图生视频</option></select
                ><button
                  v-if="n.mode !== '文生视频'"
                  :class="{ confirmed: n.imageConfirmed }"
                  @click="p.referenceImage(n.id)"
                >
                  <Icon :name="n.imageConfirmed ? 'check' : 'image'" :size="13" />{{
                    n.imageConfirmed
                      ? '已确认 ' + (n.confirmedImages?.length || 1) + ' 张图片'
                      : '选择并确认图片'
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
              <p v-if="p.isConnected && n.type === '视频'" class="node-mode-hint">
                {{
                  n.mode === '文生视频'
                    ? '文生模式仅发送文本，不发送图片参考'
                    : n.confirmedImages?.length > 1
                      ? '参考图模式采用已确认的 ' + n.confirmedImages.length + ' 张图片'
                      : '图生模式采用已确认的单张实际图片'
                }}
              </p>
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
                  :title="n.type === '文字' && !p.isConnected ? '编辑文本' : '生成' + n.type"
                  :disabled="n.status === 'running' || s.readonly"
                  @click="
                    $event => {
                      n.type === '文字' && !p.isConnected
                        ? p.openModal('text-editor', { node: n })
                        : p.requestGenerate(n.id)
                    }
                  "
                >
                  <Icon name="spark" :size="14" />{{
                    n.type === '文字' && !p.isConnected
                      ? '编辑'
                      : n.status === 'success'
                        ? '再生成'
                        : '生成'
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
            <div class="popover-label">或连接到已有节点（可连接多个）</div>
            <button
              v-for="n in s.nodes.filter(n => n.type !== '脚本')"
              :key="n.id"
              @click="p.connect(s.pendingRow, n.id)"
            >
              <Icon :name="nodeIcons[n.type]" />{{ n.name
              }}<span v-if="p.rowIds(n).includes(s.pendingRow)">✓</span></button
            ><button class="primary-button" @click="s.pendingRow = null">完成连接</button>
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
              @click="
                $event => {
                  p.openModal('rename-session')
                  sessionMenu = false
                }
              "
            >
              重命名会话</button
            ><button
              @click="
                $event => {
                  p.openModal('delete-session')
                  sessionMenu = false
                }
              "
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
                @click="
                  $event => {
                    p.acceptPlan()
                    m.plan = false
                  }
                "
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
        <p class="agent-disclaimer">
          {{
            p.isConnected
              ? '规则编排助手 · 生成将真实调用模型'
              : '场景助手演示 · 媒体生成前确认范围'
          }}
        </p>
      </aside>
    </div>
    <div
      v-if="contextMenu"
      class="canvas-context-menu"
      :style="{ left: contextMenu.x + 'px', top: contextMenu.y + 'px' }"
      role="menu"
      @pointerdown.stop
    >
      <template v-if="contextMenu.edge"
        ><button
          role="menuitem"
          @click="
            () => {
              contextMenu.edge.rowEdge
                ? p.disconnectRow(contextMenu.edge.nodeId, contextMenu.edge.rowId)
                : p.removeConnection(contextMenu.edge.id, contextMenu.edge.assignedRowId)
              contextMenu = null
            }
          "
        >
          <Icon name="close" :size="15" />取消连线
        </button></template
      ><template v-else-if="contextMenu.node"
        ><div class="context-caption">{{ contextMenu.node.name }}</div>
        <button
          role="menuitem"
          :disabled="s.readonly"
          @click="
            $event => {
              p.deleteNode(contextMenu.node.id)
              contextMenu = null
            }
          "
        >
          <Icon name="trash" :size="15" />删除节点</button
        ><button role="menuitem" :disabled="s.readonly" @click="saveNode(contextMenu.node)">
          <Icon name="save" :size="15" />保存到我的资产</button
        ><button
          role="menuitem"
          @click="
            $event => {
              p.copyNode(contextMenu.node.id)
              contextMenu = null
            }
          "
        >
          <Icon name="layers" :size="15" />复制节点
        </button></template
      >
      <div v-if="!contextMenu.edge" class="context-caption">添加节点</div>
      <button
        v-for="[type, icon] in contextMenu.edge ? [] : Object.entries(nodeIcons)"
        :key="type"
        role="menuitem"
        :disabled="s.readonly"
        @click="addAt(type)"
      >
        <Icon :name="icon" :size="15" />添加{{ type }}节点</button
      ><button
        v-if="!contextMenu.node && !contextMenu.edge"
        role="menuitem"
        title="粘贴已复制的节点"
        :disabled="s.readonly"
        @click="
          $event => {
            p.pasteClipboard({ x: contextMenu.canvasX, y: contextMenu.canvasY })
            contextMenu = null
          }
        "
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
