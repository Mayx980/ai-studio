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
        <el-tooltip v-if="showCanvas && (conversationCanvas || importResult)" :content="conversationCanvas ? '进入画布' : '加入画布'"><el-button text circle type="primary" :disabled="importing || disabled" :aria-label="conversationCanvas ? '进入画布' : '加入画布'" @click="conversationCanvas ? emit('enterCanvas') : addToCanvas(item)"><icon-square-plus :size="17" /></el-button></el-tooltip>
        <el-button v-if="showReference && item.kind !== 'text'" text circle :disabled="importing || disabled" aria-label="引用素材" title="引用到输入框" @click="referenceResult(item)"><icon-paperclip :size="17" /></el-button>
      </div>
      <div v-if="applicationLabel && ['image', 'video'].includes(item.kind) && !dismissed.has(item.id)" class="applicationChoice"><p>是否将此素材应用为{{ applicationLabel }}？</p><el-button type="primary" :loading="applyingId === item.id" :disabled="disabled || !!applyingId" @click="applyResult(item)">{{ item.kind === 'video' ? `提取${framePosition === 'last' ? '尾帧' : '首帧'}并应用` : '应用' }}</el-button><el-button :disabled="disabled || !!applyingId" @click="continueResult(item)">{{ item.kind === 'video' ? '基于首帧继续修改' : '继续修改' }}</el-button></div>
    </article>
    <imageViewer v-if="preview?.kind === 'image' && preview.url" :urlList="[preview.url]" @close="preview = undefined" />
    <el-dialog :modelValue="preview?.kind === 'video'" title="视频预览" width="min(960px, 94vw)" alignCenter appendToBody destroyOnClose @update:modelValue="preview = undefined"><video v-if="preview?.url" :src="preview.url" controls autoplay playsinline style="display: block; width: 100%; max-height: 78dvh" /></el-dialog>
  </section>
</template>

<script setup lang="ts">
import { IconPaperclip, IconSquarePlus } from "@tabler/icons-vue";
import { computed, inject, onBeforeUnmount, reactive, ref } from "vue";
import { ElMessage, ElDialog } from "element-plus";
import imageViewer from "@toonflow/node-shared/imageViewer";
import { captureVideoFrame } from "@/lib/videoFrame";
import { browserConfig, generationBusy, generationError, generationResults, selectedBrowserModel, browserResultFile } from "@/stores/browserGeneration";
const props = withDefaults(defineProps<{ directory?: string; resultIds?: string[]; showStatus?: boolean; disabled?: boolean; showCanvas?: boolean; conversationCanvas?: boolean; showReference?: boolean; applicationLabel?: string; framePosition?: "first" | "last" }>(), { showCanvas: true, showStatus: true, showReference: true });
const emit = defineEmits<{ enterCanvas: []; reference: [file: File]; apply: [file: File]; busy: [value: boolean] }>();
const importResult = inject<((file: File, directory: string) => Promise<void>) | undefined>("importBrowserResult", undefined);
const importing = ref(false);
const results = computed(() => generationResults.value.filter(item => item.directory === props.directory && (!props.resultIds || props.resultIds.includes(item.id))));
type Result = (typeof generationResults.value)[number];
const preview = ref<Result>();
const dismissed = reactive(new Set<string>()), applyingId = ref("");
let active = true;
onBeforeUnmount(() => { active = false; emit("busy", false); });
const videos = new Map<string, HTMLVideoElement>();
function setVideo(id: string, value: unknown) { if (value instanceof HTMLVideoElement) videos.set(id, value); else videos.delete(id); }
async function applyResult(item: Result) {
  if (props.disabled || applyingId.value) return;
  applyingId.value = item.id; emit("busy", true);
  try {
    const video = videos.get(item.id);
    if (item.kind === "video" && !video) throw new Error("视频尚未就绪，请稍后重试");
    const file = item.kind === "video" ? await captureVideoFrame(video!, props.framePosition ?? "first") : await browserResultFile(item);
    if (active) emit("apply", file);
  } catch (error) { ElMessage.error(error instanceof Error ? error.message : "素材读取失败"); }
  finally { applyingId.value = ""; if (active) emit("busy", false); }
}
async function applyFirst() {
  const item = results.value.find(item => ["image", "video"].includes(item.kind));
  if (item) await applyResult(item);
}
defineExpose({ applyFirst });
async function continueResult(item: Result) {
  if (props.disabled || applyingId.value) return;
  applyingId.value = item.id; emit("busy", true);
  try {
    const video = videos.get(item.id);
    if (item.kind === "video" && !video) throw new Error("视频尚未就绪，请稍后重试");
    const file = item.kind === "video" ? await captureVideoFrame(video!, "first") : await browserResultFile(item);
    if (active) { emit("reference", file); dismissed.add(item.id); }
  } catch (error) { if (active) ElMessage.error(error instanceof Error ? error.message : "素材读取失败"); }
  finally { applyingId.value = ""; if (active) emit("busy", false); }
}
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
.browserModelResults { padding: 12px; max-height: 45vh; overflow: auto; scrollbar-width: none; &::-webkit-scrollbar { display: none; } .applicationChoice { padding: 10px 0; p { font-size: 13px; } } .resultActions { display: flex; align-items: center; gap: 8px; } .generatedResult { img, video { cursor: zoom-in; } margin-top: 12px; img, video { display: block; max-width: 100%; max-height: 260px; border-radius: 12px; } audio { width: 100%; } .generatedText { white-space: pre-wrap; line-height: 1.7; } } }
</style>
