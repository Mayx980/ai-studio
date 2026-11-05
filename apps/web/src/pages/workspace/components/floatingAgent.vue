<template>
  <teleport to="body">
    <aside v-show="visible && materialEditorState?.source !== 'canvas'" id="agentPanel" class="agentSidebar" :class="{ expanded, navigationCollapsed, historyExpanded: conversationHistoryOpen, materialSplit: !!materialEditorState }" :style="panelStyle" :inert="!!materialEditorState" aria-label="智能助手对话侧栏">
      <studioSidebar v-if="expanded && !materialEditorState" activeSection="agent" :disabled="sidebarOpening" @navigate="navigate" @newAgent="newAgent" @openProject="openRecent" @openSettings="emit('openSettings')" />
      <agentHistorySidebar v-if="expanded && !materialEditorState" />
      <div v-if="!expanded" class="resizeHandle" role="separator" aria-label="调整对话侧栏宽度" aria-orientation="vertical" :aria-valuemin="minimumWidth" :aria-valuemax="maximumWidth" :aria-valuenow="width" tabindex="0" @pointerdown="startResize" @pointermove="resize" @pointerup="stopResize" @pointercancel="stopResize" @lostpointercapture="stopResize" @keydown.left.prevent="preferredWidth = width + 16" @keydown.right.prevent="preferredWidth = width - 16" />
      <div ref="assistantContent" class="assistantContent">
        <agent v-model="visible" creationModes :closable="!expanded"><template #menuActions><el-button v-if="expanded" class="enterCanvasButton" text :icon="IconVector" aria-label="进入画布" @click="emit('enterCanvas')">进入画布</el-button></template></agent>
        <creativeCases v-if="expanded && !materialEditorState" class="assistantTemplates" @apply="applyCase" />
      </div>
    </aside>
  </teleport>
</template>
<script setup lang="ts">
import { computed, inject, onBeforeUnmount, ref, watch } from "vue";
import { IconVector } from "@tabler/icons-vue";
import agentHistorySidebar from "@/components/agentHistorySidebar.vue";
import { useWorkspaceStore } from "@/stores/workspace";
import { navigationCollapsed, conversationHistoryOpen } from "@/stores/navigation";
import { materialEditorState } from "@/stores/materialEditor";
import studioSidebar from "@/components/studioSidebar.vue";
import creativeCases from "@/components/creativeCases.vue";
import type { TemplateApplication } from "@/lib/creationTemplates";
import type { Project } from "@/stores/workspace";
import { ElMessage } from "element-plus";
import { useRouter } from "vue-router";
import agent from "@/components/agent/index.vue";
const router = useRouter();
function navigate(section: string) { if (section === "history") { conversationHistoryOpen.value = !conversationHistoryOpen.value; return; } void router.push({ path: "/home", query: { section } }); }
const props = defineProps<{ expanded?: boolean }>();
const visible = defineModel<boolean>({ default: false });
const emit = defineEmits<{ resize: [width: number]; enterCanvas: []; openSettings: []; applyTemplate: [value: TemplateApplication] }>();
const startNewProject = inject<((mode: "simple" | "professional") => Promise<void>) | undefined>("startNewProject", undefined);
const openSidebarProject = inject<((directory: string) => Promise<void>) | undefined>("openSidebarProject", undefined);
const sidebarOpening = ref(false);
const assistantContent = ref<HTMLElement>();
function applyCase(value: TemplateApplication) { emit("applyTemplate", value); assistantContent.value?.scrollTo({ top: 0 }); }
async function sidebarAction(action: () => Promise<void>) {
  if (sidebarOpening.value) return;
  sidebarOpening.value = true;
  try { await action(); assistantContent.value?.scrollTo({ top: 0 }); }
  catch (error) { ElMessage.error(error instanceof Error ? error.message : "项目打开失败"); }
  finally { sidebarOpening.value = false; }
}
function newAgent() { return sidebarAction(async () => { await useWorkspaceStore().resumeSimpleConversation(); }); }
function openRecent(project: Project) { return sidebarAction(async () => { if (!openSidebarProject) throw new Error("工作区尚未就绪"); await openSidebarProject(project.directory); }); }
const viewportWidth = ref(window.innerWidth), viewportHeight = ref(window.innerHeight), preferredWidth = ref(440);
const minimumWidth = computed(() => Math.min(320, viewportWidth.value));
const maximumWidth = computed(() => Math.min(760, viewportWidth.value));
const width = computed(() => Math.max(minimumWidth.value, Math.min(preferredWidth.value, maximumWidth.value)));
const panelStyle = computed(() => materialEditorState.value ? { left: "0px", top: "0px", width: viewportWidth.value <= 700 ? "100vw" : "50vw", height: viewportWidth.value <= 700 ? "50dvh" : "100dvh" } : props.expanded ? { left: "0px", top: "0px", width: "100vw", height: "100dvh" } : { right: "0px", top: "0px", width: `${width.value}px`, height: "100dvh" });
let pointer: { id: number; x: number; width: number; element: HTMLElement } | undefined;
function startResize(event: PointerEvent) { if (event.button !== 0) return; const element = event.currentTarget as HTMLElement; element.setPointerCapture(event.pointerId); pointer = { id: event.pointerId, x: event.clientX, width: width.value, element }; event.preventDefault(); }
function resize(event: PointerEvent) { if (pointer?.id === event.pointerId) preferredWidth.value = pointer.width + pointer.x - event.clientX; }
function stopResize() { const previous = pointer; pointer = undefined; if (previous?.element.hasPointerCapture(previous.id)) previous.element.releasePointerCapture(previous.id); }
function updateViewport() { stopResize(); viewportWidth.value = window.innerWidth; viewportHeight.value = window.innerHeight; }
watch(() => visible.value && !props.expanded ? width.value : 0, value => emit("resize", value), { immediate: true });
window.addEventListener("resize", updateViewport);
onBeforeUnmount(() => { stopResize(); window.removeEventListener("resize", updateViewport); });
</script>
<style scoped lang="scss">
.agentSidebar { position: fixed; z-index: 1001; box-sizing: border-box; max-width: 100vw; border-left: 1px solid var(--el-border-color); background: var(--el-bg-color); :deep(.agent) { border-radius: 0; } &.expanded { border: 0; background: transparent; } &.materialSplit { z-index: 1901; background: var(--el-bg-color); border: 0; border-radius: 0; overflow: hidden; } .resizeHandle { position: absolute; z-index: 2; left: -4px; width: 8px; height: 100%; cursor: ew-resize; touch-action: none; &:focus-visible { background: var(--el-color-primary-light-5); } } }
</style>

<style scoped lang="scss">
.assistantContent { height: 100%; min-width: 0; }
.agentSidebar.expanded:not(.materialSplit) { background: #090909; padding: 24px 24px 24px 244px; isolation: isolate;
  &::before { content: ""; position: absolute; top: 0; left: calc(220px + (100% - 220px) / 2); transform: translateX(-50%); width: min(1000px, calc(100% - 220px)); height: 440px; z-index: -1; pointer-events: none; background: radial-gradient(ellipse at 45% 0%, #2c8f7840, transparent 48%), radial-gradient(ellipse at 56% 0%, #397ac14d, transparent 52%), radial-gradient(ellipse at 50% -10%, #a34c8c30, transparent 50%); }
  .assistantContent { overflow-y: auto; scrollbar-width: none; &::-webkit-scrollbar { display: none; } padding: 0 0 24px; :deep(.agent) { max-width: 1080px; height: calc((100dvh - 48px) * .6); min-height: 440px; margin: auto; &:has(.emptyConversation) { height: auto; min-height: calc((100dvh - 48px) * .6); overflow: visible; } } .assistantTemplates { max-width: 1080px; margin: 30px auto; } }
  &.navigationCollapsed { padding-left: 146px; &::before { left: calc(68px + (100% - 68px) / 2); width: min(1000px, calc(100% - 68px)); } }
  &.historyExpanded { padding-left: 332px; }
  &:not(.navigationCollapsed) :deep(.agentHistorySidebar) { left: 220px; }
  &:not(.navigationCollapsed) { padding-left: 298px; }
  @media(max-width:700px) { &.historyExpanded { padding-left: min(332px, 52vw); :deep(.agentHistorySidebar) { width: calc(52vw - 68px); } } padding: 16px 8px 12px 80px; &::before { left: calc(68px + (100% - 68px) / 2); width: calc(100% - 68px); height: 340px; } .assistantContent :deep(.agent) { min-height: 440px; } }
}
@media(max-width:700px) { .agentSidebar:not(.expanded):not(.materialSplit) { padding-top: 64px; } }
</style>
