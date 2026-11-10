<template>
  <teleport to="body">
    <el-alert v-if="sourceEditError && !sourceEdit" class="sourceEditRecoveryError" :title="sourceEditError" type="error" :closable="false" />
    <button v-if="sourceEdit && !sourceEditorMinimized" class="sourceEditorMask" type="button" aria-label="收起来源编辑弹窗" :disabled="sourceEditBusy" @click="sourceEditorMinimized = true" />
    <template v-for="url in sourceWindows" :key="url">
      <transition name="sourceDrawer" appear>
        <section v-show="sourceEdit && !sourceEditorMinimized && sourceUrl === url" class="sourceEditorWindow" :class="{ canvasSource: url.includes('sourceType=canvas'), resizing: resizingUrl === url }" :style="sourceStyle(url)" role="dialog" aria-modal="true" aria-label="编辑素材来源">
          <button v-for="handle in resizeHandles" :key="handle.edge" type="button" class="sourceResize" :class="handle.edge" :aria-label="`拖动${handle.label}调整来源编辑窗口大小`" @pointerdown="startResize($event, url, handle.edge)" @pointermove="resizeWindow" @pointerup="stopResize" @pointercancel="stopResize" @lostpointercapture="stopResize" @keydown="resizeWithKeyboard($event, url, handle.edge)" />
          <header class="sourceEditorHeader">
            <div><strong :title="sourceEdit?.name">{{ sourceEdit?.name }}</strong><small>{{ sourceEdit?.origin.type === 'canvas' ? '编辑来源画布' : '编辑来源对话' }}</small></div>
            <div class="sourceEditorActions">
              <el-tooltip v-if="sourceEdit?.result" content="应用最新生成结果并替换原素材" :showArrow="false"><el-button type="primary" :loading="sourceEditBusy" aria-label="应用编辑结果" @click="returnFromSourceEdit(true)"><icon-check :size="16" />应用</el-button></el-tooltip>
              <el-popconfirm title="确认关闭编辑？记录会保留，已提交的任务继续运行。" confirmButtonText="确认关闭" cancelButtonText="取消" placement="bottom-end" :width="260" @confirm="returnFromSourceEdit()"><template #reference><el-button text :disabled="sourceEditBusy" aria-label="关闭来源编辑"><icon-x :size="18" /></el-button></template></el-popconfirm>
            </div>
          </header>
          <p v-if="sourceEditError" class="sourceEditorError" role="alert">{{ sourceEditError }}</p>
          <sourceEditorViewport :src="url" />
        </section>
      </transition>
    </template>
  </teleport>
</template>
<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { IconX, IconCheck } from "@tabler/icons-vue";
import sourceEditorViewport from "@/components/sourceEditorViewport.vue";
import { sourceWorkspaceUrl } from "@/lib/generationOrigin";
import { sourceEdit, sourceEditBusy, sourceEditError, restoreSourceEdit, returnFromSourceEdit, sourceEditorMinimized } from "@/stores/sourceEditing";
if (!window.frameElement?.hasAttribute("data-source-editor")) restoreSourceEdit();
const sourceUrl = computed(() => {
  const origin = sourceEdit.value?.origin;
  if (!origin) return "";
  return sourceWorkspaceUrl(origin);
});
const sourceWindows = ref<string[]>([]);
watch(sourceUrl, url => { if (url && !sourceWindows.value.includes(url)) sourceWindows.value.push(url); }, { immediate: true });
type WindowBounds = { left: number; top: number; width: number; height: number };
const viewport = ref({ width: window.innerWidth, height: window.innerHeight });
const preferredBounds = ref<Record<string, WindowBounds>>({});
const resizingUrl = ref("");
const resizeHandles = [
  { edge: "left", label: "左边缘" }, { edge: "right", label: "右边缘" }, { edge: "top", label: "上边缘" }, { edge: "bottom", label: "下边缘" },
  { edge: "topLeft", label: "左上角" }, { edge: "topRight", label: "右上角" }, { edge: "bottomLeft", label: "左下角" }, { edge: "bottomRight", label: "右下角" },
];
function sourceBounds(url: string): WindowBounds {
  const preferred = preferredBounds.value[url];
  const margin = viewport.value.width <= 700 ? 8 : 12;
  const availableWidth = Math.max(1, viewport.value.width - margin * 2), availableHeight = Math.max(1, viewport.value.height - margin * 2);
  const width = Math.min(availableWidth, Math.max(Math.min(320, availableWidth), preferred?.width ?? Math.min(url.includes("sourceType=canvas") ? 1100 : 500, availableWidth)));
  const height = Math.min(availableHeight, Math.max(Math.min(360, availableHeight), preferred?.height ?? availableHeight));
  return { left: Math.max(margin, Math.min(preferred?.left ?? viewport.value.width - margin - width, viewport.value.width - margin - width)), top: Math.max(margin, Math.min(preferred?.top ?? margin, viewport.value.height - margin - height)), width, height };
}
function sourceStyle(url: string) { return Object.fromEntries(Object.entries(sourceBounds(url)).map(([key, value]) => [key, `${value}px`])); }
let resizePointer: { id: number; x: number; y: number; url: string; edge: string; bounds: WindowBounds; element: HTMLElement } | undefined;
function applyResize(url: string, bounds: WindowBounds, edge: string, dx: number, dy: number) {
  const margin = viewport.value.width <= 700 ? 8 : 12;
  const minWidth = Math.min(320, viewport.value.width - margin * 2), minHeight = Math.min(360, viewport.value.height - margin * 2);
  const right = bounds.left + bounds.width, bottom = bounds.top + bounds.height;
  const left = edge.toLowerCase().includes("left") ? Math.max(margin, Math.min(bounds.left + dx, right - minWidth)) : bounds.left;
  const top = edge.toLowerCase().includes("top") ? Math.max(margin, Math.min(bounds.top + dy, bottom - minHeight)) : bounds.top;
  const width = edge.toLowerCase().includes("right") ? Math.max(minWidth, Math.min(bounds.width + dx, viewport.value.width - margin - left)) : right - left;
  const height = edge.toLowerCase().includes("bottom") ? Math.max(minHeight, Math.min(bounds.height + dy, viewport.value.height - margin - top)) : bottom - top;
  preferredBounds.value[url] = { left, top, width, height };
}
function startResize(event: PointerEvent, url: string, edge: string) {
  if (event.button !== 0 || resizePointer) return;
  const element = event.currentTarget as HTMLElement;
  element.setPointerCapture(event.pointerId);
  resizingUrl.value = url;
  resizePointer = { url, id: event.pointerId, x: event.clientX, y: event.clientY, edge, bounds: sourceBounds(url), element };
  event.preventDefault();
}
function resizeWindow(event: PointerEvent) {
  if (resizePointer?.id === event.pointerId) applyResize(resizePointer.url, resizePointer.bounds, resizePointer.edge, event.clientX - resizePointer.x, event.clientY - resizePointer.y);
}
function stopResize() {
  const previous = resizePointer; resizePointer = undefined; resizingUrl.value = "";
  if (previous?.element.hasPointerCapture(previous.id)) previous.element.releasePointerCapture(previous.id);
}
function resizeWithKeyboard(event: KeyboardEvent, url: string, edge: string) {
  if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
  event.preventDefault();
  applyResize(url, sourceBounds(url), edge, event.key === "ArrowLeft" ? -16 : event.key === "ArrowRight" ? 16 : 0, event.key === "ArrowUp" ? -16 : event.key === "ArrowDown" ? 16 : 0);
}
function updateViewport() { stopResize(); viewport.value = { width: window.innerWidth, height: window.innerHeight }; }
window.addEventListener("resize", updateViewport);
watch([sourceEdit, sourceEditorMinimized], ([context, minimized]) => { if (!context || minimized) stopResize(); });
onBeforeUnmount(() => { stopResize(); window.removeEventListener("resize", updateViewport); });

</script>
<style scoped lang="scss">
.sourceEditorMask { position: fixed; z-index: 1908; inset: 0; width: 100%; height: 100%; border: 0; padding: 0; background: #0007; cursor: default; }
.sourceEditorWindow { position: fixed; z-index: 1909; top: 12px; right: 12px; bottom: 12px; width: min(500px, calc(100vw - 24px)); display: flex; flex-direction: column; box-sizing: border-box; overflow: hidden; border: 1px solid #494052; border-radius: 18px; background: #1c1b21; box-shadow: -12px 12px 48px #0006;
  &.resizing :deep(iframe) { pointer-events: none; }
  .sourceResize { position: absolute; z-index: 5; border: 0; padding: 0; margin: 0; background: transparent; touch-action: none;
    &.left, &.right { top: 12px; bottom: 12px; width: 7px; cursor: ew-resize; }
    &.left { left: 0; } &.right { right: 0; }
    &.top, &.bottom { left: 12px; right: 12px; height: 7px; cursor: ns-resize; }
    &.top { top: 0; } &.bottom { bottom: 0; }
    &.topLeft, &.topRight, &.bottomLeft, &.bottomRight { width: 12px; height: 12px; }
    &.topLeft { top: 0; left: 0; cursor: nwse-resize; } &.topRight { top: 0; right: 0; cursor: nesw-resize; }
    &.bottomLeft { bottom: 0; left: 0; cursor: nesw-resize; } &.bottomRight { bottom: 0; right: 0; cursor: nwse-resize; }
    &:hover, &:focus-visible { background: #9573df44; } &:focus-visible { outline: 1px solid #a28ae9; outline-offset: -1px; }
  }
  &.canvasSource { width: min(1100px, calc(100vw - 24px)); }
  .sourceEditorHeader { display: flex; flex: none; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 16px; border-bottom: 1px solid #ffffff0c;
    > div:first-child { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
    strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 14px; color: #e9e5f0; }
    small { font-size: 12px; color: #b4a7ca; }
    .sourceEditorActions { display: flex; align-items: center; flex: none; gap: 4px; }
  }
  .sourceEditorError { margin: 0; padding: 8px 16px; color: #f56c6c; font-size: 12px; }
  iframe { display: block; flex: 1; min-height: 0; width: 100%; border: 0; }
}
.sourceDrawer-enter-active, .sourceDrawer-leave-active { transition: transform 240ms ease, opacity 240ms ease; }
.sourceDrawer-enter-from, .sourceDrawer-leave-to { transform: translateX(calc(100% + 16px)); opacity: 0; }
.sourceEditRecoveryError { position: fixed; z-index: 1910; top: 12px; left: 50%; transform: translateX(-50%); width: min(480px, calc(100vw - 24px)); }
@media(max-width:600px) { .sourceEditorWindow { top: 8px; right: 8px; bottom: 8px; width: calc(100vw - 16px); &.canvasSource { width: calc(100vw - 16px); } } }
@media(prefers-reduced-motion:reduce) { .sourceDrawer-enter-active, .sourceDrawer-leave-active { transition: none; } }
</style>
