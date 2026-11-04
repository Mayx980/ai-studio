<template>
  <section class="templateProjectPreview" aria-label="模板只读画布">
    <p v-if="loading" role="status">正在读取模板画布…</p>
    <el-alert v-else-if="error" :title="error" type="error" :closable="false" />
    <template v-else>
      <div class="previewToolbar"><el-select v-model="canvasPath" aria-label="查看画布"><el-option v-for="canvas in canvases" :key="canvas.id" :value="canvas.id" :label="canvas.name" /></el-select><span>只读 · 可平移、缩放和查看节点</span><el-button text @click="flow?.zoomOut()" aria-label="缩小画布">−</el-button><el-button text @click="flow?.zoomIn()" aria-label="放大画布">＋</el-button><el-button text @click="fitView">适应视图</el-button></div>
      <div class="previewBody">
        <nav class="projectNodeList" aria-label="项目节点"><button v-for="node in canvas?.data.nodes" :key="node.id" type="button" :aria-pressed="selectedId === node.id" @click="selectNode(node.id)"><img v-if="mediaUrls.get(node.id)?.[0]?.mimeType.startsWith('image/')" :src="mediaUrls.get(node.id)![0]!.url" alt="" /><video v-else-if="mediaUrls.get(node.id)?.[0]?.mimeType.startsWith('video/')" :src="mediaUrls.get(node.id)![0]!.url" muted playsinline preload="metadata" /><span>{{ node.data?.label || node.id }}</span></button></nav>
        <vue-flow :key="canvasPath" :nodes="nodes" :edges="edges" :nodesDraggable="false" :nodesConnectable="false" :edgesUpdatable="false" :nodesFocusable="true" :edgesFocusable="false" :deleteKeyCode="null" :selectionKeyCode="null" :multiSelectionKeyCode="null" :zoomOnDoubleClick="false" :minZoom="0.05" :maxZoom="3" fitViewOnInit @init="flow = $event" @nodesInitialized="fitView" @nodeClick="selectedId = $event.node.id">
          <template #node-preview="nodeProps"><templatePreviewNode v-bind="nodeProps" /></template>
          <background :gap="20" patternColor="#30343c" />
        </vue-flow>
        <aside v-if="selectedNode" class="nodeDetails" aria-label="节点只读输入框"><header><h3>{{ selectedNode.data?.label || selectedNode.id }}</h3><el-button text circle aria-label="关闭节点输入框" @click="selectedId = ''"><icon-x :size="16" /></el-button></header><label :for="inputId">输入内容</label><el-input :id="inputId" :modelValue="nodeText(selectedNode)" type="textarea" :rows="10" readonly aria-label="节点输入内容" /><div v-if="incomingNodes.length" class="inputReferences"><span>引用素材</span><el-button v-for="node in incomingNodes" :key="node.id" text @click="selectNode(node.id)">{{ node.data?.label || node.id }}</el-button></div><dl><template v-for="parameter in selectedParameters" :key="parameter.label"><dt>{{ parameter.label }}</dt><dd>{{ parameter.value }}</dd></template></dl><template v-for="media in mediaUrls.get(selectedNode.id)" :key="media.url"><video v-if="media.mimeType.startsWith('video/')" :src="media.url" controls playsinline /><img v-else-if="media.mimeType.startsWith('image/')" :src="media.url" :alt="selectedNode.data?.label || selectedNode.id" /></template></aside>
      </div>
    </template>
  </section>
</template>
<script setup lang="ts">
import { computed, nextTick, ref, shallowRef, useId, watch } from "vue";
import { VueFlow, type VueFlowStore, type Node } from "@vue-flow/core";
import "@vue-flow/core/dist/style.css";
import "@vue-flow/core/dist/theme-default.css";
import { Background } from "@vue-flow/background";
import { IconX } from "@tabler/icons-vue";
import type { CreationTemplate } from "@/lib/creationTemplates";
import { readTemplateProject } from "@/lib/projectTemplates";
import type { readCanvasFiles } from "@/pages/workspace/panels/canvas/canvasFiles";
import templatePreviewNode from "./templatePreviewNode.vue";
const props = defineProps<{ template: CreationTemplate }>();
const loading = ref(true), error = ref(""), canvasPath = ref(""), selectedId = ref("");
const inputId = useId(), flow = shallowRef<VueFlowStore>();
function fitView() { void flow.value?.fitView({ padding: .15 }); }
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
const nodes = computed(() => (canvas.value?.data.nodes ?? []).map(node => ({ id: node.id, position: node.position, parentNode: node.parentNode, selected: node.id === selectedId.value, data: { label: node.data?.label || node.id, text: nodeText(node), media: mediaUrls.value.get(node.id) ?? [] }, type: node.type === "group" ? "group" : "preview", style: node.type === "group" ? node.style : { width: "280px" } })));
const edges = computed(() => (canvas.value?.data.edges ?? []).map(edge => ({ id: edge.id, source: edge.source, target: edge.target, sourceHandle: "out", targetHandle: "in", label: typeof edge.label === "string" ? edge.label : undefined })));
const selectedNode = computed(() => canvas.value?.data.nodes.find(node => node.id === selectedId.value));
const incomingNodes = computed(() => { const ids = new Set(canvas.value?.data.edges.filter(edge => edge.target === selectedId.value).map(edge => edge.source)); return canvas.value?.data.nodes.filter(node => ids.has(node.id)) ?? []; });
const selectedParameters = computed(() => {
  const data = selectedNode.value?.data;
  const parameters = [{ key: "modelLabel", label: "生成模型" }, { key: "ratio", label: "比例" }, { key: "size", label: "尺寸" }, { key: "n", label: "数量" }, { key: "resolution", label: "清晰度" }, { key: "duration", label: "时长（秒）" }];
  return parameters.flatMap(parameter => data?.[parameter.key] !== undefined && data[parameter.key] !== "" ? [{ label: parameter.label, value: String(data[parameter.key]) }] : []);
});
watch(canvasPath, () => { selectedId.value = ""; });
watch(() => props.template, async (template, _previous, cleanup) => {
  let active = true; const releases: string[] = [];
  cleanup(() => { active = false; releases.forEach(url => URL.revokeObjectURL(url)); });
  loading.value = true; error.value = ""; selectedId.value = "";
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
    .projectNodeList { flex: 0 0 210px; padding: 12px; overflow-y: auto; border-right: 1px solid var(--el-border-color-light); background: #18191d; button { display: flex; width: 100%; gap: 10px; align-items: center; padding: 10px; border: 0; border-radius: 8px; background: transparent; color: inherit; font: inherit; cursor: pointer; text-align: left; &[aria-pressed="true"], &:hover { background: #30343d; } img, video { width: 36px; height: 36px; object-fit: cover; border-radius: 6px; } span { overflow-wrap: anywhere; } } }
    .vue-flow { flex: 1; min-width: 0; background: #202228; }
    .nodeDetails { flex: 0 0 clamp(240px, 26vw, 340px); padding: 16px; overflow: auto; border-left: 1px solid var(--el-border-color-light); box-sizing: border-box; header { display: flex; align-items: center; justify-content: space-between; gap: 8px; } h3 { margin: 0; } label { display: block; margin: 14px 0 8px; color: var(--el-text-color-secondary); } .inputReferences { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 16px; > span { flex-basis: 100%; color: var(--el-text-color-secondary); } .el-button { margin: 0; } } dl { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 12px; font-size: 12px; dt { color: var(--el-text-color-secondary); } dd { margin: 0; text-align: right; overflow-wrap: anywhere; } } img, video { width: 100%; max-height: 240px; object-fit: contain; } }
  }
  @media(max-width:900px) { .previewBody .projectNodeList { flex-basis: 150px; } }
  @media(max-width:700px) { .previewBody { position: relative; .projectNodeList { display: none; } .nodeDetails { position: absolute; z-index: 5; right: 0; top: 0; bottom: 0; width: min(80%, 300px); background: var(--el-bg-color); } } }
}
</style>
