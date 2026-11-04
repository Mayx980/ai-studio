<template>
  <div class="simpleReferenceSlots" aria-label="参考素材">
    <div class="referenceTabs" role="tablist" aria-label="参考素材类型">
      <button v-for="tab in tabs" :key="tab.value" type="button" role="tab" :aria-selected="mode === tab.value" :disabled="disabled || opening" @click="mode = tab.value">{{ tab.label }}</button>
    </div>
    <input ref="fileInput" type="file" accept="image/*" :multiple="target.role === 'reference' && !replacing" hidden :disabled="disabled || opening" @change="selectFiles" />
    <div v-if="mode === 'reference'" class="referenceDeck" aria-label="参考图片">
      <button v-if="!referenceImages.length" class="slotCard" type="button" :disabled="disabled || opening" aria-label="添加参考图" @click="openMenu($event, { role: 'reference' })"><icon-plus :size="28" /></button>
      <div v-for="(attachment, index) in referenceImages" :key="index" class="referenceCard" :class="{ lastReference: index === referenceImages.length - 1 }">
        <attachmentPreview :attachment="attachment" :directory="directory" />
        <span class="referenceLabel">{{ referenceLabel(attachment, index) }}</span>
        <el-tooltip content="替换图片"><button class="replaceReference" type="button" :disabled="disabled || opening" :aria-label="`替换${referenceLabel(attachment, index)}`" @click="openMenu($event, { role: 'reference', category: attachment.referenceCategory || 'character' }, attachment)"><icon-refresh :size="22" /></button></el-tooltip>
        <button class="removeReference" type="button" :disabled="disabled || opening" :aria-label="`移除${referenceLabel(attachment, index)}`" title="移除图片" @click="remove(attachment)"><icon-x :size="14" /></button>
        <button v-if="index === referenceImages.length - 1" class="addNextReference" type="button" :disabled="disabled || opening" aria-label="继续添加参考图" @click="openMenu($event, { role: 'reference' })"><icon-plus :size="22" /></button>
      </div>
    </div>
    <div v-else class="frameDeck" aria-label="首尾帧图片">
      <template v-for="(frame, index) in frames" :key="frame.role">
        <span v-if="index" class="frameDivider" aria-hidden="true">···</span>
        <div class="frameSlot">
          <template v-if="frameAttachment(frame.role)">
            <attachmentPreview :attachment="frameAttachment(frame.role)!" :directory="directory" removable :disabled="disabled" @remove="remove(frameAttachment(frame.role)!)" />
            <button class="frameLabel" type="button" :disabled="disabled || opening" :aria-label="`替换${frame.label}`" @click="openMenu($event, { role: frame.role })">{{ frame.label }}</button>
          </template>
          <button v-else class="slotCard" type="button" :disabled="disabled || opening" :aria-label="frame.label" @click="openMenu($event, { role: frame.role })"><icon-plus :size="24" /><span>{{ frame.label }}</span></button>
        </div>
      </template>
    </div>
    <el-popover ref="sourcePopover" :visible="menuVisible" :trigger="[]" virtualTriggering :virtualRef="menuAnchor" placement="bottom-end" :width="180" :showArrow="false" :popperStyle="{ maxHeight: 'calc(100dvh - 24px)', overflowY: 'auto' }">
      <div v-click-outside:[menuExcludes]="closeMenu" class="referenceSourceMenu" @keydown.esc.stop.prevent="closeMenu" role="menu" :aria-label="menuStage === 'category' ? '选择素材类别' : '选择素材来源'">
        <template v-if="menuStage === 'category'"><button v-for="group in groups" :key="group.value" type="button" role="menuitem" @click="selectCategory(group.value)">上传{{ group.label }}</button></template>
        <template v-else><button v-for="source in sources" :key="source.value" type="button" role="menuitem" @click="chooseSource(source.value)">{{ source.label }}</button></template>
      </div>
    </el-popover>
    <el-dialog v-model="assetsOpen" title="从个人资产库上传" width="min(800px, 92vw)" appendToBody destroyOnClose><assetLibrary :modelValue="true" :directory="directory" selectable @select="selectAsset" /></el-dialog>
  </div>
</template>
<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref, watch } from "vue";
import { ClickOutside as vClickOutside, ElMessage, type PopoverInstance } from "element-plus";
import { IconPlus, IconRefresh, IconX } from "@tabler/icons-vue";
import type { AgentAttachment, ReferenceRole, ReferenceCategory } from "@/components/agent/types";
import attachmentPreview from "@/components/agent/attachmentPreview.vue";
import assetLibrary from "@/pages/workspace/panels/canvas/components/assetLibrary.vue";
import { materialEditorState, type MaterialTarget } from "@/stores/materialEditor";
const props = defineProps<{ directory?: string; disabled?: boolean; ensureDirectory?: () => Promise<string | undefined> }>();
const attachments = defineModel<AgentAttachment[]>({ required: true });
const mode = defineModel<"reference" | "frames">("mode", { default: "reference" });
let active = true;
const owner = Symbol(), fileInput = ref<HTMLInputElement>(), assetsOpen = ref(false), opening = ref(false);
const target = ref<MaterialTarget>({ role: "reference" }), replacing = ref<AgentAttachment>();
const menuVisible = ref(false), menuStage = ref<"category" | "source">("category"), menuAnchor = ref<HTMLElement>(), sourcePopover = ref<PopoverInstance>();
const menuExcludes = computed(() => [menuAnchor.value, sourcePopover.value?.popperRef?.contentRef]);
const tabs = [{ value: "reference", label: "参考图" }, { value: "frames", label: "首尾帧" }] as const;
const frames = [{ role: "firstFrame", label: "首帧" }, { role: "lastFrame", label: "尾帧" }] as const;
const groups = [{ value: "character", label: "角色" }, { value: "prop", label: "道具" }, { value: "scene", label: "背景" }] as const;
const sources = [{ value: "local", label: "从本地上传" }, { value: "assets", label: "从个人资产库上传" }, { value: "custom", label: "自定义素材" }];
const referenceImages = computed(() => attachments.value.filter(item => item.referenceRole === "reference"));
watch(attachments, value => { if (value.some(item => item.referenceRole === "firstFrame" || item.referenceRole === "lastFrame") && !value.some(item => item.referenceRole === "reference")) mode.value = "frames"; }, { immediate: true });
function frameAttachment(role: ReferenceRole) { return attachments.value.find(item => item.referenceRole === role); }
function referenceLabel(attachment: AgentAttachment, index: number) { return attachment.referenceName?.replace(/^场景/, "背景") || `${groups.find(group => group.value === attachment.referenceCategory)?.label || "角色"}${index + 1}`; }
function remove(attachment: AgentAttachment) { attachments.value = attachments.value.filter(item => item !== attachment); }
function closeMenu() { menuVisible.value = false; }
function openMenu(event: MouseEvent, destination: MaterialTarget, attachment?: AgentAttachment) {
  if (props.disabled || opening.value) return;
  menuAnchor.value = event.currentTarget as HTMLElement; target.value = destination; replacing.value = attachment;
  menuStage.value = destination.role === "reference" && !destination.category ? "category" : "source"; menuVisible.value = true;
}
function selectCategory(category: ReferenceCategory) { target.value = { role: "reference", category }; menuStage.value = "source"; }
function applyFiles(files: File[], destination = target.value, replacement = replacing.value) {
  if (!files.length) return;
  const valid = files.filter(file => file.type.startsWith("image/") && file.size > 0 && file.size <= 100 * 1024 * 1024);
  if (valid.length !== files.length) throw new Error("请选择非空且不超过100 MB的图片");
  const retained = destination.role === "reference" ? attachments.value : attachments.value.filter(item => item.referenceRole !== destination.role);
  const group = groups.find(item => item.value === destination.category);
  const existing = retained.filter(item => item.referenceCategory === destination.category);
  const lastNumber = Math.max(existing.length, 0, ...existing.map(item => Number(item.referenceName?.match(/(\d+)$/)?.[1] ?? 0)));
  const selected = destination.role === "reference" && !replacement ? valid : valid.slice(0, 1);
  const replacementIndex = replacement ? retained.indexOf(replacement) : -1;
  if (replacement && replacementIndex < 0) throw new Error("原参考图已移除，请重新选择");
  if (retained.length + selected.length - (replacement ? 1 : 0) > 20) throw new Error("每条消息最多添加20个附件");
  const added = selected.map((file, index) => ({ name: file.name, path: "", mimeType: file.type, file, referenceRole: destination.role, referenceCategory: destination.category, referenceName: replacement?.referenceName || (group ? `${group.label}${lastNumber + index + 1}` : undefined) }));
  if (replacement) { const result = [...retained]; result.splice(replacementIndex, 1, ...added); attachments.value = result; }
  else attachments.value = [...retained, ...added];
  replacing.value = undefined;
}
async function chooseSource(choice: string) {
  if (props.disabled || opening.value) return;
  closeMenu();
  if (choice === "local") { fileInput.value!.value = ""; await nextTick(); fileInput.value?.click(); return; }
  if (choice === "assets") { assetsOpen.value = true; return; }
  opening.value = true;
  const destination = { ...target.value }, replacement = replacing.value;
  try {
    const directory = props.directory || await props.ensureDirectory?.();
    if (!directory) { if (!props.ensureDirectory) ElMessage.warning("请先选择项目文件夹"); return; }
    if (!active) return;
    const label = destination.role === "reference" ? `参考图 · ${groups.find(group => group.value === destination.category)?.label || "角色"}` : destination.role === "firstFrame" ? "首帧" : "尾帧";
    materialEditorState.value = { owner, directory, target: destination, label, apply: file => applyFiles([file], destination, replacement) };
  } catch (error) { ElMessage.error(error instanceof Error ? error.message : "自定义素材打开失败"); }
  finally { opening.value = false; }
}
function selectFiles(event: Event) { try { applyFiles(Array.from((event.target as HTMLInputElement).files ?? [])); } catch (error) { ElMessage.error((error as Error).message); } }
function selectAsset(file: File) { try { applyFiles([file]); assetsOpen.value = false; } catch (error) { ElMessage.error((error as Error).message); } }
onUnmounted(() => { active = false; if (materialEditorState.value?.owner === owner) materialEditorState.value = undefined; });
</script>
<style scoped lang="scss">
.simpleReferenceSlots { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; padding: 8px 12px 14px; min-width: 0;
  .referenceTabs { display: flex; gap: 4px; flex: none; button { padding: 6px 10px; border: 0; border-radius: 7px; background: transparent; color: var(--el-text-color-secondary); cursor: pointer; font: inherit; font-size: 12px; &[aria-selected="true"] { background: var(--el-fill-color); color: var(--el-text-color-primary); } } }
  .referenceDeck, .frameDeck { display: flex; justify-content: flex-end; align-items: flex-start; gap: 10px; min-width: 0; flex-wrap: wrap; padding: 4px 10px 8px 0; }
  .slotCard { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; width: 72px; height: 72px; border: 0; border-radius: 12px; background: #2d343a; color: var(--el-text-color-primary); cursor: pointer; font-size: 12px; &:disabled { opacity: .5; cursor: default; } &:hover { background: var(--el-fill-color); } }
  .referenceCard { position: relative; width: 72px; height: 72px; :deep(.thumbnailItem), :deep(.thumbnailImage) { width: 72px; height: 72px; } :deep(.thumbnailImage) { border: 0; border-radius: 12px; }
    .referenceLabel { position: absolute; inset: auto 0 0; height: 33.333%; display: flex; align-items: center; justify-content: center; background: rgba(82,86,90,.85); color: white; font-size: 11px; border-radius: 0 0 12px 12px; pointer-events: none; }
    .replaceReference, .removeReference { display: none; position: absolute; border: 0; padding: 0; color: white; cursor: pointer; background: rgba(54,58,62,.9); }
    .replaceReference { inset: 0; margin: auto; width: 28px; height: 28px; border-radius: 7px; }
    .removeReference { top: -7px; right: -7px; width: 22px; height: 22px; border-radius: 50%; align-items: center; justify-content: center; }
    .addNextReference { position: absolute; bottom: -6px; right: -8px; width: 30px; height: 30px; display: flex; align-items: center; justify-content: center; padding: 0; border: 1px solid var(--el-border-color); border-radius: 50%; color: white; background: #50555a; cursor: pointer; }
    &:hover, &:focus-within { .replaceReference, .removeReference { display: flex; align-items: center; justify-content: center; } &.lastReference { margin-right: 82px; .addNextReference { left: calc(100% + 10px); bottom: 0; right: auto; width: 72px; height: 72px; border-radius: 12px; svg { width: 30px; height: 30px; } } } }
  }
  .frameSlot { position: relative; width: 72px; :deep(.thumbnailItem), :deep(.thumbnailImage) { width: 72px; height: 72px; } .frameLabel { position: absolute; inset: auto 0 0; width: 100%; height: 24px; border: 0; border-radius: 0 0 10px 10px; background: rgba(82,86,90,.85); color: white; cursor: pointer; } }
  .frameDivider { align-self: center; color: var(--el-text-color-secondary); }
  @media(max-width:600px) { flex-wrap: wrap; .referenceDeck, .frameDeck { width: 100%; } }
}
.referenceSourceMenu { display: grid; gap: 3px; button { border: 0; border-radius: 6px; padding: 9px 10px; color: var(--el-text-color-primary); background: transparent; font: inherit; font-size: 13px; text-align: left; cursor: pointer; &:hover, &:focus-visible { background: var(--el-fill-color); } } }
</style>
