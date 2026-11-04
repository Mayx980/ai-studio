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
          <div class="hoverActions"><el-tooltip content="保存到个人资产" placement="top"><el-button :disabled="busy" :aria-label="'保存到个人资产 ' + item.name" title="保存到个人资产" @click="run('save', [item])"><icon-folder-plus :size="16" /></el-button></el-tooltip><el-tooltip content="下载素材" placement="top"><el-button :disabled="busy" :aria-label="'下载 ' + item.name" title="下载素材" @click="run('download', [item])"><icon-download :size="16" /></el-button></el-tooltip><el-tooltip content="删除历史" placement="top"><el-button :disabled="busy" :aria-label="'删除 ' + item.name" title="删除历史" @click="run('delete', [item])"><icon-trash :size="16" /></el-button></el-tooltip></div>
        </article></div></div>
        <div v-if="selected.length" class="selectionToolbar" role="toolbar" aria-label="批量素材操作"><el-tooltip content="取消选择" placement="top"><el-button text :disabled="busy" aria-label="取消选择" @click="selected = []"><icon-x :size="16" /></el-button></el-tooltip><span>已选择 {{ selected.length }} 项</span><el-button :disabled="busy" @click="run('canvas')">去画布编辑</el-button><el-button :disabled="busy" @click="run('newCanvas')">新建画布添加</el-button><el-button :disabled="busy" @click="run('save')">保存到个人资产</el-button><el-tooltip content="下载素材" placement="top"><el-button :disabled="busy" aria-label="下载图片" title="下载素材" @click="run('download')"><icon-download :size="17" /></el-button></el-tooltip><el-tooltip content="删除所选历史" placement="top"><el-button :disabled="busy" type="danger" aria-label="删除所选历史" @click="run('delete')"><icon-trash :size="17" /></el-button></el-tooltip></div>
      </template>
      <personalAssetBrowser v-else />
    </div>
    <nav class="assetModules" aria-label="资产模块"><button type="button" :aria-current="module === 'history' ? 'page' : undefined" @click="module = 'history'"><icon-history :size="18" />生成历史<span>{{ items.length }}</span></button><button type="button" :aria-current="module === 'library' ? 'page' : undefined" @click="module = 'library'"><icon-folder :size="18" />个人资产库</button></nav>
    <el-dialog :modelValue="!!preview" class="generationDetail" width="min(1200px, 96vw)" alignCenter appendToBody destroyOnClose :showClose="false" @update:modelValue="preview = undefined">
      <div v-if="preview" class="generationPreview">
        <div class="previewMedia"><img v-if="preview.kind === 'image'" :src="preview.url" :alt="preview.name" /><video v-else-if="preview.kind === 'video'" :src="preview.url" controls playsinline /><audio v-else :src="preview.url" controls /></div>
        <aside class="previewInformation"><header><strong>{{ { image: '图片', video: '视频', audio: '音频' }[preview.kind] }}</strong><el-button text circle aria-label="关闭素材详情" @click="preview = undefined"><icon-x :size="17" /></el-button></header>
          <dl><template v-if="preview.createdAt"><dt>创建于</dt><dd>{{ new Date(preview.createdAt).toLocaleString() }}</dd></template><dt>生成模型</dt><dd>{{ preview.settings?.label || preview.model || '未记录' }}</dd></dl>
          <div class="promptHeading"><span>生成信息</span><el-tooltip content="复制生成信息"><el-button text circle aria-label="复制生成信息" :disabled="!preview.prompt" @click="copyPrompt"><icon-copy :size="16" /></el-button></el-tooltip></div>
          <p class="generationPrompt">{{ preview.prompt || '未记录提示词' }}</p>
          <dl v-if="preview.settings" class="generationSettings"><dt>模型 ID</dt><dd>{{ preview.settings.modelId }}</dd><dt>生成模式</dt><dd>{{ { text: '文本生成', singleImage: '首帧生成', reference: '参考素材' }[preview.settings.mode] }}</dd><dt>比例</dt><dd>{{ preview.settings.ratio || '自动' }}</dd><template v-if="preview.kind === 'image'"><dt>尺寸</dt><dd>{{ preview.settings.imageSize.replace('*', ' × ') }}</dd><dt>数量</dt><dd>{{ preview.settings.n }}</dd><dt v-if="preview.settings.style">风格</dt><dd v-if="preview.settings.style">{{ preview.settings.style }}</dd></template><template v-if="preview.kind === 'video'"><dt>清晰度</dt><dd>{{ preview.settings.resolution }}</dd><dt>时长</dt><dd>{{ preview.settings.duration === -1 ? '自动' : `${preview.settings.duration} 秒` }}</dd><dt>音频</dt><dd>{{ preview.settings.generateAudio ? '开启' : '关闭' }}</dd></template></dl>
          <div class="previewActions" role="toolbar" aria-label="素材操作"><el-tooltip v-for="action in detailActions" :key="action.value" :content="action.label"><el-button :aria-label="action.label" :disabled="busy" @click="run(action.value, [preview])"><component :is="action.icon" :size="19" /></el-button></el-tooltip></div>
        </aside>
      </div>
    </el-dialog>
    <saveAssetDialog ref="saveDialog" />
  </section>
</template>
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import saveAssetDialog from "@/components/saveAssetDialog.vue";
import { IconCopy, IconSquarePlus, IconEdit, IconFolderPlus, IconSortAscending, IconSortDescending, IconDownload, IconTrash, IconX } from "@tabler/icons-vue";
import { useRouter } from "vue-router";
import { useWorkspaceStore } from "@/stores/workspace";
import useWorkspaceFiles from "@/lib/workspaceFiles";
import { browserAssetMimeType } from "@/lib/browserAssets";
import saveFile from "@/lib/saveFile";
import personalAssetBrowser from "@/components/personalAssetBrowser.vue";
import { readGenerationSettings, type GenerationSettings } from "@/lib/generationHistory";
const saveDialog = ref<InstanceType<typeof saveAssetDialog>>();
type HistoryItem = { id: string; kind: "image" | "video" | "audio"; path: string; name: string; mimeType: string; prompt?: string; model?: string; settings?: GenerationSettings; createdAt?: number; directory: string; key: string; url: string };
const workspace = useWorkspaceStore(), router = useRouter();
const module = ref("history"), descending = ref(true), loading = ref(true), busy = ref(false), error = ref("");
const items = ref<HistoryItem[]>([]), selected = ref<string[]>([]), preview = ref<HistoryItem>();
const detailActions = [{ value: "newCanvas", label: "新建画布添加", icon: IconSquarePlus }, { value: "canvas", label: "去画布编辑", icon: IconEdit }, { value: "save", label: "保存到个人资产", icon: IconFolderPlus }, { value: "download", label: "下载素材", icon: IconDownload }, { value: "delete", label: "删除历史", icon: IconTrash }] as const;
async function copyPrompt() { try { await navigator.clipboard.writeText(preview.value?.prompt || ""); ElMessage.success("已复制生成信息"); } catch { ElMessage.error("复制失败，请重试"); } }
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
        items.value.push({ ...record, settings: readGenerationSettings(record.settings), name: record.name || record.path.split("/").at(-1), mimeType, createdAt: Number.isFinite(record.createdAt) && record.createdAt > 0 ? record.createdAt : undefined, directory: project.directory, key: `${project.directory}:${record.id}`, url });
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
    if (action === "save") {
      await saveDialog.value?.open(await Promise.all(targets.map(async item => ({ file: await fileFor(item), metadata: { source: "生成历史", prompt: item.prompt, model: item.model } }))));
      return;
    }
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

        completed++;
      }
    }
    if (action === "delete" && preview.value && !items.value.some(item => item.key === preview.value!.key)) preview.value = undefined;
    ElMessage.success(action === "download" ? `已发起 ${completed} 项下载` : `已完成 ${completed} 项`);
  } catch (cause) { ElMessage.error(`${completed ? `已完成 ${completed} 项；` : ""}${cause instanceof Error ? cause.message : "操作失败，请重试"}`); }
  finally { busy.value = false; }
}
</script>
<style scoped lang="scss">
.assetsPage { display: flex; min-height: calc(100dvh - 64px); gap: 24px; .assetContent { flex: 1; min-width: 0; padding-bottom: 90px; header { display: flex; align-items: center; justify-content: space-between; } h2 { font-size: 18px; } } .assetModules { width: 190px; flex: none; padding: 12px; border-left: 0; background: transparent; button { display: flex; align-items: center; gap: 10px; padding: 10px; width: 100%; border: 0; border-radius: 8px; background: transparent; color: inherit; cursor: pointer; &[aria-current="page"], &:hover { background: var(--el-fill-color); } span { margin-left: auto; color: var(--el-text-color-secondary); } } } .historyGroup { margin-top: 26px; h3 { font-size: 14px; font-weight: 500; } } .historyGrid { display: flex; flex-wrap: wrap; gap: 12px; } .historyCard { position: relative; width: 140px; height: 140px; border: 2px solid transparent; border-radius: 10px; overflow: hidden; &.selected { border-color: var(--el-color-primary); } .mediaPreview { display: grid; place-items: center; width: 100%; height: 100%; border: 0; padding: 0; background: var(--el-fill-color); color: inherit; cursor: pointer; img, video { width: 100%; height: 100%; object-fit: cover; } } input { position: absolute; top: 6px; left: 6px; accent-color: var(--el-color-primary); width: 17px; height: 17px; cursor: pointer; opacity: 0; } &:hover input, &:focus-within input, &.selected input { opacity: 1; } .hoverActions { position: absolute; bottom: 7px; inset-inline: 7px; display: flex; gap: 4px; opacity: 0; pointer-events: none; .el-button { flex: 1; margin: 0; padding: 6px; background: #222b; color: white; border: 0; backdrop-filter: blur(10px); } } &:hover .hoverActions, &:focus-within .hoverActions { opacity: 1; pointer-events: auto; } } .selectionToolbar { position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%); max-width: calc(100vw - 36px); z-index: 10; display: flex; align-items: center; gap: 8px; padding: 10px; border: 1px solid var(--el-border-color); border-radius: 14px; background: #272829; box-shadow: 0 8px 28px #0005; overflow-x: auto; white-space: nowrap; font-size: 12px; .el-button { margin: 0; border-color: transparent; background: transparent; color: #cfd3dc; &:hover { background: #ffffff12; border-color: transparent; } } } @media(max-width:800px) { flex-direction: column-reverse; .assetModules { width: auto; display: flex; border-left: 0; } } }
</style>

<style lang="scss">
.el-dialog.generationDetail { padding: 0; border-radius: 16px; overflow: hidden; .el-dialog__header { display: none; } .el-dialog__body { padding: 0; } .generationPreview { display: grid; grid-template-columns: minmax(0, 1fr) 320px; height: min(760px, 88dvh); .previewMedia { background: #141414; display: grid; place-items: center; min-width: 0; min-height: 0; img, video { width: 100%; height: 100%; object-fit: contain; } } .previewInformation { display: flex; flex-direction: column; padding: 16px; min-height: 0; overflow-y: auto; scrollbar-width: none; header, .promptHeading { display: flex; align-items: center; justify-content: space-between; } dl { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 12px; font-size: 12px; dt { color: var(--el-text-color-secondary); } dd { margin: 0; text-align: right; overflow-wrap: anywhere; } } .promptHeading { color: var(--el-text-color-secondary); } .generationPrompt { white-space: pre-wrap; overflow-wrap: anywhere; line-height: 1.6; margin-top: 4px; } .previewActions { margin-top: auto; padding-top: 24px; display: flex; flex-wrap: wrap; gap: 8px; .el-button { margin: 0; flex: 1; min-width: 40px; } } } } @media(max-width: 650px) { .generationPreview { grid-template-columns: 1fr; grid-template-rows: minmax(200px, 45%) 1fr; } } }
</style>
