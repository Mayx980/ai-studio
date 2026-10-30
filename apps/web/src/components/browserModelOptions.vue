<template>
  <el-popover ref="parameterPopover" v-if="browserConfig.enabled || browserWorkspaceMode" trigger="click" :visible="parametersVisible" :triggerKeys="[]" :hideAfter="0" @update:visible="openParameters" placement="top" :width="300" :popperOptions="{ modifiers: [{ name: 'preventOverflow', options: { padding: 12, altAxis: true, tether: false } }, { name: 'flip', options: { padding: 12, fallbackPlacements: ['top', 'bottom', 'right', 'left'] } }] }" :popperStyle="{ maxHeight: 'calc(100dvh - 24px)', maxWidth: 'calc(100vw - 24px)', overflowY: 'auto', boxSizing: 'border-box' }">
    <template #reference><span ref="parameterTrigger"><el-button text aria-label="模型与生成参数" :aria-expanded="parametersVisible" @click="parametersVisible = true">{{ models.find(model => model.id === browserModelSelection[kind])?.label || models[0]?.label || '未接入模型' }} · 参数</el-button></span></template>
    <el-form v-click-outside:[parameterExcludes]="closeParameters" labelPosition="top">
      <el-form-item v-if="workspace.creationMode === 'professional'" label="参数类型"><el-select :teleported="false" v-model="parameterKind" aria-label="参数类型"><el-option v-for="(label, value) in kindLabels" :key="value" :label="label" :value="value" /></el-select></el-form-item>
      <el-form-item :label="`${kindLabels[kind]}模型`"><el-select :teleported="false" v-model="selectedModelId" placeholder="选择已接入模型" :noDataText="`未接入${kindLabels[kind]}模型，请在 API 配置中添加对应类型`"><el-option v-for="model in models" :key="model.id" :label="model.label" :value="model.id" /></el-select></el-form-item>
      <template v-if="kind === 'image' || kind === 'video'">
        <el-form-item label="比例"><el-radio-group v-model="browserConfig.ratio" size="small" aria-label="生成比例"><el-radio-button v-for="item in ratios" :key="item" :value="item">{{ item }}</el-radio-button></el-radio-group></el-form-item>
        <el-form-item v-if="kind === 'image'" label="图片清晰度"><el-select :teleported="false" v-model="imageResolution" aria-label="图片清晰度"><el-option v-for="item in ['480P','720P','1080P']" :key="item" :label="item.toLowerCase()" :value="item" /></el-select><small>{{ browserConfig.imageSize.replace('*', ' × ') }}</small></el-form-item>
        <el-form-item v-if="kind === 'image'" label="生成数量"><el-radio-group v-model="browserConfig.count" size="small" aria-label="生成数量"><el-radio-button v-for="item in 6" :key="item" :value="item">{{ item }}</el-radio-button></el-radio-group></el-form-item>
        <el-form-item v-if="kind === 'video'" label="清晰度"><el-radio-group v-model="browserConfig.resolution" size="small" aria-label="视频清晰度"><el-radio-button v-for="item in ['480P', '720P', '1080P']" :key="item" :value="item">{{ item }}</el-radio-button></el-radio-group></el-form-item>
        <el-form-item v-if="kind === 'video'" :label="`生成时长 · ${videoDuration} 秒`"><el-slider v-model="videoDuration" :min="3" :max="30" :step="1" :marks="{3:'3',5:'5',10:'10',15:'15',20:'20',25:'25',30:'30'}" aria-label="视频生成时长" /></el-form-item>
      </template>
      <p>模型按当前生成类型显示，文字模型供助手和脚本使用，不能用于图片或视频生成。</p>
      <p>图片默认 9:16、720p、1 张；视频默认 480p。</p>
      <p v-if="kind === 'video'">图片默认作为参考；首帧请在输入中指定“图1作为首帧”。当前模型不支持尾帧。</p>
      <p v-if="kind === 'audio' || kind === 'text'">当前适配器仅支持文字输入。</p>
    </el-form>
  </el-popover>
</template>

<script setup lang="ts">
import { ElSlider, ClickOutside as vClickOutside, type PopoverInstance } from "element-plus";
import { imageClaritySizes, imageDimensions } from "@toonflow/node-shared/generationDefaults";
import { useWorkspaceStore } from "@/stores/workspace";
import { browserWorkspaceMode } from "@/lib/browserWorkspaceFiles";
import { computed, ref, watch } from "vue";
import { browserConfig, browserModelSelection, configuredBrowserModels, generationBusy, inferGenerationKind, type ModelKind } from "@/stores/browserGeneration";
const parametersVisible = ref(false);
const parameterTrigger = ref<HTMLElement>();
const parameterPopover = ref<PopoverInstance>();
const parameterExcludes = computed(() => [parameterTrigger.value, parameterPopover.value?.popperRef?.contentRef]);
// ACT: 忽略组件的失焦和键盘隐藏请求，只在面板外点击时关闭。
function openParameters(visible: boolean) { if (visible) parametersVisible.value = true; }
function closeParameters() { parametersVisible.value = false; }
const props = withDefaults(defineProps<{ prompt?: string }>(), { prompt: "" });
const workspace = useWorkspaceStore();
const parameterKind = ref<ModelKind>("text");
const kindLabels = { text: "文字", image: "图片", video: "视频", audio: "音频" };
const kind = computed(() => generationBusy.value ? browserConfig.kind : workspace.creationMode === "professional" ? parameterKind.value : inferGenerationKind(props.prompt));
const models = computed(() => configuredBrowserModels(kind.value));
const selectedModelId = computed({ get: () => models.value.find(model => model.id === browserModelSelection[kind.value])?.id ?? models.value[0]?.id ?? "", set: value => { browserModelSelection[kind.value] = value; } });
const videoDuration = computed({ get: () => Number(browserConfig.duration) || 5, set: value => { browserConfig.duration = String(value); } });
const ratios = computed(() => Object.keys(imageDimensions));
const imageResolution = computed({ get: () => browserConfig.imageResolution, set: value => { browserConfig.imageResolution = value; browserConfig.imageSize = imageClaritySizes[value]?.[browserConfig.ratio] ?? browserConfig.imageSize; } });

watch([kind, () => browserConfig.ratio], () => { if (kind.value === "video" && !ratios.value.includes(browserConfig.ratio)) browserConfig.ratio = "9:16"; }, { immediate: true });
watch(() => browserConfig.ratio, () => { browserConfig.imageSize = imageClaritySizes[browserConfig.imageResolution]?.[browserConfig.ratio] ?? browserConfig.imageSize; });
</script>
