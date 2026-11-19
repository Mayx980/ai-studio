<template>
  <div class="videoReferenceClip">
    <video v-if="url" class="metadataVideo" :src="url" preload="metadata" @loadedmetadata="readDuration" @error="loadError = '视频时长读取失败，请替换视频'" />
    <span v-if="loadError" class="clipError" role="alert">{{ loadError }}</span>
    <span v-else-if="!clip" role="status">正在读取视频时长…</span>
    <template v-else>
      <span>{{ motion ? '动作参考' : '参考片段' }} · {{ time(clip.start) }}–{{ time(clip.end) }}</span>
      <small v-if="motion && durations?.length">跟随动作视频 · 生成 {{ clip.outputDuration }} 秒</small><small v-else-if="motion">参考视频 {{ clip.duration.toFixed(1) }} 秒 · 待选择动作模型</small>
      <small v-if="(!motion || durations?.length) && clip.duration < clip.outputDuration">参考视频短于生成时长，剩余内容由模型生成，不循环或加速。</small>
      <small v-else-if="motion && durations?.length && clip.duration > clip.outputDuration">按模型支持时长默认选取开头片段，不加速动作。</small>
      <button type="button" :disabled="disabled || motion && !durations?.length" :title="motion && !durations?.length ? '请先配置支持动作模仿的模型' : undefined" @click="openClip">调整片段</button>
    </template>
    <el-dialog v-model="opened" title="选择参考片段" width="min(560px, 94vw)" appendToBody :closeOnClickModal="false" @closed="player?.pause()">
      <div class="clipEditor">
        <video ref="player" :src="url" controls playsinline preload="metadata" @timeupdate="loopSelection" @play="startSelection" />
        <template v-if="clip">
          <p>生成 {{ clip.outputDuration }} 秒 · 参考 {{ time(start) }}–{{ time(end) }}</p>
          <el-slider v-model="start" :min="0" :max="maxStart" :step="0.1" :disabled="disabled || maxStart === 0" aria-label="参考片段起点" :formatTooltip="time" @change="seekSelection" />
          <label>开始时间（秒）<el-input-number v-model="start" :min="0" :max="maxStart" :step="0.1" :precision="1" :valueOnClear="0" controlsPosition="right" @change="seekSelection" /></label>
          <small>拖动起点选择连续片段，长度随生成时长固定。播放仅循环当前片段。</small>
        </template>
      </div>
      <template #footer><el-button @click="opened = false">取消</el-button><el-button type="primary" :disabled="disabled || !clip" @click="confirmClip">确认片段</el-button></template>
    </el-dialog>
  </div>
</template>
<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import type { AgentAttachment } from "@/components/agent/types";
import useWorkspaceFiles from "@/lib/workspaceFiles";
const props = defineProps<{ attachment: AgentAttachment; directory?: string; duration: number; durations?: number[]; motion?: boolean; disabled?: boolean }>();
const url = ref(""), loadError = ref(""), opened = ref(false), start = ref(0), player = ref<HTMLVideoElement>();
const clip = computed(() => props.attachment.videoClip);
const outputDuration = computed(() => {
  if (!props.motion) return props.duration;
  const target = Math.ceil(clip.value?.duration ?? props.duration);
  return props.durations?.find(value => value >= target) ?? props.durations?.at(-1) ?? target;
});
const maxStart = computed(() => Math.max(0, (clip.value?.duration ?? 0) - outputDuration.value));
const end = computed(() => Math.min(clip.value?.duration ?? 0, start.value + outputDuration.value));
function time(value: number) { return `${String(Math.floor(value / 60)).padStart(2, "0")}:${(value % 60).toFixed(1).padStart(4, "0")}`; }
function readDuration(event: Event) {
  const duration = (event.target as HTMLVideoElement).duration;
  if (!Number.isFinite(duration) || duration <= 0) { loadError.value = "无法读取有效视频时长，请替换视频"; return; }
  const previous = clip.value;
  props.attachment.videoClip = { duration, start: previous?.start ?? 0, end: previous?.end ?? Math.min(duration, outputDuration.value), outputDuration: outputDuration.value };
  updateRange();
}
function updateRange() {
  if (!clip.value) return;
  const nextStart = Math.min(clip.value.start, maxStart.value);
  props.attachment.videoClip = { duration: clip.value.duration, start: nextStart, end: Math.min(clip.value.duration, nextStart + outputDuration.value), outputDuration: outputDuration.value };
  start.value = nextStart;
}
watch(outputDuration, updateRange);
function openClip() { start.value = clip.value?.start ?? 0; opened.value = true; }
function seekSelection() { if (player.value) player.value.currentTime = start.value; }
function startSelection() { if (player.value && (player.value.currentTime < start.value || player.value.currentTime >= end.value)) seekSelection(); }
function loopSelection() { if (player.value && !player.value.paused && player.value.currentTime >= end.value - 0.03) seekSelection(); }
function confirmClip() {
  if (!clip.value || !Number.isFinite(start.value)) return;
  props.attachment.videoClip = { ...clip.value, start: start.value, end: end.value, outputDuration: outputDuration.value };
  opened.value = false;
}
watch(() => [props.attachment.file, props.attachment.path, props.directory] as const, async ([file, path, directory], _, onCleanup) => {
  let cancelled = false, objectUrl = "";
  onCleanup(() => { cancelled = true; if (objectUrl) URL.revokeObjectURL(objectUrl); });
  url.value = ""; loadError.value = "";
  try {
    if (!file && (!path || !directory)) throw new Error("视频文件不可用，请重新添加");
    const blob = file ?? new Blob([await useWorkspaceFiles(directory!).read(path)], { type: props.attachment.mimeType });
    if (!cancelled) { objectUrl = URL.createObjectURL(blob); url.value = objectUrl; }
  } catch (error) { if (!cancelled) loadError.value = error instanceof Error ? error.message : "读取视频失败"; }
}, { immediate: true });
onBeforeUnmount(() => player.value?.pause());
</script>
<style scoped lang="scss">
.videoReferenceClip { display: flex; flex-direction: column; gap: 5px; width: 180px; padding-top: 8px; font-size: 11px; line-height: 1.5; color: var(--el-text-color-secondary);
  .metadataVideo { display: none; }
  small { font-size: 11px; }
  button { align-self: flex-start; border: 0; padding: 2px 0; color: var(--el-color-primary); background: transparent; cursor: pointer; &:focus-visible { outline: 1px solid currentColor; } &:disabled { color: var(--el-text-color-secondary); cursor: not-allowed; } }
  .clipError { color: var(--el-color-danger); }
}
.clipEditor { display: flex; flex-direction: column; gap: 12px;
  video { width: 100%; max-height: 300px; background: #000; border-radius: 10px; }
  p { margin: 0; }
  label { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
  small { color: var(--el-text-color-secondary); }
}
</style>
