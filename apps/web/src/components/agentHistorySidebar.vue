<template>
  <aside class="agentHistorySidebar" aria-label="对话历史侧边栏">
    <header><strong>历史对话</strong><div><el-tooltip :content="gallery ? '列表视图' : '图片和视频'"><button type="button" :aria-label="gallery ? '切换列表视图' : '切换图片视频视图'" @click="gallery = !gallery"><icon-list v-if="gallery" :size="18" /><icon-layout-grid v-else :size="18" /></button></el-tooltip><el-tooltip content="关闭"><button type="button" aria-label="关闭历史对话" @click="conversationHistoryOpen = false"><icon-x :size="18" /></button></el-tooltip></div></header>
    <el-alert v-if="error" :title="error" type="error" :closable="false" />
    <div v-if="gallery" class="historyGallery"><button v-for="item in media" :key="item.directory + item.file + item.id" class="historyCard" type="button" :disabled="busy || generationBusy" :aria-label="`查看对话 ${item.name}`" @click="open(item)"><video v-if="item.kind === 'video'" :src="item.url" muted playsinline preload="metadata" /><img v-else :src="item.url" :alt="item.name" /><span>{{ item.name }}</span></button></div>
    <div v-else class="historyItems"><button v-for="item in history" :key="item.directory + item.file" type="button" :disabled="busy || generationBusy" @click="open(item)">{{ item.name }}</button></div>
  </aside>
</template>
<script setup lang="ts">
import { inject, onBeforeUnmount, ref, watch } from "vue";
import { ElMessage } from "element-plus";
import { generationBusy } from "@/stores/browserGeneration";
import { useWorkspaceStore } from "@/stores/workspace";
import { conversationHistoryOpen } from "@/stores/navigation";
import { listBrowserConversations, readBrowserConversation } from "@/components/agent/browserConversations";
import useWorkspaceFiles from "@/lib/workspaceFiles";
import type { GenerationRecord } from "@/lib/generationHistory";
const workspace = useWorkspaceStore();
const openProject = inject<(directory: string, mode?: "simple") => Promise<void>>("openSidebarProject");
type HistoryItem = { directory: string; file: string; name: string };
const history = ref<HistoryItem[]>([]), media = ref<(HistoryItem & { id: string; kind: string; url: string })[]>([]);
const busy = ref(false), error = ref(""), gallery = ref(false);
let request = 0;
let releases: (() => void)[] = [];
function releaseMedia() { releases.forEach(release => release()); releases = []; }
onBeforeUnmount(() => { request++; releaseMedia(); });
watch(() => [conversationHistoryOpen.value, gallery.value, generationBusy.value, workspace.project?.directory, ...workspace.projectList.map(item => `${item.directory}:${item.historyArchived}`)], async () => {
  const version = ++request;
  if (!conversationHistoryOpen.value) return;
  error.value = "";
  const nextReleases: (() => void)[] = [];
  try {
    const projects = [...workspace.projectList, ...workspace.draftProjects].filter(item => item.historyArchived || gallery.value && item.directory === workspace.project?.directory);
    const lists = await Promise.all(projects.map(async project => (await listBrowserConversations(project.directory)).filter(item => item.messageCount > 0).map(item => ({ ...item, directory: project.directory }))));
    const items = lists.flat().sort((a, b) => b.modified.localeCompare(a.modified));
    const cards: typeof media.value = [];
    if (gallery.value) for (const item of items) {
      const files = useWorkspaceFiles(item.directory);
      const session = await readBrowserConversation(item.directory, item.file);
      const ids = new Set(session.messages.flatMap(message => message.browserResultIds ?? []));
      const hidden = await files.readJson<string[]>(".agent/hiddenResults.json").catch(cause => { if (cause.code === "ENOENT") return [] as string[]; throw cause; });
      const records = await files.readJson<GenerationRecord[]>(".agent/browserResults.json").catch(cause => { if (cause.code === "ENOENT") return [] as GenerationRecord[]; throw cause; });
      if (!Array.isArray(records) || !Array.isArray(hidden)) throw new Error("对话素材记录无效");
      for (const record of records.filter(record => ids.has(record.id) && !hidden.includes(record.id) && ["image", "video"].includes(record.kind))) {
        const handle = files.acquireUrl(record.path, record.mimeType ?? (record.kind === "video" ? "video/mp4" : "image/png"));
        nextReleases.push(handle.release);
        cards.push({ ...item, id: record.id, kind: record.kind, url: await handle.url });
      }
    }
    if (version === request) { releaseMedia(); releases = nextReleases; history.value = items; media.value = cards; }
    else nextReleases.forEach(release => release());
  } catch (cause) { nextReleases.forEach(release => release()); if (version === request) error.value = cause instanceof Error ? cause.message : "历史读取失败"; }
}, { immediate: true });
async function open(item: HistoryItem) {
  if (busy.value || generationBusy.value || !openProject) return;
  busy.value = true;
  try { await openProject(item.directory, "simple"); workspace.pendingAgentSession = { directory: item.directory, file: item.file }; workspace.creationMode = "simple"; }
  catch (cause) { ElMessage.error(cause instanceof Error ? cause.message : "对话打开失败"); }
  finally { busy.value = false; }
}
</script>
<style scoped lang="scss">
.agentHistorySidebar { position: absolute; inset: 0 0 0 auto; width: 300px; box-sizing: border-box; padding: 20px 12px; background: #141414; border-left: 1px solid #292b30; display: flex; flex-direction: column; gap: 14px;
  header { display: flex; align-items: center; justify-content: space-between; div { display: flex; gap: 4px; } }
  button { display: flex; align-items: center; gap: 8px; border: 0; border-radius: 8px; background: transparent; color: #e5e7eb; padding: 8px; text-align: left; cursor: pointer; &:hover { background: #292b30; } }
  .historyItems { min-height: 0; overflow: auto; button { width: 100%; overflow-wrap: anywhere; padding: 12px; } }
  .historyGallery { min-height: 0; overflow: auto; display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); align-content: start; gap: 10px;
    .historyCard { min-width: 0; display: flex; flex-direction: column; align-items: stretch; padding: 0; overflow: hidden; background: #232428; img, video { width: 100%; aspect-ratio: 1; object-fit: contain; background: #34373d; } span { padding: 8px; font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } }
  }
}
</style>
