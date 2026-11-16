<template>
  <div class="sourceViewportContainer" :aria-busy="!ready && !loadError">
    <div v-if="!ready && !loadError" class="sourceLoading" role="status"><el-icon class="is-loading" aria-hidden="true"><icon-loader-2 :size="22" /></el-icon><span>加载中</span></div>
    <el-alert v-if="loadError" :title="loadError" type="error" :closable="false" />
    <iframe class="sourceEditorViewport" :class="{ sourceReady: ready }" :src="src" data-source-editor="true" :data-source-application="applyEnabled ? 'true' : undefined" title="素材来源编辑工作区" @load="bindSourceWindow" @afxen:source-ready="sourceReady" @error="loadError = '来源内容加载失败，请关闭后重试'" />
  </div>
</template>
<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { openCreationPage } from "@/lib/generationOrigin";
import { browserConfig, browserModelSelection, additionalBrowserModels, type BrowserModelConnection } from "@/stores/browserGeneration";
import { receiveSourceResult, returnFromSourceEdit, sourceEdit, sourceEditBusy, sourceEditError } from "@/stores/sourceEditing";
const props = defineProps<{ src: string; applyEnabled?: boolean }>();
const router = useRouter();
const ready = ref(false), loadError = ref("");
watch(() => props.src, () => { ready.value = false; loadError.value = ""; });
function sourceReady(event: Event) {
  const error = (event as CustomEvent<{ error?: string }>).detail?.error;
  loadError.value = typeof error === "string" ? error : "";
  ready.value = !loadError.value;
  if (ready.value) bindSourceWindow(event);
}
let sourceWindow: Window | null = null;
function openCreation(event: Event) {
  const request = (event as CustomEvent<{ completion?: Promise<void> }>).detail;
  request.completion = (async () => {
    if (sourceEdit.value) await returnFromSourceEdit();
    await openCreationPage(router);
  })();
}
function syncSourceModels() {
  const connection: BrowserModelConnection = {
    enabled: browserConfig.enabled, endpoint: browserConfig.endpoint, keys: { ...browserConfig.keys },
    models: additionalBrowserModels.map(model => ({ ...model })), selection: { ...browserModelSelection },
  };
  sourceWindow?.dispatchEvent(new CustomEvent("afxen:source-models", { detail: connection }));
}
watch(() => [browserConfig.enabled, browserConfig.endpoint, browserConfig.keys, additionalBrowserModels, browserModelSelection], syncSourceModels, { deep: true });
function applySourceImage(event: Event) {
  if (!props.applyEnabled) return;
  const request = (event as CustomEvent<{ id: string; path: string; directory: string; completion?: Promise<void> }>).detail;
  request.completion = (async () => {
    if (!sourceEdit.value || sourceEditBusy.value) throw new Error("请等待当前操作完成后再应用素材");
    if (typeof request.id !== "string" || typeof request.path !== "string" || typeof request.directory !== "string") throw new Error("素材记录无效");
    await returnFromSourceEdit(true, { id: request.id, path: request.path, directory: request.directory });
    if (sourceEditError.value) throw new Error(sourceEditError.value);
  })();
}
function bindSourceWindow(event: Event) {
  sourceWindow?.removeEventListener("afxen:open-creation", openCreation);
  sourceWindow?.removeEventListener("afxen:generation-recorded", receiveSourceResult);
  sourceWindow?.removeEventListener("afxen:apply-source-image", applySourceImage);
  sourceWindow = (event.target as HTMLIFrameElement).contentWindow;
  sourceWindow?.addEventListener("afxen:open-creation", openCreation);
  sourceWindow?.addEventListener("afxen:generation-recorded", receiveSourceResult);
  sourceWindow?.addEventListener("afxen:apply-source-image", applySourceImage);
  syncSourceModels();
}
onBeforeUnmount(() => {
  sourceWindow?.removeEventListener("afxen:open-creation", openCreation);
  sourceWindow?.removeEventListener("afxen:generation-recorded", receiveSourceResult);
  sourceWindow?.removeEventListener("afxen:apply-source-image", applySourceImage);
});
</script>
<style scoped lang="scss">
.sourceViewportContainer { position: relative; display: flex; flex: 1; flex-direction: column; min-width: 0; min-height: 0; overflow: hidden; background: #1c1b21;
  .sourceLoading { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; gap: 8px; color: var(--el-text-color-secondary); font-size: 14px; }
}
.sourceEditorViewport { visibility: hidden; &.sourceReady { visibility: visible; } display: block; flex: 1; min-width: 0; min-height: 0; width: 100%; height: 100%; border: 0; }
</style>
