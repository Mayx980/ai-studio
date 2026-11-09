<template>
  <teleport to="body">
    <materialGenerationWindow v-for="workspace in materialWorkspaces" :key="workspace.id" :workspace="workspace" />
    <nav v-if="materialWorkspaces.length && !activeMaterialWorkspace" class="materialTasks" aria-label="生成窗口任务">
      <button v-for="workspace in materialWorkspaces" :key="workspace.id" type="button" :class="workspace.status" @click="openMaterialWorkspace(workspace)"><icon-loader-2 v-if="workspace.status === 'generating' || workspace.status === 'queued'" class="taskSpinner" :size="16" /><icon-check v-else-if="workspace.status === 'completed'" :size="16" /><icon-alert-circle v-else-if="workspace.status === 'failed'" :size="16" /><icon-message-plus v-else :size="16" /><span>{{ workspace.label }} · {{ materialStatusLabel(workspace) }}</span></button>
    </nav>
    <el-alert v-if="materialStorageError" class="materialStorageError" :title="materialStorageError" type="error" :closable="false" />
  </teleport>
</template>
<script setup lang="ts">
import { IconLoader2, IconCheck, IconAlertCircle, IconMessagePlus } from "@tabler/icons-vue";
import materialGenerationWindow from "./materialGenerationWindow.vue";
import { activeMaterialWorkspace, materialWorkspaces, materialStorageError, materialStatusLabel, openMaterialWorkspace, restoreMaterialWorkspaces } from "@/stores/materialEditor";
restoreMaterialWorkspaces();
</script>
<style scoped lang="scss">
.materialTasks { position: fixed; right: 20px; bottom: 24px; z-index: 1900; display: flex; flex-direction: column; gap: 8px; max-width: min(360px, calc(100vw - 32px)); max-height: 40dvh; overflow: auto;
  button { display: flex; align-items: center; gap: 8px; border: 1px solid #4e435f; border-radius: 12px; background: #26232e; color: #e8e4f1; padding: 12px 16px; cursor: pointer; text-align: left; box-shadow: 0 8px 28px #0005; &:hover { background: #36303f; } &.completed { color: #82d9b1; } &.failed { color: #f0b17b; } }
}
.materialStorageError { position: fixed; bottom: 8px; left: 16px; width: min(480px, calc(100vw - 32px)); z-index: 1910; }
.taskSpinner { animation: materialSpin 1s linear infinite; }
@keyframes materialSpin { to { transform: rotate(360deg); } }
@media(prefers-reduced-motion:reduce) { .taskSpinner { animation: none; } }
</style>
