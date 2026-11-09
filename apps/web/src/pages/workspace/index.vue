<template>
  <main class="workspacePage" :class="{ simpleWorkspace: workspaceStore.creationMode === 'simple' }" :style="{ '--agentWidth': `${agentVisible ? agentWidth : 0}px` }">
    <canvasPanel
      :key="workspaceStore.project?.directory"
      v-model:selectedTool="selectedTool"
      ref="canvasPanelRef"
      class="canvasPanel"
      :class="{ backgroundPanel: activePanel !== 'canvas' || (workspaceStore.creationMode === 'simple') }"
      :inert="activePanel !== 'canvas' || (workspaceStore.creationMode === 'simple') || tutorialPreparing"
      :aria-hidden="activePanel !== 'canvas' || (workspaceStore.creationMode === 'simple')"
      :active="activePanel === 'canvas' && (workspaceStore.creationMode === 'professional')"
      :settingsVisible="settingsVisible" />
    <keep-alive :max="1">
      <documentPanel
        v-if="activePanel === 'document'"
        :key="workspaceStore.project?.directory"
        :ref="setDocumentPanel"
        :readNode="readDocumentNode"
        :readNodes="readDocumentNodes"
        :focusNode="focusDocumentNode"
        :mountNode="mountDocumentNode"
        :resolveNodeFile="resolveDocumentNodeFile"
        :observeNode="observeDocumentNode"
        :flushNodes="flushDocumentNodes"
        :fileAction="performFileAction"
        :saveNode="saveDocumentNode" />
    </keep-alive>
    <div v-show="workspaceStore.creationMode === 'professional'" class="canvasToolDock">
      <div class="bottomTools">
        <el-card v-if="activePanel === 'canvas'" class="toolMenu" shadow="never" :bodyStyle="{ padding: '3px 6px' }">
          <div class="toolMenuContent" role="toolbar" aria-label="画布工具">
            <div id="canvasToolExtras" class="canvasToolExtras" />
            <el-tooltip content="添加节点" placement="top" :showArrow="false" :hideAfter="0" :enterable="false" :triggerKeys="[]">
              <el-button class="toolButton addNodeButton" :disabled="!canvasPanelRef?.canvasReady || settingsVisible" aria-label="添加节点" aria-haspopup="menu" @click="canvasPanelRef?.addNodeAtPointer()">
                <icon-plus :size="18" aria-hidden="true" />
              </el-button>
            </el-tooltip>
            <el-tooltip :content="selectedTool === 'move' ? '移动工具，点击切换为抓手' : '抓手工具，点击切换为移动'" placement="top" :showArrow="false" :hideAfter="0" :enterable="false" :triggerKeys="[]">
              <el-button
                class="toolButton"
                text
                :type="selectedTool === 'hand' ? 'primary' : 'default'"
                :aria-pressed="selectedTool === 'hand'"
                aria-label="切换抓手/移动工具"
                @click="selectedTool = selectedTool === 'move' ? 'hand' : 'move'">
                <component :is="selectedTool === 'move' ? IconPointer : IconHandStop" :size="18" aria-hidden="true" />
              </el-button>
            </el-tooltip>
            <el-tooltip content="快捷键说明" placement="top" :showArrow="false"><el-button class="toolButton" text aria-label="快捷键说明" @click="shortcutsVisible = true"><icon-help :size="18" /></el-button></el-tooltip>
            <el-tooltip content="引导流程" placement="top" :showArrow="false"><el-button class="toolButton" text aria-label="引导流程" :disabled="tutorialPreparing || tutorialOpening || !canvasPanelRef?.canvasReady || settingsVisible" @click="startTutorial"><icon-school :size="18" /></el-button></el-tooltip>
          </div>
        </el-card>
        <el-tooltip v-if="!agentVisible" content="AFXEN Agent" placement="top" :showArrow="false" :hideAfter="0">
          <el-button
            class="agentButton"
            :class="{ standalone: activePanel !== 'canvas' }"
            :aria-expanded="agentVisible"
            aria-label="AFXEN Agent"
            aria-controls="agentPanel"
            @click="agentVisible = !agentVisible"></el-button>
        </el-tooltip>
      </div>
    </div>
    <floatingAgent @openSettings="settingsVisible = true" @applyTemplate="applyAssistantTemplate" @enterCanvas="enterCanvas" v-model="agentVisible" :expanded="workspaceStore.creationMode === 'simple'" @resize="agentWidth = $event" />
    <settings v-model="settingsVisible" />
    <shortcutHelp v-model="shortcutsVisible" />
    <canvasTutorial v-if="tutorialNodeId && workspaceStore.creationMode === 'professional'" :nodeId="tutorialNodeId" :kind="tutorialKind" :steps="tutorialSteps" :focusNode="id => canvasPanelRef?.focusTutorialNode(id)" @complete="finishTutorial" />

  </main>
</template>

<script setup lang="ts">
import { browserWorkspaceMode } from "@/lib/browserWorkspaceFiles";
import { generateBrowserText, browserNodeAi } from "@/lib/browserNodeAi";
import { browserConfig, browserResultFile, resolveBrowserModel, additionalBrowserModels, type ProfessionalCanvas, type BeginBrowserWorkflow, type BrowserConversationImport } from "@/stores/browserGeneration";
import { computed, defineAsyncComponent, nextTick, onMounted, onScopeDispose, provide, ref, shallowRef, watch, type ComponentPublicInstance } from "vue";
import { onBeforeRouteLeave } from "vue-router";
import axios from "axios";
import { IconPointer, IconHandStop, IconPlus, IconHelp } from "@tabler/icons-vue";
import { ElMessage, ElMessageBox } from "element-plus";
import shortcutHelp from "@/components/shortcutHelp.vue";
import settings from "@/components/settings/index.vue";
import { useWorkspaceStore } from "@/stores/workspace";
import { registerWorkspaceControl, waitForControlValue } from "@/lib/mcpControl";
import anonymousData from "@/lib/anonymousData";
import canvasPanel from "./panels/canvas/canvasHost.vue";
import type { DocumentNodeOptions } from "./panels/canvas/canvasFiles";
import floatingAgent from "./components/floatingAgent.vue";
import { openTutorialProject, type CanvasTutorialStep } from "@/lib/canvasTutorial";
import canvasTutorial from "@/components/canvasTutorial.vue";
import { applyTemplateParameters, type TemplateApplication } from "@/lib/creationTemplates";

provide("nodeAi", browserNodeAi);
provide("optimizeNodePrompt", async (prompt: string, kind: "image" | "video" | "audio", signal: AbortSignal) => {
  const model = resolveBrowserModel("text");
  const result = await generateBrowserText({ providerId: model.id, modelId: model.modelId, prompt,
    systemPrompt: `优化用于${({ image: "图片", video: "视频", audio: "音频" })[kind]}生成的提示词。保持用户意图、人物、场景、时长和全部引用标记（例如 {{ref 1}}）原样，改善表达和必要细节。只输出优化后的提示词，不要解释，不要编造引用或生成结果。`, signal });
  return result.text;
});

watch(() => [browserConfig.enabled, browserConfig.endpoint, ...Object.values(browserConfig.keys), JSON.stringify(additionalBrowserModels)], () => { window.dispatchEvent(new Event("toonflow:provider-config-changed")); });

const documentPanel = defineAsyncComponent(() => import("./panels/document/index.vue"));

const activePanel = ref<"canvas" | "document">("canvas");
const selectedTool = ref<"move" | "hand">("move");
onMounted(() => anonymousData.track("workspace.canvas"));
const workspaceStore = useWorkspaceStore();
const agentVisible = ref(workspaceStore.creationMode === "simple");
watch(() => workspaceStore.creationMode, mode => { agentVisible.value = mode === "simple"; });
const agentWidth = ref(0);
const settingsVisible = ref(false);
provide("openWorkspaceSettings", () => { settingsVisible.value = true; });
const canvasPanelRef = ref<InstanceType<typeof canvasPanel>>();
const tutorialNodeId = ref("");
const tutorialKind = ref<"image" | "video" | "canvas">("canvas");
const tutorialSteps = ref<CanvasTutorialStep[]>([]);
const tutorialPreparing = ref(false), tutorialOpening = ref(false), canvasEntryPreparing = ref(false);
let dismissedTutorialDirectory = "";
let tutorialPreparation: Promise<boolean> | undefined;
function openTutorial(panel: InstanceType<typeof canvasPanel>) {
  if (tutorialNodeId.value) return Promise.resolve(true);
  tutorialPreparation ??= (async () => {
    tutorialPreparing.value = true;
    const directory = workspaceStore.project?.directory;
    try {
      const tutorial = await panel.prepareTutorial();
      if (!tutorial || directory !== workspaceStore.project?.directory) return false;
      agentVisible.value = false;
      tutorialKind.value = workspaceStore.project?.tutorialEntry ?? tutorial.kind;
      tutorialSteps.value = tutorial.steps;
      tutorialNodeId.value = tutorial.nodeId;
      if (tutorialKind.value === "canvas") workspaceStore.canvasTutorialVersion = 1;
      return true;
    } finally { tutorialPreparing.value = false; tutorialPreparation = undefined; }
  })();
  return tutorialPreparation;
}
function finishTutorial() { dismissedTutorialDirectory = workspaceStore.project?.directory ?? ""; tutorialNodeId.value = ""; }
async function startTutorial() {
  if (!canvasPanelRef.value || tutorialPreparing.value || tutorialOpening.value) return;
  tutorialOpening.value = true;
  dismissedTutorialDirectory = "";
  try {
    const kind = workspaceStore.project?.tutorialEntry ?? "canvas";
    await flushSave();
    tutorialNodeId.value = "";
    await openTutorialProject(kind);
  } catch (error) { ElMessage.error(error instanceof Error ? error.message : "教学引导打开失败"); }
  finally { tutorialOpening.value = false; }
}
watch(() => workspaceStore.project?.directory, () => { tutorialNodeId.value = ""; });
const shortcutsVisible = ref(false);
const documentPanelCache = shallowRef<{ directory: string; instance: InstanceType<typeof documentPanel> }>();
const documentPanelRef = computed(() => documentPanelCache.value?.directory === workspaceStore.project?.directory ? documentPanelCache.value?.instance : undefined);
watch(() => workspaceStore.project?.directory, () => { documentPanelCache.value = undefined; }, { flush: "sync" });
function setDocumentPanel(value: Element | ComponentPublicInstance | null) {
  const directory = workspaceStore.project?.directory;
  // KeepAlive 失活会清空模板 ref，保留同一工作区实例以协调后台文档保存和文件操作。
  if (value && directory) documentPanelCache.value = { directory, instance: value as InstanceType<typeof documentPanel> };
}
let startingProject = false;
async function startNewProject(mode: "simple" | "professional") {
  if (startingProject) return;
  startingProject = true;
  try {
    await flushSave();
    const project = await workspaceStore.createProject("未命名项目", mode);
    workspaceStore.creationMode = mode;
    if (mode === "professional") workspaceStore.pendingCanvasEntry = { directory: project.directory };
    agentVisible.value = mode === "simple";
  } finally { startingProject = false; }
}
provide("startNewProject", startNewProject);
provide("openSidebarProject", async (directory: string, mode?: "simple") => {
  await flushSave();
  await workspaceStore.openProject(directory);
  if (mode === "simple") { workspaceStore.creationMode = "simple"; agentVisible.value = true; }
  else await workspaceStore.restoreProjectEntry();
});
let applyingAssistantTemplate = false;
async function applyAssistantTemplate(value: TemplateApplication) {
  if (startingProject || applyingAssistantTemplate) return;
  applyingAssistantTemplate = true;
  try {
    await startNewProject("simple");
    const directory = workspaceStore.project?.directory;
    if (!directory) throw new Error("项目创建失败");
    applyTemplateParameters(value.template);
    workspaceStore.pendingAgentMessage = { directory, prompt: value.prompt, attachments: value.references.map(file => ({ file, name: file.name, path: "", mimeType: file.type })), model: "", reasoningEffort: "", send: false };
  } catch (error) { ElMessage.error(error instanceof Error ? error.message : "模板应用失败"); }
  finally { applyingAssistantTemplate = false; }
}
onMounted(() => { if (browserWorkspaceMode && !workspaceStore.project) void startNewProject("professional").catch(error => ElMessage.error(error.message)); });
watch(() => workspaceStore.pendingCanvasEntry, async entry => {
  if (!entry || entry.directory !== workspaceStore.project?.directory) return;
  workspaceStore.pendingCanvasEntry = null;
  canvasEntryPreparing.value = true;
  try {
    workspaceStore.creationMode = "professional";
    activePanel.value = "canvas";
    await nextTick();
    const panel = canvasPanelRef.value;
    if (!panel) throw new Error("画布正在初始化，请稍后重试");
    await panel.waitUntilReady();
    if (entry.directory !== workspaceStore.project?.directory) return;
    if (entry.files?.length) {
      await panel.importBrowserResult(entry.files, entry.directory);
      agentVisible.value = false;
      return;
    }
    if (entry.nodeType) {
      tutorialKind.value = entry.nodeType === "remote-imageGenerationNode" ? "image" : entry.nodeType === "remote-videoGenerationNode" ? "video" : "canvas";
      const teaching = entry.tutorial && tutorialKind.value !== "canvas" ? tutorialKind.value : undefined;
      await panel.createInitialNode(entry.nodeType, teaching);
    }
    agentVisible.value = false;
    if (entry.tutorial && await openTutorial(panel)) {
      if (workspaceStore.project) workspaceStore.project.tutorial = true;
      if (!workspaceStore.tutorialVisited.includes(tutorialKind.value)) workspaceStore.tutorialVisited.push(tutorialKind.value);
    }
  } catch (error) { ElMessage.error(error instanceof Error ? error.message : "画布打开失败，项目已保留"); }
  finally { canvasEntryPreparing.value = false; }
}, { immediate: true, flush: "post" });
watch(() => [canvasPanelRef.value?.canvasReady, workspaceStore.project?.directory, workspaceStore.creationMode, activePanel.value], async () => {
  const panel = canvasPanelRef.value, project = workspaceStore.project;
  if (!panel?.canvasReady || !project?.tutorial || workspaceStore.creationMode !== "professional" || activePanel.value !== "canvas" || canvasEntryPreparing.value || tutorialOpening.value || tutorialNodeId.value || dismissedTutorialDirectory === project.directory) return;
  try { await openTutorial(panel); }
  catch (error) { ElMessage.error(error instanceof Error ? error.message : "教学引导打开失败，请点击底部引导流程重试"); }
}, { immediate: true, flush: "post" });
async function enterCanvas() {
  try {
    workspaceStore.creationMode = "professional";
    activePanel.value = "canvas";
    await nextTick();
    if (!canvasPanelRef.value) throw new Error("画布正在初始化，请稍后重试");
    await canvasPanelRef.value.waitUntilReady();
    agentVisible.value = false;
  } catch (error) { ElMessage.error(error instanceof Error ? error.message : "无法进入画布"); }
}
provide("importConversationTurn", async (turn: BrowserConversationImport) => {
  if (workspaceStore.project?.directory !== turn.directory) throw new Error("项目已切换，请返回原对话重试");
  tutorialNodeId.value = "";
  workspaceStore.creationMode = "professional"; activePanel.value = "canvas";
  await nextTick();
  const panel = canvasPanelRef.value;
  if (!panel) throw new Error("画布尚未就绪");
  await panel.waitUntilReady();
  await panel.importConversationTurn(turn);
  agentVisible.value = false;
});
provide("importBrowserResult", async (file: File, directory: string, script = false) => {
  if (!canvasPanelRef.value) throw new Error("画布尚未就绪");
  workspaceStore.creationMode = "professional";
  activePanel.value = "canvas";
  await nextTick();
  await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
  await canvasPanelRef.value.waitUntilReady();
  await canvasPanelRef.value.importBrowserResult(file, directory, script);
  agentVisible.value = false;
});
provide("beginBrowserWorkflow", (async (...args) => {
  if (args[4] !== false) workspaceStore.creationMode = "professional";
  activePanel.value = "canvas";
  await nextTick();
  const panel = canvasPanelRef.value;
  if (!panel) throw new Error("画布正在初始化，请稍后重试");
  return panel.beginBrowserWorkflow(...args);
}) as BeginBrowserWorkflow);
provide("canvas", () => canvasPanelRef.value?.getCanvasContext());
provide("professionalCanvas", {
  async focus(directory, node) {
    await focusDocumentNode(directory, node.canvasPath, node.nodeId);
  },
  async read(directory: string, node: { canvasPath: string; nodeId: string }) {
    if (!canvasPanelRef.value) throw new Error("画布尚未就绪");
    await canvasPanelRef.value.waitUntilReady();
    const document = await canvasPanelRef.value.readDocumentNode(directory, node.canvasPath, node.nodeId);
    return document.outputs.find(output => output.id === "text")?.text ?? "";
  },
  async mount(directory: string, node: { canvasPath: string; nodeId: string }, target: HTMLElement) {
    if (!canvasPanelRef.value) throw new Error("画布尚未就绪");
    await canvasPanelRef.value.waitUntilReady();
    return canvasPanelRef.value.mountDocumentNode(directory, node.canvasPath, node.nodeId, target);
  },
  async apply(directory, result, sources, label, model, prompt) {
    if (!canvasPanelRef.value || directory !== workspaceStore.project?.directory) throw new Error("工作区已切换，生成结果保留在原对话");
    const file = await browserResultFile(result);
    await canvasPanelRef.value.waitUntilReady();
    return canvasPanelRef.value.importBrowserResult(file, directory, false, { resultId: result.id, label, model, prompt, sources });
  },
} satisfies ProfessionalCanvas);
provide("mentionCanvas", () => canvasPanelRef.value?.mentionSource);
provide("activateCanvasPanel", () => switchPanel("canvas"));
provide("performWorkspaceFileAction", (directory: string, action: "copy" | "rename" | "move" | "delete", path: string, target?: string, entryType: "canvas" | "directory" = "canvas") =>
  documentPanelRef.value ? documentPanelRef.value.performFileAction(directory, action, path, target, entryType) : performFileAction(directory, action, path, target));

const controlLifetime = new AbortController();
onScopeDispose(() => controlLifetime.abort(new Error("工作区已关闭")));
registerWorkspaceControl({
  getState: () => ({
    directory: workspaceStore.project?.directory ?? null,
    canvasId: canvasPanelRef.value?.canvasId || null,
    panel: activePanel.value,
    tools: canvasPanelRef.value?.canvasReady ? canvasPanelRef.value.getCanvasContext()?.tools ?? [] : [],
    document: documentPanelRef.value?.getDocument(false),
  }),
  flushSave,
  async call(request, signal) {
    const directory = workspaceStore.project?.directory;
    if (!directory) throw new Error("请先打开工作区");
    const callSignal = AbortSignal.any([signal, controlLifetime.signal]);
    const checkDirectory = () => {
      callSignal.throwIfAborted();
      if (directory !== workspaceStore.project?.directory) throw new Error("工作区已切换，本次调用已停止");
    };
    checkDirectory();
    if (request.name === "switchPanel") {
      if (request.args.panel !== "canvas" && request.args.panel !== "document") throw new Error("未知面板");
      if (!(await switchPanel(request.args.panel))) throw new Error("面板切换失败，请检查文档是否保存成功");
      checkDirectory();
      return { panel: activePanel.value };
    }
    if (["getDocument", "openDocument", "writeDocument"].includes(request.name)) {
      if (!(await switchPanel("document"))) throw new Error("文档面板无法打开");
      const panel = await waitForControlValue(() => documentPanelRef.value, callSignal);
      checkDirectory();
      if (request.name === "openDocument") await panel.openDocument(request.args, callSignal);
      if (request.name === "writeDocument") await panel.writeDocument(request.args, callSignal);
      checkDirectory();
      return panel.getDocument();
    }
    if (!(await switchPanel("canvas"))) throw new Error("画布面板无法打开");
    const context = await waitForControlValue(
      () => (canvasPanelRef.value?.canvasReady || (!canvasPanelRef.value?.canvasId && canvasPanelRef.value?.canvasListReady) ? canvasPanelRef.value.getCanvasContext() : undefined),
      callSignal
    );
    checkDirectory();
    return context.call({ name: request.name, args: request.args }, callSignal);
  },
});

async function flushSave() {
  await documentPanelRef.value?.flushSave();
  await canvasPanelRef.value?.flushSave();
}

onBeforeRouteLeave(async () => {
  if (canvasPanelRef.value?.saveBusy) {
    ElMessage.warning("画布操作尚未完成，请稍后退出");
    return false;
  }
  try {
    await flushSave();
    return true;
  } catch (error) {
    const message = axios.isAxiosError<{ message?: string }>(error)
      ? error.response?.data?.message || error.message
      : error instanceof Error
      ? error.message
      : "项目保存失败";
    const leave = await ElMessageBox.confirm(`无法保存项目：${message}。文件或目录可能已被移动或删除。仍然退出将丢弃尚未保存的修改。`, "项目未保存", {
      type: "warning",
      confirmButtonText: "仍然退出",
      cancelButtonText: "留在项目",
      closeOnClickModal: false,
    }).then(
      () => true,
      () => false
    );
    if (leave) {
      documentPanelRef.value?.cancelSave();
      canvasPanelRef.value?.cancelSave();
    }
    return leave;
  }
});

async function switchPanel(value: string | number | boolean) {
  if (value !== "canvas" && value !== "document") return false;
  try {
    if (activePanel.value === "document") await documentPanelRef.value?.flushSave();
    const changed = activePanel.value !== value;
    activePanel.value = value;
    await nextTick();
    if (changed) anonymousData.track(value === "canvas" ? "workspace.canvas" : "workspace.document");
    return true;
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "文本保存失败");
    return false;
  }
}

function readDocumentNode(directory: string, canvasPath: string, nodeId: string) {
  if (!canvasPanelRef.value) throw new Error("画布尚未就绪");
  return canvasPanelRef.value.readDocumentNode(directory, canvasPath, nodeId);
}

function readDocumentNodes(directory: string, options?: DocumentNodeOptions) {
  if (!canvasPanelRef.value) throw new Error("画布尚未就绪");
  return canvasPanelRef.value.readDocumentNodes(directory, options);
}

async function focusDocumentNode(directory: string, canvasPath: string, nodeId: string) {
  if (!directory || workspaceStore.project?.directory !== directory) throw new Error("工作目录已切换，请重新选择节点");
  if (!await switchPanel("canvas")) throw new Error("画布面板无法打开");
  if (!canvasPanelRef.value) throw new Error("画布尚未就绪");
  await canvasPanelRef.value.focusDocumentNode(directory, canvasPath, nodeId);
}

function mountDocumentNode(directory: string, canvasPath: string, nodeId: string, target: HTMLElement) {
  if (!canvasPanelRef.value) throw new Error("画布尚未就绪");
  return canvasPanelRef.value.mountDocumentNode(directory, canvasPath, nodeId, target);
}

function resolveDocumentNodeFile(directory: string, path: string) {
  if (!canvasPanelRef.value) throw new Error("画布尚未就绪");
  return canvasPanelRef.value.resolveDocumentNodeFile(directory, path);
}

function observeDocumentNode(directory: string, canvasPath: string, nodeId: string, onState: (state: { dirty: boolean; error: string; deleted: boolean }) => void) {
  if (!canvasPanelRef.value) throw new Error("画布尚未就绪");
  return canvasPanelRef.value.observeDocumentNode(directory, canvasPath, nodeId, onState);
}

async function flushDocumentNodes() {
  if (!canvasPanelRef.value) throw new Error("画布尚未就绪");
  await canvasPanelRef.value.flushSave();
}

function performFileAction(directory: string, action: "copy" | "rename" | "move" | "delete", path: string, target?: string, nodeId?: string) {
  if (!canvasPanelRef.value) throw new Error("画布尚未就绪");
  return canvasPanelRef.value.performFileAction(directory, action, path, target, nodeId);
}

function saveDocumentNode(directory: string, canvasPath: string, nodeId: string, handleId: string, text: string, expectedText?: string) {
  if (!canvasPanelRef.value) throw new Error("画布尚未就绪");
  return canvasPanelRef.value.saveDocumentNode(directory, canvasPath, nodeId, handleId, text, expectedText);
}
</script>

<style scoped lang="scss">
.workspacePage {
  position: relative;
  width: 100%;
  height: 100dvh;
  background-color: var(--el-bg-color);

  .canvasPanel {
    position: absolute;
    inset: 0;
    width: calc(100% - var(--agentWidth, 0px));
    container: canvasWorkspace / inline-size;

    &.backgroundPanel {
      opacity: 0;
      visibility: hidden;
      pointer-events: none;
    }
  }

  .canvasToolDock {
    position: absolute;
    bottom: 15px;
    left: calc((100% - var(--agentWidth, 0px)) / 2);
    transform: translateX(-50%);
    z-index: 5;
    .bottomTools {
      z-index: 5;
      display: flex;
      align-items: center;
      gap: 8px;
      pointer-events: auto;

      .toolMenu {
        flex-shrink: 0;
        transition: none;

        .toolMenuContent {
          display: flex;
          align-items: center;
          gap: 2px;

          .toolButton {
            width: 32px;
            height: 32px;
            margin: 0;
            padding: 0;

            &.addNodeButton {
              margin-right: 8px;
              color: var(--el-bg-color);
              background: var(--el-text-color-primary);
              border-color: transparent;

              &:hover { opacity: 0.85; }
              &.is-disabled { opacity: 0.45; }
            }
          }

          .toolTrigger { display: inline-flex; }

          .el-divider { margin: 0; }
        }
      }

      .agentButton {
        position: absolute;
        left: calc(100% + 8px);
        width: 40px;
        height: 40px;
        flex-shrink: 0;
        margin: 0;
        padding: 0;
        border: 1px solid color-mix(in srgb, #6edfdc 30%, var(--el-border-color-light));
        border-radius: 50%;
        background: linear-gradient(145deg, color-mix(in srgb, #96f9f0 15%, var(--el-bg-color-overlay)), var(--el-bg-color-overlay) 65%,
          color-mix(in srgb, #8588ff 18%, var(--el-bg-color-overlay)));
        box-shadow: inset 0 1px 0 #ffffff52;
        color: #f4fffe;
        overflow: hidden;
        isolation: isolate;
        transition: transform 180ms ease, box-shadow 180ms ease, border-color 180ms ease;

        &.standalone {
          position: relative;
          left: auto;
        }

        &::before,
        &::after {
          content: "";
          position: absolute;
          inset: 4px;
          border-radius: 50%;
          pointer-events: none;
        }

        &::before {
          z-index: -2;
          background: radial-gradient(ellipse at 22% 15%, #adfff0, transparent 50%), radial-gradient(ellipse at 85% 85%, #b29aff, transparent 55%),
            radial-gradient(ellipse at 85% 20%, #25dccc, transparent 50%), linear-gradient(150deg, #10aec1, #3765c6 60%, #765bd3);
          animation: agentFlow 5.4s linear infinite;
          filter: saturate(1.05);
          transition: filter 180ms ease;
        }

        &::after {
          z-index: -1;
          background: radial-gradient(ellipse 12% 18% at 50% 50%, #ffffffa6, #d3fff773 35%, transparent 80%),
            radial-gradient(ellipse at 32% 18%, #ffffff99, transparent 42%), radial-gradient(ellipse at 65% 95%, #17246070, transparent 65%);
          background-size: 160% 160%, 100% 100%, 100% 100%;
          background-position: 75% 85%, 0 0, 0 0;
          background-repeat: no-repeat;
          box-shadow: inset 0 0 0 1px #ffffff52, inset 0 2px 3px #ffffff80, inset 0 -3px 6px #16305b73;
          animation: agentShine 3.2s linear infinite;
        }

        &:hover::before {
          filter: saturate(1.2);
        }

        &:hover {
          transform: translateY(-1px);
          border-color: #87f2eb99;
          box-shadow: inset 0 1px 0 #ffffff70;
        }

        &:active {
          transform: scale(0.95);
        }

        &:focus-visible {
          outline: 2px solid var(--el-color-primary);
          outline-offset: 3px;
        }

        .agentLogo {
          width: 24px;
          height: 24px;
          flex-shrink: 0;
          background: currentColor;
          mask-size: contain;
          mask-position: center;
          mask-repeat: no-repeat;
        }

        @media (prefers-reduced-motion: reduce) {
          transition: none;

          &::before,
          &::after {
            animation: none;
          }
        }
      }
    }
  }
}

@keyframes agentFlow {
  from {
    transform: rotate(0deg) scale(1);
  }
  25% {
    transform: rotate(90deg) scale(1.06, 1.02);
  }
  50% {
    transform: rotate(180deg) scale(1.02, 1.06);
  }
  75% {
    transform: rotate(270deg) scale(1.05, 1.03);
  }
  to {
    transform: rotate(360deg) scale(1);
  }
}

@keyframes agentShine {
  0%,
  100% {
    background-size: 160% 160%, 100% 100%, 100% 100%;
    background-position: 75% 85%, 0 0, 0 0;
  }
  12.5% {
    background-position: 40% 98%, 0 0, 0 0;
  }
  25% {
    background-size: 180% 140%, 100% 100%, 100% 100%;
    background-position: 10% 75%, 0 0, 0 0;
  }
  37.5% {
    background-position: 2% 40%, 0 0, 0 0;
  }
  50% {
    background-size: 160% 160%, 100% 100%, 100% 100%;
    background-position: 25% 10%, 0 0, 0 0;
  }
  62.5% {
    background-position: 60% 2%, 0 0, 0 0;
  }
  75% {
    background-size: 140% 180%, 100% 100%, 100% 100%;
    background-position: 95% 25%, 0 0, 0 0;
  }
  87.5% {
    background-position: 98% 60%, 0 0, 0 0;
  }
}
</style>

<style scoped lang="scss">
.canvasToolExtras { display: flex; align-items: center; } .canvasToolDock { max-width: calc(100% - 24px); .toolMenuContent { flex-wrap: wrap; justify-content: center; } }
</style>

<style scoped lang="scss">
@media (max-width: 640px) { .canvasToolDock { left: 50%; width: calc(100% - 24px); .bottomTools { flex-wrap: wrap; justify-content: center; .toolMenu { max-width: 100%; flex-shrink: 1; } } } }
</style>

<style scoped lang="scss">
</style>
