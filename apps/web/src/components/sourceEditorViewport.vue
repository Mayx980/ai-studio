<template>
  <iframe class="sourceEditorViewport" :src="src" data-source-editor="true" :data-source-application="applyEnabled ? 'true' : undefined" title="素材来源编辑工作区" @load="bindSourceWindow" />
</template>
<script setup lang="ts">
import { onBeforeUnmount, watch } from "vue";
import { browserConfig, browserModelSelection, additionalBrowserModels, type BrowserModelConnection } from "@/stores/browserGeneration";
import { receiveSourceResult, returnFromSourceEdit, sourceEdit, sourceEditBusy, sourceEditError } from "@/stores/sourceEditing";
const props = defineProps<{ src: string; applyEnabled?: boolean }>();
let sourceWindow: Window | null = null;
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
  sourceWindow?.removeEventListener("afxen:generation-recorded", receiveSourceResult);
  sourceWindow?.removeEventListener("afxen:apply-source-image", applySourceImage);
  sourceWindow = (event.target as HTMLIFrameElement).contentWindow;
  sourceWindow?.addEventListener("afxen:generation-recorded", receiveSourceResult);
  sourceWindow?.addEventListener("afxen:apply-source-image", applySourceImage);
  syncSourceModels();
}
onBeforeUnmount(() => {
  sourceWindow?.removeEventListener("afxen:generation-recorded", receiveSourceResult);
  sourceWindow?.removeEventListener("afxen:apply-source-image", applySourceImage);
});
</script>
<style scoped lang="scss">
.sourceEditorViewport { display: block; flex: 1; min-width: 0; min-height: 0; width: 100%; height: 100%; border: 0; }
</style>
