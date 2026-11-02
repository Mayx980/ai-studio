<template>
  <el-container class="home">
    <bg class="pageBackground" />
    <aside class="studioSidebar" aria-label="主导航">
      <button class="studioBrand" aria-label="AFXEN 首页" @click="homeSection = 'create'"><brandLogo compact /><span>AFXEN</span></button>
      <el-button type="primary" :icon="IconHome" @click="homeSection = 'create'">首页</el-button>
      <nav>
        <button :disabled="creating || opening" @click="startAgent"><icon-sparkles :size="18" />Agent 助手</button>
        <button :aria-current="homeSection === 'templates' ? 'page' : undefined" @click="homeSection = 'templates'"><icon-template :size="18" />模板中心</button>
        <button :aria-current="homeSection === 'history' ? 'page' : undefined" @click="homeSection = 'history'"><icon-history :size="18" />历史对话</button>
        <button @click="homeSection = 'assets'"><icon-photo :size="18" />个人资产</button>
        <button :aria-current="homeSection === 'projects' ? 'page' : undefined" @click="homeSection = 'projects'"><icon-folder :size="18" />我的项目</button>
      </nav>
      <p>最近项目</p>
      <button v-for="item in recentProjects" :key="item.directory" class="recentProject" :title="item.name" @click="openProject(item)"><projectThumbnail :directory="item.directory" /><span><strong>{{ item.name }}</strong><small>{{ formatTime(item.lastOpenedAt) }}</small></span></button>
      <div class="sidebarFooter"><el-button text :icon="IconPalette" @click="settingsVisible = true">外观与设置</el-button></div>
    </aside>
    <el-main class="pageContent">
      <section v-if="homeSection === 'create'" class="homeLanding" aria-label="首页">
        <button class="newCanvasEntry" type="button" :disabled="creating || opening" @click="createCanvas(true)"><span class="canvasPlus"><icon-plus :size="28" /></span><strong>新建画布创作</strong></button>
        <div class="nodeShortcuts" aria-label="节点快捷创作"><button v-for="item in nodeShortcuts" :key="item.type" type="button" :disabled="creating || opening" :aria-label="`新建${item.label}节点项目`" @click="createCanvas(false, item.type)"><span><component :is="item.icon" :size="26" /></span>{{ item.label }}</button></div>
        <section class="recentSection" aria-label="最近项目"><div class="sectionHeader"><h2>最近项目</h2><el-button text @click="homeSection = 'projects'">查看全部</el-button></div><div class="recentCards"><button v-for="item in recentProjects" :key="item.directory" type="button" class="recentCard" :disabled="creating || opening" :aria-label="`打开项目 ${item.name}`" @click="openProject(item)"><projectThumbnail :directory="item.directory" /><span><strong>{{ item.name }}</strong><small>最近打开 {{ formatTime(item.lastOpenedAt) }}</small></span></button></div></section>
        <creativeCases curated />
      </section>
      <creativeCases ref="templateCenter" v-show="homeSection === 'templates'" @apply="applyCase" />
      <section v-if="homeSection === 'history'" class="homeHistory" aria-label="历史对话">
        <h2>历史对话</h2><el-input v-model="historySearch" placeholder="搜索对话名称或项目" aria-label="搜索历史对话" clearable />
        <p v-if="historyLoading" role="status">正在读取历史对话…</p><el-alert v-if="historyError" :title="historyError" type="error" :closable="false" />
        <div v-for="item in filteredHistory" :key="`${item.directory}:${item.file}`" class="historyEntry"><button class="historyOpen" type="button" :disabled="opening || creating || historyLoading" @click="openHistory(item)"><icon-history :size="18" /><span><strong>{{ item.name }}</strong><small>{{ item.projectName }} · {{ item.messageCount }} 条消息</small></span></button><el-button text :disabled="historyLoading" @click="renameHistory(item)">重命名</el-button><el-button text type="danger" :disabled="historyLoading" @click="removeHistory(item)">删除</el-button></div>
      </section>
      <section v-if="homeSection === 'assets'" class="homeAssets"><h2>个人资产</h2><assetLibrary page :modelValue="true" :directory="workspaceStore.project?.directory" /></section>
      <section v-show="homeSection === 'projects'" class="projectList" aria-labelledby="projectListTitle">
        <div class="sectionHeader"><h2 id="projectListTitle">我的项目</h2><el-input v-model="projectSearch" placeholder="按项目名搜索" aria-label="按项目名搜索" clearable style="max-width:240px" /><el-space wrap><el-button v-if="!browserWorkspaceMode" :icon="IconFolderOpen" @click="openProject()">导入项目</el-button><el-button :icon="IconPlus" :disabled="creating || opening" @click="createCanvas(true)">添加项目</el-button><el-button circle :icon="sortDescending ? IconSortDescending : IconSortAscending" aria-label="切换时间排序" @click="sortDescending = !sortDescending" /><el-radio-group v-model="viewMode" aria-label="项目视图"><el-radio-button value="grid" aria-label="网格视图"><icon-layout-grid :size="16" /></el-radio-button><el-radio-button value="list" aria-label="列表视图"><icon-list :size="16" /></el-radio-button></el-radio-group></el-space></div>
        <div class="projectItems" :class="{ listView: viewMode === 'list' }"><el-card v-for="project in filteredProjects" :key="project.directory" class="projectCard" shadow="hover" :bodyStyle="{ padding: '0' }"><button class="projectEntry" type="button" :disabled="creating || opening" :aria-label="`打开项目 ${project.name}`" @click="openProject(project)"><projectThumbnail :directory="project.directory" /><span class="projectInfo"><strong :title="project.name">{{ project.name }}</strong><small>最近打开 {{ formatTime(project.lastOpenedAt) }}</small></span></button><div class="projectActions"><el-button v-if="browserWorkspaceMode" text :icon="IconTemplate" :disabled="creating || opening" title="制作模板" :aria-label="`制作模板 ${project.name}`" @click="templateCenter?.openProjectTemplate(project)" /><el-button text :icon="IconEdit" :disabled="creating || opening" title="编辑" @click="renameProject(project)" /><el-button text type="danger" :icon="IconTrash" :disabled="creating || opening" title="删除" @click="workspaceStore.removeProject(project.directory)" /></div></el-card></div>
      </section>
    </el-main>
    <settings v-model="settingsVisible" /><workspacePicker ref="relocationPicker" hideTrigger />
  </el-container>
</template>
<script setup lang="ts">
import { locale } from "@toonflow/i18n/vue";
import axios from "axios";
import { computed, ref, watch } from "vue";
import { useRouter, useRoute } from "vue-router";
import { ElMessage, ElMessageBox } from "element-plus";
import { IconHome, IconPlus, IconPalette, IconFolderOpen, IconTemplate, IconEdit, IconTrash, IconSortAscending, IconSortDescending, IconFileText, IconMovie, IconPhoto, IconVideo, IconVolume } from "@tabler/icons-vue";
import { browserWorkspaceMode } from "@/lib/browserWorkspaceFiles";
import { useWorkspaceStore, type Project } from "@/stores/workspace";
import useWorkspaceFiles from "@/lib/workspaceFiles";
import { applyTemplateParameters, type TemplateApplication } from "@/lib/creationTemplates";
import { listBrowserConversations, renameBrowserConversation, removeBrowserConversation } from "@/components/agent/browserConversations";
import type { AgentHistory } from "@/components/agent/types";
import brandLogo from "@/components/brandLogo.vue";
import creativeCases from "@/components/creativeCases.vue";
import projectThumbnail from "@/components/projectThumbnail.vue";
import settings from "@/components/settings/index.vue";
import assetLibrary from "@/pages/workspace/panels/canvas/components/assetLibrary.vue";
import workspacePicker from "./workspacePicker.vue";
import bg from "./bg.vue";
const workspaceStore = useWorkspaceStore(), router = useRouter(), route = useRoute();
const homeSection = computed({ get: () => ["create", "templates", "history", "assets", "projects"].includes(String(route.query.section)) ? String(route.query.section) : "create", set: section => { void router.replace({ path: "/home", query: { section } }); } });
const settingsVisible = ref(false), creating = ref(false), opening = ref(false), sortDescending = ref(true), viewMode = ref("grid"), projectSearch = ref("");
const templateCenter = ref<InstanceType<typeof creativeCases>>(), relocationPicker = ref<InstanceType<typeof workspacePicker>>();
const sortedProjects = computed(() => [...workspaceStore.projectList].sort((a, b) => sortDescending.value ? b.lastOpenedAt - a.lastOpenedAt : a.lastOpenedAt - b.lastOpenedAt));
const filteredProjects = computed(() => sortedProjects.value.filter(item => item.name.toLowerCase().includes(projectSearch.value.trim().toLowerCase())));
const recentProjects = computed(() => [...workspaceStore.projectList].sort((a, b) => b.lastOpenedAt - a.lastOpenedAt).slice(0, 4));
const nodeShortcuts = [{ type: "remote-textNode", label: "文本", icon: IconFileText }, { type: "scriptNode", label: "脚本", icon: IconMovie }, { type: "remote-imageGenerationNode", label: "图片", icon: IconPhoto }, { type: "remote-videoGenerationNode", label: "视频", icon: IconVideo }, { type: "remote-audioGenerationNode", label: "音频", icon: IconVolume }];
function formatTime(value: number) { return new Date(value).toLocaleString(locale.value, { hour12: false }); }
async function createCanvas(named: boolean, nodeType?: string) {
  if (creating.value || opening.value) return;
  creating.value = true;
  try {
    let name = "未命名项目";
    if (named) {
      const result = await ElMessageBox.prompt("输入项目名称", "新建项目", { inputValue: name, confirmButtonText: "创建", cancelButtonText: "取消", inputValidator: value => !!value?.trim() && value.trim().length <= 80 || "请输入1–80个字符" }).catch(() => null);
      if (!result) return;
      name = result.value.trim();
    }
    const project = await workspaceStore.createProject(name);
    workspaceStore.creationMode = "professional";
    workspaceStore.pendingCanvasEntry = { directory: project.directory, nodeType };
    await router.push({ path: "/workspace", query: { returnSection: homeSection.value } });
  } catch (error) { ElMessage.error(error instanceof Error ? error.message : "项目创建失败"); }
  finally { creating.value = false; }
}
async function startAgent() {
  if (creating.value || opening.value) return;
  creating.value = true;
  try {
    await workspaceStore.createProject(); workspaceStore.creationMode = "simple";
    await router.push({ path: "/workspace", query: { returnSection: homeSection.value } });
  } catch (error) { ElMessage.error(error instanceof Error ? error.message : "新建对话失败"); }
  finally { creating.value = false; }
}
async function applyCase(value: TemplateApplication) {
  if (creating.value || opening.value) return;
  creating.value = true;
  try {
    const project = await workspaceStore.createProject();
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
    workspaceStore.creationMode = "professional";
    workspaceStore.pendingCanvasEntry = { directory: workspaceStore.project!.directory };
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
    workspaceStore.creationMode = "simple";
    await router.push({ path: "/workspace", query: { returnSection: homeSection.value } });
  } catch (error) { ElMessage.error(error instanceof Error ? error.message : "打开历史对话失败"); }
  finally { opening.value = false; }
}
</script>
<style scoped lang="scss">
.home { position: relative; padding-left: 220px; isolation: isolate; min-height: 100dvh;
  .pageBackground { position: absolute; inset: 0; z-index: -1; pointer-events: none; }
  .studioSidebar { position: fixed; inset: 0 auto 0 0; z-index: 6; width: 220px; display: flex; flex-direction: column; gap: 16px; padding: 30px 20px; border-right: 1px solid var(--el-border-color-light); background: var(--el-bg-color);
    .studioBrand { display: flex; align-items: center; gap: 8px; font-size: 24px; font-weight: 700; color: var(--el-text-color-primary); border: 0; background: transparent; padding: 0 0 14px; cursor: pointer; }
    nav { display: grid; gap: 5px; button { display: flex; align-items: center; gap: 10px; padding: 12px; border: 0; border-radius: 8px; background: transparent; color: var(--el-text-color-regular); font: inherit; cursor: pointer; &[aria-current="page"] { background: var(--el-color-primary-light-9); color: var(--el-color-primary); } } }
    p { margin: 8px 10px 0; color: var(--el-text-color-secondary); font-size: 12px; }
    .recentProject { display: flex; gap: 8px; align-items: center; padding: 8px; border: 0; background: transparent; color: inherit; text-align: left; cursor: pointer; :deep(.projectThumbnail) { width: 42px; height: 42px; border-radius: 8px; } span { min-width: 0; display: grid; gap: 5px; } strong { font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } small { font-size: 10px; color: var(--el-text-color-secondary); } }
    .sidebarFooter { margin-top: auto; }
  }
  .pageContent { padding: 28px clamp(20px, 3vw, 48px) 40px; min-width: 0;
    h2 { margin: 0; font-size: 17px; }
    .sectionHeader { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; margin-bottom: 16px; }
    .newCanvasEntry { width: 100%; min-height: 160px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 14px; border: 1px solid var(--el-border-color); border-radius: 14px; color: var(--el-text-color-primary); background: radial-gradient(circle, var(--el-border-color) 1px, transparent 1px) 0 0 / 18px 18px, linear-gradient(var(--el-fill-color-extra-light),var(--el-fill-color)); cursor: pointer; strong { font-size: 15px; } .canvasPlus { display: grid; place-items: center; width: 74px; height: 50px; border-radius: 14px; color: var(--el-bg-color); background: var(--el-text-color-primary); } }
    .nodeShortcuts { display: grid; grid-template-columns: repeat(5,minmax(0,1fr)); gap: 20px; margin: 26px 0 36px; button { display: grid; justify-items: center; gap: 10px; padding: 0; border: 0; background: transparent; color: var(--el-text-color-primary); font: inherit; font-size: 13px; cursor: pointer; span { display: grid; place-items: center; width: 100%; height: 64px; border: 1px solid var(--el-border-color-light); border-radius: 16px; background: var(--el-fill-color-light); } &:hover span { border-color: var(--el-color-primary); } } }
    .recentCards { display: grid; grid-template-columns: repeat(auto-fit,minmax(220px,1fr)); gap: 12px; .recentCard { min-width: 0; display: flex; align-items: center; gap: 12px; padding: 6px; border: 1px solid var(--el-border-color-light); border-radius: 18px; background: var(--el-bg-color); color: var(--el-text-color-primary); text-align: left; cursor: pointer; :deep(.projectThumbnail) { flex: none; width: 78px; height: 66px; border-radius: 13px; } > span { display: grid; gap: 9px; min-width: 0; } strong { font-size: 13px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; } small { font-size: 10px; color: var(--el-text-color-secondary); } } }
    .projectItems { display: grid; grid-template-columns: repeat(auto-fill,minmax(150px,1fr)); gap: 12px; &.listView { grid-template-columns: repeat(auto-fill,minmax(240px,1fr)); .projectEntry { flex-direction: row; :deep(.projectThumbnail) { width: 80px; height: 96px; } } } .projectCard { position: relative; border-radius: 12px; } .projectEntry { display: flex; flex-direction: column; width: 100%; border: 0; padding: 0; background: none; color: inherit; text-align: left; cursor: pointer; :deep(.projectThumbnail) { width: 100%; height: 96px; } .projectInfo { min-width: 0; padding: 10px; display: grid; gap: 6px; strong { font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } small { font-size: 10px; color: var(--el-text-color-secondary); } } } .projectActions { display: flex; justify-content: flex-end; padding: 2px 6px; .el-button { width: 26px; height: 26px; margin: 0; padding: 0; } } }
    .homeHistory { .historyEntry { display: flex; align-items: center; gap: 8px; padding: 8px; border: 1px solid var(--el-border-color-light); border-radius: 10px; margin: 8px 0; .historyOpen { flex: 1; min-width: 0; display: flex; align-items: center; gap: 10px; text-align: left; border: 0; background: none; color: inherit; cursor: pointer; span { display: grid; gap: 4px; min-width: 0; } strong { font-size: 13px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; } small { font-size: 11px; color: var(--el-text-color-secondary); } } } }
  }
  @media(max-width:700px) { padding-left: 0; flex-direction: column; .studioSidebar { position: relative; inset: auto; width: 100%; padding: 12px; gap: 10px; .studioBrand, .recentProject, > p { display: none; } nav { display: flex; overflow: auto; button { flex: none; padding: 8px; } } > .el-button { align-self: flex-start; min-width: 100px; } .sidebarFooter { position: absolute; right: 10px; top: 12px; } } .pageContent { padding: 16px; .nodeShortcuts { gap: 8px; button span { height: 52px; } } } }
}
</style>
