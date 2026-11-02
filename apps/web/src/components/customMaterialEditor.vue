<template>
  <teleport to="body">
    <template v-if="request">
      <div class="materialBackdrop" aria-hidden="true" />
      <section class="customMaterialEditor" aria-label="自定义素材对话">
        <header><strong>自定义素材 · {{ request.label }}</strong><el-button text :disabled="generationBusy || applying || preparing" aria-label="关闭自定义素材对话" @click="materialEditorState = undefined"><icon-x :size="18" /></el-button></header>
        <p v-if="loading" role="status">正在打开独立素材对话…</p>
        <el-alert v-if="error" :title="error" type="error" :closable="false" />
        <conversation v-if="session" :key="session.file" class="materialConversation" :active="true" :initialSession="session" :sessionFile="session.file" :disabled="applying" creationModes materialEditor :materialDirectory="request.directory" :materialLabel="request.label" :materialRole="request.target.role" @materialBusy="preparing = $event" @applyMaterial="applyMaterial" />
      </section>
    </template>
  </teleport>
</template>
<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { IconX } from "@tabler/icons-vue";
import conversation from "@/components/agent/conversation.vue";
import { createBrowserConversation } from "@/components/agent/browserConversations";
import type { AgentConversation } from "@/components/agent/types";
import { materialEditorState } from "@/stores/materialEditor";
import { browserConfig, generationBusy } from "@/stores/browserGeneration";
const request = computed(() => materialEditorState.value);
const session = ref<AgentConversation>(), loading = ref(false), error = ref(""), applying = ref(false), preparing = ref(false);
watch(request, async (value, _previous, cleanup) => {
  session.value = undefined; error.value = ""; preparing.value = false;
  if (!value) return;
  let active = true;
  const { kind, ratio, imageSize, imageResolution, count, style, outputKind, outputChosen, duration, resolution } = browserConfig;
  cleanup(() => { active = false; Object.assign(browserConfig, { kind, ratio, imageSize, imageResolution, count, style, outputKind, outputChosen, duration, resolution }); });
  browserConfig.outputChosen = false; browserConfig.kind = "image"; browserConfig.outputKind = "image";
  loading.value = true;
  try {
    const result = await createBrowserConversation(value.directory);
    if (active) session.value = { ...result, creationMode: "simple" };
  } catch (failure) { if (active) error.value = failure instanceof Error ? failure.message : "独立素材对话打开失败"; }
  finally { if (active) loading.value = false; }
});
function applyMaterial(file: File) {
  if (!request.value || applying.value) return;
  applying.value = true; error.value = "";
  try { request.value.apply(file); materialEditorState.value = undefined; }
  catch (failure) { error.value = failure instanceof Error ? failure.message : "素材应用失败，当前对话已保留"; }
  finally { applying.value = false; }
}
</script>
<style scoped lang="scss">
.materialBackdrop { position: fixed; inset: 0; z-index: 1900; background: var(--el-overlay-color-lighter); }
.customMaterialEditor { position: fixed; z-index: 1901; right: 12px; top: 32px; bottom: 20px; width: calc(50vw - 20px); display: flex; flex-direction: column; background: var(--el-bg-color); border: 1px solid var(--el-border-color); border-radius: 14px; box-shadow: var(--el-box-shadow-light); overflow: hidden;
  header { display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; border-bottom: 1px solid var(--el-border-color-light); strong { font-size: 14px; } }
  .materialConversation { flex: 1; min-height: 0; }
  @media(max-width:700px) { top: 50dvh; left: 8px; right: 8px; bottom: 8px; width: auto; }
}
</style>
