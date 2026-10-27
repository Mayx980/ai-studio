<template>
  <el-card v-if="visible" class="assetLibrary" :class="{ selectable }" shadow="never" :bodyStyle="{ padding: '8px' }" role="region" aria-label="素材库" @dblclick.stop>
    <div class="libraryToolbar">
      <el-input v-model="searchQuery" class="searchInput" :prefixIcon="IconSearch" placeholder="搜索素材" aria-label="搜索素材" clearable @keydown.esc.stop="searchQuery = ''" />
      <el-button class="toolbarButton" text :icon="IconFolderPlus" title="新建文件夹" aria-label="新建文件夹" :disabled="newFolderParent !== undefined" @click="startFolder" />
      <el-button class="toolbarButton" text :icon="IconX" title="关闭素材库" aria-label="关闭素材库" @click="visible = false" />
    </div>
    <div class="assetFilters">
      <el-select v-model="mediaFilter" aria-label="素材类别"><el-option label="全部素材" value="" /><el-option label="图片" value="image" /><el-option label="视频" value="video" /><el-option label="音频" value="audio" /></el-select>
      <el-select v-model="tagFilter" aria-label="按标签分类" clearable placeholder="全部标签"><el-option v-for="item in assetCategories" :key="item" :label="item" :value="item" /></el-select>
    </div>
    <p class="tagHint">标签随应用设置保存；同名分类文件夹会自动归类。</p>
    <el-scrollbar class="libraryScroll" maxHeight="min(440px, calc(100dvh - 198px))">
      <el-tree ref="assetTree" class="assetTree" :data="displayEntries" nodeKey="path" :props="{ label: 'name' }" :icon="IconChevronRight" :currentNodeKey="folder === '.' ? undefined : folder" :filterNodeMethod="filterEntry" defaultExpandAll highlightCurrent emptyText="暂无符合条件的素材" @nodeClick="selectFolder">
        <template #default="{ data, node }">
          <div class="assetEntry" :title="data.name" :draggable="data.type === 'file'" @dragstart.stop="startAssetDrag($event, data)" @dblclick.stop="openPreview(data)" @contextmenu="openItemMenu($event, data)">
            <span v-if="data.type === 'directory'" class="fileIcon"><component :is="node.expanded && !node.isLeaf ? IconFolderOpen : IconFolder" :size="18" aria-hidden="true" /></span>
            <el-image v-else-if="mediaKind(data) === 'image'" class="assetThumbnail" :src="assetUrl(data.path)" fit="cover" loading="lazy" draggable="false" @click.stop="openPreview(data)">
              <template #error><icon-photo :size="18" /></template>
            </el-image>
            <span v-else class="fileIcon">
              <icon-music v-if="mediaKind(data) === 'audio'" :size="18" />
              <icon-video v-else-if="mediaKind(data) === 'video'" :size="18" />
              <icon-file v-else :size="18" />
            </span>
            <el-input v-if="data.draft" ref="folderInput" v-model="newFolderName" class="folderNameInput" size="small" aria-label="文件夹名称" :disabled="folderSaving" @click.stop @keydown.stop @keydown.enter.prevent="saveFolder" @keydown.esc.prevent="cancelFolder" @blur="saveFolder" />
            <span v-else class="assetName">{{ data.name }}</span>
            <el-button v-if="selectable && mediaKind(data)" text type="primary" :disabled="selecting" :aria-label="'引用 ' + data.name" @click.stop="selectAsset(data)">引用</el-button>
            <el-popover v-if="mediaKind(data) && !selectable" trigger="click" :width="290"><template #reference><el-button text size="small" @click.stop>标签</el-button></template><el-checkbox-group :modelValue="assetTags[data.path] ?? []" @update:modelValue="value => assetTags[data.path] = value.map(String)"><el-checkbox-button v-for="item in assetCategories" :key="item" :value="item">{{ item }}</el-checkbox-button></el-checkbox-group></el-popover>
            <el-button v-if="mediaKind(data)" class="moreButton" text :icon="IconEye" :aria-label="'预览 ' + data.name" title="预览（也可双击素材）" @click.stop="openPreview(data)" />
            <el-button v-if="!data.draft" class="moreButton" text :icon="IconDots" :aria-label="'更多 ' + data.name" title="更多" @click.stop="openItemMenu($event, data)" />
          </div>
        </template>
      </el-tree>
    </el-scrollbar>
    <div v-if="previewAsset?.kind === 'audio'" class="audioPreview">
      <div class="audioHeader">
        <span :title="previewAsset.name">{{ previewAsset.name }}</span>
        <el-button text :icon="IconX" aria-label="关闭音频预览" @click="previewAsset = undefined" />
      </div>
      <el-alert v-if="previewError" :title="previewError" type="error" :closable="false" showIcon />
      <audio v-else :key="previewAsset.url" :src="previewAsset.url" :aria-label="previewAsset.name" controls preload="metadata" @error="previewError = '音频无法播放，文件可能已损坏或当前浏览器不支持其编码。'" />
    </div>
  </el-card>

  <assetMenu v-if="visible" ref="assetMenuRef" :entries="entries" @changed="refreshAssets" />

  <el-image-viewer v-if="previewAsset?.kind === 'image'" :urlList="[previewAsset.url]" teleported @close="previewAsset = undefined" />

  <el-dialog :modelValue="previewAsset?.kind === 'video'" :title="previewAsset?.name" width="min(800px, calc(100vw - 32px))" alignCenter appendToBody destroyOnClose @update:modelValue="previewAsset = undefined">
    <div v-if="previewAsset?.kind === 'video'" class="assetPreview">
      <el-alert v-if="previewError" :title="previewError" type="error" :closable="false" showIcon />
      <video v-else :key="previewAsset.url" class="previewVideo" :src="previewAsset.url" :aria-label="previewAsset.name" controls playsinline preload="metadata" @error="previewError = '视频无法播放，文件可能已损坏或当前浏览器不支持其编码。'" />
    </div>
  </el-dialog>

  <el-dialog v-model="saveVisible" title="保存到个人资产" width="520px" alignCenter appendToBody :closeOnClickModal="false" @opened="assetNameInput?.select()">
    <el-alert title="设计预览：本轮仅核对保存信息，不写入素材库。" type="info" :closable="false" />
    <div class="saveCover">
      <el-alert v-if="saveCoverError" :title="saveCoverError" type="error" :closable="false" />
      <img v-else-if="saveCoverUrl && saveMediaType === 'IMAGE'" :src="saveCoverUrl" alt="待保存图片封面" />
      <video v-else-if="saveCoverUrl && saveMediaType === 'VIDEO'" :src="saveCoverUrl" controls playsinline preload="metadata" aria-label="待保存视频预览" />
      <audio v-else-if="saveCoverUrl && saveMediaType === 'AUDIO'" :src="saveCoverUrl" controls aria-label="待保存音频预览" />
      <span v-else>正在读取媒体预览…</span>
    </div>
    <el-form class="saveForm" labelPosition="top" @submit.prevent="saveSummaryVisible = true">
      <el-form-item label="素材名称">
        <el-input ref="assetNameInput" v-model="assetName" aria-label="素材名称" placeholder="输入完整文件名" :disabled="saving" @keydown.enter.prevent="saveSummaryVisible = true" />
      </el-form-item>
      <el-form-item v-if="outputs.length > 1" label="节点输出">
        <el-select v-model="selectedOutput" aria-label="节点输出" :disabled="saving">
          <el-option v-for="(item, index) in outputs" :key="index" :label="item.label" :value="index" />
        </el-select>
      </el-form-item>
      <el-form-item label="保存位置">
        <el-radio-group v-model="saveCategory" aria-label="保存位置"><el-radio-button v-for="item in assetCategories" :key="item" :value="item">{{ item }}</el-radio-button></el-radio-group>
      </el-form-item>
      <el-form-item label="标签（可多选）">
        <el-checkbox-group v-model="saveTags" aria-label="资产标签"><el-checkbox-button v-for="item in assetCategories" :key="item" :value="item">{{ item }}</el-checkbox-button></el-checkbox-group>
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button :disabled="saving" @click="saveVisible = false">取消</el-button>
      <el-button type="primary" :loading="saving" :disabled="!assetName.trim() || /[\\/]/.test(assetName)" @click="saveSummaryVisible = true">预览保存</el-button>
    </template>
  </el-dialog>
  <el-dialog v-model="saveSummaryVisible" title="核对资产信息" width="420px" appendToBody>
    <el-descriptions :column="1" border><el-descriptions-item label="名称">{{ assetName }}</el-descriptions-item><el-descriptions-item label="位置">{{ saveCategory }}</el-descriptions-item><el-descriptions-item label="标签">{{ saveTags.join('、') || '未选择' }}</el-descriptions-item></el-descriptions>
    <p>以上为设计预览。文件与标签未写入素材库，正式持久化由后续实施接入。</p>
    <template #footer><el-button type="primary" @click="saveSummaryVisible = false">返回编辑</el-button></template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import axios from "axios";
import { storeToRefs } from "pinia";
import { useAssetStore } from "@/stores/assets";
import { ElMessage, ElTree, type InputInstance, type TreeNodeData } from "element-plus";
import { IconChevronRight, IconDots, IconEye, IconFile, IconFolder, IconFolderOpen, IconFolderPlus, IconMusic, IconPhoto, IconSearch, IconVideo, IconX } from "@tabler/icons-vue";
import type { NodeOutput } from "@toonflow/nodes-scaffold/values";
import { startAssetDrag } from "../canvasDrop";
import useWorkspaceFiles from "@/lib/workspaceFiles";
import assetMenu from "./assetMenu.vue";

type AssetEntry = { name: string; path: string; type: "file" | "directory"; children?: AssetEntry[]; draft?: boolean };
type AssetOutput = { label: string; output: NodeOutput };

const props = defineProps<{ directory?: string; selectable?: boolean }>();
const emit = defineEmits<{ select: [file: File] }>();
const { tags: assetTags } = storeToRefs(useAssetStore());
const mediaFilter = ref("");
const tagFilter = ref("");
const selecting = ref(false);
async function selectAsset(entry: AssetEntry) {
  if (selecting.value) return;
  selecting.value = true;
  try { const { data } = await axios.get<Blob>(assetUrl(entry.path), { responseType: "blob" }); emit("select", new File([data], entry.name, { type: data.type && data.type !== "application/octet-stream" ? data.type : mediaKind(entry) === "image" ? `image/${/\.jpe?g$/i.test(entry.name) ? "jpeg" : entry.name.split(".").pop()}` : mediaKind(entry) === "audio" ? "audio/mpeg" : "video/mp4" })); } catch (error) { showError(error); } finally { selecting.value = false; }
}
const visible = defineModel<boolean>({ default: false });
const saveVisible = ref(false);
const saving = ref(false);
const assetCategories = ["角色", "场景", "物品", "风格", "音效"];
const saveCategory = ref("物品");
const saveTags = ref<string[]>([]);
const saveSummaryVisible = ref(false);
const saveCoverUrl = ref("");
const saveCoverError = ref("");
const saveMediaType = computed(() => outputs.value[selectedOutput.value]?.output.dataType);
const entries = ref<AssetEntry[]>([]);
const folder = ref(".");
const assetName = ref("");
const assetNameInput = ref<InputInstance>();
const searchQuery = ref("");
const assetTree = ref<InstanceType<typeof ElTree>>();
const folderInput = ref<InputInstance>();
const newFolderParent = ref<string>();
const newFolderName = ref("");
const folderSaving = ref(false);
const assetMenuRef = ref<InstanceType<typeof assetMenu>>();
const previewAsset = ref<{ name: string; url: string; kind: "image" | "audio" | "video" }>();
const previewError = ref("");
let loadRequest = 0;
onBeforeUnmount(() => { loadRequest++; });

function assetUrl(path: string) {
  return `/api/assets/read?path=${encodeURIComponent(path)}`;
}

function mediaKind(entry: AssetEntry) {
  if (entry.type !== "file" || entry.draft) return;
  if (/\.(avif|apng|bmp|gif|ico|jpe?g|png|svg|webp)$/i.test(entry.name)) return "image";
  if (/\.(mp3|wav|ogg|opus|flac|m4a|aac)$/i.test(entry.name)) return "audio";
  if (/\.(mp4|m4v|webm|mov|mkv|avi|ogv)$/i.test(entry.name)) return "video";
}

function openPreview(entry: AssetEntry) {
  const kind = mediaKind(entry);
  if (!kind) return;
  previewError.value = "";
  previewAsset.value = { name: entry.name, url: assetUrl(entry.path), kind };
}

function openItemMenu(event: MouseEvent, entry: AssetEntry) {
  if (entry.draft) return;
  event.preventDefault();
  event.stopPropagation();
  assetMenuRef.value?.openMenu(event, entry);
}

async function refreshAssets(path?: string, target?: string) {
  if (path) {
    for (const key of Object.keys(assetTags.value)) {
      if (key !== path && !key.startsWith(path + "/")) continue;
      if (target) assetTags.value[target + key.slice(path.length)] = assetTags.value[key]!;
      delete assetTags.value[key];
    }
  }
  if (path && (folder.value === path || folder.value.startsWith(path + "/"))) {
    folder.value = target ? target + folder.value.slice(path.length) : ".";
  }
  try { await loadEntries(); } catch (error) { showError(error); }
}
const displayEntries = computed(() => {
  function withDraft(items: AssetEntry[], parent: string): AssetEntry[] {
    const children = items.map(item => item.children ? { ...item, children: withDraft(item.children, item.path) } : item);
    if (newFolderParent.value === parent) children.push({ name: "新建文件夹", path: `${parent}/:newFolder`, type: "directory", draft: true });
    return children;
  }
  function filter(items: AssetEntry[]): AssetEntry[] {
    return items.flatMap(item => {
      if (item.type === "directory") {
        const children = filter(item.children ?? []);
        return children.length || (!mediaFilter.value && !tagFilter.value) ? [{ ...item, children }] : [];
      }
      const tags = assetTags.value[item.path] ?? item.path.split("/").filter(part => assetCategories.includes(part));
      return mediaKind(item) && (!mediaFilter.value || mediaKind(item) === mediaFilter.value) && (!tagFilter.value || tags.includes(tagFilter.value)) ? [item] : [];
    });
  }
  const filtered = filter(entries.value);
  return newFolderParent.value === undefined ? filtered : withDraft(filtered, ".");
});

function filterEntry(query: string, entry: TreeNodeData) {
  return !!entry.draft || entry.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());
}

watch([searchQuery, displayEntries], async () => { await nextTick(); assetTree.value?.filter(searchQuery.value); });

async function startFolder() {
  searchQuery.value = "";
  newFolderParent.value = folder.value;
  newFolderName.value = "新建文件夹";
  await nextTick();
  assetTree.value?.getNode(folder.value)?.expand();
  await nextTick();
  folderInput.value?.select();
}

function cancelFolder() {
  newFolderParent.value = undefined;
}

async function saveFolder() {
  if (newFolderParent.value === undefined || folderSaving.value) return;
  const name = newFolderName.value.trim();
  if (!name) return cancelFolder();
  const parent = newFolderParent.value;
  folderSaving.value = true;
  try {
    await createAssetFolder(parent, name);
    cancelFolder();
    await loadEntries();
    folder.value = parent;
  } catch (error) {
    showError(error);
    await nextTick();
    folderInput.value?.focus();
  } finally {
    folderSaving.value = false;
  }
}

const outputs = ref<AssetOutput[]>([]);
const selectedOutput = ref(0);
let sourceDirectory: string | undefined;
watch([saveVisible, selectedOutput], async (_value, _old, onCleanup) => {
  let active = true;
  let url = "";
  onCleanup(() => { active = false; if (url) URL.revokeObjectURL(url); });
  saveCoverUrl.value = "";
  saveCoverError.value = "";
  const output = outputs.value[selectedOutput.value]?.output;
  if (!saveVisible.value || !output || typeof output.value !== "object" || !sourceDirectory) return;
  try {
    const bytes = await useWorkspaceFiles(sourceDirectory).read(output.value.url);
    if (!active) return;
    url = URL.createObjectURL(new Blob([bytes], { type: output.value.mimeType }));
    saveCoverUrl.value = url;
  } catch { if (active) saveCoverError.value = "媒体预览读取失败，原文件未改动，请关闭后重试。"; }
});

const extension = computed(() => {
  const output = outputs.value[selectedOutput.value]?.output;
  if (!output) return "";
  if (typeof output.value !== "object") return output.dataType === "STRING" ? ".txt" : ".json";
  return output.value.url.match(/\.[^./\\]+$/)?.[0] ?? "";
});

async function loadEntries() {
  const request = ++loadRequest;
  try {
    const { data } = await axios.get<{ data: { entries: AssetEntry[] } }>("/api/assets/list");
    if (request !== loadRequest) return;
    entries.value = data.data.entries;
    await nextTick();
    if (request === loadRequest) assetTree.value?.filter(searchQuery.value);
  } catch (error) {
    if (request === loadRequest) throw error;
  }
}

function showError(error: unknown) {
  ElMessage.error(axios.isAxiosError<{ message: string }>(error) ? error.response?.data.message || error.message : (error as Error).message);
}

watch(visible, opened => {
  if (opened) loadEntries().catch(showError);
  else {
    cancelFolder();
    previewAsset.value = undefined;
  }
}, { immediate: true });

function selectFolder(entry: AssetEntry) {
  if (entry.draft) return;
  const path = entry.type === "directory" ? entry.path : entry.path.split("/").slice(0, -1).join("/") || ".";
  folder.value = folder.value === path ? "." : path;
}

async function createAssetFolder(parent: string, name: string) {
  if (/[\\/]/.test(name)) throw new Error("文件夹名称不能包含斜杠");
  const path = parent === "." ? name : `${parent}/${name}`;
  await axios.post("/api/assets/mkdir", { path });
  return path;
}

async function openSave(label: string, items: AssetOutput[]) {
  const media = items.filter(item => ["IMAGE", "VIDEO", "AUDIO"].includes(item.output.dataType));
  if (!media.length) { ElMessage.info("个人资产仅支持图片、视频和音频。"); return; }
  outputs.value = media;
  saveTags.value = [];
  saveCategory.value = "物品";
  selectedOutput.value = 0;
  assetName.value = label.endsWith(extension.value) ? label : `${label}${extension.value}`;
  sourceDirectory = props.directory;
  saveVisible.value = true;
  try {
    await loadEntries();
  } catch (error) {
    showError(error);
  }
}

defineExpose({ openSave });
</script>

<style lang="scss" scoped>
.saveCover { display: grid; place-items: center; min-height: 150px; margin: 16px 0; padding: 14px; border: 1px solid var(--el-border-color-light); border-radius: var(--el-border-radius-base); background: var(--el-fill-color-extra-light); img, video { max-width: 100%; max-height: 200px; object-fit: contain; border-radius: var(--el-border-radius-base); } audio { width: 100%; } }

.assetLibrary {
  &.selectable { width: 100%; }
  width: min(320px, calc(100vw - 30px));
  max-height: calc(100dvh - 140px);

  :deep(.el-card__body) {
    display: flex;
    flex-direction: column;
    max-height: inherit;
    box-sizing: border-box;
  }

  .libraryToolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-shrink: 0;
    gap: 8px;
    height: 32px;
    margin-bottom: 8px;

    .toolbarButton {
      flex-shrink: 0;
      width: 28px;
      height: 28px;
      margin: 0;
      padding: 0;
    }

    .searchInput {
      flex: 1;
      min-width: 0;
    }
  }

  .assetFilters { display: flex; gap: 8px; margin: 12px 0; .el-select { width: 160px; } }
  .tagHint { font-size: 12px; color: var(--el-text-color-secondary); }
  .libraryScroll {
    min-height: 0;
    max-height: 440px;
  }

  .audioPreview {
    flex-shrink: 0;
    margin-top: 8px;

    .audioHeader {
      display: flex;
      align-items: center;
      gap: 8px;

      span {
        flex: 1;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: var(--el-font-size-small);
      }
    }

    audio { display: block; width: 100%; }
  }

  .assetTree {
    :deep(.el-tree-node__content) {
      height: 36px;
      padding-right: 6px;
      border-radius: var(--el-border-radius-base);
    }

    .assetEntry {
      display: flex;
      flex: 1;
      align-items: center;
      gap: 8px;
      min-width: 0;
      overflow: hidden;

      &[draggable="true"] {
        cursor: grab;
      }

      .assetThumbnail,
      .fileIcon {
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        width: 32px;
        height: 32px;
        border-radius: var(--el-border-radius-base);
        color: var(--el-text-color-secondary);
      }

      .assetThumbnail { background: var(--el-fill-color-light); }

      .moreButton {
        flex-shrink: 0;
        width: 24px;
        height: 24px;
        margin: 0;
        padding: 0;
        color: var(--el-text-color-secondary);
      }

      .assetName {
        flex: 1;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: var(--el-font-size-base);
      }

      .folderNameInput {
        flex: 1;
        min-width: 0;
      }
    }
  }
}

.assetPreview {
  .previewVideo {
    display: block;
    width: 100%;
    max-height: 65dvh;
    background: #000;
  }

}

.saveForm { margin-top: 16px; }
</style>
