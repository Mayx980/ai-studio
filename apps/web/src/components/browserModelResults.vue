<template>
  <section v-if="results.length || (browserConfig.enabled && showStatus)" class="browserModelResults" aria-label="真实模型联调">
    <p v-if="showStatus && generationBusy" role="status">正在调用 {{ selectedBrowserModel.label }}，请保持页面打开。</p>
    <el-alert v-if="showStatus && generationError" :title="generationError" type="error" :closable="false" />
    <article v-for="item in results" :key="item.id" class="generatedResult">
      <p v-if="item.kind === 'text'" class="generatedText">{{ item.text }}</p>
      <img v-else-if="item.kind === 'image'" :src="item.url" alt="真实模型生成图片" />
      <video v-else-if="item.kind === 'video'" :src="item.url" controls playsinline preload="metadata" />
      <audio v-else :src="item.url" controls />
      <div class="resultActions">
        <el-button v-if="importResult && item.kind !== 'text'" text type="primary" :disabled="importing || disabled" @click="addToCanvas(item)">进入画布</el-button>
        <el-button v-if="item.kind !== 'text'" text circle :disabled="importing || disabled" aria-label="引用素材" title="引用到输入框" @click="referenceResult(item)"><icon-paperclip :size="17" /></el-button>
      </div>
    </article>
  </section>
</template>

<script setup lang="ts">
import { IconPaperclip } from "@tabler/icons-vue";
import { studioFetch } from "@/lib/studioFetch";
import { computed, inject, ref } from "vue";
import { ElMessage } from "element-plus";
import { browserConfig, generationBusy, generationError, generationResults, selectedBrowserModel } from "@/stores/browserGeneration";
const props = withDefaults(defineProps<{ directory?: string; resultIds?: string[]; showStatus?: boolean; disabled?: boolean }>(), { showStatus: true });
const emit = defineEmits<{ reference: [file: File] }>();
const importResult = inject<((file: File, directory: string) => Promise<void>) | undefined>("importBrowserResult", undefined);
const importing = ref(false);
const results = computed(() => generationResults.value.filter(item => item.directory === props.directory && (!props.resultIds || props.resultIds.includes(item.id))));
type Result = (typeof generationResults.value)[number];
async function addToCanvas(item: Result) {
  if (!props.directory || !importResult || importing.value) return;
  const directory = props.directory;
  importing.value = true;
  try {
    const file = await resultFile(item);
    await importResult(file, directory);
    ElMessage.success("已创建素材节点并定位到画布");
  } catch (error) { ElMessage.error(error instanceof Error ? error.message : "加入画布失败，请检查结果地址的跨域许可"); }
  finally { importing.value = false; }
}
async function resultFile(item: Result) {
  let file = item.file;
  if (!file) {
    const response = await studioFetch(item.url!);
    if (!response.ok) throw new Error(`读取模型结果失败（HTTP ${response.status}）`);
    const blob = await response.blob();
    if (!blob.size || (blob.type && !blob.type.startsWith(`${item.kind}/`) && blob.type !== "application/octet-stream")) throw new Error("结果地址没有返回有效素材，请检查供应商的结果地址和有效期");
    file = new File([blob], `生成结果.${item.kind === "video" ? "mp4" : item.kind === "audio" ? "mp3" : "png"}`, { type: (blob.type.startsWith(`${item.kind}/`) ? blob.type : "") || `${item.kind}/${item.kind === "video" ? "mp4" : item.kind === "audio" ? "mpeg" : "png"}` });
  }
  item.file = file;
  return file;
}
async function referenceResult(item: Result) {
  if (importing.value || props.disabled) return;
  importing.value = true;
  try { emit("reference", await resultFile(item)); }
  catch (error) { ElMessage.error(error instanceof Error ? error.message : "读取引用素材失败"); }
  finally { importing.value = false; }
}

</script>

<style scoped lang="scss">
.browserModelResults { padding: 12px; max-height: 45vh; overflow: auto; .resultActions { display: flex; align-items: center; gap: 8px; } .generatedResult { margin-top: 12px; img, video { display: block; max-width: 100%; max-height: 260px; border-radius: 12px; } audio { width: 100%; } .generatedText { white-space: pre-wrap; line-height: 1.7; } } }
</style>
