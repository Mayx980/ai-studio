<template>
  <div class="scriptTable nodrag nopan nowheel" @keydown.stop @wheel.stop>
    <input ref="importInput" hidden type="file" accept=".txt,.md,.csv,.xlsx,.docx" @change="selectImport" />
    <div class="tableActions"><el-button :disabled="disabled || importing" :loading="importing" @click="importInput?.click()">导入文档／表格</el-button><el-button :disabled="disabled" @click="addRow">添加镜头</el-button><el-button :disabled="!rows.length" @click="download">导出 Excel</el-button></div>
    <div class="tableScroll" @scroll="updateNodeInternals([nodeId])"><table><thead><tr><th v-for="header in headers.slice(0, 10)" :key="header">{{ header }}</th><th>操作／行输出</th></tr></thead><tbody>
      <tr v-for="(row, index) in rows" :key="row.id" :data-row-id="row.id">
        <td v-for="(header, column) in headers.slice(0, 10)" :key="header"><el-input v-model="row.cells[column]" type="textarea" :autosize="{ minRows: 1 }" :disabled="disabled" :aria-label="`镜头${index + 1} ${header}`" @input="publish" /></td>
        <td class="rowActions"><el-button text :disabled="disabled" @click="roleRow = row">角色详情</el-button><el-button text :disabled="disabled || index === 0" :aria-label="`上移镜头${index + 1}`" @click="move(index, -1)">↑</el-button><el-button text :disabled="disabled || index === rows.length - 1" :aria-label="`下移镜头${index + 1}`" @click="move(index, 1)">↓</el-button><el-button text :disabled="disabled" @click="copyRow(index)">复制</el-button><el-button text type="danger" :disabled="disabled" @click="removeRow(index)">删除</el-button><span>镜头 {{ row.cells[0] || index + 1 }} 输出 <handle class="scriptRowHandle" :id="`row:${row.id}`" type="source" :position="Position.Right" :connectable="!disabled" /></span></td>
      </tr>
    </tbody></table></div>
    <p v-if="node.data.scriptImportActive?.name && node.data.scriptImportActive.name !== importRecord?.name">已应用的参考：{{ node.data.scriptImportActive.name }}</p>
    <p v-if="importRecord">{{ importRecord.name }}：{{ importRecord.error || (importRecord.applied ? '已应用为创作参考' : '原文件已保留') }} <el-button text :disabled="importing" @click="retryImport">重新解析</el-button></p>
    <el-dialog :modelValue="!!roleRow" title="角色形象描述" appendToBody width="min(600px, 90vw)" @close="roleRow = undefined"><p>姓名、性格与背景请保留在描述中。当前文本模型不提供图片识别，角色图片不能自动改写此内容。</p><el-input v-if="roleRow" v-model="roleRow.cells[10]" type="textarea" :autosize="{ minRows: 4 }" :disabled="disabled" aria-label="角色形象描述" @input="publish" /></el-dialog>
    <el-dialog v-model="importVisible" title="核对解析结果与列对应" appendToBody width="min(900px, 92vw)">
      <template v-if="candidate"><p>{{ importRecord?.name }} · {{ candidate.table ? `${candidate.table.length - 1} 个镜头` : '文档文字参考' }}</p>
      <div v-if="candidate.table" class="columnMapping"><label v-for="(header, i) in headers" :key="header">{{ header }}<el-select v-model="mapping[i]" :aria-label="header + '对应列'"><el-option label="不导入此列" :value="-1" /><el-option v-for="(column, index) in candidate.table[0]" :key="index" :label="column || `第${index + 1}列`" :value="index" /></el-select></label></div><pre class="importPreview">{{ candidate.text }}</pre></template>
      <template #footer><el-button @click="importVisible = false">取消</el-button><el-button type="primary" @click="applyImport">确认应用</el-button></template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import { ElButton, ElInput, ElMessageBox, ElMessage, ElDialog, ElSelect, ElOption } from "element-plus";
import { Handle, Position, useNode, useVueFlow } from "@vue-flow/core";
import { useNodeFiles } from "@toonflow/nodes-scaffold/workspaceFiles";
import { readScriptImport } from "./scriptImport";
import { scriptWorkbook } from "./scriptWorkbook";
const props = defineProps<{ nodeId: string; disabled?: boolean }>();
const model = defineModel<string>({ required: true });
const rows = defineModel<{ id: string; cells: string[] }[]>("rows", { default: () => [] });
const headers = ["镜头号", "时长", "景别", "运镜方式", "画面", "台词/音效", "角色表情反应", "环境场景", "分镜图提示词", "视频运动提示词", "角色形象描述"];
const { getEdges, updateNodeInternals } = useVueFlow();
const { node } = useNode();
const nodeFiles = useNodeFiles();
const importInput = ref<HTMLInputElement>();
const importing = ref(false), importVisible = ref(false);
const candidate = ref<Awaited<ReturnType<typeof readScriptImport>>>();
const mapping = ref<number[]>([]);
const roleRow = ref<{ id: string; cells: string[] }>();
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
  published = `| ${headers.join(" | ")} |\n| ${headers.map(() => "---").join(" | ")} |\n${rows.value.map(row => `| ${row.cells.map(value => value.replaceAll("|", "&#124;").replaceAll("\n", "<br>")).join(" | ")} |`).join("\n")}`;
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
    rows.value = lines.slice(2).map(line => { const values = cells(line); return { id: crypto.randomUUID(), cells: headers.map(header => values[columns.indexOf(header)] ?? "") }; });
  } else if (text.trim() && !rows.value.length) rows.value = [{ id: crypto.randomUUID(), cells: headers.map((_, index) => index === 4 ? text : index === 0 ? "1" : "") }];
  published = text;
}, { immediate: true });
function addRow() { rows.value.push({ id: crypto.randomUUID(), cells: headers.map((_, i) => i === 0 ? String(rows.value.length + 1) : "") }); publish(); }
function copyRow(index: number) { rows.value.splice(index + 1, 0, { id: crypto.randomUUID(), cells: [...rows.value[index]!.cells] }); publish(); }
function move(index: number, direction: number) { const [row] = rows.value.splice(index, 1); rows.value.splice(index + direction, 0, row!); publish(); }
async function removeRow(index: number) {
  const row = rows.value[index]!;
  const count = getEdges.value.filter(edge => edge.source === props.nodeId && edge.sourceHandle === `row:${row.id}`).length;
  if (!await ElMessageBox.confirm(count ? `删除会移除该镜头的 ${count} 条引用连线，下游节点和素材保留。` : "删除这个镜头？", "删除镜头", { confirmButtonText: "删除", cancelButtonText: "取消", type: "warning" }).then(() => true, () => false)) return;
  rows.value.splice(index, 1); publish();
}
defineExpose({ chooseImport: () => importInput.value?.click() });
function download() {
  const url = URL.createObjectURL(scriptWorkbook(headers, rows.value.map(row => row.cells)));
  const anchor = document.createElement("a"); anchor.href = url; anchor.download = "分镜脚本.xlsx"; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
</script>

<style scoped lang="scss">
.scriptTable { .columnMapping { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; label { min-width: 0; } } .importPreview { max-height: 300px; overflow: auto; white-space: pre-wrap; } width: min(1100px, 82vw); .tableActions { display: flex; gap: 8px; margin-bottom: 8px; } .tableScroll { max-height: 520px; overflow: auto; } table { border-collapse: collapse; table-layout: fixed; width: 2050px; } th, td { border: 1px solid var(--el-border-color); padding: 5px; width: 155px; vertical-align: top; } th:first-child, td:first-child { width: 70px; } th { position: sticky; top: 0; background: var(--el-fill-color); z-index: 1; } .rowActions { width: 130px; font-size: 12px; span { display: block; } } }
</style>

<style scoped>
.scriptRowHandle { position: relative; inset: auto; transform: none; display: inline-block; width: 12px; height: 12px; background: var(--el-color-primary); border: 1px solid var(--el-bg-color); }
</style>
