<template>
  <el-container class="home">
    <bg class="pageBackground" />
    <aside class="studioSidebar" aria-label="主导航">
      <button class="studioBrand" @click="homeSection = 'create'">ai-studio</button>
      <el-button type="primary" :icon="IconPlus" @click="newCreation">新建创作</el-button>
      <nav>
        <button :aria-current="homeSection === 'create' ? 'page' : undefined" @click="homeSection = 'create'"><icon-sparkles :size="18" />创作</button>
        <button :aria-current="homeSection === 'history' ? 'page' : undefined" @click="homeSection = 'history'"><icon-history :size="18" />历史对话</button>
        <button @click="homeSection = 'assets'"><icon-photo :size="18" />个人资产</button>
        <button :aria-current="homeSection === 'projects' ? 'page' : undefined" @click="homeSection = 'projects'"><icon-folder :size="18" />我的项目</button>
      </nav>
      <p>最近项目</p>
      <button v-for="item in sortedProjects.slice(0, 5)" :key="item.directory" class="recentProject" :title="item.name" @click="openProject(item)"><projectThumbnail :directory="item.directory" /><span><strong>{{ item.name }}</strong><small>{{ new Date(item.lastOpenedAt).toLocaleString(locale, { hour12: false }) }}</small></span></button>
      <div class="sidebarFooter"><el-button text :icon="IconPalette" @click="settingsVisible = true">外观与设置</el-button></div>
    </aside>
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
            <creationPrompt ref="promptInput" v-model="prompt" :disabled="creating || opening" :placeholder="promptPlaceholder" @paste="pasteAttachments" @send="createProject()" />
            <template #footer>
              <div class="composerFooter">
                <browserProjectPicker v-if="browserWorkspaceMode" ref="browserProjectPickerRef" v-model="workspaceDirectory" :disabled="creating || opening" />
                <workspacePicker v-else ref="promptWorkspacePicker" v-model="workspaceDirectory" :disabled="creating || opening" />
                <el-space class="sendActions" wrap :size="12">
                  <simpleGenerationTools v-if="workspaceStore.creationMode === 'simple'" />
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
        <h2>历史对话</h2><el-input v-model="historySearch" placeholder="搜索对话名称或项目" aria-label="搜索历史对话" clearable />
        <p v-if="historyLoading" role="status">正在读取历史对话…</p>
        <el-alert v-if="historyError" :title="historyError" type="error" :closable="false" />
        <div v-for="item in filteredHistory" :key="`${item.directory}:${item.file}`" class="historyEntry">
          <button class="historyOpen" type="button" :disabled="opening || creating || historyLoading" @click="openHistory(item)"><icon-history :size="18" /><span><strong>{{ item.name }}</strong><small>{{ item.projectName }} · {{ item.messageCount }} 条消息</small></span></button>
          <el-button text :disabled="historyLoading" :aria-label="`重命名对话 ${item.name}`" @click="renameHistory(item)">重命名</el-button>
          <el-button text type="danger" :disabled="historyLoading" :aria-label="`删除对话 ${item.name}`" @click="removeHistory(item)">删除</el-button>
        </div>
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
              <el-button text :icon="IconEdit" :disabled="creating || opening" :aria-label="`重命名项目 ${project.name}`" title="编辑" @click="renameProject(project)" />
              <el-button text type="danger" :icon="IconTrash" :disabled="creating || opening" :aria-label="`移除项目 ${project.name}`" title="删除" @click="workspaceStore.removeProject(project.directory)" />
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
import { useRouter, useRoute } from "vue-router";
import { ElMessage, ElMessageBox } from "element-plus";
import { getReadableFileMimeType, readableFileAccept } from "@toonflow/server/documentFormats";
import {
  IconPlus, IconSparkles, IconPalette, IconHistory,
  IconArrowUp, IconLayoutGrid,
  IconList, IconSortDescending,
  IconSortAscending, IconFolder, IconEdit,
  IconTrash, IconFolderPlus, IconFolderOpen, IconPaperclip,
} from "@tabler/icons-vue";
import { inferGenerationKind, configuredBrowserModels, browserConfig, generationError } from "@/stores/browserGeneration";
import creationPrompt from "@/components/creationPrompt.vue";
import { applyTemplateParameters, type TemplateApplication } from "@/lib/creationTemplates";
import browserProjectPicker from "@/components/browserProjectPicker.vue";
import simpleGenerationTools from "@/components/simpleGenerationTools.vue";
import browserModelOptions from "@/components/browserModelOptions.vue";
import { listBrowserConversations, renameBrowserConversation, removeBrowserConversation } from "@/components/agent/browserConversations";
import type { AgentHistory } from "@/components/agent/types";
import projectThumbnail from "@/components/projectThumbnail.vue";
import referencePicker from "@/components/referencePicker.vue";
import modelPopover from "@/components/modelPopover.vue";
import attachmentList from "@/components/agent/attachmentList.vue";
import { createPastedTextFile, readTextAttachment } from "@/components/agent/textAttachments";
import type { AgentAttachment } from "@/components/agent/types";
import logoUrl from "@toonflow/assets/logo.svg";
import { useWorkspaceStore, type Project } from "@/stores/workspace";
import { browserWorkspaceMode } from "@/lib/browserWorkspaceFiles";
import useWorkspaceFiles from "@/lib/workspaceFiles";
import settings from "@/components/settings/index.vue";
import bg from "./bg.vue";
import creationModeSwitch from "@/components/creationModeSwitch.vue";
import assetLibrary from "@/pages/workspace/panels/canvas/components/assetLibrary.vue";
import creativeCases from "@/components/creativeCases.vue";
import workspacePicker from "./workspacePicker.vue";

const settingsVisible = ref(false);
const browserProjectPickerRef = ref<InstanceType<typeof browserProjectPicker>>();
const route = useRoute();
const homeSection = computed({
  get: () => ["create", "history", "assets", "projects"].includes(String(route.query.section)) ? String(route.query.section) : "create",
  set: section => { void router.replace({ path: "/home", query: { section } }); },
});
const appliedTemplate = ref(false);
async function newCreation() {
  homeSection.value = "create";
  await nextTick();
  if (await browserProjectPickerRef.value?.choose(true)) {
    prompt.value = ""; promptAttachments.value = []; appliedTemplate.value = false; promptInput.value?.focus();
  }
}
async function applyCase(value: TemplateApplication) {
  if (!appliedTemplate.value && (prompt.value.trim() || promptAttachments.value.length)) {
    if (!await ElMessageBox.confirm("应用模板将替换当前提示词和引用素材。", "应用模板", { confirmButtonText: "应用模板", cancelButtonText: "保留草稿" }).then(() => true, () => false)) return;
  }
  appliedTemplate.value = true;
  applyTemplateParameters(value.template);
  prompt.value = value.prompt;
  promptAttachments.value = [];
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
const promptInput = ref<InstanceType<typeof creationPrompt>>();
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
    await router.push({ path: "/workspace", query: { returnSection: homeSection.value } });
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
type ConversationHistory = AgentHistory & { directory: string; projectName: string };
const conversationHistory = ref<ConversationHistory[]>([]);
const historyLoading = ref(false);
const historyError = ref("");
const historySearch = ref("");
const filteredHistory = computed(() => conversationHistory.value.filter(item => `${item.name} ${item.projectName}`.toLowerCase().includes(historySearch.value.trim().toLowerCase())));
async function renameHistory(item: ConversationHistory) {
  const result = await ElMessageBox.prompt("请输入对话名称", "重命名对话", { inputValue: item.name, confirmButtonText: "保存", cancelButtonText: "取消", inputValidator: value => !!value?.trim() && value.trim().length <= 80 || "请输入 1–80 个字符" }).catch(() => null);
  if (!result) return;
  historyLoading.value = true;
  try {
    const name = result.value.trim();
    if (browserWorkspaceMode) await renameBrowserConversation(item.directory, item.file, name);
    else await axios.patch("/api/agent/rename", { directory: item.directory, sessionFile: item.file, name }, { headers: { "x-toonflow-workspace": "1" } });
    item.name = name;
  } catch (error) { ElMessage.error(error instanceof Error ? error.message : "重命名对话失败"); }
  finally { historyLoading.value = false; }
}
async function removeHistory(item: ConversationHistory) {
  if (!await ElMessageBox.confirm(`删除对话“${item.name}”？已保存到画布的素材会保留。`, "删除对话", { confirmButtonText: "删除", cancelButtonText: "取消", type: "warning" }).then(() => true, () => false)) return;
  historyLoading.value = true;
  try {
    if (browserWorkspaceMode) await removeBrowserConversation(item.directory, item.file);
    else await useWorkspaceFiles(item.directory).remove(`.agent/sessions/${item.file}`);
    conversationHistory.value = conversationHistory.value.filter(entry => entry !== item);
  } catch (error) { ElMessage.error(error instanceof Error ? error.message : "删除对话失败"); }
  finally { historyLoading.value = false; }
}
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
}, { immediate: true });
async function openHistory(item: ConversationHistory) {
  if (opening.value || creating.value) return;
  opening.value = true;
  try {
    await workspaceStore.openProject(item.directory);
    workspaceStore.pendingAgentSession = { directory: item.directory, file: item.file };
    await router.push({ path: "/workspace", query: { returnSection: homeSection.value } });
  } catch (error) { ElMessage.error(error instanceof Error ? error.message : "打开历史对话失败"); }
  finally { opening.value = false; }
}

async function createProject(fromPrompt = true) {
  if (fromPrompt && !prompt.value.trim()) return;
  if (fromPrompt && browserWorkspaceMode && !workspaceDirectory.value) {
    const chosen = await browserProjectPickerRef.value?.choose();
    if (!chosen) return;
    workspaceDirectory.value = chosen;
  }
  if (fromPrompt && browserWorkspaceMode && !browserConfig.enabled && workspaceStore.creationMode === "simple") { generationError.value = "请先在设置 → API 配置中启用模型并输入 Key"; return; }
  if (fromPrompt && browserConfig.enabled && workspaceStore.creationMode === "simple" && !configuredBrowserModels(inferGenerationKind(prompt.value)).length) {
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
      if (!fromPrompt) path = `browser://${crypto.randomUUID()}`;
      const files = useWorkspaceFiles(path);
      const { entries } = await files.list();
      if (!entries.length) await files.writeJson("画布1.json", { toonflowCanvas: true, nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } }, true);
      await workspaceStore.openProject(path);
      if (!fromPrompt || name !== "未命名项目") workspaceStore.renameProject(path, name);
      if (fromPrompt && (prompt.value.trim() || promptAttachments.value.length)) workspaceStore.pendingAgentMessage = { directory: path, prompt: prompt.value, attachments: [...promptAttachments.value], model: selectedModel.value, reasoningEffort: reasoningEffort.value };
      await router.push({ path: "/workspace", query: { returnSection: homeSection.value } });
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
      await router.push({ path: "/workspace", query: { returnSection: homeSection.value } });
      return;
    }
    if (!empty) return ElMessage.warning("该文件夹不为空，请重新选择空文件夹；已有项目请使用“导入项目”或点击项目列表打开。");
    await useWorkspaceFiles(directory).writeJson("画布1.json", { toonflowCanvas: true, nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } }, true);
    await workspaceStore.openProject(directory);
    if (fromPrompt && (prompt.value.trim() || promptAttachments.value.length)) {
      workspaceStore.pendingAgentMessage = { directory: workspaceStore.project!.directory, prompt: prompt.value, attachments: [...promptAttachments.value], model: selectedModel.value, reasoningEffort: reasoningEffort.value };
    }
    await router.push({ path: "/workspace", query: { returnSection: homeSection.value } });
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

  .homeHistory { padding-top: 24px; .historyOpen { display: flex; align-items: center; gap: 12px; flex: 1; min-width: 0; border: 0; background: transparent; color: inherit; text-align: left; cursor: pointer; } .historyEntry { display: flex; align-items: center; gap: 12px; width: 100%; padding: 8px 10px; margin: 6px 0; border: 1px solid var(--el-border-color-light); border-radius: 12px; background: var(--el-bg-color); color: var(--el-text-color-primary); text-align: left; cursor: pointer; span { display: grid; gap: 6px; } small { color: var(--el-text-color-secondary); font-size: 11px; } strong { font-size: 13px; } &:hover { border-color: var(--el-color-primary); } } }
  .homeAssets { padding-top: 24px; :deep(.assetLibrary) { width: 100%; max-height: none; } }
  .studioSidebar {
    position: fixed; inset: 0 auto 0 0; z-index: 6; width: 220px; display: flex; flex-direction: column; gap: 16px; padding: 30px 20px; border-right: 1px solid var(--el-border-color-light); background: var(--el-bg-color);
    .studioBrand { font-size: 24px; font-weight: 700; letter-spacing: -.8px; color: var(--el-text-color-primary); border: 0; background: transparent; text-align: left; padding: 0 0 14px; cursor: pointer; }
    nav { display: grid; gap: 5px; button { display: flex; align-items: center; gap: 10px; padding: 12px; border: 0; border-radius: var(--el-border-radius-base); background: transparent; color: var(--el-text-color-regular); font: inherit; font-size: 14px; cursor: pointer; &[aria-current="page"] { background: var(--el-color-primary-light-9); color: var(--el-color-primary); } } }
    p { margin: 8px 10px 0; color: var(--el-text-color-secondary); font-size: 12px; }
    .recentProject { :deep(.projectThumbnail) { width: 48px; height: 48px; border-radius: 8px; } span { min-width: 0; display: grid; gap: 5px; } strong { font-size: 12px; overflow: hidden; text-overflow: ellipsis; } small { font-size: 10px; white-space: normal; color: var(--el-text-color-secondary); } display: flex; align-items: center; gap: 8px; padding: 8px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; border: 0; background: transparent; color: var(--el-text-color-regular); text-align: left; cursor: pointer; svg { flex: none; } }
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
        grid-template-columns: repeat(auto-fill, minmax(180px, 210px));
        gap: 16px;
        margin-top: 16px;

        &.listView { grid-template-columns: repeat(auto-fill, minmax(200px, 240px)); .projectEntry { height: 138px; flex-direction: row; align-items: center; :deep(.projectThumbnail) { width: 72px; height: 100px; } .projectInfo { flex: 1; } } }

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
          gap: 6px;
          width: 100%;
          padding: 10px;
          :deep(.projectThumbnail) { height: 72px; border-radius: 8px; }
          .projectInfo { gap: 3px; width: 100%; }
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
            gap: 3px;
            min-width: 0;

            .projectName, .projectPath {
              overflow: hidden;
              text-overflow: ellipsis;
              white-space: nowrap;
            }

            .projectName { font-size: 13px; line-height: 18px; font-weight: 600; }
            .projectPath { font-size: 11px; line-height: 16px; color: var(--el-text-color-regular); }
            .projectTime { font-size: 10px; line-height: 14px; color: var(--el-text-color-secondary); }
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
