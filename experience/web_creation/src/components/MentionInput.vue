<script setup>
import { computed, ref, nextTick, onMounted, onUnmounted, watch } from 'vue'
import { useCreation } from '../ports/creation'
import Icon from './CreationIcon.vue'
import MediaCover from './MediaCover.vue'
const props = defineProps({
  modelValue: { type: String, default: '' },
  nodeId: String,
  label: String,
  placeholder: String,
  disabled: Boolean
})
const selected = ref([])
const emit = defineEmits(['update:modelValue']),
  p = useCreation(),
  s = p.state,
  textarea = ref(null),
  richInput = ref(null),
  open = ref(false),
  query = ref(''),
  category = ref(''),
  position = ref({ left: 0, top: 0 })
let start = -1,
  end = 0
const node = computed(() => s.nodes.find(n => n.id === props.nodeId)),
  referenced = computed(() => (node.value ? p.inputReferences(node.value) : [])),
  imageOnly = computed(() => ['图片', '视频'].includes(node.value?.type)),
  referencedImages = computed(() => (node.value ? p.referenceImages(node.value) : []))
const categories = [
  ['图片', 'image'],
  ['视频', 'video'],
  ['音频', 'audio'],
  ['文本', 'text'],
  ['资产', 'grid']
]
const candidates = computed(() => {
  if (imageOnly.value)
    return referencedImages.value.filter(
      a => !query.value || a.name.toLowerCase().includes(query.value.toLowerCase())
    )
  const list = !category.value
    ? [...p.materials(), ...s.assets]
    : category.value === '资产'
      ? s.assets
      : p
          .materials()
          .filter(a =>
            category.value === '文本'
              ? ['文字', '文档', '提示词'].includes(a.type)
              : a.type === category.value
          )
  return list.filter(
    a =>
      a.sourceNodeId !== props.nodeId &&
      (!query.value || a.name.toLowerCase().includes(query.value.toLowerCase()))
  )
})
function editorText(root) {
  let value = ''
  for (const child of root.childNodes) {
    if (child.nodeType === 3) value += child.textContent
    else if (child.dataset?.mentionName) value += '@' + child.dataset.mentionName
    else if (child.nodeName === 'BR') value += '\n'
    else {
      if (child.nodeName === 'DIV' && value && !value.endsWith('\n')) value += '\n'
      value += editorText(child)
    }
  }
  return value
}
function richCaret() {
  const selection = window.getSelection(),
    root = richInput.value
  if (!selection?.rangeCount || !root?.contains(selection.focusNode)) return props.modelValue.length
  const range = selection.getRangeAt(0).cloneRange()
  range.selectNodeContents(root)
  range.setEnd(selection.focusNode, selection.focusOffset)
  return editorText(range.cloneContents()).length
}
function setRichCaret(offset) {
  const root = richInput.value
  if (!root) return
  const range = document.createRange()
  let remaining = offset,
    found = false
  for (const child of root.childNodes) {
    const length =
      child.nodeType === 3
        ? child.textContent.length
        : child.dataset?.mentionName
          ? child.dataset.mentionName.length + 1
          : editorText(child).length
    if (remaining <= length) {
      if (child.nodeType === 3) range.setStart(child, remaining)
      else range.setStartAfter(child)
      found = true
      break
    }
    remaining -= length
  }
  if (!found) {
    range.selectNodeContents(root)
    range.collapse(false)
  }
  range.collapse(true)
  const selection = window.getSelection()
  selection.removeAllRanges()
  selection.addRange(range)
}
let lastImages = ''
function renderRich() {
  const root = richInput.value
  if (!root || !imageOnly.value) return
  const images = referencedImages.value,
    signature = images.map(a => (a.sourceNodeId || a.id) + ':' + a.version + ':' + a.name).join('|')
  if (editorText(root) === props.modelValue && lastImages === signature) return
  const focused = document.activeElement === root,
    offset = focused ? richCaret() : 0
  lastImages = signature
  root.replaceChildren()
  let rest = props.modelValue
  while (rest) {
    let match = null,
      index = Infinity
    for (const asset of images) {
      const at = rest.indexOf('@' + asset.name)
      if (
        at >= 0 &&
        (at < index || (at === index && asset.name.length > (match?.name.length || 0)))
      ) {
        match = asset
        index = at
      }
    }
    if (!match) {
      root.append(document.createTextNode(rest))
      break
    }
    if (index) root.append(document.createTextNode(rest.slice(0, index)))
    const token = document.createElement('span')
    token.contentEditable = 'false'
    token.className = 'inline-image-mention'
    token.dataset.mentionName = match.name
    token.append(document.createTextNode('@'))
    if (match.mediaUrl || match.poster) {
      const img = document.createElement('img')
      img.src = match.poster || match.mediaUrl
      img.alt = ''
      token.append(img)
    } else {
      const icon = document.createElement('span')
      icon.className = 'mention-image-placeholder'
      icon.textContent = '图'
      icon.setAttribute('aria-hidden', 'true')
      token.append(icon)
    }
    token.append(document.createTextNode(match.name))
    root.append(token)
    rest = rest.slice(index + match.name.length + 1)
  }
  if (focused) setRichCaret(offset)
}
function richChanged() {
  input({ target: { value: editorText(richInput.value), selectionStart: richCaret() } })
}
function pasteText(event) {
  event.preventDefault()
  document.execCommand('insertText', false, event.clipboardData.getData('text/plain'))
}
watch(
  () => [props.modelValue, referencedImages.value],
  () => nextTick(renderRich),
  { deep: true, flush: 'post' }
)
function locate() {
  if (!open.value) return
  const b = (richInput.value || textarea.value)?.getBoundingClientRect()
  if (!b) return
  position.value = {
    left: Math.max(8, Math.min(b.left, window.innerWidth - 318)),
    top: Math.max(8, Math.min(b.bottom + 5, window.innerHeight - 460))
  }
}
function input(e) {
  const value = e.target.value
  emit('update:modelValue', value)
  end = e.target.selectionStart
  const before = value.slice(0, end),
    match = before.match(/@([^@\s]*)$/)
  if (match && !(match[1] && match[1].trimEnd() !== match[1])) {
    if (!open.value) {
      category.value = ''
      selected.value = []
    }
    start = end - match[0].length
    query.value = match[1]
    open.value = true
    locate()
  } else open.value = false
}
function select(asset) {
  const i = selected.value.findIndex(a => a.id === asset.id)
  if (i < 0) selected.value.push(asset)
  else selected.value.splice(i, 1)
}
function confirmSelection() {
  if (!props.nodeId || !selected.value.length) return
  const target = s.nodes.find(n => n.id === props.nodeId)
  if (!target || props.disabled) return
  if (imageOnly.value) {
    const current = p.referenceImages(target)
    const images = selected.value.filter(a =>
      current.some(x =>
        x.sourceNodeId
          ? x.sourceNodeId === a.sourceNodeId && x.version === a.version
          : x.id === a.id && x.version === a.version
      )
    )
    if (!images.length) {
      open.value = false
      return
    }
    const tokens = images.map(a => '@' + a.name).join(' ') + ' '
    emit(
      'update:modelValue',
      props.modelValue.slice(0, start) + tokens + props.modelValue.slice(end)
    )
    start += tokens.length
  } else {
    const pictures = selected.value.filter(a => a.type === '图片')
    for (const a of selected.value.filter(a => !(target?.type === '脚本' && a.type === '图片')))
      p.attachReference(a, props.nodeId)
    if (target?.type === '脚本' && pictures.length)
      p.openModal('row-assignment', { asset: pictures[0], assets: pictures, targetId: target.id })
    emit('update:modelValue', props.modelValue.slice(0, start) + props.modelValue.slice(end))
  }
  open.value = false
  nextTick(() => {
    if (imageOnly.value) {
      renderRich()
      richInput.value?.focus()
      setRichCaret(start)
    } else {
      textarea.value?.focus()
      textarea.value?.setSelectionRange(start, start)
    }
  })
}
function close(e) {
  if (e.type === 'keydown') {
    if (e.key === 'Escape') open.value = false
    return
  }
  if (
    !e.target.closest('.mention-panel') &&
    e.target !== textarea.value &&
    !richInput.value?.contains(e.target)
  )
    open.value = false
}
function keys(e) {
  if (!open.value) return
  if (e.key === 'Escape') {
    e.stopPropagation()
    open.value = false
  }
  if (e.key === 'Enter') {
    e.preventDefault()
    if (candidates.value[0] && (imageOnly.value || category.value || query.value))
      select(candidates.value[0])
  }
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    nextTick(() => document.querySelector('.mention-panel button')?.focus())
  }
}
onMounted(() => {
  nextTick(renderRich)
  document.addEventListener('pointerdown', close)
  document.addEventListener('focusin', close)
  document.addEventListener('keydown', close)
  window.addEventListener('resize', locate)
  document.addEventListener('scroll', locate, true)
})
onUnmounted(() => {
  document.removeEventListener('pointerdown', close)
  document.removeEventListener('focusin', close)
  document.removeEventListener('keydown', close)
  window.removeEventListener('resize', locate)
  document.removeEventListener('scroll', locate, true)
})
</script>
<template>
  <div
    v-if="imageOnly"
    ref="richInput"
    class="media-mention-editor"
    :contenteditable="!disabled"
    role="textbox"
    aria-multiline="true"
    :aria-label="label"
    :aria-disabled="disabled"
    :data-placeholder="placeholder"
    @input="richChanged"
    @keydown="keys"
    @paste="pasteText"
    @pointerdown.stop
  ></div>
  <textarea
    v-else
    ref="textarea"
    :value="modelValue"
    :aria-label="label"
    :placeholder="placeholder"
    :disabled="disabled"
    @input="input"
    @keydown="keys"
  ></textarea
  ><Teleport to="body"
    ><section
      v-if="open"
      class="mention-panel"
      role="dialog"
      aria-label="选择引用内容"
      :style="{ left: position.left + 'px', top: position.top + 'px' }"
      @keydown.esc.stop="open = false"
    >
      <label class="mention-search"
        ><Icon name="search" :size="17" /><input
          v-model="query"
          aria-label="搜索引用"
          placeholder="搜索"
          autofocus
      /></label>
      <div v-if="imageOnly" class="mention-group">
        <span>已引用的图片</span
        ><button
          v-for="a in candidates"
          :key="a.sourceNodeId || a.id"
          :aria-label="a.name"
          :aria-pressed="selected.some(x => x.id === a.id)"
          @click="select(a)"
        >
          <span class="mention-thumb"><MediaCover :asset="a" /></span>{{ a.name }}
        </button>
        <p v-if="!candidates.length" class="mention-empty">
          暂无已引用图片，请先通过引用按钮添加。
        </p>
      </div>
      <div v-if="!imageOnly && query && !category" class="mention-group">
        <span>搜索结果</span
        ><button
          v-for="a in candidates"
          :key="a.id"
          :aria-label="a.name"
          :aria-pressed="selected.some(x => x.id === a.id)"
          @click="select(a)"
        >
          <span class="mention-thumb"><MediaCover :asset="a" /></span>{{ a.name }}
        </button>
        <p v-if="!candidates.length" class="mention-empty">暂无匹配内容</p>
      </div>
      <div v-if="!imageOnly && !category" class="mention-group">
        <span>已引用</span
        ><button
          v-for="a in referenced.filter(a => !query || a.name.includes(query))"
          :key="a.key"
          :aria-label="a.name"
          :aria-pressed="selected.some(x => x.id === a.id)"
          @click="select(a)"
        >
          <span class="mention-thumb"><MediaCover :asset="a" /></span>{{ a.name
          }}<Icon name="check" :size="13" />
        </button>
        <p v-if="!referenced.length" class="mention-empty">尚无引用</p>
        <span>素材引用</span
        ><button v-for="[label, icon] in categories" :key="label" @click="category = label">
          <Icon :name="icon" :size="19" />{{ label }}<Icon name="arrow" :size="15" />
        </button>
      </div>
      <div v-else-if="!imageOnly" class="mention-group">
        <button class="mention-back" @click="category = ''">
          ‹ 返回分类 <small>{{ category }}</small></button
        ><button
          v-for="a in candidates"
          :key="a.id"
          :aria-label="a.name"
          :aria-pressed="selected.some(x => x.id === a.id)"
          @click="select(a)"
        >
          <span class="mention-thumb"><MediaCover :asset="a" /></span>{{ a.name }}
        </button>
        <p v-if="!candidates.length" class="mention-empty">暂无匹配内容</p>
      </div>
      <div class="mention-confirm">
        <span>已选 {{ selected.length }} 项</span
        ><button class="primary-button" :disabled="!selected.length" @click="confirmSelection">
          确定
        </button>
      </div>
    </section></Teleport
  >
</template>

<style>
.media-mention-editor {
  min-height: 75px;
  max-height: 260px;
  overflow: auto;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  outline: none;
  font: inherit;
  line-height: 1.9;
  color: inherit;
  user-select: text;
  padding: 7px 2px;
}
.media-mention-editor:empty:before {
  content: attr(data-placeholder);
  color: #81778a;
  pointer-events: none;
}
.inline-image-mention {
  display: inline-flex;
  align-items: center;
  vertical-align: middle;
  gap: 4px;
  background: #443052;
  border: 1px solid #7c5e93;
  border-radius: 5px;
  padding: 1px 5px;
  margin: 0 2px;
  font-size: 10px;
  line-height: 22px;
  user-select: all;
}
.inline-image-mention img {
  width: 23px;
  height: 23px;
  object-fit: cover;
  border-radius: 3px;
}
.mention-image-placeholder {
  width: 22px;
  height: 22px;
  background: #775c89;
  text-align: center;
  border-radius: 3px;
}
</style>
