<template>
  <el-popover v-if="browserConfig.enabled || browserWorkspaceMode" v-model:visible="parametersVisible" trigger="click" :triggerKeys="[]" :hideAfter="0" placement="bottom-start" :fallbackPlacements="['top-start', 'bottom-end', 'top-end']" :width="760" :showArrow="false" :popperOptions="{ modifiers: [{ name: 'preventOverflow', options: { padding: 12, altAxis: true, tether: false } }] }" popperClass="generationParameters" :popperStyle="{ maxHeight: 'calc(100dvh - 24px)', maxWidth: 'calc(100vw - 24px)', overflowY: 'auto', boxSizing: 'border-box', background: '#1e1e27f5', border: '1px solid #454151', borderRadius: '14px', padding: '20px', boxShadow: '0 14px 48px #0006', backdropFilter: 'blur(18px)' }">
    <template #reference>
      <span class="parameterTrigger">
        <el-button class="modelParametersButton" plain :disabled="disabled || generationBusy" aria-label="模型 · 参数" :aria-expanded="parametersVisible" :title="parameterSummary">
          <icon-adjustments-horizontal :size="17" /><span class="parameterButtonText"><strong>模型 · 参数</strong><small>{{ parameterSummary }}</small></span><icon-chevron-down :size="14" :class="{ opened: parametersVisible }" />
        </el-button>
      </span>
    </template>
    <el-form class="parameterForm" labelPosition="top" :disabled="disabled || generationBusy" @keydown.esc.stop="parametersVisible = false">
      <div class="parameterHeader"><span>模型与生成参数</span><small>{{ kindLabels[kind] }}生成</small></div>
      <el-form-item v-if="workspace.creationMode === 'professional' && !fixedKind" label="参数类型"><el-select :teleported="false" v-model="parameterKind" aria-label="参数类型"><el-option v-for="(label, value) in kindLabels" :key="value" :label="label" :value="value" /></el-select></el-form-item>
      <div class="parameterGrid" :class="{ textParameters: kind === 'audio' || kind === 'text' }">
        <el-form-item label="模型"><el-select :teleported="false" v-model="selectedModelId" placeholder="选择已接入模型" :noDataText="`未接入${kindLabels[kind]}模型，请在 API 配置中添加对应类型`" aria-label="生成模型"><el-option v-for="model in models" :key="model.id" :label="model.label" :value="model.id" /></el-select></el-form-item>
        <template v-if="kind === 'image' || kind === 'video'">
          <el-form-item label="比例"><el-select :teleported="false" v-model="browserConfig.ratio" :disabled="!selectedModelId" aria-label="生成比例"><el-option v-for="item in ratios" :key="item" :label="item" :value="item" /></el-select></el-form-item>
          <el-form-item label="时长"><el-select :teleported="false" v-model="videoDuration" :disabled="kind !== 'video' || !selectedModelId || !videoDurations.length" :placeholder="kind === 'image' ? '不适用' : '选择时长'" aria-label="视频生成时长"><el-option v-for="item in videoDurations" :key="item" :label="`${item}s`" :value="item" /></el-select></el-form-item>
          <el-form-item label="清晰度"><el-select :teleported="false" v-model="resolution" :disabled="!selectedModelId" aria-label="生成清晰度"><el-option v-for="item in resolutions" :key="item" :label="item.toLowerCase()" :value="item" /></el-select></el-form-item>
          <el-form-item label="生成数量"><el-select :teleported="false" v-model="generationCount" :disabled="kind === 'video' || !selectedModelId" aria-label="生成数量"><el-option v-for="item in kind === 'image' ? 6 : 1" :key="item" :label="String(item)" :value="item" /></el-select></el-form-item>
        </template>
      </div>
      <div v-if="kind === 'image' || kind === 'video'" class="parameterDetails"><small>{{ kind === 'video' ? '当前视频接口每次生成 1 条视频' : `实际图片尺寸 ${browserConfig.imageSize.replace('*', ' × ')}` }}</small><label v-if="kind === 'video' && videoCapability?.audio === 'optional'">生成音频<el-switch v-model="browserConfig.generateAudio" aria-label="生成音频" /></label></div>
      <p v-else>当前适配器仅支持文字输入。</p>
    </el-form>
  </el-popover>
</template>

<script setup lang="ts">
import { IconAdjustmentsHorizontal, IconChevronDown } from "@tabler/icons-vue";
import { imageClaritySizes, imageDimensions } from "@toonflow/node-shared/generationDefaults";
import { useWorkspaceStore } from "@/stores/workspace";
import { browserWorkspaceMode } from "@/lib/browserWorkspaceFiles";
import { computed, ref, watch } from "vue";
import { browserConfig, browserModels, browserModelSelection, configuredBrowserModels, generationBusy, inferGenerationKind, type ModelKind } from "@/stores/browserGeneration";
const props = withDefaults(defineProps<{ belowInput?: boolean; prompt?: string; fixedKind?: ModelKind; disabled?: boolean }>(), { prompt: "" });
const parametersVisible = ref(false);
const workspace = useWorkspaceStore();
const parameterKind = ref<ModelKind>("text");
const kindLabels = { text: "文字", image: "图片", video: "视频", audio: "音频" };
const kind = computed(() => props.fixedKind ?? (generationBusy.value ? browserConfig.kind : workspace.creationMode === "professional" ? parameterKind.value : inferGenerationKind(props.prompt)));
const models = computed(() => configuredBrowserModels(kind.value));
const selectedModelId = computed({ get: () => models.value.find(model => model.id === browserModelSelection[kind.value])?.id ?? models.value[0]?.id ?? "", set: value => { browserModelSelection[kind.value] = value; } });
const selectedModel = computed(() => models.value.find(model => model.id === selectedModelId.value));
// ACT: 已接入的自定义模型沿用对应供应商适配器协议；不根据显示名称猜测新能力。
const videoCapability = computed(() => kind.value === "video" ? browserModels.video.models.find(model => model.id === selectedModel.value?.modelId) ?? browserModels.video.models[0] : undefined);
const videoDuration = computed({ get: () => kind.value === "video" ? Number(browserConfig.duration) || 5 : undefined, set: value => { if (value !== undefined && kind.value === "video") browserConfig.duration = String(value); } });
const videoDurations = computed(() => [...new Set(videoCapability.value?.durationResolutionMap.flatMap(item => item.duration) ?? [])].sort((a, b) => a - b));
const ratios = computed(() => Object.keys(imageDimensions));
const resolutions = computed(() => kind.value === "image" ? Object.keys(imageClaritySizes) : [...new Set(videoCapability.value?.durationResolutionMap.filter(item => item.duration.includes(videoDuration.value!)).flatMap(item => item.resolution) ?? [])]);
const resolution = computed({ get: () => kind.value === "image" ? browserConfig.imageResolution : browserConfig.resolution, set: value => { if (kind.value === "image") { browserConfig.imageResolution = value; browserConfig.imageSize = imageClaritySizes[value]?.[browserConfig.ratio] ?? browserConfig.imageSize; } else browserConfig.resolution = value; } });
const generationCount = computed({ get: () => kind.value === "video" ? 1 : browserConfig.count, set: value => { if (kind.value === "image") browserConfig.count = value; } });
const parameterSummary = computed(() => [selectedModel.value?.label ?? "未接入模型", ...(["image", "video"].includes(kind.value) ? [browserConfig.ratio, ...(kind.value === "video" ? [`${videoDuration.value}s`] : []), resolution.value.toLowerCase(), `${generationCount.value}${kind.value === "video" ? '条' : '张'}`] : [])].join(" · "));
watch([kind, selectedModelId, videoDurations], () => {
  if (kind.value !== "video" || !selectedModelId.value) return;
  if (videoDurations.value.length && !videoDurations.value.includes(videoDuration.value!)) browserConfig.duration = String(videoDurations.value[0]);
  if (!ratios.value.includes(browserConfig.ratio)) browserConfig.ratio = "9:16";
}, { immediate: true });
watch(resolutions, values => { if (selectedModelId.value && values.length && !values.includes(resolution.value)) resolution.value = values[0]!; }, { immediate: true });
watch(() => browserConfig.ratio, () => { browserConfig.imageSize = imageClaritySizes[browserConfig.imageResolution]?.[browserConfig.ratio] ?? browserConfig.imageSize; });
watch(() => props.disabled || generationBusy.value, value => { if (value) parametersVisible.value = false; });
</script>

<style scoped lang="scss">
.parameterTrigger { display: inline-flex; flex: none;
  .modelParametersButton { height: 48px; max-width: 260px; margin: 0; padding: 7px 12px; border: 1px solid #45414e; border-radius: 12px; background: #292730; color: #e8e5f0; transition: border-color 180ms, background 180ms; :deep(> span) { gap: 8px; min-width: 0; } &:hover:enabled, &[aria-expanded="true"] { border-color: #8b70dd; background: #332c43; } &:focus-visible { outline: 2px solid #a28ae9; outline-offset: 2px; } .parameterButtonText { display: grid; text-align: left; gap: 4px; min-width: 0; strong { font-size: 12px; font-weight: 500; } small { max-width: 190px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; color: #aaa4b8; font-size: 10px; } } .opened { transform: rotate(180deg); } }
}
.parameterForm {
  .parameterHeader { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 18px; color: #eeebf5; font-size: 13px; small { color: #aaa4b8; font-size: 11px; } }
  .parameterGrid { display: grid; grid-template-columns: minmax(180px, 1.6fr) repeat(4, minmax(90px, 1fr)); gap: 12px; &.textParameters { grid-template-columns: 1fr; } .el-form-item { min-width: 0; margin: 0; :deep(.el-form-item__label) { color: #c9c4d5; font-size: 12px; } :deep(.el-select__wrapper) { min-height: 36px; border-radius: 9px; background: #26252e; box-shadow: inset 0 0 0 1px #45414e; } :deep(.el-select__selected-item) { color: #e4dfed; font-size: 12px; } } }
  .parameterDetails { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; margin-top: 16px; color: #aaa4b8; font-size: 11px; label { display: flex; align-items: center; gap: 10px; } }
  @media (max-width: 720px) { .parameterGrid { grid-template-columns: repeat(2, minmax(0, 1fr)); .el-form-item:first-child { grid-column: 1 / -1; } } }
}
</style>

<style lang="scss">
.generationParameters { --el-transition-duration: 180ms; --el-transition-duration-fast: 180ms; }
@media (prefers-reduced-motion: reduce) { .generationParameters { transition: none !important; } }
</style>
