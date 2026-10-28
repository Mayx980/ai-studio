import { defineStore } from "pinia";
import { ref } from "vue";
import { browserWorkspaceMode } from "@/lib/browserWorkspaceFiles";
import { settingsStorage } from "@/stores/settings";
import axios from "axios";
import type { AgentAttachment } from "@/components/agent/types";

export type Project = {
  directory: string;
  name: string;
  lastOpenedAt: number;
};

export const useWorkspaceStore = defineStore("workspace", () => {
  const creationMode = ref<"simple" | "professional">("simple");
  const project = ref<Project | null>(null);
  const projectList = ref<Project[]>([]);
  const pendingAgentSession = ref<{ directory: string; file: string } | null>(null);
  const pendingAgentMessage = ref<{ directory: string; prompt: string; attachments?: AgentAttachment[]; model: string; reasoningEffort: string } | null>(null);

  async function openProject(path: string, previousDirectory = path, signal?: AbortSignal) {
    pendingAgentSession.value = null;
    if (browserWorkspaceMode) {
      if (!path.trim()) throw new Error("项目标识不能为空");
      signal?.throwIfAborted();
      const existing = projectList.value.find(item => item.directory === previousDirectory || item.directory === path);
      project.value = { directory: path, name: existing?.name || (path.startsWith("browser:") ? "未命名项目" : path.split(/[\\/]/).filter(Boolean).at(-1)!) || "未命名项目", lastOpenedAt: Date.now() };
      projectList.value = [project.value, ...projectList.value.filter(item => item.directory !== previousDirectory && item.directory !== path)];
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
    project.value = { directory: checkedDirectory, name: existing?.name || checkedDirectory.split(/[\\/]/).filter(Boolean).at(-1) || checkedDirectory, lastOpenedAt: Date.now() };
    projectList.value = [
      project.value,
      ...projectList.value.filter(item => item.directory !== previousDirectory && item.directory !== checkedDirectory),
    ];
  }

  function renameProject(path: string, name: string) {
    const target = projectList.value.find(item => item.directory === path);
    if (!target || !name.trim()) return;
    target.name = name.trim();
    if (project.value?.directory === path) project.value = target;
  }

  function removeProject(path: string) {
    projectList.value = projectList.value.filter(item => item.directory !== path);
    if (project.value?.directory === path) project.value = null;
  }

  return { creationMode, project, projectList, pendingAgentMessage, pendingAgentSession, openProject, renameProject, removeProject };
}, {
  persist: {
    key: browserWorkspaceMode ? "aiStudio.browserProjects" : "toonflow.projectList",
    storage: browserWorkspaceMode ? { getItem: (key: string) => localStorage.getItem(key) ?? settingsStorage.getItem("toonflow.projectList"), setItem: (key: string, value: string) => localStorage.setItem(key, value) } : settingsStorage,
    pick: ["project", "projectList"],
  },
});
