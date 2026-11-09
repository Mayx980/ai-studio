<template>
  <span class="generationTaskRing" :class="[status, { indeterminate: status === 'generating' && percent === undefined }]" :style="{ width: `${size}px`, height: `${size}px`, fontSize: `${size * .28}px` }" role="img" :aria-label="label">
    <svg class="progressRing" viewBox="0 0 44 44" fill="none" aria-hidden="true"><circle class="ringTrack" cx="22" cy="22" r="19" /><circle class="progressArc" cx="22" cy="22" r="19" pathLength="100" :stroke-dasharray="`${arcLength} 100`" /></svg>
    <span v-if="status === 'generating' && percent !== undefined" class="progressValue">{{ percent }}%</span>
    <component v-else :is="statusIcon" class="stateIcon" :size="Math.round(size * .38)" aria-hidden="true" />
  </span>
</template>
<script setup lang="ts">
import { computed } from "vue";
import { IconCheck, IconExclamationMark, IconClock, IconPhoto, IconVideo, IconPlayerPause } from "@tabler/icons-vue";
const props = withDefaults(defineProps<{ size?: number; status?: "idle" | "queued" | "generating" | "completed" | "failed" | "paused"; kind?: "image" | "video"; progress?: number }>(), { size: 24, status: "generating", kind: "video" });
const percent = computed(() => typeof props.progress === "number" && Number.isFinite(props.progress) && props.progress >= 0 && props.progress <= 100 ? Math.round(props.progress) : undefined);
const arcLength = computed(() => props.status === "completed" || props.status === "failed" ? 100 : props.status === "generating" ? percent.value ?? 70 : props.status === "queued" ? 22 : 0);
const statusIcon = computed(() => props.status === "completed" ? IconCheck : props.status === "failed" ? IconExclamationMark : props.status === "queued" ? IconClock : props.status === "paused" ? IconPlayerPause : props.kind === "image" ? IconPhoto : IconVideo);
const label = computed(() => ({ idle: "继续生成对话", queued: "等待生成", generating: percent.value === undefined ? "正在生成" : `正在生成 ${percent.value}%`, completed: "生成完成", failed: "生成失败", paused: "已暂停" })[props.status]);
</script>
<style scoped lang="scss">
.generationTaskRing { position: relative; display: inline-flex; flex: none; color: #ab8aff;
  .progressRing { width: 100%; height: 100%; overflow: visible; }
  circle { stroke: currentColor; stroke-width: 2.5; }
  .ringTrack { color: #51465e; opacity: .5; }
  .progressArc { stroke-linecap: round; transform: rotate(-90deg); transform-origin: 22px 22px; transition: stroke-dasharray 180ms ease; }
  .stateIcon, .progressValue { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); }
  .progressValue { font-size: inherit; font-weight: 500; white-space: nowrap; }
  &.indeterminate .progressArc { animation: taskRingRotate 1.4s linear infinite; }
  &.completed { color: #58d3a1; }
  &.failed { color: #f56c6c; }
  &.idle, &.paused { color: #9184ab; .progressArc { opacity: 0; } }
}
@keyframes taskRingRotate { from { transform: rotate(-90deg); } to { transform: rotate(270deg); } }
@media(prefers-reduced-motion:reduce) { .generationTaskRing .progressArc { animation: none !important; transition: none; } }
</style>
