<script setup>
import { ref, watch } from 'vue'
import ProductScene from './ProductScene.vue'
import Icon from './CreationIcon.vue'
const props = defineProps({ asset: { type: Object, required: true } }),
  failed = ref(false)
watch(
  () => props.asset.mediaUrl,
  () => (failed.value = false)
)
function firstFrame(e) {
  const video = e.target
  if (Number.isFinite(video.duration) && video.duration > 0)
    video.currentTime = Math.min(0.05, video.duration / 2)
}
</script>
<template>
  <div class="media-cover">
    <template v-if="asset.mediaUrl && !failed"
      ><video
        v-if="asset.type === '视频'"
        :src="asset.mediaUrl"
        :poster="asset.poster"
        muted
        playsinline
        preload="auto"
        @loadedmetadata="firstFrame"
        @error="failed = true" /><audio
        v-else-if="asset.type === '音频'"
        :src="asset.mediaUrl"
        controls
        preload="metadata" /><img
        v-else
        :src="asset.mediaUrl"
        :alt="asset.name || '参考图片'"
        @error="failed = true" /></template
    ><span v-else-if="failed" class="cover-failed"
      ><Icon name="image" :size="22" />封面暂不可用</span
    ><Icon
      v-else-if="['音频', '文字', '文档', '提示词'].includes(asset.type)"
      :name="asset.type === '音频' ? 'audio' : 'text'"
      :size="25"
    /><ProductScene v-else :variant="asset.scene || 'amber'" />
  </div>
</template>
