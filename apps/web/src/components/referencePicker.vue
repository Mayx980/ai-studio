<template>
  <el-popover trigger="click" placement="top" :width="180">
    <template #reference><el-button text circle :disabled="disabled" aria-label="引用素材" title="引用素材"><icon-paperclip :size="16" /></el-button></template>
    <div class="referenceActions"><el-button text @click="emit('local')">本地上传</el-button><el-button text @click="visible = true">从个人资产选择</el-button></div>
  </el-popover>
  <el-dialog v-model="visible" title="引用个人资产" width="min(800px, 92vw)" appendToBody destroyOnClose>
    <assetLibrary :modelValue="true" selectable @select="choose" />
  </el-dialog>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { IconPaperclip } from "@tabler/icons-vue";
import assetLibrary from "@/pages/workspace/panels/canvas/components/assetLibrary.vue";
defineProps<{ disabled?: boolean }>();
const emit = defineEmits<{ local: []; files: [files: File[]] }>();
const visible = ref(false);
function choose(file: File) { emit("files", [file]); visible.value = false; }
</script>

<style scoped lang="scss">
.referenceActions { display: flex; flex-direction: column; align-items: stretch; .el-button { margin: 0; } }
</style>
