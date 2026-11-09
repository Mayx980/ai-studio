<template>
  <teleport to="body">
    <el-alert v-if="sourceEditError && !sourceEdit" class="sourceEditRecoveryError" :title="sourceEditError" type="error" :closable="false" />
    <section v-if="sourceEdit" class="sourceEditReturn" aria-label="参考素材编辑返回"><span :title="sourceEdit.name">编辑参考素材：{{ sourceEdit.name }}</span><el-button text :disabled="sourceEditBusy" @click="returnFromSourceEdit()"><icon-arrow-left :size="16" />返回原对话</el-button><el-tooltip v-if="sourceEdit.result" content="应用最新生成结果并替换原素材" :showArrow="false"><el-button type="primary" :loading="sourceEditBusy" aria-label="应用编辑结果" @click="returnFromSourceEdit(true)"><icon-check :size="16" />应用</el-button></el-tooltip><p v-if="sourceEditError" role="alert">{{ sourceEditError }}</p></section>
  </teleport>
</template>
<script setup lang="ts">
import { IconArrowLeft, IconCheck } from "@tabler/icons-vue";
import { sourceEdit, sourceEditBusy, sourceEditError, restoreSourceEdit, returnFromSourceEdit } from "@/stores/sourceEditing";
restoreSourceEdit();
</script>
<style scoped lang="scss">
.sourceEditRecoveryError { position: fixed; z-index: 1910; top: 12px; left: 50%; transform: translateX(-50%); width: min(480px, calc(100vw - 24px)); }
.sourceEditReturn { position: fixed; z-index: 1910; top: 12px; left: 50%; transform: translateX(-50%); display: flex; flex-wrap: wrap; align-items: center; gap: 8px; max-width: calc(100vw - 24px); padding: 10px 14px; border: 1px solid #71549b; border-radius: 14px; background: #24202ff5; color: #e9e2f3; box-shadow: 0 8px 28px #0005; font-size: 12px;
  > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 240px; }
  p { flex-basis: 100%; margin: 0; color: #f56c6c; }
}
</style>
