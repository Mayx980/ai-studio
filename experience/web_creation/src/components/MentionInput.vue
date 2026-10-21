<script setup>
import { computed, ref, nextTick, onMounted, onUnmounted } from 'vue'
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
  open = ref(false),
  query = ref(''),
  category = ref(''),
  position = ref({ left: 0, top: 0 })
let start = -1,
  end = 0
const node = computed(() => s.nodes.find(n => n.id === props.nodeId)),
  referenced = computed(() => (node.value ? p.inputReferences(node.value) : []))
const categories = [
  ['图片', 'image'],
  ['视频', 'video'],
  ['音频', 'audio'],
  ['文本', 'text'],
  ['资产', 'grid']
]
const candidates = computed(() => {
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
function locate() {
  if (!open.value) return
  const b = textarea.value?.getBoundingClientRect()
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
    match = before.match(/@([^@\n]*)$/)
  if (match) {
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
  const target = s.nodes.find(n => n.id === props.nodeId),
    pictures = selected.value.filter(a => a.type === '图片')
  for (const a of selected.value.filter(a => !(target?.type === '脚本' && a.type === '图片')))
    p.attachReference(a, props.nodeId)
  if (target?.type === '脚本' && pictures.length)
    p.openModal('row-assignment', { asset: pictures[0], assets: pictures, targetId: target.id })
  emit('update:modelValue', props.modelValue.slice(0, start) + props.modelValue.slice(end))
  open.value = false
  nextTick(() => {
    textarea.value?.focus()
    textarea.value?.setSelectionRange(start, start)
  })
}
function close(e) {
  if (e.type === 'keydown') {
    if (e.key === 'Escape') open.value = false
    return
  }
  if (!e.target.closest('.mention-panel') && e.target !== textarea.value) open.value = false
}
function keys(e) {
  if (!open.value) return
  if (e.key === 'Escape') {
    e.stopPropagation()
    open.value = false
  }
  if (e.key === 'Enter') {
    e.preventDefault()
    if (candidates.value[0] && (category.value || query.value)) select(candidates.value[0])
  }
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    nextTick(() => document.querySelector('.mention-panel button')?.focus())
  }
}
onMounted(() => {
  document.addEventListener('pointerdown', close)
  document.addEventListener('keydown', close)
  window.addEventListener('resize', locate)
  document.addEventListener('scroll', locate, true)
})
onUnmounted(() => {
  document.removeEventListener('pointerdown', close)
  document.removeEventListener('keydown', close)
  window.removeEventListener('resize', locate)
  document.removeEventListener('scroll', locate, true)
})
</script>
<template>
  <textarea
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
      <div v-if="query && !category" class="mention-group">
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
      <div v-if="!category" class="mention-group">
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
      <div v-else class="mention-group">
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
