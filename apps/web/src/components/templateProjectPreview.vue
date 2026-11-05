<template>
  <section class="templateProjectPreview" aria-label="模板只读画布">
    <p v-if="loading" role="status">正在读取模板画布…</p>
    <el-alert v-else-if="error" :title="error" type="error" :closable="false" />
    <template v-else>
      <div class="previewToolbar"><span>只读 · 可拖拽节点、平移和缩放查看</span><el-button text @click="flow?.zoomOut()" aria-label="缩小画布">−</el-button><el-button text @click="flow?.zoomIn()" aria-label="放大画布">＋</el-button><el-button text @click="fitView">适应视图</el-button></div>
      <div class="previewBody" @load.capture="fitLoadedMedia" @loadedmetadata.capture="fitLoadedMedia">
        <vue-flow :key="canvasPath" v-model:nodes="nodes" :edges="edges" :nodesDraggable="true" :nodesConnectable="false" :edgesUpdatable="false" :nodesFocusable="true" :edgesFocusable="false" :deleteKeyCode="null" :selectionKeyCode="null" :multiSelectionKeyCode="null" :zoomOnDoubleClick="false" :minZoom="0.05" :maxZoom="3" fitViewOnInit @init="flow = $event" @nodesInitialized="fitView" @nodeClick="selectedId = $event.node.id" @nodeDragStart="selectedId = ''" @nodeDragStop="rememberPosition">
          <template #node-preview="nodeProps"><templatePreviewNode v-bind="nodeProps" :selected="nodeProps.id === selectedId" @closeInput="selectedId = ''" @selectReference="selectNode" /></template>
          <background :gap="20" patternColor="#30343c" />
        </vue-flow>

      </div>
    </template>
  </section>
</template>
<script setup lang="ts">
import { computed, nextTick, ref, shallowRef, watch } from "vue";
import { VueFlow, type VueFlowStore, type Node } from "@vue-flow/core";
import "@vue-flow/core/dist/style.css";
import "@vue-flow/core/dist/theme-default.css";
import { Background } from "@vue-flow/background";
import type { CreationTemplate } from "@/lib/creationTemplates";
import { readTemplateProject } from "@/lib/projectTemplates";
import type { readCanvasFiles } from "@/pages/workspace/panels/canvas/canvasFiles";
import templatePreviewNode from "./templatePreviewNode.vue";
const props = defineProps<{ template: CreationTemplate }>();
const loading = ref(true), error = ref(""), canvasPath = ref(""), selectedId = ref("");
const flow = shallowRef<VueFlowStore>();
const viewedPositions = new Map<string, { x: number; y: number }>();
function rememberPosition({ node }: { node: Node }) { viewedPositions.set(`${canvasPath.value}:${node.id}`, { x: node.position.x, y: node.position.y }); }
function fitView() { void flow.value?.fitView({ padding: .15 }); }
async function fitLoadedMedia() { await nextTick(); await new Promise<void>(resolve => requestAnimationFrame(() => resolve())); if (!selectedId.value) fitView(); }
async function selectNode(id: string) { selectedId.value = id; await nextTick(); await new Promise<void>(resolve => requestAnimationFrame(() => resolve())); void flow.value?.fitView({ nodes: [id], maxZoom: 1, padding: .4 }); }
defineExpose({ fitView });
const canvases = shallowRef<Awaited<ReturnType<typeof readCanvasFiles>>>([]);
const allMediaUrls = shallowRef(new Map<string, Map<string, { url: string; mimeType: string }[]>>());
const mediaUrls = computed(() => allMediaUrls.value.get(canvasPath.value) ?? new Map<string, { url: string; mimeType: string }[]>());
let contents = new Map<string, ArrayBuffer>();
const canvas = computed(() => canvases.value.find(item => item.id === canvasPath.value));
function nodeText(node: Node) {
  const data = node.data;
  if (typeof data?.textPath === "string" && contents.has(data.textPath)) return new TextDecoder().decode(contents.get(data.textPath));
  if (typeof data?.textSnapshot === "string") return data.textSnapshot;
  if (typeof data?.prompt === "string") return data.prompt;
  const text = Object.values(data?.outputs ?? {}).find(output => (output as { dataType?: string }).dataType === "STRING") as { value?: unknown } | undefined;
  return typeof text?.value === "string" ? text.value : "";
}
// ACT: 复用保存的素材、输入与拓扑，只读渲染不挂载会生成内容或写文件的插件。
function nodeParameters(node: Node) {
  const data = node.data;
  const parameters = [{ key: "modelLabel", label: "生成模型" }, { key: "ratio", label: "比例" }, { key: "size", label: "尺寸" }, { key: "n", label: "数量" }, { key: "resolution", label: "清晰度" }, { key: "duration", label: "时长（秒）" }];
  return parameters.flatMap(parameter => data?.[parameter.key] !== undefined && data[parameter.key] !== "" ? [{ label: parameter.label, value: String(data[parameter.key]) }] : []);
}
const nodes = ref<Node[]>([]);
const previewNodes = computed(() => {
  const saved = canvas.value?.data.nodes ?? [], byId = new Map(saved.map(node => [node.id, node]));
  const sources = new Map<string, Set<string>>();
  for (const edge of canvas.value?.data.edges ?? []) { if (!sources.has(edge.target)) sources.set(edge.target, new Set()); sources.get(edge.target)!.add(edge.source); }
  return saved.map(node => {
    const group = ["group", "canvasGroup"].includes(node.type ?? "");
    const references = [...sources.get(node.id) ?? []].flatMap(id => { const source = byId.get(id); return source ? [{ id, label: source.data?.label || id, text: nodeText(source), media: mediaUrls.value.get(id)?.[0] }] : []; });
    return { id: node.id, position: viewedPositions.get(`${canvasPath.value}:${node.id}`) ?? { ...node.position }, parentNode: node.parentNode, data: { label: node.data?.label || node.id, text: nodeText(node), media: mediaUrls.value.get(node.id) ?? [], parameters: nodeParameters(node), references }, type: group ? "group" : "preview", style: group ? node.style : { width: typeof node.width === "number" ? `${node.width}px` : (typeof node.width === "string" ? node.width : "320px") } };
  });
});
watch(previewNodes, value => { nodes.value = value; }, { immediate: true });
const edges = computed(() => (canvas.value?.data.edges ?? []).map(edge => ({ id: edge.id, source: edge.source, target: edge.target, sourceHandle: "out", targetHandle: "in", label: typeof edge.label === "string" ? edge.label : undefined })));
watch(canvasPath, () => { selectedId.value = ""; });
watch(() => props.template, async (template, _previous, cleanup) => {
  let active = true; const releases: string[] = [];
  cleanup(() => { active = false; releases.forEach(url => URL.revokeObjectURL(url)); });
  loading.value = true; error.value = ""; selectedId.value = ""; viewedPositions.clear();
  try {
    const snapshot = await readTemplateProject(template);
    if (!active) return;
    contents = snapshot.contents;
    canvases.value = snapshot.project.canvases.map(path => ({ id: path, name: path.split("/").at(-1)!.replace(/\.json$/i, ""), data: JSON.parse(new TextDecoder().decode(contents.get(path))) }));
    const allUrls = new Map<string, Map<string, { url: string; mimeType: string }[]>>(), files = new Map<string, string>();
    for (const canvas of canvases.value) {
      const urls = new Map<string, { url: string; mimeType: string }[]>();
      allUrls.set(canvas.id, urls);
      for (const node of canvas.data.nodes) {
        const media: { url: string; mimeType: string }[] = [];
        for (const output of Object.values(node.data?.outputs ?? {})) {
          const value = (output as { value?: { url?: string; mimeType?: string } })?.value;
          if (!value || typeof value.url !== "string" || typeof value.mimeType !== "string" || !/^(image|video|audio)\//.test(value.mimeType)) continue;
          const bytes = contents.get(value.url); if (!bytes) throw new Error(`项目缺少素材：${value.url}`);
          let url = files.get(value.url);
          if (!url) { url = URL.createObjectURL(new Blob([bytes], { type: value.mimeType })); files.set(value.url, url); releases.push(url); }
          media.push({ url, mimeType: value.mimeType });
        }
        urls.set(node.id, media);
      }
    }
    allMediaUrls.value = allUrls;
    canvasPath.value = canvases.value[0]?.id ?? "";
  } catch (failure) { if (active) error.value = failure instanceof Error ? failure.message : "模板画布读取失败"; }
  finally { if (active) loading.value = false; }
}, { immediate: true });
</script>
<style scoped lang="scss">
.templateProjectPreview { height: min(78dvh, 900px); display: flex; flex-direction: column; min-height: 0;
  .previewToolbar { display: flex; align-items: center; gap: 12px; padding-bottom: 12px; flex-wrap: wrap; .el-select { width: 200px; } span { color: var(--el-text-color-secondary); font-size: 12px; } }
  .previewBody { flex: 1; min-height: 0; display: flex; border: 1px solid var(--el-border-color-light); border-radius: 12px; overflow: hidden;
    .vue-flow { flex: 1; min-width: 0; background: #090909; }
  }
}
</style>
