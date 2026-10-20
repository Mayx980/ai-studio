<script setup>
import MediaCover from './MediaCover.vue'
defineProps({
  asset: { type: Object, required: true },
  removable: { type: Boolean, default: true }
})
defineEmits(['remove', 'open'])
</script>
<template>
  <span class="reference-chip" :title="asset.text || asset.name"
    ><button
      class="reference-chip-open"
      :aria-label="'查看引用' + asset.name"
      @click.stop="$emit('open', asset)"
    >
      <span class="reference-chip-cover"><MediaCover :asset="asset" /></span
      ><span class="reference-chip-name">{{ asset.name }}</span
      ><small v-if="asset.pending">待就绪</small></button
    ><button
      v-if="removable"
      class="reference-chip-remove"
      :aria-label="'取消引用' + asset.name"
      title="取消引用"
      @click.stop="$emit('remove', asset)"
    >
      ×
    </button></span
  >
</template>
