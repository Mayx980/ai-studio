<template>
  <section class="assetsPage" aria-label="资产">
    <div class="assetContent">
      <template v-if="module === 'history'">
        <div ref="historyHeader" class="historyHeader"><header><h2>生成历史</h2><el-dropdown @command="descending = $event === 'descending'"><el-button text :aria-label="descending ? '时间倒序' : '时间正序'" :title="descending ? '时间倒序' : '时间正序'"><component :is="descending ? IconSortDescending : IconSortAscending" :size="20" /></el-button><template #dropdown><el-dropdown-menu><el-dropdown-item command="ascending">时间正序</el-dropdown-item><el-dropdown-item command="descending">时间倒序</el-dropdown-item></el-dropdown-menu></template></el-dropdown></header>
        <historyTagBar ref="tagBar" v-model="historyTag" :disabled="busy" @edited="selected = []" />
        <nav class="historyCategories" aria-label="生成历史分类"><button v-for="category in historyCategories" :key="category.value" type="button" :aria-pressed="historyKind === category.value" :disabled="busy" @click="historyKind = category.value; selected = []"><span>{{ category.label }}</span><span class="categoryCount">{{ category.count }}</span></button></nav></div>
        <el-alert v-if="error" :title="error" type="error" :closable="false" />
        <p v-if="loading" role="status">正在读取生成历史…</p>
        <p v-if="!loading && !groups.length && !error" class="historyEmpty" role="status">{{ historyTag ? `该标签下暂无${{ all: '素材', image: '图片', video: '视频', audio: '音频' }[historyKind]}` : historyKind === 'all' ? '暂无生成历史' : `暂无${{ image: '图片', video: '视频', audio: '音频' }[historyKind]}` }}</p>
        <div v-for="group in groups" :key="group.date" class="historyGroup"><h3 class="dateHeading" :class="{ hasSelection: group.selectedCount > 0 }"><span>{{ group.date }}</span><input type="checkbox" :checked="group.selectedCount === group.items.length" :indeterminate="group.selectedCount > 0 && group.selectedCount < group.items.length" :aria-checked="group.selectedCount > 0 && group.selectedCount < group.items.length ? 'mixed' : group.selectedCount === group.items.length" :aria-label="`选择 ${group.date} 下当前显示的全部素材`" :disabled="busy || loading" @change="toggleDate(group, $event)" /></h3><div class="historyGrid"><article v-for="item in group.items" :key="item.key" class="historyCard" :class="{ selected: selected.includes(item.key) }">
          <button class="mediaPreview" type="button" :title="item.name" :aria-label="'预览 ' + item.name" @click="preview = item"><img v-if="item.kind === 'image'" :src="item.url" :alt="item.name" /><assetVideoPreview v-else-if="item.kind === 'video'" :src="item.url" /><icon-volume v-else :size="36" /></button>
          <input v-model="selected" type="checkbox" :value="item.key" :aria-label="'选择 ' + item.name" :disabled="busy" />
          <div class="hoverActions"><el-tooltip content="去画布/对话编辑" placement="top"><el-button :disabled="busy" aria-label="去画布/对话编辑" @click="run('canvas', [item])"><icon-edit :size="16" /></el-button></el-tooltip><el-tooltip content="保存到个人资产" placement="top"><el-button :disabled="busy" :aria-label="'保存到个人资产 ' + item.name" title="保存到个人资产" @click="run('save', [item])"><icon-folder-plus :size="16" /></el-button></el-tooltip><el-tooltip content="下载素材" placement="top"><el-button :disabled="busy" :aria-label="'下载 ' + item.name" title="下载素材" @click="run('download', [item])"><icon-download :size="16" /></el-button></el-tooltip><el-tooltip content="删除历史" placement="top"><el-button :disabled="busy" :aria-label="'删除 ' + item.name" title="删除历史" @click="run('delete', [item])"><icon-trash :size="16" /></el-button></el-tooltip></div>
        </article></div></div>
        <div v-if="selected.length" class="selectionToolbar" role="toolbar" aria-label="批量素材操作"><el-tooltip content="取消选择" placement="top"><el-button text :disabled="busy" aria-label="取消选择" @click="selected = []"><icon-x :size="16" /></el-button></el-tooltip><span>已选择 {{ selected.length }} 项</span><el-button :disabled="busy" @click="run('canvas')">去画布/对话编辑</el-button><el-button :disabled="busy" @click="run('newCanvas')">新建画布添加</el-button><el-button :disabled="busy" @click="run('save')">保存到个人资产</el-button><el-button :disabled="busy" @click="editHistoryTags()">修改标签</el-button><el-tooltip content="下载素材" placement="top"><el-button :disabled="busy" aria-label="下载图片" title="下载素材" @click="run('download')"><icon-download :size="17" /></el-button></el-tooltip><el-tooltip content="删除所选历史" placement="top"><el-button :disabled="busy" type="danger" aria-label="删除所选历史" @click="run('delete')"><icon-trash :size="17" /></el-button></el-tooltip></div>
      </template>
      <personalAssetBrowser v-else />
    </div>
    <nav class="assetModules" aria-label="资产模块"><button type="button" :aria-current="module === 'history' ? 'page' : undefined" @click="module = 'history'"><icon-history :size="18" />生成历史<span>{{ items.length }}</span></button><button type="button" :aria-current="module === 'library' ? 'page' : undefined" @click="module = 'library'"><icon-folder :size="18" />个人资产库</button></nav>
    <el-dialog :modelValue="!!preview" class="generationDetail" width="min(1200px, 96vw)" alignCenter appendToBody destroyOnClose :showClose="false" @update:modelValue="preview = undefined">
      <div v-if="preview" class="generationPreview">
        <div class="previewMedia"><img v-if="preview.kind === 'image'" :src="preview.url" :alt="preview.name" /><video v-else-if="preview.kind === 'video'" :src="preview.url" controls playsinline /><audio v-else :src="preview.url" controls /></div>
        <aside class="previewInformation"><header><strong>{{ preview.name }}</strong><el-button text circle aria-label="关闭素材详情" @click="preview = undefined"><icon-x :size="17" /></el-button></header>
          <dl><template v-if="preview.createdAt"><dt>创建于</dt><dd>{{ new Date(preview.createdAt).toLocaleString() }}</dd></template></dl>
          <div class="promptHeading"><span>生成信息</span><el-tooltip content="复制生成信息"><el-button text circle aria-label="复制生成信息" :disabled="!preview.prompt" @click="copyPrompt"><icon-copy :size="16" /></el-button></el-tooltip></div>
          <p class="generationPrompt">{{ preview.prompt || '未记录提示词' }}</p>
          <dl v-if="preview.settings" class="generationSettings"><dt>生成模型</dt><dd>{{ preview.settings.modelId }}</dd><dt>生成模式</dt><dd>{{ { text: '文本生成', singleImage: '首帧生成', reference: '参考素材' }[preview.settings.mode] }}</dd><dt>比例</dt><dd>{{ preview.settings.ratio || '自动' }}</dd><template v-if="preview.kind === 'image'"><dt>尺寸</dt><dd>{{ preview.settings.imageSize.replace('*', ' × ') }}</dd><dt>数量</dt><dd>{{ preview.settings.n }}</dd><dt v-if="preview.settings.style">风格</dt><dd v-if="preview.settings.style">{{ preview.settings.style }}</dd></template><template v-if="preview.kind === 'video'"><dt>清晰度</dt><dd>{{ preview.settings.resolution }}</dd><dt>时长</dt><dd>{{ preview.settings.duration === -1 ? '自动' : `${preview.settings.duration} 秒` }}</dd><dt>音频</dt><dd>{{ preview.settings.generateAudio ? '开启' : '关闭' }}</dd></template></dl>
          <dl v-else-if="preview.model" class="generationSettings"><dt>生成模型</dt><dd>{{ preview.model }}</dd></dl>
          <div class="detailTags"><span>标签</span><span>{{ previewTags.join('、') || '未标记' }}</span><el-button text :disabled="busy" @click="tagBar?.edit([preview!])">修改标签</el-button></div>
          <div class="previewActions" role="toolbar" aria-label="素材操作"><el-tooltip v-for="action in detailActions" :key="action.value" :content="action.label"><el-button :aria-label="action.label" :disabled="busy" @click="run(action.value, [preview])"><component :is="action.icon" :size="19" /></el-button></el-tooltip></div>
        </aside>
      </div>
    </el-dialog>
    <saveAssetDialog ref="saveDialog" />
  </section>
</template>
<script setup lang="ts">
import { resolveGenerationOrigin, openGenerationOrigin } from "@/lib/generationOrigin";
import { getWorkspaceFailure } from "@toonflow/nodes-scaffold/workspaceFiles";
import { computed, onMounted, ref, watch, nextTick } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import historyTagBar from "@/components/historyTagBar.vue";
import saveAssetDialog from "@/components/saveAssetDialog.vue";
import { IconCopy, IconSquarePlus, IconEdit, IconFolderPlus, IconSortAscending, IconSortDescending, IconDownload, IconTrash, IconX } from "@tabler/icons-vue";
import { useRouter } from "vue-router";
import { useWorkspaceStore } from "@/stores/workspace";
import useWorkspaceFiles from "@/lib/workspaceFiles";
import useGenerationHistory, { type HistoryItem } from "@/lib/useGenerationHistory";
import saveFile from "@/lib/saveFile";
import assetVideoPreview from "@/components/assetVideoPreview.vue";
import personalAssetBrowser from "@/components/personalAssetBrowser.vue";
const saveDialog = ref<InstanceType<typeof saveAssetDialog>>();
const workspace = useWorkspaceStore(), router = useRouter();
const history = useGenerationHistory();
const { items, loading, error } = history;
const module = ref("history"), descending = ref(true), busy = ref(false);
const selected = ref<string[]>([]), preview = ref<HistoryItem>();
const historyTag = ref("");
const tagBar = ref<InstanceType<typeof historyTagBar>>(), historyHeader = ref<HTMLElement>();
const taggedItems = computed(() => items.value.filter(item => history.matchesTag(item, historyTag.value)));
const previewTags = computed(() => preview.value ? history.tagsFor(preview.value) : []);
function editHistoryTags() { tagBar.value?.edit(items.value.filter(item => selected.value.includes(item.key))); }
watch(historyTag, async () => {
  selected.value = [];
  await nextTick();
  let element = historyHeader.value?.parentElement;
  while (element && !(/auto|scroll/.test(getComputedStyle(element).overflowY) && element.scrollHeight > element.clientHeight)) element = element.parentElement;
  (element ?? document.scrollingElement)?.scrollTo({ top: 0 });
});
const historyKind = ref<"all" | HistoryItem["kind"]>("all");
const historyCategories = computed(() => [
  { value: "all" as const, label: "全部", count: taggedItems.value.length },
  { value: "image" as const, label: "图片", count: taggedItems.value.filter(item => item.kind === "image").length },
  { value: "video" as const, label: "视频", count: taggedItems.value.filter(item => item.kind === "video").length },
  { value: "audio" as const, label: "音频", count: taggedItems.value.filter(item => item.kind === "audio").length },
]);
const detailActions = [{ value: "newCanvas", label: "新建画布添加", icon: IconSquarePlus }, { value: "canvas", label: "去画布/对话编辑", icon: IconEdit }, { value: "save", label: "保存到个人资产", icon: IconFolderPlus }, { value: "download", label: "下载素材", icon: IconDownload }, { value: "delete", label: "删除历史", icon: IconTrash }] as const;
async function copyPrompt() { try { await navigator.clipboard.writeText(preview.value?.prompt || ""); ElMessage.success("已复制生成信息"); } catch { ElMessage.error("复制失败，请重试"); } }
const groups = computed(() => {
  const sorted = taggedItems.value.filter(item => historyKind.value === "all" || item.kind === historyKind.value).sort((a, b) => (descending.value ? -1 : 1) * ((a.createdAt ?? 0) - (b.createdAt ?? 0)));
  const result = new Map<string, HistoryItem[]>();
  for (const item of sorted) { const date = item.createdAt ? new Date(item.createdAt).toLocaleDateString() : "未记录时间"; if (!result.has(date)) result.set(date, []); result.get(date)!.push(item); }
  const selectedKeys = new Set(selected.value);
  return [...result].map(([date, entries]) => ({ date, items: entries, selectedCount: entries.filter(item => selectedKeys.has(item.key)).length }));
});
function toggleDate(group: { items: HistoryItem[]; selectedCount: number }, event: Event) {
  const allSelected = group.selectedCount === group.items.length;
  if (event.target instanceof HTMLInputElement) event.target.checked = allSelected;
  if (busy.value || loading.value) return;
  const keys = new Set(group.items.map(item => item.key));
  selected.value = allSelected ? selected.value.filter(key => !keys.has(key)) : [...new Set([...selected.value, ...keys])];
}
onMounted(() => history.load());
async function fileFor(item: HistoryItem) { return new File([await useWorkspaceFiles(item.directory).read(item.path)], item.fileName, { type: item.mimeType }); }
async function run(action: "canvas" | "newCanvas" | "save" | "download" | "delete", targets = items.value.filter(item => selected.value.includes(item.key))) {
  if (busy.value || !targets.length) return;
  busy.value = true;
  let completed = 0;
  try {
    if (action === "canvas") {
      if (targets.length !== 1) throw new Error("请选择一个素材返回其原始创作来源");
      const item = targets[0]!;
      const origin = await resolveGenerationOrigin(item.directory, item);
      if (!origin) throw new Error("该历史素材未记录可验证的生成来源，原素材仍保留");
      await openGenerationOrigin(origin, router);
      return;
    }
    if (action === "save") {
      await saveDialog.value?.open(await Promise.all(targets.map(async item => ({ file: await fileFor(item), name: item.name, tags: history.tagsFor(item), metadata: { source: "生成历史", prompt: item.prompt, model: item.model, origin: await resolveGenerationOrigin(item.directory, item) } }))));
      return;
    }
    if (action === "delete") {
      const confirmed = await ElMessageBox.confirm("从生成历史中移除所选记录？画布和对话引用的素材将保留。", "删除历史", { confirmButtonText: "删除", cancelButtonText: "取消", type: "warning" }).then(() => true, () => false);
      if (!confirmed) return;
      for (const directory of new Set(targets.map(item => item.directory))) {
        const files = useWorkspaceFiles(directory);
        const snapshot = await files.readTextSnapshot(".agent/hiddenResults.json").catch(cause => { if (getWorkspaceFailure(cause).code === "ENOENT") return undefined; throw cause; });
        const hidden: string[] = snapshot ? JSON.parse(snapshot.text) : [];
        if (!Array.isArray(hidden) || hidden.some(id => typeof id !== "string")) throw new Error("历史记录格式无效");
        const removed = targets.filter(item => item.directory === directory);
        const next = [...new Set([...hidden, ...removed.map(item => item.id)])];
        if (snapshot) await files.writeTextSnapshot(".agent/hiddenResults.json", JSON.stringify(next), snapshot);
        else await files.writeJson(".agent/hiddenResults.json", next, true);
        const keys = new Set(removed.map(item => item.key)); items.value = items.value.filter(item => !keys.has(item.key)); selected.value = selected.value.filter(key => !keys.has(key)); completed += removed.length;
      }
    } else if (action === "newCanvas") {
      const files = await Promise.all(targets.map(fileFor));
      const project = await workspace.createProject();
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
.assetsPage {
  .historyGroup .dateHeading {
    display: inline-flex; align-items: center; gap: 8px;
    input { width: 15px; height: 15px; margin: 0; opacity: 0; accent-color: var(--el-color-primary); cursor: pointer; }
    &:hover input, &:focus-within input, &.hasSelection input { opacity: 1; }
  }
  @media (hover: none) { .historyGroup .dateHeading input { opacity: 1; } }
  .historyEmpty { padding: 40px 12px; text-align: center; color: var(--el-text-color-secondary); font-size: 13px; }
  .historyHeader { position: sticky; top: 0; z-index: 4; padding-bottom: 1px; background: #131313; &::before { content: ""; position: absolute; bottom: 100%; left: 0; right: 0; height: 48px; background: #131313; pointer-events: none; } }
  .historyCategories { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin: 4px 0 20px;
    button { display: inline-flex; align-items: center; gap: 5px; height: 28px; padding: 0 12px; border: 0; border-radius: 999px; color: #b7b7b7; background: transparent; font: inherit; font-size: 13px; cursor: pointer;
      .categoryCount { color: #8e8e8e; font-size: 12px; }
      &[aria-pressed="true"] { color: #f2f2f2; background: #333; }
      &:hover:enabled { background: #ffffff12; }
      &:focus-visible { outline: 2px solid #a28ae9; outline-offset: 2px; }
      &:disabled { cursor: wait; }
    }
  }
  display: flex; min-height: calc(100dvh - 64px); gap: 24px; .assetContent { flex: 1; min-width: 0; padding-bottom: 90px; header { display: flex; align-items: center; justify-content: space-between; } h2 { font-size: 18px; } } .assetModules { position: sticky; top: 0; z-index: 4; align-self: flex-start; width: 190px; flex: none; padding: 12px; border-left: 0; background: transparent; button { display: flex; align-items: center; gap: 10px; padding: 10px; width: 100%; border: 0; border-radius: 8px; background: transparent; color: inherit; cursor: pointer; &[aria-current="page"], &:hover { background: var(--el-fill-color); } span { margin-left: auto; color: var(--el-text-color-secondary); } } } .historyGroup { margin-top: 26px; h3 { font-size: 14px; font-weight: 500; } } .historyGrid { display: flex; flex-wrap: wrap; gap: 12px; } .historyCard { position: relative; width: 140px; height: 140px; border: 2px solid transparent; border-radius: 10px; overflow: hidden; &.selected { border-color: var(--el-color-primary); } .mediaPreview { display: grid; place-items: center; width: 100%; height: 100%; border: 0; padding: 0; background: var(--el-fill-color); color: inherit; cursor: pointer; img, video { width: 100%; height: 100%; object-fit: cover; } } input { position: absolute; top: 6px; left: 6px; accent-color: var(--el-color-primary); width: 17px; height: 17px; cursor: pointer; opacity: 0; } &:hover input, &:focus-within input, &.selected input { opacity: 1; } .hoverActions { position: absolute; bottom: 7px; inset-inline: 7px; display: flex; gap: 4px; opacity: 0; pointer-events: none; .el-button { flex: 1; margin: 0; padding: 6px; background: #222b; color: white; border: 0; backdrop-filter: blur(10px); } } &:hover .hoverActions, &:focus-within .hoverActions { opacity: 1; pointer-events: auto; } } .selectionToolbar { position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%); max-width: calc(100vw - 36px); z-index: 10; display: flex; align-items: center; gap: 8px; padding: 10px; border: 1px solid var(--el-border-color); border-radius: 14px; background: #272829; box-shadow: 0 8px 28px #0005; overflow-x: auto; white-space: nowrap; font-size: 12px; .el-button { margin: 0; border-color: transparent; background: transparent; color: #cfd3dc; &:hover { background: #ffffff12; border-color: transparent; } } } @media(max-width:800px) { flex-direction: column-reverse; .assetModules { width: auto; display: flex; border-left: 0; } } }
</style>

<style lang="scss">
.el-dialog.generationDetail { .detailTags { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; font-size: 12px; color: var(--el-text-color-secondary); } padding: 0; border-radius: 16px; overflow: hidden; .el-dialog__header { display: none; } .el-dialog__body { padding: 0; } .generationPreview { display: grid; grid-template-columns: minmax(0, 1fr) 320px; grid-template-rows: minmax(0, 1fr); height: min(760px, 88dvh); .previewMedia { position: relative; background: #141414; overflow: hidden; min-width: 0; min-height: 0; img, video { position: absolute; inset: 0; display: block; width: 100%; height: 100%; max-width: 100%; max-height: 100%; object-fit: contain; } audio { max-width: 100%; } } .previewInformation { display: flex; flex-direction: column; padding: 16px; min-height: 0; overflow-y: auto; scrollbar-width: none; header, .promptHeading { display: flex; align-items: center; justify-content: space-between; } dl { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 12px; font-size: 12px; dt { color: var(--el-text-color-secondary); } dd { margin: 0; text-align: right; overflow-wrap: anywhere; } } .promptHeading { color: var(--el-text-color-secondary); } .generationPrompt { white-space: pre-wrap; overflow-wrap: anywhere; line-height: 1.6; margin-top: 4px; } .previewActions { margin-top: auto; padding-top: 24px; display: flex; flex-wrap: wrap; gap: 8px; .el-button { margin: 0; flex: 1; min-width: 40px; } } } } @media(max-width: 650px) { .generationPreview { grid-template-columns: 1fr; grid-template-rows: minmax(200px, 45%) 1fr; } } }
</style>
