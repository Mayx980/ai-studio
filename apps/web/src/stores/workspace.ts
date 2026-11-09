import { defineStore } from "pinia";
import { ref } from "vue";
import { browserWorkspaceMode } from "@/lib/browserWorkspaceFiles";
import { settingsStorage } from "@/stores/settings";
import axios from "axios";
import useWorkspaceFiles from "@/lib/workspaceFiles";
import type { AgentAttachment } from "@/components/agent/types";
import { currentAccount } from "@/stores/prototypeAccount";

export type Project = {
  directory: string;
  name: string;
  lastOpenedAt: number;
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
      project.value = { ...existing, directory: path, name: existing?.name || (path.startsWith("browser:") ? "未命名项目" : path.split(/[\\/]/).filter(Boolean).at(-1)!) || "未命名项目", lastOpenedAt: Date.now() };
      if (!draftProjects.value.some(item => item.directory === path)) projectList.value = [project.value, ...projectList.value.filter(item => item.directory !== previousDirectory && item.directory !== path)];
      if (project.value.creationMode === "simple" && !project.value.historyArchived) lastSimpleDirectory.value = path;
      pendingAgentMessage.value = null;
      return;
    }
    const { data } = await axios.get<{ code: number; data?: { directory: string }; message?: string }>("/api/workspaces/check", {
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
    if (!browserWorkspaceMode) { creationMode.value = "professional"; pendingCanvasEntry.value = { directory: current.directory, tutorial: current.tutorial }; return; }
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
    if (!browserWorkspaceMode) throw new Error("当前自动创作项目使用浏览器保存，请在浏览器原型模式打开");
    if (!name.trim() || name.trim().length > 80) throw new Error("请输入1–80个字符的项目名称");
    const previousSimpleDirectory = lastSimpleDirectory.value;
    const directory = `browser://${crypto.randomUUID()}`;
    await useWorkspaceFiles(directory).writeJson("画布1.json", { toonflowCanvas: true, nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } }, true);
    await openProject(directory);
    renameProject(directory, name);
    project.value!.creationMode = mode;
    if (mode === "simple") {
      projectList.value = projectList.value.filter(item => item.directory !== directory);
      draftProjects.value.unshift(project.value!); lastSimpleDirectory.value = directory;
      archiveSimpleConversation(previousSimpleDirectory);
    }
    creationMode.value = mode;
    return project.value!;
  }

  function completeSimpleProject(directory: string, name: string) {
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
    creationMode.value = "simple";
  }

  function renameProject(path: string, name: string) {
    const target = [...projectList.value, ...draftProjects.value].find(item => item.directory === path);
    if (!target || !name.trim()) return;
    target.name = name.trim();
    if (project.value?.directory === path) project.value = target;
  }

  function moveProject(path: string, folder: string) {
    const target = projectList.value.find(item => item.directory === path);
    if (!target) throw new Error("项目已不存在");
    target.folder = folder;
    if (project.value?.directory === path) project.value = target;
  }

  async function duplicateProject(source: Project, includeAgent = true) {
    if (!browserWorkspaceMode) throw new Error("创建副本目前支持浏览器项目");
    const directory = `browser://${crypto.randomUUID()}`;
    const original = useWorkspaceFiles(source.directory), target = useWorkspaceFiles(directory);
    async function copy(path = "") {
      for (const entry of (await original.list(path)).entries) {
        if (!includeAgent && !path && entry.name === ".agent") continue;
        if (entry.type === "directory") { await target.mkdir(entry.path); await copy(entry.path); }
        else await target.write(entry.path, await original.read(entry.path), true);
      }
    }
    try { await copy(); }
    catch (error) {
      for (const entry of (await target.list()).entries) await target.remove(entry.path, entry.type === "directory");
      throw error;
    }
    const duplicated = { ...source, directory, name: `${source.name} 副本`, lastOpenedAt: Date.now() };
    projectList.value.unshift(duplicated);
    return duplicated;
  }

  function removeProject(path: string) {
    projectList.value = projectList.value.filter(item => item.directory !== path);
    if (project.value?.directory === path) project.value = null;
  }

  return { creationMode, project, projectList, draftProjects, lastSimpleDirectory, tutorialVisited, canvasTutorialVersion, completeSimpleProject, archiveSimpleConversation, resumeSimpleConversation, pendingAgentMessage, pendingAgentSession, pendingAgentDraft, pendingCanvasEntry, createProject, openProject, restoreProjectEntry, renameProject, moveProject, duplicateProject, removeProject };
}, {
  persist: {
    key: browserWorkspaceMode ? currentAccount.value?.id === "admin" ? "aiStudio.browserProjects.admin" : "aiStudio.browserProjects" : "toonflow.projectList",
    storage: browserWorkspaceMode ? { getItem: (key: string) => localStorage.getItem(key) ?? (key === "aiStudio.browserProjects" ? settingsStorage.getItem("toonflow.projectList") : null), setItem: (key: string, value: string) => { if (window.parent === window) localStorage.setItem(key, value); } } : settingsStorage,
    pick: ["project", "projectList", "draftProjects", "lastSimpleDirectory", "creationMode", "tutorialVisited", "canvasTutorialVersion"],
  },
});
