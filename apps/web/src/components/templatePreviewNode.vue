<template>
  <article class="templatePreviewNode" :class="{ selected }">
    <handle id="in" type="target" :position="Position.Left" :connectable="false" />
    <header>{{ data.label }}</header>
    <div v-if="data.media.length" class="nodeMedia"><template v-for="media in data.media" :key="media.url"><img v-if="media.mimeType.startsWith('image/')" :src="media.url" :alt="data.label" draggable="false" /><video v-else-if="media.mimeType.startsWith('video/')" :src="media.url" muted playsinline preload="metadata" /><audio v-else :src="media.url" controls class="nodrag nopan" /></template></div>
    <p v-else-if="data.text">{{ data.text.slice(0, 240) }}</p>
    <handle id="out" type="source" :position="Position.Right" :connectable="false" />
  </article>
</template>
<script setup lang="ts">
import { Handle, Position } from "@vue-flow/core";
defineProps<{ data: { label: string; text: string; media: { url: string; mimeType: string }[] }; selected?: boolean }>();
</script>
<style scoped lang="scss">
.templatePreviewNode { overflow: hidden; border: 1px solid #494d55; border-radius: 12px; background: #23262c; color: #e5eaf3; box-shadow: 0 6px 24px #0003; &.selected { border-color: var(--el-color-primary); } header { padding: 12px; font-size: 14px; font-weight: 600; } p { padding: 0 12px 12px; margin: 0; white-space: pre-wrap; line-height: 1.7; font-size: 13px; } .nodeMedia { display: grid; gap: 6px; padding: 0 8px 8px; img, video { display: block; width: 100%; height: 190px; object-fit: contain; background: #141414; border-radius: 6px; } audio { width: 100%; } } }
</style>
