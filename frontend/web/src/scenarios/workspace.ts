import { scenarioAccountRestriction } from "./accounts";
import { StudioError } from "@/ports";
import { currentUser } from "@/stores/accounts";
import { createLocalWorkspaceFiles } from "@/lib/localWorkspaceFiles";
import type { NativeWorkspaceReader } from "@/ports/prototype";

function actor() {
  const user = currentUser.value;
  if (!user || !user.enabled || user.mustChangePassword) throw new Error("请先完成登录和修改密码");
  const restriction = scenarioAccountRestriction(user);
  if (restriction) throw new Error(restriction);
  return user.id;
}
function checkDirectory(directory: string) {
  if (!/^scenario:\/\/[a-zA-Z0-9-]+$/.test(directory) && !["studio://assets", "studio://templates"].includes(directory)) throw new Error("隔离预览仅访问本账号的演示项目和资产");
  return directory;
}
export function createScenarioWorkspaceFiles(getDirectory: () => string, nativeFiles: NativeWorkspaceReader) {
  const id = actor();
  return createLocalWorkspaceFiles(() => checkDirectory(getDirectory()), nativeFiles, {
    databaseName: `afxen.uiux.workspaces.${id}`, nativeImport: false,
    readMedia: async value => {
      const url = new URL(value, location.href);
      if (!["blob:", "data:"].includes(url.protocol) && (url.origin !== location.origin || !/^\/(onboarding|templates|curated)\//.test(url.pathname))) throw new Error("隔离预览不读取真实媒体服务");
      return fetch(url);
    },
  });
}
const unavailable = async (): Promise<never> => { throw new Error("隔离预览不访问真实工作区"); };
export function scenarioFiles(directory: string) { return createScenarioWorkspaceFiles(() => directory, { list: unavailable, read: unavailable }); }
export async function createScenarioProject(name: string) {
  if (typeof name !== "string" || !name.trim() || name.trim().length > 80) throw new Error("请输入1–80个字符的项目名称");
  actor();
  const directory = `scenario://${crypto.randomUUID()}`;
  await scenarioFiles(directory).write("画布1.json", JSON.stringify({ toonflowCanvas: true, nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } }), true);
  return directory;
}
export async function loadScenarioCreationState() {
  const value = localStorage.getItem(`afxen.uiux.creation.${actor()}`);
  if (!value) return { revision: "0".repeat(64), stores: { "toonflow.projectList": { project: null, projectList: [] } } };
  const state = JSON.parse(value);
  if (!state || typeof state.revision !== "string" || !/^[a-f0-9]{64}$/.test(state.revision) || !state.stores || typeof state.stores !== "object") throw new Error("演示项目索引无效，请保留已有数据后重试");
  return state;
}
export async function saveScenarioCreationState(input: { revision: string; stores: Record<string, unknown> }) {
  const id = actor();
  if (!input || !input.stores || Object.keys(input.stores).some(key => !["toonflow.projectList", "aiStudio.assetTags"].includes(key))) throw new Error("演示项目索引字段无效");
  const revision = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(input.stores)))), byte => byte.toString(16).padStart(2, "0")).join("");
  if (id !== actor()) throw new Error("账号已切换，保存已停止");
  const current = await loadScenarioCreationState();
  if (current.revision !== input.revision) throw new StudioError("演示项目列表已被其他页面修改，请刷新后重试", { data: { code: "ESTALE" } }, 409);
  const state = { revision, stores: input.stores };
  localStorage.setItem(`afxen.uiux.creation.${id}`, JSON.stringify(state));
  return state;
}
