<template>
  <div class="scriptTable nodrag nopan nowheel" @keydown.stop @wheel.stop>
    <div class="tableActions"><el-button :disabled="disabled" @click="addRow">添加镜头</el-button><el-button :disabled="!rows.length" @click="download">导出 Excel</el-button></div>
    <div class="tableScroll"><table><thead><tr><th v-for="header in headers" :key="header">{{ header }}</th><th>操作／行输出</th></tr></thead><tbody>
      <tr v-for="(row, index) in rows" :key="row.id" :data-row-id="row.id">
        <td v-for="(header, column) in headers" :key="header"><el-input v-model="row.cells[column]" type="textarea" :autosize="{ minRows: 1 }" :disabled="disabled" :aria-label="`镜头${index + 1} ${header}`" @change="publish" /></td>
        <td class="rowActions"><el-button text :disabled="disabled || index === 0" :aria-label="`上移镜头${index + 1}`" @click="move(index, -1)">↑</el-button><el-button text :disabled="disabled || index === rows.length - 1" :aria-label="`下移镜头${index + 1}`" @click="move(index, 1)">↓</el-button><el-button text :disabled="disabled" @click="copyRow(index)">复制</el-button><el-button text type="danger" :disabled="disabled" @click="removeRow(index)">删除</el-button><span>右侧出口：{{ row.cells[0] || index + 1 }}</span></td>
      </tr>
    </tbody></table></div>
  </div>
</template>

<script setup lang="ts">
import { watch } from "vue";
import { ElButton, ElInput, ElMessageBox } from "element-plus";
import { useVueFlow } from "@vue-flow/core";
import { scriptWorkbook } from "./scriptWorkbook";
const props = defineProps<{ nodeId: string; disabled?: boolean }>();
const model = defineModel<string>({ required: true });
const rows = defineModel<{ id: string; cells: string[] }[]>("rows", { default: () => [] });
const headers = ["镜头号", "时长", "景别", "运镜方式", "画面", "台词/音效", "角色表情反应", "环境场景", "分镜图提示词", "视频运动提示词", "角色形象描述"];
const { getEdges } = useVueFlow();
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
function download() {
  const url = URL.createObjectURL(scriptWorkbook(headers, rows.value.map(row => row.cells)));
  const anchor = document.createElement("a"); anchor.href = url; anchor.download = "分镜脚本.xlsx"; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
</script>

<style scoped lang="scss">
.scriptTable { width: min(1100px, 82vw); .tableActions { display: flex; gap: 8px; margin-bottom: 8px; } .tableScroll { max-height: 520px; overflow: auto; } table { border-collapse: collapse; table-layout: fixed; width: 2050px; } th, td { border: 1px solid var(--el-border-color); padding: 5px; width: 155px; vertical-align: top; } th:first-child, td:first-child { width: 70px; } th { position: sticky; top: 0; background: var(--el-fill-color); z-index: 1; } .rowActions { width: 130px; font-size: 12px; span { display: block; } } }
</style>
