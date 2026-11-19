<template>
  <template v-if="browserConfig.enabled || studioCreationMode">
    <el-select v-if="workspace.creationMode === 'professional' && !fixedKind" class="parameterKindSelect" v-model="parameterKind" :disabled="disabled || generationBusy" aria-label="参数类型"><el-option v-for="(label, value) in kindLabels" :key="value" :label="label" :value="value" /></el-select>
    <el-select class="inlineModelSelect" popperClass="generationModelMenu" v-model="selectedModelId" :disabled="disabled || generationBusy" placeholder="选择已接入模型" :noDataText="`暂无可用${kindLabels[kind]}模型，请联系平台管理员`" aria-label="生成模型" :title="selectedModel?.label"><el-option v-for="model in models" :key="model.id" :label="model.label" :value="model.id" /></el-select>
    <slot name="afterModel" />
    <template v-if="kind === 'image' || kind === 'video'">
      <el-popover v-model:visible="parametersVisible" trigger="click" placement="bottom-start" :fallbackPlacements="['top-start', 'bottom-end', 'top-end']" :width="360" :showArrow="false" :hideAfter="0" :disabled="controlsDisabled" :popperOptions="popoverOptions" popperClass="generationParameters" :popperStyle="popoverStyle">
        <template #reference><button class="inlineParameter formatParameter" type="button" :disabled="controlsDisabled" :aria-expanded="parametersVisible" aria-label="比例与清晰度"><span class="formatIcon" :style="ratioStyle(browserConfig.ratio)" aria-hidden="true" /><span>{{ browserConfig.ratio }}<span class="parameterDot"> · </span>{{ resolution }}</span></button></template>
        <el-form class="parameterForm" labelPosition="top" :disabled="controlsDisabled" @keydown.esc.stop="parametersVisible = false">
          <div class="parameterStack">
            <el-form-item label="清晰度"><div class="segmentedOptions" role="group" aria-label="生成清晰度"><button v-for="item in resolutions" :key="item" type="button" :disabled="controlsDisabled" :aria-pressed="resolution === item" @click="resolution = item">{{ item.toLowerCase() }}</button></div></el-form-item>
            <el-form-item label="比例"><div class="segmentedOptions ratioSegments" role="group" aria-label="生成比例"><button v-for="item in ratios" :key="item" type="button" :disabled="controlsDisabled" :aria-pressed="browserConfig.ratio === item" @click="browserConfig.ratio = item"><span class="ratioIcon" :style="ratioStyle(item)" aria-hidden="true" /><span>{{ item }}</span></button></div></el-form-item>
          </div>
          <div class="parameterDetails"><small v-if="kind === 'image'">实际图片尺寸 {{ browserConfig.imageSize.replace('*', ' × ') }}</small><label v-if="kind === 'video' && videoCapability?.audio === 'optional'">生成音频<el-switch v-model="browserConfig.generateAudio" aria-label="生成音频" /></label></div>
        </el-form>
      </el-popover>
      <el-popover v-if="!hideCount && !(workspace.creationMode === 'simple' && kind === 'video')" v-model:visible="countVisible" trigger="click" placement="top" :width="220" :showArrow="false" :disabled="controlsDisabled || kind === 'video'" :popperStyle="popoverStyle" popperClass="generationParameters">
        <template #reference><button class="inlineParameter" type="button" :disabled="controlsDisabled || kind === 'video'" :title="kind === 'video' ? '每次默认生成一条视频' : '生成数量'" :aria-expanded="countVisible" aria-label="生成数量"><icon-layers-subtract :size="19" /><span>{{ generationCount }} {{ kind === 'video' ? '条' : '张' }}</span></button></template>
        <div class="parameterForm"><div class="parameterHeader">生成数量</div><div class="parameterStack"><div class="segmentedOptions" role="group" aria-label="图片生成数量"><button v-for="item in 6" :key="item" type="button" :disabled="controlsDisabled" :aria-pressed="generationCount === item" @click="generationCount = item">{{ item }}</button></div></div></div>
      </el-popover>
      <el-popover v-if="kind === 'video'" v-model:visible="durationVisible" trigger="click" placement="top" :width="360" :showArrow="false" :disabled="controlsDisabled" :popperStyle="popoverStyle" popperClass="generationParameters">
        <template #reference><button class="inlineParameter" type="button" :disabled="controlsDisabled" :aria-expanded="durationVisible" aria-label="生成时长"><icon-clock :size="19" /><span>{{ videoDuration }}s</span></button></template>
        <div class="parameterForm"><div class="parameterHeader">生成时长</div><div class="parameterStack"><div class="durationControls">
          <el-slider v-model="durationPosition" :min="0" :max="Math.max(1, videoDurations.length - 1)" :step="1" :marks="durationMarks" :formatValueText="value => `${videoDurations[value] ?? 0} 秒`" :showTooltip="false" :disabled="controlsDisabled || videoDurations.length < 2" aria-label="视频生成时长" />
          <el-input-number v-model="durationValue" :min="videoDurations[0] ?? 1" :max="videoDurations.at(-1) ?? 1" :precision="0" controlsPosition="right" :disabled="controlsDisabled || !videoDurations.length" aria-label="视频时长秒数" :title="`支持时长：${videoDurations.join('、')} 秒`"><template #suffix>s</template></el-input-number>
        </div></div></div>
      </el-popover>
    </template>
  </template>
</template>

<script setup lang="ts">
import { ElSlider, ElInputNumber } from "element-plus";
import { IconClock, IconLayersSubtract } from "@tabler/icons-vue";
import { imageClaritySizes, imageDimensions } from "@toonflow/node-shared/generationDefaults";
import { useWorkspaceStore } from "@/stores/workspace";
import { studioCreationMode } from "@/lib/browserWorkspaceFiles";
import { computed, inject, ref, watch } from "vue";
import { browserConfig as defaultBrowserConfig, browserModels, browserModelSelection as defaultBrowserModelSelection, configuredBrowserModels, generationBusy, inferGenerationKind, type ModelKind } from "@/stores/browserGeneration";
const browserConfig = inject("generationConfig", defaultBrowserConfig);
const browserModelSelection = inject("generationModelSelection", defaultBrowserModelSelection);
const props = withDefaults(defineProps<{ belowInput?: boolean; prompt?: string; hideCount?: boolean; fixedKind?: ModelKind; disabled?: boolean }>(), { prompt: "" });
const parametersVisible = ref(false), durationVisible = ref(false);
const popoverOptions = { modifiers: [{ name: "preventOverflow", options: { padding: 12, altAxis: true, tether: false } }] };
const countVisible = ref(false);
const popoverStyle = { maxHeight: "calc(100dvh - 24px)", maxWidth: "calc(100vw - 24px)", overflowY: "auto" as const, boxSizing: "border-box" as const, background: "#1e1e27f5", border: "1px solid #454151", borderRadius: "14px", padding: "18px", boxShadow: "0 14px 48px #0006" };
const workspace = useWorkspaceStore();
const parameterKind = ref<ModelKind>("text");
const kindLabels = { text: "文字", image: "图片", video: "视频", audio: "音频" };
const kind = computed(() => props.fixedKind ?? (generationBusy.value ? browserConfig.kind : browserConfig !== defaultBrowserConfig ? browserConfig.outputKind : workspace.creationMode === "professional" ? parameterKind.value : inferGenerationKind(props.prompt)));
const models = computed(() => configuredBrowserModels(kind.value, browserConfig));
const selectedModelId = computed({ get: () => models.value.find(model => model.id === browserModelSelection[kind.value])?.id ?? models.value[0]?.id ?? "", set: value => { browserModelSelection[kind.value] = value; } });
const selectedModel = computed(() => models.value.find(model => model.id === selectedModelId.value));
// ACT: 已接入的自定义模型沿用对应供应商适配器协议；不根据显示名称猜测新能力。
const videoCapability = computed(() => kind.value === "video" ? browserModels.video.models.find(model => model.id === selectedModel.value?.modelId) ?? browserModels.video.models[0] : undefined);
const videoDuration = computed({ get: () => kind.value === "video" ? Number(browserConfig.duration) || 5 : undefined, set: value => { if (value !== undefined && kind.value === "video") browserConfig.duration = String(value); } });
const videoDurations = computed(() => [...new Set(videoCapability.value?.durationResolutionMap.flatMap(item => item.duration) ?? [])].sort((a, b) => a - b));
const controlsDisabled = computed(() => props.disabled || generationBusy.value || !selectedModelId.value);
const durationPosition = computed({
  get: () => Math.max(0, videoDurations.value.indexOf(videoDuration.value!)),
  set: value => { const duration = videoDurations.value[value]; if (duration !== undefined) videoDuration.value = duration; },
});
const durationMarks = computed(() => Object.fromEntries(videoDurations.value.map((value, index) => [index, String(value)])));
const durationValue = computed({
  get: () => videoDuration.value ?? 5,
  set: (value: number | undefined) => {
    if (value === undefined || !videoDurations.value.length) return;
    // ACT: 加减跨过不支持的秒数到相邻档位；其他输入吸附最近档位，不扩展模型能力。
    const current = videoDuration.value ?? 5;
    const adjacent = value === current + 1 ? videoDurations.value.find(duration => duration > current)
      : value === current - 1 ? [...videoDurations.value].reverse().find(duration => duration < current) : undefined;
    videoDuration.value = adjacent ?? videoDurations.value.reduce((nearest, duration) => Math.abs(duration - value) < Math.abs(nearest - value) ? duration : nearest);
  },
});
function ratioStyle(value: string) {
  const [width = 1, height = 1] = value.split(":").map(Number);
  return { width: `${20 * Math.min(width / height, 1)}px`, height: `${20 * Math.min(height / width, 1)}px` };
}
const ratios = computed(() => Object.keys(imageDimensions));
const resolutions = computed(() => kind.value === "image" ? Object.keys(imageClaritySizes) : [...new Set(videoCapability.value?.durationResolutionMap.filter(item => item.duration.includes(videoDuration.value!)).flatMap(item => item.resolution) ?? [])]);
const resolution = computed({ get: () => kind.value === "image" ? browserConfig.imageResolution : browserConfig.resolution, set: value => { if (kind.value === "image") { browserConfig.imageResolution = value; browserConfig.imageSize = imageClaritySizes[value]?.[browserConfig.ratio] ?? browserConfig.imageSize; } else browserConfig.resolution = value; } });
const generationCount = computed({ get: () => kind.value === "video" ? 1 : browserConfig.count, set: value => { if (kind.value === "image") browserConfig.count = value; } });
watch([kind, selectedModelId, videoDurations], () => {
  if (kind.value !== "video" || !selectedModelId.value) return;
  if (videoDurations.value.length && !videoDurations.value.includes(videoDuration.value!)) browserConfig.duration = String(videoDurations.value[0]);
  if (!ratios.value.includes(browserConfig.ratio)) browserConfig.ratio = "9:16";
}, { immediate: true });
watch(resolutions, values => { if (selectedModelId.value && values.length && !values.includes(resolution.value)) resolution.value = values[0]!; }, { immediate: true });
watch(() => browserConfig.ratio, () => { browserConfig.imageSize = imageClaritySizes[browserConfig.imageResolution]?.[browserConfig.ratio] ?? browserConfig.imageSize; });
watch(() => props.disabled || generationBusy.value, value => { if (value) { parametersVisible.value = false; durationVisible.value = false; } });
watch(kind, () => { parametersVisible.value = false; durationVisible.value = false; });
</script>

<style scoped lang="scss">
.inlineModelSelect { flex: none; width: 160px; :deep(.el-select__wrapper) { min-height: 32px; border-radius: 12px; background: #24232c; box-shadow: none; &:hover, &.is-focused { background: #303030; } } :deep(.el-select__selected-item) { color: #f2f2f2; font: 400 13px/1 Arial, sans-serif; } }
.parameterKindSelect { flex: none; width: 110px; }
.inlineParameter { display: inline-flex; flex: none; align-items: center; justify-content: center; gap: 8px; height: 40px; padding: 0 10px; border: 1px solid transparent; border-radius: 10px; background: transparent; color: #f2f2f2; font: 400 13px/1 Arial, sans-serif; white-space: nowrap; cursor: pointer; transition: background 180ms, color 180ms;
  .parameterDot { color: inherit; }
  .formatIcon { display: inline-block; box-sizing: border-box; flex: none; border: 2px solid currentColor; border-radius: 3px; }
  &:hover, &[aria-expanded="true"] { background: #303030; color: #f2f2f2; }
  &:focus-visible { outline: 2px solid #a28ae9; outline-offset: -2px; }
  &:disabled { cursor: not-allowed; color: #f2f2f2; }
}
.parameterForm {
  .parameterHeader { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 18px; color: #eeebf5; font-size: 13px; small { color: #aaa4b8; font-size: 11px; } }
  .parameterStack { display: flex; flex-direction: column; gap: 20px;
    .el-form-item { min-width: 0; margin: 0; :deep(.el-form-item__label) { margin-bottom: 10px; color: #bdb8ca; font-size: 13px; } :deep(.el-form-item__content) { width: 100%; } :deep(.el-select) { width: 100%; } :deep(.el-select__wrapper) { min-height: 38px; border-radius: 10px; background: #292831; box-shadow: none; } :deep(.el-select__selected-item) { color: #e4dfed; font-size: 12px; } }
    .segmentedOptions { display: flex; width: 100%; padding: 3px; gap: 3px; border-radius: 11px; background: #28272f;
      button { display: flex; flex: 1; min-width: 0; align-items: center; justify-content: center; gap: 7px; height: 38px; padding: 5px; border: 1px solid transparent; border-radius: 9px; background: var(--agent-input-bg, #1b1b1b); color: #aaa6b5; font: inherit; font-size: 13px; cursor: pointer; transition: background 180ms, color 180ms, border-color 180ms; &[aria-pressed="true"] { background: #303030; border-color: transparent; color: #f2edf9; } &:hover:enabled { background: #303030; color: #e8def7; } &:focus-visible { outline: 2px solid #a28ae9; outline-offset: -2px; } &:disabled { cursor: not-allowed; opacity: .55; } }
    }
    .ratioSegments button { flex-direction: column; height: 62px; gap: 8px; font-size: 12px; .ratioIcon { display: block; box-sizing: border-box; border: 2px solid currentColor; border-radius: 3px; flex: none; } }
    .durationControls { display: flex; align-items: flex-start; gap: 20px; width: 100%; padding-bottom: 12px;
      .el-slider { flex: 1; min-width: 0; margin: 0 6px; --el-slider-main-bg-color: #a48cdb; --el-slider-runway-bg-color: #37343e; --el-slider-button-size: 14px; --el-slider-height: 7px; :deep(.el-slider__marks-text) { font-size: 10px; color: #96909f; margin-top: 10px; } }
      .el-input-number { width: 90px; flex: none; --el-input-bg-color: #292831; :deep(.el-input__wrapper) { border-radius: 10px; } }
    }
  }
  .parameterDetails { display: flex; flex-direction: column; align-items: stretch; gap: 14px; margin-top: 18px; color: #aaa4b8; font-size: 11px; label { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding-top: 12px; border-top: 1px solid #ffffff0d; color: #bdb8ca; font-size: 12px; } }

}
</style>

<style lang="scss">
.generationParameters { --el-transition-duration: 180ms; --el-transition-duration-fast: 180ms; }
@media (prefers-reduced-motion: reduce) { .generationParameters { transition: none !important; } }
</style>

<style lang="scss">
.generationModelMenu .el-select-dropdown__item { background: var(--agent-input-bg, #1b1b1b); &.is-selected, &.is-hovering { background: #303030; color: #f2f2f2; } }
</style>
