<template>
  <teleport to="body">
    <materialGenerationWindow v-for="workspace in materialWorkspaces" :key="workspace.id" :workspace="workspace" />
    <nav v-if="availableMaterialWorkspaces.length && !activeMaterialWorkspace" class="materialTasks" aria-label="生成窗口任务">
      <button v-for="workspace in availableMaterialWorkspaces" :key="workspace.id" type="button" :class="workspace.status" :title="workspace.label" @click="openMaterialWorkspace(workspace)"><generationTaskRing :size="56" :active="workspace.status === 'generating' || workspace.status === 'queued'" /><span class="taskCaption"><strong>{{ materialStatusLabel(workspace) }}</strong><small>点击查看任务</small></span></button>
    </nav>
    <el-alert v-if="materialStorageError" class="materialStorageError" :title="materialStorageError" type="error" :closable="false" />
  </teleport>
</template>
<script setup lang="ts">
import generationTaskRing from "./generationTaskRing.vue";
import materialGenerationWindow from "./materialGenerationWindow.vue";
import { activeMaterialWorkspace, availableMaterialWorkspaces, materialWorkspaces, materialStorageError, materialStatusLabel, openMaterialWorkspace, restoreMaterialWorkspaces } from "@/stores/materialEditor";
restoreMaterialWorkspaces();
</script>
<style scoped lang="scss">
.materialTasks { position: fixed; right: 20px; bottom: 24px; z-index: 1900; display: flex; flex-direction: column; gap: 8px; max-width: min(360px, calc(100vw - 32px)); max-height: 40dvh; overflow: auto;
  button { display: flex; flex-direction: column; align-items: center; gap: 10px; min-width: 128px; border: 0; border-radius: 16px; background: #211d2b; color: #f2edf9; padding: 16px; cursor: pointer; text-align: center; box-shadow: 0 8px 28px #0005;
    &:hover { background: #30283e; } &:focus-visible { outline: 2px solid #ab8aff; outline-offset: -2px; }
    .taskCaption { display: flex; flex-direction: column; gap: 8px; strong { font-size: 14px; font-weight: 500; } small { font-size: 12px; color: #aaa1ba; } }
    &.completed { color: #82d9b1; :deep(.generationTaskRing) { color: #82d9b1; } }
    &.failed { color: #f56c6c; :deep(.generationTaskRing) { color: #f56c6c; } }
  }
}
.materialStorageError { position: fixed; bottom: 8px; left: 16px; width: min(480px, calc(100vw - 32px)); z-index: 1910; }
</style>
