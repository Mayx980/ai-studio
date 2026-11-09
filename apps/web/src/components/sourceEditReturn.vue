<template>
  <teleport to="body">
    <el-alert v-if="sourceEditError && !sourceEdit" class="sourceEditRecoveryError" :title="sourceEditError" type="error" :closable="false" />
    <div v-for="url in sourceWindows" v-show="sourceEdit && sourceUrl === url" :key="url" class="sourceEditorWindow" role="dialog" aria-label="编辑素材来源"><iframe :src="url" title="素材来源编辑工作区" @load="bindSourceWindow" /></div>
    <section v-if="sourceEdit" class="sourceEditReturn" aria-label="参考素材编辑返回"><span :title="sourceEdit.name">编辑参考素材：{{ sourceEdit.name }}</span><el-button text :disabled="sourceEditBusy" @click="returnFromSourceEdit()"><icon-arrow-left :size="16" />关闭编辑</el-button><el-tooltip v-if="sourceEdit.result" content="应用最新生成结果并替换原素材" :showArrow="false"><el-button type="primary" :loading="sourceEditBusy" aria-label="应用编辑结果" @click="returnFromSourceEdit(true)"><icon-check :size="16" />应用</el-button></el-tooltip><p v-if="sourceEditError" role="alert">{{ sourceEditError }}</p></section>
  </teleport>
</template>
<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { IconArrowLeft, IconCheck } from "@tabler/icons-vue";
import { sourceEdit, sourceEditBusy, sourceEditError, restoreSourceEdit, returnFromSourceEdit, receiveSourceResult } from "@/stores/sourceEditing";
if (window.parent === window) restoreSourceEdit();
const sourceUrl = computed(() => {
  const origin = sourceEdit.value?.origin;
  if (!origin) return "";
  const query = new URLSearchParams({ returnSection: "assets", sourceType: origin.type, sourceDirectory: origin.directory, source: origin.type === "canvas" ? origin.nodeId : origin.sessionFile });
  if (origin.type === "canvas") query.set("canvasPath", origin.canvasPath);
  return `${window.location.pathname}#/workspace?${query}`;
});
const sourceWindows = ref<string[]>([]);
watch(sourceUrl, url => { if (url && !sourceWindows.value.includes(url)) sourceWindows.value.push(url); }, { immediate: true });
const boundWindows = new Set<Window>();
function bindSourceWindow(event: Event) {
  const sourceWindow = (event.target as HTMLIFrameElement).contentWindow;
  if (sourceWindow) { sourceWindow.addEventListener("afxen:generation-recorded", receiveSourceResult); boundWindows.add(sourceWindow); }
}
onBeforeUnmount(() => { for (const sourceWindow of boundWindows) sourceWindow.removeEventListener("afxen:generation-recorded", receiveSourceResult); });
</script>
<style scoped lang="scss">
.sourceEditorWindow { position: fixed; z-index: 1909; inset: 66px 20px 20px; overflow: hidden; border: 1px solid #494052; border-radius: 18px; background: #1c1b21; box-shadow: 0 12px 48px #0008; iframe { display: block; width: 100%; height: 100%; border: 0; } }
@media(max-width:600px) { .sourceEditorWindow { inset: 100px 8px 8px; } }
.sourceEditRecoveryError { position: fixed; z-index: 1910; top: 12px; left: 50%; transform: translateX(-50%); width: min(480px, calc(100vw - 24px)); }
.sourceEditReturn { position: fixed; z-index: 1910; top: 12px; left: 50%; transform: translateX(-50%); display: flex; flex-wrap: wrap; align-items: center; gap: 8px; max-width: calc(100vw - 24px); padding: 10px 14px; border: 1px solid #71549b; border-radius: 14px; background: #24202ff5; color: #e9e2f3; box-shadow: 0 8px 28px #0005; font-size: 12px;
  > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 240px; }
  p { flex-basis: 100%; margin: 0; color: #f56c6c; }
}
</style>
