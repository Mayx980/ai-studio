<script setup>
import { computed } from 'vue'
import { useCreation } from '@/ports/creation'
const p = useCreation(),
  s = p.state
const placement = computed(() => {
  const anchor = s.panelAnchor || { left: window.innerWidth / 2, bottom: 110 }
  const width = Math.min(620, window.innerWidth - 40)
  return {
    left: Math.max(20, Math.min(anchor.left, window.innerWidth - width - 20)) + 'px',
    top: Math.max(20, Math.min(anchor.bottom + 12, window.innerHeight - 640)) + 'px'
  }
})
</script>
<template>
  <section
    v-if="s.storyPreview && s.storyPreview.projectId === s.projectId"
    class="story-preview-bubble"
    :style="placement"
    role="dialog"
    aria-label="剧情脚本预览"
  >
    <header>
      <b>剧情脚本预览</b
      ><button class="icon-button" aria-label="关闭剧情预览" @click="s.storyPreview = null">
        ×
      </button>
    </header>
    <p>模拟整理结果，可手动编辑。确定后才更新文字节点。</p>
    <textarea v-model="s.storyPreview.text" aria-label="编辑剧情脚本预览"></textarea>
    <footer>
      <button class="secondary-button" @click="s.storyPreview = null">取消</button
      ><button
        class="primary-button"
        :disabled="!s.storyPreview.text.trim() || s.readonly"
        @click="p.confirmTextStory()"
      >
        确定并保存文字节点
      </button>
    </footer>
  </section>
</template>
<style>
.story-preview-bubble {
  position: fixed;
  z-index: 1100;
  left: clamp(20px, 28vw, 550px);
  top: 110px;
  width: min(620px, calc(100vw - 40px));
  max-height: calc(100vh - 135px);
  box-sizing: border-box;
  background: #261e30;
  border: 1px solid #9270b5;
  border-radius: 16px;
  padding: 20px;
  box-shadow: 0 14px 60px #0009;
  display: flex;
  flex-direction: column;
}
.story-preview-bubble header,
.story-preview-bubble footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.story-preview-bubble p {
  color: #b6a4c5;
  font-size: 12px;
}
.story-preview-bubble textarea {
  width: 100%;
  box-sizing: border-box;
  min-height: 160px;
  height: 440px;
  flex-shrink: 1;
  background: #1e1925;
  color: #ededf3;
  border: 1px solid #624c78;
  border-radius: 10px;
  padding: 12px;
  font: 13px/1.8 inherit;
  resize: vertical;
  margin-bottom: 16px;
}
</style>
