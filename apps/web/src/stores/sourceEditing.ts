import { ref, shallowRef } from "vue";
import type { AgentAttachment } from "@/components/agent/types";
import type { GenerationRecord } from "@/lib/generationHistory";
import { generationRecordForPath, readGenerationOrigin, validateGenerationOrigin, type GenerationOrigin } from "@/lib/generationOrigin";
import { captureVideoFrame } from "@/lib/videoFrame";
import useWorkspaceFiles from "@/lib/workspaceFiles";
import { uploadNodeFile } from "@toonflow/nodes-scaffold/workspaceFiles";
import { browserConfig, browserModelSelection, browserParameterKeys } from "./browserGeneration";
import { useWorkspaceStore } from "./workspace";

type SourceEdit = { directory: string; sessionFile: string; prompt: string; attachments: AgentAttachment[]; index: number; name: string; origin: GenerationOrigin; startedAt: number; parameters?: Record<string, unknown>; modelSelection?: Record<string, string>; result?: GenerationRecord & { directory: string } };
export const sourceEdit = shallowRef<SourceEdit>();
export const sourceEditorMinimized = ref(false);
export const sourceEditBusy = ref(false), sourceEditError = ref("");
// 来源编辑页也可打开素材来源，返回记录按所在页面隔离，避免覆盖外层对话草稿。
const storageKey = window.frameElement?.hasAttribute("data-source-editor") ? `afxen.sourceEdit.frame.${encodeURIComponent(window.location.hash)}` : "afxen.sourceEdit";
let storageReadable = true;
function save() {
  if (!storageReadable) return;
  try { if (sourceEdit.value) sessionStorage.setItem(storageKey, JSON.stringify(sourceEdit.value)); else sessionStorage.removeItem(storageKey); }
  catch { sourceEditError.value = "编辑返回信息保存失败，请保留当前页面。"; }
}
function validateSourceEdit(item: SourceEdit) {
  if (!item || typeof item.name !== "string" || !Number.isFinite(item.startedAt) || typeof item.directory !== "string" || !/^[\w-]+\.json$/.test(item.sessionFile) || typeof item.prompt !== "string" || !Array.isArray(item.attachments) || item.attachments.length > 20 || item.attachments.some((attachment: AgentAttachment) => !attachment || typeof attachment.name !== "string" || typeof attachment.path !== "string" || typeof attachment.mimeType !== "string") || !Number.isInteger(item.index) || !item.attachments[item.index]) throw new Error("invalid");
  const origin = readGenerationOrigin(item.origin);
  if (!origin) throw new Error("invalid");
  item.origin = origin;
  if (item.parameters && ((typeof item.parameters.kind !== "string" || !["image", "video", "audio", "text"].includes(item.parameters.kind)) || typeof item.parameters.outputKind !== "string" || !["image", "video"].includes(item.parameters.outputKind) || typeof item.parameters.count !== "number" || !Number.isInteger(item.parameters.count) || item.parameters.count < 1 || item.parameters.count > 6)) throw new Error("invalid");
  if (item.result) {
    if (typeof item.result.id !== "string" || typeof item.result.path !== "string" || typeof item.result.directory !== "string" || !["image", "video"].includes(item.result.kind)) throw new Error("invalid");
    const resultOrigin = readGenerationOrigin(item.result.origin);
    if (!resultOrigin || !sameOrigin(resultOrigin, item.origin)) throw new Error("invalid");
    item.result.origin = resultOrigin;
  }
}
function sourceEditKey(item: Pick<SourceEdit, "origin">) {
  const origin = item.origin;
  return `${storageKey}.${JSON.stringify(origin.type === "canvas" ? [origin.type, origin.directory, origin.canvasPath, origin.nodeId] : [origin.type, origin.directory, origin.sessionFile])}`;
}
export function restoreSourceEdit() {
  if (sourceEdit.value) return;
  try {
    const raw = sessionStorage.getItem(storageKey);
    if (!raw) return;
    const item = JSON.parse(raw);
    validateSourceEdit(item);
    sourceEdit.value = item;
  } catch { storageReadable = false; sourceEditError.value = "参考素材编辑信息无法恢复，请保留当前浏览器数据。"; }
}
export async function startSourceEdit(item: Omit<SourceEdit, "startedAt" | "name">) {
  if (sourceEditBusy.value) return;
  if (!storageReadable) throw new Error("已有编辑返回信息无法恢复，请保留浏览器数据后处理");
  const previous = sourceEdit.value;
  if (!Number.isInteger(item.index) || !item.attachments[item.index]) throw new Error("原参考素材已移除，请重新选择");
  if (!readGenerationOrigin(item.origin)) throw new Error("缺少可验证的素材来源");
  sourceEditBusy.value = true; sourceEditError.value = "";
  try {
    await validateGenerationOrigin(item.origin);
    const archived = sessionStorage.getItem(sourceEditKey(item));
    const resumed = previous && sameOrigin(previous.origin, item.origin) ? previous : archived ? JSON.parse(archived) as SourceEdit : undefined;
    if (resumed) { validateSourceEdit(resumed); if (!sameOrigin(resumed.origin, item.origin)) throw new Error("来源编辑记录不匹配"); }
    const files = useWorkspaceFiles(item.directory);
    const attachments: AgentAttachment[] = [];
    for (const attachment of item.attachments) {
      const path = attachment.path || (attachment.file ? await uploadNodeFile(files, crypto.randomUUID(), attachment.file) : "");
      if (!path) throw new Error("参考素材尚未保存，请重新上传后编辑");
      const { file, ...saved } = attachment;
      attachments.push({ ...saved, path });
    }
    if (previous) sessionStorage.setItem(sourceEditKey(previous), JSON.stringify(previous));
    sourceEditorMinimized.value = false;
    sourceEdit.value = { ...item, attachments, name: attachments[item.index]!.name, startedAt: resumed?.startedAt ?? Date.now(), result: resumed?.result, parameters: Object.fromEntries(browserParameterKeys.map(key => [key, browserConfig[key]])), modelSelection: { ...browserModelSelection } };
    save();
  } catch (error) { sourceEdit.value = previous; throw error; }
  finally { sourceEditBusy.value = false; }
}
function sameOrigin(a: GenerationOrigin, b: GenerationOrigin) {
  return a.directory === b.directory && a.type === b.type && (a.type === "canvas" && b.type === "canvas" ? a.canvasPath === b.canvasPath && a.nodeId === b.nodeId : a.type === "conversation" && b.type === "conversation" && a.sessionFile === b.sessionFile);
}
export function receiveSourceResult(event: Event) {
  const context = sourceEdit.value;
  if (!context) return;
  const detail = (event as CustomEvent<{ directory: string; records: GenerationRecord[] }>).detail;
  const result = detail?.records?.findLast(item => ["image", "video"].includes(item.kind) && item.origin && sameOrigin(item.origin, context.origin) && (item.createdAt ?? 0) >= context.startedAt);
  if (result) { sourceEdit.value = { ...context, result: { ...result, directory: detail.directory } }; save(); }
}
window.addEventListener("afxen:generation-recorded", receiveSourceResult);
export async function returnFromSourceEdit(apply = false) {
  const context = sourceEdit.value;
  if (!context || sourceEditBusy.value) return;
  sourceEditBusy.value = true; sourceEditError.value = "";
  try {
    const attachments = context.attachments.map(item => ({ ...item }));
    if (apply) {
      const candidate = context.result;
      if (!candidate) throw new Error("还没有新的生成结果");
      const saved = await generationRecordForPath(candidate.directory, candidate.path);
      const origin = readGenerationOrigin(saved?.origin);
      if (!saved || !["image", "video"].includes(saved.kind) || saved.id !== candidate.id || !origin || !sameOrigin(origin, context.origin) || (saved.createdAt ?? 0) < context.startedAt) throw new Error("无法验证本次编辑结果的来源，原素材已保留");
      const result = { ...saved, directory: candidate.directory, origin };
      let mimeType = result.mimeType || (result.kind === "video" ? "video/mp4" : "image/png");
      let file = new File([await useWorkspaceFiles(result.directory).read(result.path)], result.name || result.path.split("/").at(-1)!, { type: mimeType });
      const role = attachments[context.index]?.referenceRole;
      if (role && ["firstFrame", "middleFrame", "lastFrame"].includes(role) && mimeType.startsWith("video/")) {
        const video = document.createElement("video"), url = URL.createObjectURL(file);
        try { video.src = url; file = await captureVideoFrame(video, role === "lastFrame" ? "last" : "first"); mimeType = file.type; }
        finally { video.removeAttribute("src"); video.load(); URL.revokeObjectURL(url); }
      }
      const path = await uploadNodeFile(useWorkspaceFiles(context.directory), crypto.randomUUID(), file);
      attachments[context.index] = { ...attachments[context.index]!, name: file.name, path, mimeType, origin: result.origin, assetPath: undefined };
    }
    for (const key of browserParameterKeys) if (context.parameters && typeof context.parameters[key] === typeof browserConfig[key]) Object.assign(browserConfig, { [key]: context.parameters[key] });
    for (const key of ["image", "video", "audio", "text"] as const) if (typeof context.modelSelection?.[key] === "string") browserModelSelection[key] = context.modelSelection[key];
    useWorkspaceStore().pendingAgentDraft = { file: context.sessionFile, prompt: context.prompt, attachments };
    sessionStorage.removeItem(sourceEditKey(context));
    sourceEdit.value = undefined; save();
  } catch (error) { sourceEditError.value = error instanceof Error ? error.message : "返回原对话失败，原素材已保留"; }
  finally { sourceEditBusy.value = false; }
}
