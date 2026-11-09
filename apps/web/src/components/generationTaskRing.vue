<template>
  <span class="generationTaskRing" :class="{ paused: !active }" :style="{ width: `${size}px`, height: `${size}px` }" role="img" :aria-label="active ? '生成任务进行中' : '生成任务入口'">
    <svg viewBox="0 0 44 44" fill="none" aria-hidden="true"><circle class="outerRing" cx="22" cy="22" r="19" /><circle class="innerTrack" cx="22" cy="22" r="7" /><circle class="innerArc" cx="22" cy="22" r="7" /></svg>
  </span>
</template>
<script setup lang="ts">
withDefaults(defineProps<{ size?: number; active?: boolean }>(), { size: 24, active: true });
</script>
<style scoped lang="scss">
.generationTaskRing { display: inline-flex; flex: none; color: #ab8aff;
  svg { width: 100%; height: 100%; }
  circle { stroke: currentColor; stroke-width: 2; }
  &.paused .innerArc { animation-play-state: paused; }
  .innerTrack { opacity: .3; stroke-width: 1.5; }
  .innerArc { stroke-width: 1.5; stroke-linecap: round; stroke-dasharray: 29 15; transform-origin: 22px 22px; animation: taskRingRotate 1.2s linear infinite; }
}
@keyframes taskRingRotate { to { transform: rotate(360deg); } }
@media(prefers-reduced-motion:reduce) { .generationTaskRing .innerArc { animation: none; } }
</style>
