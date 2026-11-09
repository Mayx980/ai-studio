<template>
  <transition name="materialWindow">
    <section v-show="!workspace.minimized" class="materialGenerationWindow" :aria-label="`独立生成对话 · ${workspace.label}`">
      <header><div><strong>{{ workspace.label }}</strong><small role="status">{{ materialStatusLabel(workspace) }}</small></div><div class="windowActions"><el-tooltip content="新建生成对话" :showArrow="false"><el-button text aria-label="新建生成对话" :disabled="!workspace.request" @click="newWorkspace"><icon-message-plus :size="18" /></el-button></el-tooltip><el-tooltip content="收起生成窗口" :showArrow="false"><el-button text aria-label="收起生成窗口" @click="minimizeMaterialWorkspace(workspace)"><icon-layout-sidebar-right-collapse :size="18" /></el-button></el-tooltip></div></header>
      <el-alert v-if="workspace.error" :title="workspace.error" type="warning" :closable="false" />
      <el-alert v-if="loadError" :title="loadError" type="error" :closable="false"><el-button text @click="loadSession">重新打开</el-button></el-alert>
      <p v-if="loading" role="status">正在打开独立生成对话…</p>
      <conversation v-if="session" :key="session.file" class="materialConversation" :active="!workspace.minimized" :initialSession="session" :initialDraft="initialDraft" :sessionFile="session.file" :disabled="applying || !!workspace.uncertain" creationModes materialEditor :materialDirectory="workspace.directory" :materialLabel="workspace.label" :materialRole="workspace.target.role" @draft="saveDraft" @generationState="updateTask" @applyMaterial="applyMaterial" />
    </section>
  </transition>
</template>
<script setup lang="ts">
import { onMounted, provide, ref, watch } from "vue";
import { IconLayoutSidebarRightCollapse, IconMessagePlus } from "@tabler/icons-vue";
import conversation from "@/components/agent/conversation.vue";
import { createBrowserConversation, readBrowserConversation } from "@/components/agent/browserConversations";
import type { AgentConversation, AgentAttachment } from "@/components/agent/types";
import { createMaterialWorkspace, materialStatusLabel, minimizeMaterialWorkspace, saveMaterialWorkspaces, type MaterialWorkspace, type MaterialTaskStatus } from "@/stores/materialEditor";
import useWorkspaceFiles from "@/lib/workspaceFiles";
import { browserConfig, restoreBrowserResults } from "@/stores/browserGeneration";
import { uploadNodeFile } from "@toonflow/nodes-scaffold/workspaceFiles";
const props = defineProps<{ workspace: MaterialWorkspace }>();
provide("generationConfig", props.workspace.config);
provide("generationModelSelection", props.workspace.modelSelection);
const session = ref<AgentConversation>(), loading = ref(false), loadError = ref(""), applying = ref(false);
const initialDraft = { prompt: props.workspace.prompt, attachments: props.workspace.attachments };
let draftQueue = Promise.resolve();
async function loadSession() {
  if (loading.value) return;
  loading.value = true; loadError.value = "";
  try {
    const item = props.workspace;
    session.value = item.sessionFile ? await readBrowserConversation(item.directory, item.sessionFile) : { ...await createBrowserConversation(item.directory), creationMode: "simple" };
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
  Object.assign(props.workspace, { status: task.status, error: task.error || "", taskId: task.taskId || props.workspace.taskId, vendorTaskId: task.vendorTaskId || props.workspace.vendorTaskId, resultIds: task.resultIds || props.workspace.resultIds });
  saveMaterialWorkspaces();
}
async function applyMaterial(file: File) {
  const item = props.workspace;
  if (applying.value) return;
  if (!item.request) { item.error = "原素材入口已不在当前页面，请返回对应项目的自定义素材入口后应用；生成结果已保留。"; return; }
  applying.value = true;
  try { await item.request.apply(file); minimizeMaterialWorkspace(item); }
  catch (error) { item.error = error instanceof Error ? error.message : "素材应用失败，对话已保留"; }
  finally { applying.value = false; saveMaterialWorkspaces(); }
}
</script>
<style scoped lang="scss">
.materialGenerationWindow { position: fixed; z-index: 1901; right: 12px; top: 12px; bottom: 12px; width: min(500px, calc(100vw - 24px)); display: flex; flex-direction: column; background: #1c1b21; border: 1px solid #494052; border-radius: 18px; box-shadow: -12px 12px 48px #0006; overflow: hidden;
  header { flex: none; display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 16px; border-bottom: 1px solid #ffffff0c; > div:first-child { display: flex; flex-direction: column; gap: 4px; min-width: 0; } strong { font-size: 14px; color: #e9e5f0; } small { font-size: 12px; color: #b4a7ca; } .windowActions { display: flex; align-items: center; } }
  > p { padding: 16px; }
  .materialConversation { flex: 1; min-height: 0; overflow: hidden; }
  @media(max-width:700px) { top: 8px; right: 8px; bottom: 8px; width: calc(100vw - 16px); }
}
.materialWindow-enter-active, .materialWindow-leave-active { transition: transform 240ms ease, opacity 240ms ease; }
.materialWindow-enter-from, .materialWindow-leave-to { transform: translateX(calc(100% + 16px)); opacity: 0; }
@media(prefers-reduced-motion:reduce) { .materialWindow-enter-active, .materialWindow-leave-active { transition: none; } }
</style>
