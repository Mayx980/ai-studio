import { studio } from "@/ports";
import { defineStore } from "pinia";
import { ref } from "vue";
import { browserWorkspaceMode, studioCreationMode } from "@/lib/browserWorkspaceFiles";
import { nextTick } from "vue";
import { flushSharedState } from "./sharedState";
import { settingsStorage } from "@/stores/settings";
import axios from "axios";
import useWorkspaceFiles from "@/lib/workspaceFiles";
import type { AgentAttachment } from "@/components/agent/types";
import { currentAccount } from "@/stores/prototypeAccount";
import { accountsRequired, currentUser } from "@/stores/accounts";

export type Project = {
  directory: string;
  name: string;
  lastOpenedAt: number;
  lastEditedAt?: number;
  folder?: string;
  creationMode?: "simple" | "professional";
  historyArchived?: boolean;
  tutorial?: boolean;
  tutorialEntry?: "image" | "video" | "canvas";
  example?: boolean;
};

export const useWorkspaceStore = defineStore("workspace", () => {
  const creationMode = ref<"simple" | "professional">("simple");
  const project = ref<Project | null>(null);
  const projectList = ref<Project[]>([]);
  const draftProjects = ref<Project[]>([]);
  const projectFolders = ref<string[]>([]);
  const lastSimpleDirectory = ref("");
  const tutorialVisited = ref<("image" | "video" | "canvas")[]>([]);
  const canvasTutorialVersion = ref(0);
  const pendingAgentSession = ref<{ directory: string; file: string } | null>(null);
  const pendingAgentDraft = ref<{ file: string; prompt: string; attachments: AgentAttachment[] } | null>(null);
  const pendingAgentMessage = ref<{ directory: string; prompt: string; attachments?: AgentAttachment[]; model: string; reasoningEffort: string; send?: boolean } | null>(null);
  const pendingCanvasEntry = ref<{ directory: string; nodeType?: string; tutorial?: boolean; files?: File[]; canvasPath?: string; nodeId?: string } | null>(null);

  async function openProject(path: string, previousDirectory = path, signal?: AbortSignal) {
    pendingAgentSession.value = null;
    pendingCanvasEntry.value = null;
    if (browserWorkspaceMode) {
      if (!path.trim()) throw new Error("项目标识不能为空");
      signal?.throwIfAborted();
      const existing = [...projectList.value, ...draftProjects.value].find(item => item.directory === previousDirectory || item.directory === path);
      draftProjects.value = draftProjects.value.filter(item => item.creationMode !== "professional" || item.directory === path);
      project.value = { ...existing, directory: path, name: existing?.name || (path.startsWith("browser:") ? "未命名项目" : path.split(/[\\/]/).filter(Boolean).at(-1)!) || "未命名项目", lastOpenedAt: Date.now() };
      if (!draftProjects.value.some(item => item.directory === path)) projectList.value = [project.value, ...projectList.value.filter(item => item.directory !== previousDirectory && item.directory !== path)];
      if (project.value.creationMode === "simple" && !project.value.historyArchived) lastSimpleDirectory.value = path;
      pendingAgentMessage.value = null;
      return;
    }
    const { data } = await studio.inspectWorkspace<{ code: number; data?: { directory: string }; message?: string }>({
      params: { directory: path }, headers: { "x-toonflow-workspace": "1" }, signal,
    });
    signal?.throwIfAborted();
    if (data.code !== 200 || !data.data?.directory) throw new Error(data.message || "工作目录校验失败");
    const checkedDirectory = data.data.directory;
    pendingAgentMessage.value = null;
    const existing = projectList.value.find(project => project.directory === previousDirectory)
      ?? projectList.value.find(project => project.directory === checkedDirectory);
    project.value = { ...existing, directory: checkedDirectory, name: existing?.name || checkedDirectory.split(/[\\/]/).filter(Boolean).at(-1) || checkedDirectory, lastOpenedAt: Date.now() };
    projectList.value = [
      project.value,
      ...projectList.value.filter(item => item.directory !== previousDirectory && item.directory !== checkedDirectory),
    ];
  }

  async function restoreProjectEntry() {
    const current = project.value;
    if (!current) return;
    if (!studioCreationMode) { creationMode.value = "professional"; pendingCanvasEntry.value = { directory: current.directory, tutorial: current.tutorial }; return; }
    const { readCanvasFiles } = await import("@/pages/workspace/panels/canvas/canvasFiles");
    const canvases = await readCanvasFiles(useWorkspaceFiles(current.directory));
    const hasNodes = canvases.some(canvas => canvas.data.nodes.length > 0);
    const { listBrowserConversations, readBrowserConversation } = await import("@/components/agent/browserConversations");
    const sessions = hasNodes ? [] : await listBrowserConversations(current.directory);
    const latest = sessions[0];
    const session = latest ? await readBrowserConversation(current.directory, latest.file) : undefined;
    creationMode.value = hasNodes ? "professional" : session?.creationMode ?? current.creationMode ?? (latest ? "simple" : "professional");
    if (creationMode.value === "simple" && latest) pendingAgentSession.value = { directory: current.directory, file: latest.file };
    if (creationMode.value === "professional") pendingCanvasEntry.value = { directory: current.directory, tutorial: current.tutorial };
  }

  async function createProject(name = "未命名项目", mode: "simple" | "professional" = "professional"): Promise<Project> {
    if (!studioCreationMode) throw new Error("当前宿主不支持创建创作项目");
    if (!browserWorkspaceMode) await flushSharedState();
    if (!name.trim() || name.trim().length > 80) throw new Error("请输入1–80个字符的项目名称");
    const previousSimpleDirectory = lastSimpleDirectory.value;
    const directory = browserWorkspaceMode ? `browser://${crypto.randomUUID()}` : (await studio.createWorkspace<{ data: { directory: string } }>({ name })).data.data.directory;
    if (browserWorkspaceMode) await useWorkspaceFiles(directory).writeJson("画布1.json", { toonflowCanvas: true, nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } }, true);
    await openProject(directory);
    renameProject(directory, name);
    project.value!.creationMode = mode;
    markProjectEdited(directory);
    projectList.value = projectList.value.filter(item => item.directory !== directory);
    draftProjects.value.unshift(project.value!);
    if (mode === "simple") {
      lastSimpleDirectory.value = directory;
      archiveSimpleConversation(previousSimpleDirectory);
    }
    creationMode.value = mode;
    await nextTick();
    if (!browserWorkspaceMode) await flushSharedState();
    return project.value!;
  }

  function markProjectEdited(directory: string) {
    const now = Date.now();
    for (const item of [...projectList.value, ...draftProjects.value, ...(project.value ? [project.value] : [])]) if (item.directory === directory) item.lastEditedAt = now;
  }
  async function createCanvasEntry(nodeType?: string) {
    const kind = !nodeType ? "canvas" : nodeType === "remote-imageGenerationNode" ? "image" : nodeType === "remote-videoGenerationNode" ? "video" : undefined;
    if (kind && (kind === "canvas" ? canvasTutorialVersion.value < 1 : !tutorialVisited.value.includes(kind))) {
      const { openTutorialProject } = await import("@/lib/canvasTutorial");
      await openTutorialProject(kind);
    } else {
      const created = await createProject();
      created.tutorialEntry = kind ?? "canvas";
      creationMode.value = "professional";
      pendingCanvasEntry.value = { directory: created.directory, nodeType };
    }
  }

  function completeProject(directory: string, name: string) {
    const target = [...projectList.value, ...draftProjects.value].find(item => item.directory === directory);
    if (!target) return;
    if (target.name === "未命名项目") target.name = name.trim().slice(0, 80) || target.name;
    if (!projectList.value.some(item => item.directory === directory)) projectList.value.unshift(target);
    draftProjects.value = draftProjects.value.filter(item => item.directory !== directory);
    if (project.value?.directory === directory) project.value = target;
  }
  function archiveSimpleConversation(directory = lastSimpleDirectory.value) {
    for (const item of [...projectList.value, ...draftProjects.value, ...(project.value ? [project.value] : [])]) if (item.directory === directory) item.historyArchived = true;
  }
  async function resumeSimpleConversation() {
    const existing = [...projectList.value, ...draftProjects.value].find(item => item.directory === lastSimpleDirectory.value && !item.historyArchived)
      ?? [...projectList.value, ...draftProjects.value].filter(item => item.creationMode === "simple" && !item.historyArchived).sort((a, b) => b.lastOpenedAt - a.lastOpenedAt)[0];
    if (existing) await openProject(existing.directory);
    else if (project.value?.creationMode !== "simple" || project.value.historyArchived) await createProject("未命名项目", "simple");
    if (studioCreationMode && project.value) {
      const { listBrowserConversations, createBrowserConversation } = await import("@/components/agent/browserConversations");
      const sessions = await listBrowserConversations(project.value.directory);
      const session = sessions[0] ?? await createBrowserConversation(project.value.directory);
      pendingAgentSession.value = { directory: project.value.directory, file: session.file };
    }
    creationMode.value = "simple";
  }

  function renameProject(path: string, name: string) {
    const target = [...projectList.value, ...draftProjects.value].find(item => item.directory === path);
    if (!target || !name.trim()) return;
    target.name = name.trim();
    if (project.value?.directory === path) project.value = target;
  }

  function createProjectFolder(name: string) {
    const folder = name.trim();
    if (!folder || folder.length > 50 || /[\\/\0]/.test(folder) || [".", ".."].includes(folder)) throw new Error("请输入有效文件夹名称（1–50字）");
    if (projectFolders.value.includes(folder) || projectList.value.some(item => item.folder === folder)) throw new Error("同名文件夹已存在");
    projectFolders.value.push(folder);
    return folder;
  }
  function renameProjectFolder(folder: string, name: string) {
    if (folder === name.trim()) return folder;
    const renamed = createProjectFolder(name);
    for (const item of projectList.value) if (item.folder === folder) item.folder = renamed;
    projectFolders.value = projectFolders.value.filter(item => item !== folder);
    if (project.value?.folder === folder) project.value.folder = renamed;
    return renamed;
  }
  function removeProjectFolder(folder: string) {
    for (const item of projectList.value) if (item.folder === folder) item.folder = "";
    projectFolders.value = projectFolders.value.filter(item => item !== folder);
    if (project.value?.folder === folder) project.value.folder = "";
  }

  function moveProject(path: string, folder: string) {
    const target = projectList.value.find(item => item.directory === path);
    if (!target) throw new Error("项目已不存在");
    target.folder = folder;
    if (project.value?.directory === path) project.value = target;
  }

  async function duplicateProject(source: Project, includeAgent = true) {
    if (!studioCreationMode) throw new Error("当前宿主不支持创建项目副本");
    if (!browserWorkspaceMode) await flushSharedState();
    const directory = browserWorkspaceMode ? `browser://${crypto.randomUUID()}` : (await studio.createWorkspace<{ data: { directory: string } }>({ name: `${source.name} 副本`, initializeCanvas: false })).data.data.directory;
    const original = useWorkspaceFiles(source.directory), target = useWorkspaceFiles(directory);
    async function copy(path = "") {
      for (const entry of (await original.list(path)).entries) {
        if (!includeAgent && !path && entry.name === ".agent") continue;
        if (entry.type === "directory") { await target.mkdir(entry.path); await copy(entry.path); }
        else {
          const bytes = await original.read(entry.path);
          await target.write(entry.path, bytes, true);
          const copied = new Uint8Array(await target.read(entry.path)), expected = new Uint8Array(bytes);
          if (copied.length !== expected.length || copied.some((value, index) => value !== expected[index])) throw new Error(`项目副本校验失败：${entry.path}`);
        }
      }
    }
    try { await copy(); }
    catch (error) {
      for (const entry of (await target.list()).entries) await target.remove(entry.path, entry.type === "directory");
      throw error;
    }
    const duplicated = { ...source, directory, name: `${source.name} 副本`, lastOpenedAt: Date.now() };
    projectList.value.unshift(duplicated);
    await nextTick();
    if (!browserWorkspaceMode) await flushSharedState();
    return duplicated;
  }

  function removeProject(path: string) {
    projectList.value = projectList.value.filter(item => item.directory !== path);
    if (project.value?.directory === path) project.value = null;
  }

  return { projectFolders, createProjectFolder, renameProjectFolder, removeProjectFolder, markProjectEdited, createCanvasEntry, creationMode, project, projectList, draftProjects, lastSimpleDirectory, tutorialVisited, canvasTutorialVersion, completeProject, archiveSimpleConversation, resumeSimpleConversation, pendingAgentMessage, pendingAgentSession, pendingAgentDraft, pendingCanvasEntry, createProject, openProject, restoreProjectEntry, renameProject, moveProject, duplicateProject, removeProject };
}, {
  persist: [{
    key: browserWorkspaceMode ? currentAccount.value?.id === "admin" ? "aiStudio.browserProjects.admin" : "aiStudio.browserProjects" : "toonflow.projectList",
    storage: browserWorkspaceMode ? { getItem: (key: string) => localStorage.getItem(key) ?? (key === "aiStudio.browserProjects" ? settingsStorage.getItem("toonflow.projectList") : null), setItem: (key: string, value: string) => { if (window.parent === window) localStorage.setItem(key, value); } } : settingsStorage,
    pick: ["project", "projectFolders", "projectList", "draftProjects", "lastSimpleDirectory"],
  }, { key: "afxen.creationPreferences", storage: {
    getItem: key => localStorage.getItem(accountsRequired.value ? `${key}.${currentUser.value!.id}` : key),
    setItem: (key, value) => localStorage.setItem(accountsRequired.value ? `${key}.${currentUser.value!.id}` : key, value),
  }, pick: ["creationMode", "tutorialVisited", "canvasTutorialVersion"] }],
});
