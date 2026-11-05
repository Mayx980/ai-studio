<template>
  <video v-if="media.mimeType.startsWith('video/')" ref="video" class="templateMedia" :src="url" :controls="controls" :autoplay="autoplay" :muted="!controls" playsinline :loop="!controls" preload="metadata" @error="failed = true" />
  <img v-else class="templateMedia" :src="url" :alt="media.name" loading="lazy" @error="failed = true" />
  <span v-if="failed" class="mediaError" role="alert">素材无法预览，请检查文件格式或重新上传</span>
</template>
<script setup lang="ts">
import { ref, watch } from "vue";
import { captureVideoFrame } from "@/lib/videoFrame";
import useWorkspaceFiles from "@/lib/workspaceFiles";
import { isPublicTemplateMedia, templateDirectory, type TemplateMedia } from "@/lib/creationTemplates";
const props = defineProps<{ media: TemplateMedia; controls?: boolean; autoplay?: boolean }>();
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
