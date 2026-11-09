<template>
  <teleport to="body">
    <materialGenerationWindow v-for="workspace in materialWorkspaces" :key="workspace.id" :workspace="workspace" />
    <nav v-if="availableMaterialWorkspaces.length && !activeMaterialWorkspace" class="materialTasks" aria-label="生成窗口任务">
      <el-tooltip v-for="workspace in availableMaterialWorkspaces" :key="workspace.id" content="点击可查看任务" placement="left" :showArrow="false"><button type="button" :aria-label="`${workspace.label} · ${materialStatusLabel(workspace)}，点击可查看任务`" @click="openMaterialWorkspace(workspace)"><generationTaskRing :size="56" :status="workspace.status" :kind="workspace.config.outputKind" /></button></el-tooltip>
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
.materialTasks { position: fixed; right: 20px; bottom: 24px; z-index: 1900; display: flex; flex-direction: column; gap: 8px; max-width: min(360px, calc(100vw - 32px)); max-height: 40dvh; overflow-y: auto; overflow-x: hidden; padding: 4px; box-sizing: border-box;
  button { display: inline-flex; align-items: center; justify-content: center; flex: none; width: 64px; height: 64px; border: 0; border-radius: 50%; background: transparent; padding: 4px; cursor: pointer; transition: transform 180ms ease;
    &:hover { transform: scale(1.06); } &:focus-visible { outline: 2px solid #ab8aff; outline-offset: -1px; }
  }
}
@media(prefers-reduced-motion:reduce) { .materialTasks button { transition: none; } }
.materialStorageError { position: fixed; bottom: 8px; left: 16px; width: min(480px, calc(100vw - 32px)); z-index: 1910; }
</style>
