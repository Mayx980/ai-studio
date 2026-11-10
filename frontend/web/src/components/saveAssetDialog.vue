<template>
  <el-dialog v-model="visible" class="saveAssetDialog" title="保存资产" width="min(720px, 94vw)" alignCenter appendToBody :closeOnClickModal="false" :closeOnPressEscape="!saving" :showClose="!saving" @closed="clear">
    <div v-if="current" class="saveAssetBody">
      <figure><img v-if="current.file.type.startsWith('image/')" :src="current.url" :alt="current.name" /><video v-else-if="current.file.type.startsWith('video/')" :src="current.url" controls playsinline preload="metadata" /><audio v-else :src="current.url" controls /><figcaption>{{ current.name || current.file.name }}</figcaption></figure>
      <el-form labelPosition="top" @submit.prevent="save">
        <el-form-item v-if="items.length > 1" label="选择素材"><el-select v-model="activeIndex" aria-label="选择待保存素材" :disabled="saving"><el-option v-for="(item, index) in items" :key="index" :label="item.file.name" :value="index" /></el-select></el-form-item>
        <el-form-item label="资产名称" required><el-input v-model="current.name" aria-label="资产名称" :maxlength="50" showWordLimit :disabled="saving || current.saved" @keydown.enter.prevent="save" /></el-form-item>
        <el-form-item label="保存位置"><el-select v-model="current.folder" :emptyValues="[undefined, null]" aria-label="保存位置" :disabled="saving || loading || current.saved" :loading="loading" placeholder="请选择文件夹"><el-option v-if="!requiresAssetFolder(current.file.name, current.file.type)" label="根文件夹" value="" /><el-option v-for="folder in folders" :key="folder" :label="folder" :value="folder" /></el-select></el-form-item>
        <el-form-item label="设置标签"><el-select v-model="current.tags" aria-label="设置标签" multiple placeholder="请选择标签" :disabled="saving || current.saved"><el-option v-for="tag in tags" :key="tag" :label="tag" :value="tag" /></el-select></el-form-item>
        <el-alert v-if="error" :title="error" type="error" :closable="false" />
      </el-form>
    </div>
    <template #footer><el-button :disabled="saving" @click="visible = false">取消</el-button><el-button type="primary" :loading="saving" :disabled="loading || !valid" @click="save">保存</el-button></template>
  </el-dialog>
</template>
<script setup lang="ts">
import { flushSharedState } from "@/stores/sharedState";
import { computed, onBeforeUnmount, ref } from "vue";
import { ElMessage } from "element-plus";
import { browserAssetFiles, listBrowserAssets, requiresAssetFolder, type BrowserAssetEntry } from "@/lib/browserAssets";
import { useAssetStore, type AssetMetadata } from "@/stores/assets";
export type AssetSaveSource = { file: File; name?: string; metadata?: AssetMetadata };
type SaveItem = AssetSaveSource & { name: string; url: string; folder: string; tags: string[]; saved: boolean };
const emit = defineEmits<{ saved: [] }>();
const assets = useAssetStore();
const visible = ref(false), saving = ref(false), loading = ref(false), error = ref("");
const items = ref<SaveItem[]>([]), activeIndex = ref(0), folders = ref<string[]>([]);
const current = computed(() => items.value[activeIndex.value]);
const tags = computed(() => [...new Set(["角色", "场景", "物品", "风格", "音效", ...Object.values(assets.tags).flat()])]);
const valid = computed(() => items.value.length > 0 && items.value.every(item => item.saved || !!item.name.trim() && (!requiresAssetFolder(item.file.name, item.file.type) || !!item.folder) && !/[\\/\0]/.test(item.name) && ![".", ".."].includes(item.name.trim())));
function clear() { items.value.forEach(item => URL.revokeObjectURL(item.url)); items.value = []; }
onBeforeUnmount(clear);
async function open(sources: AssetSaveSource[]) {
  if (saving.value || !sources.length) return;
  if (sources.some(item => !/^(image|video|audio)\//.test(item.file.type))) throw new Error("个人资产仅支持图片、视频和音频");
  clear();
  items.value = sources.map(item => ({ ...item, name: (item.name || item.file.name).replace(/\.[^.]+$/, "").slice(0, 50), url: URL.createObjectURL(item.file), folder: "", tags: [], saved: false }));
  activeIndex.value = 0; error.value = ""; folders.value = []; visible.value = true; loading.value = true;
  try {
    const collect = (entries: BrowserAssetEntry[]): string[] => entries.flatMap(entry => entry.type === "directory" ? [entry.path, ...collect(entry.children ?? [])] : []);
    folders.value = collect(await listBrowserAssets());
    for (const item of items.value) if (requiresAssetFolder(item.file.name, item.file.type)) item.folder = folders.value.includes("未分类") ? "未分类" : "";
  } catch (cause) { error.value = cause instanceof Error ? cause.message : "读取保存位置失败"; }
  finally { loading.value = false; }
}
async function save() {
  if (saving.value || loading.value || !valid.value) return;
  saving.value = true; error.value = "";
  try {
    for (const item of items.value) {
      if (item.saved) continue;
      const extension = item.file.name.match(/\.[^.]+$/)?.[0] ?? "";
      const name = item.name.trim().endsWith(extension) ? item.name.trim() : item.name.trim() + extension;
      const path = item.folder ? `${item.folder}/${name}` : name;
      await browserAssetFiles().write(path, item.file, true);
      assets.tags[path] = [...item.tags];
      assets.metadata[path] = { ...item.metadata, createdAt: Date.now() };
      item.saved = true;
    }
    await flushSharedState();
    emit("saved"); visible.value = false; ElMessage.success("已保存到个人资产");
  } catch (cause) { error.value = cause instanceof Error ? cause.message : "保存失败，请重试"; }
  finally { saving.value = false; }
}
defineExpose({ open });
</script>
<style lang="scss">
.el-dialog.saveAssetDialog { padding: 0; border: 1px solid var(--el-border-color-light); border-radius: 18px; overflow: hidden;
  .el-dialog__header { padding: 18px 24px; margin: 0; border-bottom: 1px solid var(--el-border-color-light); .el-dialog__title { font-size: 14px; } }
  .el-dialog__body { padding: 24px; }
  .saveAssetBody { display: flex; gap: 24px; align-items: flex-start; figure { width: 200px; margin: 0; flex: none; img, video { display: block; width: 100%; aspect-ratio: 1; object-fit: cover; border-radius: 6px; } audio { width: 100%; } figcaption { margin-top: 10px; font-size: 12px; overflow-wrap: anywhere; } } .el-form { flex: 1; min-width: 0; } .el-form-item { margin-bottom: 12px; } .el-form-item__label { font-size: 13px; color: var(--el-text-color-secondary); padding-bottom: 5px; } .el-select { width: 100%; } }
  .el-dialog__footer { padding: 0 24px 24px; .el-button--primary { --el-button-bg-color: var(--el-text-color-primary); --el-button-border-color: var(--el-text-color-primary); --el-button-text-color: var(--el-bg-color); } }
  @media(max-width:560px) { .saveAssetBody { flex-direction: column; figure { width: 140px; } .el-form { width: 100%; } } }
}
</style>
