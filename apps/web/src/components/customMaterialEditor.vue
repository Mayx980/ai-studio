<template>
  <teleport to="body">
    <materialGenerationWindow v-for="workspace in materialWorkspaces" :key="workspace.id" :workspace="workspace" />
    <nav v-if="!sourceEditor && availableMaterialWorkspaces.length && !activeMaterialWorkspace" class="materialTasks" aria-label="生成窗口任务">
      <el-tooltip v-for="workspace in availableMaterialWorkspaces" :key="workspace.id" content="点击可查看任务" placement="left" :disabled="draggingId === workspace.id" :showArrow="false"><button type="button" :class="{ dragging: draggingId === workspace.id }" :style="taskPosition(workspace.id)" @pointerdown="startDrag($event, workspace.id)" @pointermove="moveDrag" @pointerup="finishDrag" @pointercancel="finishDrag" @lostpointercapture="finishDrag" @dragstart.prevent :aria-label="`${workspace.label} · ${materialStatusLabel(workspace)}，点击可查看任务`" @click="openTask($event, workspace)"><generationTaskRing :size="56" :status="workspace.status" :kind="workspace.config.outputKind" /></button></el-tooltip>
    </nav>
    <el-alert v-if="materialStorageError" class="materialStorageError" :title="materialStorageError" type="error" :closable="false" />
  </teleport>
</template>
<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from "vue";
import generationTaskRing from "./generationTaskRing.vue";
import materialGenerationWindow from "./materialGenerationWindow.vue";
import { activeMaterialWorkspace, availableMaterialWorkspaces, materialWorkspaces, materialStorageError, materialStatusLabel, openMaterialWorkspace, restoreMaterialWorkspaces, type MaterialWorkspace } from "@/stores/materialEditor";
const sourceEditor = window.frameElement?.hasAttribute("data-source-editor") === true;
restoreMaterialWorkspaces();
const positions = ref<Record<string, { left: number; top: number }>>({});
const viewport = ref({ width: window.innerWidth, height: window.innerHeight });
const draggingId = ref("");
let pointer: { id: number; taskId: string; x: number; y: number; left: number; top: number; element: HTMLElement; moved: boolean } | undefined;
let suppressClickId = "";
function clampPosition(point: { left: number; top: number }) {
  return { left: Math.max(8, Math.min(point.left, viewport.value.width - 72)), top: Math.max(8, Math.min(point.top, viewport.value.height - 72)) };
}
function taskPosition(id: string) {
  const point = positions.value[id];
  if (!point) return;
  const bounded = clampPosition(point);
  return { position: "fixed" as const, left: `${bounded.left}px`, top: `${bounded.top}px`, zIndex: 1 };
}
function startDrag(event: PointerEvent, taskId: string) {
  if (event.button !== 0 || pointer) return;
  suppressClickId = "";
  const element = event.currentTarget as HTMLElement, bounds = element.getBoundingClientRect();
  element.setPointerCapture(event.pointerId);
  pointer = { id: event.pointerId, taskId, x: event.clientX, y: event.clientY, left: bounds.left + (bounds.width - element.offsetWidth) / 2, top: bounds.top + (bounds.height - element.offsetHeight) / 2, element, moved: false };
}
function moveDrag(event: PointerEvent) {
  if (pointer?.id !== event.pointerId) return;
  const dx = event.clientX - pointer.x, dy = event.clientY - pointer.y;
  if (!pointer.moved && Math.hypot(dx, dy) < 6) return;
  pointer.moved = true; draggingId.value = pointer.taskId;
  positions.value[pointer.taskId] = clampPosition({ left: pointer.left + dx, top: pointer.top + dy });
  event.preventDefault();
}
function finishDrag() {
  const previous = pointer; pointer = undefined; draggingId.value = "";
  if (previous?.moved) suppressClickId = previous.taskId;
  if (previous?.element.hasPointerCapture(previous.id)) previous.element.releasePointerCapture(previous.id);
}
function openTask(event: MouseEvent, workspace: MaterialWorkspace) {
  if (suppressClickId === workspace.id && event.detail > 0) { suppressClickId = ""; return; }
  openMaterialWorkspace(workspace);
}
function updateViewport() { finishDrag(); viewport.value = { width: window.innerWidth, height: window.innerHeight }; }
window.addEventListener("resize", updateViewport);
watch(activeMaterialWorkspace, finishDrag);
onBeforeUnmount(() => { finishDrag(); window.removeEventListener("resize", updateViewport); });
</script>
<style scoped lang="scss">
.materialTasks { position: fixed; right: 20px; bottom: 24px; z-index: 1900; display: flex; flex-direction: column; gap: 8px; max-width: min(360px, calc(100vw - 32px)); max-height: 40dvh; overflow-y: auto; overflow-x: hidden; padding: 4px; box-sizing: border-box;
  button { display: inline-flex; align-items: center; justify-content: center; flex: none; width: 64px; height: 64px; border: 0; border-radius: 50%; background: transparent; padding: 4px; cursor: grab; touch-action: none; user-select: none; transition: transform 180ms ease;
    &.dragging { cursor: grabbing; transform: none; transition: none; }
    &:hover:not(.dragging) { transform: scale(1.06); } &:focus-visible { outline: 2px solid #ab8aff; outline-offset: -1px; }
  }
}
@media(prefers-reduced-motion:reduce) { .materialTasks button { transition: none; } }
.materialStorageError { position: fixed; bottom: 8px; left: 16px; width: min(480px, calc(100vw - 32px)); z-index: 1910; }
</style>
