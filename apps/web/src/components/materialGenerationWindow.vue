<template>
  <transition name="materialWindow">
    <section v-show="!workspace.minimized" class="materialGenerationWindow" role="dialog" :style="windowStyle" :aria-label="`独立生成对话 · ${workspace.label}`">
      <button v-for="handle in resizeHandles" :key="handle.edge" type="button" class="windowResize" :class="handle.edge" :aria-label="`拖动${handle.label}调整窗口大小`" @pointerdown="startResize($event, handle.edge)" @pointermove="resizeWindow" @pointerup="stopResize" @pointercancel="stopResize" @lostpointercapture="stopResize" @keydown="resizeWithKeyboard($event, handle.edge)" />
      <header><div><strong>{{ workspace.label }}</strong><small role="status">{{ materialStatusLabel(workspace) }}</small></div><div class="windowActions"><el-tooltip content="收起对话" :showArrow="false"><el-button text aria-label="收起自定义素材对话" @click="minimizeMaterialWorkspace(workspace)"><icon-minus :size="18" /></el-button></el-tooltip><el-tooltip content="新建生成对话" :showArrow="false"><el-button text aria-label="新建生成对话" :disabled="!workspace.request" @click="newWorkspace"><icon-message-plus :size="18" /></el-button></el-tooltip><el-popconfirm title="确认关闭对话吗？" confirmButtonText="确定" cancelButtonText="取消" placement="bottom-end" :width="270" :hideIcon="true" popperClass="materialCloseConfirm" @confirm="endMaterialWorkspace(workspace)"><template #reference><el-button text aria-label="结束对话" title="结束对话"><icon-x :size="18" /></el-button></template></el-popconfirm></div></header>
      <el-alert v-if="workspace.error" :title="workspace.error" type="warning" :closable="false" />
      <el-alert v-if="loadError" :title="loadError" type="error" :closable="false"><el-button text @click="loadSession">重新打开</el-button></el-alert>
      <p v-if="loading" role="status">正在打开独立生成对话…</p>
      <conversation v-if="session" :key="session.file" class="materialConversation" :active="!workspace.minimized" :initialSession="session" :initialDraft="initialDraft" :sessionFile="session.file" :disabled="loading || applying || !!workspace.uncertain" creationModes materialEditor :materialDirectory="workspace.directory" :materialLabel="workspace.label" :materialRole="workspace.target.role" @draft="saveDraft" @generationState="updateTask" @applyMaterial="applyMaterial" />
    </section>
  </transition>
</template>
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, provide, ref, watch } from "vue";
import { IconMessagePlus, IconMinus, IconX } from "@tabler/icons-vue";
import conversation from "@/components/agent/conversation.vue";
import { createBrowserConversation, readBrowserConversation } from "@/components/agent/browserConversations";
import type { AgentConversation, AgentAttachment } from "@/components/agent/types";
import { materialDrawerInsets, createMaterialWorkspace, endMaterialWorkspace, materialStatusLabel, minimizeMaterialWorkspace, saveMaterialWorkspaces, type MaterialWorkspace, type MaterialTaskStatus } from "@/stores/materialEditor";
import useWorkspaceFiles from "@/lib/workspaceFiles";
import { browserConfig, restoreBrowserResults } from "@/stores/browserGeneration";
import { uploadNodeFile } from "@toonflow/nodes-scaffold/workspaceFiles";
const props = defineProps<{ workspace: MaterialWorkspace }>();
provide("generationConfig", props.workspace.config);
provide("generationModelSelection", props.workspace.modelSelection);
const session = ref<AgentConversation>(), loading = ref(false), loadError = ref(""), applying = ref(false);
const initialDraft = { prompt: props.workspace.prompt, attachments: props.workspace.attachments };
let draftQueue = Promise.resolve();

type WindowBounds = { left: number; top: number; width: number; height: number };
const viewport = ref({ width: window.innerWidth, height: window.innerHeight });
const preferredBounds = ref<WindowBounds>();
const resizeHandles = [
  { edge: "left", label: "左边缘" }, { edge: "right", label: "右边缘" }, { edge: "top", label: "上边缘" }, { edge: "bottom", label: "下边缘" },
  { edge: "topLeft", label: "左上角" }, { edge: "topRight", label: "右上角" }, { edge: "bottomLeft", label: "左下角" }, { edge: "bottomRight", label: "右下角" },
];
const windowBounds = computed(() => {
  const margin = viewport.value.width <= 700 ? 8 : 12;
  const availableWidth = Math.max(1, viewport.value.width - margin * 2), availableHeight = Math.max(1, viewport.value.height - margin * 2);
  const width = Math.min(availableWidth, Math.max(Math.min(320, availableWidth), preferredBounds.value?.width ?? Math.min(320, availableWidth)));
  const height = Math.min(availableHeight, Math.max(Math.min(360, availableHeight), preferredBounds.value?.height ?? availableHeight));
  return { left: Math.max(margin, Math.min(preferredBounds.value?.left ?? viewport.value.width - margin - width, viewport.value.width - margin - width)), top: Math.max(margin, Math.min(preferredBounds.value?.top ?? margin, viewport.value.height - margin - height)), width, height };
});
watch(windowBounds, bounds => { materialDrawerInsets[props.workspace.id] = viewport.value.width - bounds.left; }, { immediate: true });
onBeforeUnmount(() => { delete materialDrawerInsets[props.workspace.id]; });
const windowStyle = computed(() => Object.fromEntries(Object.entries(windowBounds.value).map(([key, value]) => [key, `${value}px`])));
let resizePointer: { id: number; x: number; y: number; edge: string; bounds: WindowBounds; element: HTMLElement } | undefined;
function applyResize(bounds: WindowBounds, edge: string, dx: number, dy: number) {
  const margin = viewport.value.width <= 700 ? 8 : 12;
  const minWidth = Math.min(320, viewport.value.width - margin * 2), minHeight = Math.min(360, viewport.value.height - margin * 2);
  const right = bounds.left + bounds.width, bottom = bounds.top + bounds.height;
  const left = edge.toLowerCase().includes("left") ? Math.max(margin, Math.min(bounds.left + dx, right - minWidth)) : bounds.left;
  const top = edge.toLowerCase().includes("top") ? Math.max(margin, Math.min(bounds.top + dy, bottom - minHeight)) : bounds.top;
  const width = edge.toLowerCase().includes("right") ? Math.max(minWidth, Math.min(bounds.width + dx, viewport.value.width - margin - left)) : right - left;
  const height = edge.toLowerCase().includes("bottom") ? Math.max(minHeight, Math.min(bounds.height + dy, viewport.value.height - margin - top)) : bottom - top;
  preferredBounds.value = { left, top, width, height };
}
function startResize(event: PointerEvent, edge: string) {
  if (event.button !== 0 || resizePointer) return;
  const element = event.currentTarget as HTMLElement;
  element.setPointerCapture(event.pointerId);
  resizePointer = { id: event.pointerId, x: event.clientX, y: event.clientY, edge, bounds: { ...windowBounds.value }, element };
  event.preventDefault();
}
function resizeWindow(event: PointerEvent) {
  if (resizePointer?.id === event.pointerId) applyResize(resizePointer.bounds, resizePointer.edge, event.clientX - resizePointer.x, event.clientY - resizePointer.y);
}
function stopResize() {
  const previous = resizePointer; resizePointer = undefined;
  if (previous?.element.hasPointerCapture(previous.id)) previous.element.releasePointerCapture(previous.id);
}
function resizeWithKeyboard(event: KeyboardEvent, edge: string) {
  if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
  event.preventDefault();
  applyResize(windowBounds.value, edge, event.key === "ArrowLeft" ? -16 : event.key === "ArrowRight" ? 16 : 0, event.key === "ArrowUp" ? -16 : event.key === "ArrowDown" ? 16 : 0);
}
function updateViewport() { stopResize(); viewport.value = { width: window.innerWidth, height: window.innerHeight }; }
window.addEventListener("resize", updateViewport);
watch(() => props.workspace.minimized, value => { if (value) stopResize(); });
onBeforeUnmount(() => { stopResize(); window.removeEventListener("resize", updateViewport); });

async function loadSession() {
  if (loading.value) return;
  loading.value = true; loadError.value = "";
  try {
    const item = props.workspace;
    session.value = item.sessionFile ? await readBrowserConversation(item.directory, item.sessionFile) : { ...await createBrowserConversation(item.directory, "material"), creationMode: "simple" };
    await restoreBrowserResults(item.directory);
    item.sessionFile = session.value.file; saveMaterialWorkspaces();
  } catch (error) { loadError.value = error instanceof Error ? error.message : "独立生成对话恢复失败"; }
  finally { loading.value = false; }
}
onMounted(loadSession);
watch(() => [browserConfig.enabled, browserConfig.endpoint, browserConfig.keys] as const, ([enabled, endpoint, keys]) => { Object.assign(props.workspace.config, { enabled, endpoint, keys }); }, { immediate: true, deep: true });
watch([() => props.workspace.config, () => props.workspace.modelSelection], saveMaterialWorkspaces, { deep: true });
function newWorkspace() { if (props.workspace.request) createMaterialWorkspace(props.workspace.request); }
function saveDraft(draft: { prompt: string; attachments: AgentAttachment[] }) {
  const item = props.workspace;
  item.prompt = draft.prompt; item.attachments = draft.attachments;
  saveMaterialWorkspaces();
  draftQueue = draftQueue.catch(() => {}).then(async () => {
    for (const attachment of draft.attachments) if (attachment.file && !attachment.path) attachment.path = await uploadNodeFile(useWorkspaceFiles(item.directory), item.id, attachment.file);
    saveMaterialWorkspaces();
  }).catch(error => { loadError.value = error instanceof Error ? error.message : "参考素材保存失败，请保留当前窗口"; });
}
function updateTask(task: { status: MaterialTaskStatus; error?: string; taskId?: string; vendorTaskId?: string; resultIds?: string[] }) {
  if (task.status === "queued") props.workspace.applied = false;
  Object.assign(props.workspace, { status: task.status, error: task.error || "", taskId: task.taskId || props.workspace.taskId, vendorTaskId: task.vendorTaskId || props.workspace.vendorTaskId, resultIds: task.resultIds || props.workspace.resultIds });
  saveMaterialWorkspaces();
}
async function applyMaterial(file: File) {
  const item = props.workspace;
  if (applying.value) return;
  if (!item.request) { item.error = "原素材入口已不在当前页面，请返回对应项目的自定义素材入口后应用；生成结果已保留。"; return; }
  applying.value = true;
  try { await item.request.apply(file); item.applied = true; minimizeMaterialWorkspace(item); }
  catch (error) { item.error = error instanceof Error ? error.message : "素材应用失败，对话已保留"; }
  finally { applying.value = false; saveMaterialWorkspaces(); }
}
</script>
<style scoped lang="scss">
.materialGenerationWindow { position: fixed; z-index: 1901; box-sizing: border-box; container-type: inline-size; display: flex; flex-direction: column; background: #131313; border: 1px solid transparent; border-radius: 18px; box-shadow: inset 0 0 2px 1px color-mix(in srgb, var(--el-border-color-light) 50%, transparent), -12px 12px 48px #0006; overflow: hidden;
  .windowResize { position: absolute; z-index: 5; border: 0; padding: 0; margin: 0; background: transparent; touch-action: none;
    &.left, &.right { top: 12px; bottom: 12px; width: 7px; cursor: ew-resize; }
    &.left { left: 0; } &.right { right: 0; }
    &.top, &.bottom { left: 12px; right: 12px; height: 7px; cursor: ns-resize; }
    &.top { top: 0; } &.bottom { bottom: 0; }
    &.topLeft, &.topRight, &.bottomLeft, &.bottomRight { width: 12px; height: 12px; }
    &.topLeft { top: 0; left: 0; cursor: nwse-resize; } &.topRight { top: 0; right: 0; cursor: nesw-resize; }
    &.bottomLeft { bottom: 0; left: 0; cursor: nesw-resize; } &.bottomRight { bottom: 0; right: 0; cursor: nwse-resize; }
    &:hover, &:focus-visible { background: #9573df44; } &:focus-visible { outline: 1px solid #a28ae9; outline-offset: -1px; }
  }
  header { flex: none; display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 16px; border-bottom: 1px solid #ffffff0c; > div:first-child { display: flex; flex-direction: column; gap: 4px; min-width: 0; } strong { font-size: 14px; color: #e9e5f0; } small { font-size: 12px; color: #b4a7ca; } .windowActions { display: flex; align-items: center; } }
  > p { padding: 16px; }
  .materialConversation { flex: 1; min-height: 0; overflow: hidden; }
  :deep(.messageInput) { resize: none; }
  :deep(.agentConversation .messageInput .senderActions.simpleToolbar) {
    flex-wrap: wrap; gap: 10px 12px; overflow: visible; padding: 8px 52px 12px 8px;
    .outputTabs { max-width: 100%; button { min-width: 0; padding: 0 8px; } }
    .inlineModelSelect { flex: 1 1 130px; width: auto; min-width: 110px; max-width: 240px; }
    .styleSelect { min-width: 60px; max-width: 110px; padding: 0 8px; > span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } }
    .inlineParameter { height: 32px; padding: 0 6px; gap: 6px; }
    .quickMention { height: 32px; width: 28px; font-size: 18px; }
    > .sendButton { position: absolute; right: 12px; bottom: 12px; height: 28px; min-width: 60px; padding: 0 8px; margin: 0; font-size: 12px; > span > svg { width: 14px; height: 14px; } }
  }
}
@container (max-width: 420px) {
  .materialGenerationWindow :deep(.agentConversation .messageInput .senderActions.simpleToolbar) {
    .outputTabs button { gap: 4px; padding: 0 6px; font-size: 12px; svg { width: 14px; height: 14px; } }
    .inlineModelSelect { flex-basis: 100px; min-width: 100px; max-width: none; .el-select__wrapper { padding: 4px 8px; } .el-select__selected-item { font-size: 12px; } }
    .inlineParameter { font-size: 12px; gap: 4px; padding: 0 3px; &:not(.formatParameter) > svg { display: none; } }
    .quickMention { width: 24px; }
    .styleSelect { width: 32px; min-width: 32px; max-width: 32px; padding: 0; > span { gap: 0; font-size: 0; } svg { width: 16px; height: 16px; flex: none; } }
  }
}
.materialWindow-enter-active, .materialWindow-leave-active { transition: transform 240ms ease, opacity 240ms ease; }
.materialWindow-enter-from, .materialWindow-leave-to { transform: translateX(calc(100% + 16px)); opacity: 0; }
@media(prefers-reduced-motion:reduce) { .materialWindow-enter-active, .materialWindow-leave-active { transition: none; } }
</style>

<style lang="scss">
.materialCloseConfirm.el-popper { padding: 16px 18px; border: 1px solid #303030; border-radius: 4px; background: #131313; color: #f2f2f2; box-shadow: 0 4px 16px #0005;
  .el-popconfirm__main { align-items: center; justify-content: center; text-align: center; gap: 8px; margin: 2px 0 20px; color: #f2f2f2; font-size: 14px; line-height: 22px; }
  .el-popconfirm__action { margin: 0; text-align: right; .el-button { min-width: 48px; height: 24px; padding: 0 10px; border: 0; border-radius: 2px; font-size: 12px; background: #292929; color: #e4e4e4; &.el-button--primary { background: #2463ff; color: #fff; } } }
  .el-popper__arrow::before { background: #131313; border-color: #303030; }
}
</style>
