<template>
  <input ref="uploadInput" type="file" multiple hidden aria-label="上传引用文件" @change="upload" @cancel="finish()" />
  <el-dialog v-model="visible" title="引用素材" width="min(900px, 94vw)" appendToBody destroyOnClose @close="closeDialog">
    <el-tabs v-model="scope" @tabChange="load().catch(showError)">
      <el-tab-pane label="个人资产库" name="personal"><assetLibrary v-if="scope === 'personal'" :modelValue="true" selectable @select="file => finish({ files: [file], sources: [] })" /></el-tab-pane>
      <el-tab-pane label="当前画布资产" name="canvas" />
      <el-tab-pane label="其他项目资产" name="projects" />
      <el-tab-pane label="自定义素材" name="custom"><el-button @click="openCustom">打开图片生成对话</el-button></el-tab-pane>
    </el-tabs>
    <el-select v-if="scope === 'projects'" v-model="selectedProject" aria-label="引用项目" @change="load().catch(showError)"><el-option v-for="project in otherProjects" :key="project.directory" :label="project.name" :value="project.directory" /></el-select>
    <div v-if="scope === 'canvas' || scope === 'projects'" class="referenceOutputs" v-loading="loading">
      <button v-for="item in items" :key="item.key" type="button" :disabled="loading" @click="choose(item)"><strong>{{ item.label }}</strong><span>{{ item.output.dataType }}</span><p v-if="item.output.dataType === 'STRING'">{{ item.output.value.slice(0, 180) }}</p></button>
    </div>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { materialEditorState } from "@/stores/materialEditor";
import { ElMessage } from "element-plus";
import { useWorkspaceStore } from "@/stores/workspace";
import useWorkspaceFiles from "@/lib/workspaceFiles";
import { isNodeOutput, type NodeOutput } from "@toonflow/nodes-scaffold/values";
import { readCanvasFiles } from "../canvasFiles";
import assetLibrary from "./assetLibrary.vue";
type Source = { source: string; sourceHandle: string };
type Choice = { files: File[]; sources: Source[] };
type Asset = { key: string; label: string; directory: string; source: string; sourceHandle: string; output: NodeOutput };
const props = defineProps<{ directory: string; nodes: () => { id: string; data: { label?: string; outputs?: Record<string, unknown> } }[] }>();
const store = useWorkspaceStore();
const visible = ref(false), scope = ref("personal"), loading = ref(false), selectedProject = ref("");
const customOpen = ref(false);
const materialOwner = Symbol("nodeMaterial");
const uploadInput = ref<HTMLInputElement>();
const items = ref<Asset[]>([]);
const otherProjects = computed(() => store.projectList.filter(project => project.directory !== props.directory));
let resolveChoice: ((value?: Choice) => void) | undefined;
let target: string | undefined;
let requestId = 0;
function open(nodeId?: string, initialScope = "local") {
  if (materialEditorState.value) { ElMessage.warning("请先完成或关闭自定义素材对话"); return Promise.resolve<Choice | undefined>(undefined); }
  finish(); customOpen.value = false; if (uploadInput.value) uploadInput.value.value = ""; target = nodeId; scope.value = initialScope; visible.value = true;
  const result = new Promise<Choice | undefined>(resolve => { resolveChoice = resolve; });
  if (initialScope === "local") { visible.value = false; customOpen.value = true; void Promise.resolve().then(() => uploadInput.value?.click()); }
  else void load().catch(showError);
  return result;
}
function closeDialog() { if (!customOpen.value) finish(); }
function finish(value?: Choice) { resolveChoice?.(value); resolveChoice = undefined; visible.value = false; }
function openCustom() {
  customOpen.value = true; visible.value = false;
  materialEditorState.value = { owner: materialOwner, source: "canvas", directory: props.directory, target: { role: "reference" }, label: "节点参考图", apply: file => finish({ files: [file], sources: [] }) };
}
watch(materialEditorState, (value, previous) => { if (previous?.owner === materialOwner && value?.owner !== materialOwner) { customOpen.value = false; finish(); } }, { flush: "sync" });
onBeforeUnmount(() => { if (materialEditorState.value?.owner === materialOwner) materialEditorState.value = undefined; finish(); });
function upload(event: Event) { const files = Array.from((event.target as HTMLInputElement).files ?? []); if (files.length) finish({ files, sources: [] }); }
function collect(nodes: ReturnType<typeof props.nodes>, directory: string, prefix = "") {
  return nodes.flatMap(node => node.id === target && directory === props.directory ? [] : Object.entries(node.data?.outputs ?? {}).flatMap(([handle, output]) => isNodeOutput(output) && ["STRING", "IMAGE", "VIDEO", "AUDIO", "FILE"].includes(output.dataType) ? [{ key: `${prefix}/${node.id}/${handle}`, directory, source: node.id, sourceHandle: handle, label: `${prefix ? `${prefix} · ` : ""}${node.data.label || node.id} · ${handle.startsWith("row:") && output.dataType === "STRING" ? output.value.split("\n")[0] : handle}`, output }] : []));
}
async function load() {
  const request = ++requestId;
  items.value = [];
  loading.value = false;
  if (scope.value === "custom") { openCustom(); return; }
  if (scope.value === "canvas") { items.value = collect(props.nodes(), props.directory); return; }
  if (scope.value !== "projects" || !selectedProject.value) return;
  loading.value = true;
  const directory = selectedProject.value;
  try {
    const files = useWorkspaceFiles(directory);
    const result: Asset[] = [];
    const canvases = await readCanvasFiles(files);
    for (const canvas of canvases) {
      if (request !== requestId) return;
      const nodes = await Promise.all(canvas.data.nodes.map(async node => {
        const data = { ...node.data, outputs: { ...node.data?.outputs } };
        if (node.type === "remote-textNode") {
          // 文字插件把正文保存在独立文件，画布 JSON 中的 outputs 有意为空。
          const text: string | undefined = typeof data.textPath === "string" ? await files.readText(data.textPath) : typeof data.textSnapshot === "string" ? data.textSnapshot : undefined;
          if (text !== undefined) data.outputs.text = { dataType: "STRING", value: text };
          if (data.contentKind === "script" && Array.isArray(data.scriptRows)) {
            const headers = text?.split("\n").find(line => line.trim().startsWith("|"))?.trim().replace(/^\||\|$/g, "").split("|").map(value => value.trim()) ?? [];
            for (const row of data.scriptRows) {
              if (!row || typeof row.id !== "string" || !Array.isArray(row.cells) || !row.cells.every((value: unknown) => typeof value === "string")) throw new Error("来源项目的分镜行格式无效");
              data.outputs[`row:${row.id}`] = { dataType: "STRING", value: row.cells.map((value: string, index: number) => `${headers[index] ?? index + 1}：${value}`).join("\n") };
            }
          }
        }
        return { ...node, data };
      }));
      result.push(...collect(nodes, directory, canvas.id));
    }
    if (request === requestId) items.value = result;
  } finally { if (request === requestId) loading.value = false; }
}
async function choose(item: Asset) {
  loading.value = true;
  try {
    if (scope.value === "canvas" && target) { finish({ files: [], sources: [{ source: item.source, sourceHandle: item.sourceHandle }] }); return; }
    const output = item.output;
    const file = output.dataType === "STRING" ? new File([output.value], `${item.label}.md`, { type: "text/markdown" }) : typeof output.value === "object" && output.value ? new File([await useWorkspaceFiles(item.directory).read(output.value.url)], output.value.url.split("/").at(-1)!, { type: output.value.mimeType }) : undefined;
    if (!file) throw new Error("该输出不能作为素材引用");
    finish({ files: [file], sources: [] });
  } catch (error) { showError(error); }
  finally { loading.value = false; }
}
function showError(error: unknown) { ElMessage.error(error instanceof Error ? error.message : "读取引用失败"); }
defineExpose({ open });
</script>

<style scoped lang="scss">
.referenceOutputs { max-height: 420px; overflow: auto; display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 8px; margin-top: 12px; button { padding: 12px; border: 1px solid var(--el-border-color); border-radius: 10px; text-align: left; background: var(--el-bg-color); color: var(--el-text-color-primary); cursor: pointer; span { margin-left: 8px; color: var(--el-text-color-secondary); } p { white-space: pre-wrap; } } }
</style>
