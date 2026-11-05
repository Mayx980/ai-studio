<template>
  <aside class="agentHistorySidebar" :class="{ collapsed: !conversationHistoryOpen }" aria-label="对话历史侧边栏" @click.self="conversationHistoryOpen = true">
    <button class="newChat" type="button" aria-label="新聊天" :disabled="busy || generationBusy" @click="newChat"><icon-message-plus :size="18" /><span>新聊天</span></button>
    <button class="historyToggle" type="button" aria-label="历史对话" :aria-expanded="conversationHistoryOpen" @click="conversationHistoryOpen = !conversationHistoryOpen"><icon-history :size="18" /><span>历史对话</span></button>
    <div v-if="conversationHistoryOpen" class="historyItems"><el-alert v-if="error" :title="error" type="error" :closable="false" /><button v-for="item in history" :key="item.directory + item.file" type="button" :disabled="busy || generationBusy" @click="open(item)">{{ item.name }}</button></div>
    <button v-if="conversationHistoryOpen" class="collapseHistory" type="button" aria-label="折叠历史对话侧边栏" @click="conversationHistoryOpen = false"><icon-layout-sidebar-left-collapse :size="18" /></button>
  </aside>
</template>
<script setup lang="ts">
import { inject, ref, watch } from "vue";
import { ElMessage } from "element-plus";
import { generationBusy } from "@/stores/browserGeneration";
import { useWorkspaceStore } from "@/stores/workspace";
import { conversationHistoryOpen } from "@/stores/navigation";
import { listBrowserConversations } from "@/components/agent/browserConversations";
const workspace = useWorkspaceStore();
const startNewProject = inject<(mode: "simple" | "professional") => Promise<void>>("startNewProject");
const openProject = inject<(directory: string) => Promise<void>>("openSidebarProject");
const history = ref<{ directory: string; file: string; name: string }[]>([]), busy = ref(false), error = ref("");
let request = 0;
watch(() => [conversationHistoryOpen.value, workspace.project?.directory], async () => {
  const version = ++request;
  if (!conversationHistoryOpen.value) return;
  error.value = "";
  try {
    const projects = [...workspace.projectList, ...workspace.draftProjects].filter(item => item.historyArchived);
    const lists = await Promise.all(projects.map(async project => (await listBrowserConversations(project.directory)).filter(item => item.messageCount > 0).map(item => ({ ...item, directory: project.directory }))));
    if (version === request) history.value = lists.flat().sort((a, b) => b.modified.localeCompare(a.modified));
  } catch (cause) { if (version === request) error.value = cause instanceof Error ? cause.message : "历史读取失败"; }
}, { immediate: true });
async function newChat() {
  if (busy.value || generationBusy.value || !startNewProject) return;
  busy.value = true;
  try { await startNewProject("simple"); conversationHistoryOpen.value = true; }
  catch (cause) { ElMessage.error(cause instanceof Error ? cause.message : "新聊天创建失败"); }
  finally { busy.value = false; }
}
async function open(item: { directory: string; file: string }) {
  if (busy.value || generationBusy.value || !openProject) return;
  busy.value = true;
  try { await openProject(item.directory); workspace.pendingAgentSession = { directory: item.directory, file: item.file }; workspace.creationMode = "simple"; }
  catch (cause) { ElMessage.error(cause instanceof Error ? cause.message : "对话打开失败"); }
  finally { busy.value = false; }
}
</script>
<style scoped lang="scss">
.agentHistorySidebar { position: absolute; inset: 0 auto 0 68px; width: 240px; box-sizing: border-box; padding: 24px 12px; background: #141414; border-right: 1px solid #292b30; display: flex; flex-direction: column; gap: 10px;
  button { display: flex; align-items: center; gap: 10px; border: 0; border-radius: 8px; background: transparent; color: #e5e7eb; padding: 10px; text-align: left; cursor: pointer; &:hover { background: #292b30; } }
  .collapseHistory { margin-top: auto; align-self: flex-end; }
  .newChat { background: #24242c; } .historyItems { min-height: 0; overflow: auto; button { width: 100%; overflow-wrap: anywhere; } }
  &.collapsed { width: 54px; padding: 24px 5px; button { padding: 12px; span { display: none; } } }
}
</style>
