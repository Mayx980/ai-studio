<template>
  <teleport to="body">
    <aside v-show="visible" id="agentPanel" class="agentSidebar" :class="{ expanded: expanded && !sourceEditor, sourceEditor, navigationCollapsed, historyExpanded: conversationHistoryOpen && !sourceEditor }" :style="panelStyle" aria-label="智能助手对话侧栏">
      <studioSidebar v-if="expanded && !sourceEditor" activeSection="agent" :disabled="sidebarOpening" @navigate="navigate" @newAgent="newAgent" @openProject="openRecent" @openSettings="emit('openSettings')" />
      <agentHistorySidebar v-if="expanded && !sourceEditor && conversationHistoryOpen" />
      <div v-if="!expanded && !sourceEditor" class="resizeHandle" role="separator" aria-label="调整对话侧栏宽度" aria-orientation="vertical" :aria-valuemin="minimumWidth" :aria-valuemax="maximumWidth" :aria-valuenow="width" tabindex="0" @pointerdown="startResize" @pointermove="resize" @pointerup="stopResize" @pointercancel="stopResize" @lostpointercapture="stopResize" @keydown.left.prevent="preferredWidth = width + 16" @keydown.right.prevent="preferredWidth = width - 16" />
      <el-tooltip v-if="!expanded && !sourceEditor" content="关闭" placement="left" :showArrow="false"><el-button class="closeAgent" text circle aria-label="关闭侧边栏" @click="visible = false"><icon-x :size="18" /></el-button></el-tooltip>
      <div ref="assistantContent" class="assistantContent">
        <header v-if="expanded && !sourceEditor" class="assistantHeader"><el-button text :disabled="sidebarOpening || generationBusy" @click="newChat"><icon-message-plus :size="18" />新聊天</el-button><el-button text :aria-expanded="conversationHistoryOpen" @click="conversationHistoryOpen = !conversationHistoryOpen"><icon-history :size="18" />历史对话</el-button></header>
        <agent v-model="visible" creationModes :closable="!expanded"><template #menuActions><el-button v-if="expanded && !sourceEditor" class="enterCanvasButton" text :icon="IconVector" aria-label="进入画布" @click="emit('enterCanvas')">进入画布</el-button></template></agent>
        <creativeCases v-if="expanded && !sourceEditor" class="assistantTemplates" @apply="applyCase" />
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
import studioSidebar from "@/components/studioSidebar.vue";
import { clearGenerationOriginRoute } from "@/lib/generationOrigin";
import creativeCases from "@/components/creativeCases.vue";
import type { TemplateApplication } from "@/lib/creationTemplates";
import type { Project } from "@/stores/workspace";
import { ElMessage } from "element-plus";
import { useRouter } from "vue-router";
import agent from "@/components/agent/index.vue";
import { generationBusy } from "@/stores/browserGeneration";
const router = useRouter();
const sourceEditor = window.frameElement?.getAttribute("data-source-editor") === "true";
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
function newChat() { if (generationBusy.value || !startNewProject) return; return sidebarAction(async () => { await startNewProject("simple"); }); }
function newAgent() { return sidebarAction(async () => { await clearGenerationOriginRoute(); await useWorkspaceStore().resumeSimpleConversation(); }); }
function openRecent(project: Project) { return sidebarAction(async () => { if (!openSidebarProject) throw new Error("工作区尚未就绪"); await openSidebarProject(project.directory); }); }
const viewportWidth = ref(window.innerWidth), viewportHeight = ref(window.innerHeight), preferredWidth = ref(440);
const minimumWidth = computed(() => Math.min(320, viewportWidth.value));
const maximumWidth = computed(() => Math.min(760, viewportWidth.value));
const width = computed(() => Math.max(minimumWidth.value, Math.min(preferredWidth.value, maximumWidth.value)));
const panelStyle = computed(() => props.expanded ? { left: "0px", top: "0px", width: "100vw", height: "100dvh" } : { right: "0px", top: "0px", width: `${width.value}px`, height: "100dvh" });
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
.agentSidebar { position: fixed; z-index: 1001; box-sizing: border-box; max-width: 100vw; border-left: 1px solid var(--el-border-color); background: var(--el-bg-color); :deep(.agent) { border-radius: 0; } &:not(.expanded):not(.materialSplit):not(.sourceEditor) { padding-top: 44px; } .closeAgent { position: absolute; z-index: 3; top: 8px; right: 8px; } &.expanded { border: 0; background: transparent; } &.materialSplit { z-index: 1901; background: var(--el-bg-color); border: 0; border-radius: 0; overflow: hidden; } .resizeHandle { position: absolute; z-index: 2; top: 0; left: -4px; width: 8px; height: 100%; cursor: ew-resize; touch-action: none; &:focus-visible { background: var(--el-color-primary-light-5); } } }
.agentSidebar.sourceEditor { padding: 0; border: 0; background: #1c1b21;
  .assistantContent { display: flex; height: 100%; min-height: 0; overflow: hidden;
    :deep(.agent) { flex: 1; height: 100%; min-width: 0; min-height: 0; }
    :deep(.senderActions.simpleToolbar) { flex-wrap: wrap; gap: 6px; overflow: visible;
      .inlineModelSelect { flex: 1 1 120px; width: auto; min-width: 100px; max-width: 220px; }
      .outputTabs button { min-width: 0; padding: 0 6px; }
      .inlineParameter { padding: 0 4px; }
      > .sendButton { position: static; height: 28px; min-width: 60px; margin: 0; padding: 0 8px; }
    }
  }
}
</style>

<style scoped lang="scss">
.assistantContent { height: 100%; min-width: 0; .assistantHeader { display: flex; justify-content: flex-end; align-items: center; gap: 8px; min-height: 36px; .el-button { gap: 6px; } } }
.agentSidebar.expanded:not(.materialSplit) { background: #090909; padding: 24px 24px 24px 244px; isolation: isolate;
  &::before, &::after { content: ""; position: absolute; top: 0; left: calc(220px + (100% - 220px) / 2); transform: translateX(-50%); width: min(1200px, calc(100% - 460px)); height: 480px; z-index: -1; pointer-events: none; mask-image: linear-gradient(to right, transparent 0%, #0001 10%, #0004 20%, #0009 30%, #000e 40%, #000 50%, #000e 60%, #0009 70%, #0004 80%, #0001 90%, transparent 100%), radial-gradient(ellipse at 50% 0%, #000 0%, #000e 20%, #0009 42%, #0003 64%, transparent 86%); mask-composite: intersect; }
  &::before { background: radial-gradient(ellipse at 40% 10%, #008dffff 0%, #006bf5b3 26%, transparent 58%), radial-gradient(ellipse at 60% 10%, #bc27ffff 0%, #8616e6b3 26%, transparent 58%); }
  &::after { background-image: url("data:image/svg+xml,%3Csvg%20preserveAspectRatio%3D%22none%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%20100%20100%22%3E%3Cdefs%3E%3ClinearGradient%20id%3D%22x%22%3E%3Cstop%20offset%3D%220%25%22%20stop-color%3D%22white%22%20stop-opacity%3D%220.00000%22%2F%3E%3Cstop%20offset%3D%225%25%22%20stop-color%3D%22white%22%20stop-opacity%3D%220.03610%22%2F%3E%3Cstop%20offset%3D%2210%25%22%20stop-color%3D%22white%22%20stop-opacity%3D%220.12960%22%2F%3E%3Cstop%20offset%3D%2215%25%22%20stop-color%3D%22white%22%20stop-opacity%3D%220.26010%22%2F%3E%3Cstop%20offset%3D%2220%25%22%20stop-color%3D%22white%22%20stop-opacity%3D%220.40960%22%2F%3E%3Cstop%20offset%3D%2225%25%22%20stop-color%3D%22white%22%20stop-opacity%3D%220.56250%22%2F%3E%3Cstop%20offset%3D%2230%25%22%20stop-color%3D%22white%22%20stop-opacity%3D%220.70560%22%2F%3E%3Cstop%20offset%3D%2235%25%22%20stop-color%3D%22white%22%20stop-opacity%3D%220.82810%22%2F%3E%3Cstop%20offset%3D%2240%25%22%20stop-color%3D%22white%22%20stop-opacity%3D%220.92160%22%2F%3E%3Cstop%20offset%3D%2245%25%22%20stop-color%3D%22white%22%20stop-opacity%3D%220.98010%22%2F%3E%3Cstop%20offset%3D%2250%25%22%20stop-color%3D%22white%22%20stop-opacity%3D%221.00000%22%2F%3E%3Cstop%20offset%3D%2255%25%22%20stop-color%3D%22white%22%20stop-opacity%3D%220.98010%22%2F%3E%3Cstop%20offset%3D%2260%25%22%20stop-color%3D%22white%22%20stop-opacity%3D%220.92160%22%2F%3E%3Cstop%20offset%3D%2265%25%22%20stop-color%3D%22white%22%20stop-opacity%3D%220.82810%22%2F%3E%3Cstop%20offset%3D%2270%25%22%20stop-color%3D%22white%22%20stop-opacity%3D%220.70560%22%2F%3E%3Cstop%20offset%3D%2275%25%22%20stop-color%3D%22white%22%20stop-opacity%3D%220.56250%22%2F%3E%3Cstop%20offset%3D%2280%25%22%20stop-color%3D%22white%22%20stop-opacity%3D%220.40960%22%2F%3E%3Cstop%20offset%3D%2285%25%22%20stop-color%3D%22white%22%20stop-opacity%3D%220.26010%22%2F%3E%3Cstop%20offset%3D%2290%25%22%20stop-color%3D%22white%22%20stop-opacity%3D%220.12960%22%2F%3E%3Cstop%20offset%3D%2295%25%22%20stop-color%3D%22white%22%20stop-opacity%3D%220.03610%22%2F%3E%3Cstop%20offset%3D%22100%25%22%20stop-color%3D%22white%22%20stop-opacity%3D%220.00000%22%2F%3E%3C%2FlinearGradient%3E%3ClinearGradient%20id%3D%22y%22%20x2%3D%220%22%20y2%3D%221%22%3E%3Cstop%20offset%3D%220%25%22%20stop-color%3D%22white%22%20stop-opacity%3D%220.00000%22%2F%3E%3Cstop%20offset%3D%225%25%22%20stop-color%3D%22white%22%20stop-opacity%3D%220.03610%22%2F%3E%3Cstop%20offset%3D%2210%25%22%20stop-color%3D%22white%22%20stop-opacity%3D%220.12960%22%2F%3E%3Cstop%20offset%3D%2215%25%22%20stop-color%3D%22white%22%20stop-opacity%3D%220.26010%22%2F%3E%3Cstop%20offset%3D%2220%25%22%20stop-color%3D%22white%22%20stop-opacity%3D%220.40960%22%2F%3E%3Cstop%20offset%3D%2225%25%22%20stop-color%3D%22white%22%20stop-opacity%3D%220.56250%22%2F%3E%3Cstop%20offset%3D%2230%25%22%20stop-color%3D%22white%22%20stop-opacity%3D%220.70560%22%2F%3E%3Cstop%20offset%3D%2235%25%22%20stop-color%3D%22white%22%20stop-opacity%3D%220.82810%22%2F%3E%3Cstop%20offset%3D%2240%25%22%20stop-color%3D%22white%22%20stop-opacity%3D%220.92160%22%2F%3E%3Cstop%20offset%3D%2245%25%22%20stop-color%3D%22white%22%20stop-opacity%3D%220.98010%22%2F%3E%3Cstop%20offset%3D%2250%25%22%20stop-color%3D%22white%22%20stop-opacity%3D%221.00000%22%2F%3E%3Cstop%20offset%3D%2255%25%22%20stop-color%3D%22white%22%20stop-opacity%3D%220.98010%22%2F%3E%3Cstop%20offset%3D%2260%25%22%20stop-color%3D%22white%22%20stop-opacity%3D%220.92160%22%2F%3E%3Cstop%20offset%3D%2265%25%22%20stop-color%3D%22white%22%20stop-opacity%3D%220.82810%22%2F%3E%3Cstop%20offset%3D%2270%25%22%20stop-color%3D%22white%22%20stop-opacity%3D%220.70560%22%2F%3E%3Cstop%20offset%3D%2275%25%22%20stop-color%3D%22white%22%20stop-opacity%3D%220.56250%22%2F%3E%3Cstop%20offset%3D%2280%25%22%20stop-color%3D%22white%22%20stop-opacity%3D%220.40960%22%2F%3E%3Cstop%20offset%3D%2285%25%22%20stop-color%3D%22white%22%20stop-opacity%3D%220.26010%22%2F%3E%3Cstop%20offset%3D%2290%25%22%20stop-color%3D%22white%22%20stop-opacity%3D%220.12960%22%2F%3E%3Cstop%20offset%3D%2295%25%22%20stop-color%3D%22white%22%20stop-opacity%3D%220.03610%22%2F%3E%3Cstop%20offset%3D%22100%25%22%20stop-color%3D%22white%22%20stop-opacity%3D%220.00000%22%2F%3E%3C%2FlinearGradient%3E%3Cmask%20id%3D%22mx%22%3E%3Crect%20width%3D%22100%22%20height%3D%22100%22%20fill%3D%22url%28%23x%29%22%2F%3E%3C%2Fmask%3E%3Cmask%20id%3D%22my%22%3E%3Crect%20width%3D%22100%22%20height%3D%22100%22%20fill%3D%22url%28%23y%29%22%2F%3E%3C%2Fmask%3E%3C%2Fdefs%3E%3Cg%20mask%3D%22url%28%23mx%29%22%3E%3Crect%20width%3D%22100%22%20height%3D%22100%22%20fill%3D%22%23bbdfff%22%20fill-opacity%3D%220.5%22%20mask%3D%22url%28%23my%29%22%2F%3E%3C%2Fg%3E%3C%2Fsvg%3E"), url("data:image/svg+xml,%3Csvg%20preserveAspectRatio%3D%22none%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%20100%20100%22%3E%3Cdefs%3E%3ClinearGradient%20id%3D%22x%22%3E%3Cstop%20offset%3D%220%25%22%20stop-color%3D%22white%22%20stop-opacity%3D%220.00000%22%2F%3E%3Cstop%20offset%3D%225%25%22%20stop-color%3D%22white%22%20stop-opacity%3D%220.03610%22%2F%3E%3Cstop%20offset%3D%2210%25%22%20stop-color%3D%22white%22%20stop-opacity%3D%220.12960%22%2F%3E%3Cstop%20offset%3D%2215%25%22%20stop-color%3D%22white%22%20stop-opacity%3D%220.26010%22%2F%3E%3Cstop%20offset%3D%2220%25%22%20stop-color%3D%22white%22%20stop-opacity%3D%220.40960%22%2F%3E%3Cstop%20offset%3D%2225%25%22%20stop-color%3D%22white%22%20stop-opacity%3D%220.56250%22%2F%3E%3Cstop%20offset%3D%2230%25%22%20stop-color%3D%22white%22%20stop-opacity%3D%220.70560%22%2F%3E%3Cstop%20offset%3D%2235%25%22%20stop-color%3D%22white%22%20stop-opacity%3D%220.82810%22%2F%3E%3Cstop%20offset%3D%2240%25%22%20stop-color%3D%22white%22%20stop-opacity%3D%220.92160%22%2F%3E%3Cstop%20offset%3D%2245%25%22%20stop-color%3D%22white%22%20stop-opacity%3D%220.98010%22%2F%3E%3Cstop%20offset%3D%2250%25%22%20stop-color%3D%22white%22%20stop-opacity%3D%221.00000%22%2F%3E%3Cstop%20offset%3D%2255%25%22%20stop-color%3D%22white%22%20stop-opacity%3D%220.98010%22%2F%3E%3Cstop%20offset%3D%2260%25%22%20stop-color%3D%22white%22%20stop-opacity%3D%220.92160%22%2F%3E%3Cstop%20offset%3D%2265%25%22%20stop-color%3D%22white%22%20stop-opacity%3D%220.82810%22%2F%3E%3Cstop%20offset%3D%2270%25%22%20stop-color%3D%22white%22%20stop-opacity%3D%220.70560%22%2F%3E%3Cstop%20offset%3D%2275%25%22%20stop-color%3D%22white%22%20stop-opacity%3D%220.56250%22%2F%3E%3Cstop%20offset%3D%2280%25%22%20stop-color%3D%22white%22%20stop-opacity%3D%220.40960%22%2F%3E%3Cstop%20offset%3D%2285%25%22%20stop-color%3D%22white%22%20stop-opacity%3D%220.26010%22%2F%3E%3Cstop%20offset%3D%2290%25%22%20stop-color%3D%22white%22%20stop-opacity%3D%220.12960%22%2F%3E%3Cstop%20offset%3D%2295%25%22%20stop-color%3D%22white%22%20stop-opacity%3D%220.03610%22%2F%3E%3Cstop%20offset%3D%22100%25%22%20stop-color%3D%22white%22%20stop-opacity%3D%220.00000%22%2F%3E%3C%2FlinearGradient%3E%3ClinearGradient%20id%3D%22y%22%20x2%3D%220%22%20y2%3D%221%22%3E%3Cstop%20offset%3D%220%25%22%20stop-color%3D%22white%22%20stop-opacity%3D%220.00000%22%2F%3E%3Cstop%20offset%3D%225%25%22%20stop-color%3D%22white%22%20stop-opacity%3D%220.03610%22%2F%3E%3Cstop%20offset%3D%2210%25%22%20stop-color%3D%22white%22%20stop-opacity%3D%220.12960%22%2F%3E%3Cstop%20offset%3D%2215%25%22%20stop-color%3D%22white%22%20stop-opacity%3D%220.26010%22%2F%3E%3Cstop%20offset%3D%2220%25%22%20stop-color%3D%22white%22%20stop-opacity%3D%220.40960%22%2F%3E%3Cstop%20offset%3D%2225%25%22%20stop-color%3D%22white%22%20stop-opacity%3D%220.56250%22%2F%3E%3Cstop%20offset%3D%2230%25%22%20stop-color%3D%22white%22%20stop-opacity%3D%220.70560%22%2F%3E%3Cstop%20offset%3D%2235%25%22%20stop-color%3D%22white%22%20stop-opacity%3D%220.82810%22%2F%3E%3Cstop%20offset%3D%2240%25%22%20stop-color%3D%22white%22%20stop-opacity%3D%220.92160%22%2F%3E%3Cstop%20offset%3D%2245%25%22%20stop-color%3D%22white%22%20stop-opacity%3D%220.98010%22%2F%3E%3Cstop%20offset%3D%2250%25%22%20stop-color%3D%22white%22%20stop-opacity%3D%221.00000%22%2F%3E%3Cstop%20offset%3D%2255%25%22%20stop-color%3D%22white%22%20stop-opacity%3D%220.98010%22%2F%3E%3Cstop%20offset%3D%2260%25%22%20stop-color%3D%22white%22%20stop-opacity%3D%220.92160%22%2F%3E%3Cstop%20offset%3D%2265%25%22%20stop-color%3D%22white%22%20stop-opacity%3D%220.82810%22%2F%3E%3Cstop%20offset%3D%2270%25%22%20stop-color%3D%22white%22%20stop-opacity%3D%220.70560%22%2F%3E%3Cstop%20offset%3D%2275%25%22%20stop-color%3D%22white%22%20stop-opacity%3D%220.56250%22%2F%3E%3Cstop%20offset%3D%2280%25%22%20stop-color%3D%22white%22%20stop-opacity%3D%220.40960%22%2F%3E%3Cstop%20offset%3D%2285%25%22%20stop-color%3D%22white%22%20stop-opacity%3D%220.26010%22%2F%3E%3Cstop%20offset%3D%2290%25%22%20stop-color%3D%22white%22%20stop-opacity%3D%220.12960%22%2F%3E%3Cstop%20offset%3D%2295%25%22%20stop-color%3D%22white%22%20stop-opacity%3D%220.03610%22%2F%3E%3Cstop%20offset%3D%22100%25%22%20stop-color%3D%22white%22%20stop-opacity%3D%220.00000%22%2F%3E%3C%2FlinearGradient%3E%3Cmask%20id%3D%22mx%22%3E%3Crect%20width%3D%22100%22%20height%3D%22100%22%20fill%3D%22url%28%23x%29%22%2F%3E%3C%2Fmask%3E%3Cmask%20id%3D%22my%22%3E%3Crect%20width%3D%22100%22%20height%3D%22100%22%20fill%3D%22url%28%23y%29%22%2F%3E%3C%2Fmask%3E%3C%2Fdefs%3E%3Cg%20mask%3D%22url%28%23mx%29%22%3E%3Crect%20width%3D%22100%22%20height%3D%22100%22%20fill%3D%22%23090909%22%20fill-opacity%3D%220.5%22%20mask%3D%22url%28%23my%29%22%2F%3E%3C%2Fg%3E%3C%2Fsvg%3E"); background-size: 1200px 500px; background-repeat: no-repeat; animation: backgroundSweep 20s linear infinite; }

  .assistantContent { overflow-y: auto; scrollbar-width: none; &::-webkit-scrollbar { display: none; } padding: 0 0 24px; :deep(.agent) { max-width: 1080px; height: calc((100dvh - 48px) * .6); min-height: 440px; margin: auto; &:has(.emptyConversation) { height: auto; min-height: calc((100dvh - 48px) * .6); overflow: visible; } } .assistantTemplates { max-width: 1080px; margin: 30px auto; } }
  &.navigationCollapsed { padding-left: 92px; &::before, &::after { left: calc(68px + (100% - 68px) / 2); width: min(1200px, calc(100% - 308px)); } }
  &.historyExpanded { padding-right: 324px; }
  @media(max-width:700px) { &.historyExpanded { padding-right: min(260px, 42vw); :deep(.agentHistorySidebar) { width: min(248px, 40vw); } } padding: 16px 8px 12px 80px; &::before, &::after { left: calc(68px + (100% - 68px) / 2); width: calc(100% - 116px); height: 340px; } .assistantContent :deep(.agent) { min-height: 440px; } }
}
@keyframes backgroundSweep {
  0% { background-position: calc(0% - 1200px) -100px, calc(100% + 1200px) -100px; opacity: 0; }
  6% { opacity: 1; }
  44% { opacity: 1; }
  50% { background-position: calc(100% + 1200px) -100px, calc(100% + 1200px) -100px; opacity: 0; }
  51% { background-position: calc(0% - 1200px) -100px, calc(100% + 1200px) -100px; opacity: 0; }
  57% { opacity: 1; }
  94% { opacity: 1; }
  100% { background-position: calc(0% - 1200px) -100px, calc(0% - 1200px) -100px; opacity: 0; }
}
@media(prefers-reduced-motion:reduce) { .agentSidebar.expanded:not(.materialSplit)::after { animation: none; opacity: 0; } }
@media(max-width:700px) { .agentSidebar:not(.expanded):not(.materialSplit):not(.sourceEditor) { padding-top: 64px; } }
</style>

<style scoped lang="scss">
.agentSidebar.expanded:not(.materialSplit) .assistantContent:has(.emptyConversation:not([style*="display: none"])) {
  :deep(.agent) { width: 100%; max-width: 884px; height: auto; min-height: 0; }
  :deep(.emptyConversation) {
    justify-content: flex-start;
    .messageViewport { max-height: none; overflow: visible; }
    .welcomeMessage { padding: 0 16px 6px;
      .welcomeHeader { gap: 6px; .welcomeIcon { display: none; } h3 { font-size: clamp(24px, 2.2vw, 28px); line-height: 1.3; } }
    }
    .conversationMode { width: min(300px, calc(100% - 24px)); margin: 4px auto 10px; .modeButton { height: 28px; } }
    .simpleInput { display: flex; flex-wrap: wrap; align-items: stretch; border-radius: 20px;
      .simpleReferenceSlots { flex: 0 1 auto; max-width: calc(100% - 220px); padding: 12px; .referenceDeck, .frameDeck { padding: 0; } }
      .senderEditor { flex: 1 1 220px; min-width: 0; min-height: 124px; }
      .draftAttachments, .editingBanner { flex-basis: 100%; }
      .senderActions.simpleToolbar { flex: 1 0 100%; min-width: 0; box-sizing: border-box; flex-wrap: wrap; gap: 4px; padding: 8px 10px; overflow: visible;
        .outputTabs button { min-width: 0; padding: 0 6px; }
        .inlineModelSelect { flex: 1 1 120px; width: 132px; min-width: 120px; max-width: 180px; }
        .referenceModeButton { min-width: 80px; padding: 0 8px; }
        .inlineParameter { height: 32px; padding: 0 5px; gap: 5px; }
        .quickMention { width: 26px; height: 32px; font-size: 19px; }
        .styleSelect { min-width: 64px; padding: 0 8px; }
        > .sendButton { position: static; height: 36px; min-width: 80px; margin-left: auto; padding: 0 12px; }
      }
    }
  }
  .assistantTemplates { width: 100%; max-width: none; margin: 32px 0 0; }
  @media(min-width:1100px) {
    :deep(.agent) { width: calc(100% - 128px); max-width: none; }
    :deep(.emptyConversation) {
      .welcomeMessage { padding-bottom: 12px; .welcomeHeader { gap: 12px; h3 { font-size: 42px; } } }
      .conversationMode { width: 375px; margin: 5px auto 12.5px; padding: 6.25px;
        .modeButton { height: 35px; padding-left: 16.25px; padding-right: 50px; font-size: 17.5px; svg { width: 20px; height: 20px; } }
        .modeHelp { width: 35px; height: 35px; svg { width: 25px; height: 25px; } }
      }
      .simpleInput { border-radius: 20px;
        .simpleReferenceSlots { padding: 12px; .slotCard { width: 56px; height: 56px; border-radius: 8px; svg { width: 24px; height: 24px; } } }
        .senderEditor { min-height: 126px; .chat-rich-text, .chat-placeholder-wrap { font-size: 16px !important; line-height: 24px !important; } }
        .senderActions.simpleToolbar { gap: 4px; padding: 8px 12px;
          .outputTabs button { height: 28px; padding: 0 5px; gap: 4px; font-size: 14px; svg { width: 16px; height: 16px; } }
          .inlineModelSelect { flex-basis: 120px; width: 132px; min-width: 120px; max-width: 160px; .el-select__wrapper { min-height: 32px; } .el-select__selected-item { font-size: 14px; } }
          .referenceModeButton { height: 32px; min-width: 80px; padding: 0 7px; font-size: 14px; }
          .inlineParameter { height: 32px; padding: 0 4px; gap: 4px; font-size: 14px; svg { width: 18px; height: 18px; } }
          .quickMention { width: 24px; height: 32px; font-size: 22px; }
          .styleSelect { height: 32px; min-width: 60px; padding: 0 7px; font-size: 14px; svg { width: 16px; height: 16px; } }
          > .sendButton { height: 32px; min-width: 88px; padding: 0 12px; font-size: 15px; svg { width: 16px; height: 16px; } }
        }
      }
    }
    .assistantTemplates :deep(.caseGrid) { grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); }
  }
  @media(max-width:700px) {
    :deep(.emptyConversation) {
      .welcomeMessage .welcomeHeader h3 { font-size: 24px; }
      .simpleInput { .simpleReferenceSlots { max-width: 100%; } .senderEditor { flex-basis: 180px; min-height: 100px; } }
    }
    .assistantTemplates { margin-top: 32px; }
  }
}
</style>
