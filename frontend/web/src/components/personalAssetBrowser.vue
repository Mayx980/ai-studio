<template>
  <section class="personalAssetBrowser" aria-label="个人资产库">
    <header><div class="breadcrumbs"><button type="button" @click="folder = ''">个人资产库</button><template v-for="crumb in breadcrumbs" :key="crumb.path"><span>/</span><button type="button" @click="folder = crumb.path">{{ crumb.name }}</button></template></div><div class="libraryActions"><el-input v-if="searchVisible" v-model="search" placeholder="搜索资产" aria-label="搜索资产" clearable /><el-button text :aria-expanded="searchVisible" aria-label="搜索资产" @click="searchVisible = !searchVisible"><icon-search :size="18" /></el-button><el-dropdown trigger="click" @command="create"><el-button :disabled="busy"><icon-plus :size="16" />新建</el-button><template #dropdown><el-dropdown-menu><el-dropdown-item command="upload">上传资产</el-dropdown-item><el-dropdown-item command="folder">新建文件夹</el-dropdown-item></el-dropdown-menu></template></el-dropdown></div></header>
    <input ref="uploadInput" class="uploadInput" type="file" accept="image/*,video/*,audio/*" multiple @change="upload" />
    <el-alert v-if="error" :title="error" type="error" :closable="false" />
    <div class="assetGrid"><article v-for="item in displayed" :key="item.path" class="assetCard" :class="{ selected: selected.includes(item.path) }"><button class="assetCover" type="button" :aria-label="(item.type === 'directory' ? '打开文件夹 ' : '预览 ') + item.name" @click="open(item)"><icon-folder-filled v-if="item.type === 'directory'" class="folderIcon" :size="58" /><img v-else-if="kind(item) === 'image'" :src="urls[item.path]" :alt="item.name" /><video v-else-if="kind(item) === 'video'" :src="urls[item.path]" muted playsinline preload="metadata" /><icon-music v-else :size="40" /></button><input v-model="selected" class="assetCheckbox" type="checkbox" :value="item.path" :aria-label="'选择 ' + item.name" :disabled="busy" /><h3 :title="item.name">{{ item.name }}</h3><small>{{ dateFor(item.path) }}</small></article></div>
    <div v-if="selected.length" class="selectionToolbar" role="toolbar" aria-label="资产批量操作"><el-tooltip content="取消选择" placement="top"><el-button text :disabled="busy" aria-label="取消选择" @click="selected = []"><icon-x :size="16" /></el-button></el-tooltip><span>已选择 {{ selected.length }} 项</span><el-tooltip content="删除"><el-button :disabled="busy" aria-label="删除所选资产" @click="remove(selectedEntries)"><icon-trash :size="18" /></el-button></el-tooltip><el-tooltip content="重命名"><el-button :disabled="busy || selected.length !== 1" aria-label="重命名" @click="rename"><icon-pencil :size="18" /></el-button></el-tooltip><el-tooltip content="移动到"><el-button :disabled="busy" aria-label="移动到" @click="destination = ''; moveVisible = true"><icon-folder-symlink :size="18" /></el-button></el-tooltip><el-tooltip content="修改标签"><el-button :disabled="busy" aria-label="修改标签" @click="editTags"><icon-tags :size="18" /></el-button></el-tooltip></div>
    <el-dialog :modelValue="!!preview" class="assetDetailDialog" width="min(1200px, 96vw)" alignCenter appendToBody destroyOnClose :showClose="false" @update:modelValue="preview = undefined"><div v-if="preview" class="assetDetail"><div class="detailMedia"><img v-if="kind(preview) === 'image'" :src="urls[preview.path]" :alt="preview.name" /><video v-else-if="kind(preview) === 'video'" :src="urls[preview.path]" controls playsinline /><audio v-else :src="urls[preview.path]" controls /></div><aside><header><h3>{{ preview.name }}</h3><el-button text aria-label="关闭资产详情" @click="preview = undefined"><icon-x :size="16" /></el-button></header><dl><dt>创建时间</dt><dd>{{ dateFor(preview.path, true) }}</dd><dt>资产来源</dt><dd>{{ assets.metadata[preview.path]?.source || '未记录' }}<template v-if="assets.metadata[preview.path]?.model"> · {{ assets.metadata[preview.path]?.model }}</template></dd></dl><h4>生成信息</h4><p class="generationInfo">{{ assets.metadata[preview.path]?.prompt || '未记录' }}</p><footer><el-button :disabled="busy" @click="addToCanvas([preview])">新建画布添加</el-button><div><el-button :disabled="busy" type="danger" @click="remove([preview])"><icon-trash :size="16" />删除</el-button><el-button :disabled="busy" @click="download([preview])"><icon-download :size="16" />下载</el-button></div></footer></aside></div></el-dialog>
    <el-dialog v-model="moveVisible" title="移动到" width="360px" appendToBody><el-select v-model="destination" aria-label="目标文件夹"><el-option label="个人资产库" value="" :disabled="selectedEntries.some(item => ['image', 'video'].includes(kind(item)))" /><el-option v-for="item in moveFolders" :key="item.path" :label="item.path" :value="item.path" /></el-select><template #footer><el-button :disabled="busy" @click="moveVisible = false">取消</el-button><el-button :loading="busy" @click="move">移动</el-button></template></el-dialog>
    <el-dialog v-model="tagsVisible" title="修改标签" width="400px" appendToBody><el-checkbox-group v-model="chosenTags"><el-checkbox-button v-for="tag in categories" :key="tag" :value="tag">{{ tag }}</el-checkbox-button></el-checkbox-group><template #footer><el-button @click="tagsVisible = false">取消</el-button><el-button @click="saveTags">保存</el-button></template></el-dialog>
    <saveAssetDialog ref="saveDialog" @saved="reload().catch(failure)" />
  </section>
</template>
<script setup lang="ts">
import { getWorkspaceFailure } from "@toonflow/nodes-scaffold/workspaceFiles";
import saveAssetDialog from "@/components/saveAssetDialog.vue";
import { flushSharedState } from "@/stores/sharedState";
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { ElMessage, ElMessageBox } from "element-plus";
import { browserAssetFiles, browserAssetMimeType, listBrowserAssets, type BrowserAssetEntry } from "@/lib/browserAssets";
import { useAssetStore } from "@/stores/assets";
import { useWorkspaceStore } from "@/stores/workspace";
import saveFile from "@/lib/saveFile";
type Entry = BrowserAssetEntry;
const assets = useAssetStore(), workspace = useWorkspaceStore(), router = useRouter();
const saveDialog = ref<InstanceType<typeof saveAssetDialog>>();
const entries = ref<Entry[]>([]), urls = ref<Record<string, string>>({}), folder = ref(""), search = ref(""), searchVisible = ref(false), busy = ref(true), error = ref("");
const selected = ref<string[]>([]), preview = ref<Entry>(), uploadInput = ref<HTMLInputElement>();
const moveVisible = ref(false), destination = ref(""), tagsVisible = ref(false), chosenTags = ref<string[]>([]);
const categories = ["场景", "物品", "风格", "音效", "角色"];
let disposed = false;
const releases: (() => void)[] = [];
onBeforeUnmount(() => { disposed = true; releases.forEach(release => release()); });
function flatten(items: Entry[]): Entry[] { return items.flatMap(item => [item, ...flatten(item.children ?? [])]); }
const all = computed(() => flatten(entries.value));
const folders = computed(() => all.value.filter(item => item.type === "directory"));
const breadcrumbs = computed(() => folder.value.split("/").filter(Boolean).map((name, index, parts) => ({ name, path: parts.slice(0, index + 1).join("/") })));
const displayed = computed(() => {
  const items = searchVisible.value && search.value.trim() ? all.value.filter(item => item.path.startsWith(folder.value ? folder.value + "/" : "") && item.name.toLowerCase().includes(search.value.trim().toLowerCase())) : folder.value ? all.value.find(item => item.path === folder.value)?.children ?? [] : entries.value;
  return items.filter(item => item.type === "directory" || kind(item));
});
const selectedEntries = computed(() => all.value.filter(item => selected.value.includes(item.path) && !selected.value.some(path => item.path.startsWith(path + "/"))));
const moveFolders = computed(() => folders.value.filter(item => !selectedEntries.value.some(source => item.path === source.path || item.path.startsWith(source.path + "/"))));
function kind(item: Entry) { const type = item.type === "file" ? browserAssetMimeType(item.path).split("/")[0] : ""; return type && ["image", "video", "audio"].includes(type) ? type : ""; }
function dateFor(path: string, detail = false) { const date = assets.metadata[path]?.createdAt; return date ? detail ? new Date(date).toLocaleString() : new Date(date).toLocaleDateString() : "未记录时间"; }
function open(item: Entry) { if (item.type === "directory") { folder.value = item.path; search.value = ""; } else preview.value = item; }
async function reload() {
  const next = await listBrowserAssets();
  const nextUrls: Record<string, string> = {}, nextReleases: (() => void)[] = [];
  try {
    for (const item of flatten(next).filter(item => item.type === "file" && ["image", "video", "audio"].includes(kind(item)))) {
      const handle = browserAssetFiles().acquireUrl(item.path, browserAssetMimeType(item.path)); nextReleases.push(handle.release); nextUrls[item.path] = await handle.url;
      if (disposed) { nextReleases.forEach(release => release()); return; }
    }
    releases.splice(0).forEach(release => release()); releases.push(...nextReleases); urls.value = nextUrls; entries.value = next;
    selected.value = selected.value.filter(path => flatten(next).some(item => item.path === path));
  } catch (cause) { nextReleases.forEach(release => release()); throw cause; }
}
onMounted(async () => {
  try {
    for (const name of categories) {
      try { await browserAssetFiles().mkdir(name); assets.metadata[name] = { createdAt: Date.now() }; }
      catch (cause) { if (getWorkspaceFailure(cause).code !== "EEXIST") throw cause; }
    }
    await reload();
  } catch (cause) { error.value = cause instanceof Error ? cause.message : "资产读取失败"; }
  finally { busy.value = false; }
});
function namePath(name: string, directory = folder.value) { if (!name.trim() || /[\\/]/.test(name) || [".", ".."].includes(name.trim())) throw new Error("名称不能为空，且不能包含斜杠或使用点目录"); return directory ? `${directory}/${name.trim()}` : name.trim(); }
function failure(cause: unknown) { if (cause !== "cancel" && cause !== "close") ElMessage.error(cause instanceof Error ? cause.message : "操作失败"); }
async function create(command: string | number | object) {
  if (busy.value) return;
  if (command === "upload") { uploadInput.value?.click(); return; }
  try {
    const result = await ElMessageBox.prompt("文件夹名称", "新建文件夹", { confirmButtonText: "创建", cancelButtonText: "取消", inputValidator: value => !!value?.trim() && !/[\\/]/.test(value) && ![".", ".."].includes(value.trim()) || "请输入有效文件夹名称" });
    busy.value = true; const path = namePath(result.value); await browserAssetFiles().mkdir(path); assets.metadata[path] = { createdAt: Date.now() }; await reload();
  } catch (cause) { failure(cause); } finally { busy.value = false; }
}
async function upload(event: Event) {
  const input = event.target as HTMLInputElement, files = Array.from(input.files ?? []); input.value = "";
  if (busy.value) return;
  const invalid = files.find(file => !/^(image|video|audio)\//.test(file.type) || !/^(image|video|audio)\//.test(browserAssetMimeType(file.name)));
  if (invalid) { failure(new Error(`${invalid.name}：仅支持图片、视频和音频`)); return; }
  if (!folder.value && files.some(file => /^(image|video)\//.test(file.type))) {
    await saveDialog.value?.open(files.map(file => ({ file, metadata: { source: "本地上传" } }))).catch(failure);
    return;
  }
  busy.value = true; let completed = 0; const directory = folder.value;
  try {
    for (const file of files) {
      if (!/^(image|video|audio)\//.test(file.type) || !/^(image|video|audio)\//.test(browserAssetMimeType(file.name))) throw new Error(`${file.name}：仅支持图片、视频和音频`);
      const path = namePath(file.name, directory); await browserAssetFiles().write(path, file, true); assets.metadata[path] = { createdAt: Date.now(), source: "本地上传" }; completed++;
    }
    await flushSharedState();
    ElMessage.success(`已上传 ${completed} 项`);
  } catch (cause) { ElMessage.error(`已上传 ${completed} 项；${cause instanceof Error ? cause.message : "上传失败"}`); }
  finally { try { await reload(); } catch (cause) { failure(cause); } busy.value = false; }
}
async function fileFor(item: Entry) { return new File([await browserAssetFiles().read(item.path)], item.name, { type: browserAssetMimeType(item.path) }); }
async function addToCanvas(items: Entry[]) {
  if (busy.value || !items.length) return; busy.value = true;
  try { const files = await Promise.all(items.map(fileFor)); const project = await workspace.createProject(); workspace.creationMode = "professional"; workspace.pendingCanvasEntry = { directory: project.directory, files }; await router.push({ path: "/workspace", query: { returnSection: "assets" } }); }
  catch (cause) { failure(cause); } finally { busy.value = false; }
}
async function download(items: Entry[]) {
  if (busy.value) return; busy.value = true;
  try { for (const item of items) if (!await saveFile(await fileFor(item), item.name)) break; } catch (cause) { failure(cause); } finally { busy.value = false; }
}
async function remove(items: Entry[]) {
  if (busy.value || !items.length) return; busy.value = true;
  try {
    await ElMessageBox.confirm(`删除所选 ${items.length} 项资产？`, "删除资产", { confirmButtonText: "删除", cancelButtonText: "取消", type: "warning" });
    for (const item of items) { await browserAssetFiles().remove(item.path, item.type === "directory"); for (const key of Object.keys(assets.metadata)) if (key === item.path || key.startsWith(item.path + "/")) delete assets.metadata[key]; for (const key of Object.keys(assets.tags)) if (key === item.path || key.startsWith(item.path + "/")) delete assets.tags[key]; if (preview.value?.path === item.path) preview.value = undefined; }
  } catch (cause) { failure(cause); }
  finally { try { await reload(); } catch (cause) { failure(cause); } busy.value = false; }
}
async function move() {
  if (busy.value) return; busy.value = true; let completed = 0; const directory = destination.value; const targets = [...selectedEntries.value];
  try {
    for (const item of targets) {
      const target = directory ? `${directory}/${item.name}` : item.name;
      if (target === item.path) continue;
      if (directory === item.path || directory.startsWith(item.path + "/")) throw new Error("不能移入自身或子文件夹");
      if (!directory && ["image", "video"].includes(kind(item))) throw new Error("图片和视频须放入文件夹");
      await browserAssetFiles().rename(item.path, target);
      moveMetadata(item.path, target); completed++;
    }
    await flushSharedState(); selected.value = []; moveVisible.value = false; ElMessage.success(`已移动 ${completed} 项`);
  } catch (cause) { ElMessage.error(`已移动 ${completed} 项；${cause instanceof Error ? cause.message : "移动失败"}`); }
  finally { try { await reload(); } catch (cause) { failure(cause); } busy.value = false; }
}
function moveMetadata(source: string, target: string) {
  for (const record of [assets.metadata, assets.tags]) for (const key of Object.keys(record)) if (key === source || key.startsWith(source + "/")) { (record as Record<string, unknown>)[target + key.slice(source.length)] = record[key]; delete record[key]; }
}
async function rename() {
  const item = selectedEntries.value[0];
  if (busy.value || selected.value.length !== 1 || !item) return;
  try {
    const result = await ElMessageBox.prompt("请输入新名称", "重命名", { inputValue: item.name, confirmButtonText: "保存", cancelButtonText: "取消", inputValidator: value => !!value?.trim() && !/[\\/]/.test(value) && ![".", ".."].includes(value.trim()) || "请输入有效名称" });
    const parent = item.path.split("/").slice(0, -1).join("/"), target = namePath(result.value, parent);
    if (target === item.path) return;
    if (item.type === "file" && browserAssetMimeType(target) !== browserAssetMimeType(item.path)) throw new Error("重命名请保留原文件扩展名");
    busy.value = true; await browserAssetFiles().rename(item.path, target); moveMetadata(item.path, target); selected.value = [target]; await reload();
  } catch (cause) { failure(cause); } finally { busy.value = false; }
}
function editTags() { chosenTags.value = [...new Set(selectedEntries.value.flatMap(item => assets.tags[item.path] ?? []))]; tagsVisible.value = true; }
async function saveTags() {
  try { for (const item of selectedEntries.value) assets.tags[item.path] = [...chosenTags.value]; await flushSharedState(); tagsVisible.value = false; }
  catch (cause) { failure(cause); }
}
</script>
<style scoped lang="scss">
.personalAssetBrowser { header { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 22px; } .breadcrumbs { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; button { padding: 0; border: 0; color: inherit; background: none; font-size: 15px; cursor: pointer; } span { color: var(--el-text-color-secondary); } } .libraryActions { display: flex; align-items: center; gap: 8px; .el-input { max-width: 220px; } } .uploadInput { display: none; } .assetGrid { display: flex; flex-wrap: wrap; gap: 20px 14px; } .assetCard { position: relative; width: 140px; min-width: 0; h3 { font-size: 12px; font-weight: 400; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin: 10px 4px 6px; } small { font-size: 11px; color: var(--el-text-color-secondary); margin-left: 4px; } .assetCover { display: grid; place-items: center; width: 140px; height: 140px; border: 2px solid transparent; padding: 0; background: #242526; border-radius: 12px; overflow: hidden; color: #b4b5b7; cursor: pointer; img, video { width: 100%; height: 100%; object-fit: contain; } .folderIcon { filter: drop-shadow(0 3px 3px #0003); } } .assetCheckbox { position: absolute; left: 8px; top: 8px; width: 17px; height: 17px; opacity: 0; accent-color: var(--el-color-primary); cursor: pointer; } &:hover .assetCheckbox, &:focus-within .assetCheckbox, &.selected .assetCheckbox { opacity: 1; } &.selected .assetCover { border-color: var(--el-color-primary); } } .selectionToolbar { position: fixed; bottom: 28px; left: 50%; transform: translateX(-50%); z-index: 10; display: flex; gap: 5px; align-items: center; max-width: calc(100vw - 32px); overflow-x: auto; white-space: nowrap; padding: 10px; border-radius: 16px; background: #28292b; border: 1px solid #3b3c3e; font-size: 12px; .el-button { margin: 0; border-color: transparent; background: transparent; &:hover { background: #ffffff12; border-color: transparent; } } } }
</style>
<style lang="scss">
.assetDetailDialog { padding: 0; overflow: hidden; border-radius: 18px; .el-dialog__header { display: none; } .el-dialog__body { padding: 0; } .assetDetail { display: flex; min-height: 70vh; .detailMedia { flex: 1; min-width: 0; display: grid; place-items: center; background: #171819; img, video { width: 100%; max-height: 80vh; object-fit: contain; } } aside { display: flex; flex-direction: column; width: 300px; flex: none; padding: 18px; background: var(--el-bg-color-overlay); header { display: flex; justify-content: space-between; align-items: center; gap: 12px; h3 { font-size: 14px; word-break: break-all; } } dl { display: grid; grid-template-columns: 75px 1fr; font-size: 12px; gap: 18px 8px; dt { color: var(--el-text-color-secondary); } dd { margin: 0; text-align: right; overflow-wrap: anywhere; } } h4 { font-size: 12px; color: var(--el-text-color-secondary); font-weight: 400; } .generationInfo { font-size: 12px; white-space: pre-wrap; max-height: 40vh; overflow-y: auto; overflow-wrap: anywhere; line-height: 1.6; } footer { margin-top: auto; padding-top: 24px; > .el-button { width: 100%; } > div { display: flex; gap: 8px; margin-top: 8px; .el-button { flex: 1; margin: 0; } } } } @media(max-width:700px) { flex-direction: column; aside { width: auto; } .detailMedia img, .detailMedia video { max-height: 45vh; } } } }
</style>
