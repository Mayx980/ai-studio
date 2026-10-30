<template>
  <div class="scriptTable nodrag nopan nowheel" @keydown.stop @wheel.stop>
    <input ref="importInput" hidden type="file" accept=".txt,.md,.csv,.xlsx,.docx" @change="selectImport" />
    <div v-if="!contentOnly" class="tableActions"><el-button :disabled="disabled || importing" :loading="importing" @click="importInput?.click()">导入文档／表格</el-button><el-button :disabled="disabled" @click="addRow">添加镜头</el-button><el-button :disabled="!rows.length" @click="download">导出 Excel</el-button></div>
    <div class="tableScroll" @scroll="updateNodeInternals([nodeId])"><table><colgroup><col v-for="(header, column) in headers.slice(0, 10)" :key="header" :style="{ width: column < 4 ? '120px' : '380px' }" /><col style="width: 260px" /><col style="width: 420px" /></colgroup><thead><tr><th v-for="header in headers.slice(0, 10)" :key="header">{{ header }}</th><th>引用图片</th><th>提示词</th></tr></thead><tbody>
      <tr v-for="(row, index) in rows" :key="row.id" :data-row-id="row.id">
        <td v-for="(header, column) in headers.slice(0, 10)" :key="header"><handle v-if="column === 0 && !embedded" class="rowInput" :id="`rowIn:${row.id}`" type="target" :position="Position.Left" :connectable="!disabled" :isValidConnection="validateConnection" :title="`镜头${row.cells[0] || index + 1}：连接参考图片`" /><el-input :modelValue="row.cells[column]" type="textarea" :autosize="false" :disabled="disabled" :aria-label="`镜头${index + 1} ${header}`" @update:modelValue="value => { row.cells[column] = value; publish(); }" /><div v-if="column === 0" class="rowActions"><el-button text :disabled="disabled || index === 0" :aria-label="`上移镜头${index + 1}`" @click="move(index, -1)">↑</el-button><el-button text :disabled="disabled || index === rows.length - 1" :aria-label="`下移镜头${index + 1}`" @click="move(index, 1)">↓</el-button><el-button text :disabled="disabled" @click="copyRow(index)">复制</el-button><el-button text type="danger" :disabled="disabled" @click="removeRow(index)">删除</el-button></div></td>
        <td><div class="rowReferences"><scriptReferences :rowId="row.id" /></div></td>
        <td class="rowPrompts"><label v-for="(header, offset) in headers.slice(11)" :key="header">{{ header }}<el-input :modelValue="scriptCellValue(row.cells, 11 + offset)" type="textarea" :autosize="false" :disabled="disabled" :aria-label="`镜头${index + 1} ${header}`" @update:modelValue="value => { row.cells[11 + offset] = value; if (offset === 1) row.cells[10] = ''; publish(); }" /></label><handle v-if="!embedded" class="rowOutput" :id="`row:${row.id}`" type="source" :position="Position.Right" :connectable="!disabled" :isValidConnection="validateConnection" :title="`镜头${row.cells[0] || index + 1}：连接一个或多个下游节点`" /></td>
      </tr>
    </tbody></table></div>
    <el-dialog v-model="assignmentVisible" title="选择图片适用镜头" appendToBody width="min(720px, 92vw)" @close="cancelAssignment" @closed="openAssignment"><el-checkbox-group v-model="assignedRows"><el-checkbox v-for="(row, index) in rows" :key="row.id" :value="row.id">镜头 {{ row.cells[0] || index + 1 }} · {{ row.cells[4]?.slice(0, 60) }}</el-checkbox></el-checkbox-group><template #footer><el-button @click="assignmentVisible = false">取消</el-button><el-button type="primary" :disabled="!assignedRows.length || disabled" @click="applyAssignment">应用到所选镜头</el-button></template></el-dialog>
    <p v-if="!contentOnly && node.data.scriptImportActive?.name && node.data.scriptImportActive.name !== importRecord?.name">已应用的参考：{{ node.data.scriptImportActive.name }}</p>
    <p v-if="!contentOnly && importRecord">{{ importRecord.name }}：{{ importRecord.error || (importRecord.applied ? '已应用为创作参考' : '原文件已保留') }} <el-button text :disabled="importing" @click="retryImport">重新解析</el-button></p>
    <el-dialog v-model="importVisible" title="核对解析结果与列对应" appendToBody width="min(900px, 92vw)">
      <template v-if="candidate"><p>{{ importRecord?.name }} · {{ candidate.table ? `${candidate.table.length - 1} 个镜头` : '文档文字参考' }}</p>
      <div v-if="candidate.table" class="columnMapping"><label v-for="(header, i) in headers" :key="header">{{ header }}<el-select v-model="mapping[i]" :aria-label="header + '对应列'"><el-option label="不导入此列" :value="-1" /><el-option v-for="(column, index) in candidate.table[0]" :key="index" :label="column || `第${index + 1}列`" :value="index" /></el-select></label></div><pre class="importPreview">{{ candidate.text }}</pre></template>
      <template #footer><el-button @click="importVisible = false">取消</el-button><el-button type="primary" @click="applyImport">确认应用</el-button></template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import { scriptHeaders, scriptCellValue } from "./scriptColumns";
import { ElButton, ElInput, ElMessageBox, ElMessage, ElDialog, ElSelect, ElOption, ElCheckbox, ElCheckboxGroup } from "element-plus";
import { Handle, Position, useNode, useVueFlow } from "@vue-flow/core";
import { useNodeFiles } from "@toonflow/nodes-scaffold/workspaceFiles";
import { readScriptImport } from "./scriptImport";
import { scriptWorkbook } from "./scriptWorkbook";
import { getTargetValues } from "@toonflow/nodes-scaffold/nodeInputs";
import { validateConnection } from "@toonflow/nodes-scaffold/connection";
import type { NodeInputValue } from "@toonflow/nodes-scaffold/values";
import scriptReferences from "./scriptReferences.vue";
const props = defineProps<{ nodeId: string; disabled?: boolean; embedded?: boolean; contentOnly?: boolean }>();
const model = defineModel<string>({ required: true });
const rows = defineModel<{ id: string; cells: string[] }[]>("rows", { default: () => [] });
const headers = scriptHeaders;
const flow = useVueFlow();
const { getEdges, updateNodeInternals, addEdges, removeEdges } = flow;
const { node } = useNode();
const nodeFiles = useNodeFiles();
const assignmentVisible = ref(false), assignedRows = ref<string[]>([]), assignment = ref<NodeInputValue>();
const ignoredAssignments = new Set<string>();
const imageInputs = computed(() => getTargetValues(props.nodeId, "in", flow.getNodes.value, getEdges.value).filter(item => item.dataType === "IMAGE" && item.value));
const referenceKey = (item: NodeInputValue) => JSON.stringify([item.source, item.sourceHandle]);
function openAssignment() {
  if (props.embedded || assignmentVisible.value || !rows.value.length || props.disabled) return;
  const item = imageInputs.value.find(item => !ignoredAssignments.has(referenceKey(item)));
  if (!item) return;
  assignment.value = item; assignedRows.value = []; assignmentVisible.value = true;
}
watch([imageInputs, () => rows.value.length, () => props.disabled], openAssignment, { immediate: true, flush: "post" });
function cancelAssignment() { if (assignment.value) ignoredAssignments.add(referenceKey(assignment.value)); assignment.value = undefined; }
function applyAssignment() {
  const item = assignment.value;
  if (!item || props.disabled) return;
  const sourceNode = flow.findNode(item.source)!;
  const connections = assignedRows.value.map(id => ({ source: item.source, sourceHandle: item.sourceHandle, target: props.nodeId, targetHandle: `rowIn:${id}` })).filter(connection => !getEdges.value.some(edge => edge.source === connection.source && edge.sourceHandle === connection.sourceHandle && edge.target === connection.target && edge.targetHandle === connection.targetHandle));
  if (connections.some(connection => !validateConnection(connection, { sourceNode, targetNode: node, nodes: flow.getNodes.value, edges: getEdges.value }))) { ElMessage.error("无法连接所选镜头，请检查图片输出与节点连接"); return; }
  addEdges(connections.map(connection => ({ id: crypto.randomUUID(), ...connection })));
  removeEdges(edges => edges.filter(edge => edge.target === props.nodeId && edge.targetHandle === "in" && edge.source === item.source && edge.sourceHandle === item.sourceHandle));
  assignment.value = undefined; assignmentVisible.value = false;
}
const importInput = ref<HTMLInputElement>();
const importing = ref(false), importVisible = ref(false);
const candidate = ref<Awaited<ReturnType<typeof readScriptImport>>>();
const mapping = ref<number[]>([]);
type ImportRecord = { name: string; path: string; text?: string; applied: boolean; error?: string };
const importRecord = ref<ImportRecord>(node.data.scriptImport);
node.data.scriptImportPending = false;
async function selectImport(event: Event) {
  const input = event.target as HTMLInputElement, file = input.files?.[0]; input.value = "";
  if (!file) return;
  importing.value = true; node.data.scriptImportPending = true;
  try { if (importRecord.value?.applied) node.data.scriptImportActive = JSON.parse(JSON.stringify(importRecord.value)); const path = await nodeFiles.uploadFile(props.nodeId, file); importRecord.value = { name: file.name, path, applied: false }; node.data.scriptImport = importRecord.value; await parseImport(file); }
  catch (error) { ElMessage.error(error instanceof Error ? error.message : "文件保存失败"); }
  finally { importing.value = false; node.data.scriptImportPending = false; }
}
async function parseImport(file: File) {
  try {
    const parsed = await readScriptImport(file);
    if (!parsed.text.trim()) throw new Error("未解析到有效内容");
    if (parsed.table && (parsed.table.length < 2 || parsed.table.length > 1001)) throw new Error("表格须包含表头和 1～1000 行镜头");
    candidate.value = parsed; mapping.value = headers.map(header => parsed.table?.[0]?.indexOf(header) ?? -1);
    importRecord.value!.error = undefined; importRecord.value!.text = parsed.text; importVisible.value = true;
  } catch (error) { importRecord.value!.error = error instanceof Error ? error.message : "解析失败"; ElMessage.error(importRecord.value!.error); }
}
async function retryImport() {
  if (!importRecord.value) return;
  importing.value = true; node.data.scriptImportPending = true;
  try { await parseImport(new File([await nodeFiles.getWorkspaceFiles().read(importRecord.value.path)], importRecord.value.name)); }
  catch (error) { ElMessage.error(error instanceof Error ? error.message : "文件读取失败"); }
  finally { importing.value = false; node.data.scriptImportPending = false; }
}
async function applyImport() {
  if (!candidate.value || !importRecord.value) return;
  if (candidate.value.table) {
    if (mapping.value.every(index => index < 0)) { ElMessage.warning("请至少指定一个对应列"); return; }
    if (rows.value.length && !await ElMessageBox.confirm("应用会替换当前分镜及行连线，下游结果保留。当前表格会备份。", "确认替换", { confirmButtonText: "替换", cancelButtonText: "保留" }).then(() => true, () => false)) return;
    try { if (rows.value.length) await nodeFiles.getWorkspaceFiles().writeJson(`assets/${props.nodeId}/scriptBackup${Date.now()}.json`, { rows: rows.value, text: model.value }, true); }
    catch (error) { ElMessage.error(error instanceof Error ? error.message : "备份失败，未替换"); return; }
    rows.value = candidate.value.table.slice(1).map(values => ({ id: crypto.randomUUID(), cells: headers.map((_, index) => values[mapping.value[index] ?? -1] ?? "") })); publish();
  }
  importRecord.value.applied = true; node.data.scriptImportActive = importRecord.value; importVisible.value = false;
}
let published = "";
let initial = true;
function publish() {
  published = `| ${headers.join(" | ")} |\n| ${headers.map(() => "---").join(" | ")} |\n${rows.value.map(row => `| ${headers.map((_, index) => scriptCellValue(row.cells, index).replaceAll("|", "&#124;").replaceAll("\n", "<br>")).join(" | ")} |`).join("\n")}`;
  model.value = published;
}
watch(model, text => {
  if (initial && rows.value.length) { initial = false; published = text; return; }
  initial = false;
  if (text === published) return;
  const lines = text.split("\n").filter(line => line.trim().startsWith("|"));
  const cells = (line: string) => line.trim().replace(/^\||\|$/g, "").split("|").map(value => value.trim().replaceAll("<br>", "\n").replaceAll("&#124;", "|"));
  if (lines.length > 1 && cells(lines[0]!).includes("镜头号")) {
    const columns = cells(lines[0]!);
    const next = lines.slice(2).map(line => { const values = cells(line); return headers.map(header => values[columns.indexOf(header)] ?? ""); });
    if (JSON.stringify(next) !== JSON.stringify(rows.value.map(row => row.cells))) rows.value = next.map(cells => ({ id: crypto.randomUUID(), cells }));
  } else if (text.trim() && !rows.value.length) rows.value = [{ id: crypto.randomUUID(), cells: headers.map((_, index) => index === 4 ? text : index === 0 ? "1" : "") }];
  published = text;
}, { immediate: true });
watch(rows, async () => { await nextTick(); updateNodeInternals([props.nodeId]); }, { deep: true, flush: "post" });
function addRow() { rows.value.push({ id: crypto.randomUUID(), cells: headers.map((_, i) => i === 0 ? String(rows.value.length + 1) : "") }); publish(); }
function copyRow(index: number) { rows.value.splice(index + 1, 0, { id: crypto.randomUUID(), cells: [...rows.value[index]!.cells] }); publish(); }
function move(index: number, direction: number) { const [row] = rows.value.splice(index, 1); rows.value.splice(index + direction, 0, row!); publish(); }
async function removeRow(index: number) {
  const row = rows.value[index]!;
  const count = getEdges.value.filter(edge => edge.source === props.nodeId && edge.sourceHandle === `row:${row.id}` || edge.target === props.nodeId && edge.targetHandle === `rowIn:${row.id}`).length;
  if (!await ElMessageBox.confirm(count ? `删除会移除该镜头的 ${count} 条引用连线，下游节点和素材保留。` : "删除这个镜头？", "删除镜头", { confirmButtonText: "删除", cancelButtonText: "取消", type: "warning" }).then(() => true, () => false)) return;
  removeEdges(edges => edges.filter(edge => edge.source === props.nodeId && edge.sourceHandle === `row:${row.id}` || edge.target === props.nodeId && edge.targetHandle === `rowIn:${row.id}`));
  rows.value.splice(index, 1); publish();
}
defineExpose({ chooseImport: () => importInput.value?.click() });
function download() {
  const url = URL.createObjectURL(scriptWorkbook([...headers, "引用图片"], rows.value.map(row => [...headers.map((_, index) => scriptCellValue(row.cells, index)), getTargetValues(props.nodeId, `rowIn:${row.id}`, flow.getNodes.value, getEdges.value).flatMap(item => item.dataType === "IMAGE" && item.value ? [item.value.url] : []).join("\n")])));
  const anchor = document.createElement("a"); anchor.href = url; anchor.download = "分镜脚本.xlsx"; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
</script>

<style scoped lang="scss">
.scriptTable {
  width: 100%;
  .tableActions { display: flex; gap: 8px; margin-bottom: 8px; }
  .tableScroll { overflow: visible; }
  table { border-collapse: collapse; table-layout: fixed; width: 100%; min-width: 3400px; }
  th, td { position: relative; border: 1px solid var(--el-border-color); padding: 6px; vertical-align: top; height: 248px; }
  th { height: auto; background: var(--el-fill-color); }
  td :deep(.el-textarea__inner) { height: 224px; min-height: 224px; resize: none; overflow-y: auto; }
  td:first-child { padding-left: 14px; :deep(.el-textarea__inner) { height: 148px; min-height: 148px; } }
  .rowPrompts :deep(.el-textarea__inner) { height: 48px; min-height: 48px; }

  .rowInput, .rowOutput { width: 14px; height: 14px; background: var(--el-color-primary); border: 2px solid var(--el-bg-color); z-index: 4; }
  .rowInput { left: -6px; }
  .rowOutput { right: -6px; }
  .rowReferences { height: 224px; overflow: auto; }
  .rowPrompts { label { display: block; margin-bottom: 8px; } }
  .rowActions { font-size: 12px; .el-button { margin: 0 4px 4px 0; } }
  .columnMapping { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; label { min-width: 0; } }
  .importPreview { max-height: 300px; overflow: auto; white-space: pre-wrap; }
}
</style>
