import { getWorkspaceFailure } from "@toonflow/nodes-scaffold/workspaceFiles";
import { z } from "@toonflow/nodes-scaffold/nodeTools";
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

export type GenerationRecord = { id: string; kind: "image" | "video" | "audio"; path: string; mimeType?: string; name?: string; createdAt?: number; prompt?: string; model?: string; settings?: GenerationSettings };
const pendingSaves = new Map<string, Promise<void>>();
export async function recordGenerationResults(directory: string, records: GenerationRecord[]) {
  const previous = pendingSaves.get(directory) ?? Promise.resolve();
  const saving = previous.catch(() => {}).then(async () => {
    const files = useWorkspaceFiles(directory);
    const path = ".agent/browserResults.json";
    const snapshot = await files.readTextSnapshot(path).catch(error => { if (getWorkspaceFailure(error).code === "ENOENT") return undefined; throw error; });
    const saved: GenerationRecord[] = snapshot ? JSON.parse(snapshot.text) : [];
    if (!Array.isArray(saved)) throw new Error("浏览器素材记录无效");
    const merged = new Map(saved.map(item => [item.id, item]));
    for (const item of records) merged.set(item.id, item);
    await files.mkdir(".agent").catch(error => { if (getWorkspaceFailure(error).code !== "EEXIST") throw error; });
    if (snapshot) await files.writeTextSnapshot(path, JSON.stringify([...merged.values()]), snapshot);
    else await files.writeJson(path, [...merged.values()], true);
  });
  pendingSaves.set(directory, saving);
  try { await saving; } finally { if (pendingSaves.get(directory) === saving) pendingSaves.delete(directory); }
}
