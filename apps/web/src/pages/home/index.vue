<template>
  <el-container class="home" :class="{ navigationCollapsed, assetWorkspace: homeSection === 'assets' }">

    <studioSidebar :activeSection="homeSection" :disabled="creating || opening" @navigate="navigateSection" @newAgent="startAgent" @openProject="openProject" @openSettings="settingsVisible = true" />
    <el-main v-if="examplesReady" class="pageContent">
      <section v-if="homeSection === 'create'" class="homeLanding" aria-label="首页">
        <button class="newCanvasEntry" type="button" :disabled="creating || opening" @click="createCanvas()"><span class="canvasPlus"><icon-plus :size="28" /></span><strong>新建画布创作</strong></button>
        <div class="nodeShortcuts" aria-label="节点快捷创作"><button v-for="item in nodeShortcuts" :key="item.type" type="button" :disabled="creating || opening" :aria-label="`新建${item.label}节点项目`" @click="createCanvas(item.type)"><span><component :is="item.icon" :size="26" /></span>{{ item.label }}</button></div>
        <section class="recentSection" aria-label="最近项目"><div class="sectionHeader"><h2>最近项目</h2><el-button text @click="homeSection = 'projects'">查看全部</el-button></div><div class="recentCards"><button v-for="item in recentProjects" :key="item.directory" type="button" class="recentCard" :disabled="creating || opening" :aria-label="`打开项目 ${item.name}`" @click="openProject(item)"><projectThumbnail :directory="item.directory" /><span><strong>{{ item.name }}</strong><small>最近编辑 {{ formatTime(item.lastEditedAt ?? item.lastOpenedAt) }}</small></span></button></div></section>
        <creativeCases curated />
      </section>
      <creativeCases ref="templateCenter" v-show="homeSection === 'templates'" @apply="applyCase" />
      <templateReview v-if="homeSection === 'reviews'" />
      <section v-if="homeSection === 'history'" class="homeHistory" aria-label="历史对话">
        <h2>历史对话</h2><el-input v-model="historySearch" placeholder="搜索对话名称或项目" aria-label="搜索历史对话" clearable />
        <p v-if="historyLoading" role="status">正在读取历史对话…</p><el-alert v-if="historyError" :title="historyError" type="error" :closable="false" />
        <div v-for="item in filteredHistory" :key="`${item.directory}:${item.file}`" class="historyEntry"><button class="historyOpen" type="button" :disabled="opening || creating || historyLoading" @click="openHistory(item)"><icon-history :size="18" /><span><strong>{{ item.name }}</strong><small>{{ item.projectName }} · {{ item.messageCount }} 条消息</small></span></button><el-button text :disabled="historyLoading" @click="renameHistory(item)">重命名</el-button><el-button text type="danger" :disabled="historyLoading" @click="removeHistory(item)">删除</el-button></div>
      </section>
      <assetsPage v-if="homeSection === 'assets'" />
      <section v-show="homeSection === 'projects'" class="projectList" aria-labelledby="projectListTitle">
        <div class="sectionHeader"><h2 id="projectListTitle">我的项目</h2><el-input class="projectSearch" v-model="projectSearch" placeholder="按项目名搜索" aria-label="按项目名搜索" clearable style="max-width:240px" /><el-space wrap><el-button v-if="!browserWorkspaceMode" :icon="IconFolderOpen" @click="openProject()">导入项目</el-button><el-button :icon="IconPlus" :disabled="creating || opening" @click="createProjectFolder()">新建文件夹</el-button><el-button circle :icon="sortDescending ? IconSortDescending : IconSortAscending" aria-label="切换时间排序" @click="sortDescending = !sortDescending" /><el-radio-group v-model="viewMode" aria-label="项目视图"><el-radio-button value="grid" aria-label="网格视图"><icon-layout-grid :size="16" /></el-radio-button><el-radio-button value="list" aria-label="列表视图"><icon-list :size="16" /></el-radio-button></el-radio-group></el-space></div>
        <div v-if="activeFolder" class="folderBreadcrumb"><button type="button" @click="activeFolder = ''" @dragover.prevent @drop.prevent="dropProject($event, '')">我的项目</button><icon-chevron-right :size="16" /><span>{{ activeFolder }}</span></div>
        <div class="projectItems" :class="{ listView: viewMode === 'list' }">
          <newCanvasCard class="startCreationCard" :disabled="creating || opening" @click="createCanvas()" />
          <article v-for="folder in visibleFolders" :key="`folder:${folder}`" class="projectFolderCard" :class="{ dragOver: dragFolder === folder }" @dragover.prevent="dragFolder = folder" @dragleave="dragFolder = ''" @drop.prevent="dropProject($event, folder)"><button class="folderEntry" type="button" @click="activeFolder = folder"><img class="folderPreview" src="/projectFolder.svg" alt="" /><span class="folderInfo"><strong>{{ folder }}</strong><small>{{ workspaceStore.projectList.filter(item => item.folder === folder).length }} 个项目</small></span></button><el-dropdown class="folderActions" trigger="click" @command="command => folderAction(folder, command)"><el-button text :aria-label="`文件夹操作 ${folder}`"><icon-dots :size="20" /></el-button><template #dropdown><el-dropdown-menu><el-dropdown-item command="rename">重命名</el-dropdown-item><el-dropdown-item command="remove">删除</el-dropdown-item></el-dropdown-menu></template></el-dropdown></article>
          <el-card v-for="project in filteredProjects" :key="project.directory" class="projectCard" draggable="true" @dragstart="dragProject($event, project)" @dragend="dragFolder = ''" shadow="hover" :bodyStyle="{ padding: '0' }"><button class="projectEntry" type="button" :disabled="creating || opening" :aria-label="`打开项目 ${project.name}`" @click="openProject(project)"><projectThumbnail :key="`${project.directory}:${coverVersions[project.directory] ?? 0}`" :directory="project.directory" /><span class="projectInfo"><strong :title="project.name">{{ project.name }}</strong><small>最近编辑 {{ formatTime(project.lastEditedAt ?? project.lastOpenedAt) }}</small></span></button><div class="projectActions"><el-dropdown trigger="click" placement="bottom-end" @command="command => projectAction(project, command)">
          <el-button text :disabled="creating || opening || projectBusy" :aria-label="`更多项目操作 ${project.name}`" title="更多操作"><icon-dots :size="20" /></el-button>
          <template #dropdown><el-dropdown-menu>
            <el-dropdown-item command="open">打开</el-dropdown-item><el-dropdown-item command="rename">重命名</el-dropdown-item><el-dropdown-item command="cover">修改封面</el-dropdown-item><el-dropdown-item command="copy" :disabled="!browserWorkspaceMode">创建副本</el-dropdown-item><el-dropdown-item v-if="browserWorkspaceMode" command="template">制作模板</el-dropdown-item>
            <el-dropdown-item><el-popover trigger="hover" placement="right-start" :width="180" :showArrow="false"><template #reference><span class="projectMoveLabel">移动至文件夹 <icon-chevron-right :size="14" /></span></template><div class="projectFolders"><el-button text @click="moveProject(project, '')">根文件夹</el-button><el-button v-for="folder in projectFolders" :key="folder" text @click="moveProject(project, folder)">{{ folder }}</el-button><el-button text @click="createProjectFolder(project)">新建文件夹</el-button></div></el-popover></el-dropdown-item>
            <el-dropdown-item command="remove">删除项目</el-dropdown-item>
          </el-dropdown-menu></template>
        </el-dropdown></div></el-card></div>
      </section>
    </el-main>
    <input ref="coverInput" type="file" accept="image/*" hidden @change="changeProjectCover" /><settings v-model="settingsVisible" /><workspacePicker ref="relocationPicker" hideTrigger />
  </el-container>
</template>
<script setup lang="ts">
import { openCreationPage } from "@/lib/generationOrigin";
import { locale } from "@toonflow/i18n/vue";
import axios from "axios";
import { ensureExampleProject } from "@/lib/exampleProjects";
import { computed, onMounted, ref, watch } from "vue";
import { useRouter, useRoute } from "vue-router";
import { ElMessage, ElMessageBox } from "element-plus";
import { IconPlus, IconFolderOpen, IconTrash, IconDots, IconChevronRight, IconSortAscending, IconSortDescending, IconFileText, IconMovie, IconPhoto, IconVideo, IconVolume } from "@tabler/icons-vue";
import { browserWorkspaceMode } from "@/lib/browserWorkspaceFiles";
import { useWorkspaceStore, type Project } from "@/stores/workspace";
import useWorkspaceFiles from "@/lib/workspaceFiles";
import { uploadNodeFile } from "@toonflow/nodes-scaffold/workspaceFiles";
import { applyTemplateParameters, type TemplateApplication } from "@/lib/creationTemplates";
import { listBrowserConversations, renameBrowserConversation, removeBrowserConversation } from "@/components/agent/browserConversations";
import type { AgentHistory } from "@/components/agent/types";
import creativeCases from "@/components/creativeCases.vue";
import newCanvasCard from "@/components/newCanvasCard.vue";
import projectThumbnail from "@/components/projectThumbnail.vue";
import settings from "@/components/settings/index.vue";
import assetsPage from "@/components/assetsPage.vue";
import { navigationCollapsed, conversationHistoryOpen } from "@/stores/navigation";
import workspacePicker from "./workspacePicker.vue";

import studioSidebar from "@/components/studioSidebar.vue";
import templateReview from "@/components/templateReview.vue";
const examplesReady = ref(false);
onMounted(async () => { try { await ensureExampleProject(); } catch (error) { ElMessage.error(error instanceof Error ? error.message : "示例读取失败"); } finally { examplesReady.value = true; } });
const workspaceStore = useWorkspaceStore(), router = useRouter(), route = useRoute();
const homeSection = computed({ get: () => ["create", "templates", "history", "assets", "projects", "reviews"].includes(String(route.query.section)) ? String(route.query.section) : "create", set: section => { void router.replace({ path: "/home", query: { section } }); } });
const settingsVisible = ref(false), creating = ref(false), opening = ref(false), sortDescending = ref(true), viewMode = ref("grid"), projectSearch = ref("");
const templateCenter = ref<InstanceType<typeof creativeCases>>(), relocationPicker = ref<InstanceType<typeof workspacePicker>>();
const sortedProjects = computed(() => [...workspaceStore.projectList].sort((a, b) => sortDescending.value ? (b.lastEditedAt ?? b.lastOpenedAt) - (a.lastEditedAt ?? a.lastOpenedAt) : (a.lastEditedAt ?? a.lastOpenedAt) - (b.lastEditedAt ?? b.lastOpenedAt)));
const activeFolder = ref("");
const dragFolder = ref("");
const filteredProjects = computed(() => sortedProjects.value.filter(item => (item.folder || "") === activeFolder.value && item.name.toLowerCase().includes(projectSearch.value.trim().toLowerCase())));
const visibleFolders = computed(() => activeFolder.value ? [] : projectFolders.value.filter(folder => folder.toLowerCase().includes(projectSearch.value.trim().toLowerCase())));
const recentProjects = computed(() => [...workspaceStore.projectList].sort((a, b) => (b.lastEditedAt ?? b.lastOpenedAt) - (a.lastEditedAt ?? a.lastOpenedAt)).slice(0, 4));
const nodeShortcuts = [{ type: "remote-textNode", label: "文本", icon: IconFileText }, { type: "scriptNode", label: "脚本", icon: IconMovie }, { type: "remote-imageGenerationNode", label: "图片", icon: IconPhoto }, { type: "remote-videoGenerationNode", label: "视频", icon: IconVideo }, { type: "remote-audioGenerationNode", label: "音频", icon: IconVolume }];
function formatTime(value: number) { return new Date(value).toLocaleString(locale.value, { hour12: false }); }
async function createCanvas(nodeType?: string) {
  if (creating.value || opening.value) return;
  creating.value = true;
  try {
    await workspaceStore.createCanvasEntry(nodeType);
    if (homeSection.value === "projects" && activeFolder.value && workspaceStore.project) workspaceStore.moveProject(workspaceStore.project.directory, activeFolder.value);
    await router.push({ path: "/workspace", query: { returnSection: homeSection.value } });
  } catch (error) { ElMessage.error(error instanceof Error ? error.message : "项目创建失败"); }
  finally { creating.value = false; }
}
async function navigateSection(section: string) {
  if (section === "history") { await startAgent(); conversationHistoryOpen.value = true; }
  else homeSection.value = section;
}
async function startAgent() {
  if (creating.value || opening.value) return;
  creating.value = true;
  try {
    await openCreationPage(router);
  } catch (error) { ElMessage.error(error instanceof Error ? error.message : "新建对话失败"); }
  finally { creating.value = false; }
}
async function applyCase(value: TemplateApplication) {
  if (creating.value || opening.value) return;
  creating.value = true;
  try {
    const project = await workspaceStore.createProject("未命名项目", "simple");
    workspaceStore.creationMode = "simple"; applyTemplateParameters(value.template);
    workspaceStore.pendingAgentMessage = { directory: project.directory, prompt: value.prompt, attachments: value.references.map(file => ({ file, name: file.name, path: "", mimeType: file.type })), model: "", reasoningEffort: "", send: false };
    await router.push({ path: "/workspace", query: { returnSection: "templates" } });
  } catch (error) { ElMessage.error(error instanceof Error ? error.message : "模板应用失败"); }
  finally { creating.value = false; }
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
    await workspaceStore.restoreProjectEntry();
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

const projectBusy = ref(false), coverInput = ref<HTMLInputElement>(), coverTarget = ref<Project>();
const coverVersions = ref<Record<string, number>>({});
const projectFolders = computed(() => [...new Set([...workspaceStore.projectFolders, ...workspaceStore.projectList.map(item => item.folder).filter((folder): folder is string => !!folder)])]);
async function projectAction(project: Project, command: string | number | object) {
  if (projectBusy.value) return;
  if (command === "open") return openProject(project);
  if (command === "rename") return renameProject(project);
  if (command === "template") return templateCenter.value?.openProjectTemplate(project);
  if (command === "cover") { coverTarget.value = project; coverInput.value?.click(); return; }
  if (command === "remove") {
    if (await ElMessageBox.confirm(`从项目列表删除“${project.name}”？项目文件不会被删除。`, "删除项目", { confirmButtonText: "删除", cancelButtonText: "取消", type: "warning" }).then(() => true, () => false)) workspaceStore.removeProject(project.directory);
    return;
  }
  if (command !== "copy") return;
  projectBusy.value = true;
  try { await workspaceStore.duplicateProject(project); ElMessage.success("已创建项目副本"); }
  catch (error) { ElMessage.error(error instanceof Error ? error.message : "创建副本失败"); }
  finally { projectBusy.value = false; }
}
function moveProject(project: Project, folder: string) { workspaceStore.moveProject(project.directory, folder); ElMessage.success(folder ? `已移动至 ${folder}` : "已移动至根文件夹"); }
async function createProjectFolder(project?: Project) {
  const result = await ElMessageBox.prompt("请输入文件夹名称", "新建文件夹", { confirmButtonText: "创建", cancelButtonText: "取消", inputValidator: value => !!value?.trim() && value.trim().length <= 50 && !/[\\/\0]/.test(value) && ![".", ".."].includes(value.trim()) || "请输入有效文件夹名称（1–50字）" }).catch(() => null);
  if (!result) return;
  try { const folder = workspaceStore.createProjectFolder(result.value); if (project) moveProject(project, folder); }
  catch (error) { ElMessage.error(error instanceof Error ? error.message : "文件夹创建失败"); }
}
async function folderAction(folder: string, command: string | number | object) {
  try {
    if (command === "rename") {
      const result = await ElMessageBox.prompt("请输入文件夹名称", "重命名文件夹", { inputValue: folder, confirmButtonText: "保存", cancelButtonText: "取消" }).catch(() => null);
      if (result) { const renamed = workspaceStore.renameProjectFolder(folder, result.value); if (activeFolder.value === folder) activeFolder.value = renamed; }
    } else if (command === "remove") {
      const confirmed = await ElMessageBox.confirm(`删除文件夹“${folder}”？其中的项目将移回我的项目，项目文件不会被删除。`, "删除文件夹", { confirmButtonText: "删除", cancelButtonText: "取消", type: "warning" }).then(() => true, () => false);
      if (confirmed) { workspaceStore.removeProjectFolder(folder); if (activeFolder.value === folder) activeFolder.value = ""; }
    }
  } catch (error) { ElMessage.error(error instanceof Error ? error.message : "文件夹操作失败"); }
}
function dragProject(event: DragEvent, project: Project) {
  if (!event.dataTransfer) return;
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("application/x-afxen-project", project.directory);
}
function dropProject(event: DragEvent, folder: string) {
  dragFolder.value = "";
  const directory = event.dataTransfer?.getData("application/x-afxen-project");
  const project = workspaceStore.projectList.find(item => item.directory === directory);
  if (!project || folder && !projectFolders.value.includes(folder)) return;
  moveProject(project, folder);
}
async function changeProjectCover(event: Event) {
  const input = event.target as HTMLInputElement, file = input.files?.[0], project = coverTarget.value;
  input.value = "";
  if (!file || !project) return;
  if (!file.type.startsWith("image/")) { ElMessage.error("请选择图片作为项目封面"); return; }
  projectBusy.value = true;
  const files = useWorkspaceFiles(project.directory);
  let uploaded: string | undefined;
  try {
    uploaded = await uploadNodeFile(files, "projectCover", file);
    await files.mkdir(".agent").catch(error => { if (error.code !== "EEXIST") throw error; });
    await files.writeJson(".agent/projectCover.json", { path: uploaded, mimeType: file.type });
    coverVersions.value[project.directory] = (coverVersions.value[project.directory] ?? 0) + 1;
    ElMessage.success("封面已更新");
  } catch (error) { ElMessage.error(error instanceof Error ? error.message : "修改封面失败"); }
  finally { projectBusy.value = false; }
}

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
watch(() => [homeSection.value, examplesReady.value], async ([section, ready]) => {
  if (section !== "history" || !ready) return;
  historyLoading.value = true;
  historyError.value = "";
  try {
    const lists = await Promise.all([...workspaceStore.projectList, ...workspaceStore.draftProjects].filter(project => project.historyArchived).map(async project => {
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
    workspaceStore.creationMode = "simple";
    await router.push({ path: "/workspace", query: { returnSection: homeSection.value } });
  } catch (error) { ElMessage.error(error instanceof Error ? error.message : "打开历史对话失败"); }
  finally { opening.value = false; }
}
</script>
<style scoped lang="scss">
.home { position: relative; padding-left: 230px; isolation: isolate; min-height: 100dvh; background: var(--el-bg-color-page);
  .pageBackground { position: absolute; inset: 0; z-index: -1; pointer-events: none; }
  .pageContent { padding: 28px clamp(20px, 3vw, 48px) 40px; min-width: 0;
    h2 { margin: 0; font-size: 17px; }
    .sectionHeader { .projectSearch { margin-left: auto; } display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; margin-bottom: 16px; }
    .newCanvasEntry { width: 100%; min-height: 160px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 14px; border: 1px solid var(--el-border-color); border-radius: 14px; color: var(--el-text-color-primary); background: radial-gradient(circle, var(--el-border-color) 1px, transparent 1px) 0 0 / 18px 18px, linear-gradient(var(--el-fill-color-extra-light),var(--el-fill-color)); cursor: pointer; strong { font-size: 15px; } .canvasPlus { display: grid; place-items: center; width: 74px; height: 50px; border-radius: 14px; color: var(--el-bg-color); background: var(--el-text-color-primary); } }
    .nodeShortcuts { display: grid; grid-template-columns: repeat(5,minmax(0,1fr)); gap: 20px; margin: 26px 0 36px; button { display: grid; justify-items: center; gap: 10px; padding: 0; border: 0; background: transparent; color: var(--el-text-color-primary); font: inherit; font-size: 13px; cursor: pointer; span { display: grid; place-items: center; width: 100%; height: 64px; border: 1px solid var(--el-border-color-light); border-radius: 16px; background: var(--el-fill-color-light); } &:hover span { border-color: var(--el-color-primary); } } }
    .recentCards { display: grid; grid-template-columns: repeat(auto-fit,minmax(220px,1fr)); gap: 12px; .recentCard { min-width: 0; display: flex; align-items: center; gap: 12px; padding: 6px; border: 1px solid var(--el-border-color-light); border-radius: 18px; background: var(--el-bg-color); color: var(--el-text-color-primary); text-align: left; cursor: pointer; :deep(.projectThumbnail) { flex: none; width: 78px; height: 66px; border-radius: 13px; } > span { display: grid; gap: 9px; min-width: 0; } strong { font-size: 13px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; } small { font-size: 10px; color: var(--el-text-color-secondary); } } }
    .folderBreadcrumb { display: flex; align-items: center; gap: 8px; margin: 0 0 16px; font-size: 13px; button { padding: 6px 8px; border: 0; border-radius: 6px; color: #d9d9df; background: transparent; cursor: pointer; &:hover { background: #ffffff12; } } }
    .startCreationCard { align-self: start; width: 100%; aspect-ratio: 16 / 9; }
    .projectFolderCard { position: relative; align-self: start; border: 0; border-radius: 12px; background: transparent; overflow: hidden;
      .folderEntry { width: 100%; display: flex; flex-direction: column; align-items: stretch; border: 0; padding: 0; color: #ddd; background: transparent; text-align: left; cursor: pointer;
        .folderPreview { display: block; width: 100%; aspect-ratio: 16 / 9; object-fit: fill; }
        .folderInfo { display: grid; gap: 6px; min-width: 0; padding: 10px 46px 10px 10px; strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; } small { font-size: 10px; color: #aaa; } }
      }
      .folderActions { position: absolute; right: 6px; bottom: 6px; .el-button { padding: 4px; color: #ddd; } }
      &.dragOver { outline: 1px solid #a28ae9; background: #30273f; }
      &:focus-within { outline: 1px solid #a28ae9; }
    }
    .projectItems { display: grid; grid-template-columns: repeat(auto-fill,minmax(240px,1fr)); gap: 12px; &.listView { grid-template-columns: repeat(auto-fill,minmax(240px,1fr)); .projectEntry { flex-direction: row; :deep(.projectThumbnail) { width: 80px; height: 96px; } } } .projectCard { &:hover .projectActions, &:focus-within .projectActions { opacity: 1; pointer-events: auto; } position: relative; border: 0; background: transparent; border-radius: 12px; box-shadow: none; } .projectEntry { display: flex; flex-direction: column; width: 100%; border: 0; padding: 0; background: none; color: inherit; text-align: left; cursor: pointer; :deep(.projectThumbnail) { width: 100%; height: auto; aspect-ratio: 16 / 9; } .projectInfo { min-width: 0; padding: 10px 46px 10px 10px; display: grid; gap: 6px; strong { font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } small { font-size: 10px; color: var(--el-text-color-secondary); } } } .projectActions { position: absolute; bottom: 6px; right: 8px; opacity: 0; pointer-events: none; transition: opacity .15s; display: flex; justify-content: flex-end; padding: 2px 6px; .el-button { width: 26px; height: 26px; margin: 0; padding: 0; } } }
    .homeHistory { .historyEntry { display: flex; align-items: center; gap: 8px; padding: 8px; border: 1px solid var(--el-border-color-light); border-radius: 10px; margin: 8px 0; .historyOpen { flex: 1; min-width: 0; display: flex; align-items: center; gap: 10px; text-align: left; border: 0; background: none; color: inherit; cursor: pointer; span { display: grid; gap: 4px; min-width: 0; } strong { font-size: 13px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; } small { font-size: 11px; color: var(--el-text-color-secondary); } } } }
  }
  &.assetWorkspace { height: 100dvh; overflow: hidden; background: #131313; .pageContent { height: 100%; box-sizing: border-box; overflow-y: auto; } .pageBackground { display: none; } }
  &.navigationCollapsed { padding-left: 68px; }
  @media(max-width:700px) { padding-left: 68px; .pageContent { padding: 16px; .nodeShortcuts { gap: 8px; button span { height: 52px; } } } }
}
</style>

<style lang="scss">
.projectMoveLabel { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
.projectFolders { display: grid; max-height: 280px; overflow-y: auto; .el-button { justify-content: flex-start; margin: 0; } }
@media(hover:none) { .projectCard .projectActions { opacity: 1 !important; pointer-events: auto !important; } }
</style>
