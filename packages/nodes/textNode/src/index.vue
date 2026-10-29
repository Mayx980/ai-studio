<template>
  <nodeSkeleton
    v-bind="nodeProps"
    :icon="isScript ? IconMovie : IconFileText"
    :hiddenHandles="isScript ? scriptRows.flatMap(row => [`row:${row.id}`, `rowIn:${row.id}`]) : []"
    :style="isScript ? { width: '2600px' } : undefined"
    v-model:bottomVisible="node.selected"
    :topVisible="node.selected"
    topWidth="max-content"
    :downloadUrl="downloadUrl"
    :downloadName="`${nodeProps.label || '文本'}.md`"
    :bottomWidth="660"
    @fullscreen="fullscreen = true; editing = true">
    <div class="textContent" @click="openScript" :class="{ empty: !isScript && !outputs.text.value.trim() }">
      <el-alert v-if="documentState.error" :title="documentState.error" type="error" :closable="false" showIcon>
        <el-button text size="small" :disabled="generating || textReloading" @click="editing = true">查看并复制当前正文</el-button>
        <el-button text size="small" :disabled="generating" :loading="textReloading" @click="reloadText">重新读取磁盘</el-button>
      </el-alert>
      <span v-if="isScript && textReady" class="scriptSaveStatus" role="status">{{ documentState.error ? '保存失败，内容已保留' : documentState.dirty ? '正在保存…' : '已保存' }}</span>
      <scriptTable ref="scriptTableRef" v-if="isScript && textReady" v-model="outputs.text.value" v-model:rows="scriptRows" :nodeId="node.id" :disabled="generating || !!documentState.error" />
      <div v-else-if="outputs.text.value.trim() && previewReady" class="textPreview nopan nowheel" :aria-label="isScript ? '脚本与分镜内容' : '文本内容'">
        <markdownPreview :modelValue="outputs.text.value" :files="textReady ? textFiles : undefined" :path="textPath" :active="previewReady" />
      </div>
      <el-button v-if="!isScript" class="editButton nodrag nopan" :icon="IconEdit" :disabled="generating || !textReady" text @dblclick.stop @click.stop="editing = true">{{ isScript ? "编辑脚本" : "编辑" }}</el-button>
    </div>
    <template #bottom>
      <el-card class="promptCard" shadow="never" :bodyStyle="{ padding: '14px 16px 12px' }">
        <div class="promptHeader" v-if="refList.length">
          <referenceItem
            v-model="refList"
            @preview="setReferencePreview"
            @remove="removeReference" />
        </div>
        <promptInput v-model="promptModel" v-model:text="prompt" :references="referenceMentions" :placeholder="isScript ? '描述视频脚本或分镜文案的创作要求' : undefined" />
        <div class="promptFooter">
          <el-select v-model="model" class="modelSelect" filterable :loading="modelsLoading" :disabled="generating" placeholder="选择模型" aria-label="生成模型" noDataText="请先在设置中添加模型" placement="top-start" @visible-change="visible => visible && loadModels()">
            <template #prefix><icon-sparkles :size="17" /></template>
            <el-option-group v-for="provider in modelGroups" :key="provider.id" :label="provider.label">
              <el-option v-for="item in provider.models" :key="item.modelId" :label="item.label" :value="JSON.stringify([item.providerId, item.modelId])" />
            </el-option-group>
          </el-select>
          <div class="promptActions"><el-button v-if="isScript" text :disabled="generating || data.scriptImportPending" @click="scriptTableRef?.chooseImport()">上传文档／表格</el-button>
            <el-button class="sendButton" :icon="IconArrowUp" :loading="generating" :disabled="(!prompt.trim() && !hasScriptReferences) || !selectedModel || generating || data.scriptImportPending || !textReady" title="生成" aria-label="生成" @click="generateText" />
          </div>
        </div>
      </el-card>
    </template>
  </nodeSkeleton>
  <el-dialog v-model="editing" :title="isScript ? '编辑脚本／分镜文案' : '编辑文本'" width="min(860px, calc(100vw - 32px))" :fullscreen="fullscreen" alignCenter appendToBody @closed="fullscreen = false">
    <div class="textEditor" :class="{ fullscreen }">
      <scriptTable v-if="isScript" v-model="outputs.text.value" v-model:rows="scriptRows" :nodeId="node.id" embedded :disabled="generating || !!documentState.error" />
      <markdownEditor v-else v-model="outputs.text.value" :files="textReady ? textFiles : undefined" :path="textPath" :active="editing" :disabled="generating || textReloading" :readonly="!!documentState.error" :ariaLabel="isScript ? '编辑脚本与分镜内容' : '编辑文本内容'" />
    </div>
  </el-dialog>
</template>

<script setup lang="ts">
import { scriptHeaders, scriptGenerationInstruction } from "./scriptColumns";
import { computed, inject, onMounted, onScopeDispose, ref, watch } from "vue";
import { ElAlert, ElButton, ElCard, ElSelect, ElDialog, ElOption, ElOptionGroup, ElMessage, ElMessageBox } from "element-plus";
import { IconEdit, IconFileText, IconMovie, IconSparkles, IconArrowUp } from "@tabler/icons-vue";
import { nodeSkeleton, nodeTools, useNode, z, type NodeAiModel, type NodeHandle } from "@toonflow/nodes-scaffold/runtime";
import { groupNodeModels } from "@toonflow/node-shared/groupNodeModels";
import { useNodeReferences } from "@toonflow/node-shared/useNodeReferences";
import scriptTable from "./scriptTable.vue";
import type { NodeOutput } from "@toonflow/nodes-scaffold/values";
import markdownEditor from "./markdownEditor.vue";
import markdownPreview from "./markdownPreview.vue";
import referenceItem from "@toonflow/node-shared/referenceItem";
import promptInput from "@toonflow/node-shared/promptInput";
import { useNodeDocumentState, type NodeDocumentContext } from "@toonflow/nodes-scaffold/nodeDocument";
import { useVueFlow } from "@vue-flow/core";
import { getTargetValues } from "@toonflow/nodes-scaffold/nodeInputs";

type PromptModel = NonNullable<InstanceType<typeof promptInput>["$props"]["modelValue"]>;

defineOptions({
  inheritAttrs: false,
  icon: IconFileText,
  handles: [
    { id: "in", type: "target", dataType: ["VIDEO", "IMAGE", "STRING", "FILE"], label: "视频、图片、文本、文件输入" },
    { id: "text", type: "source", dataType: "STRING", label: "文本输出" },
  ] satisfies NodeHandle[],
});
const { node, nodeProps, outputs, handles, ai, files, nodeEvent, previewReady } = useNode({
  label: "文本",
  outputs: { text: { dataType: "STRING", value: "" } },
});
const { refList, referenceMentions, setReferencePreview, removeReference } = useNodeReferences();
const scriptTableRef = ref<InstanceType<typeof scriptTable>>();
const editing = ref(false);
const fullscreen = ref(false);
function openScript(event: MouseEvent) {
  if (!isScript.value || (event.target as Element).closest("button, input, textarea, .el-input, .el-image, .vue-flow__handle")) return;
  fullscreen.value = true; editing.value = true;
}
const downloadUrl = ref("");
const documentContext = inject<NodeDocumentContext | undefined>("nodeDocument", undefined);
watch([() => outputs.value.text.value, () => node.selected || !!documentContext?.targets.has(node.id)], ([text, visible], _previous, onCleanup) => {
  downloadUrl.value = "";
  if (!visible || !text.trim()) return;
  const url = URL.createObjectURL(new Blob([text], { type: "text/markdown;charset=utf-8" }));
  downloadUrl.value = url;
  onCleanup(() => URL.revokeObjectURL(url));
}, { immediate: true });
const data = computed(() => node.data as typeof node.data & { prompt?: string; promptModel?: PromptModel; model?: string; textPath?: string; textSnapshot?: string; contentKind?: string; scriptReferenceVersions?: Record<string, string | undefined>; scriptImport?: { applied: boolean; text?: string; error?: string }; scriptImportActive?: { applied: boolean; text?: string; error?: string }; scriptImportPending?: boolean; scriptRows?: { id: string; cells: string[] }[] });
const importedReference = computed(() => data.value.scriptImportActive ?? data.value.scriptImport);
const isScript = computed(() => data.value.contentKind === "script");
if (isScript.value && !Array.isArray(data.value.scriptRows)) data.value.scriptRows = [];
const scriptRows = computed({ get: () => data.value.scriptRows ?? [], set: (value: { id: string; cells: string[] }[]) => { data.value.scriptRows = value; } });
const flow = useVueFlow();
const rowReferences = computed(() => Object.fromEntries(scriptRows.value.map(row => [row.id, getTargetValues(node.id, `rowIn:${row.id}`, flow.getNodes.value, flow.getEdges.value)])));
watch(scriptRows, rows => {
  if (!isScript.value) return;
  handles.value = [handles.value.find(handle => handle.id === "in" && handle.type === "target")!, { id: "text", type: "source", dataType: "STRING", label: "完整分镜表" }, ...rows.flatMap(row => [{ id: `rowIn:${row.id}`, type: "target" as const, dataType: "IMAGE", label: `镜头 ${row.cells[0] || "未编号"} 图片引用` }, { id: `row:${row.id}`, type: "source" as const, dataType: "STRING", label: `镜头 ${row.cells[0] || "未编号"}` }])];
}, { deep: true, immediate: true });
watch([scriptRows, rowReferences], ([rows, references]) => {
  if (!isScript.value) return;
  const values = outputs.value as Record<string, NodeOutput>;
  for (const key of Object.keys(values)) if (key.startsWith("row:")) delete values[key];
  for (const row of rows) values[`row:${row.id}`] = { dataType: "STRING", value: [...scriptHeaders.map((header, index) => `${header}：${row.cells[index] ?? ""}`), ...references[row.id]!.map(item => `参考图片：${item.dataType === "IMAGE" && item.value ? item.value.url : "尚未生成"}`)].join("\n") };
}, { deep: true, immediate: true });
const prompt = computed({ get: () => data.value.prompt ?? "", set: (value: string) => { data.value.prompt = value; } });
const model = computed({ get: () => data.value.model ?? "", set: (value: string) => { data.value.model = value; } });
const models = ref<NodeAiModel[]>([]);
const modelsLoading = ref(false);
const generating = ref(false);
const hasScriptReferences = computed(() => isScript.value && !data.value.scriptImportPending && (!!(importedReference.value?.applied && !importedReference.value.error && importedReference.value.text?.trim()) || refList.value.some(item => item.dataType === "STRING" && typeof item.value === "string" && !!item.value.trim())));
const selectedModel = computed(() => models.value.find(item => JSON.stringify([item.providerId, item.modelId]) === model.value));
const modelGroups = computed(() => groupNodeModels(models.value));
const textReady = ref(false);
const textReloading = ref(false);
const textPath = `assets/${node.id}/content.md`;
let textFiles: ReturnType<typeof files.getWorkspaceFiles>;
let textLoading: Promise<void> | undefined;
let textSaving = Promise.resolve();
let textSnapshot: Awaited<ReturnType<typeof textFiles.readTextSnapshot>> | undefined;
let textRevision = 0;
const documentState = useNodeDocumentState();
function saveText(value: string) {
  const revision = ++textRevision;
  documentState.dirty = true;
  textSaving = textSaving.catch(() => {}).then(async () => {
    if (!textSnapshot) throw new Error("文本尚未加载，无法保存");
    textSnapshot.revision = await textFiles.writeTextSnapshot(textPath, value, textSnapshot);
    textSnapshot.text = value;
    if (revision === textRevision && outputs.value.text.value === value) {
      documentState.dirty = false;
      documentState.error = "";
    }
  }).catch(error => {
    documentState.error = (error as { response?: { data?: { message?: string } } })?.response?.data?.message
      || (error instanceof Error ? error.message : "文本保存失败");
    throw error;
  });
  return textSaving;
}
nodeEvent.on("save", async (reason) => {
  await textLoading;
  if (!textReady.value) throw new Error("文本尚未加载，无法保存");
  if (reason === "reload" && generating.value) throw new Error("文本正在生成，请完成后再刷新节点");
  // 普通编辑已由 watcher 入队；生成中补存当前片段，不因画布保存重复写未改动的文本。
  if (generating.value) saveText(outputs.value.text.value);
  let pending: Promise<void>;
  do {
    pending = textSaving;
    try { await pending; }
    catch { await saveText(outputs.value.text.value); }
  } while (pending !== textSaving);
  if (reason === "reload" && generating.value) throw new Error("文本正在生成，请完成后再刷新节点");
});
onMounted(() => { textLoading = loadText(); });
async function loadText(fromDisk = false) {
  textReloading.value = true;
  textReady.value = false;
  try {
    if (!node.id || /[\\/]/.test(node.id) || node.id === "." || node.id === "..") throw new Error("节点 ID 不能作为文件夹名称");
    if (data.value.textPath !== undefined && data.value.textPath !== textPath) throw new Error("文本文件路径无效");
    textFiles = files.getWorkspaceFiles();
    if (data.value.textPath || fromDisk) textSnapshot = await textFiles.readTextSnapshot(textPath);
    const value = fromDisk ? textSnapshot!.text : data.value.textSnapshot !== undefined ? data.value.textSnapshot : textSnapshot?.text ?? outputs.value.text.value;
    if (typeof value !== "string") throw new Error("文本内容无效");
    if (!data.value.textPath && !fromDisk) {
      for (const directory of ["assets", `assets/${node.id}`]) {
        await textFiles.mkdir(directory).catch((error: { response?: { data?: { data?: { code?: string } } } }) => {
          if (error.response?.data?.data?.code !== "EEXIST") throw error;
        });
      }
      await textFiles.write(textPath, value, true).catch((error: { response?: { data?: { data?: { code?: string } } } }) => {
        if (error.response?.data?.data?.code !== "EEXIST") throw error;
      });
      textSnapshot = await textFiles.readTextSnapshot(textPath);
      if (textSnapshot.text !== value) throw new Error("文本文件已被其他编辑器修改，请重新加载节点");
    } else if (textSnapshot && textSnapshot.text !== value) {
      textSnapshot.revision = await textFiles.writeTextSnapshot(textPath, value, textSnapshot);
      textSnapshot.text = value;
    }
    outputs.value.text.value = value;
    data.value.textPath = textPath;
    delete data.value.textSnapshot;
    // ACT: 成功落盘后才排除内联正文；迁移失败时画布仍保留原内容。
    if (!Object.hasOwn(outputs.value, "toJSON")) Object.defineProperty(outputs.value, "toJSON", { value: () => ({}) });
    textSaving = Promise.resolve();
    textReady.value = true;
    documentState.dirty = false;
    documentState.error = "";
  } catch (error) {
    documentState.error = (error as { response?: { data?: { message?: string } } })?.response?.data?.message
      || (error instanceof Error ? error.message : "文本加载失败");
    ElMessage.error(documentState.error);
  } finally { textReloading.value = false; }
}

async function reloadText() {
  if (generating.value || textReloading.value) return;
  const confirmed = await ElMessageBox.confirm("重新读取将用磁盘内容替换当前正文。未保存的修改会被放弃，请先复制需要保留的内容。", "重新读取文本", {
    confirmButtonText: "重新读取", cancelButtonText: "取消", type: "warning", closeOnClickModal: false,
  }).then(() => true, () => false);
  if (!confirmed || generating.value || textReloading.value) return;
  const fromDisk = textReady.value || !!textSnapshot || !!data.value.textPath;
  textReloading.value = true;
  textReady.value = false;
  await textSaving.catch(() => {});
  textLoading = loadText(fromDisk);
  await textLoading;
}

watch(() => outputs.value.text.value, async (value) => {
  if (!textReady.value) return;
  documentState.dirty = true;
  if (generating.value) return;
  try { await saveText(value); }
  catch (error) { ElMessage.error(error instanceof Error ? error.message : "文本保存失败"); }
}, { flush: "sync" });
nodeEvent.on("copy", () => {
  if (!textReady.value) throw new Error("文本尚未加载");
  return { textPath: undefined, textSnapshot: outputs.value.text.value };
});

onMounted(loadModels);
window.addEventListener("toonflow:provider-config-changed", loadModels);
onScopeDispose(() => window.removeEventListener("toonflow:provider-config-changed", loadModels));

async function loadModels(_event?: Event) {
  if (modelsLoading.value) return;
  modelsLoading.value = true;
  try {
    models.value = await ai.getModels();
    if (!selectedModel.value) {
      const first = models.value[0];
      model.value = first ? JSON.stringify([first.providerId, first.modelId]) : "";
    }
  } catch (error) {
    if (error instanceof Error && error.name !== "AbortError") ElMessage.error(error.message);
  } finally {
    modelsLoading.value = false;
  }
}

async function generateText() {
  const choice = selectedModel.value;
  if (!textReady.value || generating.value || data.value.scriptImportPending || !choice || (!prompt.value.trim() && !hasScriptReferences.value)) return;
  if (isScript.value && scriptRows.value.length) {
    if (!await ElMessageBox.confirm("重新生成将替换当前分镜表和行引用连线，下游节点与已生成素材保留。当前表格会备份。", "重新生成分镜", { confirmButtonText: "继续生成", cancelButtonText: "保留当前表格", type: "warning" }).then(() => true, () => false)) return;
    await textFiles.writeJson(`assets/${node.id}/scriptBackup${Date.now()}.json`, { rows: scriptRows.value, text: outputs.value.text.value }, true);
  }
  generating.value = true;
  let text = "";
  try {
    if (refList.value.some(item => item.value === undefined)) throw new Error("引用节点暂无内容，请先补充引用内容");
    const references = refList.value
      .filter(item => item.value !== undefined && (item.dataType === "STRING" || item.dataType === "IMAGE" || item.dataType === "VIDEO" || item.dataType === "FILE"))
      .map(item => item.dataType === "STRING" ? { dataType: item.dataType, value: item.value } : { dataType: item.dataType, value: { ...item.value } });
    if (isScript.value && importedReference.value?.applied && !importedReference.value.error && importedReference.value.text) references.push({ dataType: "STRING", value: importedReference.value.text });
    const rowVersions = refList.value.filter(item => item.sourceHandle.startsWith("row:")).map(item => ({ key: JSON.stringify([item.source, item.sourceHandle]), value: item.value }));
    const input = { providerId: choice.providerId, modelId: choice.modelId, prompt: isScript.value ? `${scriptGenerationInstruction}\n${prompt.value.trim()}` : prompt.value.trim(), references };
    const directory = references.some(item => item.dataType !== "STRING") ? (await textFiles.list()).directory : undefined;
    const result = await ai.generate({
      ...input,
      directory,
      onEvent(event) {
        if (event.type === "text") { text += event.delta; if (!isScript.value) outputs.value.text.value = text; }
      },
    });
    if (isScript.value && (!/\|\s*镜头号\s*\|/.test(result.text) || !result.text.includes("视频运动提示词"))) throw new Error("模型未返回完整分镜表，原表已保留，请调整要求后重试");
    outputs.value.text.value = result.text;
    if (data.value.scriptReferenceVersions) for (const item of rowVersions) if (typeof item.value === "string") data.value.scriptReferenceVersions[item.key] = item.value;
  } catch (error) {
    if (error instanceof Error && error.name !== "AbortError") ElMessage.error(error.message);
  } finally {
    // 卸载会取消请求并停止 watcher，生成收尾必须自行保存已收到的正文。
    try { await saveText(outputs.value.text.value); }
    catch (error) { ElMessage.error(error instanceof Error ? error.message : "文本保存失败"); }
    generating.value = false;
  }
}
const promptModel = computed({ get: () => data.value.promptModel ?? [], set: (value: PromptModel) => { data.value.promptModel = value; } });

nodeTools.register({
  name: "setText",
  description: "修改此节点的文本输出",
  parameters: z.strictObject({ text: z.string() }),
  async execute({ text }) {
    if (!textReady.value) throw new Error("文本尚未加载");
    if (generating.value) throw new Error("文本生成中，请稍后修改");
    if (outputs.value.text.value === text) await saveText(text);
    else { outputs.value.text.value = text; await textSaving; }
    return { text };
  },
});
</script>

<style lang="scss" scoped>
.textEditor {
  height: min(560px, calc(100dvh - 144px));
  min-height: 0;
  overflow: auto;

  &.fullscreen {
    height: calc(100dvh - 112px);
  }
}

.textContent {
  min-height: 110px;

  &.empty {
    display: flex;
    align-items: center;
    justify-content: center;

    .editButton {
      margin: 0;
    }
  }

  .textPreview {
    min-height: 110px;
    max-height: 240px;
    overflow: auto;
    overflow-wrap: anywhere;
    user-select: none;
  }

  .editButton {
    display: flex;
    margin-left: auto;
  }
}

.promptCard {
  .promptHeader {
    display: flex;
    align-items: flex-start;
    gap: 12px;
  }

  .promptFooter {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;

    .modelSelect {
      width: 190px;
      min-width: 0;

      &:deep(.el-select__wrapper) {
        gap: 6px;
        padding: 0;
        box-shadow: none;
        background: transparent;
      }
    }

    .promptActions {
      display: flex;
      align-items: center;
      gap: 12px;

      .toolButton {
        width: 28px;
        height: 28px;
        padding: 0;
      }

      .generationCount {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        color: var(--el-text-color-secondary);
        font-size: 12px;
      }

      .sendButton {
        width: 32px;
        height: 32px;
        margin: 0;
        padding: 0;
        --el-button-bg-color: var(--el-text-color-primary);
        --el-button-border-color: transparent;
        --el-button-text-color: var(--el-bg-color);
        --el-button-hover-bg-color: var(--el-text-color-regular);
        --el-button-hover-border-color: transparent;
        --el-button-hover-text-color: var(--el-bg-color);
      }
    }
  }
}
</style>
