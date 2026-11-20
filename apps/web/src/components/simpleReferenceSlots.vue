<template>
  <div class="simpleReferenceSlots" aria-label="参考素材">
    <teleport :to="tabsTarget || 'body'" :disabled="!tabsTarget">
      <el-popover v-if="showFrames" v-model:visible="modeVisible" trigger="click" placement="bottom-start" :fallbackPlacements="['bottom-start', 'bottom-end']" :width="180" :showArrow="false" popperClass="referenceModePopover" :disabled="disabled || opening" :hideAfter="0">
        <template #reference><button class="referenceModeButton" :class="{ modeOpen: modeVisible }" type="button" :disabled="disabled || opening" :aria-expanded="modeVisible" aria-label="参考图模式"><component :is="mode === 'frames' ? IconLayoutColumns : IconPhoto" :size="16" />{{ mode === 'frames' ? '首尾帧' : '参考图' }}<icon-chevron-down :size="13" :style="{ transform: modeVisible ? 'rotate(180deg)' : undefined }" /></button></template>
        <div class="referenceTabs" role="tablist" aria-label="参考素材类型"><button v-for="tab in tabs" :key="tab.value" type="button" role="tab" :aria-selected="mode === tab.value" :disabled="disabled || opening" @click="mode = tab.value; modeVisible = false"><component :is="tab.value === 'frames' ? IconLayoutColumns : IconPhoto" :size="16" /><span>{{ tab.label }}</span><icon-check v-if="mode === tab.value" :size="16" /></button></div>
      </el-popover>
    </teleport>
    <input ref="fileInput" type="file" :accept="targetAccept" :multiple="!motion && ['reference', 'middleFrame'].includes(target.role) && !replacing" hidden :disabled="disabled || opening" @change="selectFiles" />
    <div v-if="motion" class="motionDeck" aria-label="动作模仿素材">
      <div v-for="slot in motionSlots" :key="slot.type" class="motionSlot">
        <div class="motionCover">
          <template v-if="motionAttachment(slot.type)">
            <attachmentPreview :attachment="motionAttachment(slot.type)!" :directory="directory" />
            <span class="motionLabel">{{ slot.label }}1</span>
            <button class="motionReplace" type="button" :disabled="disabled || opening" :aria-label="`替换${slot.label}`" @click="openMotionMenu($event, slot.type)"><icon-refresh :size="20" /></button>
            <button class="motionRemove" type="button" :disabled="disabled || opening" :aria-label="`移除${slot.label}`" @click="remove(motionAttachment(slot.type)!)"><icon-x :size="14" /></button>
          </template>
          <button v-else class="slotCard" type="button" :disabled="disabled || opening" :aria-label="slot.hint" @click="openMotionMenu($event, slot.type)"><icon-plus :size="24" /><span>{{ slot.label }}</span></button>
        </div>
        <small v-if="!motionAttachment(slot.type)">{{ slot.hint }}</small>
        <videoReferenceInfo v-if="slot.type === 'video' && motionAttachment('video')" :attachment="motionAttachment('video')!" :directory="directory" :referenceVideoMaxDuration="referenceVideoMaxDuration" :durations="durations" motion />
      </div>
      <p class="motionHint">添加一张角色图和一个动作视频，可补充动作要求</p><p v-if="!motionAvailable" class="motionHint" role="status">尚未配置可用的万相3.0模型，请先在 API 配置中接入。</p>
    </div>
    <div v-else :class="mode === 'reference' ? 'referenceDeck' : 'frameDeck'" aria-label="参考素材预览">
      <template v-if="mode === 'reference'">
        <button v-if="!hideAdd && !materialTask && !referenceImages.length" class="slotCard" type="button" :disabled="disabled || opening" aria-label="添加参考图" @click="openMenu($event, { role: 'reference' })"><icon-plus :size="28" /></button>
        <div v-for="(attachment, index) in referenceImages" :key="index" class="referenceCard" :class="{ editableReference: canEditSource(attachment), lastReference: index === referenceImages.length - 1, expandedReference: !hideAdd && !materialTask && index === referenceImages.length - 1 && expandedReference }" @mouseenter="expandReference" @mouseleave="collapseReference" @focusin="expandReference" @focusout="collapseReference">
          <attachmentPreview :attachment="attachment" :directory="directory" /><videoReferenceInfo v-if="attachment.mimeType.startsWith('video/')" :attachment="attachment" :directory="directory" :referenceVideoMaxDuration="referenceVideoMaxDuration" />
          <span class="referenceLabel">{{ referenceLabel(attachment, index) }}</span>
          <el-tooltip content="替换"><button class="replaceReference" type="button" :disabled="disabled || opening" :aria-label="`替换${referenceLabel(attachment, index)}`" @click="openMenu($event, { role: 'reference', category: attachment.referenceCategory || 'character' }, attachment)"><icon-refresh :size="22" /></button></el-tooltip>
          <el-tooltip v-if="canEditSource(attachment)" content="编辑" :showArrow="false"><button class="editReference" type="button" :disabled="disabled || opening" aria-label="编辑参考素材" @click="emit('edit', attachment)"><icon-pencil :size="22" /></button></el-tooltip>
          <button class="removeReference" type="button" :disabled="disabled || opening" :aria-label="`移除${referenceLabel(attachment, index)}`" title="移除图片" @click="remove(attachment)"><icon-x :size="14" /></button>
          <button v-if="!hideAdd && !materialTask && index === referenceImages.length - 1" class="addNextReference" :title="referenceLimitReached ? '最多添加10个参考图片/视频' : undefined" type="button" :disabled="disabled || opening" aria-label="继续添加参考图" @click="openMenu($event, { role: 'reference' })"><icon-plus :size="22" /></button>
        </div>
      </template>
      <template v-else>
        <template v-for="(frame, index) in frames" :key="frame.role">
          <template v-if="index"><div v-for="(attachment, middleIndex) in middleFrames" :key="attachment.name + attachment.path" class="frameSlot"><attachmentPreview :attachment="attachment" :directory="directory" removable :disabled="disabled" @remove="remove(attachment)" /><videoReferenceInfo v-if="attachment.mimeType.startsWith('video/')" :attachment="attachment" :directory="directory" :referenceVideoMaxDuration="referenceVideoMaxDuration" /><span class="frameLabel">{{ middleFrameLabel(attachment, middleIndex) }}</span><el-tooltip content="替换"><button class="replaceFrame" type="button" :disabled="disabled || opening" :aria-label="`替换${middleFrameLabel(attachment, middleIndex)}`" @click="openMenu($event, { role: 'middleFrame', category: 'other' }, attachment)"><icon-refresh :size="22" /></button></el-tooltip><el-tooltip v-if="canEditSource(attachment)" content="编辑" :showArrow="false"><button class="editFrame" type="button" :disabled="disabled || opening" aria-label="编辑参考素材" @click="emit('edit', attachment)"><icon-pencil :size="16" /></button></el-tooltip></div><el-tooltip v-if="!hideAdd" content="添加中间帧"><button class="frameDivider" type="button" aria-label="添加中间帧" :disabled="disabled || opening" @click="openMenu($event, { role: 'middleFrame', category: 'other' })"><span>···</span><icon-plus :size="16" /></button></el-tooltip></template>
          <div class="frameSlot">
            <template v-if="frameAttachment(frame.role)">
              <attachmentPreview :attachment="frameAttachment(frame.role)!" :directory="directory" removable :disabled="disabled" @remove="remove(frameAttachment(frame.role)!)" />
              <el-tooltip content="替换"><button class="replaceFrame" type="button" :disabled="disabled || opening" :aria-label="`替换${frame.label}图片`" @click="openMenu($event, { role: frame.role }, frameAttachment(frame.role))"><icon-refresh :size="22" /></button></el-tooltip>
              <el-tooltip v-if="canEditSource(frameAttachment(frame.role))" content="编辑" :showArrow="false"><button class="editFrame" type="button" :disabled="disabled || opening" aria-label="编辑参考素材" @click="emit('edit', frameAttachment(frame.role)!)"><icon-pencil :size="16" /></button></el-tooltip>
              <button class="frameLabel" type="button" :disabled="disabled || opening" :aria-label="`替换${frame.label}`" @click="openMenu($event, { role: frame.role })">{{ frame.label }}</button>
            </template>
            <button v-else-if="!hideAdd" class="slotCard" type="button" :disabled="disabled || opening" :aria-label="frame.label" @click="openMenu($event, { role: frame.role })"><icon-plus :size="24" /><span>{{ frame.label }}</span></button>
          </div>
      </template>
      </template>
      <div v-if="!hideAdd && materialTask" class="materialEntry" :class="{ collapseFeedback }">
        <el-tooltip :content="materialHint" :showArrow="false">
          <span class="materialTrigger"><button class="slotCard materialChatButton" :class="{ generating: materialTask.status === 'generating' }" type="button" :disabled="disabled || opening" :aria-label="materialHint" :aria-expanded="!materialTask.minimized" :aria-busy="materialTask.status === 'generating'" @click="materialTask.minimized ? openTask(materialTask) : minimizeMaterialWorkspace(materialTask)">
            <brandLogo compact aria-hidden="true" />
            <span v-if="materialTask.status === 'failed' || materialTask.hasUnreadResult" class="materialStatus" :class="{ failed: materialTask.status === 'failed' }" aria-hidden="true">{{ materialTask.status === 'failed' ? '!' : '' }}</span>
          </button></span>
        </el-tooltip>
        <el-tooltip content="添加参考素材" :showArrow="false"><button class="materialAdd" type="button" :disabled="disabled || opening" aria-label="添加参考素材" @click="openMenu($event, { role: mode === 'frames' ? 'middleFrame' : 'reference' })"><icon-plus :size="16" /></button></el-tooltip>
      </div>
    </div>
    <p v-if="!motion && videoMode" class="videoCapabilityHint">{{ allowVideos ? '视频参考用于辅助创作；复刻角色动作请切换“动作模仿”。' : '当前模型不支持视频参考，请切换支持视频参考的模型后添加。' }}</p>
    <el-popover ref="sourcePopover" :visible="menuVisible" :trigger="[]" virtualTriggering :virtualRef="menuAnchor" placement="right-start" :width="180" :showArrow="false" :popperStyle="{ maxHeight: 'calc(100dvh - 24px)', overflowY: 'auto' }">
      <div v-click-outside:[menuExcludes]="closeMenu" class="referenceSourceMenu" @keydown.esc.stop.prevent="closeMenu" role="menu" :aria-label="menuStage === 'category' ? '选择素材类别' : '选择素材来源'">
        <template v-if="menuStage === 'category'"><button v-for="group in groups" :key="group.value" type="button" role="menuitem" @click="selectCategory(group.value)">上传{{ group.label }}</button></template>
        <template v-else><button v-for="source in sources" :key="source.value" type="button" role="menuitem" @click="chooseSource(source.value)">{{ source.label }}</button></template>
      </div>
    </el-popover>
    <el-dialog v-model="assetsOpen" class="materialLibraryDialog" title="素材库添加" width="min(1080px, 96vw)" alignCenter appendToBody destroyOnClose :closeOnClickModal="false"><personalAssetBrowser selectable :selectionLimit="assetSelectionLimit" :imagesOnly="targetAccept === 'image/*'" :videosOnly="targetAccept === 'video/*'" @select="selectAssets" /></el-dialog>
  </div>
</template>
<script setup lang="ts">
import { fileGenerationOrigin, fileAssetPath, validateGenerationOrigin } from "@/lib/generationOrigin";
import { computed, nextTick, onUnmounted, ref, watch } from "vue";
import { ClickOutside as vClickOutside, ElMessage, type PopoverInstance } from "element-plus";
import { IconPlus, IconRefresh, IconX, IconPhoto, IconChevronDown, IconLayoutColumns, IconCheck } from "@tabler/icons-vue";
import type { AgentAttachment, ReferenceRole, ReferenceCategory } from "@/components/agent/types";
import brandLogo from "@/components/brandLogo.vue";
import attachmentPreview from "@/components/agent/attachmentPreview.vue";
import videoReferenceInfo from "@/components/videoReferenceInfo.vue";
import personalAssetBrowser from "@/components/personalAssetBrowser.vue";
import { IconPencil } from "@tabler/icons-vue";
import { materialEditorState, materialWorkspaces, openMaterialWorkspace, minimizeMaterialWorkspace, type MaterialTarget, type MaterialWorkspace } from "@/stores/materialEditor";
const emit = defineEmits<{ edit: [attachment: AgentAttachment] }>();
const props = withDefaults(defineProps<{ hideAdd?: boolean; motion?: boolean; videoMode?: boolean; motionAvailable?: boolean; allowVideos?: boolean; referenceVideoMaxDuration?: number; durations?: number[]; showFrames?: boolean; tabsTarget?: HTMLElement; directory?: string; disabled?: boolean; ensureDirectory?: () => Promise<string | undefined> }>(), { showFrames: true });
const attachments = defineModel<AgentAttachment[]>({ required: true });
const editableOrigins = ref(new Set<string>());
watch([() => props.directory, () => attachments.value.map(item => item.origin)], async (_, __, onCleanup) => {
  let cancelled = false;
  onCleanup(() => { cancelled = true; });
  editableOrigins.value = new Set();
  const origins = new Map(attachments.value.filter(item => item.origin).map(item => [JSON.stringify(item.origin), item.origin!]));
  const valid = await Promise.all([...origins].map(async ([key, origin]) => {
    try { await validateGenerationOrigin(origin); return key; }
    catch { return ""; }
  }));
  if (!cancelled) editableOrigins.value = new Set(valid.filter(Boolean));
}, { immediate: true, deep: true });
function canEditSource(attachment?: AgentAttachment) {
  return !!attachment?.origin && editableOrigins.value.has(JSON.stringify(attachment.origin));
}
const modeVisible = ref(false);
const mode = defineModel<"reference" | "frames">("mode", { default: "reference" });
let active = true;
const owner = Symbol(), fileInput = ref<HTMLInputElement>(), assetsOpen = ref(false), opening = ref(false);
const materialTask = computed(() => {
  const task = materialWorkspaces.value.findLast(item => item.directory === props.directory && (!item.request || item.request.owner === owner));
  return task?.ended ? undefined : task;
});
const materialHint = computed(() => {
  const task = materialTask.value;
  if (!task?.minimized) return "收起自定义素材对话";
  return ({ idle: "展开自定义素材对话", queued: "等待生成，点击查看", generating: "正在生成，点击查看", completed: "生成完成，点击查看", failed: "生成失败，点击查看原因" })[task.status];
});
const collapseFeedback = ref(false);
let collapseTimer: ReturnType<typeof setTimeout> | undefined;
watch(() => materialTask.value?.minimized, (minimized, previous) => {
  clearTimeout(collapseTimer);
  collapseFeedback.value = minimized === true && previous === false;
  if (collapseFeedback.value) collapseTimer = setTimeout(() => { collapseFeedback.value = false; }, 400);
});
const target = ref<MaterialTarget>({ role: "reference" }), replacing = ref<AgentAttachment>();
const menuVisible = ref(false), menuStage = ref<"category" | "source">("category"), menuAnchor = ref<HTMLElement>(), sourcePopover = ref<PopoverInstance>();
const menuExcludes = computed(() => [menuAnchor.value, sourcePopover.value?.popperRef?.contentRef]);
const tabs = computed(() => ([{ value: "reference", label: "参考图" }, { value: "frames", label: "首尾帧" }] as const).filter(tab => props.showFrames || tab.value === "reference"));
watch(() => props.showFrames, show => { if (!show) mode.value = "reference"; }, { immediate: true, flush: "sync" });
const frames = [{ role: "firstFrame", label: "首帧" }, { role: "lastFrame", label: "尾帧" }] as const;
const groups = [{ value: "character", label: "角色" }, { value: "prop", label: "道具" }, { value: "scene", label: "背景" }, { value: "other", label: "其他" }] as const;
const allSources = [{ value: "local", label: "从本地上传" }, { value: "assets", label: "素材库添加" }, { value: "custom", label: "自定义素材" }];
const motionSlots = [{ type: "image", label: "角色", hint: "添加角色参考图" }, { type: "video", label: "动作", hint: "添加动作参考视频" }] as const;
function motionAttachment(type: string) { return attachments.value.find(item => item.mimeType.startsWith(`${type}/`)); }
const targetAccept = computed(() => props.motion ? target.value.category === "character" ? "image/*" : "video/*" : !props.allowVideos || ["firstFrame", "lastFrame"].includes(target.value.role) ? "image/*" : "image/*,video/*");
const sources = computed(() => allSources.filter(source => !props.motion || target.value.category === "character" || source.value !== "custom"));
function openMotionMenu(event: MouseEvent, type: "image" | "video") {
  openMenu(event, { role: "reference", category: type === "image" ? "character" : "other" }, motionAttachment(type));
}
const expandedReference = ref(false);
let hoverTimer: ReturnType<typeof setTimeout> | undefined;
function expandReference() { clearTimeout(hoverTimer); expandedReference.value = true; }
function collapseReference() { clearTimeout(hoverTimer); hoverTimer = setTimeout(() => { if (!menuVisible.value) expandedReference.value = false; }, 500); }
const middleFrames = computed(() => attachments.value.filter(item => item.referenceRole === "middleFrame"));
const referenceLimitReached = computed(() => attachments.value.filter(item => /^(image|video)\//.test(item.mimeType)).length >= 10);
const assetSelectionLimit = computed(() => props.motion || replacing.value || ["firstFrame", "lastFrame"].includes(target.value.role) ? 1 : Math.max(0, 10 - attachments.value.filter(item => /^(image|video)\//.test(item.mimeType)).length));
const referenceImages = computed(() => attachments.value.filter(item => item.referenceRole === "reference"));
watch(attachments, value => { if (props.showFrames && value.some(item => item.referenceRole === "firstFrame" || item.referenceRole === "lastFrame") && !value.some(item => item.referenceRole === "reference")) mode.value = "frames"; }, { immediate: true });
function frameAttachment(role: ReferenceRole) { return attachments.value.find(item => item.referenceRole === role); }
function middleFrameLabel(attachment: AgentAttachment, index: number) { return /^中间帧\d+$/.test(attachment.referenceName || "") ? attachment.referenceName : `中间帧${index + 1}`; }
function referenceLabel(attachment: AgentAttachment, index: number) { return attachment.referenceName?.replace(/^场景/, "背景") || `${groups.find(group => group.value === attachment.referenceCategory)?.label || "其他"}${index + 1}`; }
function remove(attachment: AgentAttachment) { attachments.value = attachments.value.filter(item => item !== attachment); }
function closeMenu() { menuVisible.value = false; collapseReference(); }
function openMenu(event: MouseEvent, destination: MaterialTarget, attachment?: AgentAttachment) {
  if (props.disabled || opening.value) return;
  if (referenceLimitReached.value && !attachment && (["reference", "middleFrame"].includes(destination.role) || !frameAttachment(destination.role))) { ElMessage.warning("最多添加10个参考图片/视频"); return; }
  menuAnchor.value = event.currentTarget as HTMLElement; target.value = destination; replacing.value = attachment;
  menuStage.value = destination.role === "reference" && !destination.category ? "category" : "source"; menuVisible.value = true;
}
function selectCategory(category: ReferenceCategory) { target.value = { role: "reference", category }; menuStage.value = "source"; }
function applyFiles(files: File[], destination = target.value, replacement = replacing.value, expectedMode = props.motion ? "motion" : props.videoMode ? "video" : "image") {
  if (expectedMode !== (props.motion ? "motion" : props.videoMode ? "video" : "image")) throw new Error("素材所属模式已切换，请切回原模式后添加");
  if (!files.length) return;
  if (props.motion && files.length !== 1) throw new Error("角色和动作位置每次只能添加一个素材");
  if (props.motion && files.some(file => !file.type.startsWith(destination.category === "character" ? "image/" : "video/"))) throw new Error(destination.category === "character" ? "角色位置仅支持图片" : "动作位置仅支持视频");
  if (!props.motion && !props.allowVideos && files.some(file => file.type.startsWith("video/"))) throw new Error("当前模式或模型仅支持图片，请切换支持视频参考的模型");
  const valid = files.filter(file => (file.type.startsWith("image/") || file.type.startsWith("video/") && !["firstFrame", "lastFrame"].includes(destination.role)) && file.size > 0 && file.size <= 100 * 1024 * 1024);
  if (valid.length !== files.length) throw new Error("请选择非空且不超过100 MB的图片或视频，首尾帧仅支持图片");
  if (props.motion && !replacement && motionAttachment(destination.category === "character" ? "image" : "video")) throw new Error("该位置已有素材，请使用替换");
  const retained = replacement || ["reference", "middleFrame"].includes(destination.role) ? attachments.value : attachments.value.filter(item => item.referenceRole !== destination.role);
  const group = groups.find(item => item.value === destination.category);
  const existing = retained.filter(item => destination.role === "middleFrame" ? item.referenceRole === "middleFrame" : item.referenceCategory === destination.category && item.referenceRole === destination.role);
  const lastNumber = Math.max(existing.length, 0, ...existing.map(item => Number(item.referenceName?.match(destination.role === "middleFrame" ? /^中间帧(\d+)$/ : /(\d+)$/)?.[1] ?? 0)));
  const selected = ["reference", "middleFrame"].includes(destination.role) && !replacement ? valid : valid.slice(0, 1);
  const replacementIndex = replacement ? retained.indexOf(replacement) : -1;
  if (replacement && replacementIndex < 0) throw new Error("原参考图已移除，请重新选择");
  if (retained.filter(item => /^(image|video)\//.test(item.mimeType)).length + selected.filter(file => /^(image|video)\//.test(file.type)).length - (replacement && /^(image|video)\//.test(replacement.mimeType) ? 1 : 0) > 10) throw new Error("最多添加10个参考图片/视频");
  if (retained.length + selected.length - (replacement ? 1 : 0) > 20) throw new Error("每条消息最多添加20个附件");
  const added = selected.map((file, index) => ({ name: file.name, path: "", mimeType: file.type, file, origin: fileGenerationOrigin(file), assetPath: fileAssetPath(file), referenceRole: destination.role, referenceCategory: destination.category, referenceName: props.motion ? destination.category === "character" ? "角色1" : "动作1" : replacement?.referenceName || (destination.role === "middleFrame" ? `中间帧${lastNumber + index + 1}` : group ? `${group.label}${lastNumber + index + 1}` : undefined) }));
  if (replacement) { const result = [...retained]; result.splice(replacementIndex, 1, ...added); attachments.value = result; }
  else attachments.value = [...retained, ...added];
  replacing.value = undefined;
}
function openCustomMaterial() {
  const tasks = materialWorkspaces.value.filter(item => !item.ended && item.directory === props.directory && (!item.request || item.request.owner === owner));
  const task = tasks.findLast(item => item.status === "queued" || item.status === "generating") ?? tasks.at(-1);
  if (task) { openTask(task); return; }
  target.value = { role: "reference", category: props.motion ? "character" : "other" };
  replacing.value = undefined;
  void chooseSource("custom");
}
function addMotionFiles(files: File[]) {
  if (props.disabled || opening.value) return;
  if (files.some(file => !/^(image|video)\//.test(file.type)) || files.filter(file => file.type.startsWith("image/")).length > 1 || files.filter(file => file.type.startsWith("video/")).length > 1) { ElMessage.warning("请添加一张角色图和一个动作视频"); return; }
  if (files.some(file => motionAttachment(file.type.startsWith("image/") ? "image" : "video"))) { ElMessage.warning("该位置已有素材，请使用替换"); return; }
  try { for (const file of files) applyFiles([file], { role: "reference", category: file.type.startsWith("image/") ? "character" : "other" }, undefined); }
  catch (error) { ElMessage.error(error instanceof Error ? error.message : "添加素材失败"); }
}
defineExpose({ openCustomMaterial, addMotionFiles });
watch([() => props.motion, () => props.allowVideos], () => { closeMenu(); assetsOpen.value = false; });
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
  const expectedMode = props.motion ? "motion" : props.videoMode ? "video" : "image";
  try {
    const directory = props.directory || await props.ensureDirectory?.();
    if (!directory) { if (!props.ensureDirectory) ElMessage.warning("请先选择项目文件夹"); return; }
    if (!active) return;
    const label = destination.role === "reference" ? `参考图 · ${groups.find(group => group.value === destination.category)?.label || "角色"}` : destination.role === "firstFrame" ? "首帧" : destination.role === "middleFrame" ? "中间帧" : "尾帧";
    materialEditorState.value = { owner, directory, target: destination, label, apply: file => applyFiles([file], destination, replacement, expectedMode) };
  } catch (error) { ElMessage.error(error instanceof Error ? error.message : "自定义素材打开失败"); }
  finally { opening.value = false; }
}
function selectFiles(event: Event) { try { applyFiles(Array.from((event.target as HTMLInputElement).files ?? [])); } catch (error) { ElMessage.error((error as Error).message); } }
function selectAssets(files: File[]) { try { applyFiles(files); assetsOpen.value = false; } catch (error) { ElMessage.error((error as Error).message); } }
onUnmounted(() => { clearTimeout(collapseTimer); clearTimeout(hoverTimer); active = false; for (const task of materialWorkspaces.value) if (task.request?.owner === owner) task.request = undefined; });
</script>
<style scoped lang="scss">
.simpleReferenceSlots {
  .referenceCard.editableReference .replaceReference { inset: auto; left: 7px; top: 22px; margin: 0; width: 26px; height: 26px; }
  .frameSlot .editFrame { position: absolute; right: 2px; top: 2px; display: none; width: 24px; height: 24px; padding: 0; border: 0; border-radius: 6px; color: white; background: #18151dd9; cursor: pointer; }
  .frameSlot:hover .editFrame, .frameSlot:focus-within .editFrame { display: grid; place-items: center; }
  display: flex; justify-content: flex-start; align-items: flex-start; gap: 12px; padding: 8px 12px 14px; min-width: 0; flex-wrap: wrap;

  .videoCapabilityHint { margin: 0; color: var(--el-text-color-secondary); font-size: 11px; line-height: 1.6; flex-basis: 100%; }
  .motionDeck { display: flex; flex-wrap: wrap; gap: 18px; align-items: flex-start;
    .motionSlot { display: flex; flex-direction: column; gap: 8px; small { color: var(--el-text-color-secondary); font-size: 11px; } }
    .motionCover { position: relative; width: 72px; height: 72px; :deep(.thumbnailItem), :deep(.thumbnailImage), :deep(.thumbnailButton) { width: 72px; height: 72px; } }
    .motionLabel { position: absolute; bottom: 0; left: 0; width: 100%; padding: 3px 0; border-radius: 0 0 10px 10px; text-align: center; background: #333b; color: #fff; font-size: 11px; pointer-events: none; }
    .motionReplace, .motionRemove { position: absolute; display: none; align-items: center; justify-content: center; border: 0; color: white; background: #343a3eee; cursor: pointer; }
    .motionReplace { top: 22px; left: 22px; width: 28px; height: 28px; border-radius: 6px; }
    .motionRemove { top: -6px; right: -6px; width: 22px; height: 22px; border-radius: 50%; }
    .motionCover:hover, .motionCover:focus-within { .motionReplace, .motionRemove { display: flex; } }
    .motionHint { flex-basis: 100%; max-width: 520px; margin: 0; color: var(--el-text-color-secondary); font-size: 12px; line-height: 1.6; }
  }
  .referenceDeck, .frameDeck { display: flex; justify-content: flex-start; align-items: flex-start; gap: 10px; min-width: 0; flex-wrap: wrap; padding: 4px 10px 8px 0; }

  .materialEntry { position: relative; flex: none;
    .materialTrigger { display: flex; }
    &.collapseFeedback .materialChatButton { animation: materialCollapseGlow 400ms ease-out; }
    .materialAdd { position: absolute; right: -6px; bottom: -6px; display: grid; place-items: center; width: 28px; height: 28px; padding: 0; border: 1px solid var(--el-border-color); border-radius: 50%; background: #50555a; color: white; opacity: 0; pointer-events: none; transition: opacity 140ms ease; cursor: pointer;
      &:focus-visible { outline: 2px solid #b4a1ff; outline-offset: 2px; }
    }
    &:hover .materialAdd, &:focus-within .materialAdd { opacity: 1; pointer-events: auto; }
    .materialStatus { position: absolute; top: 4px; right: 4px; width: 8px; height: 8px; border-radius: 50%; background: #b4a1ff;
      &.failed { display: grid; place-items: center; width: 14px; height: 14px; color: #fff; background: #bd4a4a; font-size: 11px; font-weight: 700; }
    }
  }
  .materialChatButton { position: relative;
    &:focus-visible { outline: 2px solid #b4a1ff; outline-offset: 2px; }
    :deep(.brandLogo.compact) { position: relative; width: 28px; height: 28px; }
    &.generating {
      :deep(.brandLogo) { animation: materialEnergyPulse 2.6s ease-in-out infinite; }
      :deep(.brandLogo::before) { content: ""; position: absolute; inset: -5px; border-radius: 50%; background: radial-gradient(circle, #9370ff66, #498aff22 45%, transparent 72%); pointer-events: none; animation: materialEnergyHalo 2.6s ease-in-out infinite; }
      :deep(.brandLogo::after) { content: ""; position: absolute; inset: 0; background: linear-gradient(110deg, transparent 30%, #aa79ff66 40%, #e4dcff 48%, #83eaff 52%, transparent 66%); background-size: 300% 100%; mask: url("/afxenMark.svg") center / contain no-repeat; pointer-events: none; animation: materialGradientFlow 2.6s ease-in-out infinite; }
    }
  }
  .slotCard { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; width: 72px; height: 72px; border: 0; border-radius: 12px; background: #2d343a; color: var(--el-text-color-primary); cursor: pointer; font-size: 12px; &:disabled { opacity: .5; cursor: default; } &:hover { background: var(--el-fill-color); } }
  .referenceCard { position: relative; width: 72px; min-height: 72px; &:has(.videoReferenceInfo) { width: 180px; .replaceReference { inset: 22px auto auto 7px; margin: 0; } .editReference { left: 38px; right: auto; } .removeReference { left: 57px; right: auto; } } :deep(.thumbnailItem), :deep(.thumbnailImage), :deep(.thumbnailButton) { width: 72px; height: 72px; } :deep(.thumbnailImage) { border: 0; border-radius: 12px; }
    .referenceLabel { position: absolute; top: 48px; left: 0; width: 72px; height: 24px; display: flex; align-items: center; justify-content: center; background: rgba(82,86,90,.85); color: white; font-size: 11px; border-radius: 0 0 12px 12px; pointer-events: none; }
    .replaceReference, .editReference, .removeReference { display: none; position: absolute; border: 0; padding: 0; color: white; cursor: pointer; background: rgba(54,58,62,.9); }
    .replaceReference { inset: 0; margin: auto; width: 28px; height: 28px; border-radius: 7px; }
    .editReference { right: 7px; top: 22px; width: 26px; height: 26px; border-radius: 7px; &:disabled { cursor: not-allowed; } }
    .removeReference { top: -7px; right: -7px; width: 22px; height: 22px; border-radius: 50%; align-items: center; justify-content: center; }
    .addNextReference { position: absolute; bottom: -6px; right: -8px; width: 30px; height: 30px; display: flex; align-items: center; justify-content: center; padding: 0; border: 1px solid var(--el-border-color); border-radius: 50%; color: white; background: #50555a; cursor: pointer; }
    &:hover, &:focus-within { .replaceReference, .editReference, .removeReference { display: flex; align-items: center; justify-content: center; } }
    &.expandedReference { margin-right: 82px; .addNextReference { left: calc(100% + 10px); bottom: 0; right: auto; width: 72px; height: 72px; border-radius: 12px; svg { width: 30px; height: 30px; } } }
  }
  .frameSlot { position: relative; width: 72px; &:has(.videoReferenceInfo) { width: 180px; .frameLabel { top: 48px; bottom: auto; width: 72px; } .replaceFrame { inset: 22px auto auto 22px; margin: 0; } } .replaceFrame { display: none; position: absolute; inset: 0; margin: auto; z-index: 2; width: 28px; height: 28px; border: 0; border-radius: 7px; padding: 0; color: white; background: rgba(54,58,62,.9); cursor: pointer; } &:hover, &:focus-within { .replaceFrame { display: flex; align-items: center; justify-content: center; } } :deep(.thumbnailItem), :deep(.thumbnailImage), :deep(.thumbnailButton) { width: 72px; height: 72px; } .frameLabel { position: absolute; inset: auto 0 0; width: 100%; height: 24px; border: 0; border-radius: 0 0 10px 10px; background: rgba(82,86,90,.85); color: white; cursor: pointer; } }
  .frameDivider { align-self: center; border: 0; background: transparent; color: var(--el-text-color-secondary); cursor: pointer; display: grid; place-items: center; width: 26px; height: 30px; svg { display: none; } &:hover, &:focus-visible { span { display: none; } svg { display: block; } } }
  @media(max-width:600px) { flex-wrap: wrap; .referenceDeck, .frameDeck { width: 100%; } }
}
.referenceModeButton { display: inline-flex; flex: none; align-items: center; justify-content: center; gap: 6px; height: 32px; min-width: 88px; padding: 0 12px; border: 1px solid transparent; border-radius: 12px; color: #f2f2f2; background: transparent; font: 400 13px/1 Arial, sans-serif; white-space: nowrap; cursor: pointer; transition: background 180ms, border-color 180ms; &:hover:enabled, &.modeOpen, &[aria-expanded="true"] { background: #303030; border-color: transparent; } &:focus-visible { outline: 2px solid #a28ae9; outline-offset: 2px; } &:disabled { opacity: .5; cursor: not-allowed; } }
.referenceTabs { display: grid; gap: 4px; button { display: flex; align-items: center; gap: 10px; min-height: 40px; padding: 9px 12px; border: 0; border-radius: 8px; text-align: left; color: #f2f2f2; background: var(--agent-input-bg, #1b1b1b); cursor: pointer; font: 400 13px/1 Arial, sans-serif; span { flex: 1; } &:hover, &[aria-selected="true"] { background: #303030; } &:focus-visible { outline: 1px solid #a28ae9; } } }

.referenceSourceMenu { display: grid; gap: 3px; button { border: 0; border-radius: 6px; padding: 9px 10px; color: var(--el-text-color-primary); background: transparent; font: inherit; font-size: 13px; text-align: left; cursor: pointer; &:hover, &:focus-visible { background: var(--el-fill-color); } } }
</style>

<style lang="scss">
.materialLibraryDialog { .el-dialog__header { padding-bottom: 8px; } .el-dialog__title { font-size: 18px; font-weight: 500; } }
.referenceModePopover.el-popover.el-popper { padding: 8px; border: 0; border-radius: 10px; background: var(--agent-input-bg, #1b1b1b); box-shadow: 0 8px 24px #0006; }
</style>

<style scoped lang="scss">
@keyframes materialCollapseGlow { 0%, 100% { box-shadow: none; } 40% { box-shadow: 0 0 0 3px #9370ff55, 0 0 16px #9370ff66; } }
@media (hover: none) { .simpleReferenceSlots .materialEntry .materialAdd { opacity: 1; pointer-events: auto; } }
@keyframes materialEnergyPulse { 0%, 100% { transform: scale(1); filter: drop-shadow(0 0 1px #8060ff44); } 50% { transform: scale(1.09); filter: drop-shadow(0 0 4px #8c6cffaa); } }
@keyframes materialEnergyHalo { 0%, 100% { transform: scale(.8); opacity: .3; } 50% { transform: scale(1.25); opacity: .85; } }
@keyframes materialGradientFlow { 0% { background-position: 140% 50%; opacity: 0; } 20%, 75% { opacity: .9; } 100% { background-position: -40% 50%; opacity: 0; } }
@media(prefers-reduced-motion:reduce) {
  .simpleReferenceSlots .materialEntry.collapseFeedback .materialChatButton { animation: none; }
  .materialChatButton.generating {
    :deep(.brandLogo) { animation: none; }
    :deep(.brandLogo::before), :deep(.brandLogo::after) { animation: none; content: none; }
  }
}
</style>
