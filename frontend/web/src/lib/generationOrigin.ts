import { getWorkspaceFailure } from "@toonflow/nodes-scaffold/workspaceFiles";
import type { Router } from "vue-router";
import { z } from "@toonflow/nodes-scaffold/nodeTools";
import useWorkspaceFiles from "./workspaceFiles";
import type { GenerationRecord } from "./generationHistory";
const relativePath = z.string().min(1).refine(value => !/^[\\/]|\0/.test(value) && !value.split(/[\\/]/).includes(".."));
const originSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("canvas"), directory: z.string().min(1), canvasPath: relativePath, nodeId: z.string().min(1) }),
  z.object({ type: z.literal("conversation"), directory: z.string().min(1), sessionFile: z.string().regex(/^[\w-]+\.json$/), messageId: z.string().optional() }),
]);
export type GenerationOrigin = z.infer<typeof originSchema>;
export function readGenerationOrigin(value: unknown): GenerationOrigin | undefined {
  if (value === undefined) return;
  const parsed = originSchema.safeParse(value);
  if (!parsed.success) throw new Error("素材来源记录无效，请保留原素材后检查");
  return parsed.data;
}
const assetPaths = new WeakMap<File, string>();
export function fileAssetPath(file: File) { return assetPaths.get(file); }
const fileOrigins = new WeakMap<File, GenerationOrigin>();
export function rememberFileOrigin(file: File, origin?: GenerationOrigin, assetPath?: string) { if (assetPath) assetPaths.set(file, assetPath); if (origin) fileOrigins.set(file, readGenerationOrigin(origin)!); return file; }
export function fileGenerationOrigin(file?: File) { return file ? fileOrigins.get(file) : undefined; }
export async function generationRecordForPath(directory: string, path: string) {
  const records = await useWorkspaceFiles(directory).readJson<GenerationRecord[]>(".agent/browserResults.json").catch(error => { if (getWorkspaceFailure(error).code === "ENOENT") return []; throw error; });
  if (!Array.isArray(records)) throw new Error("生成历史记录无效");
  return records.find(item => item.path === path);
}
export async function resolveGenerationOrigin(directory: string, record: Pick<GenerationRecord, "id" | "path" | "origin">): Promise<GenerationOrigin | undefined> {
  const saved = readGenerationOrigin(record.origin);
  if (saved) return saved;
  const matches: GenerationOrigin[] = [];
  const { listBrowserConversations, readBrowserConversation } = await import("@/components/agent/browserConversations");
  for (const entry of await listBrowserConversations(directory)) {
    const session = await readBrowserConversation(directory, entry.file);
    if (session.messages.some(message => message.browserResultIds?.includes(record.id) || message.professional?.resultIds.includes(record.id))) matches.push({ type: "conversation", directory, sessionFile: entry.file });
  }
  if (matches.length === 1) return matches[0];
  if (matches.length > 1) throw new Error("同一结果存在多个会话来源，请从原项目选择");
  const { readCanvasFiles } = await import("@/pages/workspace/panels/canvas/canvasFiles");
  function containsOutput(value: unknown): boolean {
    if (!value || typeof value !== "object") return false;
    if (Array.isArray(value)) return value.some(containsOutput);
    return Object.entries(value).some(([key, value]) => ["url", "path"].includes(key) && value === record.path || containsOutput(value));
  }
  for (const canvas of await readCanvasFiles(useWorkspaceFiles(directory))) for (const node of canvas.data.nodes) if (containsOutput(node.data?.outputs)) matches.push({ type: "canvas", directory, canvasPath: canvas.id, nodeId: node.id });
  if (matches.length > 1) throw new Error("该历史素材对应多个来源，请从原项目中选择；不会自动跳转到其他项目");
  return matches[0];
}
export async function validateGenerationOrigin(value: GenerationOrigin) {
  const origin = readGenerationOrigin(value)!;
  if (origin.type === "conversation") {
    const { readBrowserConversation } = await import("@/components/agent/browserConversations");
    await readBrowserConversation(origin.directory, origin.sessionFile);
  } else {
    const { readCanvasFiles } = await import("@/pages/workspace/panels/canvas/canvasFiles");
    const canvas = (await readCanvasFiles(useWorkspaceFiles(origin.directory), origin.canvasPath))[0];
    if (!canvas?.data.nodes.some(node => node.id === origin.nodeId)) throw new Error("原画布或节点已不存在，素材仍保留");
  }
  return origin;
}
export function generationOriginQuery(origin: GenerationOrigin) {
  return { returnSection: "assets", sourceType: origin.type, sourceDirectory: origin.directory, source: origin.type === "canvas" ? origin.nodeId : origin.sessionFile, ...(origin.type === "canvas" ? { canvasPath: origin.canvasPath } : {}) };
}
export function sourceWorkspaceUrl(origin: GenerationOrigin) {
  return `${window.location.pathname}#/workspace?${new URLSearchParams(generationOriginQuery(origin))}`;
}
export async function openGenerationOrigin(value: GenerationOrigin, router: Router, embedded = false) {
  const origin = await validateGenerationOrigin(value);
  if (!embedded) { await router.push({ path: "/source", query: generationOriginQuery(origin) }); return; }
  const { useWorkspaceStore } = await import("@/stores/workspace");
  const workspace = useWorkspaceStore();
  await workspace.openProject(origin.directory);
  workspace.creationMode = origin.type === "canvas" ? "professional" : "simple";
  if (origin.type === "canvas") workspace.pendingCanvasEntry = { directory: origin.directory, canvasPath: origin.canvasPath, nodeId: origin.nodeId };
  else workspace.pendingAgentSession = { directory: origin.directory, file: origin.sessionFile };
  await router.push({ path: "/workspace", query: generationOriginQuery(origin) });
}
export async function clearGenerationOriginRoute(router: Router) {
  const route = router.currentRoute.value;
  if (!route.query.sourceType) return;
  const { sourceType, sourceDirectory, source, canvasPath, ...query } = route.query;
  await router.replace({ path: route.path, query });
}

export async function openCreationPage(router: Router) {
  if (window.frameElement?.hasAttribute("data-source-editor")) {
    const request: { completion?: Promise<void> } = {};
    window.dispatchEvent(new CustomEvent("afxen:open-creation", { detail: request }));
    if (!request.completion) throw new Error("创作页入口尚未就绪，请稍后重试");
    await request.completion;
    return;
  }
  await clearGenerationOriginRoute(router);
  const { useWorkspaceStore } = await import("@/stores/workspace");
  await useWorkspaceStore().resumeSimpleConversation();
  await router.push({ path: "/workspace", query: { returnSection: "create" } });
}
