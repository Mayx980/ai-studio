<template>
  <div class="videoReferenceInfo">
    <span v-if="loadError" class="videoError" role="alert">{{ loadError }}</span>
    <span v-else-if="loading" role="status">正在读取视频时长…</span>
    <template v-else-if="attachment.videoDuration">
      <span>{{ motion ? '动作视频' : '参考视频' }} · {{ attachment.videoDuration.toFixed(1) }} 秒</span>
      <small v-if="exceedsLimit" class="videoError" role="alert">参考视频最长 {{ referenceVideoMaxDuration }} 秒，请替换符合要求的视频。</small>
      <small v-else-if="motion && durations?.length">生成时长 · {{ outputDuration }} 秒</small>
    </template>
  </div>
</template>
<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { readVideoDuration } from "@toonflow/node-video/videoMetadata";
import type { AgentAttachment } from "@/components/agent/types";
import useWorkspaceFiles from "@/lib/workspaceFiles";
const props = defineProps<{ attachment: AgentAttachment; directory?: string; referenceVideoMaxDuration?: number; durations?: number[]; motion?: boolean }>();
const loading = ref(false), loadError = ref("");
const exceedsLimit = computed(() => !!props.referenceVideoMaxDuration && (props.attachment.videoDuration ?? 0) > props.referenceVideoMaxDuration);
const outputDuration = computed(() => props.durations?.find(value => value >= Math.ceil(props.attachment.videoDuration ?? 0)));
watch(() => [props.attachment.file, props.attachment.path, props.directory] as const, async ([file, path, directory], _, onCleanup) => {
  const controller = new AbortController();
  onCleanup(() => controller.abort());
  loading.value = true; loadError.value = "";
  try {
    if (!file && (!path || !directory)) throw new Error("视频文件不可用，请重新添加");
    const blob = file ?? new Blob([await useWorkspaceFiles(directory!).read(path)], { type: props.attachment.mimeType });
    controller.signal.throwIfAborted();
    const duration = await readVideoDuration(blob, controller.signal);
    if (!controller.signal.aborted) props.attachment.videoDuration = duration;
  } catch (error) {
    if (!controller.signal.aborted) { props.attachment.videoDuration = undefined; loadError.value = error instanceof Error ? error.message : "读取视频失败"; }
  } finally { if (!controller.signal.aborted) loading.value = false; }
}, { immediate: true });
</script>
<style scoped lang="scss">
.videoReferenceInfo { display: flex; flex-direction: column; gap: 5px; width: 180px; padding-top: 8px; font-size: 11px; line-height: 1.5; color: var(--el-text-color-secondary);
  small { font-size: 11px; }
  .videoError { color: var(--el-color-danger); }
}
</style>
