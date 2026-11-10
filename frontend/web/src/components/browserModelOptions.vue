<template>
  <span v-if="browserConfig.enabled || studioCreationMode" ref="parameterTrigger"><el-button plain aria-label="模型与生成参数" :aria-expanded="parametersVisible" @click="parametersVisible = true">{{ models.find(model => model.id === browserModelSelection[kind])?.label || models[0]?.label || '未接入模型' }} · 参数</el-button></span>
  <el-popover ref="parameterPopover" v-if="browserConfig.enabled || studioCreationMode" trigger="click" :visible="parametersVisible" :triggerKeys="[]" :hideAfter="0" @update:visible="openParameters" :placement="belowInput ? 'bottom-start' : 'top'" virtualTriggering :virtualRef="parameterReference" :width="300" :popperOptions="{ modifiers: [{ name: 'preventOverflow', options: { padding: 12, altAxis: !belowInput, tether: false } }, { name: 'flip', enabled: !belowInput, options: { padding: 12, fallbackPlacements: ['top', 'bottom', 'right', 'left'] } }] }" popperClass="generationParameters" :popperStyle="{ maxHeight: belowInput ? `${parameterMaxHeight}px` : 'calc(100dvh - 24px)', maxWidth: 'calc(100vw - 24px)', overflowY: 'auto', boxSizing: 'border-box' }">

    <el-form class="parameterForm" v-click-outside:[parameterExcludes]="closeParameters" labelPosition="top">
      <el-form-item v-if="workspace.creationMode === 'professional' && !fixedKind" label="参数类型"><el-select :teleported="false" v-model="parameterKind" aria-label="参数类型"><el-option v-for="(label, value) in kindLabels" :key="value" :label="label" :value="value" /></el-select></el-form-item>
      <el-form-item :label="`${kindLabels[kind]}模型`"><el-select :teleported="false" v-model="selectedModelId" placeholder="选择已接入模型" :noDataText="`未接入${kindLabels[kind]}模型，请在 API 配置中添加对应类型`"><el-option v-for="model in models" :key="model.id" :label="model.label" :value="model.id" /></el-select></el-form-item>
      <template v-if="kind === 'image' || kind === 'video'">
        <el-form-item v-if="ratios.length" label="比例"><el-radio-group v-model="browserConfig.ratio" size="small" aria-label="生成比例"><el-radio-button v-for="item in ratios" :key="item" :value="item">{{ item }}</el-radio-button></el-radio-group></el-form-item>
        <el-form-item v-if="kind === 'image' && imageClarities.length" label="图片清晰度"><el-select :teleported="false" v-model="imageResolution" aria-label="图片清晰度"><el-option v-for="item in imageClarities" :key="item" :label="item.toLowerCase()" :value="item" /></el-select><small>{{ browserConfig.imageSize.replace('*', ' × ') }}</small></el-form-item>
        <el-form-item v-else-if="kind === 'image' && imageSizes.length" label="图片尺寸"><el-select :teleported="false" v-model="browserConfig.imageSize" aria-label="图片尺寸"><el-option v-for="item in imageSizes" :key="item" :value="item" /></el-select></el-form-item>
        <el-form-item v-if="kind === 'image'" label="生成数量"><el-radio-group v-model="browserConfig.count" size="small" aria-label="生成数量"><el-radio-button v-for="item in imageCounts" :key="item" :value="item">{{ item }}</el-radio-button></el-radio-group></el-form-item>
        <el-form-item v-if="kind === 'video' && resolutions.length" label="清晰度"><el-radio-group v-model="browserConfig.resolution" size="small" aria-label="视频清晰度"><el-radio-button v-for="item in resolutions" :key="item" :value="item">{{ item }}</el-radio-button></el-radio-group></el-form-item>
        <el-form-item v-if="kind === 'video' && capabilities?.audio === 'optional'" label="生成音频"><el-radio-group v-model="browserConfig.generateAudio" class="audioChoice" aria-label="生成音频"><el-radio-button :value="true">开启</el-radio-button><el-radio-button :value="false">关闭</el-radio-button></el-radio-group></el-form-item>
        <el-form-item v-if="kind === 'video' && durations.length" :label="`生成时长 · ${browserConfig.duration} 秒`"><el-slider v-model="durationIndex" :min="0" :max="Math.max(1, durations.length - 1)" :step="1" :disabled="durations.length === 1" :marks="durationMarks" :formatTooltip="index => `${durations[index]}秒`" aria-label="视频生成时长" /></el-form-item>
      </template>
      <p v-if="kind === 'audio' || kind === 'text'">当前适配器仅支持文字输入。</p>
    </el-form>
  </el-popover>
</template>

<script setup lang="ts">
import { ElSlider, ClickOutside as vClickOutside, type PopoverInstance } from "element-plus";
import { imageClaritySizes, imageDimensions } from "@toonflow/node-shared/generationDefaults";
import { useWorkspaceStore } from "@/stores/workspace";
import { studioCreationMode } from "@/lib/browserWorkspaceFiles";
import { computed, ref, watch } from "vue";
import { browserConfig, browserModelSelection, configuredBrowserModels, generationBusy, inferGenerationKind, type ModelKind } from "@/stores/browserGeneration";
const parametersVisible = ref(false);
const parameterTrigger = ref<HTMLElement>();
const parameterPopover = ref<PopoverInstance>();
const parameterExcludes = computed(() => [parameterTrigger.value, parameterPopover.value?.popperRef?.contentRef]);
// ACT: 忽略组件的失焦和键盘隐藏请求，只在面板外点击时关闭。
function openParameters(visible: boolean) { if (visible) parametersVisible.value = true; }
function closeParameters() { parametersVisible.value = false; }
const props = withDefaults(defineProps<{ belowInput?: boolean; prompt?: string; fixedKind?: ModelKind }>(), { prompt: "" });
const parameterMaxHeight = ref(240);
const parameterReference = computed(() => props.belowInput ? ({
  contextElement: parameterTrigger.value,
  getBoundingClientRect() {
    const trigger = parameterTrigger.value?.getBoundingClientRect();
    const input = parameterTrigger.value?.closest(".messageInput")?.getBoundingClientRect();
    return new DOMRect(trigger?.left ?? 0, input?.bottom ?? trigger?.bottom ?? 0, trigger?.width ?? 0, 0);
  },
}) : parameterTrigger.value);
watch([parametersVisible, () => props.belowInput], ([visible, belowInput], _previous, onCleanup) => {
  if (!visible || !belowInput) return;
  const input = parameterTrigger.value?.closest<HTMLElement>(".messageInput");
  if (!input) return;
  const available = window.innerHeight - input.getBoundingClientRect().bottom - 24;
  if (available < 180) input.closest(".assistantContent")?.scrollBy({ top: 180 - available, behavior: "instant" });
  const updateHeight = () => { parameterMaxHeight.value = Math.max(48, window.innerHeight - input.getBoundingClientRect().bottom - 24); };
  updateHeight();
  const observer = new ResizeObserver(updateHeight); observer.observe(input);
  window.addEventListener("resize", updateHeight);
  window.addEventListener("scroll", updateHeight, true);
  onCleanup(() => { observer.disconnect(); window.removeEventListener("resize", updateHeight); window.removeEventListener("scroll", updateHeight, true); });
}, { flush: "post" });
const workspace = useWorkspaceStore();
const parameterKind = ref<ModelKind>("text");
const kindLabels = { text: "文字", image: "图片", video: "视频", audio: "音频" };
const kind = computed(() => props.fixedKind ?? (generationBusy.value ? browserConfig.kind : workspace.creationMode === "professional" ? parameterKind.value : inferGenerationKind(props.prompt)));
const models = computed(() => configuredBrowserModels(kind.value));
const selectedModelId = computed({ get: () => models.value.find(model => model.id === browserModelSelection[kind.value])?.id ?? models.value[0]?.id ?? "", set: value => { browserModelSelection[kind.value] = value; } });
const capabilities = computed(() => models.value.find(model => model.id === selectedModelId.value)?.capabilities);
const ratios = computed(() => kind.value === "image" ? capabilities.value?.imageRatios ?? [] : Object.keys(imageDimensions));
const imageSizes = computed(() => capabilities.value?.imageSizes ?? []);
const imageCounts = computed(() => capabilities.value?.imageCounts?.length ? capabilities.value.imageCounts : [1]);
const imageClarities = computed(() => Object.keys(imageClaritySizes).filter(value => imageSizes.value.includes(imageClaritySizes[value]?.[browserConfig.ratio] ?? "")));
const durations = computed(() => [...new Set(capabilities.value?.durationResolutionMap?.flatMap(item => item.duration) ?? [])].sort((a, b) => a - b));
const resolutions = computed(() => [...new Set(capabilities.value?.durationResolutionMap?.filter(item => item.duration.includes(Number(browserConfig.duration))).flatMap(item => item.resolution) ?? [])]);
const durationIndex = computed({ get: () => Math.max(0, durations.value.indexOf(Number(browserConfig.duration))), set: index => { browserConfig.duration = String(durations.value[index] ?? durations.value[0] ?? ""); } });
const durationMarks = computed(() => Object.fromEntries(durations.value.flatMap((value, index) => index === 0 || index === durations.value.length - 1 || index % Math.ceil(durations.value.length / 6) === 0 ? [[index, String(value)]] : [])));
const imageResolution = computed({ get: () => browserConfig.imageResolution, set: value => { browserConfig.imageResolution = value; browserConfig.imageSize = imageClaritySizes[value]?.[browserConfig.ratio] ?? browserConfig.imageSize; } });

watch([kind, selectedModelId, capabilities, () => browserConfig.ratio, () => browserConfig.duration], () => {
  if (!capabilities.value) return;
  if (ratios.value.length && !ratios.value.includes(browserConfig.ratio)) browserConfig.ratio = ratios.value[0]!;
  if (kind.value === "image") {
    if (!imageCounts.value.includes(browserConfig.count)) browserConfig.count = imageCounts.value[0]!;
    if (imageClarities.value.length) {
      if (!imageClarities.value.includes(browserConfig.imageResolution)) browserConfig.imageResolution = imageClarities.value[0]!;
      browserConfig.imageSize = imageClaritySizes[browserConfig.imageResolution]?.[browserConfig.ratio] ?? browserConfig.imageSize;
    } else if (!imageSizes.value.includes(browserConfig.imageSize)) browserConfig.imageSize = imageSizes.value[0] ?? "";
  }
  if (kind.value === "video") {
    if (!durations.value.includes(Number(browserConfig.duration))) browserConfig.duration = String(durations.value.includes(5) ? 5 : durations.value[0] ?? "");
    if (!resolutions.value.includes(browserConfig.resolution)) browserConfig.resolution = resolutions.value.find(value => value.toLowerCase() === browserConfig.resolution.toLowerCase()) ?? resolutions.value[0] ?? "";
  }
}, { immediate: true });
</script>

<style scoped lang="scss">
.audioChoice { display: flex; width: 100%; gap: 8px; :deep(.el-radio-button) { flex: 1; } :deep(.el-radio-button__inner) { width: 100%; border: 1px solid var(--el-border-color); border-radius: 7px; box-shadow: none; } :deep(.el-radio-button.is-active .el-radio-button__inner) { background: var(--el-fill-color); color: var(--el-text-color-primary); border-color: var(--el-text-color-primary); } }
</style>

<style scoped lang="scss">
.parameterForm { .el-form-item { margin-bottom: 14px; } &::-webkit-scrollbar { display: none; } scrollbar-width: none; }
</style>

<style lang="scss">
.generationParameters { scrollbar-width: none; &::-webkit-scrollbar { display: none; } }
</style>
