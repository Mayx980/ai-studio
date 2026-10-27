<template>
  <div class="attachmentList" :class="{ referenceList: numbered }">
    <div v-for="(attachment, index) in attachments" :key="attachment.path || index" class="attachmentItem"><attachmentPreview :attachment="attachment" :directory="directory" :removable="removable" :restorable="restorable" :disabled="disabled" @remove="emit('remove', index)" @restore="emit('restore', index)" /><span v-if="numbered && attachment.mimeType.startsWith('image/')" class="referenceIndex">图{{ index + 1 }}</span></div>
  </div>
</template>

<script setup lang="ts">
import attachmentPreview from "./attachmentPreview.vue";
import type { AgentAttachment } from "./types";

defineProps<{ attachments: AgentAttachment[]; directory?: string; removable?: boolean; restorable?: boolean; disabled?: boolean; numbered?: boolean }>();
const emit = defineEmits<{ remove: [index: number]; restore: [index: number] }>();
</script>

<style scoped lang="scss">
.attachmentList {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  &.referenceList { gap: 12px; }
  .attachmentItem { position: relative; }
  .referenceIndex { position: absolute; bottom: 2px; left: 3px; padding: 1px 4px; border-radius: 3px; font-size: 10px; color: #fff; background: #0009; pointer-events: none; }
}
</style>
