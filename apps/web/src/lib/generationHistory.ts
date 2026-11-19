import type { NodeOutputs } from "@toonflow/nodes-scaffold/values";
import { saveProjectCover } from "./projectCover";
import { z } from "@toonflow/nodes-scaffold/nodeTools";
import { readGenerationOrigin, type GenerationOrigin } from "./generationOrigin";
import useWorkspaceFiles from "@/lib/workspaceFiles";

const generationSettingsSchema = z.object({
  providerId: z.string().min(1), modelId: z.string().min(1), label: z.string().min(1), ratio: z.string(),
  imageSize: z.string(), n: z.number().int().min(1).max(6), style: z.string(),
  duration: z.number().finite().refine(value => value === -1 || value > 0), resolution: z.string(), generateAudio: z.boolean(),
  mode: z.enum(["text", "singleImage", "reference"]),
}).strict();
export type GenerationSettings = z.infer<typeof generationSettingsSchema>;
export function readGenerationSettings(value: unknown): GenerationSettings | undefined {
  if (value === undefined) return;
  const parsed = generationSettingsSchema.safeParse(value);
  if (!parsed.success) throw new Error("生成参数记录无效，请保留原素材后重试");
  return parsed.data;
}

export type GenerationRecord = { id: string; batchId?: string; tags?: string[]; kind: "image" | "video" | "audio"; path: string; mimeType?: string; name?: string; createdAt?: number; prompt?: string; model?: string; settings?: GenerationSettings; origin?: GenerationOrigin; references?: { path: string; mimeType: string; name?: string; referenceRole?: string; videoClip?: { duration: number; start: number; end: number; outputDuration: number } }[] };
export function readGenerationTags(value: unknown): string[] {
  if (value === undefined) return [];
  return z.array(z.string().trim().min(1).max(20)).parse(value);
}
const pendingSaves = new Map<string, Promise<void>>();
export async function recordGenerationResults(directory: string, records: GenerationRecord[]) {
  const previous = pendingSaves.get(directory) ?? Promise.resolve();
  const saving = previous.catch(() => {}).then(async () => {
    const files = useWorkspaceFiles(directory);
    const saved = await files.readJson<GenerationRecord[]>(".agent/browserResults.json").catch(error => { if (error.code === "ENOENT") return [] as GenerationRecord[]; throw error; });
    if (!Array.isArray(saved)) throw new Error("浏览器素材记录无效");
    const merged = new Map(saved.map(item => [item.id, item]));
    for (const item of records) merged.set(item.id, { ...item, tags: readGenerationTags(item.tags), origin: readGenerationOrigin(item.origin) });
    await files.mkdir(".agent").catch(error => { if (error.code !== "EEXIST") throw error; });
    await files.writeJson(".agent/browserResults.json", [...merged.values()]);
    window.dispatchEvent(new CustomEvent("afxen:generation-recorded", { detail: { directory, records } }));
  });
  pendingSaves.set(directory, saving);
  try { await saving; } finally { if (pendingSaves.get(directory) === saving) pendingSaves.delete(directory); }
}

const pendingCanvasResults = new Map<string, GenerationRecord[]>();
export function deferCanvasGeneration(origin: Extract<GenerationOrigin, { type: "canvas" }>, records: GenerationRecord[]) {
  pendingCanvasResults.set(JSON.stringify([origin.directory, origin.canvasPath, origin.nodeId]), records);
}
export async function commitCanvasGeneration(directory: string, canvasPath: string, nodeId: string, outputs: NodeOutputs) {
  const key = JSON.stringify([directory, canvasPath, nodeId]);
  const pending = pendingCanvasResults.get(key);
  if (!pending) return;
  const media = [...new Map(Object.values(outputs).flatMap(output => output && (output.dataType === "IMAGE" || output.dataType === "VIDEO") && output.value ? [[output.value.url, { path: output.value.url, mimeType: output.value.mimeType }] as const] : [])).values()];
  if (!media.length || media.length > pending.length) throw new Error("最终素材与生成记录数量不一致，请保留原画布");
  // ACT: 后处理只发布保留的输出，未保留的临时结果不进入历史。
  const records = media.map((item, index) => ({ ...pending[index]!, ...item, name: item.path.split("/").at(-1) }));
  await recordGenerationResults(directory, records);
  if (pendingCanvasResults.get(key) === pending) pendingCanvasResults.delete(key);
  if (records[0]) await saveProjectCover(directory, records[0].path, records[0].mimeType!);
}
