<template>
  <section class="sourceEditorPage" aria-label="素材来源编辑">
    <header><el-button text @click="goBack"><icon-arrow-left :size="16" />返回</el-button><strong>{{ origin?.type === 'canvas' ? '来源画布' : '来源对话' }}</strong></header>
    <el-alert v-if="error" :title="error" type="error" :closable="false" />
    <sourceEditorViewport v-if="url" :key="url" :src="url" />
  </section>
</template>
<script setup lang="ts">
import { ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { IconArrowLeft } from "@tabler/icons-vue";
import sourceEditorViewport from "@/components/sourceEditorViewport.vue";
import { readGenerationOrigin, sourceWorkspaceUrl, validateGenerationOrigin, type GenerationOrigin } from "@/lib/generationOrigin";
const route = useRoute(), router = useRouter();
const origin = ref<GenerationOrigin>(), url = ref(""), error = ref("");
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
    origin.value = value; url.value = sourceWorkspaceUrl(value);
  } catch (cause) { if (request === requestId) error.value = cause instanceof Error ? cause.message : "生成来源无法打开"; }
}, { immediate: true });
function goBack() { if (window.history.state?.back) router.back(); else void router.replace({ path: "/home", query: { section: "assets" } }); }
</script>
<style scoped lang="scss">
.sourceEditorPage { display: flex; flex-direction: column; height: 100dvh; min-width: 0; min-height: 0; overflow: hidden; background: #1c1b21;
  header { display: flex; align-items: center; flex: none; gap: 12px; padding: 10px 16px; border-bottom: 1px solid #ffffff0c; color: #e9e5f0; font-size: 14px; }
}
</style>
