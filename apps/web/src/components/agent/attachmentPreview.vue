<template>
  <div ref="thumbnailElement" class="thumbnailItem" :class="{ fileAttachment: !isMedia }">
    <template v-if="isText">
      <button class="textAttachmentButton" type="button" :title="attachment.name" :aria-label="`预览 ${attachment.name}`" @click="textPreviewVisible = true">
        <icon-file-text :size="18" />
        <span>{{ attachment.name }}</span>
      </button>
    </template>
    <el-image
      v-else-if="attachment.mimeType.startsWith('image/')"
      class="thumbnailImage"
      :src="thumbnailUrl"
      fit="cover"
      :alt="attachment.name"
      :title="attachment.name"
      tabindex="0"
      role="button"
      :aria-label="`预览 ${attachment.name}`"
      @click="!hoverPreview && (imagePreviewVisible = true)"
      @keydown.enter.prevent="!hoverPreview && (imagePreviewVisible = true)"
      @keydown.space.prevent="!hoverPreview && (imagePreviewVisible = true)">
      <template #error><icon-photo :size="20" /></template>
    </el-image>
    <button v-else-if="attachment.mimeType.startsWith('video/')" class="thumbnailButton" type="button" :title="attachment.name" :aria-label="`预览 ${attachment.name}`" :disabled="!thumbnailUrl" @click="!hoverPreview && (videoPreviewVisible = true)">
      <video v-if="thumbnailUrl" :src="thumbnailUrl" preload="metadata" muted playsinline aria-hidden="true" @loadedmetadata="showVideoCover" />
      <icon-video class="videoIcon" :size="16" />
    </button>
    <div v-else class="fileAttachmentCard" :title="attachment.name"><icon-file-text :size="18" /><span>{{ attachment.name }}</span></div>
    <span v-if="hoverPreview && videoDuration" class="videoDuration">{{ videoDuration }}</span>
    <el-popover v-if="hoverPreview && thumbnailUrl" trigger="hover" virtualTriggering :virtualRef="thumbnailElement" :appendTo="previewTarget" placement="right" :showAfter="250" :width="240" :showArrow="false" :popperStyle="{ zIndex: 3100, padding: '0', overflow: 'hidden', maxWidth: 'calc(100vw - 24px)' }" @hide="pauseHoverVideo">
      <div class="attachmentHoverPreview" @mousedown.stop @click.stop>
        <div class="hoverMedia">
          <template v-if="attachment.mimeType.startsWith('video/')">
            <video ref="hoverVideo" :src="thumbnailUrl" preload="metadata" playsinline @loadedmetadata="showVideoCover" @play="hoverPlaying = true" @pause="hoverPlaying = false" @ended="hoverPlaying = false" />
            <button class="hoverPlayback" :class="{ playing: hoverPlaying }" type="button" :aria-label="hoverPlaying ? '暂停' : '播放'" :title="hoverPlaying ? '暂停' : '播放'" @click="toggleHoverPlayback"><icon-player-pause v-if="hoverPlaying" :size="18" /><icon-player-play v-else :size="28" /></button>
          </template>
          <img v-else :src="thumbnailUrl" :alt="attachment.name" />
          <span v-if="videoDuration" class="hoverDuration">{{ videoDuration }}</span>
        </div>
        <p v-if="hoverPlaybackError" class="hoverError" role="alert">{{ hoverPlaybackError }}</p>
        <span class="hoverLabel">{{ attachment.referenceName || attachment.name }}</span>
      </div>
    </el-popover>
    <el-tooltip v-if="restorable" content="还原到输入框" placement="bottom"><el-button class="restoreAttachment" text circle size="small" :disabled="disabled" aria-label="还原到输入框" @click="emit('restore')"><icon-arrow-back-up :size="14" /></el-button></el-tooltip>
    <el-button v-if="removable" class="removeAttachment" circle :disabled="disabled" :aria-label="`移除 ${attachment.name}`" title="移除附件" @click="emit('remove')"><icon-x :size="10" /></el-button>
    <imageViewer v-if="imagePreviewVisible && thumbnailUrl" :urlList="[thumbnailUrl]" @close="imagePreviewVisible = false" />
    <el-dialog v-model="videoPreviewVisible" :title="attachment.name" width="min(800px, 90vw)" alignCenter appendToBody destroyOnClose>
      <video v-if="videoPreviewVisible" class="videoPreview" :src="thumbnailUrl" controls playsinline preload="metadata" />
    </el-dialog>
    <el-dialog v-model="textPreviewVisible" :title="attachment.name" width="min(720px, 90vw)" alignCenter appendToBody destroyOnClose>
      <p v-if="textLoading || textError" :role="textError ? 'alert' : 'status'">{{ textLoading ? '正在读取…' : textError }}</p>
      <pre v-else class="textPreview">{{ textContent }}</pre>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import imageViewer from "@toonflow/node-shared/imageViewer";
import { IconFileText, IconPhoto, IconVideo, IconX, IconArrowBackUp, IconPlayerPlay, IconPlayerPause } from "@tabler/icons-vue";
import useWorkspaceFiles from "@/lib/workspaceFiles";
import type { AgentAttachment } from "./types";
import { readTextAttachment } from "./textAttachments";

const props = defineProps<{ attachment: AgentAttachment; directory?: string; removable?: boolean; restorable?: boolean; disabled?: boolean; hoverPreview?: boolean; previewTarget?: HTMLElement }>();
const emit = defineEmits<{ remove: []; restore: [] }>();
const isText = computed(() => props.attachment.mimeType === "text/plain");
const isMedia = computed(() => /^(image|video)\//.test(props.attachment.mimeType));
const textPreviewVisible = ref(false);
const textContent = ref("");
const textLoading = ref(false);
const textError = ref("");
const imagePreviewVisible = ref(false);
const videoPreviewVisible = ref(false);
const thumbnailUrl = ref("");
const thumbnailElement = ref<HTMLElement>();
const videoDuration = ref("");
const hoverVideo = ref<HTMLVideoElement>();
const hoverPlaying = ref(false);
const hoverPlaybackError = ref("");
function pauseHoverVideo() { hoverVideo.value?.pause(); }
onBeforeUnmount(pauseHoverVideo);
async function toggleHoverPlayback() {
  const video = hoverVideo.value;
  if (!video) return;
  hoverPlaybackError.value = "";
  if (!video.paused) { video.pause(); return; }
  try { await video.play(); }
  catch { hoverPlaybackError.value = "视频暂时无法播放，请重试"; }
}
function showVideoCover(event: Event) {
  const video = event.target as HTMLVideoElement;
  if (Number.isFinite(video.duration) && video.duration > 0) {
    const seconds = Math.floor(video.duration);
    videoDuration.value = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  }
  if (video.duration > 0) video.currentTime = Math.min(0.1, video.duration / 2);
}

watch(() => [props.directory, props.attachment.file, props.attachment.path, props.attachment.mimeType] as const, async ([directory, file, path, mimeType], _previous, onCleanup) => {
  videoPreviewVisible.value = false; imagePreviewVisible.value = false;
  pauseHoverVideo(); hoverPlaying.value = false; hoverPlaybackError.value = "";
  thumbnailUrl.value = ""; videoDuration.value = "";
  if (!/^(image|video)\//.test(mimeType)) return;
  let cancelled = false;
  let release = () => {};
  onCleanup(() => { cancelled = true; release(); });
  try {
    if (file) {
      const url = URL.createObjectURL(file);
      release = () => URL.revokeObjectURL(url);
      thumbnailUrl.value = url;
    } else if (directory) {
      const preview = useWorkspaceFiles(directory).acquireUrl(path, mimeType);
      release = preview.release;
      const url = await preview.url;
      if (!cancelled) thumbnailUrl.value = url;
    }
  } catch {
    if (!cancelled) thumbnailUrl.value = "";
  }
}, { immediate: true });

watch([textPreviewVisible, () => props.attachment, () => props.directory], async ([visible, attachment, directory], _previous, onCleanup) => {
  textContent.value = "";
  textError.value = "";
  textLoading.value = false;
  if (!visible || attachment.mimeType !== "text/plain") return;
  let cancelled = false;
  onCleanup(() => { cancelled = true; });
  textLoading.value = true;
  try {
    const text = await readTextAttachment(attachment, directory);
    if (!cancelled) textContent.value = text;
  } catch {
    if (!cancelled) textError.value = "无法读取文本附件，请重试";
  } finally {
    if (!cancelled) textLoading.value = false;
  }
});
</script>

<style scoped lang="scss">
.thumbnailItem {
  .videoDuration { position: absolute; bottom: 1px; right: 1px; padding: 0 2px; border-radius: 3px; background: #000b; color: white; font-size: 9px; line-height: 13px; pointer-events: none; }
  position: relative;
  flex-shrink: 0;
  width: 38px;
  height: 38px;
  &:has(.restoreAttachment) { margin-bottom: 26px; }
  .restoreAttachment { position: absolute; top: calc(100% + 2px); left: 0; margin: 0; width: 24px; height: 22px; }

  &.fileAttachment {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    width: min(160px, 100%);
    height: auto;
    padding: 6px 8px;
    box-sizing: border-box;
    border: 1px solid var(--el-border-color);
    border-radius: 8px;
    background: var(--el-fill-color-extra-light);

    .textAttachmentButton,
    .fileAttachmentCard {
      display: flex;
      align-items: center;
      gap: 6px;
      width: 100%;
      padding: 0;
      border: none;
      background: transparent;
      color: var(--el-text-color-primary);
      font: inherit;
      font-size: 12px;
      &.textAttachmentButton { cursor: pointer; }

      svg { flex-shrink: 0; color: var(--el-color-primary); }
      span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    }

  }

  .thumbnailButton,
  .thumbnailImage {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    padding: 0;
    overflow: hidden;
    border: 1px solid var(--el-border-color);
    border-radius: 10px;
    background: transparent;
    color: var(--el-text-color-secondary);
    cursor: pointer;

    .el-image,
    video {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    :deep(.el-image__error) {
      background: transparent;
    }

    .videoIcon {
      position: absolute;
      right: 3px;
      bottom: 3px;
      color: white;
      filter: drop-shadow(0 1px 2px rgb(0 0 0 / 80%));
    }
  }

  .removeAttachment {
    position: absolute;
    top: -5px;
    right: -5px;
    width: 16px;
    height: 16px;
    margin: 0;
    padding: 0;
    opacity: 0;
    pointer-events: none;
  }

  &:hover .removeAttachment,
  &:focus-within .removeAttachment {
    opacity: 1;
    pointer-events: auto;
  }

}

.videoPreview {
  display: block;
  width: 100%;
  max-height: 70vh;
}

.textPreview {
  max-height: 60vh;
  overflow: auto;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font: inherit;
}
</style>

<style scoped lang="scss">
.attachmentHoverPreview { display: flex; flex-direction: column;
  .hoverMedia { position: relative; width: 100%; aspect-ratio: 1; overflow: hidden; background: #181818;
    img, video { display: block; width: 100%; height: 100%; object-fit: cover; }
    .hoverPlayback { position: absolute; inset: 0; margin: auto; display: grid; place-items: center; width: 48px; height: 48px; padding: 0; border: 1px solid #ffffff66; border-radius: 50%; background: #0008; color: #fff; cursor: pointer;
      &.playing { inset: auto auto 8px 8px; margin: 0; width: 32px; height: 32px; }
      &:hover { background: #000b; }
      &:focus-visible { outline: 2px solid var(--el-color-primary); outline-offset: 3px; }
    }
    .hoverDuration { position: absolute; right: 8px; bottom: 8px; padding: 2px 5px; border-radius: 4px; color: #fff; background: #000a; font-size: 11px; }
  }
  .hoverLabel { padding: 10px 12px; font-size: 12px; overflow-wrap: anywhere; }
  .hoverError { padding: 0 12px; color: var(--el-color-danger); font-size: 12px; }
}
</style>
