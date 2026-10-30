<template>
  <section class="templateProjectPreview" aria-label="模板只读画布">
    <p v-if="loading" role="status">正在读取模板画布…</p>
    <el-alert v-else-if="error" :title="error" type="error" :closable="false" />
    <template v-else>
      <div class="previewToolbar"><el-select v-model="canvasPath" aria-label="查看画布"><el-option v-for="canvas in canvases" :key="canvas.id" :value="canvas.id" :label="canvas.name" /></el-select><span>只读 · 可平移、缩放和查看节点</span><el-button text @click="flow?.fitView()">适应视图</el-button></div>
      <div class="previewBody">
        <vue-flow :key="canvasPath" :nodes="nodes" :edges="edges" :nodesDraggable="false" :nodesConnectable="false" :edgesUpdatable="false" :nodesFocusable="false" :edgesFocusable="false" :deleteKeyCode="null" :selectionKeyCode="null" :multiSelectionKeyCode="null" :zoomOnDoubleClick="false" :minZoom="0.05" :maxZoom="3" fitViewOnInit @init="flow = $event" @nodesInitialized="fitView" @nodeClick="selectedId = $event.node.id">
          <background :gap="20" patternColor="var(--el-border-color)" />
        </vue-flow>
        <aside v-if="selectedNode" class="nodeDetails" aria-label="节点只读信息"><h3>{{ selectedNode.data?.label || selectedNode.id }}</h3><p>{{ selectedNode.type }}</p><pre>{{ selectedContent }}</pre></aside>
      </div>
    </template>
  </section>
</template>
<script setup lang="ts">
import { computed, ref, shallowRef, watch } from "vue";
import { VueFlow, type VueFlowStore } from "@vue-flow/core";
import "@vue-flow/core/dist/style.css";
import "@vue-flow/core/dist/theme-default.css";
import { Background } from "@vue-flow/background";
import type { CreationTemplate } from "@/lib/creationTemplates";
import { readTemplateProject } from "@/lib/projectTemplates";
import { readCanvasFiles } from "@/pages/workspace/panels/canvas/canvasFiles";
import useWorkspaceFiles from "@/lib/workspaceFiles";
import { templateDirectory } from "@/lib/creationTemplates";
const props = defineProps<{ template: CreationTemplate }>();
const loading = ref(true), error = ref(""), canvasPath = ref(""), selectedId = ref("");
const flow = shallowRef<VueFlowStore>();
function fitView() { void flow.value?.fitView(); }
defineExpose({ fitView });
const canvases = shallowRef<Awaited<ReturnType<typeof readCanvasFiles>>>([]);
let contents = new Map<string, ArrayBuffer>();
const canvas = computed(() => canvases.value.find(item => item.id === canvasPath.value));
// ACT: 只展示已保存的拓扑与节点信息，不挂载会执行请求或写文件的插件组件。
const nodes = computed(() => (canvas.value?.data.nodes ?? []).map(node => ({ id: node.id, position: node.position, parentNode: node.parentNode, data: { label: node.data?.label || node.id }, type: "default", style: { width: "210px", whiteSpace: "normal" as const } })));
const edges = computed(() => (canvas.value?.data.edges ?? []).map(edge => ({ id: edge.id, source: edge.source, target: edge.target, label: typeof edge.label === "string" ? edge.label : undefined })));
const selectedNode = computed(() => canvas.value?.data.nodes.find(node => node.id === selectedId.value));
const selectedContent = computed(() => {
  const data = selectedNode.value?.data;
  const text = typeof data?.textPath === "string" ? contents.get(data.textPath) : undefined;
  return [text ? new TextDecoder().decode(text) : "", JSON.stringify(data, null, 2)].filter(Boolean).join("\n\n");
});
watch(canvasPath, () => { selectedId.value = ""; });
watch(() => props.template, async (template, _previous, cleanup) => {
  let active = true; cleanup(() => { active = false; });
  loading.value = true; error.value = "";
  try {
    const snapshot = await readTemplateProject(template);
    const values = await readCanvasFiles(useWorkspaceFiles(templateDirectory), `assets/${template.id}/project`);
    if (!active) return;
    const prefix = `assets/${template.id}/project/`;
    contents = snapshot.contents;
    canvases.value = values.map(item => ({ ...item, id: item.id.slice(prefix.length) }));
    canvasPath.value = canvases.value[0]?.id ?? "";
  } catch (failure) { if (active) error.value = failure instanceof Error ? failure.message : "模板画布读取失败"; }
  finally { if (active) loading.value = false; }
}, { immediate: true });
</script>
<style scoped lang="scss">
.templateProjectPreview { height: min(76dvh, 820px); display: flex; flex-direction: column;
  .previewToolbar { display: flex; align-items: center; gap: 12px; padding-bottom: 12px; flex-wrap: wrap; .el-select { width: 200px; } span { color: var(--el-text-color-secondary); font-size: 12px; } }
  .previewBody { flex: 1; min-height: 0; display: flex; border: 1px solid var(--el-border-color-light); border-radius: 12px; overflow: hidden; .vue-flow { flex: 1; min-width: 0; background: var(--el-fill-color-extra-light); }
    .nodeDetails { width: clamp(210px, 28vw, 360px); padding: 16px; overflow: auto; border-left: 1px solid var(--el-border-color-light); h3 { margin: 0; } pre { white-space: pre-wrap; overflow-wrap: anywhere; font: 12px/1.7 monospace; } }
  }
  @media(max-width:700px) { .previewBody { flex-direction: column; .nodeDetails { width: auto; max-height: 28dvh; border-left: 0; border-top: 1px solid var(--el-border-color-light); } } }
}
</style>
