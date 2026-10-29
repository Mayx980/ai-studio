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
        <el-tooltip v-if="showCanvas && importResult" content="加入画布"><el-button text circle type="primary" :disabled="importing || disabled" aria-label="加入画布" @click="addToCanvas(item)"><icon-square-plus :size="17" /></el-button></el-tooltip>
        <el-button v-if="showReference && item.kind !== 'text'" text circle :disabled="importing || disabled" aria-label="引用素材" title="引用到输入框" @click="referenceResult(item)"><icon-paperclip :size="17" /></el-button>
      </div>
    </article>
  </section>
</template>

<script setup lang="ts">
import { IconPaperclip, IconSquarePlus } from "@tabler/icons-vue";
import { computed, inject, ref } from "vue";
import { ElMessage } from "element-plus";
import { browserConfig, generationBusy, generationError, generationResults, selectedBrowserModel, browserResultFile } from "@/stores/browserGeneration";
const props = withDefaults(defineProps<{ directory?: string; resultIds?: string[]; showStatus?: boolean; disabled?: boolean; showCanvas?: boolean; showReference?: boolean }>(), { showCanvas: true, showStatus: true, showReference: true });
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
.browserModelResults { padding: 12px; max-height: 45vh; overflow: auto; .resultActions { display: flex; align-items: center; gap: 8px; } .generatedResult { margin-top: 12px; img, video { display: block; max-width: 100%; max-height: 260px; border-radius: 12px; } audio { width: 100%; } .generatedText { white-space: pre-wrap; line-height: 1.7; } } }
</style>
