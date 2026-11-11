<template>
  <section v-if="results.length || (browserConfig.enabled && showStatus)" class="browserModelResults" aria-label="真实模型联调">
    <p v-if="showStatus && generationBusy" role="status">正在调用 {{ selectedBrowserModel.label }}，请保持页面打开。</p>
    <el-alert v-if="showStatus && generationError" :title="generationError" type="error" :closable="false" />
    <article v-for="item in results" :key="item.id" class="generatedResult">
      <p v-if="item.kind === 'text'" class="generatedText">{{ item.text }}</p>
      <img v-else-if="item.kind === 'image'" :src="item.url" alt="真实模型生成图片，点击放大" role="button" tabindex="0" @click="preview = item" @keydown.enter="preview = item" @keydown.space.prevent="preview = item" />
      <video :ref="value => setVideo(item.id, value)" v-else-if="item.kind === 'video'" :src="item.url" controls playsinline preload="metadata" tabindex="0" aria-label="生成视频，点击放大" @click="preview = item; ($event.currentTarget as HTMLVideoElement).pause()" @keydown.enter="preview = item" />
      <audio v-else :src="item.url" controls />
      <div class="resultActions">
        <el-tooltip v-if="mediaActions && sourceApplication && item.kind === 'image'" content="应用"><el-button text circle :loading="applyingId === item.id" :disabled="disabled || !!applyingId" aria-label="应用素材" @click="applySourceImage(item)"><icon-check :size="17" /></el-button></el-tooltip>
        <el-tooltip v-if="(showReference || mediaActions && ['image', 'video'].includes(item.kind)) && item.kind !== 'text'" content="引用到输入框"><el-button text circle :disabled="importing || disabled" aria-label="引用到输入框" @click="referenceResult(item)"><icon-paperclip :size="17" /></el-button></el-tooltip>
        <el-tooltip v-if="mediaActions && ['image', 'video'].includes(item.kind) || showCanvas && (conversationCanvas || importResult)" :content="mediaActions || conversationCanvas ? '进入画布' : '加入画布'"><el-button text circle type="primary" :disabled="importing || disabled" :aria-label="mediaActions || conversationCanvas ? '进入画布' : '加入画布'" @click="mediaActions ? emit('enterCanvas', item.id) : conversationCanvas ? emit('enterCanvas') : addToCanvas(item)"><icon-square-plus :size="17" /></el-button></el-tooltip>
        <el-tooltip v-if="mediaActions && ['image', 'video'].includes(item.kind)" content="删除"><el-button text circle :disabled="importing || disabled" aria-label="删除素材" @click="emit('remove', item.id)"><icon-trash :size="17" /></el-button></el-tooltip>
      </div>
    </article>
    <imageViewer v-if="preview?.kind === 'image' && preview.url" :urlList="[preview.url]" @close="preview = undefined" />
    <el-dialog :modelValue="preview?.kind === 'video'" title="视频预览" width="min(960px, 94vw)" alignCenter appendToBody destroyOnClose @update:modelValue="preview = undefined"><video v-if="preview?.url" :src="preview.url" controls autoplay playsinline style="display: block; width: 100%; max-height: 78dvh" /></el-dialog>
  </section>
</template>

<script setup lang="ts">
import { rememberFileOrigin } from "@/lib/generationOrigin";
import { IconPaperclip, IconSquarePlus, IconTrash, IconCheck } from "@tabler/icons-vue";
import { computed, inject, onBeforeUnmount, ref } from "vue";
import { ElMessage, ElDialog } from "element-plus";
import imageViewer from "@toonflow/node-shared/imageViewer";
import { captureVideoFrame } from "@/lib/videoFrame";
import { browserConfig, generationBusy, generationError, generationResults, selectedBrowserModel, browserResultFile } from "@/stores/browserGeneration";
const props = withDefaults(defineProps<{ directory?: string; resultIds?: string[]; showStatus?: boolean; disabled?: boolean; showCanvas?: boolean; conversationCanvas?: boolean; showReference?: boolean; mediaActions?: boolean; framePosition?: "first" | "last" }>(), { showCanvas: true, showStatus: true, showReference: true });
const emit = defineEmits<{ enterCanvas: [resultId?: string]; remove: [resultId: string]; reference: [file: File]; apply: [file: File]; busy: [value: boolean] }>();
const importResult = inject<((file: File, directory: string) => Promise<void>) | undefined>("importBrowserResult", undefined);
const importing = ref(false);
const results = computed(() => generationResults.value.filter(item => item.directory === props.directory && (!props.resultIds || props.resultIds.includes(item.id))));
type Result = (typeof generationResults.value)[number];
const preview = ref<Result>();
const applyingId = ref("");
const sourceApplication = window.frameElement?.getAttribute("data-source-application") === "true";
let active = true;
onBeforeUnmount(() => { active = false; emit("busy", false); });
const videos = new Map<string, HTMLVideoElement>();
function setVideo(id: string, value: unknown) { if (value instanceof HTMLVideoElement) videos.set(id, value); else videos.delete(id); }
async function applySourceImage(item: Result) {
  if (props.disabled || applyingId.value) return;
  applyingId.value = item.id;
  try {
    if (!props.directory || !item.path) throw new Error("素材尚未保存，请稍后重试");
    const request = { id: item.id, path: item.path, directory: props.directory, completion: undefined as Promise<void> | undefined };
    window.dispatchEvent(new CustomEvent("afxen:apply-source-image", { detail: request }));
    if (!request.completion) throw new Error("原素材入口已关闭，请重新打开来源对话");
    await request.completion;
  } catch (error) { ElMessage.error(error instanceof Error ? error.message : "应用素材失败"); }
  finally { applyingId.value = ""; }
}
async function applyResult(item: Result) {
  if (props.disabled || applyingId.value) return;
  applyingId.value = item.id; emit("busy", true);
  try {
    const video = videos.get(item.id);
    if (item.kind === "video" && !video) throw new Error("视频尚未就绪，请稍后重试");
    const file = item.kind === "video" && props.framePosition ? rememberFileOrigin(await captureVideoFrame(video!, props.framePosition), item.origin) : await browserResultFile(item);
    if (active) emit("apply", file);
  } catch (error) { ElMessage.error(error instanceof Error ? error.message : "素材读取失败"); }
  finally { applyingId.value = ""; if (active) emit("busy", false); }
}
async function applyFirst() {
  const item = results.value.find(item => ["image", "video"].includes(item.kind));
  if (item) await applyResult(item);
}
defineExpose({ applyFirst });
async function addToCanvas(item: Result) {
  if (!props.directory || !importResult || importing.value) return;
  const directory = props.directory;
  importing.value = true;
  try {
    const file = await browserResultFile(item);
    await importResult(file, directory);
    ElMessage.success("已创建素材节点并定位到画布");
  } catch (error) { ElMessage.error(error instanceof Error ? error.message : "加入画布失败，请检查结果地址的跨域许可"); }
  finally { importing.value = false; }
}
async function referenceResult(item: Result) {
  if (importing.value || props.disabled) return;
  importing.value = true;
  try { emit("reference", await browserResultFile(item)); }
  catch (error) { ElMessage.error(error instanceof Error ? error.message : "读取引用素材失败"); }
  finally { importing.value = false; }
}

</script>

<style scoped lang="scss">
.browserModelResults { padding: 12px; max-height: 45vh; overflow: auto; scrollbar-width: none; &::-webkit-scrollbar { display: none; } .resultActions { display: flex; align-items: center; gap: 8px; } .generatedResult { img, video { cursor: zoom-in; } margin-top: 12px; img, video { display: block; max-width: 100%; max-height: 260px; border-radius: 12px; } audio { width: 100%; } .generatedText { white-space: pre-wrap; line-height: 1.7; } } }
</style>
