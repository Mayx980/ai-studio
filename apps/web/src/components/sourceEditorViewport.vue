<template>
  <iframe class="sourceEditorViewport" :src="src" data-source-editor="true" title="素材来源编辑工作区" @load="bindSourceWindow" />
</template>
<script setup lang="ts">
import { onBeforeUnmount, watch } from "vue";
import { browserConfig, browserModelSelection, additionalBrowserModels, type BrowserModelConnection } from "@/stores/browserGeneration";
import { receiveSourceResult } from "@/stores/sourceEditing";
defineProps<{ src: string }>();
let sourceWindow: Window | null = null;
function syncSourceModels() {
  const connection: BrowserModelConnection = {
    enabled: browserConfig.enabled, endpoint: browserConfig.endpoint, keys: { ...browserConfig.keys },
    models: additionalBrowserModels.map(model => ({ ...model })), selection: { ...browserModelSelection },
  };
  sourceWindow?.dispatchEvent(new CustomEvent("afxen:source-models", { detail: connection }));
}
watch(() => [browserConfig.enabled, browserConfig.endpoint, browserConfig.keys, additionalBrowserModels, browserModelSelection], syncSourceModels, { deep: true });
function bindSourceWindow(event: Event) {
  sourceWindow?.removeEventListener("afxen:generation-recorded", receiveSourceResult);
  sourceWindow = (event.target as HTMLIFrameElement).contentWindow;
  sourceWindow?.addEventListener("afxen:generation-recorded", receiveSourceResult);
  syncSourceModels();
}
onBeforeUnmount(() => sourceWindow?.removeEventListener("afxen:generation-recorded", receiveSourceResult));
</script>
<style scoped lang="scss">
.sourceEditorViewport { display: block; flex: 1; min-width: 0; min-height: 0; width: 100%; height: 100%; border: 0; }
</style>
