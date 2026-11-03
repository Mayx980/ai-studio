<template>
  <div class="simpleReferenceSlots" aria-label="首尾帧与参考图">
    <input ref="fileInput" type="file" accept="image/*" :multiple="target.role === 'reference'" hidden :disabled="disabled || opening" @change="selectFiles" />
    <template v-for="frame in frames" :key="frame.role">
      <el-popover v-if="frame.role === 'reference'" v-model:visible="referenceOpen" trigger="click" placement="top-start" :width="'min(520px, 92vw)'" :teleported="true">
        <template #reference><button class="slotCard stacked" type="button" :disabled="disabled || opening" aria-label="参考图" :aria-expanded="referenceOpen"><span class="cardPlus">+</span><span>参考图</span><small v-if="referenceCount">{{ referenceCount }}</small></button></template>
        <div class="referenceCategories"><section v-for="group in groups" :key="group.value"><h4>{{ group.label }}</h4><div class="categoryImages"><div v-for="(attachment, index) in groupAttachments(group.value)" :key="index" class="referenceImage"><attachmentPreview :attachment="{ ...attachment, name: attachment.referenceName || `${group.label}${index + 1}` }" :directory="directory" removable :disabled="disabled" @remove="remove(attachment)" /><span>{{ attachment.referenceName || `${group.label}${index + 1}` }}</span></div><el-dropdown trigger="click" :disabled="disabled || opening" @command="choice => chooseSource(choice, { role: 'reference', category: group.value })"><button class="addReference" type="button" :disabled="disabled || opening" :aria-label="`新增${group.label}`"><span>+</span>新增</button><template #dropdown><el-dropdown-menu><el-dropdown-item v-for="source in sources" :key="source.value" :command="source.value">{{ source.label }}</el-dropdown-item></el-dropdown-menu></template></el-dropdown></div></section></div>
      </el-popover>
      <div v-else class="frameSlot">
        <attachmentPreview v-if="frameAttachment(frame.role)" :attachment="frameAttachment(frame.role)!" :directory="directory" removable :disabled="disabled" @remove="remove(frameAttachment(frame.role)!)" />
        <el-dropdown trigger="click" :disabled="disabled || opening" @command="choice => chooseSource(choice, { role: frame.role })"><button :class="frameAttachment(frame.role) ? 'frameLabel' : 'slotCard'" type="button" :disabled="disabled || opening" :aria-label="frame.label"><span v-if="!frameAttachment(frame.role)" class="cardPlus">+</span><span>{{ frame.label }}</span></button><template #dropdown><el-dropdown-menu><el-dropdown-item v-for="source in sources" :key="source.value" :command="source.value">{{ source.label }}</el-dropdown-item></el-dropdown-menu></template></el-dropdown>
      </div>
    </template>
    <el-dialog v-model="assetsOpen" title="从资产库上传" width="min(800px, 92vw)" appendToBody destroyOnClose><assetLibrary :modelValue="true" :directory="directory" selectable @select="selectAsset" /></el-dialog>
  </div>
</template>
<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref } from "vue";
import { ElMessage } from "element-plus";
import type { AgentAttachment, ReferenceRole, ReferenceCategory } from "@/components/agent/types";
import attachmentPreview from "@/components/agent/attachmentPreview.vue";
import assetLibrary from "@/pages/workspace/panels/canvas/components/assetLibrary.vue";
import { materialEditorState, type MaterialTarget } from "@/stores/materialEditor";
const props = defineProps<{ directory?: string; disabled?: boolean; ensureDirectory?: () => Promise<string | undefined> }>();
const attachments = defineModel<AgentAttachment[]>({ required: true });
let active = true;
const owner = Symbol(), fileInput = ref<HTMLInputElement>(), referenceOpen = ref(false), assetsOpen = ref(false), opening = ref(false);
const target = ref<MaterialTarget>({ role: "firstFrame" });
const frames = [{ role: "firstFrame", label: "首帧" }, { role: "reference", label: "参考图" }, { role: "lastFrame", label: "尾帧" }] as const;
const groups = [{ value: "character", label: "角色" }, { value: "scene", label: "场景" }, { value: "prop", label: "道具" }] as const;
const sources = [{ value: "local", label: "从本地上传" }, { value: "assets", label: "从资产库上传" }, { value: "custom", label: "自定义素材" }];
const referenceCount = computed(() => attachments.value.filter(item => item.referenceRole === "reference").length);
function frameAttachment(role: ReferenceRole) { return attachments.value.find(item => item.referenceRole === role); }
function groupAttachments(category: ReferenceCategory) { return attachments.value.filter(item => item.referenceRole === "reference" && item.referenceCategory === category); }
function remove(attachment: AgentAttachment) { attachments.value = attachments.value.filter(item => item !== attachment); }
function applyFiles(files: File[], destination = target.value) {
  if (!files.length) return;
  const valid = files.filter(file => file.type.startsWith("image/") && file.size > 0 && file.size <= 100 * 1024 * 1024);
  if (valid.length !== files.length) throw new Error("请选择非空且不超过100 MB的图片");
  const retained = destination.role === "reference" ? attachments.value : attachments.value.filter(item => item.referenceRole !== destination.role);
  const group = groups.find(item => item.value === destination.category);
  const existing = retained.filter(item => item.referenceCategory === destination.category);
  const lastNumber = Math.max(existing.length, 0, ...existing.map(item => Number(item.referenceName?.match(/(\d+)$/)?.[1] ?? 0)));
  const selected = destination.role === "reference" ? valid : valid.slice(0, 1);
  if (retained.length + selected.length > 20) throw new Error("每条消息最多添加20个附件");
  if (destination.role === "reference") referenceOpen.value = true;
  attachments.value = [...retained, ...selected.map((file, index) => ({ name: file.name, path: "", mimeType: file.type, file, referenceRole: destination.role, referenceCategory: destination.category, referenceName: group ? `${group.label}${lastNumber + index + 1}` : undefined }))];
}
async function chooseSource(choice: string, destination: MaterialTarget) {
  if (props.disabled || opening.value) return;
  target.value = destination;
  if (choice === "local") { fileInput.value!.value = ""; await nextTick(); fileInput.value?.click(); return; }
  if (choice === "assets") { assetsOpen.value = true; return; }
  referenceOpen.value = false; opening.value = true;
  try {
    const directory = props.directory || await props.ensureDirectory?.();
    if (!directory) { if (!props.ensureDirectory) ElMessage.warning("请先选择项目文件夹"); return; }
    if (!active) return;
    const label = destination.role === "reference" ? `参考图 · ${groups.find(group => group.value === destination.category)?.label || "角色"}` : destination.role === "firstFrame" ? "首帧" : "尾帧";
    materialEditorState.value = { owner, directory, target: destination, label, apply: file => applyFiles([file], destination) };
  } catch (error) { ElMessage.error(error instanceof Error ? error.message : "自定义素材打开失败"); }
  finally { opening.value = false; }
}
function selectFiles(event: Event) { try { applyFiles(Array.from((event.target as HTMLInputElement).files ?? [])); } catch (error) { ElMessage.error((error as Error).message); } }
function selectAsset(file: File) { try { applyFiles([file]); assetsOpen.value = false; } catch (error) { ElMessage.error((error as Error).message); } }
onUnmounted(() => { active = false; if (materialEditorState.value?.owner === owner) materialEditorState.value = undefined; });
</script>
<style scoped lang="scss">
.simpleReferenceSlots { display: flex; align-items: center; gap: 16px; padding: 5px 4px 14px;
  .frameSlot { display: flex; flex-direction: column; align-items: center; :deep(.thumbnailItem) { width: 54px; height: 54px; } .frameLabel { border: 0; background: none; color: var(--el-text-color-regular); font-size: 11px; padding-top: 4px; cursor: pointer; } }
  .slotCard { position: relative; isolation: isolate; width: 54px; height: 62px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 5px; border: 1px solid var(--el-border-color-light); border-radius: 10px; background: var(--el-fill-color-light); color: var(--el-text-color-secondary); font-size: 10px; cursor: pointer; transform: none;
    .cardPlus { font-size: 21px; font-weight: 300; line-height: 20px; }
    &:hover { border-color: var(--el-color-primary); } &:disabled { cursor: default; opacity: .5; }
    &.stacked { transform: rotate(0); &::before, &::after { content: ""; position: absolute; inset: 0; border: 1px solid var(--el-border-color); border-radius: inherit; background: inherit; z-index: -1; pointer-events: none; } &::before { transform: translate(-4px, -3px); } &::after { transform: translate(4px, 3px); } small { position: absolute; right: -5px; top: -6px; border-radius: 9px; padding: 1px 5px; background: var(--el-color-primary); color: white; } }
  }
}
.referenceCategories { max-height: min(560px, 65dvh); overflow: auto; section { padding: 8px 2px 18px; h4 { margin: 0 0 10px; font-size: 13px; font-weight: 500; } .categoryImages { display: flex; flex-wrap: wrap; gap: 12px; align-items: flex-start;
  .referenceImage { width: 126px; > span { display: block; font-size: 11px; margin-top: 5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } :deep(.thumbnailItem) { width: 126px; height: 96px; } :deep(.thumbnailImage) { width: 126px; height: 96px; } }
  .addReference { width: 108px; height: 96px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 5px; border: 1px dashed var(--el-border-color); border-radius: 8px; background: var(--el-fill-color-extra-light); color: var(--el-text-color-secondary); font-size: 11px; cursor: pointer; span { font-size: 24px; } }
} } }
</style>

<style scoped lang="scss">
.simpleReferenceSlots { padding-left: 12px; }
</style>
