<template>
  <section v-if="browserConfig.enabled" class="browserModelResults" aria-label="真实模型联调">
    <p v-if="generationBusy" role="status">正在调用 {{ selectedBrowserModel.label }}，请保持页面打开。<el-button text @click="stopBrowserGeneration">停止等待</el-button></p>
    <el-alert v-if="generationError" :title="generationError" type="error" :closable="false" />
    <article v-for="item in results" :key="item.id" class="generatedResult">
      <p v-if="item.kind === 'text'" class="generatedText">{{ item.text }}</p>
      <img v-else-if="item.kind === 'image'" :src="item.url" alt="真实模型生成图片" />
      <video v-else-if="item.kind === 'video'" :src="item.url" controls playsinline preload="metadata" />
      <audio v-else :src="item.url" controls />
      <div><el-button v-if="importResult && item.kind !== 'text'" text type="primary" :disabled="importing" @click="addToCanvas(item)">加入画布</el-button><el-button text @click="removeResult(item)">移除预览</el-button></div>
    </article>
  </section>
</template>

<script setup lang="ts">
import { computed, inject, ref } from "vue";
import { ElMessage } from "element-plus";
import { browserConfig, generationBusy, generationError, generationResults, selectedBrowserModel, stopBrowserGeneration } from "@/stores/browserGeneration";
const props = defineProps<{ directory?: string }>();
const importResult = inject<((file: File, directory: string) => Promise<void>) | undefined>("importBrowserResult", undefined);
const importing = ref(false);
const results = computed(() => generationResults.value.filter(item => item.directory === props.directory));
type Result = (typeof generationResults.value)[number];
async function addToCanvas(item: Result) {
  if (!props.directory || !importResult || importing.value) return;
  const directory = props.directory;
  importing.value = true;
  try {
    let file = item.file;
    if (!file) {
      const response = await fetch(item.url!, { credentials: "omit", referrerPolicy: "no-referrer" });
      if (!response.ok) throw new Error(`读取模型结果失败（HTTP ${response.status}）`);
      const blob = await response.blob();
      file = new File([blob], `生成结果.${item.kind === "video" ? "mp4" : item.kind === "audio" ? "mp3" : "png"}`, { type: blob.type || `${item.kind}/${item.kind === "video" ? "mp4" : item.kind === "audio" ? "mpeg" : "png"}` });
    }
    await importResult(file, directory);
  } catch (error) { ElMessage.error(error instanceof Error ? error.message : "加入画布失败，请检查结果地址的跨域许可"); }
  finally { importing.value = false; }
}
function removeResult(item: Result) { if (item.file && item.url) URL.revokeObjectURL(item.url); generationResults.value = generationResults.value.filter(result => result.id !== item.id); }
</script>

<style scoped lang="scss">
.browserModelResults { padding: 12px; max-height: 45vh; overflow: auto; .generatedResult { margin-top: 12px; img, video { display: block; max-width: 100%; max-height: 260px; border-radius: 12px; } audio { width: 100%; } .generatedText { white-space: pre-wrap; line-height: 1.7; } } }
</style>
