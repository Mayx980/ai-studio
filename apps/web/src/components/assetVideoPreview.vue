<template>
  <span class="assetVideoPreview" @mouseenter="play" @mouseleave="stop">
    <video ref="player" :src="src" muted playsinline loop preload="metadata" @loadedmetadata="readDuration" />
    <span v-if="duration" class="videoDuration">{{ durationLabel }}</span>
  </span>
</template>
<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
const props = defineProps<{ src?: string }>();
const player = ref<HTMLVideoElement>();
const duration = ref(0);
let hovered = false;
const durationLabel = computed(() => {
  const seconds = Math.floor(duration.value);
  return `${Math.floor(seconds / 60).toString().padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;
});
function readDuration() { const value = player.value?.duration; duration.value = value && Number.isFinite(value) ? value : 0; }
function play() {
  hovered = true;
  const video = player.value;
  if (video) void video.play().then(() => { if (!hovered) video.pause(); }).catch(() => {});
}
function stop() { hovered = false; const video = player.value; if (video) { video.pause(); if (video.readyState > 0) video.currentTime = 0; } }
watch(() => props.src, () => { stop(); duration.value = 0; });
onBeforeUnmount(stop);
</script>
<style scoped lang="scss">
.assetVideoPreview { display: block; position: relative; width: 100%; height: 100%; overflow: hidden;
  video { display: block; width: 100%; height: 100%; object-fit: cover; }
  .videoDuration { position: absolute; left: 8px; bottom: 8px; padding: 2px 4px; border-radius: 3px; background: #0006; color: #fff; font: 400 12px/16px Arial, sans-serif; pointer-events: none; }
  &:hover .videoDuration { opacity: 0; }
}
</style>
