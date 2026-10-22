<script setup>
import { computed, reactive, ref } from 'vue'
import { useCreation } from '@/ports/creation'
import Icon from './CreationIcon.vue'
import ProductScene from './ProductScene.vue'
import MediaCover from './MediaCover.vue'
import ReferenceChip from './ReferenceChip.vue'
import MentionInput from './MentionInput.vue'
const props = defineProps({ forcedKind: String })
const p = useCreation(),
  s = p.state,
  d = props.forcedKind ? {} : s.modalData || {},
  kind = props.forcedKind || s.modal
const form = reactive({
  name: d.name || '',
  type: d.type || '提示词',
  text: d.text || '',
  category: '风格',
  tags: [],
  scene: d.scene || 'amber',
  mediaUrl: d.mediaUrl,
  poster: d.poster,
  mediaMime: d.mediaMime,
  outputs: d.outputs
})
const text = ref(d.node?.text || d.node?.prompt || ''),
  input = ref(''),
  referenceSource = ref(d.confirmImage ? '当前画布' : '个人资产'),
  applyNode = ref(''),
  feedback = reactive({ version: '脚本初稿', status: '待确认', opinion: '' }),
  saved = ref(false),
  onlyAvailable = ref(false)
const editorRows = ref(JSON.parse(JSON.stringify(s.rows))),
  selectedReferences = ref([])
function toggleReference(a) {
  const i = selectedReferences.value.findIndex(x => x.id === a.id)
  if (i < 0) selectedReferences.value.push(a)
  else selectedReferences.value.splice(i, 1)
}
function saveReferences() {
  const chosen = [...selectedReferences.value]
  if (d.for === 'row') {
    const script = p.activeScript?.() || s.nodes.find(n => n.type === '脚本')
    for (const a of chosen) {
      const current = a.sourceNodeId
        ? s.connections.find(c => c.source === a.sourceNodeId && c.target === script?.id)?.rowIds
        : s.rows.filter(r => r.imageRefs?.some(x => x.id === a.id)).map(r => r.id)
      p.assignImageToRows(a, [...new Set([...(current || []), d.rowId])], script?.id)
    }
    p.closeModal()
  } else if (d.for === 'node') {
    p.closeModal()
    const pictures = chosen.filter(a => a.type === '图片')
    const target = s.nodes.find(n => n.id === d.node.id)
    for (const a of chosen.filter(a => !(target?.type === '脚本' && a.type === '图片')))
      p.attachReference(a, d.node.id)
    if (target?.type === '脚本' && pictures.length)
      p.openModal('row-assignment', { asset: pictures[0], assets: pictures, targetId: target.id })
  } else {
    for (const a of chosen)
      if (!s.references.some(x => x.id === a.id)) {
        s.references.push(a)
        if (d.for === 'agent') s.agentText += ' @' + a.name
      }
    p.closeModal()
  }
}
function moveEditorRow(id, offset) {
  const i = editorRows.value.findIndex(r => r.id === id),
    j = i + offset
  if (j < 0 || j >= editorRows.value.length) return
  const [row] = editorRows.value.splice(i, 1)
  editorRows.value.splice(j, 0, row)
}
function addEditorRow() {
  editorRows.value.push({
    id: 'draft-' + Date.now() + '-' + editorRows.value.length,
    ...Object.fromEntries(
      keys.map(k => [k, k === 'number' ? String(editorRows.value.length + 1).padStart(2, '0') : ''])
    )
  })
}
function saveEditor() {
  if (s.readonly) return
  for (const row of [...s.rows])
    if (!editorRows.value.some(r => r.id === row.id)) p.removeRow(row.id)
  for (const row of editorRows.value)
    for (const key of keys)
      if (p.row(row.id)?.[key] !== row[key]) {
        p.editRow(row.id, key, row[key])
        s.nodes
          .filter(n => p.rowIds(n).includes(row.id) && n.status === 'success')
          .forEach(n => {
            n.stale = true
          })
      }
  s.rows = editorRows.value.map(r => ({ ...r, imageRefs: p.row(r.id)?.imageRefs || r.imageRefs }))
  editorRows.value = JSON.parse(JSON.stringify(s.rows))
  p.notify('分镜修改已保存')
}
const pendingRowDelete = ref(null),
  selectedRows = ref([...(d.rowIds || [])]),
  selectedImages = ref([...(d.node?.confirmedImages || [])])
function toggleImage(asset) {
  const index = selectedImages.value.findIndex(a => a.id === asset.id)
  if (index >= 0) selectedImages.value.splice(index, 1)
  else if (selectedImages.value.length >= 10) s.error = '最多选择10张图片'
  else selectedImages.value.push(asset)
}
function saveImages() {
  if (p.confirmImages(d.node.id, selectedImages.value)) p.closeModal()
}
function saveRows() {
  for (const a of d.assets || [d.asset])
    if (!p.assignImageToRows(a, selectedRows.value, d.targetId)) return
  p.closeModal()
}
function deleteEditorRow() {
  editorRows.value = editorRows.value.filter(r => r.id !== pendingRowDelete.value.id)
  pendingRowDelete.value = null
}
const optimizedPreview = ref(d.node?.prompt?.trim() ? d.node.prompt : p.referenceText(d.node)),
  optimizing = ref(false)
async function optimize() {
  if (!input.value.trim() || optimizing.value) return
  optimizing.value = true
  s.error = ''
  try {
    if (p.optimizePrompt)
      optimizedPreview.value = await p.optimizePrompt(optimizedPreview.value, input.value)
    else {
      await new Promise(resolve => setTimeout(resolve, 500))
      optimizedPreview.value =
        (optimizedPreview.value.trim() || p.referenceText(d.node)) +
        '。' +
        input.value.trim() +
        '；明确画面主体、光线与构图，保持内容连贯。'
    }
  } catch (e) {
    s.error = e.message
  } finally {
    optimizing.value = false
  }
}

const parameterDraft = reactive({ ...p.params(d.node || {}) }),
  ratioDraft = ref(d.node?.ratio || '16:9')
const currentMaterials = computed(() => {
  const all =
    referenceSource.value === '个人资产'
      ? s.assets
      : referenceSource.value === '当前画布'
        ? p.materials()
        : s.projects
            .filter(x => x.id !== s.projectId)
            .flatMap(x =>
              p
                .materials(x.workspace?.nodes || [], x.workspace?.rows || [])
                .map(a => ({ ...a, sourceNodeId: undefined, name: x.name + ' / ' + a.name }))
            )
  return all.filter(
    a =>
      (!d.node || a.sourceNodeId !== d.node.id) &&
      (!(d.confirmImage || d.for === 'row') || a.type === '图片')
  )
})
function chooseReference(a) {
  if (d.confirmImage) toggleImage(a)
  else toggleReference(a)
}

function saveParams() {
  if (s.readonly) return
  Object.assign(p.params(d.node), parameterDraft)
  p.setNode(d.node.id, 'ratio', ratioDraft.value)
  p.closeModal()
  p.notify('参数已保存，未发起生成')
}
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
const outputRows = computed(() =>
  d.node
    ? []
    : s.nodes
        .filter(n => n.type === '脚本')
        .flatMap(n => p.scriptRows(n))
        .filter(r => !s.selectedRows.length || s.selectedRows.includes(r.id))
)
const outputs = computed(() =>
  s.nodes.filter(
    n =>
      (!d.node || n.id === d.node.id) &&
      n.type !== '脚本' &&
      n.status === 'success' &&
      (d.node || !s.selectedRows.length || p.rowIds(n).some(id => s.selectedRows.includes(id)))
  )
)
const title = computed(
  () =>
    ({
      'row-assignment': '选择应用镜头',
      parameters: '生成参数',
      save: '保存为资产',
      reference: '引用内容',
      apply: '引用到画布',
      'script-input': '生成分镜脚本',
      'script-editor': '编辑分镜脚本',
      'text-editor': '文本详情',
      download: '下载镜头素材',
      'rename-project': '重命名项目',
      'rename-session': '重命名会话',
      'delete-session': '删除会话？',
      'asset-detail': '资产详情',
      'row-reference': '分镜行参考',
      optimize: '优化提示词',
      tasks: '生成任务',
      feedback: '确认与反馈',
      question: '选择视觉风格',
      projects: '我的项目',
      'new-project': '新建空白项目',
      guide: '从灵感到素材',
      'media-preview': '视频预览',
      export: d.kind === 'excel' ? '导出分镜 Excel' : '导出为PDF格式',
      confirm: d.title
    })[kind] || '创作面板'
)
function toggleTag(t) {
  form.tags.includes(t) ? form.tags.splice(form.tags.indexOf(t), 1) : form.tags.push(t)
}
function saveText() {
  p.setNode(d.node.id, 'text', text.value)
  p.closeModal()
  p.notify('正文已保存')
}
function close(origin) {
  if (kind === 'script-editor') {
    if (origin === 'header') {
      if (
        JSON.stringify(editorRows.value) !== JSON.stringify(s.rows) &&
        !window.confirm('分镜修改尚未保存，确定放弃修改？')
      )
        return
      s.editorOpen = false
    }
    return
  }
  if (
    kind === 'text-editor' &&
    text.value !== (d.node?.text || '') &&
    !window.confirm('正文尚未保存，确定放弃修改？')
  )
    return
  p.closeModal()
}
function printPreview() {
  p.notify('已打开正文导出预览；正式PDF排版待实现')
}
</script>
<template>
  <div class="modal-backdrop" @click.self="close('backdrop')" @keydown.esc="close('keyboard')">
    <section
      class="modal"
      role="dialog"
      aria-modal="true"
      :aria-label="title"
      :class="{
        'wide-modal': ['script-editor', 'export'].includes(kind),
        'save-modal': kind === 'save'
      }"
    >
      <header class="modal-header">
        <div>
          <span class="modal-kicker" v-if="kind === 'save'">PERSONAL LIBRARY</span>
          <h2>{{ title }}</h2>
        </div>
        <div class="modal-header-actions">
          <button
            v-if="kind === 'text-editor'"
            class="icon-button"
            title="导出"
            @click="saved = !saved"
          >
            <Icon name="download" />
          </button>
          <div v-if="kind === 'text-editor' && saved" class="export-menu">
            <button @click="printPreview()">导出为PDF格式</button>
          </div>
          <button class="icon-button" title="关闭" @click="close('header')">
            <Icon name="close" :size="22" />
          </button>
        </div>
      </header>
      <div class="modal-content">
        <template v-if="kind === 'save'"
          ><div class="save-layout">
            <div class="save-preview">
              <div v-if="form.type === '提示词'" class="save-prompt">
                <span><Icon name="text" :size="15" />提示词预览</span
                ><textarea
                  v-model="form.text"
                  aria-label="提示词预览"
                  placeholder="输入要保存的提示词"
                ></textarea>
              </div>
              <MediaCover v-else :asset="form" />
              <div class="preview-meta">
                <b>{{ d.name || '当前提示词' }}</b
                ><small>{{ form.type }} · 来自当前项目</small>
              </div>
            </div>
            <div class="save-fields">
              <label>资产名称 <em>*</em></label>
              <div class="name-input">
                <input
                  v-model="form.name"
                  aria-label="资产名称"
                  placeholder="为资产起一个容易找到的名字"
                  maxlength="50"
                /><button
                  class="ai-name"
                  title="AI生成名称"
                  @click="
                    $event => {
                      form.name =
                        form.type === '提示词'
                          ? '自然晨光 · 商业摄影提示词'
                          : '琥珀香水 · 产品主视觉'
                    }
                  "
                >
                  <Icon name="spark" :size="15" />
                </button>
              </div>
              <span class="field-hint">{{ form.name.length }} / 50</span
              ><label>保存位置 <em>*</em></label
              ><select v-model="form.category" aria-label="保存位置">
                <option v-for="t in ['角色', '场景', '物品', '风格', '音效']" :key="t">
                  {{ t }}
                </option></select
              ><label>设置标签 <span class="optional">可多选</span></label>
              <div class="tag-picker">
                <button
                  v-for="t in ['角色', '场景', '物品', '风格', '音效']"
                  :key="t"
                  :class="{ selected: form.tags.includes(t) }"
                  @click="toggleTag(t)"
                >
                  <Icon v-if="form.tags.includes(t)" name="check" :size="12" />{{ t }}
                </button>
              </div>
              <p class="help-copy">保存当前内容的独立版本，后续修改不会影响已保存的资产。</p>
              <p v-if="s.error" class="field-error" role="alert">{{ s.error }}</p>
            </div>
          </div></template
        ><template v-else-if="kind === 'row-assignment'"
          ><div class="row-assignment-asset">
            <ReferenceChip
              v-for="a in d.assets || [d.asset]"
              :key="a.id"
              :asset="a"
              :removable="false"
            />
          </div>
          <p class="help-copy">选择图片要应用的镜头。图片会显示在脚本输入框和选中行的“引用”列。</p>
          <label v-if="s.rows.length" class="checkbox-label"
            ><input
              type="checkbox"
              aria-label="选择全部镜头"
              :checked="selectedRows.length === s.rows.length"
              @change="selectedRows = $event.target.checked ? s.rows.map(r => r.id) : []"
            />全部镜头</label
          >
          <div class="row-assignment-list">
            <label v-for="row in s.rows" :key="row.id"
              ><input
                v-model="selectedRows"
                type="checkbox"
                :value="row.id"
                :aria-label="'应用到镜头' + row.number"
              /><b>镜头 {{ row.number }}</b
              ><span>{{ row.visual }}</span></label
            >
          </div>
          <p v-if="!s.rows.length" class="help-copy">
            尚无分镜：先作为脚本整体参考，生成分镜后可点击参考卡片设置镜头。
          </p>
          <p v-if="s.error" class="field-error">{{ s.error }}</p></template
        ><template v-else-if="kind === 'reference'"
          ><div class="filter-tabs reference-tabs">
            <button
              v-for="t in ['当前画布', '其他项目', '个人资产']"
              :key="t"
              :class="{ active: referenceSource === t }"
              @click="referenceSource = t"
            >
              {{ t }}
            </button>
          </div>
          <p class="help-copy">仅显示你有权限访问的内容。引用不会自动生成。</p>
          <div v-if="!d.confirmImage" class="selected-image-strip">
            <span>已选 {{ selectedReferences.length }} 项</span
            ><ReferenceChip
              v-for="a in selectedReferences"
              :key="a.id"
              :asset="a"
              @remove="toggleReference(a)"
            />
          </div>
          <div v-if="d.confirmImage" class="selected-image-strip">
            <span>已选 {{ selectedImages.length }} / 10</span
            ><ReferenceChip
              v-for="a in selectedImages"
              :key="a.id"
              :asset="a"
              @remove="toggleImage(a)"
            /><small>{{ selectedImages.length > 1 ? '多图参考生成' : '单图生视频' }}</small>
          </div>
          <div class="reference-list">
            <button
              v-for="a in currentMaterials"
              :key="a.id"
              :class="{
                'image-choice-selected': (d.confirmImage
                  ? selectedImages
                  : selectedReferences
                ).some(x => x.id === a.id)
              }"
              :aria-pressed="
                (d.confirmImage ? selectedImages : selectedReferences).some(x => x.id === a.id)
              "
              @click="chooseReference(a)"
            >
              <div class="reference-thumb"><MediaCover :asset="a" /></div>
              <div>
                <b>{{ a.name }}</b
                ><span
                  >{{ a.type }} · {{ referenceSource }}
                  <template v-if="a.version"> · 版本 {{ a.version }}</template></span
                >
                <p v-if="a.text">{{ a.text }}</p>
              </div>
              <Icon
                :name="
                  (d.confirmImage ? selectedImages : selectedReferences).some(x => x.id === a.id)
                    ? 'check'
                    : 'plus'
                "
                :size="18"
              />
            </button>
          </div>
          <div v-if="!currentMaterials.length" class="empty-panel">
            <h3>暂无可引用内容</h3>
            <p>文本节点填写正文，媒体节点生成成功后，将实时出现在这里。</p>
          </div></template
        ><template v-else-if="kind === 'script-input'"
          ><label>故事与创作要求</label
          ><MentionInput
            :node-id="(p.activeScript?.() || s.nodes.find(n => n.type === '脚本'))?.id"
            v-model="s.prompt"
            rows="5"
            label="脚本输入"
            placeholder="输入故事情节与风格；已有有效参考时，这里可以为空。"
          />
          <div class="reference-pills">
            <span v-for="a in s.references" :key="a.id"
              ><Icon name="attach" :size="12" />{{ a.name }}</span
            >
          </div>
          <button class="secondary-button" @click="p.openModal('reference', { for: 'script' })">
            <Icon name="attach" />引用内容</button
          ><label class="upload-zone"
            ><Icon name="upload" :size="25" /><b>上传文件或表格</b
            ><span>文档与表格解析结果将在确认后应用</span
            ><input
              type="file"
              accept=".pdf,.docx,.xlsx,.csv,.txt"
              @change="
                $event => {
                  s.references.push({
                    id: 'file-' + Date.now(),
                    name: $event.target.files[0]?.name || '文件',
                    type: '文档'
                  })
                  p.notify('已选择文件，当前原型仅演示解析确认流程')
                }
              "
          /></label>
          <p class="help-copy">脚本节点只生成分镜表，图片与视频由连接的下游节点生成。</p>
          <p v-if="s.error" class="field-error">{{ s.error }}</p></template
        ><template v-else-if="kind === 'script-editor'"
          ><div class="table-editor-scroll">
            <table class="script-table editable-table">
              <thead>
                <tr>
                  <th v-for="c in s.columns" :key="c">{{ c }}</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in editorRows" :key="row.id">
                  <td v-for="key in keys" :key="key">
                    <textarea
                      v-model="row[key]"
                      :aria-label="row.number + ' ' + key"
                      :disabled="s.readonly"
                    ></textarea>
                  </td>
                  <td class="editor-row-references">
                    <ReferenceChip
                      v-for="a in p.rowImages(row.id)"
                      :key="a.id"
                      :asset="a"
                      @remove="p.removeRowImage(row.id, a)"
                    /><button
                      class="subtle-button"
                      :title="'为镜头' + row.number + '引用图片'"
                      @click="p.openModal('reference', { for: 'row', rowId: row.id })"
                    >
                      <Icon name="plus" :size="13" />引用图片
                    </button>
                  </td>
                  <td>
                    <button class="icon-button" title="上移镜头" @click="moveEditorRow(row.id, -1)">
                      ↑</button
                    ><button class="icon-button" title="下移镜头" @click="moveEditorRow(row.id, 1)">
                      ↓</button
                    ><button class="icon-button" title="删除镜头" @click="pendingRowDelete = row">
                      <Icon name="trash" :size="16" />
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <p class="help-copy">
            点击“确定”保存表格修改，已有下游结果保留。排序和镜头号变化不改变行关联。
          </p>
          <button class="secondary-button" @click="addEditorRow()">
            <Icon name="plus" />添加镜头
          </button></template
        ><template v-else-if="kind === 'text-editor'"
          ><label>目标设定与风格</label
          ><textarea
            v-model="text"
            rows="13"
            aria-label="文本正文"
            placeholder="请输入创作目标、受众、核心信息和期望风格…"
          ></textarea>
          <p class="help-copy">点击“确定”保存。导出不代替保存。</p></template
        ><template v-else-if="kind === 'download'"
          ><div class="download-summary">
            <Icon name="download" :size="25" />
            <div>
              <b>{{ s.selectedRows.length || s.rows.length }} 个选定镜头</b>
              <p>下载采用版本，文件名包含镜头号和素材名称。</p>
            </div>
          </div>
          <div class="download-list">
            <div v-for="n in outputs" :key="n.id">
              <input type="checkbox" checked disabled :aria-label="'下载' + n.name" /><Icon
                :name="n.type === '视频' ? 'video' : 'image'"
              /><span
                >{{ p.row(n.rowId)?.number || '独立素材' }}_{{ n.name
                }}<small>版本1 · {{ n.type }}</small></span
              ><span class="ready-status">可下载</span>
            </div>
            <div
              v-for="row in outputRows.filter(r => !outputs.some(n => p.rowIds(n).includes(r.id)))"
              :key="row.id"
              class="missing-download"
            >
              <Icon name="clock" /><span
                >镜头 {{ row.number }}<small>尚无已采用的生成结果</small></span
              ><span>缺失</span>
            </div>
          </div>
          <label class="checkbox-label"
            ><input v-model="onlyAvailable" type="checkbox" />仅下载当前可用素材，跳过缺失项</label
          >
          <p class="help-copy">
            {{
              p.localDownloads
                ? '本地模拟下载：提供可打开的示例图片、视频、音频；多文件打包为ZIP。文件不代表模型生成结果。'
                : '真实素材下载待正式接入。'
            }}
          </p></template
        ><template v-else-if="kind === 'confirm' || kind === 'delete-session'"
          ><div class="confirmation-art">
            <Icon :name="kind === 'delete-session' ? 'trash' : 'help'" :size="28" />
          </div>
          <p class="confirm-description">
            {{
              kind === 'delete-session'
                ? '仅删除对话记录，画布节点、个人资产和已提交任务会保留。'
                : d.description
            }}
          </p>
          <p v-if="s.error" class="field-error" role="alert">{{ s.error }}</p>
          <p v-if="d.action === 'generate' && !p.isConnected" class="help-copy">
            当前为交互预览，生成状态与结果使用模拟数据。
          </p></template
        ><template v-else-if="['rename-project', 'rename-session', 'new-project'].includes(kind)"
          ><label>{{ kind === 'rename-session' ? '会话名称' : '项目名称' }}</label
          ><input
            v-model="input"
            autofocus
            :placeholder="kind === 'rename-session' ? s.activeSession : s.projectName" /></template
        ><template v-else-if="kind === 'apply'"
          ><div class="asset-apply-preview">
            <Icon :name="d.type === '提示词' ? 'text' : 'image'" /><b>{{ d.name }}</b>
            <p>{{ d.text || '引用当前媒体版本' }}</p>
          </div>
          <label>选择目标节点</label
          ><select v-model="applyNode">
            <option disabled value="">请选择节点</option>
            <option v-for="n in s.nodes.filter(n => n.type !== '脚本')" :key="n.id" :value="n.id">
              {{ n.name }}
            </option>
          </select>
          <p class="help-copy">提示词只应用文本，保留模型、参数和参考媒体。</p></template
        ><template v-else-if="kind === 'asset-detail'"
          ><div v-if="d.type === '提示词'" class="asset-detail-prompt">{{ d.text }}</div>
          <MediaCover v-else :asset="d" />
          <h3>{{ d.name }}</h3>
          <div class="asset-tags">
            <span>{{ d.category }}</span
            ><span v-for="t in d.tags" :key="t">{{ t }}</span>
          </div></template
        ><template v-else-if="kind === 'row-reference'"
          ><span class="eyebrow"
            >镜头 {{ p.row(d.rowId || d.node.rowId)?.number }} · {{ s.projectName }}</span
          >
          <h3>正在引用这一行的内容</h3>
          <p class="reference-full-text">
            {{ d.rowId ? p.rowText(p.row(d.rowId)) : p.referenceText(d.node) }}
          </p>
          <p class="help-copy">
            内容作为来源参考，不会覆盖节点中的手写输入。生成时固定当前版本。
          </p></template
        ><template v-else-if="kind === 'parameters'"
          ><div class="parameter-grid">
            <template v-if="d.node.type !== '音频'"
              ><label
                >比例<select v-model="ratioDraft" aria-label="参数比例">
                  <option>16:9</option>
                  <option>9:16</option>
                  <option>1:1</option>
                  <option>4:3</option>
                </select></label
              ><label
                >画质<select v-model="parameterDraft.quality" aria-label="画质">
                  <option>标准</option>
                  <option>高品质</option>
                </select></label
              ><label
                >清晰度<select v-model="parameterDraft.resolution" aria-label="清晰度">
                  <template v-if="!p.isConnected || d.node.type === '视频'"
                    ><option>720P</option>
                    <option>1080P</option></template
                  ><template v-if="p.isConnected && d.node.type === '图片'"
                    ><option>1K</option>
                    <option>auto</option></template
                  >
                  <option v-if="d.node.type === '图片'">2K</option>
                </select></label
              ></template
            ><template v-if="d.node.type === '图片'"
              ><label
                >背景<select v-model="parameterDraft.background" aria-label="背景">
                  <option>自动</option>
                  <option>纯色</option>
                  <option>透明</option>
                </select></label
              ></template
            ><template v-if="d.node.type === '音频'"
              ><label
                >音色<select v-model="parameterDraft.voice" aria-label="音色">
                  <option>自然女声</option>
                  <option>沉稳男声</option>
                  <option>活力青年</option>
                </select></label
              ><label
                >格式<select v-model="parameterDraft.format" aria-label="格式">
                  <option>MP3</option>
                  <option>WAV</option>
                </select></label
              ><label class="full-parameter"
                >音量 <span>{{ parameterDraft.volume }}%</span
                ><input
                  v-model.number="parameterDraft.volume"
                  aria-label="音量"
                  type="range"
                  min="0"
                  max="100" /></label></template
            ><label v-if="d.node.type !== '图片'"
              >时长<select v-model="parameterDraft.duration" aria-label="时长">
                <option>5秒</option>
                <option>10秒</option>
                <option>15秒</option>
                <option v-if="d.node.type === '音频'">30秒</option>
              </select></label
            ><label
              >生成数量<select v-model.number="parameterDraft.count" aria-label="生成数量">
                <option :value="1">1</option>
                <option :value="2">2</option>
                <option :value="4">4</option>
              </select></label
            >
          </div>
          <p class="help-copy">
            {{
              p.isConnected
                ? '参数由所提供的适配器校验。图片画质、背景及音色作为文字要求；音频时长仅为期望。'
                : '当前为参数交互示意，可选范围待公司模型接口核对。'
            }}保存参数不会自动生成。
          </p></template
        ><template v-else-if="kind === 'optimize'"
          ><label>提示词预览 <span class="optional">可直接编辑</span></label
          ><textarea
            v-model="optimizedPreview"
            rows="7"
            aria-label="优化提示词预览"
            placeholder="节点中输入的提示词将在这里呈现…"
          ></textarea
          ><label>优化要求</label
          ><textarea
            v-model="input"
            rows="4"
            aria-label="提示词优化要求"
            placeholder="例如：让光线更自然，突出产品质感，保留主体和镜头动作…"
          ></textarea
          ><button
            class="secondary-button"
            :disabled="!input.trim() || optimizing"
            title="生成优化提示词"
            @click="optimize()"
          >
            <Icon name="spark" :size="15" />{{ optimizing ? '生成中…' : '生成' }}
          </button>
          <p class="help-copy">
            {{
              p.isConnected ? '将调用真实文本模型优化。' : '当前为模拟优化。'
            }}生成仅更新预览，点击“生成并应用”才替换节点输入；不会发起媒体生成。
          </p></template
        ><template v-else-if="kind === 'tasks'"
          ><div v-if="!s.tasks.length" class="empty-panel">
            <Icon name="clock" :size="30" />
            <h3>还没有生成任务</h3>
            <p>节点发起生成后，会在这里显示进度。</p>
          </div>
          <div v-for="t in s.tasks" :key="t.id" class="task-row">
            <Icon name="image" /><span>{{ t.name }}</span
            ><span>{{ t.status }}</span>
          </div></template
        ><template v-else-if="kind === 'question'"
          ><p>你希望镜头采用哪种视觉风格？</p>
          <div class="style-options">
            <button
              v-for="t in ['自然通透', '电影质感', '极简产品摄影']"
              :key="t"
              :class="{ selected: input === t }"
              @click="input = t"
            >
              <Icon name="spark" />{{ t }}
            </button>
          </div>
          <p class="help-copy">未选择或关闭面板不视为确认。</p></template
        ><template v-else-if="kind === 'feedback'"
          ><label>确认对象版本</label><input v-model="feedback.version" /><label>线下确认结果</label
          ><select v-model="feedback.status">
            <option>待确认</option>
            <option>需修改</option>
            <option>已确认</option></select
          ><label>修改意见</label
          ><textarea
            v-model="feedback.opinion"
            rows="5"
            placeholder="记录需求方在线下提出的修改意见…"
          ></textarea>
          <p class="help-copy">记录不会自动发起返工生成，新版本不继承旧确认结果。</p></template
        ><template v-else-if="kind === 'export'"
          ><p class="help-copy">导出内容预览。当前原型不生成真实 PDF／Excel 文件。</p>
          <div v-if="d.kind === 'excel'" class="table-editor-scroll">
            <table class="script-table">
              <thead>
                <tr>
                  <th v-for="c in s.columns" :key="c">{{ c }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in s.rows" :key="row.id">
                  <td v-for="key in keys" :key="key">{{ row[key] }}</td>
                  <td>
                    {{
                      p
                        .rowImages(row.id)
                        .map(a => a.name)
                        .join('、')
                    }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div v-else class="document-preview">
            <h2>{{ s.projectName }}</h2>
            <p>{{ text || '创作目标与风格正文' }}</p>
          </div></template
        ><template v-else-if="kind === 'projects'"
          ><button
            v-for="name in ['夏日序曲 · 香水新品宣传', '品牌开放日 · 活动预热']"
            :key="name"
            class="project-list-item"
            @click="
              $event => {
                p.openProject(name)
                p.closeModal()
              }
            "
          >
            <Icon name="folder" />{{ name }}<Icon name="arrow" /></button></template
        ><template v-else-if="kind === 'media-preview'"
          ><MediaCover :asset="d" />
          <p class="help-copy">视频播放效果示意，真实预览将在接入生成服务后提供。</p></template
        ><template v-else
          ><div class="guide-steps">
            <div
              v-for="(t, i) in [
                '描述目标，引用参考内容',
                '生成完整分镜表，编辑每个镜头',
                '将分镜行连接图片或视频节点',
                '确认生成范围，下载采用素材',
                '在外部软件剪辑并记录反馈'
              ]"
              :key="t"
            >
              <span>{{ i + 1 }}</span
              >{{ t }}
            </div>
          </div></template
        >
      </div>
      <footer class="modal-footer">
        <span v-if="kind === 'save'" class="footer-note"
          ><Icon name="folder" :size="13" />仅自己可见</span
        ><span v-else class="footer-note"></span
        ><button v-if="kind !== 'script-editor'" class="secondary-button" @click="close('footer')">
          {{
            [
              'guide',
              'tasks',
              'row-reference',
              'media-preview',
              'asset-detail',
              'projects',
              'export'
            ].includes(kind)
              ? '关闭'
              : '取消'
          }}</button
        ><button
          v-if="kind === 'row-assignment'"
          class="primary-button"
          :disabled="s.rows.length > 0 && !selectedRows.length"
          @click="saveRows()"
        >
          确认应用</button
        ><button
          v-else-if="kind === 'reference' && d.confirmImage"
          class="primary-button"
          :disabled="!selectedImages.length"
          @click="saveImages()"
        >
          确认并保存</button
        ><button
          v-else-if="kind === 'reference'"
          class="primary-button"
          :disabled="!selectedReferences.length || s.readonly"
          @click="saveReferences()"
        >
          确定</button
        ><button
          v-else-if="kind === 'script-editor'"
          class="primary-button"
          :disabled="s.readonly"
          @click="saveEditor()"
        >
          确定</button
        ><button
          v-else-if="kind === 'parameters'"
          class="primary-button"
          :disabled="s.readonly"
          @click="saveParams()"
        >
          保存参数</button
        ><button v-else-if="kind === 'save'" class="primary-button" @click="p.saveAsset(form)">
          <Icon name="save" :size="15" />保存资产</button
        ><button
          v-else-if="kind === 'script-input'"
          class="primary-button"
          @click="p.generateScript()"
        >
          <Icon name="spark" :size="15" />生成分镜</button
        ><button v-else-if="kind === 'text-editor'" class="primary-button" @click="saveText()">
          确定</button
        ><button
          v-else-if="kind === 'confirm'"
          class="primary-button"
          :disabled="s.scriptGenerating"
          @click="d.action === 'script' ? p.confirmScriptGeneration() : p.confirm()"
        >
          {{
            s.scriptGenerating ? '生成中…' : d.action === 'script' ? '确定并重新生成' : '确认'
          }}</button
        ><button
          v-else-if="kind === 'delete-session'"
          class="primary-button danger"
          @click="p.deleteSession()"
        >
          确认删除</button
        ><button
          v-else-if="kind === 'apply'"
          class="primary-button"
          :disabled="!applyNode"
          @click="p.applyAsset(d, applyNode)"
        >
          引用</button
        ><button
          v-else-if="kind === 'download'"
          class="primary-button"
          :disabled="
            s.busy ||
            !p.localDownloads ||
            (!onlyAvailable &&
              outputRows.some(r => !outputs.some(n => p.rowIds(n).includes(r.id)))) ||
            !outputs.length
          "
          @click="p.prepareDownload(outputs)"
        >
          {{ s.busy ? '正在准备…' : '准备下载' }}</button
        ><button
          v-else-if="kind === 'rename-project' || kind === 'new-project'"
          class="primary-button"
          :disabled="!input.trim()"
          @click="
            $event => {
              kind === 'new-project' ? p.newProject(input) : (s.projectName = input)
              p.closeModal()
            }
          "
        >
          确定</button
        ><button
          v-else-if="kind === 'rename-session'"
          class="primary-button"
          :disabled="!input.trim()"
          @click="
            $event => {
              p.renameSession(input)
              p.closeModal()
            }
          "
        >
          确定</button
        ><button
          v-else-if="kind === 'question'"
          class="primary-button"
          :disabled="!input"
          @click="
            $event => {
              s.messages.push({ role: 'user', text: '视觉风格：' + input })
              p.closeModal()
            }
          "
        >
          提交选择</button
        ><button
          v-else-if="kind === 'feedback'"
          class="primary-button"
          @click="
            $event => {
              p.notify('已记录线下确认意见（交互预览）')
              p.closeModal()
            }
          "
        >
          保存记录</button
        ><button
          v-else-if="kind === 'optimize'"
          class="primary-button"
          :disabled="optimizing || !optimizedPreview.trim() || s.readonly"
          @click="
            $event => {
              p.setNode(d.node.id, 'prompt', optimizedPreview)
              p.notify('已应用预览提示词')
              p.closeModal()
            }
          "
        >
          生成并应用
        </button>
      </footer>
    </section>
    <div
      v-if="pendingRowDelete"
      class="modal-backdrop row-delete-overlay"
      @click.self="pendingRowDelete = null"
      @keydown.esc.stop="pendingRowDelete = null"
    >
      <section class="modal" role="dialog" aria-modal="true" aria-label="确认删除镜头">
        <header class="modal-header">
          <h2>删除镜头 {{ pendingRowDelete.number }}？</h2>
        </header>
        <div class="modal-content">
          <p>仅删除该行及其连接，下游节点、输入和已有生成结果会保留。</p>
        </div>
        <footer class="modal-footer">
          <span class="footer-note"></span
          ><button class="secondary-button" @click="pendingRowDelete = null">取消</button
          ><button class="primary-button danger" @click="deleteEditorRow()">确定删除</button>
        </footer>
      </section>
    </div>
  </div>
</template>
