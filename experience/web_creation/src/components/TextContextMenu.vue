<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { useCreation } from '../ports/creation'
const p = useCreation(),
  menu = ref(null)
let buffer = ''
function context(e) {
  const target = e.target.closest(
    'textarea,input:not([type=checkbox]):not([type=range]),[contenteditable=true]'
  )
  const selection = window.getSelection()
  const selected =
    target?.value !== undefined
      ? target.value.slice(target.selectionStart || 0, target.selectionEnd || 0)
      : selection?.toString()
  if (!target && !selected) return
  e.preventDefault()
  e.stopImmediatePropagation()
  menu.value = {
    x: Math.min(e.clientX, window.innerWidth - 175),
    y: Math.min(e.clientY, window.innerHeight - 145),
    target,
    start: target?.selectionStart,
    end: target?.selectionEnd,
    text: selected || '',
    range: selection?.rangeCount ? selection.getRangeAt(0).cloneRange() : null
  }
}
function close(e) {
  if (e.type === 'keydown' && e.key !== 'Escape') return
  if (e.type === 'pointerdown' && e.target.closest('.text-context-menu')) return
  menu.value = null
}
function replace(text) {
  const m = menu.value,
    t = m?.target
  if (!t || t.readOnly || t.disabled) return
  if (t.value !== undefined) {
    t.focus()
    t.setRangeText(text, m.start, m.end, 'end')
    t.dispatchEvent(new Event('input', { bubbles: true }))
  } else if (m.range) {
    m.range.deleteContents()
    m.range.insertNode(document.createTextNode(text))
    t.dispatchEvent(new Event('input', { bubbles: true }))
  }
}
async function action(type) {
  const m = menu.value
  if (!m) return
  try {
    if (type === 'paste') {
      let text = buffer
      try {
        text = await navigator.clipboard.readText()
      } catch {
        if (!text) {
          p.notify('浏览器未开放剪贴板读取，请按 Ctrl/Cmd+V 粘贴')
          menu.value = null
          return
        }
      }
      replace(text)
    } else {
      buffer = m.text
      let copied = false
      try {
        await navigator.clipboard.writeText(buffer)
        copied = true
      } catch {
        p.notify('已复制到原型内部剪贴板；系统复制可按 Ctrl/Cmd+C')
      }
      if (type === 'cut' && m.target) replace('')
      if (copied) p.notify(type === 'cut' ? '已剪切' : '已复制')
    }
    menu.value = null
  } catch {
    p.notify('操作未完成，请使用系统快捷键')
    menu.value = null
  }
}
onMounted(() => {
  document.addEventListener('contextmenu', context, true)
  document.addEventListener('pointerdown', close)
  document.addEventListener('keydown', close)
})
onUnmounted(() => {
  document.removeEventListener('contextmenu', context, true)
  document.removeEventListener('pointerdown', close)
  document.removeEventListener('keydown', close)
})
</script>
<template>
  <div
    v-if="menu"
    class="canvas-context-menu text-context-menu"
    :style="{ left: menu.x + 'px', top: menu.y + 'px' }"
    role="menu"
    @pointerdown.prevent
  >
    <button role="menuitem" :disabled="!menu.text" @click="action('copy')">
      复制 <small>Ctrl/Cmd+C</small></button
    ><button
      role="menuitem"
      :disabled="!menu.text || !menu.target || menu.target.readOnly || menu.target.disabled"
      @click="action('cut')"
    >
      剪切 <small>Ctrl/Cmd+X</small></button
    ><button
      role="menuitem"
      :disabled="!menu.target || menu.target.readOnly || menu.target.disabled"
      @click="action('paste')"
    >
      粘贴 <small>Ctrl/Cmd+V</small>
    </button>
  </div>
</template>
