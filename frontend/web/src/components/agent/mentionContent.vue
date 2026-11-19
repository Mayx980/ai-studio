<template>
  <span class="mentionContent"><template v-for="(part, index) in parts" :key="index"><el-tooltip v-if="part.mention" :content="sourceLabel(part.mention)" :showArrow="false"><button class="mentionTag" type="button" :aria-label="`预览 ${mentionName(part.mention)}`" @click="preview(part.mention.id)"><mentionThumbnail v-if="mentionThumbnailProps(part.mention).thumbnail" class="inlineMentionThumbnail" v-bind="mentionThumbnailProps(part.mention)" :directory="directory"><icon-at :size="13" /></mentionThumbnail><icon-at v-else :size="13" /><span class="mentionLabel">{{ mentionName(part.mention) }}</span></button></el-tooltip><template v-else>{{ part.text }}</template></template></span>
  <el-dialog v-model="previewVisible" :title="previewLabel" width="min(720px, 90vw)" alignCenter appendToBody destroyOnClose>
    <div v-if="selected || selectedAttachment" class="mentionPreview">
      <p v-if="selected" class="mentionSource">{{ sourceLabel(selected) }}</p>
      <p v-if="loading || error" :role="error ? 'alert' : 'status'">{{ loading ? '正在读取…' : error }}</p>
      <img v-else-if="previewUrl && ['IMAGE', 'MASK'].includes(previewType)" :src="previewUrl" :alt="previewLabel" @error="error = '无法预览该图片'" />
      <video v-else-if="previewUrl && previewType === 'VIDEO'" :src="previewUrl" controls playsinline preload="metadata" @error="error = '无法预览该视频'" />
      <audio v-else-if="previewUrl && previewType === 'AUDIO'" :src="previewUrl" controls preload="metadata" @error="error = '无法预览该音频'" />
      <p v-else-if="previewType === 'FILE'" class="fileName"><icon-file :size="20" />{{ previewLabel }}</p>
      <template v-else>
        <pre>{{ textValue.slice(0, 12000) }}</pre>
        <p v-if="textValue.length > 12000">…（预览已截取，发送保留完整内容）</p>
      </template>
      <el-button v-if="removable && selected" text type="danger" @click="removeSelected">移除此引用</el-button>
    </div>
  </el-dialog>
</template>

<script setup lang="ts">
import { studio, isStudioError } from "@/ports";

import { computed, ref, watch } from "vue";
import { IconAt, IconFile } from "@tabler/icons-vue";
import type { AgentMention } from "@toonflow/server/agent/types";
import useWorkspaceFiles from "@/lib/workspaceFiles";
import { mentionName, mentionParts, mentionThumbnailProps } from "./mentionText";
import mentionThumbnail from "./mentionThumbnail.vue";
import type { AgentAttachment } from "./types";

const props = defineProps<{ content?: string; mentions?: AgentMention[]; attachments?: AgentAttachment[]; directory?: string; removable?: boolean }>();
const emit = defineEmits<{ remove: [id: string] }>();
const parts = computed(() => mentionParts(props.content ?? "", props.mentions));
const previewVisible = ref(false);
const selectedId = ref("");
const selected = computed(() => props.mentions?.find(mention => mention.id === selectedId.value));
const selectedAttachment = computed(() => {
  const match = /^attachment(\d+)$/.exec(selectedId.value);
  return match ? props.attachments?.[Number(match[1])] : undefined;
});
const previewLabel = computed(() => selectedAttachment.value?.referenceName || selectedAttachment.value?.name || selected.value?.label || "提及内容");
const previewType = computed(() => selectedAttachment.value ? selectedAttachment.value.mimeType.split("/")[0]!.toUpperCase() : selected.value?.dataType || "");
const previewUrl = ref("");
const loading = ref(false);
const error = ref("");
const textValue = computed(() => {
  const value = selected.value?.value;
  return typeof value === "string" ? value : JSON.stringify(value, null, 2) ?? "";
});

function sourceLabel(mention: AgentMention) {
  return mention.source.kind === "asset" ? `全局素材 / ${mention.source.path}`
    : `${mention.source.canvasName} / ${mention.source.nodeName} / ${mention.source.outputName}（${mention.source.nodeId}）`;
}

function preview(id: string) {
  selectedId.value = id;
  previewVisible.value = true;
}

function removeSelected() {
  emit("remove", selectedId.value);
  previewVisible.value = false;
}

watch([previewVisible, selected, selectedAttachment, () => props.directory], async ([visible, mention, attachment, directory], _old, onCleanup) => {
  previewUrl.value = "";
  error.value = "";
  loading.value = false;
  if (!visible || (!mention && !attachment) || !["IMAGE", "MASK", "VIDEO", "AUDIO"].includes(previewType.value)) return;
  const value = mention?.value as { url?: string; mimeType?: string } | null;
  let release = () => {};
  const controller = new AbortController();
  onCleanup(() => { controller.abort(); release(); });
  loading.value = true;
  try {
    if (attachment?.file) {
      const url = URL.createObjectURL(attachment.file);
      release = () => URL.revokeObjectURL(url);
      previewUrl.value = url;
    } else if (attachment && directory) {
      const preview = useWorkspaceFiles(directory).acquireUrl(attachment.path, attachment.mimeType);
      release = preview.release;
      const url = await preview.url;
      if (!controller.signal.aborted) previewUrl.value = url;
    } else if (mention?.source.kind === "asset" && mentionThumbnailProps(mention).globalAsset) {
      const { data } = await studio.readAsset<Blob>( { params: { path: mention.source.path }, responseType: "blob", signal: controller.signal });
      controller.signal.throwIfAborted();
      previewUrl.value = URL.createObjectURL(data);
      const url = previewUrl.value;
      release = () => URL.revokeObjectURL(url);
    } else if (directory && value?.url) {
      const preview = useWorkspaceFiles(directory).acquireUrl(value.url, value.mimeType);
      release = preview.release;
      const url = await preview.url;
      if (!controller.signal.aborted) previewUrl.value = url;
    } else throw new Error("引用文件不存在");
  } catch (cause) {
    if (!controller.signal.aborted) error.value = isStudioError(cause) ? cause.detail?.message || "无法读取引用文件，文件可能已被删除" : cause instanceof Error ? cause.message : "无法读取引用";
  } finally {
    if (!controller.signal.aborted) loading.value = false;
  }
});

defineExpose({ preview });
</script>

<style scoped lang="scss">
.mentionContent {
  white-space: pre-wrap;
  overflow-wrap: anywhere;

  .mentionTag {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    max-width: 100%;
    margin: 1px 2px;
    padding: 1px 5px;
    border: none;
    border-radius: var(--el-border-radius-small);
    background: var(--el-color-primary-light-9);
    color: var(--el-color-primary);
    font: inherit;
    text-align: left;
    vertical-align: middle;
    overflow-wrap: anywhere;
    cursor: pointer;

    svg { flex-shrink: 0; }
    .inlineMentionThumbnail { width: 24px; height: 24px; border-radius: 3px; }
    .mentionLabel { min-width: 0; }
  }
}

.mentionPreview {
  .mentionSource { color: var(--el-text-color-secondary); overflow-wrap: anywhere; }
  img, video { display: block; max-width: 100%; max-height: 60vh; margin: auto; }
  audio { width: 100%; }
  pre { max-height: 55vh; overflow: auto; white-space: pre-wrap; overflow-wrap: anywhere; font: inherit; }
  .fileName { display: flex; align-items: center; gap: 8px; }
}
</style>
