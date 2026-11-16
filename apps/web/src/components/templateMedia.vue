<template>
  <video v-if="url && media.mimeType.startsWith('video/')" ref="video" class="templateMedia" :src="url" :controls="controls" :autoplay="autoplay" :muted="!controls" playsinline :loop="!controls" preload="metadata" @error="failed = true" @loadeddata="failed = false" @loadedmetadata="readDuration" />
  <img v-else-if="url" class="templateMedia" :src="url" :alt="media.name" loading="lazy" @load="failed = false" @error="failed = true" />
  <span v-if="failed" class="mediaError" role="alert">素材无法预览，请检查文件格式或重新上传</span>
</template>
<script setup lang="ts">
import { ref, watch } from "vue";
import { captureVideoFrame } from "@/lib/videoFrame";
import useWorkspaceFiles from "@/lib/workspaceFiles";
import { isPublicTemplateMedia, templateDirectory, type TemplateMedia } from "@/lib/creationTemplates";
const props = defineProps<{ media: TemplateMedia; controls?: boolean; autoplay?: boolean }>();
const emit = defineEmits<{ duration: [value: string] }>();
function readDuration(event: Event) {
  const duration = (event.target as HTMLVideoElement).duration;
  if (!Number.isFinite(duration) || duration <= 0) return;
  const seconds = Math.floor(duration);
  emit("duration", `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`);
}
const url = ref(""), failed = ref(false), video = ref<HTMLVideoElement>();
watch(() => props.media, async (media, _previous, cleanup) => {
  url.value = ""; failed.value = false;
  let active = true;
  if (isPublicTemplateMedia(media.path)) { url.value = media.path; return; }
  const source = useWorkspaceFiles(media.directory ?? templateDirectory).acquireUrl(media.path, media.mimeType);
  cleanup(() => { active = false; source.release(); });
  try { const value = await source.url; if (active) url.value = value; } catch { if (active) failed.value = true; }
}, { immediate: true });
async function referenceFrame() {
  const player = video.value;
  if (!player || failed.value) throw new Error("视频尚未就绪，无法读取参考帧");
  return captureVideoFrame(player);
}
defineExpose({ referenceFrame });
</script>
<style scoped lang="scss">
.templateMedia { display: block; width: 100%; height: 100%; object-fit: contain; }
.mediaError { display: block; padding: 12px; color: var(--el-color-danger); }
</style>
