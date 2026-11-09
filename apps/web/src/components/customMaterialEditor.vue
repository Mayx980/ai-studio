<template>
  <teleport to="body">
    <materialGenerationWindow v-for="workspace in materialWorkspaces" :key="workspace.id" :workspace="workspace" />
    <nav v-if="materialWorkspaces.length && !activeMaterialWorkspace" class="materialTasks" aria-label="生成窗口任务">
      <button v-for="workspace in materialWorkspaces" :key="workspace.id" type="button" :class="workspace.status" @click="openMaterialWorkspace(workspace)"><generationTaskRing v-if="workspace.status === 'generating' || workspace.status === 'queued'" :size="52" /><icon-check v-else-if="workspace.status === 'completed'" :size="16" /><icon-alert-circle v-else-if="workspace.status === 'failed'" :size="16" /><icon-message-plus v-else :size="16" /><span class="taskCaption"><strong>{{ materialStatusLabel(workspace) }}</strong><small>{{ workspace.label }}</small><small v-if="workspace.status === 'generating' || workspace.status === 'queued'">点击查看任务</small></span></button>
    </nav>
    <el-alert v-if="materialStorageError" class="materialStorageError" :title="materialStorageError" type="error" :closable="false" />
  </teleport>
</template>
<script setup lang="ts">
import { IconCheck, IconAlertCircle, IconMessagePlus } from "@tabler/icons-vue";
import generationTaskRing from "./generationTaskRing.vue";
import materialGenerationWindow from "./materialGenerationWindow.vue";
import { activeMaterialWorkspace, materialWorkspaces, materialStorageError, materialStatusLabel, openMaterialWorkspace, restoreMaterialWorkspaces } from "@/stores/materialEditor";
restoreMaterialWorkspaces();
</script>
<style scoped lang="scss">
.materialTasks { position: fixed; right: 20px; bottom: 24px; z-index: 1900; display: flex; flex-direction: column; gap: 8px; max-width: min(360px, calc(100vw - 32px)); max-height: 40dvh; overflow: auto;
  button { display: flex; align-items: center; gap: 8px; border: 1px solid #4e435f; border-radius: 12px; background: #26232e; color: #e8e4f1; padding: 12px 16px; cursor: pointer; text-align: left; box-shadow: 0 8px 28px #0005; &:hover { background: #36303f; } .taskCaption { display: flex; flex-direction: column; gap: 4px; strong { font-size: 13px; font-weight: 500; } small { font-size: 11px; color: #aaa1ba; } } &.generating, &.queued { flex-direction: column; min-width: 128px; text-align: center; padding: 16px; gap: 10px; border-color: #6c548f; background: #24202f; } &.completed { color: #82d9b1; } &.failed { color: #f0b17b; } }
}
.materialStorageError { position: fixed; bottom: 8px; left: 16px; width: min(480px, calc(100vw - 32px)); z-index: 1910; }
</style>
