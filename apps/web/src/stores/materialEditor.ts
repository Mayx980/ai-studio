import { reactive, ref, shallowRef, watch } from "vue";
import type { AgentAttachment, ReferenceRole, ReferenceCategory } from "@/components/agent/types";
import { browserConfig, browserModelSelection } from "./browserGeneration";

export type MaterialTarget = { role: ReferenceRole; category?: ReferenceCategory };
type MaterialRequest = { owner: symbol; source?: "canvas"; directory: string; target: MaterialTarget; label: string; apply: (file: File) => void | Promise<void> };
export type MaterialTaskStatus = "idle" | "queued" | "generating" | "completed" | "failed";
const parameterKeys = ["kind", "ratio", "imageSize", "imageResolution", "count", "style", "outputKind", "outputChosen", "generateAudio", "duration", "resolution"] as const;
export type MaterialWorkspace = {
  id: string; directory: string; label: string; target: MaterialTarget; sessionFile?: string;
  status: MaterialTaskStatus; taskId?: string; vendorTaskId?: string; resultIds: string[]; error: string; uncertain?: boolean;
  prompt: string; attachments: AgentAttachment[]; minimized: boolean;
  config: typeof browserConfig; modelSelection: typeof browserModelSelection; request?: MaterialRequest;
};
export const materialEditorState = shallowRef<MaterialRequest>();
export const materialWorkspaces = ref<MaterialWorkspace[]>([]);
export const materialStorageError = ref("");
export const activeMaterialWorkspace = ref<string>();
const storageKey = "afxen.materialWorkspaces";
let storageReadable = true;
export function saveMaterialWorkspaces() {
  if (!storageReadable) return;
  try {
    localStorage.setItem(storageKey, JSON.stringify(materialWorkspaces.value.map(item => ({
      id: item.id, directory: item.directory, label: item.label, target: item.target, sessionFile: item.sessionFile,
      status: item.status, taskId: item.taskId, vendorTaskId: item.vendorTaskId, resultIds: item.resultIds, error: item.error, uncertain: item.uncertain,
      prompt: item.prompt, attachments: item.attachments.filter(file => file.path).map(({ file, ...attachment }) => attachment),
      parameters: Object.fromEntries(parameterKeys.map(key => [key, item.config[key]])), modelSelection: item.modelSelection,
    }))));
    materialStorageError.value = "";
  } catch { materialStorageError.value = "生成窗口保存失败，请保留当前页面并检查浏览器存储空间。"; }
}
function workspaceConfig(parameters?: Record<string, unknown>) {
  const config = reactive({ ...browserConfig, keys: browserConfig.keys });
  for (const key of parameterKeys) if (parameters && typeof parameters[key] === typeof config[key]) Object.assign(config, { [key]: parameters[key] });
  return config;
}
export function restoreMaterialWorkspaces() {
  if (materialWorkspaces.value.length) return;
  try {
    const records: unknown = JSON.parse(localStorage.getItem(storageKey) || "[]");
    if (!Array.isArray(records)) throw new Error("invalid");
    for (const record of records) {
      if (!record || typeof record.id !== "string" || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(record.id) || (record.sessionFile !== undefined && (typeof record.sessionFile !== "string" || !/^[\w-]+\.json$/.test(record.sessionFile))) || typeof record.directory !== "string" || typeof record.label !== "string" || !["reference", "firstFrame", "middleFrame", "lastFrame"].includes(record.target?.role) || !["idle", "queued", "generating", "completed", "failed"].includes(record.status)) throw new Error("invalid");
      const uncertain = record.status === "generating" || record.uncertain === true;
      materialWorkspaces.value.push({ ...record, request: undefined, target: { role: record.target.role, category: ["character", "scene", "prop", "other"].includes(record.target.category) ? record.target.category : undefined }, minimized: true, status: ["generating", "queued"].includes(record.status) ? "failed" : record.status,
        uncertain, error: uncertain ? `页面已刷新，远端任务结果尚未确认。请先核查供应商任务记录，避免重复生成。${typeof record.vendorTaskId === "string" ? `任务编号：${record.vendorTaskId}` : ""}` : record.status === "queued" ? "等待中的任务未提交，可重新打开并生成。" : typeof record.error === "string" ? record.error : "",
        prompt: typeof record.prompt === "string" ? record.prompt : "", resultIds: Array.isArray(record.resultIds) ? record.resultIds.filter((id: unknown) => typeof id === "string") : [],
        attachments: Array.isArray(record.attachments) ? record.attachments.filter((file: AgentAttachment) => file && typeof file.name === "string" && typeof file.path === "string" && typeof file.mimeType === "string") : [],
        config: workspaceConfig(record.parameters), modelSelection: reactive({ ...browserModelSelection, ...Object.fromEntries(Object.entries(record.modelSelection || {}).filter(([key, value]) => ["image", "video", "audio", "text"].includes(key) && typeof value === "string")) }),
      });
    }
  } catch { storageReadable = false; materialStorageError.value = "生成窗口记录无法恢复，请保留浏览器数据并检查存储设置。"; }
}
export function openMaterialWorkspace(item: MaterialWorkspace) {
  materialWorkspaces.value.forEach(workspace => { workspace.minimized = workspace.id !== item.id; });
  item.minimized = false; activeMaterialWorkspace.value = item.id;
}
export function minimizeMaterialWorkspace(item: MaterialWorkspace) {
  item.minimized = true;
  if (activeMaterialWorkspace.value === item.id) activeMaterialWorkspace.value = undefined;
}
export function createMaterialWorkspace(request: MaterialRequest) {
  const item: MaterialWorkspace = reactive({ id: crypto.randomUUID(), directory: request.directory, label: request.label, target: { ...request.target }, status: "idle", resultIds: [], error: "", prompt: "", attachments: [], minimized: false,
    config: workspaceConfig(), modelSelection: reactive({ ...browserModelSelection }), request });
  item.config.kind = "image"; item.config.outputKind = "image"; item.config.outputChosen = true;
  materialWorkspaces.value.push(item); openMaterialWorkspace(item); saveMaterialWorkspaces();
  return item;
}
watch(materialEditorState, request => { if (request) createMaterialWorkspace(request); }, { flush: "sync" });
export function materialStatusLabel(item: MaterialWorkspace) {
  return ({ idle: "继续生成对话", queued: "等待生成", generating: "正在生成", completed: "生成完成", failed: item.uncertain ? "待确认结果" : "生成失败 · 重试" })[item.status];
}
