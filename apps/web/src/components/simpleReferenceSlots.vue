<template>
  <div class="simpleReferenceSlots" aria-label="参考素材">
    <teleport :to="tabsTarget || 'body'" :disabled="!tabsTarget">
      <el-popover v-if="showFrames" v-model:visible="modeVisible" trigger="click" placement="bottom-start" :fallbackPlacements="['bottom-start', 'bottom-end']" :width="180" :showArrow="false" popperClass="referenceModePopover" :disabled="disabled || opening" :hideAfter="0">
        <template #reference><button class="referenceModeButton" :class="{ modeOpen: modeVisible }" type="button" :disabled="disabled || opening" :aria-expanded="modeVisible" aria-label="参考图模式"><component :is="mode === 'frames' ? IconLayoutColumns : IconPhoto" :size="16" />{{ mode === 'frames' ? '首尾帧' : '参考图' }}<icon-chevron-down :size="13" :style="{ transform: modeVisible ? 'rotate(180deg)' : undefined }" /></button></template>
        <div class="referenceTabs" role="tablist" aria-label="参考素材类型"><button v-for="tab in tabs" :key="tab.value" type="button" role="tab" :aria-selected="mode === tab.value" :disabled="disabled || opening" @click="mode = tab.value; modeVisible = false"><component :is="tab.value === 'frames' ? IconLayoutColumns : IconPhoto" :size="16" /><span>{{ tab.label }}</span><icon-check v-if="mode === tab.value" :size="16" /></button></div>
      </el-popover>
    </teleport>
    <input ref="fileInput" type="file" :accept="target.role === 'firstFrame' || target.role === 'lastFrame' ? 'image/*' : 'image/*,video/*'" :multiple="['reference', 'middleFrame'].includes(target.role) && !replacing" hidden :disabled="disabled || opening" @change="selectFiles" />
    <div v-if="mode === 'reference'" class="referenceDeck" aria-label="参考图片">
      <button v-if="!referenceImages.length" class="slotCard" type="button" :disabled="disabled || opening" aria-label="添加参考图" @click="openMenu($event, { role: 'reference' })"><icon-plus :size="28" /></button>
      <div v-for="(attachment, index) in referenceImages" :key="index" class="referenceCard" :class="{ editableReference: !!(attachment.origin || attachment.assetPath), lastReference: index === referenceImages.length - 1, expandedReference: index === referenceImages.length - 1 && expandedReference }" @mouseenter="expandReference" @mouseleave="collapseReference" @focusin="expandReference" @focusout="collapseReference">
        <attachmentPreview :attachment="attachment" :directory="directory" />
        <span class="referenceLabel">{{ referenceLabel(attachment, index) }}</span>
        <el-tooltip content="替换图片"><button class="replaceReference" type="button" :disabled="disabled || opening" :aria-label="`替换${referenceLabel(attachment, index)}`" @click="openMenu($event, { role: 'reference', category: attachment.referenceCategory || 'character' }, attachment)"><icon-refresh :size="22" /></button></el-tooltip>
        <el-tooltip v-if="attachment.origin || attachment.assetPath" :content="attachment.origin ? '编辑来源' : '外部上传素材没有生成来源'" :showArrow="false"><button class="editReference" type="button" :disabled="disabled || opening || !attachment.origin" aria-label="编辑参考素材来源" @click="emit('edit', attachment)"><icon-pencil :size="22" /></button></el-tooltip>
        <button class="removeReference" type="button" :disabled="disabled || opening" :aria-label="`移除${referenceLabel(attachment, index)}`" title="移除图片" @click="remove(attachment)"><icon-x :size="14" /></button>
        <button v-if="index === referenceImages.length - 1" class="addNextReference" type="button" :disabled="disabled || opening" aria-label="继续添加参考图" @click="openMenu($event, { role: 'reference' })"><icon-plus :size="22" /></button>
      </div>
    </div>
    <div v-else class="frameDeck" aria-label="首尾帧图片">
      <template v-for="(frame, index) in frames" :key="frame.role">
        <template v-if="index"><div v-for="(attachment, middleIndex) in middleFrames" :key="attachment.name + attachment.path" class="frameSlot"><attachmentPreview :attachment="attachment" :directory="directory" removable :disabled="disabled" @remove="remove(attachment)" /><span class="frameLabel">{{ middleFrameLabel(attachment, middleIndex) }}</span><el-tooltip content="替换图片"><button class="replaceFrame" type="button" :disabled="disabled || opening" :aria-label="`替换${middleFrameLabel(attachment, middleIndex)}`" @click="openMenu($event, { role: 'middleFrame', category: 'other' }, attachment)"><icon-refresh :size="22" /></button></el-tooltip><el-tooltip v-if="attachment.origin || attachment.assetPath" :content="attachment.origin ? '编辑来源' : '外部上传素材没有生成来源'" :showArrow="false"><button class="editFrame" type="button" :disabled="disabled || opening || !attachment.origin" aria-label="编辑参考素材来源" @click="emit('edit', attachment)"><icon-pencil :size="16" /></button></el-tooltip></div><el-tooltip content="添加中间帧"><button class="frameDivider" type="button" aria-label="添加中间帧" :disabled="disabled || opening" @click="openMenu($event, { role: 'middleFrame', category: 'other' })"><span>···</span><icon-plus :size="16" /></button></el-tooltip></template>
        <div class="frameSlot">
          <template v-if="frameAttachment(frame.role)">
            <attachmentPreview :attachment="frameAttachment(frame.role)!" :directory="directory" removable :disabled="disabled" @remove="remove(frameAttachment(frame.role)!)" />
            <el-tooltip content="替换图片"><button class="replaceFrame" type="button" :disabled="disabled || opening" :aria-label="`替换${frame.label}图片`" @click="openMenu($event, { role: frame.role }, frameAttachment(frame.role))"><icon-refresh :size="22" /></button></el-tooltip>
            <el-tooltip v-if="frameAttachment(frame.role)?.origin || frameAttachment(frame.role)?.assetPath" :content="frameAttachment(frame.role)?.origin ? '编辑来源' : '外部上传素材没有生成来源'" :showArrow="false"><button class="editFrame" type="button" :disabled="disabled || opening || !frameAttachment(frame.role)?.origin" aria-label="编辑参考素材来源" @click="emit('edit', frameAttachment(frame.role)!)"><icon-pencil :size="16" /></button></el-tooltip>
            <button class="frameLabel" type="button" :disabled="disabled || opening" :aria-label="`替换${frame.label}`" @click="openMenu($event, { role: frame.role })">{{ frame.label }}</button>
          </template>
          <button v-else class="slotCard" type="button" :disabled="disabled || opening" :aria-label="frame.label" @click="openMenu($event, { role: frame.role })"><icon-plus :size="24" /><span>{{ frame.label }}</span></button>
        </div>
      </template>
    </div>
    <el-popover ref="sourcePopover" :visible="menuVisible" :trigger="[]" virtualTriggering :virtualRef="menuAnchor" placement="right-start" :width="180" :showArrow="false" :popperStyle="{ maxHeight: 'calc(100dvh - 24px)', overflowY: 'auto' }">
      <div v-click-outside:[menuExcludes]="closeMenu" class="referenceSourceMenu" @keydown.esc.stop.prevent="closeMenu" role="menu" :aria-label="menuStage === 'category' ? '选择素材类别' : '选择素材来源'">
        <template v-if="menuStage === 'category'"><button v-for="group in groups" :key="group.value" type="button" role="menuitem" @click="selectCategory(group.value)">上传{{ group.label }}</button></template>
        <template v-else><button v-for="source in sources" :key="source.value" type="button" role="menuitem" @click="chooseSource(source.value)">{{ source.label }}</button></template>
      </div>
    </el-popover>
    <el-dialog v-model="assetsOpen" title="从个人资产库上传" width="min(800px, 92vw)" appendToBody destroyOnClose><assetLibrary :modelValue="true" :directory="directory" selectable @select="selectAsset" /></el-dialog>
  </div>
</template>
<script setup lang="ts">
import { fileGenerationOrigin, fileAssetPath } from "@/lib/generationOrigin";
import { computed, nextTick, onUnmounted, ref, watch } from "vue";
import { ClickOutside as vClickOutside, ElMessage, type PopoverInstance } from "element-plus";
import { IconPlus, IconRefresh, IconX, IconPhoto, IconChevronDown, IconLayoutColumns, IconCheck } from "@tabler/icons-vue";
import type { AgentAttachment, ReferenceRole, ReferenceCategory } from "@/components/agent/types";
import attachmentPreview from "@/components/agent/attachmentPreview.vue";
import assetLibrary from "@/pages/workspace/panels/canvas/components/assetLibrary.vue";
import { IconPencil } from "@tabler/icons-vue";
import { materialEditorState, materialWorkspaces, openMaterialWorkspace, type MaterialTarget, type MaterialWorkspace } from "@/stores/materialEditor";
const emit = defineEmits<{ edit: [attachment: AgentAttachment] }>();
const props = withDefaults(defineProps<{ showFrames?: boolean; tabsTarget?: HTMLElement; directory?: string; disabled?: boolean; ensureDirectory?: () => Promise<string | undefined> }>(), { showFrames: true });
const attachments = defineModel<AgentAttachment[]>({ required: true });
const modeVisible = ref(false);
const mode = defineModel<"reference" | "frames">("mode", { default: "reference" });
let active = true;
const owner = Symbol(), fileInput = ref<HTMLInputElement>(), assetsOpen = ref(false), opening = ref(false);
const target = ref<MaterialTarget>({ role: "reference" }), replacing = ref<AgentAttachment>();
const menuVisible = ref(false), menuStage = ref<"category" | "source">("category"), menuAnchor = ref<HTMLElement>(), sourcePopover = ref<PopoverInstance>();
const menuExcludes = computed(() => [menuAnchor.value, sourcePopover.value?.popperRef?.contentRef]);
const tabs = computed(() => ([{ value: "reference", label: "参考图" }, { value: "frames", label: "首尾帧" }] as const).filter(tab => props.showFrames || tab.value === "reference"));
watch(() => props.showFrames, show => { if (!show) mode.value = "reference"; }, { immediate: true, flush: "sync" });
const frames = [{ role: "firstFrame", label: "首帧" }, { role: "lastFrame", label: "尾帧" }] as const;
const groups = [{ value: "character", label: "角色" }, { value: "prop", label: "道具" }, { value: "scene", label: "背景" }, { value: "other", label: "其他" }] as const;
const sources = [{ value: "local", label: "从本地上传" }, { value: "assets", label: "从个人资产库上传" }, { value: "custom", label: "自定义素材" }];
const expandedReference = ref(false);
let hoverTimer: ReturnType<typeof setTimeout> | undefined;
function expandReference() { clearTimeout(hoverTimer); expandedReference.value = true; }
function collapseReference() { clearTimeout(hoverTimer); hoverTimer = setTimeout(() => { if (!menuVisible.value) expandedReference.value = false; }, 500); }
const middleFrames = computed(() => attachments.value.filter(item => item.referenceRole === "middleFrame"));
const referenceImages = computed(() => attachments.value.filter(item => item.referenceRole === "reference"));
watch(attachments, value => { if (props.showFrames && value.some(item => item.referenceRole === "firstFrame" || item.referenceRole === "lastFrame") && !value.some(item => item.referenceRole === "reference")) mode.value = "frames"; }, { immediate: true });
function frameAttachment(role: ReferenceRole) { return attachments.value.find(item => item.referenceRole === role); }
function middleFrameLabel(attachment: AgentAttachment, index: number) { return /^中间帧\d+$/.test(attachment.referenceName || "") ? attachment.referenceName : `中间帧${index + 1}`; }
function referenceLabel(attachment: AgentAttachment, index: number) { return attachment.referenceName?.replace(/^场景/, "背景") || `${groups.find(group => group.value === attachment.referenceCategory)?.label || "其他"}${index + 1}`; }
function remove(attachment: AgentAttachment) { attachments.value = attachments.value.filter(item => item !== attachment); }
function closeMenu() { menuVisible.value = false; collapseReference(); }
function openMenu(event: MouseEvent, destination: MaterialTarget, attachment?: AgentAttachment) {
  if (props.disabled || opening.value) return;
  menuAnchor.value = event.currentTarget as HTMLElement; target.value = destination; replacing.value = attachment;
  menuStage.value = destination.role === "reference" && !destination.category ? "category" : "source"; menuVisible.value = true;
}
function selectCategory(category: ReferenceCategory) { target.value = { role: "reference", category }; menuStage.value = "source"; }
function applyFiles(files: File[], destination = target.value, replacement = replacing.value) {
  if (!files.length) return;
  const valid = files.filter(file => (file.type.startsWith("image/") || file.type.startsWith("video/") && !["firstFrame", "lastFrame"].includes(destination.role)) && file.size > 0 && file.size <= 100 * 1024 * 1024);
  if (valid.length !== files.length) throw new Error("请选择非空且不超过100 MB的图片或视频，首尾帧仅支持图片");
  const retained = replacement || ["reference", "middleFrame"].includes(destination.role) ? attachments.value : attachments.value.filter(item => item.referenceRole !== destination.role);
  const group = groups.find(item => item.value === destination.category);
  const existing = retained.filter(item => destination.role === "middleFrame" ? item.referenceRole === "middleFrame" : item.referenceCategory === destination.category && item.referenceRole === destination.role);
  const lastNumber = Math.max(existing.length, 0, ...existing.map(item => Number(item.referenceName?.match(destination.role === "middleFrame" ? /^中间帧(\d+)$/ : /(\d+)$/)?.[1] ?? 0)));
  const selected = ["reference", "middleFrame"].includes(destination.role) && !replacement ? valid : valid.slice(0, 1);
  const replacementIndex = replacement ? retained.indexOf(replacement) : -1;
  if (replacement && replacementIndex < 0) throw new Error("原参考图已移除，请重新选择");
  if (retained.length + selected.length - (replacement ? 1 : 0) > 20) throw new Error("每条消息最多添加20个附件");
  const added = selected.map((file, index) => ({ name: file.name, path: "", mimeType: file.type, file, origin: fileGenerationOrigin(file), assetPath: fileAssetPath(file), referenceRole: destination.role, referenceCategory: destination.category, referenceName: replacement?.referenceName || (destination.role === "middleFrame" ? `中间帧${lastNumber + index + 1}` : group ? `${group.label}${lastNumber + index + 1}` : undefined) }));
  if (replacement) { const result = [...retained]; result.splice(replacementIndex, 1, ...added); attachments.value = result; }
  else attachments.value = [...retained, ...added];
  replacing.value = undefined;
}
function openCustomMaterial() {
  const tasks = materialWorkspaces.value.filter(item => !item.ended && item.directory === props.directory && (!item.request || item.request.owner === owner));
  const task = tasks.findLast(item => item.status === "queued" || item.status === "generating") ?? tasks.at(-1);
  if (task) { openTask(task); return; }
  target.value = { role: "reference", category: "other" };
  replacing.value = undefined;
  void chooseSource("custom");
}
defineExpose({ openCustomMaterial });
function openTask(task: MaterialWorkspace) {
  if (task.ended || task.directory !== props.directory) return;
  if (!task.request) task.request = { owner, directory: task.directory, label: task.label, target: task.target, apply: file => applyFiles([file], task.target) };
  if (task.request.owner !== owner) return;
  openMaterialWorkspace(task);
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
    const label = destination.role === "reference" ? `参考图 · ${groups.find(group => group.value === destination.category)?.label || "角色"}` : destination.role === "firstFrame" ? "首帧" : destination.role === "middleFrame" ? "中间帧" : "尾帧";
    materialEditorState.value = { owner, directory, target: destination, label, apply: file => applyFiles([file], destination, replacement) };
  } catch (error) { ElMessage.error(error instanceof Error ? error.message : "自定义素材打开失败"); }
  finally { opening.value = false; }
}
function selectFiles(event: Event) { try { applyFiles(Array.from((event.target as HTMLInputElement).files ?? [])); } catch (error) { ElMessage.error((error as Error).message); } }
function selectAsset(file: File) { try { applyFiles([file]); assetsOpen.value = false; } catch (error) { ElMessage.error((error as Error).message); } }
onUnmounted(() => { clearTimeout(hoverTimer); active = false; for (const task of materialWorkspaces.value) if (task.request?.owner === owner) task.request = undefined; });
</script>
<style scoped lang="scss">
.simpleReferenceSlots {
  .referenceCard.editableReference .replaceReference { inset: auto; left: 7px; top: 22px; margin: 0; width: 26px; height: 26px; }
  .frameSlot .editFrame { position: absolute; right: 2px; top: 2px; display: none; width: 24px; height: 24px; padding: 0; border: 0; border-radius: 6px; color: white; background: #18151dd9; cursor: pointer; }
  .frameSlot:hover .editFrame, .frameSlot:focus-within .editFrame { display: grid; place-items: center; }
  display: flex; justify-content: flex-start; align-items: flex-start; gap: 12px; padding: 8px 12px 14px; min-width: 0;

  .referenceDeck, .frameDeck { display: flex; justify-content: flex-start; align-items: flex-start; gap: 10px; min-width: 0; flex-wrap: wrap; padding: 4px 10px 8px 0; }
  .slotCard { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; width: 72px; height: 72px; border: 0; border-radius: 12px; background: #2d343a; color: var(--el-text-color-primary); cursor: pointer; font-size: 12px; &:disabled { opacity: .5; cursor: default; } &:hover { background: var(--el-fill-color); } }
  .referenceCard { position: relative; width: 72px; height: 72px; :deep(.thumbnailItem), :deep(.thumbnailImage), :deep(.thumbnailButton) { width: 72px; height: 72px; } :deep(.thumbnailImage) { border: 0; border-radius: 12px; }
    .referenceLabel { position: absolute; inset: auto 0 0; height: 33.333%; display: flex; align-items: center; justify-content: center; background: rgba(82,86,90,.85); color: white; font-size: 11px; border-radius: 0 0 12px 12px; pointer-events: none; }
    .replaceReference, .editReference, .removeReference { display: none; position: absolute; border: 0; padding: 0; color: white; cursor: pointer; background: rgba(54,58,62,.9); }
    .replaceReference { inset: 0; margin: auto; width: 28px; height: 28px; border-radius: 7px; }
    .editReference { right: 7px; top: 22px; width: 26px; height: 26px; border-radius: 7px; &:disabled { cursor: not-allowed; } }
    .removeReference { top: -7px; right: -7px; width: 22px; height: 22px; border-radius: 50%; align-items: center; justify-content: center; }
    .addNextReference { position: absolute; bottom: -6px; right: -8px; width: 30px; height: 30px; display: flex; align-items: center; justify-content: center; padding: 0; border: 1px solid var(--el-border-color); border-radius: 50%; color: white; background: #50555a; cursor: pointer; }
    &:hover, &:focus-within { .replaceReference, .editReference, .removeReference { display: flex; align-items: center; justify-content: center; } }
    &.expandedReference { margin-right: 82px; .addNextReference { left: calc(100% + 10px); bottom: 0; right: auto; width: 72px; height: 72px; border-radius: 12px; svg { width: 30px; height: 30px; } } }
  }
  .frameSlot { position: relative; width: 72px; .replaceFrame { display: none; position: absolute; inset: 0; margin: auto; z-index: 2; width: 28px; height: 28px; border: 0; border-radius: 7px; padding: 0; color: white; background: rgba(54,58,62,.9); cursor: pointer; } &:hover, &:focus-within { .replaceFrame { display: flex; align-items: center; justify-content: center; } } :deep(.thumbnailItem), :deep(.thumbnailImage), :deep(.thumbnailButton) { width: 72px; height: 72px; } .frameLabel { position: absolute; inset: auto 0 0; width: 100%; height: 24px; border: 0; border-radius: 0 0 10px 10px; background: rgba(82,86,90,.85); color: white; cursor: pointer; } }
  .frameDivider { align-self: center; border: 0; background: transparent; color: var(--el-text-color-secondary); cursor: pointer; display: grid; place-items: center; width: 26px; height: 30px; svg { display: none; } &:hover, &:focus-visible { span { display: none; } svg { display: block; } } }
  @media(max-width:600px) { flex-wrap: wrap; .referenceDeck, .frameDeck { width: 100%; } }
}
.referenceModeButton { display: inline-flex; flex: none; align-items: center; justify-content: center; gap: 6px; height: 32px; min-width: 88px; padding: 0 12px; border: 1px solid transparent; border-radius: 12px; color: #f2f2f2; background: transparent; font: 400 13px/1 Arial, sans-serif; white-space: nowrap; cursor: pointer; transition: background 180ms, border-color 180ms; &:hover:enabled, &.modeOpen, &[aria-expanded="true"] { background: #303030; border-color: transparent; } &:focus-visible { outline: 2px solid #a28ae9; outline-offset: 2px; } &:disabled { opacity: .5; cursor: not-allowed; } }
.referenceTabs { display: grid; gap: 4px; button { display: flex; align-items: center; gap: 10px; min-height: 40px; padding: 9px 12px; border: 0; border-radius: 8px; text-align: left; color: #f2f2f2; background: var(--agent-input-bg, #1b1b1b); cursor: pointer; font: 400 13px/1 Arial, sans-serif; span { flex: 1; } &:hover, &[aria-selected="true"] { background: #303030; } &:focus-visible { outline: 1px solid #a28ae9; } } }

.referenceSourceMenu { display: grid; gap: 3px; button { border: 0; border-radius: 6px; padding: 9px 10px; color: var(--el-text-color-primary); background: transparent; font: inherit; font-size: 13px; text-align: left; cursor: pointer; &:hover, &:focus-visible { background: var(--el-fill-color); } } }
</style>

<style lang="scss">
.referenceModePopover.el-popover.el-popper { padding: 8px; border: 0; border-radius: 10px; background: var(--agent-input-bg, #1b1b1b); box-shadow: 0 8px 24px #0006; }
</style>
