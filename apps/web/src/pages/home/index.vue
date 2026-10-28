<template>
  <el-container class="home">
    <bg class="pageBackground" />
    <aside class="studioSidebar" aria-label="主导航">
      <button class="studioBrand" @click="homeSection = 'create'">ai-studio</button>
      <el-button type="primary" :icon="IconPlus" @click="homeSection = 'create'; promptInput?.focus()">新建创作</el-button>
      <nav>
        <button :aria-current="homeSection === 'create' ? 'page' : undefined" @click="homeSection = 'create'"><icon-sparkles :size="18" />创作</button>
        <button :aria-current="homeSection === 'history' ? 'page' : undefined" @click="homeSection = 'history'"><icon-history :size="18" />历史对话</button>
        <button @click="homeSection = 'assets'"><icon-photo :size="18" />个人资产</button>
        <button :aria-current="homeSection === 'projects' ? 'page' : undefined" @click="homeSection = 'projects'"><icon-folder :size="18" />我的项目</button>
      </nav>
      <p>最近项目</p>
      <button v-for="item in sortedProjects.slice(0, 5)" :key="item.directory" class="recentProject" :title="item.name" @click="openProject(item)"><icon-folder :size="16" />{{ item.name }}</button>
      <div class="sidebarFooter"><el-button text :icon="IconPalette" @click="settingsVisible = true">外观与设置</el-button></div>
    </aside>
    <el-header class="pageHeader">
      <div class="headerActions">
        <el-badge isDot :hidden="!hasDesktopUpdate">
          <el-button round size="large" :icon="IconSettings" :aria-label="hasDesktopUpdate ? '设置，有新版本可用' : '设置'" @click="settingsVisible = true">设置</el-button>
        </el-badge>
      </div>
    </el-header>
    <el-main class="pageContent">
      <section v-show="homeSection === 'create'" class="creationPanel" aria-label="创建项目">
        <div class="brand">
          <el-image class="brandLogo" :src="logoUrl" fit="contain" alt="ai-studio" />
          <h1>ai-studio</h1>
        </div>
        <div class="promptArea">
          <creationModeSwitch v-model="workspaceStore.creationMode" @update:modelValue="changeCreationMode" />
          <el-card class="promptCard" :class="{ draggingAttachments }" shadow="never" :bodyStyle="{ padding: '20px' }" :footerStyle="{ padding: '12px 16px' }" @dragenter.capture="dragEnterAttachments" @dragover.capture="dragOverAttachments" @dragleave.capture="dragLeaveAttachments" @drop.capture="dropAttachments">
            <div v-if="draggingAttachments" class="attachmentDropOverlay" role="status" aria-live="polite">
              <icon-paperclip :size="20" aria-hidden="true" />
              <strong>松开添加附件</strong>
              <span>图片、视频、文档或代码文件</span>
            </div>
            <input ref="attachmentInput" type="file" :accept="attachmentAccept" multiple hidden :disabled="creating || opening" @change="selectAttachments" />
            <attachmentList v-if="promptAttachments.length" class="promptAttachments" numbered :attachments="promptAttachments" removable restorable :disabled="creating || opening" @remove="promptAttachments.splice($event, 1)" @restore="restoreAttachment" />
            <el-input ref="promptInput" v-model="prompt" type="textarea" :rows="4" resize="vertical" :disabled="creating || opening" :placeholder="promptPlaceholder" aria-label="创作描述" @paste.capture="pasteAttachments" @keydown="handlePromptKeydown" />
            <template #footer>
              <div class="composerFooter">
                <span v-if="browserWorkspaceMode" class="workspaceHint">项目与素材保存在当前浏览器</span>
                <workspacePicker v-else ref="promptWorkspacePicker" v-model="workspaceDirectory" :disabled="creating || opening" />
                <el-space class="sendActions" wrap :size="12">
                  <referencePicker :disabled="creating || opening" @local="attachmentInput?.click()" @files="addAttachments" />
                  <browserModelOptions v-if="browserConfig.enabled || browserWorkspaceMode" :prompt="prompt" /><modelPopover v-else v-model="selectedModel" v-model:reasoningEffort="reasoningEffort" class="modelSelect" :disabled="creating || opening" />
                  <el-button class="sendButton" type="primary" :circle="!!workspaceDirectory" :icon="workspaceDirectory || browserWorkspaceMode ? IconArrowUp : IconFolder" :loading="creating" :disabled="creating || opening" :aria-label="workspaceDirectory || browserWorkspaceMode ? '发送' : '选择工作目录'" @click="workspaceDirectory || browserWorkspaceMode ? createProject() : promptWorkspacePicker?.chooseDirectory()">
                    <template v-if="!workspaceDirectory && !browserWorkspaceMode" #default>选择工作目录</template>
                  </el-button>
                </el-space>
              </div>
              <p v-if="!workspaceDirectory && !browserWorkspaceMode" class="workspaceHint" role="status">请先选择一个空文件夹作为工作目录，画布和素材会保存在这里。</p>
            </template>
          </el-card>
          <el-alert v-if="generationError" :title="generationError" type="error" :closable="false" />
        </div>
      </section>
      <section v-if="homeSection === 'history'" class="homeHistory" aria-label="历史对话">
        <h2>历史对话</h2>
        <p v-if="historyLoading" role="status">正在读取历史对话…</p>
        <el-alert v-if="historyError" :title="historyError" type="error" :closable="false" />
        <button v-for="item in conversationHistory" :key="`${item.directory}:${item.file}`" class="historyEntry" type="button" :disabled="opening || creating" @click="openHistory(item)">
          <icon-history :size="18" /><span><strong>{{ item.name }}</strong><small>{{ item.projectName }} · {{ item.messageCount }} 条消息</small></span>
        </button>
      </section>
      <section v-if="homeSection === 'assets'" class="homeAssets"><h2>个人资产</h2><assetLibrary page :modelValue="true" :directory="workspaceStore.project?.directory" /></section>
      <creativeCases v-if="homeSection === 'create'" @apply="applyCase" />
      <section v-show="homeSection === 'projects'" class="projectList" aria-labelledby="projectListTitle">
        <div class="sectionHeader">
          <h2 id="projectListTitle">我的项目</h2>
          <el-input v-model="projectSearch" placeholder="按项目名搜索" aria-label="按项目名搜索" clearable style="max-width: 240px" />
          <el-space wrap>
            <el-button v-if="!browserWorkspaceMode" :icon="IconFolderOpen" :disabled="creating || opening" @click="openProject()">导入项目</el-button>
            <el-button :icon="IconFolderPlus" :disabled="creating || opening" @click="createProject(false)">添加项目</el-button>
            <el-button circle :icon="sortDescending ? IconSortDescending : IconSortAscending" :aria-label="sortDescending ? '按时间降序' : '按时间升序'" @click="sortDescending = !sortDescending" />
            <el-radio-group v-model="viewMode" aria-label="项目视图">
              <el-radio-button value="grid" aria-label="网格视图"><icon-layout-grid :size="16" /></el-radio-button>
              <el-radio-button value="list" aria-label="列表视图"><icon-list :size="16" /></el-radio-button>
            </el-radio-group>
          </el-space>
        </div>
        <div class="projectItems" :class="{ listView: viewMode === 'list' }">
          <el-card v-for="project in filteredProjects" :key="project.directory" class="projectCard" shadow="hover" :bodyStyle="{ padding: '0' }">
            <button class="projectEntry" type="button" :disabled="creating || opening" :aria-label="`打开项目 ${project.name}`" @click="openProject(project)">
              <projectThumbnail :directory="project.directory" />
              <span class="projectInfo">
                <span class="projectName" :title="project.name">{{ project.name }}</span>
                <span class="projectPath" :title="browserWorkspaceMode ? '当前浏览器 · 刷新后保留' : project.directory">{{ browserWorkspaceMode ? '当前浏览器 · 刷新后保留' : project.directory }}</span>
                <span class="projectTime">最近打开 {{ new Date(project.lastOpenedAt).toLocaleString(locale, { hour12: false }) }}</span>
              </span>
            </button>
            <div class="projectActions">
              <el-button text :icon="IconEdit" :disabled="creating || opening" :aria-label="`重命名项目 ${project.name}`" title="重命名" @click="renameProject(project)" />
              <el-button text type="danger" :icon="IconFolderMinus" :disabled="creating || opening" :aria-label="`移除项目 ${project.name}`" title="从列表移除，不删除文件" @click="workspaceStore.removeProject(project.directory)" />
            </div>
          </el-card>
        </div>
      </section>
    </el-main>
    <settings v-model="settingsVisible" />
    <workspacePicker ref="relocationPicker" hideTrigger />
  </el-container>
</template>

<script setup lang="ts">
import { locale, translate } from "@toonflow/i18n/vue";
import axios from "axios";
import { storeToRefs } from "pinia";
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { ElMessage, ElMessageBox, type InputInstance } from "element-plus";
import { getReadableFileMimeType, readableFileAccept } from "@toonflow/server/documentFormats";
import {
  IconSettings, IconPlus, IconSparkles, IconPalette, IconHistory,
  IconArrowUp, IconLayoutGrid,
  IconList, IconSortDescending,
  IconSortAscending, IconFolder, IconEdit,
  IconFolderMinus, IconFolderPlus, IconFolderOpen, IconPaperclip,
} from "@tabler/icons-vue";
import { inferGenerationKind, browserConfig, generationError } from "@/stores/browserGeneration";
import browserModelOptions from "@/components/browserModelOptions.vue";
import { listBrowserConversations } from "@/components/agent/browserConversations";
import type { AgentHistory } from "@/components/agent/types";
import projectThumbnail from "@/components/projectThumbnail.vue";
import referencePicker from "@/components/referencePicker.vue";
import modelPopover from "@/components/modelPopover.vue";
import attachmentList from "@/components/agent/attachmentList.vue";
import { createPastedTextFile, readTextAttachment } from "@/components/agent/textAttachments";
import type { AgentAttachment } from "@/components/agent/types";
import logoUrl from "@toonflow/assets/logo.svg";
import { useWorkspaceStore, type Project } from "@/stores/workspace";
import { hasDesktopUpdate } from "@/stores/desktopUpdate";
import { browserWorkspaceMode } from "@/lib/browserWorkspaceFiles";
import useWorkspaceFiles from "@/lib/workspaceFiles";
import settings from "@/components/settings/index.vue";
import bg from "./bg.vue";
import creationModeSwitch from "@/components/creationModeSwitch.vue";
import assetLibrary from "@/pages/workspace/panels/canvas/components/assetLibrary.vue";
import creativeCases from "@/components/creativeCases.vue";
import workspacePicker from "./workspacePicker.vue";

const settingsVisible = ref(false);
const homeSection = ref("create");
async function applyCase(value: { prompt: string; references: File[] }) {
  if (prompt.value.trim()) {
    const replace = await ElMessageBox.confirm("应用案例会替换当前提示词，已有附件与引导图将保留。", "保留当前草稿或采用案例", { confirmButtonText: "采用案例", cancelButtonText: "保留草稿" }).then(() => true, () => false);
    if (!replace) return;
  }
  prompt.value = value.prompt;
  addAttachments(value.references);
  await nextTick();
  promptInput.value?.focus();
}
const router = useRouter();
const creating = ref(false);
const opening = ref(false);
const promptWorkspacePicker = ref<InstanceType<typeof workspacePicker>>();
const relocationPicker = ref<InstanceType<typeof workspacePicker>>();
const prompt = ref("");
const promptInput = ref<InputInstance>();
const promptAttachments = ref<AgentAttachment[]>([]);
const attachmentInput = ref<HTMLInputElement>();
const attachmentAccept = `image/*,video/*,${readableFileAccept}`;
const draggingAttachments = ref(false);
let attachmentDragDepth = 0;
const workspaceStore = useWorkspaceStore();
const { project, projectList } = storeToRefs(workspaceStore);
const workspaceDirectory = ref(project.value?.directory ?? "");
const placeholderPhrases = [
  "描述你想创作的内容，让灵感从这里开始…",
  "把一个故事灵感，变成一段精彩的短片…",
  "为你的主角设计独特的外形和性格…",
  "创作一段雨夜街头的电影感镜头…",
  "把这段文字拆解成连贯的分镜画面…",
  "为一场奇幻冒险生成场景和角色…",
  "为你的画面配上一段合适的音乐…",
  "写一段温暖的旁白，讲述这个故事…",
  "设计一支富有想象力的产品宣传片…",
  "从一句话开始，搭建你的创作工作流…",
];
const promptPlaceholder = ref(translate(placeholderPhrases[0]!));

onMounted(() => {
  window.addEventListener("dragend", clearAttachmentDrag, true);
  window.addEventListener("drop", clearAttachmentDrag, true);
  window.addEventListener("blur", clearAttachmentDrag);
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let phraseIndex = 0;
  watch([() => !!prompt.value, locale], ([hasInput], _previous, onCleanup) => {
    if (reduceMotion) {
      promptPlaceholder.value = translate(placeholderPhrases[0]!);
      return;
    }
    if (hasInput) return;
    const segmenter = new Intl.Segmenter(locale.value, { granularity: "grapheme" });
    const phrases = placeholderPhrases.map(phrase => [...segmenter.segment(translate(phrase))].map(part => part.segment));
    let characterCount = 0;
    let deleting = false;
    let timer: ReturnType<typeof setTimeout>;
    promptPlaceholder.value = "";

    function typePlaceholder() {
      const phrase = phrases[phraseIndex]!;
      characterCount += deleting ? -1 : 1;
      promptPlaceholder.value = phrase.slice(0, characterCount).join("");
      let delay = deleting ? 35 : 85;
      if (characterCount === phrase.length) {
        deleting = true;
        delay = 1800;
      } else if (characterCount === 0) {
        deleting = false;
        phraseIndex = (phraseIndex + 1) % placeholderPhrases.length;
        delay = 300;
      }
      timer = setTimeout(typePlaceholder, delay);
    }

    timer = setTimeout(typePlaceholder, 300);
    onCleanup(() => clearTimeout(timer));
  }, { immediate: true });
});

onUnmounted(() => {
  window.removeEventListener("dragend", clearAttachmentDrag, true);
  window.removeEventListener("drop", clearAttachmentDrag, true);
  window.removeEventListener("blur", clearAttachmentDrag);
});
watch([creating, opening], ([creating, opening]) => {
  if (creating || opening) clearAttachmentDrag();
}, { flush: "sync" });

const selectedModel = ref("");
const reasoningEffort = ref("");
const projectSearch = ref("");
const filteredProjects = computed(() => sortedProjects.value.filter(item => item.name.toLocaleLowerCase().includes(projectSearch.value.trim().toLocaleLowerCase())));
const sortDescending = ref(true);
const viewMode = ref("grid");
const sortedProjects = computed(() => [...projectList.value].sort((left, right) =>
  sortDescending.value ? right.lastOpenedAt - left.lastOpenedAt : left.lastOpenedAt - right.lastOpenedAt
));

function pasteAttachments(event: ClipboardEvent) {
  if (creating.value || opening.value) return;
  try {
    const files = Array.from(event.clipboardData?.files ?? []);
    if (!files.length) {
      const file = createPastedTextFile(event.clipboardData?.getData("text/plain") ?? "");
      if (file) files.push(file);
    }
    if (!files.length) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    addAttachments(files);
  } catch (error) {
    event.preventDefault();
    event.stopImmediatePropagation();
    ElMessage.error(error instanceof Error ? error.message : "添加附件失败，请重试");
  }
}

function selectAttachments(event: Event) {
  const input = event.target as HTMLInputElement;
  addAttachments(Array.from(input.files ?? []));
  input.value = "";
}

function clearAttachmentDrag() {
  attachmentDragDepth = 0;
  draggingAttachments.value = false;
}

function dragEnterAttachments(event: DragEvent) {
  if (!event.dataTransfer?.types.includes("Files")) return;
  event.preventDefault();
  event.stopPropagation();
  if (creating.value || opening.value) return clearAttachmentDrag();
  attachmentDragDepth++;
  draggingAttachments.value = true;
}

function dragOverAttachments(event: DragEvent) {
  if (!event.dataTransfer?.types.includes("Files")) return;
  event.preventDefault();
  event.stopPropagation();
  event.dataTransfer.dropEffect = creating.value || opening.value ? "none" : "copy";
  if (creating.value || opening.value) return clearAttachmentDrag();
  attachmentDragDepth = Math.max(1, attachmentDragDepth);
  draggingAttachments.value = true;
}

function dragLeaveAttachments(event: DragEvent) {
  if (!draggingAttachments.value) return;
  attachmentDragDepth = Math.max(0, attachmentDragDepth - 1);
  const target = event.currentTarget;
  if (!attachmentDragDepth || (target instanceof Node && event.relatedTarget instanceof Node && !target.contains(event.relatedTarget))) clearAttachmentDrag();
}

function dropAttachments(event: DragEvent) {
  if (!event.dataTransfer?.types.includes("Files")) return;
  event.preventDefault();
  event.stopPropagation();
  clearAttachmentDrag();
  addAttachments(Array.from(event.dataTransfer.files));
}

function addAttachments(files: File[]) {
  if (creating.value || opening.value) return;
  for (const file of files) {
    const readableMimeType = getReadableFileMimeType(file.name, file.type);
    const mimeType = readableMimeType ?? file.type.split(";")[0]!.trim().toLowerCase();
    if (!readableMimeType && !/^(image|video)\//.test(mimeType)) {
      ElMessage.warning("只支持图片、视频和受支持的文本或文档文件");
      continue;
    }
    if (!file.size || file.size > 100 * 1024 * 1024) {
      ElMessage.warning("附件不能为空且不能超过 100 MB");
      continue;
    }
    if (mimeType === "text/plain" && file.size > 400000) {
      ElMessage.warning("文本附件不能超过 400000 字节");
      continue;
    }
    if (promptAttachments.value.length >= 20) {
      ElMessage.warning("每条消息最多添加 20 个附件");
      break;
    }
    promptAttachments.value.push({ name: file.name, path: "", mimeType, file });
  }
}

async function restoreAttachment(index: number) {
  const attachment = promptAttachments.value[index];
  if (attachment?.mimeType !== "text/plain" || creating.value || opening.value) return;
  try {
    const text = await readTextAttachment(attachment);
    const currentIndex = promptAttachments.value.indexOf(attachment);
    if (currentIndex < 0 || creating.value || opening.value) return;
    prompt.value += `${prompt.value ? "\n" : ""}${text}`;
    promptAttachments.value.splice(currentIndex, 1);
    await nextTick();
    promptInput.value?.focus();
    promptInput.value?.textarea?.setSelectionRange(prompt.value.length, prompt.value.length);
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "取回文本失败，请重试");
  }
}

async function openProject(project?: Project) {
  if (creating.value || opening.value) return;
  opening.value = true;
  try {
    const directory = project?.directory ?? await relocationPicker.value?.chooseDirectory();
    if (!directory) return;
    try { await workspaceStore.openProject(directory); }
    catch (err) {
      if (!project || !axios.isAxiosError(err) || err.response?.status !== 404) throw err;
      const reselect = await ElMessageBox.confirm(`项目“${project.name}”的文件夹不存在，是否重新选择文件夹？`, "工作目录不存在", {
        confirmButtonText: "重新选择", cancelButtonText: "取消", type: "warning",
      }).then(() => true, () => false);
      if (!reselect) return;
      const directory = await relocationPicker.value?.chooseDirectory();
      if (!directory) return;
      await workspaceStore.openProject(directory, project.directory);
    }
    await router.push("/workspace");
  } catch (err) {
    ElMessage.error(axios.isAxiosError<{ message?: string }>(err)
      ? err.response?.data.message || "无法打开项目，请重试"
      : err instanceof Error ? err.message : "无法打开项目，请重试");
  } finally { opening.value = false; }
}

async function renameProject(project: Project) {
  const result = await ElMessageBox.prompt("请输入项目名称", "重命名项目", {
    inputValue: project.name, confirmButtonText: "保存", cancelButtonText: "取消",
    inputValidator: value => !!value?.trim() || "项目名称不能为空",
  }).catch(() => null);
  if (result) workspaceStore.renameProject(project.directory, result.value);
}

function changeCreationMode() { promptInput.value?.focus(); }
function handlePromptKeydown(event: Event | KeyboardEvent) {
  if (!(event instanceof KeyboardEvent)) return;
  if (event.key !== "Enter" || event.shiftKey || event.isComposing || event.keyCode === 229) return;
  event.preventDefault();
  if (!creating.value && !opening.value && prompt.value.trim()) void createProject();
}
type ConversationHistory = AgentHistory & { directory: string; projectName: string };
const conversationHistory = ref<ConversationHistory[]>([]);
const historyLoading = ref(false);
const historyError = ref("");
watch(homeSection, async section => {
  if (section !== "history") return;
  historyLoading.value = true;
  historyError.value = "";
  try {
    const lists = await Promise.all(workspaceStore.projectList.map(async project => {
      const items = browserWorkspaceMode ? await listBrowserConversations(project.directory) : (await axios.get<{ data: AgentHistory[] }>("/api/agent/list", { params: { directory: project.directory }, headers: { "x-toonflow-workspace": "1" } })).data.data;
      return items.map(item => ({ ...item, directory: project.directory, projectName: project.name }));
    }));
    conversationHistory.value = lists.flat().sort((a, b) => b.modified.localeCompare(a.modified));
  } catch (error) { historyError.value = error instanceof Error ? error.message : "读取历史对话失败"; }
  finally { historyLoading.value = false; }
});
async function openHistory(item: ConversationHistory) {
  if (opening.value || creating.value) return;
  opening.value = true;
  try {
    await workspaceStore.openProject(item.directory);
    workspaceStore.pendingAgentSession = { directory: item.directory, file: item.file };
    await router.push("/workspace");
  } catch (error) { ElMessage.error(error instanceof Error ? error.message : "打开历史对话失败"); }
  finally { opening.value = false; }
}

async function createProject(fromPrompt = true) {
  if (fromPrompt && !prompt.value.trim()) return;
  if (fromPrompt && browserWorkspaceMode && !browserConfig.enabled) { generationError.value = "请先在设置 → API 配置中启用模型并输入 Key"; return; }
  if (fromPrompt && browserConfig.enabled && workspaceStore.creationMode === "simple" && !browserConfig.keys[inferGenerationKind(prompt.value)].trim()) {
    generationError.value = "请先在设置 → API 配置中输入当前模型的 Key。";
    return;
  }
  if (creating.value || opening.value || (fromPrompt && !workspaceDirectory.value && !browserWorkspaceMode)) return;
  creating.value = true;
  try {
    let path = workspaceDirectory.value;
    if (browserWorkspaceMode) {
      let name = "未命名项目";
      if (!fromPrompt) {
        const result = await ElMessageBox.prompt("输入项目名称，画布与素材将保存在当前浏览器", "添加项目", { inputValue: "未命名项目", confirmButtonText: "创建", cancelButtonText: "取消", inputValidator: value => !!value?.trim() || "请输入项目名称" }).catch(() => null);
        if (!result) return;
        name = result.value.trim();
      }
      if (!fromPrompt || !workspaceStore.project) path = `browser://${crypto.randomUUID()}`;
      const files = useWorkspaceFiles(path);
      const { entries } = await files.list();
      if (!entries.length) await files.writeJson("画布1.json", { toonflowCanvas: true, nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } }, true);
      await workspaceStore.openProject(path);
      if (!fromPrompt || name !== "未命名项目") workspaceStore.renameProject(path, name);
      if (fromPrompt && (prompt.value.trim() || promptAttachments.value.length)) workspaceStore.pendingAgentMessage = { directory: path, prompt: prompt.value, attachments: [...promptAttachments.value], model: selectedModel.value, reasoningEffort: reasoningEffort.value };
      await router.push("/workspace");
      return;
    }
    if (!fromPrompt) {
      const confirmed = await ElMessageBox.confirm("请选择一个空文件夹作为项目目录，画布和素材将保存在其中。", "添加项目", {
        confirmButtonText: "选择空文件夹", cancelButtonText: "取消", type: "info",
      }).then(() => true, () => false);
      if (!confirmed) return;
      path = await relocationPicker.value?.chooseDirectory() ?? "";
      if (!path) return;
    }
    const { directory, empty } = await useWorkspaceFiles(path).list();
    if (fromPrompt && directory === workspaceStore.project?.directory) {
      workspaceStore.pendingAgentMessage = { directory, prompt: prompt.value, attachments: [...promptAttachments.value], model: selectedModel.value, reasoningEffort: reasoningEffort.value };
      await router.push("/workspace");
      return;
    }
    if (!empty) return ElMessage.warning("该文件夹不为空，请重新选择空文件夹；已有项目请使用“导入项目”或点击项目列表打开。");
    await useWorkspaceFiles(directory).writeJson("画布1.json", { toonflowCanvas: true, nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } }, true);
    await workspaceStore.openProject(directory);
    if (fromPrompt && (prompt.value.trim() || promptAttachments.value.length)) {
      workspaceStore.pendingAgentMessage = { directory: workspaceStore.project!.directory, prompt: prompt.value, attachments: [...promptAttachments.value], model: selectedModel.value, reasoningEffort: reasoningEffort.value };
    }
    await router.push("/workspace");
  } catch (err) {
    ElMessage.error(axios.isAxiosError<{ message?: string }>(err)
      ? err.response?.data.message || "创建项目失败，请重试"
      : err instanceof Error ? err.message : "创建项目失败，请重试");
  } finally {
    creating.value = false;
  }
}
</script>

<style lang="scss" scoped>
.home {
  position: relative;
  padding-left: 220px;
  isolation: isolate;

  .homeHistory { padding-top: 24px; .historyEntry { display: flex; align-items: center; gap: 12px; width: 100%; padding: 16px; margin: 8px 0; border: 1px solid var(--el-border-color-light); border-radius: 12px; background: var(--el-bg-color); color: var(--el-text-color-primary); text-align: left; cursor: pointer; span { display: grid; gap: 6px; } small { color: var(--el-text-color-secondary); } &:hover { border-color: var(--el-color-primary); } } }
  .homeAssets { padding-top: 24px; :deep(.assetLibrary) { width: 100%; max-height: none; } }
  .studioSidebar {
    position: fixed; inset: 0 auto 0 0; z-index: 6; width: 220px; display: flex; flex-direction: column; gap: 16px; padding: 30px 20px; border-right: 1px solid var(--el-border-color-light); background: var(--el-bg-color);
    .studioBrand { font-size: 24px; font-weight: 700; letter-spacing: -.8px; color: var(--el-text-color-primary); border: 0; background: transparent; text-align: left; padding: 0 0 14px; cursor: pointer; }
    nav { display: grid; gap: 5px; button { display: flex; align-items: center; gap: 10px; padding: 12px; border: 0; border-radius: var(--el-border-radius-base); background: transparent; color: var(--el-text-color-regular); font: inherit; font-size: 14px; cursor: pointer; &[aria-current="page"] { background: var(--el-color-primary-light-9); color: var(--el-color-primary); } } }
    p { margin: 8px 10px 0; color: var(--el-text-color-secondary); font-size: 12px; }
    .recentProject { display: flex; align-items: center; gap: 8px; padding: 8px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; border: 0; background: transparent; color: var(--el-text-color-regular); text-align: left; cursor: pointer; svg { flex: none; } }
    .sidebarFooter { margin-top: auto; display: grid; gap: 6px; .el-button { justify-content: flex-start; margin: 0; } }
  }
  @media (max-width: 760px) { padding-left: 0; .studioSidebar { display: none; } }

  min-height: 100dvh;
  color: var(--el-text-color-primary);

  .pageBackground {
    position: absolute;
    inset: 0;
    z-index: -1;
    pointer-events: none;
  }



  .pageHeader {
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 72px;
    padding: 0 clamp(20px, 4vw, 56px);

    .headerActions { display: flex; align-items: center; gap: 12px; }

    a {
      text-decoration: none;
    }


  }

  .pageContent {
    padding: 24px clamp(20px, 4vw, 56px) 56px;

    .creationPanel {
      max-width: 800px;
      margin: clamp(32px, 6vh, 64px) auto 56px;

      .brand {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 16px;
        margin-bottom: 36px;

        .brandLogo {
          width: 48px;
          height: 48px;

          .dark & {
            filter: invert(1);
          }
        }

        h1 {
          margin: 0;
          font-size: clamp(30px, 4vw, 38px);
          font-weight: 600;
          letter-spacing: -1px;
        }
      }

      .promptArea {
        position: relative;



        .promptCard {
          position: relative;
          border-radius: calc(var(--ui-radius) * 2.5);
          border-color: var(--el-border-color-lighter);
          box-shadow: var(--el-box-shadow-lighter);

          &:focus-within {
            border-color: var(--el-color-primary-light-5);
          }

          &.draggingAttachments {
            border-color: var(--el-color-primary-light-5);
          }

          .attachmentDropOverlay {
            position: absolute;
            inset: 0;
            z-index: 2;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 4px;
            border-radius: inherit;
            background: var(--el-bg-color);
            color: var(--el-text-color-primary);
            pointer-events: none;

            > svg { color: var(--el-text-color-secondary); }
            strong { font-size: 14px; font-weight: 500; }
            span { color: var(--el-text-color-secondary); font-size: 12px; }
          }

          .promptAttachments {
            margin-bottom: 12px;
            :deep(.thumbnailItem) { width: 68px; height: 68px; }
          }

          :deep(.el-textarea__inner) {
            padding: 4px 0;
            box-shadow: none;
            background: transparent;
            font-size: 15px;
            line-height: 1.8;
          }

          :deep(.el-card__footer) {
            background: var(--el-fill-color-extra-light);
          }

          .composerFooter {
            display: flex;
            align-items: center;
            justify-content: space-between;
            flex-wrap: wrap;
            gap: 12px;

            .sendActions {
              margin-left: auto;
              justify-content: flex-end;

              .modelSelect {
                width: 190px;
              }

              .sendButton {
                height: 36px;

                &.is-circle { width: 36px; }
              }
            }
          }

          .workspaceHint {
            margin: 12px 0 0;
            color: var(--el-text-color-regular);
            font-size: 13px;
            line-height: 1.6;
          }
        }
      }
    }

    .projectList {
      max-width: 1040px;
      margin: 0 auto;

      .projectItems {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(min(100%, 280px), 1fr));
        gap: 16px;
        margin-top: 16px;

        &.listView { grid-template-columns: 1fr; }

        .projectCard {
          position: relative;

          .projectActions {
            position: absolute;
            top: 12px;
            right: 8px;
            display: flex;
            gap: 4px;

            .el-button { width: 32px; height: 32px; margin: 0; padding: 0; }
          }
        }

        .projectEntry {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: 12px;
          width: 100%;
          padding: 16px;
          border: 0;
          background: transparent;
          color: inherit;
          font: inherit;
          text-align: left;
          cursor: pointer;

          &:focus-visible { outline: 2px solid var(--el-color-primary); outline-offset: -2px; }
          &:disabled { cursor: wait; opacity: 0.6; }

          .projectIcon { flex-shrink: 0; color: var(--el-text-color-secondary); }

          .projectInfo {
            display: flex;
            flex-direction: column;
            gap: 6px;
            min-width: 0;

            .projectName, .projectPath {
              overflow: hidden;
              text-overflow: ellipsis;
              white-space: nowrap;
            }

            .projectName { font-weight: 600; }
            .projectPath { font-size: 13px; color: var(--el-text-color-regular); }
            .projectTime { font-size: 12px; color: var(--el-text-color-secondary); }
          }
        }
      }

      .sectionHeader {
        display: flex;
        align-items: center;
        justify-content: space-between;
        flex-wrap: wrap;
        gap: 16px;
        padding-bottom: 16px;
        border-bottom: 1px solid var(--el-border-color-lighter);

        h2 {
          margin: 0;
          font-size: 18px;
          font-weight: 600;
        }
      }
    }
  }
}

@keyframes hintNudge {
  0%, 100% { transform: translateX(0) rotate(-3deg); }
  50% { transform: translateX(-6px) rotate(-5deg); }
}
</style>
