<template>
  <section class="assetsPage" aria-label="资产">
    <div class="assetContent">
      <template v-if="module === 'history'">
        <header><h2>生成历史</h2><el-dropdown @command="descending = $event === 'descending'"><el-button text :aria-label="descending ? '时间倒序' : '时间正序'" :title="descending ? '时间倒序' : '时间正序'"><component :is="descending ? IconSortDescending : IconSortAscending" :size="20" /></el-button><template #dropdown><el-dropdown-menu><el-dropdown-item command="ascending">时间正序</el-dropdown-item><el-dropdown-item command="descending">时间倒序</el-dropdown-item></el-dropdown-menu></template></el-dropdown></header>
        <el-alert v-if="error" :title="error" type="error" :closable="false" />
        <p v-if="loading" role="status">正在读取生成历史…</p>
        <div v-for="group in groups" :key="group.date" class="historyGroup"><h3>{{ group.date }}</h3><div class="historyGrid"><article v-for="item in group.items" :key="item.key" class="historyCard" :class="{ selected: selected.includes(item.key) }">
          <button class="mediaPreview" type="button" :aria-label="'预览 ' + item.name" @click="preview = item"><img v-if="item.kind === 'image'" :src="item.url" :alt="item.name" /><video v-else-if="item.kind === 'video'" :src="item.url" muted playsinline preload="metadata" /><icon-volume v-else :size="36" /></button>
          <input v-model="selected" type="checkbox" :value="item.key" :aria-label="'选择 ' + item.name" :disabled="busy" />
          <div class="hoverActions"><el-button :disabled="busy" :aria-label="'保存 ' + item.name" title="保存图片或素材" @click="run('download', [item])"><icon-download :size="16" /></el-button><el-button :disabled="busy" :aria-label="'删除 ' + item.name" title="删除历史" @click="run('delete', [item])"><icon-trash :size="16" /></el-button></div>
        </article></div></div>
        <div v-if="selected.length" class="selectionToolbar" role="toolbar" aria-label="批量素材操作"><el-button text :disabled="busy" aria-label="取消选择" @click="selected = []"><icon-x :size="16" /></el-button><span>已选择 {{ selected.length }} 项</span><el-button :disabled="busy" @click="run('canvas')">去画布编辑</el-button><el-button :disabled="busy" @click="run('newCanvas')">新建画布添加</el-button><el-button :disabled="busy" @click="run('save')">保存到资产</el-button><el-button :disabled="busy" aria-label="下载图片" title="下载素材" @click="run('download')"><icon-download :size="17" /></el-button><el-button :disabled="busy" type="danger" aria-label="删除所选历史" @click="run('delete')"><icon-trash :size="17" /></el-button></div>
      </template>
      <template v-else><h2>个人资产库</h2><assetLibrary page :modelValue="true" :directory="workspace.project?.directory" /></template>
    </div>
    <nav class="assetModules" aria-label="资产模块"><button type="button" :aria-current="module === 'history' ? 'page' : undefined" @click="module = 'history'"><icon-history :size="18" />生成历史<span>{{ items.length }}</span></button><button type="button" :aria-current="module === 'library' ? 'page' : undefined" @click="module = 'library'"><icon-folder :size="18" />个人资产库</button></nav>
    <el-image-viewer v-if="preview?.kind === 'image'" :urlList="[preview.url]" @close="preview = undefined" />
    <el-dialog :modelValue="!!preview && preview.kind !== 'image'" title="素材预览" appendToBody destroyOnClose @update:modelValue="preview = undefined"><video v-if="preview?.kind === 'video'" :src="preview.url" controls playsinline style="width:100%" /><audio v-else-if="preview" :src="preview.url" controls /></el-dialog>
  </section>
</template>
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import { IconSortAscending, IconSortDescending, IconDownload, IconTrash, IconX } from "@tabler/icons-vue";
import { useRouter } from "vue-router";
import { useWorkspaceStore } from "@/stores/workspace";
import useWorkspaceFiles from "@/lib/workspaceFiles";
import { browserAssetFiles, browserAssetMimeType } from "@/lib/browserAssets";
import saveFile from "@/lib/saveFile";
import assetLibrary from "@/pages/workspace/panels/canvas/components/assetLibrary.vue";
type HistoryItem = { id: string; kind: "image" | "video" | "audio"; path: string; name: string; mimeType: string; createdAt?: number; directory: string; key: string; url: string };
const workspace = useWorkspaceStore(), router = useRouter();
const module = ref("history"), descending = ref(true), loading = ref(true), busy = ref(false), error = ref("");
const items = ref<HistoryItem[]>([]), selected = ref<string[]>([]), preview = ref<HistoryItem>();
const releases: (() => void)[] = [];
let disposed = false;
onBeforeUnmount(() => { disposed = true; releases.forEach(release => release()); });
const groups = computed(() => {
  const sorted = [...items.value].sort((a, b) => (descending.value ? -1 : 1) * ((a.createdAt ?? 0) - (b.createdAt ?? 0)));
  const result = new Map<string, HistoryItem[]>();
  for (const item of sorted) { const date = item.createdAt ? new Date(item.createdAt).toLocaleDateString() : "未记录时间"; if (!result.has(date)) result.set(date, []); result.get(date)!.push(item); }
  return [...result].map(([date, entries]) => ({ date, items: entries }));
});
onMounted(async () => {
  const failures: string[] = [];
  for (const project of workspace.projectList) {
    if (disposed) return;
    try {
      const files = useWorkspaceFiles(project.directory);
      const records = await files.readJson<unknown>(".agent/browserResults.json").catch(cause => { if (cause.code === "ENOENT") return []; throw cause; });
      const hidden = await files.readJson<string[]>(".agent/hiddenResults.json").catch(cause => { if (cause.code === "ENOENT") return [] as string[]; throw cause; });
      if (!Array.isArray(records) || !Array.isArray(hidden) || hidden.some(id => typeof id !== "string")) throw new Error("历史记录格式无效");
      for (const record of records) {
        if (disposed) return;
        if (!record || typeof record.id !== "string" || typeof record.path !== "string" || !["image", "video", "audio"].includes(record.kind)) throw new Error("历史记录格式无效");
        if (hidden.includes(record.id)) continue;
        const mimeType = browserAssetMimeType(record.path);
        const handle = files.acquireUrl(record.path, mimeType); releases.push(handle.release);
        const url = await handle.url;
        if (disposed) { handle.release(); return; }
        items.value.push({ ...record, name: record.name || record.path.split("/").at(-1), mimeType, createdAt: Number.isFinite(record.createdAt) && record.createdAt > 0 ? record.createdAt : undefined, directory: project.directory, key: `${project.directory}:${record.id}`, url });
      }
    } catch { failures.push(project.name); }
  }
  if (failures.length) error.value = `部分项目历史读取失败：${failures.join("、")}`;
  loading.value = false;
});
async function fileFor(item: HistoryItem) { return new File([await useWorkspaceFiles(item.directory).read(item.path)], item.name, { type: item.mimeType }); }
async function run(action: "canvas" | "newCanvas" | "save" | "download" | "delete", targets = items.value.filter(item => selected.value.includes(item.key))) {
  if (busy.value || !targets.length) return;
  busy.value = true;
  let completed = 0;
  try {
    if (action === "delete") {
      const confirmed = await ElMessageBox.confirm("从生成历史中移除所选记录？画布和对话引用的素材将保留。", "删除历史", { confirmButtonText: "删除", cancelButtonText: "取消", type: "warning" }).then(() => true, () => false);
      if (!confirmed) return;
      for (const directory of new Set(targets.map(item => item.directory))) {
        const files = useWorkspaceFiles(directory);
        const hidden = await files.readJson<string[]>(".agent/hiddenResults.json").catch(cause => { if (cause.code === "ENOENT") return [] as string[]; throw cause; });
        if (!Array.isArray(hidden) || hidden.some(id => typeof id !== "string")) throw new Error("历史记录格式无效");
        const removed = targets.filter(item => item.directory === directory);
        await files.writeJson(".agent/hiddenResults.json", [...new Set([...hidden, ...removed.map(item => item.id)])]);
        const keys = new Set(removed.map(item => item.key)); items.value = items.value.filter(item => !keys.has(item.key)); selected.value = selected.value.filter(key => !keys.has(key)); completed += removed.length;
      }
    } else if (action === "canvas" || action === "newCanvas") {
      const files = await Promise.all(targets.map(fileFor));
      const project = action === "newCanvas" || !workspace.project ? await workspace.createProject() : workspace.project;
      workspace.creationMode = "professional";
      workspace.pendingCanvasEntry = { directory: project.directory, files };
      await router.push({ path: "/workspace", query: { returnSection: "assets" } });
      return;
    } else {
      for (const item of targets) {
        const file = await fileFor(item);
        if (action === "download") { if (!await saveFile(file, file.name)) break; }
        else {
          // ACT: 每项独立副本与唯一名称，避免覆盖资产库中已有同名文件。
          await browserAssetFiles().write(`${crypto.randomUUID()}-${file.name.replace(/[\\/]/g, "_")}`, file, true);
        }
        completed++;
      }
    }
    ElMessage.success(action === "download" ? `已发起 ${completed} 项下载` : `已完成 ${completed} 项`);
  } catch (cause) { ElMessage.error(`${completed ? `已完成 ${completed} 项；` : ""}${cause instanceof Error ? cause.message : "操作失败，请重试"}`); }
  finally { busy.value = false; }
}
</script>
<style scoped lang="scss">
.assetsPage { display: flex; min-height: calc(100dvh - 64px); gap: 24px; .assetContent { flex: 1; min-width: 0; padding-bottom: 90px; header { display: flex; align-items: center; justify-content: space-between; } h2 { font-size: 18px; } } .assetModules { width: 190px; flex: none; padding: 12px; border-left: 1px solid var(--el-border-color-light); button { display: flex; align-items: center; gap: 10px; padding: 10px; width: 100%; border: 0; border-radius: 8px; background: transparent; color: inherit; cursor: pointer; &[aria-current="page"], &:hover { background: var(--el-fill-color); } span { margin-left: auto; color: var(--el-text-color-secondary); } } } .historyGroup { margin-top: 26px; h3 { font-size: 14px; font-weight: 500; } } .historyGrid { display: flex; flex-wrap: wrap; gap: 12px; } .historyCard { position: relative; width: 140px; height: 140px; border: 2px solid transparent; border-radius: 10px; overflow: hidden; &.selected { border-color: var(--el-color-primary); } .mediaPreview { display: grid; place-items: center; width: 100%; height: 100%; border: 0; padding: 0; background: var(--el-fill-color); color: inherit; cursor: pointer; img, video { width: 100%; height: 100%; object-fit: cover; } } input { position: absolute; top: 6px; left: 6px; accent-color: var(--el-color-primary); width: 17px; height: 17px; cursor: pointer; } .hoverActions { position: absolute; bottom: 7px; inset-inline: 7px; display: flex; gap: 4px; opacity: 0; pointer-events: none; .el-button { flex: 1; margin: 0; padding: 6px; background: #222b; color: white; border: 0; backdrop-filter: blur(10px); } } &:hover .hoverActions, &:focus-within .hoverActions { opacity: 1; pointer-events: auto; } } .selectionToolbar { position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%); max-width: calc(100vw - 36px); z-index: 10; display: flex; align-items: center; gap: 8px; padding: 10px; border: 1px solid var(--el-border-color); border-radius: 14px; background: #272829; box-shadow: 0 8px 28px #0005; overflow-x: auto; white-space: nowrap; font-size: 12px; .el-button { margin: 0; } } @media(max-width:800px) { flex-direction: column-reverse; .assetModules { width: auto; display: flex; border-left: 0; } } }
</style>
