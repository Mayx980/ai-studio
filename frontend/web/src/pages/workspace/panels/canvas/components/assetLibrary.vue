<template>
  <component :is="page ? 'section' : ElCard" v-if="visible" class="assetLibrary" :class="{ selectable, assetPage: page }" v-bind="page ? {} : { shadow: 'never', bodyStyle: { padding: '8px' } }" role="region" aria-label="个人资产" @dblclick.stop>
    <div class="libraryToolbar">
      <el-input v-model="searchQuery" class="searchInput" :prefixIcon="IconSearch" placeholder="搜索素材" aria-label="搜索素材" clearable @keydown.esc.stop="searchQuery = ''" />
      <el-button v-if="!page" class="toolbarButton" text :icon="IconFolderPlus" title="新建文件夹" aria-label="新建文件夹" :disabled="newFolderParent !== undefined" @click="startFolder" />
    </div>
    <div class="assetFilters">
      <el-select v-model="mediaFilter" aria-label="素材类别"><el-option label="全部素材" value="all" /><el-option label="图片" value="image" /><el-option label="视频" value="video" /><el-option label="音频" value="audio" /></el-select>
      <el-select v-model="tagFilter" aria-label="按标签分类" clearable :valueOnClear="'all'" :emptyValues="[undefined, null]" placeholder="全部标签"><el-option label="全部标签" value="all" /><el-option v-for="item in assetCategories" :key="item" :label="item" :value="item" /></el-select>
    </div>
    <el-scrollbar class="libraryScroll" :maxHeight="page ? undefined : 'min(440px, calc(100dvh - 198px))'">
      <div v-if="page" class="assetGrid">
        <article v-for="item in pageAssets" :key="item.path" class="assetCard">
          <button class="assetCover" type="button" :aria-label="'预览 ' + item.name" @click="openPreview(item)">
            <el-image v-if="mediaKind(item) === 'image'" :src="assetUrl(item.path)" fit="cover" loading="lazy" :alt="item.name"><template #error><icon-photo :size="32" /></template></el-image>
            <video v-else-if="mediaKind(item) === 'video'" :src="assetUrl(item.path)" muted playsinline preload="metadata" aria-hidden="true" />
            <icon-music v-else :size="44" aria-hidden="true" />
            <span class="mediaLabel">{{ mediaKind(item) === 'image' ? '图片' : mediaKind(item) === 'video' ? '视频' : '音频' }}</span>
          </button>
          <div class="assetInfo"><h3 :title="item.name">{{ item.name }}</h3><el-button text :icon="IconDots" :aria-label="'更多 ' + item.name" @click="openItemMenu($event, item)" /></div>
          <el-select :modelValue="tagsFor(item)" multiple collapseTags :aria-label="item.name + ' 标签'" placeholder="标签" @update:modelValue="value => assetTags[item.path] = value"><el-option v-for="tag in assetCategories" :key="tag" :label="tag" :value="tag" /></el-select>
        </article>
      </div>
      <el-tree v-else ref="assetTree" class="assetTree" :data="displayEntries" nodeKey="path" :props="{ label: 'name' }" :icon="IconChevronRight" :currentNodeKey="folder === '.' ? undefined : folder" :filterNodeMethod="filterEntry" defaultExpandAll highlightCurrent emptyText="暂无符合条件的素材" @nodeClick="selectFolder">
        <template #default="{ data, node }">
          <div class="assetEntry" :title="data.name" :draggable="data.type === 'file'" @dragstart.stop="startAssetDrag($event, data)" @dblclick.stop="openPreview(data)" @contextmenu="openItemMenu($event, data)">
            <span v-if="data.type === 'directory'" class="fileIcon"><component :is="node.expanded && !node.isLeaf ? IconFolderOpen : IconFolder" :size="18" aria-hidden="true" /></span>
            <el-image v-else-if="mediaKind(data) === 'image'" class="assetThumbnail" :src="assetUrl(data.path)" fit="cover" loading="lazy" draggable="false" @click.stop="openPreview(data)">
              <template #error><icon-photo :size="18" /></template>
            </el-image>
            <button v-else-if="mediaKind(data) === 'video'" class="assetThumbnail videoThumbnail" type="button" :aria-label="'预览 ' + data.name" @click.stop="openPreview(data)"><video :src="assetUrl(data.path)" muted playsinline preload="metadata" aria-hidden="true" @loadedmetadata="showVideoCover" /><icon-video :size="14" /></button>
            <span v-else class="fileIcon">
              <icon-music v-if="mediaKind(data) === 'audio'" :size="18" />
              <icon-video v-else-if="mediaKind(data) === 'video'" :size="18" />
              <icon-file v-else :size="18" />
            </span>
            <el-input v-if="data.draft" ref="folderInput" v-model="newFolderName" class="folderNameInput" size="small" aria-label="文件夹名称" :disabled="folderSaving" @click.stop @keydown.stop @keydown.enter.prevent="saveFolder" @keydown.esc.prevent="cancelFolder" @blur="saveFolder" />
            <span v-else class="assetName">{{ data.name }}</span>
            <el-button v-if="selectable && mediaKind(data)" text type="primary" :disabled="selecting" :aria-label="'引用 ' + data.name" @click.stop="selectAsset(data)">引用</el-button>
            <el-popover v-if="mediaKind(data) && !selectable" trigger="click" :width="290"><template #reference><el-button text size="small" @click.stop>标签</el-button></template><el-checkbox-group :modelValue="tagsFor(data)" @update:modelValue="value => assetTags[data.path] = value.map(String)"><el-checkbox-button v-for="item in assetCategories" :key="item" :value="item">{{ item }}</el-checkbox-button></el-checkbox-group></el-popover>
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
  </component>

  <assetMenu v-if="visible" ref="assetMenuRef" :entries="entries" @changed="refreshAssets" />

  <el-image-viewer v-if="previewAsset?.kind === 'image'" :urlList="[previewAsset.url]" teleported @close="previewAsset = undefined" />

  <el-dialog :modelValue="previewAsset?.kind === 'video'" :title="previewAsset?.name" width="min(800px, calc(100vw - 32px))" alignCenter appendToBody destroyOnClose @update:modelValue="previewAsset = undefined">
    <div v-if="previewAsset?.kind === 'video'" class="assetPreview">
      <el-alert v-if="previewError" :title="previewError" type="error" :closable="false" showIcon />
      <video v-else :key="previewAsset.url" class="previewVideo" :src="previewAsset.url" :aria-label="previewAsset.name" controls playsinline preload="metadata" @error="previewError = '视频无法播放，文件可能已损坏或当前浏览器不支持其编码。'" />
    </div>
  </el-dialog>

  <saveAssetDialog ref="saveDialog" @saved="loadEntries().catch(showError)" />
</template>

<script setup lang="ts">
import { studio, isStudioError } from "@/ports";

import saveAssetDialog, { type AssetSaveSource } from "@/components/saveAssetDialog.vue";
import { studioCreationMode } from "@/lib/browserWorkspaceFiles";
import { browserAssetFiles, browserAssetMimeType, listBrowserAssets } from "@/lib/browserAssets";
import { rememberFileOrigin, generationRecordForPath, resolveGenerationOrigin } from "@/lib/generationOrigin";
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import axios from "axios";
import { storeToRefs } from "pinia";
import { useAssetStore } from "@/stores/assets";
import { ElCard, ElMessage, ElTree, type InputInstance, type TreeNodeData } from "element-plus";
import { IconChevronRight, IconDots, IconEye, IconFile, IconFolder, IconFolderOpen, IconFolderPlus, IconMusic, IconPhoto, IconSearch, IconVideo, IconX } from "@tabler/icons-vue";
import type { NodeOutput } from "@toonflow/nodes-scaffold/values";
import { startAssetDrag } from "../canvasDrop";
import useWorkspaceFiles from "@/lib/workspaceFiles";
import assetMenu from "./assetMenu.vue";

type AssetEntry = { name: string; path: string; type: "file" | "directory"; children?: AssetEntry[]; draft?: boolean };
type AssetOutput = { label: string; output: NodeOutput };

const props = defineProps<{ directory?: string; selectable?: boolean; page?: boolean }>();
const emit = defineEmits<{ select: [file: File] }>();
const { tags: assetTags } = storeToRefs(useAssetStore());
const mediaFilter = ref("all");
const tagFilter = ref("all");
const selecting = ref(false);
const assetUrls = ref<Record<string, string>>({});
const assetReleases: (() => void)[] = [];
onBeforeUnmount(() => { for (const release of assetReleases) release(); });
async function selectAsset(entry: AssetEntry) {
  if (selecting.value) return;
  selecting.value = true;
  try { const data = new Blob([await browserAssetFiles().read(entry.path)], { type: browserAssetMimeType(entry.path) }); emit("select", rememberFileOrigin(new File([data], entry.name, { type: data.type && data.type !== "application/octet-stream" ? data.type : mediaKind(entry) === "image" ? `image/${/\.jpe?g$/i.test(entry.name) ? "jpeg" : entry.name.split(".").pop()}` : mediaKind(entry) === "audio" ? "audio/mpeg" : "video/mp4" }), useAssetStore().metadata[entry.path]?.origin, entry.path)); } catch (error) { showError(error); } finally { selecting.value = false; }
}
const visible = defineModel<boolean>({ default: false });
const assetCategories = ["角色", "场景", "物品", "风格", "音效"];
const entries = ref<AssetEntry[]>([]);
const folder = ref(".");
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

function showVideoCover(event: Event) {
  const video = event.target as HTMLVideoElement;
  if (Number.isFinite(video.duration) && video.duration > 0) video.currentTime = Math.min(0.1, video.duration / 2);
}
function assetUrl(path: string) {
  if (studioCreationMode) return assetUrls.value[path] || "";
  return studio.assetMediaSource(path);
}

function tagsFor(entry: AssetEntry) { return assetTags.value[entry.path] ?? entry.path.split("/").filter(part => assetCategories.includes(part)); }

function mediaKind(entry: AssetEntry) {
  if (entry.type !== "file" || entry.draft) return;
  if (/\.(avif|apng|bmp|gif|ico|jpe?g|png|svg|webp)$/i.test(entry.name)) return "image";
  if (/\.(mp3|wav|ogg|opus|flac|m4a|aac)$/i.test(entry.name)) return "audio";
  if (/\.(mp4|m4v|webm|mov|mkv|avi|ogv)$/i.test(entry.name)) return "video";
}

function openPreview(entry: AssetEntry) {
  const kind = mediaKind(entry);
  if (!kind) return;
  const url = assetUrl(entry.path);
  if (!url) return;
  previewError.value = "";
  previewAsset.value = { name: entry.name, url, kind };
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
  if (path) {
    const metadata = useAssetStore().metadata;
    for (const key of Object.keys(metadata)) {
      if (key !== path && !key.startsWith(path + "/")) continue;
      if (target) metadata[target + key.slice(path.length)] = metadata[key]!;
      delete metadata[key];
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
        return children.length || (mediaFilter.value === "all" && tagFilter.value === "all") ? [{ ...item, children }] : [];
      }
      const tags = tagsFor(item);
      return mediaKind(item) && (mediaFilter.value === "all" || mediaKind(item) === mediaFilter.value) && (tagFilter.value === "all" || tags.includes(tagFilter.value)) ? [item] : [];
    });
  }
  const filtered = filter(entries.value);
  return newFolderParent.value === undefined ? filtered : withDraft(filtered, ".");
});

const pageAssets = computed(() => {
  function flatten(items: AssetEntry[]): AssetEntry[] { return items.flatMap(item => item.type === "directory" ? flatten(item.children ?? []) : [item]); }
  const query = searchQuery.value.trim().toLocaleLowerCase();
  return flatten(displayEntries.value).filter(item => item.path.toLocaleLowerCase().includes(query));
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

const saveDialog = ref<InstanceType<typeof saveAssetDialog>>();

async function loadEntries() {
  const request = ++loadRequest;
  try {
    const data = studioCreationMode ? { data: { entries: await listBrowserAssets() } } : (await studio.listAssets<{ data: { entries: AssetEntry[] } }>()).data;
    if (studioCreationMode) {
      const releases: (() => void)[] = [];
      const urls: Record<string, string> = {};
      const loadUrls = async (items: AssetEntry[]) => {
        for (const item of items) {
          if (item.type === "directory") await loadUrls(item.children ?? []);
          else {
            const preview = browserAssetFiles().acquireUrl(item.path, browserAssetMimeType(item.path));
            urls[item.path] = await preview.url;
            releases.push(preview.release);
          }
        }
      };
      try { await loadUrls(data.data.entries); }
      catch (error) { for (const release of releases) release(); throw error; }
      if (request !== loadRequest) { for (const release of releases) release(); return; }
      for (const release of assetReleases.splice(0)) release();
      assetReleases.push(...releases);
      assetUrls.value = urls;
    }
    if (request !== loadRequest) return;
    entries.value = data.data.entries;
    await nextTick();
    if (request === loadRequest) assetTree.value?.filter(searchQuery.value);
  } catch (error) {
    if (request === loadRequest) throw error;
  }
}

function showError(error: unknown) {
  ElMessage.error(isStudioError<{ message: string }>(error) ? error.detail?.message || error.message : (error as Error).message);
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
  if (studioCreationMode) await browserAssetFiles().mkdir(path);
  else await studio.createAssetFolder({ path });
  return path;
}

async function openSave(label: string, items: AssetOutput[]) {
  const directory = props.directory;
  if (!directory) return;
  try {
    const sources: AssetSaveSource[] = [];
    for (const { output } of items) {
      if (!["IMAGE", "VIDEO", "AUDIO"].includes(output.dataType) || !output.value || typeof output.value !== "object" || typeof output.value.url !== "string") continue;
      const extension = output.value.url.match(/\.[^./\\]+$/)?.[0] ?? "";
      const name = label.endsWith(extension) ? label : label + extension;
      const record = await generationRecordForPath(directory, output.value.url);
      const origin = record ? await resolveGenerationOrigin(directory, record) : undefined;
      sources.push({ file: new File([await useWorkspaceFiles(directory).read(output.value.url)], name, { type: output.value.mimeType }), metadata: { source: "画布素材", prompt: record?.prompt, model: record?.model, origin } });
    }
    if (!sources.length) { ElMessage.info("个人资产仅支持图片、视频和音频。"); return; }
    await saveDialog.value?.open(sources);
  } catch (error) { showError(error); }
}

defineExpose({ openSave });
</script>

<style lang="scss" scoped>

.assetLibrary {
  &.selectable { width: 100%; }
  &.assetPage { width: 100%; max-height: none; background: transparent; .libraryScroll { max-height: none; } .libraryToolbar { max-width: 560px; } }
  .assetGrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 22px; padding: 8px 0 24px;
    .assetCard { min-width: 0; padding: 12px; border: 1px solid var(--el-border-color-light); border-radius: 16px; background: var(--el-bg-color-overlay);
      .assetCover { position: relative; display: grid; place-items: center; width: 100%; height: 180px; padding: 0; overflow: hidden; border: 0; border-radius: 10px; background: var(--el-fill-color-light); color: var(--el-text-color-secondary); cursor: pointer;
        .el-image, video { width: 100%; height: 100%; object-fit: cover; } .mediaLabel { position: absolute; bottom: 8px; left: 8px; padding: 3px 7px; border-radius: 6px; color: white; background: #0008; font-size: 12px; }
      }
      .assetInfo { display: flex; align-items: center; gap: 8px; margin: 10px 0; h3 { flex: 1; min-width: 0; margin: 0; font-size: 14px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; } }
    }
  }
  width: min(320px, calc(100vw - 30px));
  max-height: calc(100dvh - 140px);

  :deep(.el-card__body) {
    display: flex;
    flex-direction: column;
    max-height: inherit;
    box-sizing: border-box;
  }

  .videoThumbnail { position: relative; display: block; flex-shrink: 0; padding: 0; border: 0; overflow: hidden; background: var(--el-fill-color); color: white; cursor: pointer;
    video { width: 100%; height: 100%; object-fit: cover; }
    svg { position: absolute; right: 2px; bottom: 2px; filter: drop-shadow(0 1px 2px #000); }
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
