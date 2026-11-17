<template>
  <section class="personalAssetBrowser" :class="{ selectionMode: selectable }" aria-label="个人资产库">
    <p v-if="selectable" class="pickerHint">选择素材添加到当前对话</p>

    <input ref="uploadInput" class="uploadInput" type="file" accept="image/*,video/*,audio/*" multiple @change="upload" />
    <el-alert v-if="error" :title="error" type="error" :closable="false" />
    <div class="pickerBody">
      <nav v-if="selectable" class="pickerFolders" aria-label="素材文件夹">
        <div class="folderRow">
          <button type="button" class="folderExpand" :aria-expanded="libraryExpanded" aria-label="展开或收起个人资产" @click="libraryExpanded = !libraryExpanded"><icon-chevron-right :size="12" :class="{ expanded: libraryExpanded }" /></button>
          <button type="button" class="folderName" :aria-current="source === 'library' && !folder ? 'page' : undefined" @click="chooseFolder('')"><icon-folder-filled :size="16" /><span>个人资产</span></button>
        </div>
        <div class="folderList">
        <div v-for="item in libraryExpanded ? visibleFolders : []" :key="item.path" class="folderRow" :style="{ paddingInlineStart: `${item.path.split('/').length * 12}px` }">
          <button v-if="item.children?.some(child => child.type === 'directory')" type="button" class="folderExpand" :aria-label="`${collapsedFolders.includes(item.path) ? '展开' : '收起'}${item.name}`" :aria-expanded="!collapsedFolders.includes(item.path)" @click="toggleFolder(item.path)"><icon-chevron-right :size="12" :class="{ expanded: !collapsedFolders.includes(item.path) }" /></button>
          <span v-else class="folderExpandSpacer" />
          <button type="button" class="folderName" :title="item.path" :aria-current="source === 'library' && folder === item.path ? 'page' : undefined" @click="chooseFolder(item.path)"><icon-folder-filled :size="16" /><span>{{ item.name }}</span></button>
        </div>
        </div>
        <button class="historyEntry" type="button" :aria-current="source === 'history' ? 'page' : undefined" @click="switchSource('history')"><icon-history :size="16" /><span>生成历史</span></button>
      </nav>
      <div class="pickerContent">
        <header><div class="breadcrumbs"><button type="button" @click="source === 'library' && (folder = '')">{{ source === 'history' ? '生成历史' : selectable ? '个人资产' : '个人资产库' }}</button><template v-if="source === 'library'"><template v-for="crumb in breadcrumbs" :key="crumb.path"><span>/</span><button type="button" @click="folder = crumb.path">{{ crumb.name }}</button></template></template></div><div class="pickerTools"><nav v-if="selectable" class="mediaFilters" aria-label="素材类型"><el-tooltip v-for="filter in mediaFilters" :key="filter.value" :disabled="!imagesOnly || filter.value !== 'video'" content="首尾帧仅支持图片"><button type="button" :aria-pressed="mediaFilter === filter.value" :disabled="imagesOnly && filter.value === 'video'" @click="mediaFilter = filter.value">{{ filter.label }}</button></el-tooltip></nav><div class="libraryActions"><el-input v-if="selectable || searchVisible" v-model="search" :placeholder="selectable ? searchPlaceholder : '搜索资产'" :aria-label="selectable ? searchPlaceholder : '搜索资产'" clearable /><el-button v-if="!selectable" text :aria-expanded="searchVisible" aria-label="搜索资产" @click="searchVisible = !searchVisible"><icon-search :size="18" /></el-button><el-dropdown v-if="!selectable || source === 'library'" trigger="click" @command="create"><el-button :disabled="busy || adding || matching"><icon-plus :size="16" />新建</el-button><template #dropdown><el-dropdown-menu><el-dropdown-item command="upload">上传资产</el-dropdown-item><el-dropdown-item command="folder">新建文件夹</el-dropdown-item></el-dropdown-menu></template></el-dropdown></div></div></header>
      <p v-if="selectable && sourceLoading" role="status">正在加载素材…</p>
      <el-alert v-if="selectable && source === 'history' && history.error.value" :title="history.error.value" type="warning" :closable="false" />
      <div ref="mediaGrid" class="assetGrid">
        <template v-for="(item, index) in displayed" :key="item.path">
        <h3 v-if="selectable && source === 'history' && (!index || dateFor(item.path) !== dateFor(displayed[index - 1]!.path))" class="historyDate" :class="{ hasSelection: (dateSelections.get(dateFor(item.path))?.selectedCount ?? 0) > 0 }"><span>{{ dateFor(item.path) }}</span><input type="checkbox" :checked="dateChecked(dateFor(item.path))" :indeterminate="datePartial(dateFor(item.path))" :aria-checked="datePartial(dateFor(item.path)) ? 'mixed' : dateChecked(dateFor(item.path))" :aria-label="`选择 ${dateFor(item.path)} 下当前显示的全部素材`" :disabled="operationLocked || history.loading.value" @change="toggleDate(dateFor(item.path), $event)" /></h3>
        <article class="assetCard" :class="{ selected: isSelected(item) }">
          <div class="cardMedia">
          <button class="assetCover" type="button" :disabled="selectable && (busy || adding || matching)" :aria-pressed="selectable ? isSelected(item) : undefined" :aria-label="(item.type === 'directory' ? '打开文件夹 ' : selectable ? '选择 ' : '预览 ') + item.name" @click="selectable ? toggleSelection(item) : open(item)">
            <icon-folder-filled v-if="item.type === 'directory'" class="folderIcon" :size="58" />
            <img v-else-if="kind(item) === 'image'" :src="urlFor(item)" :alt="item.name" />
            <assetVideoPreview v-else-if="kind(item) === 'video'" :src="urlFor(item)" />
            <icon-music v-else :size="40" />
          </button>
          <input v-if="!selectable || item.type === 'file'" class="assetCheckbox" type="checkbox" :checked="isSelected(item)" @change="toggleSelection(item, $event)" :aria-label="'选择 ' + item.name" :disabled="busy || adding || matching" />
          <button v-if="selectable" class="cardPreview" type="button" :aria-label="`预览 ${item.name}`" @click="open(item)"><icon-eye :size="14" />预览</button>
          </div>
          <h3 :title="item.name"><button v-if="selectable" class="cardName" type="button" :disabled="busy || adding || matching" :aria-pressed="isSelected(item)" @click="toggleSelection(item)">{{ item.name }}</button><template v-else>{{ item.name }}</template></h3>
          <small>{{ dateFor(item.path) }}</small>
        </article>
        </template>
      </div>
      <div v-if="selectable" class="pickerFooter">
        <div class="pickerSelection">
          <span class="selectionCount">已选 {{ selected.length }} 项，还可添加 {{ Math.max(0, selectionLimit - selected.length) }} 项</span>
          <div class="selectedCarousel" :class="{ hasPrevious: selectedStart > 0, hasNext: selectedStart < selectedMaxStart }">
            <button v-if="selectedEntries.length > selectedCapacity" class="selectedArrow previousArrow" type="button" aria-label="上一步，向左查看三个素材" :disabled="selectedStart === 0" @click="stepSelected(-1)"><icon-chevron-left :size="14" /></button>
            <div ref="selectedViewport" class="selectedAssetList" aria-label="已选素材">
              <div v-for="item in visibleSelected" :key="item.path" class="selectedAsset" :title="item.name">
                <button class="selectedPreview" type="button" :aria-label="`预览 ${item.name}`" @click="open(item)"><img v-if="kind(item) === 'image'" :src="urlFor(item)" :alt="item.name" /><assetVideoPreview v-else :src="urlFor(item)" /></button>
                <input class="selectedCheckbox" type="checkbox" :checked="true" :disabled="operationLocked" :aria-label="`取消选择 ${item.name}`" @change="toggleSelection(item, $event)" />
              </div>
            </div>
            <button v-if="selectedEntries.length > selectedCapacity" class="selectedArrow nextArrow" type="button" aria-label="下一步，向右查看三个素材" :disabled="selectedStart === selectedMaxStart" @click="stepSelected(1)"><icon-chevron-right :size="14" /></button>
          </div>
        </div>
        <div class="pickerActions" role="toolbar" aria-label="所选素材操作">
          <el-button :disabled="operationLocked || !selected.length" @click="selected = []">取消</el-button>
          <div class="fullActions"><el-tooltip v-for="action in pickerActions" :key="action.value" :content="action.hint"><span><el-button :class="{ deleteAction: action.value === 'delete' }" :disabled="operationLocked || !selected.length || action.disabled" :aria-label="action.label" @click="runPickerAction(action.value)"><component :is="action.icon" :size="15" /><span v-if="!['delete', 'download'].includes(action.value)">{{ action.label }}</span></el-button></span></el-tooltip></div>
          <el-dropdown class="compactActions" trigger="click" @command="runPickerAction"><el-button :disabled="operationLocked || !selected.length">更多</el-button><template #dropdown><el-dropdown-menu><el-dropdown-item v-for="action in pickerActions" :key="action.value" :command="action.value" :disabled="action.disabled" :title="action.hint">{{ action.label }}</el-dropdown-item></el-dropdown-menu></template></el-dropdown>
          <el-button type="primary" :disabled="operationLocked || !selected.length" :loading="adding" @click="addSelected()">{{ selected.length ? `添加（${selected.length}）` : '添加' }}</el-button>
        </div>
      </div>
      </div>
    </div>
    <div v-if="selected.length && !selectable" class="selectionToolbar" role="toolbar" aria-label="资产批量操作"><el-tooltip content="取消选择" placement="top"><el-button text :disabled="busy || adding || matching" aria-label="取消选择" @click="selected = []"><icon-x :size="16" /></el-button></el-tooltip><span>已选择 {{ selected.length }} 项</span><el-tooltip content="删除"><el-button :disabled="busy || adding || matching" aria-label="删除所选资产" @click="remove(selectedEntries)"><icon-trash :size="18" /></el-button></el-tooltip><el-tooltip content="重命名"><el-button :disabled="busy || selected.length !== 1" aria-label="重命名" @click="rename"><icon-pencil :size="18" /></el-button></el-tooltip><el-tooltip content="移动到"><el-button :disabled="busy || adding || matching" aria-label="移动到" @click="destination = ''; moveVisible = true"><icon-folder-symlink :size="18" /></el-button></el-tooltip><el-tooltip content="修改标签"><el-button :disabled="busy || adding || matching" aria-label="修改标签" @click="editTags"><icon-tags :size="18" /></el-button></el-tooltip></div>
    <el-dialog :modelValue="!!preview" class="assetDetailDialog" width="min(1200px, 96vw)" alignCenter appendToBody destroyOnClose :showClose="false" @update:modelValue="preview = undefined"><div v-if="preview" class="assetDetail"><div class="detailMedia"><img v-if="kind(preview) === 'image'" :src="urlFor(preview)" :alt="preview.name" /><video v-else-if="kind(preview) === 'video'" :src="urlFor(preview)" controls playsinline /><audio v-else :src="urlFor(preview)" controls /></div><aside><header><h3>{{ preview.name }}</h3><el-button text aria-label="关闭资产详情" @click="preview = undefined"><icon-x :size="16" /></el-button></header><dl><dt>创建时间</dt><dd>{{ dateFor(preview.path, true) }}</dd><dt>资产来源</dt><dd>{{ metadataFor(preview)?.source || '未记录' }}<template v-if="metadataFor(preview)?.model"> · {{ metadataFor(preview)?.model }}</template></dd></dl><h4>生成信息</h4><p class="generationInfo">{{ metadataFor(preview)?.prompt || '未记录' }}</p><footer><el-button v-if="selectable" type="primary" :loading="adding" :disabled="busy || adding || matching" @click="addSelected([preview])">添加</el-button><template v-else><el-button :disabled="busy || !metadataFor(preview)?.origin" :title="metadataFor(preview)?.origin ? '返回生成来源' : '外部上传或旧素材没有生成来源'" @click="editOrigin(preview)">去画布/对话编辑</el-button><el-button :disabled="busy || adding || matching" @click="addToCanvas([preview])">新建画布添加</el-button><div><el-button :disabled="busy || adding || matching" type="danger" @click="remove([preview])"><icon-trash :size="16" />删除</el-button><el-button :disabled="busy || adding || matching" @click="download([preview])"><icon-download :size="16" />下载</el-button></div></template></footer></aside></div></el-dialog>
    <el-dialog v-model="moveVisible" title="移动到" width="360px" appendToBody><el-select v-model="destination" aria-label="目标文件夹"><el-option label="个人资产库" value="" :disabled="selectedEntries.some(item => ['image', 'video'].includes(kind(item)))" /><el-option v-for="item in moveFolders" :key="item.path" :label="item.path" :value="item.path" /></el-select><template #footer><el-button :disabled="busy || adding || matching" @click="moveVisible = false">取消</el-button><el-button :loading="busy" @click="move">移动</el-button></template></el-dialog>
    <el-dialog v-model="tagsVisible" title="修改标签" width="400px" appendToBody><el-checkbox-group v-model="chosenTags"><el-checkbox-button v-for="tag in categories" :key="tag" :value="tag">{{ tag }}</el-checkbox-button></el-checkbox-group><template #footer><el-button @click="tagsVisible = false">取消</el-button><el-button @click="saveTags">保存</el-button></template></el-dialog>
    <saveAssetDialog ref="saveDialog" @savedItem="assetSaved" @closed="saveClosed" />
  </section>
</template>
<script setup lang="ts">
import { IconChevronRight, IconChevronLeft, IconEye, IconHistory, IconTrash, IconDownload, IconFolderSymlink, IconTags, IconFolderPlus } from "@tabler/icons-vue";
import assetVideoPreview from "@/components/assetVideoPreview.vue";
import saveAssetDialog from "@/components/saveAssetDialog.vue";
import { openGenerationOrigin, readGenerationOrigin, rememberFileOrigin, type GenerationOrigin } from "@/lib/generationOrigin";
import { computed, onBeforeUnmount, onMounted, ref, nextTick, watch } from "vue";
import { useRouter } from "vue-router";
import { ElMessage, ElMessageBox } from "element-plus";
import { browserAssetFiles, browserAssetMimeType, listBrowserAssets, type BrowserAssetEntry } from "@/lib/browserAssets";
import { useAssetStore } from "@/stores/assets";
import { useWorkspaceStore } from "@/stores/workspace";
import useWorkspaceFiles from "@/lib/workspaceFiles";
import useGenerationHistory, { type HistoryItem } from "@/lib/useGenerationHistory";
import saveFile from "@/lib/saveFile";
const props = withDefaults(defineProps<{ selectable?: boolean; selectionLimit?: number; imagesOnly?: boolean }>(), { selectionLimit: 10 });
const emit = defineEmits<{ select: [files: File[]] }>();
const adding = ref(false), matching = ref(false);
const collapsedFolders = ref<string[]>([]);
type Entry = BrowserAssetEntry & { history?: HistoryItem };
const source = ref<"library" | "history">("library");
const libraryExpanded = ref(true), mediaFilter = ref("all");
const mediaFilters = [{ value: "all", label: "全部" }, { value: "image", label: "图片" }, { value: "video", label: "视频" }];
const librarySearch = ref(""), historySearch = ref("");
const search = computed({ get: () => source.value === "history" ? historySearch.value : librarySearch.value, set: value => { if (source.value === "history") historySearch.value = value; else librarySearch.value = value; } });
const searchPlaceholder = computed(() => source.value === "history" ? "搜索生成历史" : folder.value ? "搜索当前文件夹" : "搜索个人资产");
const mediaGrid = ref<HTMLElement>();
const sourceScroll = { library: 0, history: 0 };
const history = useGenerationHistory();
const sourceLoading = computed(() => matching.value || (source.value === "history" ? history.loading.value : busy.value));
const aliases = ref<Record<string, string>>({});
const assets = useAssetStore(), workspace = useWorkspaceStore(), router = useRouter();
const saveDialog = ref<InstanceType<typeof saveAssetDialog>>();
const entries = ref<Entry[]>([]), urls = ref<Record<string, string>>({}), folder = ref(""), searchVisible = ref(false), busy = ref(true), error = ref("");
const selected = ref<string[]>([]), preview = ref<Entry>(), uploadInput = ref<HTMLInputElement>();
const moveVisible = ref(false), destination = ref(""), tagsVisible = ref(false), chosenTags = ref<string[]>([]);
const categories = ["场景", "物品", "风格", "音效", "角色"];
let disposed = false;
const releases: (() => void)[] = [];
onBeforeUnmount(() => { disposed = true; releases.forEach(release => release()); });
function flatten(items: Entry[]): Entry[] { return items.flatMap(item => [item, ...flatten(item.children ?? [])]); }
const all = computed(() => flatten(entries.value));
const folders = computed(() => all.value.filter(item => item.type === "directory"));
const visibleFolders = computed(() => folders.value.filter(item => !collapsedFolders.value.some(path => item.path.startsWith(path + "/"))));
function toggleFolder(path: string) {
  collapsedFolders.value = collapsedFolders.value.includes(path) ? collapsedFolders.value.filter(item => item !== path) : [...collapsedFolders.value, path];
}
const breadcrumbs = computed(() => folder.value.split("/").filter(Boolean).map((name, index, parts) => ({ name, path: parts.slice(0, index + 1).join("/") })));
const historyEntries = computed<Entry[]>(() => history.items.value.filter(item => item.kind !== "audio").map(item => ({ path: `history:${item.key}`, name: item.name, type: "file", history: item })));
const pickerEntries = computed<Entry[]>(() => [...all.value, ...historyEntries.value]);
const displayed = computed<Entry[]>(() => {
  if (props.selectable) {
    const items = source.value === "history" ? [...historyEntries.value].sort((a, b) => (b.history?.createdAt ?? 0) - (a.history?.createdAt ?? 0)) : folder.value ? all.value.find(item => item.path === folder.value)?.children ?? [] : all.value;
    return items.filter(item => item.type === "file" && (props.imagesOnly ? kind(item) === "image" : ["image", "video"].includes(kind(item))) && (mediaFilter.value === "all" || kind(item) === mediaFilter.value) && item.name.toLowerCase().includes(search.value.trim().toLowerCase()));
  }
  const items = searchVisible.value && search.value.trim() ? all.value.filter(item => item.path.startsWith(folder.value ? folder.value + "/" : "") && item.name.toLowerCase().includes(search.value.trim().toLowerCase())) : folder.value ? all.value.find(item => item.path === folder.value)?.children ?? [] : entries.value;
  return items.filter(item => item.type === "directory" || kind(item));
});
const selectedEntries = computed(() => props.selectable
  ? selected.value.flatMap(path => { const item = pickerEntries.value.find(item => item.path === path); return item ? [item] : []; })
  : all.value.filter(item => selected.value.includes(item.path) && !selected.value.some(path => item.path.startsWith(path + "/"))));
const selectedViewport = ref<HTMLElement>();
const selectedStart = ref(0), selectedCapacity = ref(7);
const selectedMaxStart = computed(() => Math.max(0, selectedEntries.value.length - selectedCapacity.value));
const visibleSelected = computed(() => selectedEntries.value.slice(selectedStart.value, selectedStart.value + selectedCapacity.value));
function stepSelected(direction: number) {
  selectedStart.value = Math.max(0, Math.min(selectedMaxStart.value, selectedStart.value + direction * 3));
}
watch(selectedViewport, (element, _previous, onCleanup) => {
  if (!element) return;
  function resizeSelected() { selectedCapacity.value = Math.max(1, Math.min(7, Math.floor((element!.clientWidth + 8) / 44))); }
  const observer = new ResizeObserver(resizeSelected);
  observer.observe(element);
  resizeSelected();
  onCleanup(() => observer.disconnect());
});
watch([selectedEntries, selectedCapacity], ([items], [previous, previousCapacity]) => {
  const atEnd = selectedStart.value >= Math.max(0, previous.length - previousCapacity);
  selectedStart.value = items.length > previous.length || atEnd ? selectedMaxStart.value : Math.min(selectedStart.value, selectedMaxStart.value);
}, { flush: "post" });
const dateSelections = computed(() => {
  const groups = new Map<string, { items: Entry[]; selectedCount: number }>();
  for (const item of displayed.value) {
    if (!item.history) continue;
    const date = dateFor(item.path);
    let group = groups.get(date);
    if (!group) { group = { items: [], selectedCount: 0 }; groups.set(date, group); }
    const key = aliases.value[item.path] ?? item.path;
    if (group.items.some(entry => (aliases.value[entry.path] ?? entry.path) === key)) continue;
    group.items.push(item);
    if (isSelected(item)) group.selectedCount++;
  }
  return groups;
});
function dateChecked(date: string) { const group = dateSelections.value.get(date); return !!group?.items.length && group.selectedCount === group.items.length; }
function datePartial(date: string) { const group = dateSelections.value.get(date); return !!group && group.selectedCount > 0 && group.selectedCount < group.items.length; }
function toggleDate(date: string, event: Event) {
  if (event.target instanceof HTMLInputElement) event.target.checked = dateChecked(date);
  if (operationLocked.value || history.loading.value) return;
  const group = dateSelections.value.get(date);
  if (!group) return;
  if (dateChecked(date)) {
    const keys = new Set(group.items.map(item => aliases.value[item.path] ?? item.path));
    selected.value = selected.value.filter(path => !keys.has(aliases.value[path] ?? path));
    return;
  }
  const remaining = props.selectionLimit - selected.value.length;
  const pending = group.items.filter(item => !isSelected(item));
  if (pending.length > remaining) { ElMessage.warning(`当前日期有 ${group.items.length} 项，还可添加 ${Math.max(0, remaining)} 项，请单独选择`); return; }
  selected.value = [...selected.value, ...pending.map(item => item.path)];
}
watch([folder, mediaFilter, search], () => { if (mediaGrid.value) mediaGrid.value.scrollTop = 0; }, { flush: "post" });
const operationLocked = computed(() => busy.value || adding.value || matching.value);
const selectionSource = computed(() => !selectedEntries.value.length ? source.value : selectedEntries.value.every(item => item.history) ? "history" : selectedEntries.value.every(item => !item.history) ? "library" : "mixed");
type PickerAction = "delete" | "download" | "move" | "tags" | "save";
const pickerActions = computed(() => [
  { value: "delete" as const, label: selectionSource.value === "history" ? "删除历史记录" : "删除", hint: selectionSource.value === "mixed" ? "请分别选择个人资产或生成历史进行删除" : selectionSource.value === "history" ? "删除历史记录，保留画布和对话引用素材" : "删除所选素材", disabled: selectionSource.value === "mixed", icon: IconTrash },
  { value: "download" as const, label: "下载", hint: "下载所选素材", disabled: false, icon: IconDownload },
  ...(selectionSource.value === "history" ? [{ value: "save" as const, label: "保存到资产", hint: "保存到个人资产", disabled: false, icon: IconFolderPlus }] : [
    { value: "move" as const, label: "移动到", hint: selectionSource.value === "mixed" ? "仅支持个人资产" : "移动到其他文件夹", disabled: selectionSource.value !== "library", icon: IconFolderSymlink },
    { value: "tags" as const, label: "修改标签", hint: selectionSource.value === "mixed" ? "仅支持个人资产" : "修改所选素材标签", disabled: selectionSource.value !== "library", icon: IconTags },
  ]),
]);
const moveFolders = computed(() => folders.value.filter(item => !selectedEntries.value.some(source => item.path === source.path || item.path.startsWith(source.path + "/"))));
function urlFor(item: Entry) { return item.history?.url ?? urls.value[item.path]; }
function metadataFor(item: Entry) { return item.history ? { ...item.history, source: "生成历史" } : assets.metadata[item.path]; }
function isSelected(item: Entry) { const key = aliases.value[item.path] ?? item.path; return selected.value.some(path => (aliases.value[path] ?? path) === key); }
async function switchSource(value: "library" | "history") {
  if (source.value === value) return;
  const previous = source.value;
  sourceScroll[previous] = mediaGrid.value?.scrollTop ?? 0;
  source.value = value;
  await nextTick();
  if (mediaGrid.value) mediaGrid.value.scrollTop = sourceScroll[value];
  if (value === "history") {
    await history.load();
    await linkDuplicateAssets();
    await nextTick();
    if (source.value === value && mediaGrid.value) mediaGrid.value.scrollTop = sourceScroll[value];
  }
}
function chooseFolder(path: string) {
  if (folder.value !== path) {
    librarySearch.value = "";
    sourceScroll.library = 0;
    if (source.value === "library" && mediaGrid.value) mediaGrid.value.scrollTop = 0;
  }
  folder.value = path;
  void switchSource("library");
}
// ACT: 仅校验同来源候选，每个文件最多100 MB；缓存指纹，不保留文件内容。
const contentHashes = new Map<string, Promise<string>>();
function contentHash(item: Entry) {
  let hash = contentHashes.get(item.path);
  if (!hash) {
    hash = fileFor(item).then(async file => {
      if (!file.size || file.size > 100 * 1024 * 1024) throw new Error("素材超过可添加大小");
      return [...new Uint8Array(await crypto.subtle.digest("SHA-256", await file.arrayBuffer()))].map(value => value.toString(16).padStart(2, "0")).join("");
    });
    contentHashes.set(item.path, hash);
    void hash.catch(() => contentHashes.delete(item.path));
  }
  return hash;
}
function originKey(origin?: GenerationOrigin) {
  if (!origin) return "";
  return JSON.stringify(origin.type === "canvas" ? [origin.type, origin.directory, origin.canvasPath, origin.nodeId] : [origin.type, origin.directory, origin.sessionFile, origin.messageId]);
}
async function linkDuplicateAssets() {
  if (matching.value || disposed) return;
  matching.value = true;
  try {
    const next = { ...aliases.value };
    for (const item of all.value.filter(item => item.type === "file" && assets.metadata[item.path]?.origin && !next[item.path])) {
      const origin = assets.metadata[item.path]?.origin;
      const candidates = historyEntries.value.filter(candidate => kind(candidate) === kind(item) && originKey(candidate.history?.origin) === originKey(origin));
      if (!candidates.length) continue;
      try {
        const hash = await contentHash(item);
        for (const candidate of candidates) {
          if (hash === await contentHash(candidate)) { next[item.path] = candidate.path; break; }
          if (disposed) return;
        }
      } catch { /* 无法校验内容时保留为独立素材。 */ }
      if (disposed) return;
    }
    aliases.value = next;
    const seen = new Set<string>();
    selected.value = selected.value.filter(path => { const key = next[path] ?? path; if (seen.has(key)) return false; seen.add(key); return true; });
  } finally { matching.value = false; }
}
watch(() => props.imagesOnly, value => { if (value && mediaFilter.value === "video") mediaFilter.value = "image"; });
function kind(item: Entry) { if (item.history) return item.history.kind; const type = item.type === "file" ? browserAssetMimeType(item.path).split("/")[0] : ""; return type && ["image", "video", "audio"].includes(type) ? type : ""; }
function toggleSelection(item: Entry, event?: Event) {
  if (event?.target instanceof HTMLInputElement) event.target.checked = isSelected(item);
  if (busy.value || adding.value || matching.value) return;
  const path = aliases.value[item.path] ?? item.path;
  if (isSelected(item)) { selected.value = selected.value.filter(item => (aliases.value[item] ?? item) !== path); return; }
  if (props.selectable && selected.value.length >= props.selectionLimit) { ElMessage.warning(props.selectionLimit === 1 ? "本次只能选择1个素材" : "最多添加10个参考图片/视频"); return; }
  selected.value = [...selected.value, item.path];
}
async function addSelected(items = selectedEntries.value) {
  if (busy.value || adding.value || matching.value || !items.length) return;
  if (items.length > props.selectionLimit) { ElMessage.warning("超出本次可添加的素材数量"); return; }
  adding.value = true;
  try {
    const files = await Promise.all(items.map(async item => {
      if (item.type !== "file" || !(props.imagesOnly ? kind(item) === "image" : ["image", "video"].includes(kind(item)))) throw new Error("请选择支持的图片或视频");
      const file = await fileFor(item);
      if (!file.size || file.size > 100 * 1024 * 1024) throw new Error(`${item.name}：请选择非空且不超过100 MB的素材`);
      return rememberFileOrigin(file, readGenerationOrigin(metadataFor(item)?.origin), item.history ? undefined : item.path);
    }));
    if (!disposed) emit("select", files);
  } catch (cause) { failure(cause); }
  finally { adding.value = false; }
}
function dateFor(path: string, detail = false) { const date = historyEntries.value.find(item => item.path === path)?.history?.createdAt ?? assets.metadata[path]?.createdAt; return date ? detail ? new Date(date).toLocaleString() : new Date(date).toLocaleDateString() : "未记录时间"; }
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
    selected.value = selected.value.filter(path => historyEntries.value.some(item => item.path === path) || flatten(next).some(item => item.path === path));
    if (props.selectable && historyEntries.value.length) await linkDuplicateAssets();
  } catch (cause) { nextReleases.forEach(release => release()); throw cause; }
}
onMounted(async () => {
  try {
    for (const name of categories) {
      try { await browserAssetFiles().mkdir(name); assets.metadata[name] = { createdAt: Date.now() }; }
      catch (cause) { if ((cause as { code?: string }).code !== "EEXIST") throw cause; }
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
    ElMessage.success(`已上传 ${completed} 项`);
  } catch (cause) { ElMessage.error(`已上传 ${completed} 项；${cause instanceof Error ? cause.message : "上传失败"}`); }
  finally { try { await reload(); } catch (cause) { failure(cause); } busy.value = false; }
}
async function runPickerAction(action: PickerAction) {
  if (operationLocked.value || !selectedEntries.value.length || pickerActions.value.find(item => item.value === action)?.disabled) return;
  const items = [...selectedEntries.value];
  if (action === "delete") { await remove(items); return; }
  if (action === "download") { await download(items); return; }
  if (action === "move") { destination.value = ""; moveVisible.value = true; return; }
  if (action === "tags") { editTags(); return; }
  busy.value = true;
  try {
    const sources = await Promise.all(items.map(async item => ({ file: await fileFor(item), metadata: { source: "生成历史", prompt: item.history?.prompt, model: item.history?.model, origin: item.history?.origin } })));
    savingEntries.clear();
    sources.forEach((source, index) => savingEntries.set(source.file, items[index]!.path));
    await saveDialog.value?.open(sources);
  } catch (cause) { failure(cause); }
  finally { busy.value = false; }
}
const savingEntries = new Map<File, string>();
async function saveClosed() {
  savingEntries.clear();
  try { await reload(); } catch (cause) { failure(cause); }
}
function assetSaved(file: File) {
  const path = savingEntries.get(file);
  if (path) { selected.value = selected.value.filter(item => item !== path); savingEntries.delete(file); }
}
async function fileFor(item: Entry) {
  const bytes = item.history ? await useWorkspaceFiles(item.history.directory).read(item.history.path) : await browserAssetFiles().read(item.path);
  return new File([bytes], item.name, { type: item.history?.mimeType ?? browserAssetMimeType(item.path) });
}
async function editOrigin(item: Entry) {
  if (busy.value) return;
  busy.value = true;
  try { const origin = readGenerationOrigin(assets.metadata[item.path]?.origin); if (!origin) throw new Error("该素材没有生成来源"); await openGenerationOrigin(origin, router); }
  catch (cause) { failure(cause); } finally { busy.value = false; }
}
async function addToCanvas(items: Entry[]) {
  if (busy.value || !items.length) return; busy.value = true;
  try { const files = await Promise.all(items.map(fileFor)); const project = await workspace.createProject(); workspace.creationMode = "professional"; workspace.pendingCanvasEntry = { directory: project.directory, files }; await router.push({ path: "/workspace", query: { returnSection: "assets" } }); }
  catch (cause) { failure(cause); } finally { busy.value = false; }
}
async function download(items: Entry[]) {
  if (operationLocked.value || !items.length) return;
  busy.value = true;
  const failed: Entry[] = [];
  let completed = 0;
  try {
    for (const [index, item] of items.entries()) {
      try {
        if (!await saveFile(await fileFor(item), item.name)) { failed.push(...items.slice(index)); break; }
        completed++;
      } catch { failed.push(item); }
    }
    if (failed.length && props.selectable) selected.value = failed.map(item => item.path);
    if (failed.length) ElMessage.warning(`已下载 ${completed} 项，${failed.length} 项失败或取消，已保留未完成项`);
    else ElMessage.success(`已发起 ${completed} 项下载`);
  } finally { busy.value = false; }
}
async function remove(items: Entry[]) {
  if (operationLocked.value || !items.length) return;
  const fromHistory = items.every(item => !!item.history);
  if (!fromHistory && items.some(item => item.history)) { ElMessage.warning("请分别选择个人资产或生成历史进行删除"); return; }
  busy.value = true;
  const failed: Entry[] = [];
  let completed = 0;
  try {
    const text = fromHistory ? `删除所选 ${items.length} 条历史记录？画布和对话引用的素材将保留。` : `删除所选 ${items.length} 项资产文件？此操作不可恢复。`;
    const confirmed = await ElMessageBox.confirm(text, fromHistory ? "删除历史记录" : "删除资产", { confirmButtonText: "删除", cancelButtonText: "取消", type: "warning" }).then(() => true, () => false);
    if (!confirmed) return;
    for (const item of items) {
      try {
        if (item.history) {
          const record = item.history, files = useWorkspaceFiles(record.directory);
          const hidden = await files.readJson<unknown>(".agent/hiddenResults.json").catch(cause => { if (cause.code === "ENOENT") return []; throw cause; });
          if (!Array.isArray(hidden) || hidden.some(id => typeof id !== "string")) throw new Error("历史记录格式无效");
          await files.writeJson(".agent/hiddenResults.json", [...new Set([...hidden, record.id])]);
          history.items.value = history.items.value.filter(entry => entry.key !== record.key);
          for (const path of Object.keys(aliases.value)) if (aliases.value[path] === item.path) delete aliases.value[path];
        } else {
          await browserAssetFiles().remove(item.path, item.type === "directory");
          for (const data of [assets.metadata, assets.tags]) for (const key of Object.keys(data)) if (key === item.path || key.startsWith(item.path + "/")) delete data[key];
          delete aliases.value[item.path]; contentHashes.delete(item.path);
        }
        if (preview.value?.path === item.path) preview.value = undefined;
        selected.value = selected.value.filter(path => path !== item.path);
        completed++;
      } catch { failed.push(item); }
    }
    if (failed.length) { selected.value = failed.map(item => item.path); ElMessage.warning(`已删除 ${completed} 项，${failed.length} 项失败，已保留失败项`); }
    else ElMessage.success(`已删除 ${completed} 项`);
  } catch (cause) { failure(cause); }
  finally { if (!fromHistory) { try { await reload(); } catch (cause) { failure(cause); } } busy.value = false; }
}
async function move() {
  if (operationLocked.value || selectedEntries.value.some(item => item.history)) return;
  const directory = destination.value, targets = [...selectedEntries.value];
  if (!targets.length) return;
  busy.value = true;
  const failed: Entry[] = [], moved: string[] = [];
  try {
    for (const item of targets) {
      try {
        const target = directory ? `${directory}/${item.name}` : item.name;
        if (directory === item.path || directory.startsWith(item.path + "/")) throw new Error("不能移入自身或子文件夹");
        if (!directory && ["image", "video"].includes(kind(item))) throw new Error("图片和视频须放入文件夹");
        if (target !== item.path) {
          await browserAssetFiles().rename(item.path, target);
          moveMetadata(item.path, target);
          if (aliases.value[item.path]) { aliases.value[target] = aliases.value[item.path]!; delete aliases.value[item.path]; }
          contentHashes.delete(item.path); contentHashes.delete(target);
          if (preview.value?.path === item.path) preview.value = undefined;
        }
        moved.push(target);
      } catch { failed.push(item); }
    }
    selected.value = failed.length ? failed.map(item => item.path) : props.selectable ? moved : [];
    moveVisible.value = false;
    if (failed.length) ElMessage.warning(`已移动 ${moved.length} 项，${failed.length} 项失败，已保留失败项`);
    else ElMessage.success(`已移动 ${moved.length} 项`);
  } finally { try { await reload(); } catch (cause) { failure(cause); } busy.value = false; }
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
function editTags() { if (operationLocked.value || selectedEntries.value.some(item => item.history)) return; chosenTags.value = [...new Set(selectedEntries.value.flatMap(item => assets.tags[item.path] ?? []))]; tagsVisible.value = true; }
function saveTags() { if (operationLocked.value || selectedEntries.value.some(item => item.history)) return; for (const item of selectedEntries.value) assets.tags[item.path] = [...chosenTags.value]; tagsVisible.value = false; }
</script>
<style scoped lang="scss">
.personalAssetBrowser {
  &.selectionMode {
    height: min(480px, calc(80dvh - 110px));
    min-height: 0;
    display: flex;
    flex-direction: column;
    .assetGrid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(min(132px, 100%), 1fr));
      gap: 20px 16px;
      flex: 1;
      min-height: 0;
      align-content: start;
      align-items: start;
      grid-auto-rows: max-content;
      overflow-y: auto;
      scroll-padding-block: 4px;
      padding: 4px 6px 4px 0;
    }
    .assetGrid, .folderList {
      scrollbar-width: thin;
      scrollbar-color: #ffffff20 transparent;
      &::-webkit-scrollbar { width: 4px; height: 4px; }
      &::-webkit-scrollbar-thumb { border-radius: 4px; background: #ffffff20; }
      &:hover { scrollbar-color: #ffffff40 transparent; }
      &:hover::-webkit-scrollbar-thumb { background: #ffffff40; }
    }
    .pickerContent {
      container-type: inline-size;
      display: flex;
      flex: 1;
      flex-direction: column;
      min-width: 0;
      min-height: 0;
      > header { display: block; margin-bottom: 14px; flex-shrink: 0; }
      .breadcrumbs { margin-bottom: 12px; }
      .pickerTools { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px; }
      .mediaFilters { display: flex; gap: 4px;
        button { padding: 6px 12px; border: 0; border-radius: 16px; background: transparent; color: var(--el-text-color-secondary); font: inherit; font-size: 13px; cursor: pointer;
          &[aria-pressed="true"], &:hover:enabled { color: var(--el-text-color-primary); background: var(--el-fill-color); }
          &:disabled { opacity: .4; cursor: not-allowed; }
          &:focus-visible { outline: 1px solid var(--el-color-primary); }
        }
      }
      .historyDate {
        grid-column: 1 / -1; display: flex; align-items: center; gap: 8px; margin: 4px 0 -8px; min-height: 20px; font-size: 12px; color: var(--el-text-color-secondary); font-weight: 500;
        input { width: 14px; height: 14px; margin: 0; opacity: 0; accent-color: var(--el-color-primary); cursor: pointer; }
        &:hover input, &:focus-within input, &.hasSelection input { opacity: 1; }
      }
    }
    .pickerHint { margin: 0 0 10px; color: #8e9199; font-size: 12px; flex-shrink: 0; }
    .libraryActions {
      flex-wrap: wrap;
      min-width: 0;
      max-width: 100%;
      .el-input { width: 180px; max-width: 100%; min-width: 0; --el-input-height: 32px; }
      .el-button { height: 32px; border-color: #ffffff18; background: #18191b; }
    }
    .assetCard {
      width: auto;
      .cardMedia { display: block; position: relative; aspect-ratio: 1; }
      .assetCover { box-sizing: border-box; width: 100%; height: 100%; }
      h3 { margin: 8px 2px 3px; }
      small { margin-left: 2px; font-size: 10px; color: #80848c; }
      .cardName { width: 100%; padding: 0; border: 0; background: transparent; color: inherit; font: inherit; text-align: left; cursor: pointer; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .cardPreview { position: absolute; bottom: 8px; right: 8px; display: flex; align-items: center; gap: 4px; padding: 4px 7px; border: 0; border-radius: 6px; background: #17191ddd; color: #fff; font-size: 12px; opacity: 0; pointer-events: none; cursor: pointer; }
      &:hover .cardPreview, &:focus-within .cardPreview { opacity: 1; pointer-events: auto; }
      &:not(.selected) .assetCheckbox { opacity: 0; }
      .cardMedia:hover .assetCheckbox, .cardMedia:focus-within .assetCheckbox, &.selected .assetCheckbox { opacity: 1; }
      .assetCover:focus-visible, .cardName:focus-visible, .cardPreview:focus-visible { outline: 2px solid var(--el-color-primary); outline-offset: -2px; }
    }
    @media (hover: none) { .assetCard .cardPreview { opacity: 1; pointer-events: auto; } }
    .pickerBody {
      display: flex;
      flex: 1;
      min-height: 0;
      gap: 20px;
      .pickerFolders {
        width: 180px;
        max-width: 35%;
        flex: none;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        padding: 6px;
        box-sizing: border-box;
        border-radius: 10px;
        background: #1a1a1a;
        .folderRow { display: flex; align-items: center; min-width: 0; flex-shrink: 0; }
        .folderList { flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden; }
        .historyEntry { flex-shrink: 0; margin-top: 6px; margin-bottom: 0; }
        .folderExpand, .folderExpandSpacer { flex: none; width: 20px; }
        .folderExpand { padding: 0; justify-content: center; }
        .folderExpandSpacer { display: block; }
        .folderName { flex: 1; min-width: 0; }
        .folderExpand svg.expanded { transform: rotate(90deg); }
        button {
          display: flex;
          align-items: center;
          gap: 8px;
          width: 100%;
          height: 36px;
          box-sizing: border-box;
          margin-bottom: 2px;
          padding: 8px 10px;
          border: 0;
          border-radius: 8px;
          background: transparent;
          color: var(--el-text-color-secondary);
          font: inherit;
          font-size: 13px;
          text-align: left;
          cursor: pointer;
          svg { flex: none; }
          span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
          &:hover { color: var(--el-text-color-primary); background: #242529; }
          &[aria-current="page"] { color: var(--el-text-color-primary); background: #2b2d32; }
          &:focus-visible { outline: 1px solid var(--el-color-primary); outline-offset: -1px; }
        }
      }
      .assetGrid { min-width: 0; }
    }
    .pickerFooter {
      display: flex;
      flex: none;
      align-items: flex-end;
      gap: 12px;
      min-height: 76px;
      margin-top: 12px;
      padding-top: 12px;
      border-top: 1px solid var(--el-border-color);
      .pickerSelection { flex: 1; min-width: 0; }
      .selectionCount { color: var(--el-text-color-secondary); font-size: 11px; }
      .selectedCarousel {
        position: relative; width: min(100%, 336px); padding: 0 18px; box-sizing: border-box;
        .selectedAssetList { display: flex; gap: 8px; min-height: 44px; padding: 4px 0; overflow: hidden; box-sizing: border-box; :deep(.videoDuration) { display: none; } }
        .selectedAsset { position: relative; flex: none; width: 36px; height: 36px;
          .selectedPreview { width: 100%; height: 100%; border: 0; padding: 0; border-radius: 6px; overflow: hidden; background: #282828; cursor: pointer; img { width: 100%; height: 100%; object-fit: cover; } }
          .selectedCheckbox { position: absolute; left: 2px; top: 2px; width: 13px; height: 13px; margin: 0; accent-color: var(--el-color-primary); opacity: 0; cursor: pointer; }
          &:hover .selectedCheckbox, &:focus-within .selectedCheckbox { opacity: 1; }
        }
        .selectedArrow { position: absolute; top: 4px; z-index: 2; display: grid; place-items: center; width: 18px; height: 36px; padding: 0; border: 0; border-radius: 4px; background: #222; color: #eee; opacity: 0; pointer-events: none; cursor: pointer;
          &:disabled { color: #666; cursor: default; }
        }
        .previousArrow { left: 0; } .nextArrow { right: 0; }
        &:hover .selectedArrow, &:focus-within .selectedArrow { opacity: 1; pointer-events: auto; }
        &.hasPrevious::before, &.hasNext::after { content: ""; position: absolute; top: 4px; bottom: 4px; z-index: 1; width: 6px; pointer-events: none; }
        &.hasPrevious::before { left: 18px; background: linear-gradient(to right, var(--el-dialog-bg-color, #202020), transparent); }
        &.hasNext::after { right: 18px; background: linear-gradient(to left, var(--el-dialog-bg-color, #202020), transparent); }
      }
      .pickerActions { display: flex; flex: none; align-items: center; gap: 6px; padding-bottom: 4px;
        .el-button { margin: 0; height: 32px; padding: 7px 9px; }
        .fullActions { display: flex; align-items: center; gap: 6px; .el-button { gap: 4px; } }
        .deleteAction { color: #ee7777; }
        .compactActions { display: none; }
      }
    }
    @container (max-width: 680px) {
      .pickerFooter .pickerActions { .fullActions { display: none; } .compactActions { display: inline-flex; } }
    }
    @container (max-width: 320px) {
      .pickerFooter { flex-direction: column; align-items: stretch; .pickerActions { flex-wrap: wrap; justify-content: flex-end; } }
    }
    @media (hover: none) { .pickerFooter .selectedCarousel { .selectedArrow { opacity: 1; pointer-events: auto; } .selectedAsset .selectedCheckbox { opacity: 1; } } .pickerContent .historyDate input { opacity: 1; } }

  }
  .pickerBody, .pickerContent, .pickerTools, .cardMedia { display: contents; }
  header { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 22px; } .breadcrumbs { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; button { padding: 0; border: 0; color: inherit; background: none; font-size: 15px; cursor: pointer; } span { color: var(--el-text-color-secondary); } } .libraryActions { display: flex; align-items: center; gap: 8px; .el-input { max-width: 220px; } } .uploadInput { display: none; } .assetGrid { display: flex; flex-wrap: wrap; gap: 20px 14px; } .assetCard { position: relative; width: 140px; min-width: 0; h3 { font-size: 12px; font-weight: 400; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin: 10px 4px 6px; } small { font-size: 11px; color: var(--el-text-color-secondary); margin-left: 4px; } .assetCover { display: grid; place-items: center; width: 140px; height: 140px; border: 2px solid transparent; padding: 0; background: #242526; border-radius: 12px; overflow: hidden; color: #b4b5b7; cursor: pointer; img, video { width: 100%; height: 100%; object-fit: contain; } .folderIcon { filter: drop-shadow(0 3px 3px #0003); } } .assetCheckbox { position: absolute; left: 8px; top: 8px; width: 17px; height: 17px; opacity: 0; accent-color: var(--el-color-primary); cursor: pointer; } &:hover .assetCheckbox, &:focus-within .assetCheckbox, &.selected .assetCheckbox { opacity: 1; } &.selected .assetCover { border-color: var(--el-color-primary); } } .selectionToolbar { position: fixed; bottom: 28px; left: 50%; transform: translateX(-50%); z-index: 10; display: flex; gap: 5px; align-items: center; max-width: calc(100vw - 32px); overflow-x: auto; white-space: nowrap; padding: 10px; border-radius: 16px; background: #28292b; border: 1px solid #3b3c3e; font-size: 12px; .el-button { margin: 0; border-color: transparent; background: transparent; &:hover { background: #ffffff12; border-color: transparent; } } } }
</style>
<style lang="scss">
.assetDetailDialog { padding: 0; overflow: hidden; border-radius: 18px; .el-dialog__header { display: none; } .el-dialog__body { padding: 0; } .assetDetail { display: flex; min-height: 70vh; .detailMedia { flex: 1; min-width: 0; display: grid; place-items: center; background: #171819; img, video { width: 100%; max-height: 80vh; object-fit: contain; } } aside { display: flex; flex-direction: column; width: 300px; flex: none; padding: 18px; background: var(--el-bg-color-overlay); header { display: flex; justify-content: space-between; align-items: center; gap: 12px; h3 { font-size: 14px; word-break: break-all; } } dl { display: grid; grid-template-columns: 75px 1fr; font-size: 12px; gap: 18px 8px; dt { color: var(--el-text-color-secondary); } dd { margin: 0; text-align: right; overflow-wrap: anywhere; } } h4 { font-size: 12px; color: var(--el-text-color-secondary); font-weight: 400; } .generationInfo { font-size: 12px; white-space: pre-wrap; max-height: 40vh; overflow-y: auto; overflow-wrap: anywhere; line-height: 1.6; } footer { margin-top: auto; padding-top: 24px; > .el-button { width: 100%; } > div { display: flex; gap: 8px; margin-top: 8px; .el-button { flex: 1; margin: 0; } } } } @media(max-width:700px) { flex-direction: column; aside { width: auto; } .detailMedia img, .detailMedia video { max-height: 45vh; } } } }
</style>
