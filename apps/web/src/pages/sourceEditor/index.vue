<template>
  <section class="sourceEditorPage" aria-label="素材来源编辑">
    <el-alert v-if="error" :title="error" type="error" :closable="false" />
    <sourceEditorViewport v-if="url" :key="url" :src="url" />
  </section>
</template>
<script setup lang="ts">
import { ref, watch } from "vue";
import { useRoute } from "vue-router";
import sourceEditorViewport from "@/components/sourceEditorViewport.vue";
import { readGenerationOrigin, sourceWorkspaceUrl, validateGenerationOrigin } from "@/lib/generationOrigin";
const route = useRoute();
const url = ref(""), error = ref("");
let requestId = 0;
watch(() => route.fullPath, async () => {
  const request = ++requestId;
  url.value = ""; error.value = "";
  try {
    const query = route.query;
    const value = readGenerationOrigin({ type: query.sourceType, directory: query.sourceDirectory, ...(query.sourceType === "canvas" ? { canvasPath: query.canvasPath, nodeId: query.source } : { sessionFile: query.source }) });
    if (!value) throw new Error("缺少生成来源");
    await validateGenerationOrigin(value);
    if (request !== requestId) return;
    url.value = sourceWorkspaceUrl(value);
  } catch (cause) { if (request === requestId) error.value = cause instanceof Error ? cause.message : "生成来源无法打开"; }
}, { immediate: true });
</script>
<style scoped lang="scss">
.sourceEditorPage { display: flex; flex-direction: column; height: 100dvh; min-width: 0; min-height: 0; overflow: hidden; background: #1c1b21;
}
</style>
