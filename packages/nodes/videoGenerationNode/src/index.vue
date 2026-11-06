<template>
  <nodeSkeleton
    v-bind="nodeProps"
    v-model:bottomVisible="node.selected"
    :topVisible="node.selected"
    topWidth="max-content"
    :downloadUrl="previewUrl"
    :downloadName="outputFile?.url.split(/[\\/]/).at(-1)"
    @fullscreen="player?.enterFullscreen()"
    :bottomWidth="'min(960px, calc(100vw - 48px))'"
    :style="{ width: previewUrl && videoWidth ? `${videoWidth + 18}px` : undefined }">
    <template #topActions>
      <el-button :icon="IconMusic" text :disabled="!outputFile || generating || deleting || uploading || actions?.processing" @click.stop="actions?.open('extractAudio')">提取音轨</el-button>
      <el-button :icon="IconLayersSubtract" text :disabled="!outputFile || generating || deleting || uploading || actions?.processing" @click.stop="actions?.open('separate')">分离音视频</el-button>
      <el-button :icon="IconScissors" text :disabled="!outputFile || generating || deleting || uploading || actions?.processing" @click.stop="actions?.open('trim')">截取片段</el-button>
      <mediaHistory mediaType="video" :current="outputFile" :disabled="generating || deleting || uploading" @select="outputs.video = { dataType: 'VIDEO', value: $event }" />
      <el-button :icon="IconTransfer" :loading="uploading" :disabled="generating || deleting" text title="替换视频" aria-label="替换视频" @click.stop="fileInput?.click()">替换视频</el-button>
    </template>
    <template #topRightActions>
      <el-dropdown trigger="click" placement="bottom-end" :disabled="!player?.ready || player?.capturing || generating || deleting || uploading" @command="player?.captureFrame($event)">
        <el-button :icon="IconPhotoScan" :loading="player?.capturing" :disabled="!player?.ready || player?.capturing || generating || deleting || uploading" text title="截取视频帧" aria-label="截取视频帧" />
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item command="current" :icon="IconPhotoScan">截取当前帧</el-dropdown-item>
            <el-dropdown-item command="first" :icon="IconPlayerSkipBack">截取首帧</el-dropdown-item>
            <el-dropdown-item command="last" :icon="IconPlayerSkipForward">截取尾帧</el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
    </template>
    <input ref="fileInput" type="file" accept="video/*" hidden aria-label="选择替换视频" :disabled="generating || deleting || uploading" @change="replaceOutput" />
    <div v-loading="generating || uploading" class="videoContent nopan" :aria-busy="generating || uploading">
      <videoPlayer
        v-if="previewUrl"
        ref="player"
        :src="previewUrl"
        label="生成视频"
        @loadedmetadata="resizeVideo" />
      <el-button v-else class="videoEmpty" text aria-label="上传视频" @click.stop="fileInput?.click()">上传视频</el-button>
    </div>
    <template #bottom>
      <section class="promptCard" aria-label="视频创作面板" :aria-busy="generating || pickingReferences || uploading">
        <div class="composerBody">
          <aside class="materialTray" aria-label="参考素材">
            <div class="trayHeading"><icon-photo :size="14" /><span>参考素材</span><span v-if="refList.length" class="materialCount">{{ refList.length }}</span></div>
            <referenceItem v-if="refList.length" v-model="refList" @preview="setReferencePreview" @remove="!composerLocked && removeReference($event)" />
            <button v-if="pickReferences" class="addMaterial" type="button" :disabled="composerLocked" aria-label="添加参考素材" @click="addReferences">
              <icon-loader-2 v-if="pickingReferences" class="spinning" :size="22" /><icon-plus v-else :size="22" />
              <span>{{ pickingReferences ? '正在添加…' : '添加素材' }}</span>
              <small>{{ videoReferenceSupported ? '图片 / 视频' : '参考图片' }}</small>
            </button>
          </aside>
          <div class="descriptionArea">
            <div class="descriptionHeading"><span>视频描述</span><el-button class="clearPrompt" text :disabled="composerLocked || !data.prompt.trim()" aria-label="清空视频描述" title="清空视频描述" @click="clearPrompt"><icon-x :size="15" /></el-button></div>
            <promptInput :disabled="composerLocked" optimizeKind="video" :actionsTarget="promptActions" v-model="data.promptModel" v-model:text="data.prompt" :references="referenceMentions" placeholder="描述你想生成的视频画面，也可以上传并@参考图片，指定主体、场景、动作和视觉风格……" expandable />
            <div class="descriptionBottom"><span class="descriptionHint">{{ refList.length ? '输入 @ 引用素材 · 拖动缩略图调整顺序' : '从主体、场景和镜头运动开始描述' }}</span><span class="characterCount">{{ data.prompt.length }} 字</span></div>
          </div>
        </div>
        <div v-if="frameMode" class="referenceHint">{{ selectedMode === 'startFrameOptional' ? '仅一张图片时作为尾帧；两张图片按顺序作为首帧、尾帧' : '图片引用按顺序作为首帧、尾帧' }}</div>
        <div class="promptFooter">
          <div class="parameterControls">
            <span class="generationType"><icon-movie :size="17" />{{ selectedMode === 'text' ? '文生视频' : frameMode ? '图生视频' : '视频生成' }}</span>
            <el-select v-model="data.model" class="modelSelect" filterable :loading="modelsLoading" :disabled="composerLocked" placeholder="选择视频模型" aria-label="生成模型" noDataText="请先在设置中添加视频模型" placement="top-start" @visible-change="(visible) => visible && loadModels().catch((error) => showNodeError(error, '模型读取失败'))">
              <template #prefix><icon-sparkles :size="17" /></template>
              <el-option v-if="data.model && !selectedModel" :value="data.model" :label="data.modelLabel || '未接入模型'" disabled />
              <el-option-group v-for="provider in modelGroups" :key="provider.id" :label="provider.label"><el-option v-for="item in provider.models" :key="item.modelId" :label="item.label" :value="JSON.stringify([item.providerId, item.modelId])" /></el-option-group>
            </el-select>
            <el-select v-if="selectedModel?.mode?.length" v-model="data.mode" class="modeSelect" :disabled="composerLocked" aria-label="视频参考模式" placement="top-start">
              <template #prefix><icon-photo :size="16" /></template>
              <el-option v-for="mode in selectedModel.mode" :key="JSON.stringify(mode)" :value="JSON.stringify(mode)" :label="modeLabel(mode)" :disabled="!matchingModes.some(item => JSON.stringify(item) === JSON.stringify(mode))" />
            </el-select>
            <generationSettings v-model:duration="data.duration" v-model:resolution="data.resolution" v-model:ratio="data.ratio" v-model:generateAudio="data.generateAudio" :ratios="ratioOptions" :model="selectedModel" :disabled="composerLocked || !selectedModel" />
          </div>
          <div class="generationActions">
            <el-tooltip content="清空描述并恢复参数，保留素材与已有结果" placement="top"><el-button class="resetButton" text :disabled="composerLocked" aria-label="重置视频输入" @click="resetComposer"><icon-refresh :size="19" /></el-button></el-tooltip>
            <el-button class="sendButton" :disabled="deleting || uploading || pickingReferences || (!generating && !canGenerate)" :aria-label="generating ? '停止生成视频' : '生成视频'" @click="generating ? generationState.cancel() : submitGeneration()"><icon-loader-2 v-if="generating" class="spinning" :size="18" /><icon-sparkles v-else :size="18" />{{ generating ? '停止生成' : '生成视频' }}</el-button>
          </div>
        </div>
        <div class="composerUtility"><div ref="promptActions" class="promptActions" /><mediaPrice v-if="generationInput" :input="{ ...generationInput, mediaType: 'video' }" :supported="selectedModel?.supportsPrice === true" /></div>
        <div v-if="generating || pickingReferences || uploading" class="generationFeedback" role="status"><icon-loader-2 class="spinning" :size="15" /><span>{{ generating ? (generationState.background ? '视频正在生成，完成后将显示在上方。离开画布后任务仍会继续。' : '视频正在生成，完成后将显示在上方。') : pickingReferences ? '正在选择或保存参考素材…' : '正在保存上传的视频…' }}</span><div class="activityTrack" /></div>
        <div v-else-if="composerError" class="generationFeedback errorFeedback" role="alert"><icon-alert-circle :size="16" /><span>{{ composerError }}</span><el-button text :disabled="!canGenerate" @click="submitGeneration">重试</el-button></div>
        <div v-else-if="generationState.status.value === 'succeeded'" class="generationFeedback successFeedback" role="status"><icon-circle-check :size="16" /><span>视频已生成，可在上方预览和下载。</span></div>
        <p v-else-if="!selectedModel" class="configurationHint">请先在设置中配置视频模型，再选择模型开始创作。</p>
        <p v-else-if="selectedModel.mode?.length && !matchingModes.length" class="configurationHint">当前素材与模型的参考模式不匹配，请调整素材或更换模型。</p>
      </section>
    </template>
  </nodeSkeleton>
  <videoActions ref="actions" :file="outputFile" :src="previewUrl" :disabled="generating || deleting || uploading" />
</template>

<script setup lang="ts">
import { computed, inject, nextTick, onMounted, onScopeDispose, ref, watch } from "vue";
import { ElTooltip, ElButton, ElMessageBox, ElSelect, ElOption, ElOptionGroup, ElLoading, ElDropdown, ElDropdownMenu, ElDropdownItem } from "element-plus";
import { IconCameraAi, IconSparkles, IconPlus, IconRefresh, IconX, IconMovie, IconPhoto, IconLoader2, IconAlertCircle, IconCircleCheck, IconTransfer, IconMusic, IconLayersSubtract, IconScissors, IconPhotoScan, IconPlayerSkipBack, IconPlayerSkipForward } from "@tabler/icons-vue";
import { nodeSkeleton, nodeTools, useNode, z, type NodeMediaModel, type NodeVideoRequest, type NodeHandle } from "@toonflow/nodes-scaffold/runtime";
import { groupNodeModels } from "@toonflow/node-shared/groupNodeModels";
import { showNodeError } from "@toonflow/node-shared/showNodeError";
import { useNodeGeneration } from "@toonflow/node-shared/useNodeGeneration";
import { useNodeReferences } from "@toonflow/node-shared/useNodeReferences";
import promptInput from "@toonflow/node-shared/promptInput";
import videoPlayer from "@toonflow/node-video/videoPlayer";
import videoActions from "@toonflow/node-video/videoActions";
import referenceItem from "@toonflow/node-shared/referenceItem";
import mediaHistory from "@toonflow/node-shared/mediaHistory";
import mediaPrice from "@toonflow/node-shared/mediaPrice";
import generationSettings from "./components/generationSettings.vue";

defineOptions({
  inheritAttrs: false,
  icon: IconCameraAi,
  handles: [
    { id: "in", type: "target", dataType: ["IMAGE", "VIDEO", "AUDIO", "STRING"], label: "图片、视频、音频、文本输入" },
    { id: "video", type: "source", dataType: "VIDEO", label: "视频输出" },
  ] satisfies NodeHandle[],
});
const vLoading = ElLoading.directive;
const { id, node, nodeProps, nodeEvent, outputs, files, ai, updateNodeInternals } = useNode({
  label: "视频",
});
type PromptModel = NonNullable<InstanceType<typeof promptInput>["$props"]["modelValue"]>;
const data = computed(() => node.data as { prompt: string; promptModel: PromptModel; model: string; modelLabel?: string; duration?: number; resolution: string; ratio: string; mode: string; generateAudio: boolean });
data.value.prompt ??= "";
data.value.promptModel ??= [];
data.value.model ??= "";
data.value.duration ??= 5;
data.value.resolution ??= "480P";
data.value.mode ??= "";
data.value.generateAudio ??= true;
data.value.ratio ??= "9:16";
const { refList, referenceMentions, setReferencePreview, removeReference } = useNodeReferences();
const promptActions = ref<HTMLElement>();
const models = ref<NodeMediaModel[]>([]);
const modelsLoading = ref(false);
const uploading = ref(false);
const fileInput = ref<HTMLInputElement>();
let disposed = false;
const deleting = ref(false);
const player = ref<InstanceType<typeof videoPlayer>>();
const actions = ref<InstanceType<typeof videoActions>>();
const videoWidth = ref(0);
let generationController: AbortController | undefined;
const generationState = useNodeGeneration(outputs, () => generationController?.abort());
const { generating } = generationState;
const pickReferences = inject<((nodeId: string, scope?: string) => Promise<void>) | undefined>("pickNodeReferences", undefined);
const pickingReferences = ref(false);
const actionError = ref("");
const composerLocked = computed(() => generating.value || deleting.value || uploading.value || pickingReferences.value);
const composerError = computed(() => actionError.value || generationState.error.value);
const videoReferenceSupported = computed(() => selectedModel.value?.mode?.some(mode => Array.isArray(mode) && mode.some(item => item.startsWith("videoReference:") && Number(item.split(":")[1]) > 0)) ?? false);
const canGenerate = computed(() => !!generationPrompt.value && !!selectedModel.value && !refList.value.some(item => item.value === undefined) && (!selectedModel.value.mode?.length || matchingModes.value.length > 0));

function modeLabel(mode: NonNullable<NodeMediaModel["mode"]>[number]) {
  if (Array.isArray(mode)) return "多素材参考";
  return ({ text: "纯文本", singleImage: "单图参考", startEndRequired: "首尾帧", endFrameOptional: "首帧 / 首尾帧", startFrameOptional: "尾帧 / 首尾帧" } as Record<string, string>)[mode] ?? mode;
}
function clearPrompt() {
  if (composerLocked.value) return;
  data.value.prompt = "";
  data.value.promptModel = [[{ type: "Write", text: "" }]];
  actionError.value = "";
}
async function resetComposer() {
  if (composerLocked.value) return;
  if (data.value.prompt.trim()) {
    try { await ElMessageBox.confirm("将清空视频描述并恢复生成参数。参考素材、当前模型和已有视频结果会保留。", "重置视频输入", { confirmButtonText: "重置", cancelButtonText: "取消", type: "warning" }); }
    catch { return; }
  }
  if (composerLocked.value || disposed) return;
  clearPrompt();
  const choice = selectedModel.value;
  data.value.duration = choice ? getDurations(choice)[0] : 5;
  const resolutions = choice ? getResolutions(choice, data.value.duration) : [];
  data.value.resolution = resolutions.includes("480P") ? "480P" : resolutions[0] ?? "";
  data.value.ratio = "9:16";
  data.value.generateAudio = choice?.audio === true || choice?.audio === "optional";
  const mode = matchingModes.value.find(Array.isArray) ?? matchingModes.value[0];
  data.value.mode = mode === undefined ? "" : JSON.stringify(mode);
}
async function addReferences() {
  if (!pickReferences || composerLocked.value) return;
  pickingReferences.value = true;
  try { await pickReferences(id, "local"); }
  catch (error) { actionError.value = error instanceof Error ? error.message : "添加素材失败"; }
  finally { pickingReferences.value = false; }
}
async function submitGeneration() {
  actionError.value = "";
  try { await startGeneration(); }
  catch (error) { actionError.value = error instanceof Error ? error.message : "视频生成失败"; }
}
let generation: Promise<void> | undefined;
let modelsRequest: Promise<void> | undefined;
// ACT: 供应商未声明视频比例范围，沿用界面的通用比例，具体支持范围由供应商校验。
const ratioOptions = ["16:9", "9:16", "1:1", "4:3", "3:4"];
const selectedModel = computed(() => models.value.find((item) => JSON.stringify([item.providerId, item.modelId]) === data.value.model));
const selectedMode = computed(() => selectedModel.value?.mode?.find((item) => JSON.stringify(item) === data.value.mode) as NodeVideoRequest["mode"]);
const frameMode = computed(() => ["singleImage", "startEndRequired", "endFrameOptional", "startFrameOptional"].includes(String(selectedMode.value)));
const mediaCounts = computed(() => ({
  image: refList.value.filter((item) => item.dataType === "IMAGE").length,
  video: refList.value.filter((item) => item.dataType === "VIDEO").length,
  audio: refList.value.filter((item) => item.dataType === "AUDIO").length,
}));
const matchingModes = computed(() => getMatchingModes(selectedModel.value));

function getMatchingModes(choice?: NodeMediaModel) {
  return (choice?.mode ?? []).filter((mode) => {
    const { image, video, audio } = mediaCounts.value;
    if (Array.isArray(mode)) return image + video + audio > 0 && Object.entries(mediaCounts.value).every(([type, count]) =>
      count <= Number(mode.find((item) => item.startsWith(`${type}Reference:`))?.split(":")[1] ?? 0)
    );
    if (mode === "text") return image + video + audio === 0;
    if (video || audio) return false;
    if (mode === "singleImage") return image === 1;
    if (mode === "startEndRequired") return image === 2;
    return ["endFrameOptional", "startFrameOptional"].includes(mode) && image >= 1 && image <= 2;
  });
}

function getDurations(choice: NodeMediaModel) {
  return [...new Set((choice.durationResolutionMap ?? []).flatMap((item) => item.duration))].sort((a, b) => a - b);
}

function getResolutions(choice: NodeMediaModel, duration?: number) {
  // ACT: 当前视频分辨率使用 p 单位；出现其他单位时再统一换算。
  return [...new Set((choice.durationResolutionMap ?? []).filter((item) => item.duration.includes(duration!)).flatMap((item) => item.resolution))]
    .sort((left, right) => (Number.parseFloat(left) || Infinity) - (Number.parseFloat(right) || Infinity));
}
// ACT: 引用改变时只替换不适用的模式；普通媒体优先作为参考，避免自动变成首尾帧。
watch([selectedModel, matchingModes, () => data.value.mode], ([choice, matches]) => {
  if (!choice || matches.some((item) => JSON.stringify(item) === data.value.mode)) return;
  const modes = choice.mode ?? [];
  const mode = matches.find(Array.isArray) ?? matches.find((item) => item === "singleImage")
    ?? matches.find((item) => item === "endFrameOptional") ?? matches[0]
    ?? modes.find((item) => JSON.stringify(item) === data.value.mode) ?? modes.find(Array.isArray) ?? modes[0];
  data.value.mode = mode === undefined ? "" : JSON.stringify(mode);
}, { flush: "sync" });
// ACT: 参数在节点内归一化，未选中、未挂载底部设置时也可由 Agent 直接生成。
watch([selectedModel, () => data.value.duration], ([choice]) => {
  if (!choice) return;
  const durations = getDurations(choice);
  if (!durations.includes(data.value.duration!)) data.value.duration = durations[0];
  const resolutions = getResolutions(choice, data.value.duration);
  if (!resolutions.includes(data.value.resolution)) data.value.resolution = resolutions.includes("480P") ? "480P" : resolutions[0] ?? "";
  if (!ratioOptions.includes(data.value.ratio)) data.value.ratio = "9:16";
  if (choice.audio !== "optional") data.value.generateAudio = choice.audio === true;
}, { flush: "sync" });
const modelGroups = computed(() => groupNodeModels(models.value));
const generationPrompt = computed(() =>
  [
    data.value.prompt.trim(),
    ...refList.value.flatMap((item, index) => (item.dataType === "STRING" && item.value?.trim() ? [`参考 ${index + 1}：\n${item.value.trim()}`] : [])),
  ]
    .filter(Boolean)
    .join("\n\n")
);
const generationInput = computed<Omit<NodeVideoRequest, "directory"> | undefined>(() => {
  const choice = selectedModel.value;
  if (!choice) return;
  const images = refList.value.flatMap(item => item.dataType === "IMAGE" && item.value ? [{ path: item.value.url, mimeType: item.value.mimeType }] : []);
  return {
    providerId: choice.providerId,
    modelId: choice.modelId,
    prompt: generationPrompt.value,
    mode: selectedMode.value,
    duration: data.value.duration,
    resolution: data.value.resolution || undefined,
    ratio: data.value.ratio,
    generateAudio: choice.audio === "optional" ? data.value.generateAudio : choice.audio,
    outputDirectory: `assets/${id}`,
    images: frameMode.value ? undefined : images,
    firstFrame: frameMode.value && (selectedMode.value !== "startFrameOptional" || images.length > 1) ? images[0] : undefined,
    lastFrame: frameMode.value ? images[selectedMode.value === "startFrameOptional" && images.length === 1 ? 0 : 1] : undefined,
    videos: refList.value.flatMap(item => item.dataType === "VIDEO" && item.value ? [{ path: item.value.url, mimeType: item.value.mimeType }] : []),
    audios: refList.value.flatMap(item => item.dataType === "AUDIO" && item.value ? [{ path: item.value.url, mimeType: item.value.mimeType }] : []),
  };
});
const outputFile = computed(() => outputs.value.video?.dataType === "VIDEO" ? outputs.value.video.value : undefined);
const previewUrl = files.useFileUrl(
  outputFile,
  (error) => showNodeError(error, "视频读取失败")
);

onMounted(() => {
  window.addEventListener("toonflow:plugin-installed", refreshProviderModels);
  window.addEventListener("toonflow:provider-config-changed", refreshProviderModels);
  void loadModels().catch(error => { if (!disposed) showNodeError(error, "模型读取失败"); });
});
onScopeDispose(() => {
  disposed = true;
  window.removeEventListener("toonflow:plugin-installed", refreshProviderModels);
  window.removeEventListener("toonflow:provider-config-changed", refreshProviderModels);
  if (!generationState.background) generationController?.abort();
});

async function refreshProviderModels(event: Event) {
  if (event.type === "toonflow:plugin-installed" && (event as CustomEvent<{ type?: string }>).detail?.type !== "provider") return;
  try {
    await generation;
    if (!disposed && !deleting.value) await loadModels();
  } catch (error) {
    if (!disposed) showNodeError(error, "模型读取失败");
  }
}

async function replaceOutput(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file || generating.value || deleting.value || uploading.value || disposed) return;
  if (!file.type.startsWith("video/")) return void showNodeError("请选择视频文件", "视频替换失败");
  if (!file.size || file.size > 100 * 1024 * 1024) return void showNodeError("视频不能为空且不能超过 100 MB", "视频替换失败");
  uploading.value = true;
  try {
    const workspace = files.getWorkspaceFiles();
    const url = await files.uploadFile(file);
    if (disposed) {
      await workspace.remove(url);
      return;
    }
    // ACT: 保留历史输出文件，避免破坏撤销记录和复制节点的引用。
    outputs.value.video = { dataType: "VIDEO", value: { url, mimeType: file.type } };
  } catch (error) {
    showNodeError(error, "视频替换失败");
  } finally {
    uploading.value = false;
  }
}

function loadModels() {
  if (modelsRequest) return modelsRequest;
  modelsLoading.value = true;
  modelsRequest = ai.getMediaModels().then((items) => {
    if (disposed || generating.value || deleting.value) return;
    models.value = items.filter((item) => item.type === "video");
    // ACT: 只给空配置选默认模型，保留暂时不可用的旧选择及其参数。
    if (!data.value.model) {
      const first = models.value[0];
      data.value.model = first ? JSON.stringify([first.providerId, first.modelId]) : "";
    }
  }).finally(() => {
    modelsLoading.value = false;
    modelsRequest = undefined;
  });
  return modelsRequest;
}

async function startGeneration() {
  const choice = selectedModel.value;
  const input = generationInput.value;
  if (generating.value) throw new Error("视频正在生成，请等待完成");
  if (uploading.value) throw new Error("视频正在替换，请等待完成");
  if (deleting.value) throw new Error("节点正在删除");
  if (!choice || !input) throw new Error("请先选择视频模型");
  if (!generationPrompt.value) throw new Error("请输入生成提示词");
  if (refList.value.some(item => item.value === undefined)) throw new Error("引用节点暂无内容，请先补充引用内容");
  if (choice.mode?.length && !matchingModes.value.length) throw new Error("当前模型没有适合这些参考素材的生成模式，请更换模型或调整引用");
  const workspace = files.getWorkspaceFiles();
  const controller = new AbortController();
  generationController = controller;
  // ACT: 工具立即返回，浏览器任务独立于节点视图，显式停止或删除时取消。
  generation = generationState.run(() => workspace
    .list()
    .then(({ directory }) => {
      controller.signal.throwIfAborted();
      return ai.generateVideo({ ...input, directory }, controller.signal);
    })
    .then(([result]) => {
      controller.signal.throwIfAborted();
      if (!result) throw new Error("供应商未返回视频");
      outputs.value.video = { dataType: "VIDEO", value: { url: result.path, mimeType: result.mimeType } };
    }))
    .catch((error) => showNodeError(error, "视频生成失败"))
    .finally(() => {
      generationController = undefined;
    });
  return { status: "generating" };
}

nodeEvent.on("save", (reason) => {
  if (reason === "reload" && (generating.value || uploading.value || deleting.value)) throw new Error("视频处理中，请完成后再刷新节点");
});
nodeEvent.on("delete", async () => {
  if (uploading.value) throw new Error("视频正在替换，请稍后删除节点");
  deleting.value = true;
  generationState.cancel();
  try {
    await generationState.wait();
    await files.removeNodeFiles();
  } finally {
    deleting.value = false;
  }
});

async function resizeVideo(event: Event) {
  const video = event.currentTarget as HTMLVideoElement;
  if (!video.videoWidth || !video.videoHeight) return;
  videoWidth.value = Math.max(180, (240 * video.videoWidth) / video.videoHeight);
  await nextTick();
  updateNodeInternals();
}

function getConfig() {
  return {
    config: {
      providerId: selectedModel.value?.providerId ?? "",
      modelId: selectedModel.value?.modelId ?? "",
      duration: data.value.duration,
      resolution: data.value.resolution,
      ratio: data.value.ratio,
      mode: selectedMode.value,
      generateAudio: data.value.generateAudio,
    },
    models: models.value,
    ratios: ratioOptions,
    matchingModes: matchingModes.value,
  };
}

nodeTools.register({
  name: "getConfig",
  description: "读取此视频生成节点的当前配置、可选视频模型能力、通用比例及适合当前引用的模式，不含密钥；时长与分辨率须符合 durationResolutionMap",
  parameters: z.strictObject({}),
  async execute(_args, { signal }) {
    signal?.throwIfAborted();
    await loadModels();
    signal?.throwIfAborted();
    return getConfig();
  },
});

nodeTools.register({
  name: "setConfig",
  description: "修改此视频生成节点的模型、时长、分辨率、比例、模式或声音；先用 getConfig 查询能力，providerId 与 modelId 必须同时提供；mode 使用返回的原始字符串或数组，须匹配当前引用；不修改提示词、不启动生成",
  parameters: z.strictObject({
    providerId: z.string().min(1).optional(),
    modelId: z.string().min(1).optional(),
    duration: z.number().positive().optional(),
    resolution: z.string().min(1).optional(),
    ratio: z.enum(ratioOptions).optional(),
    mode: z.union([z.string().min(1), z.array(z.string().min(1)).min(1)]).optional(),
    generateAudio: z.boolean().optional(),
  }).refine((args) => (args.providerId === undefined) === (args.modelId === undefined), "providerId 与 modelId 必须同时提供"),
  async execute(args, { signal }) {
    signal?.throwIfAborted();
    if (generating.value || deleting.value) throw new Error("节点正在生成或删除，请稍后修改配置");
    await loadModels();
    signal?.throwIfAborted();
    if (generating.value || deleting.value) throw new Error("节点正在生成或删除，请稍后修改配置");
    const choice = args.modelId === undefined ? selectedModel.value
      : models.value.find((item) => item.providerId === args.providerId && item.modelId === args.modelId);
    if (!choice) throw new Error("请选择 getConfig 返回的有效视频模型");
    const durations = getDurations(choice);
    if (args.duration !== undefined && !durations.includes(args.duration)) throw new Error(`当前模型不支持时长 ${args.duration}，可选：${durations.join("、")}`);
    const duration = args.duration ?? (durations.includes(data.value.duration!) ? data.value.duration : durations[0]);
    const resolutions = getResolutions(choice, duration);
    if (args.resolution !== undefined && !resolutions.includes(args.resolution)) throw new Error(`当前时长不支持分辨率 ${args.resolution}，可选：${resolutions.join("、")}`);
    const resolution = args.resolution ?? (resolutions.includes(data.value.resolution) ? data.value.resolution : resolutions[0] ?? "");
    if (args.mode !== undefined && !getMatchingModes(choice).some((item) => JSON.stringify(item) === JSON.stringify(args.mode))) throw new Error("所选模式不受当前模型支持或不适用于当前引用，请根据模型能力及已连接素材选择");
    if (args.generateAudio !== undefined && choice.audio !== "optional" && args.generateAudio !== (choice.audio === true)) throw new Error("当前模型不支持切换声音，请查看 getConfig 返回的 audio 能力");
    data.value.model = JSON.stringify([choice.providerId, choice.modelId]);
    data.value.duration = duration;
    data.value.resolution = resolution;
    if (args.ratio !== undefined) data.value.ratio = args.ratio;
    if (args.mode !== undefined) data.value.mode = JSON.stringify(args.mode);
    if (args.generateAudio !== undefined) data.value.generateAudio = args.generateAudio;
    return getConfig();
  },
});

nodeTools.register({
  name: "setPrompt",
  description: "修改此节点的视频生成提示词，支持 {{ref 1}} 等参考标记；只修改提示词，不启动生成",
  parameters: z.strictObject({ prompt: z.string() }),
  execute({ prompt: value }) {
    if (deleting.value) throw new Error("节点正在删除，请稍后修改");
    data.value.prompt = value;
    data.value.promptModel = value.split("\n").map((text) => [{ type: "Write", text }]);
    return { prompt: value };
  },
});

nodeTools.register({
  name: "generateVideo",
  description: "启动此节点的后台视频生成，使用当前提示词、模型、模式、时长、分辨率、比例和参考素材；立即返回已开始，用 getGenerationStatus 查询完成结果，cancelGeneration 停止生成",
  parameters: z.strictObject({}),
  execute(_args, { signal }) {
    signal?.throwIfAborted();
    return startGeneration();
  },
});
</script>

<style scoped lang="scss">
.videoContent {
  position: relative;
  display: grid;
  place-items: center;
  min-height: 144px;
  overflow: hidden;
  border-radius: var(--el-border-radius-base);

  .videoEmpty {
    display: grid;
    place-items: center;
    min-height: 144px;
    color: var(--el-text-color-placeholder);
  }

  :deep(.el-loading-mask) {
    pointer-events: none;
  }

}

.promptCard {
  --composerLine: rgba(255, 255, 255, .1);
  --composerMuted: #a2a2b2;
  --composerAccent: linear-gradient(110deg, #9254f4, #467df7);
  box-sizing: border-box;
  padding: 22px 24px 14px;
  border: 1px solid var(--composerLine);
  border-radius: 20px;
  background: linear-gradient(130deg, #202027, #19191f 65%, #1c1e28);
  color: #ededf4;
  box-shadow: 0 16px 48px #0005, inset 0 1px 0 #ffffff06;
  transition: border-color 180ms, box-shadow 180ms;
  container-type: inline-size;
  &:focus-within { border-color: #8674d9; box-shadow: 0 0 0 3px #8265ed16, 0 16px 48px #0005; }
  button:focus-visible { outline: 2px solid #a892ff; outline-offset: 3px; }
  .composerBody {
    display: grid;
    grid-template-columns: 168px minmax(0, 1fr);
    gap: 24px;
    min-height: 210px;
    .materialTray {
      border-right: 1px solid var(--composerLine);
      padding-right: 20px;
      .trayHeading { display: flex; align-items: center; gap: 6px; margin-bottom: 14px; color: var(--composerMuted); font-size: 11px; .materialCount { margin-left: auto; color: #c6b5fa; } }
      :deep(.referenceList) { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; max-height: 160px; overflow-y: auto; overflow-x: hidden; margin-bottom: 8px; padding: 2px; }
      :deep(.referenceItem) { width: 60px; height: 60px; border-radius: 10px; }
      .addMaterial { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 7px; width: 100%; min-height: 90px; border: 1px dashed #ffffff26; border-radius: 12px; background: #ffffff03; color: #c7c2d8; cursor: pointer; transition: background 180ms, border-color 180ms; font: inherit; font-size: 12px; small { font-size: 10px; color: var(--composerMuted); } &:hover:enabled { background: #9370ef12; border-color: #a38ad5; } &:disabled { opacity: .5; cursor: not-allowed; } }
    }
    .descriptionArea {
      min-width: 0;
      .descriptionHeading { display: flex; justify-content: space-between; align-items: center; height: 22px; color: #b7b3c6; font-size: 11px; letter-spacing: .5px; .clearPrompt { margin: 0; padding: 4px; height: 26px; color: var(--composerMuted); } }
      :deep(.promptInputWrap) { margin: 10px 0 0; padding: 0 0 8px; }
      :deep(.promptInput) { min-height: 144px; color: #ededf4; --chat-text: #ededf4; --chat-text-placeholder: #91909e; }
      :deep(.chat-rich-text) { min-height: 144px !important; max-height: 240px !important; overflow-y: auto; }
      :deep([contenteditable]) { min-height: 144px; font-size: 15px; line-height: 1.9; }
      :deep(.chat-placeholder-wrap) { color: #91909e; font-size: 15px; line-height: 1.9; }
      .descriptionBottom { display: flex; align-items: center; justify-content: space-between; gap: 12px; color: var(--composerMuted); font-size: 10px; .characterCount { flex-shrink: 0; font-variant-numeric: tabular-nums; } }
    }
  }
  .referenceHint { margin: 12px 0 0; color: #c5b5eb; font-size: 12px; }
  .promptFooter {
    display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 14px; padding-top: 18px; margin-top: 16px; border-top: 1px solid var(--composerLine);
    .parameterControls { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; min-width: 0; flex: 1; }
    .generationType { display: inline-flex; align-items: center; gap: 7px; font-size: 12px; color: #c1bbd1; white-space: nowrap; padding-right: 5px; }
    .modelSelect { width: 180px; }
    .modeSelect { width: 142px; }
    :deep(.el-select__wrapper) { min-height: 38px; border-radius: 10px; padding: 6px 10px; background: #ffffff05; box-shadow: 0 0 0 1px var(--composerLine) inset; color: #e6e3ef; transition: box-shadow 180ms, background 180ms; &:hover { background: #ffffff0a; box-shadow: 0 0 0 1px #ffffff30 inset; } }
    :deep(.el-select__selected-item) { font-size: 12px; color: #dfdbe9; }
    :deep(.settingsButton) { min-height: 38px; margin: 0; padding: 8px 11px; border: 1px solid var(--composerLine); border-radius: 10px; background: #ffffff05; color: #dfdbe9; font-size: 12px; }
    .generationActions { display: flex; align-items: center; gap: 10px; margin-left: auto;
      .resetButton { width: 38px; height: 38px; margin: 0; padding: 8px; color: #aaa7bb; border-radius: 10px; }
      .sendButton { display: inline-flex; gap: 8px; min-width: 132px; height: 42px; margin: 0; padding: 0 18px; border: 0; border-radius: 11px; background: var(--composerAccent); color: white; font-weight: 600; letter-spacing: .5px; box-shadow: 0 4px 18px #7855dd30; transition: filter 180ms, transform 150ms, box-shadow 180ms; :deep(> span) { gap: 7px; } &:hover:enabled { filter: brightness(1.12); box-shadow: 0 4px 24px #7855dd55; } &:active:enabled { transform: translateY(1px); } &.is-disabled { background: #35323f; color: #aaa2bb; box-shadow: none; opacity: .7; } }
    }
  }
  .composerUtility { display: flex; align-items: center; justify-content: space-between; min-height: 30px; margin-top: 6px; .promptActions { display: flex; :deep(.el-button) { color: #aaa5bb; } } }
  .generationFeedback { position: relative; display: flex; align-items: center; gap: 8px; padding: 12px 0 5px; border-top: 1px solid var(--composerLine); color: #bfb4df; font-size: 12px; overflow: hidden; > span { flex: 1; min-width: 0; line-height: 1.6; overflow-wrap: anywhere; } .activityTrack { position: absolute; height: 2px; top: 0; left: 0; width: 30%; background: var(--composerAccent); animation: activity 2s ease-in-out infinite; } &.errorFeedback { color: #f0a9ad; .el-button { color: #c5adff; margin: 0; } } &.successFeedback { color: #94cdb7; } }
  .configurationHint { margin: 5px 0; color: var(--composerMuted); font-size: 12px; }
}
.spinning { animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
@keyframes activity { from { transform: translateX(-110%); } to { transform: translateX(440%); } }
@container (max-width: 720px) {
  .promptCard .composerBody { grid-template-columns: 112px minmax(0, 1fr); gap: 16px; .materialTray { padding-right: 14px; :deep(.referenceList) { grid-template-columns: 1fr; } :deep(.referenceItem) { width: 72px; height: 72px; } } }
  .promptCard .promptFooter .generationActions { margin-left: auto; }
}
@container (max-width: 450px) {
  .promptCard .composerBody { grid-template-columns: 1fr; .materialTray { border-right: 0; padding-right: 0; display: flex; align-items: center; gap: 10px; .trayHeading { display: none; } :deep(.referenceList) { display: flex; max-width: 65%; margin: 0; overflow-x: auto; } .addMaterial { width: 86px; min-height: 72px; small { display: none; } } } }
}
@media (prefers-reduced-motion: reduce) { .spinning, .activityTrack { animation: none !important; } .promptCard, .promptCard :deep(*) { transition: none !important; } }
</style>
