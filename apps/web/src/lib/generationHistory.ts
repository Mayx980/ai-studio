import useWorkspaceFiles from "@/lib/workspaceFiles";

export type GenerationRecord = { id: string; kind: "image" | "video" | "audio"; path: string; mimeType?: string; name?: string; createdAt?: number };
const pendingSaves = new Map<string, Promise<void>>();
export async function recordGenerationResults(directory: string, records: GenerationRecord[]) {
  const previous = pendingSaves.get(directory) ?? Promise.resolve();
  const saving = previous.catch(() => {}).then(async () => {
    const files = useWorkspaceFiles(directory);
    const saved = await files.readJson<GenerationRecord[]>(".agent/browserResults.json").catch(error => { if (error.code === "ENOENT") return [] as GenerationRecord[]; throw error; });
    if (!Array.isArray(saved)) throw new Error("浏览器素材记录无效");
    const merged = new Map(saved.map(item => [item.id, item]));
    for (const item of records) merged.set(item.id, item);
    await files.mkdir(".agent").catch(error => { if (error.code !== "EEXIST") throw error; });
    await files.writeJson(".agent/browserResults.json", [...merged.values()]);
  });
  pendingSaves.set(directory, saving);
  try { await saving; } finally { if (pendingSaves.get(directory) === saving) pendingSaves.delete(directory); }
}
