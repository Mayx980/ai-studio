import { onBeforeUnmount, ref } from "vue";
import { useWorkspaceStore } from "@/stores/workspace";
import useWorkspaceFiles from "./workspaceFiles";
import { browserAssetMimeType } from "./browserAssets";
import { readGenerationOrigin, type GenerationOrigin } from "./generationOrigin";
import { readGenerationSettings, type GenerationSettings } from "./generationHistory";

export type HistoryItem = { id: string; kind: "image" | "video" | "audio"; path: string; name: string; mimeType: string; prompt?: string; model?: string; settings?: GenerationSettings; origin?: GenerationOrigin; createdAt?: number; directory: string; key: string; url: string };

export default function useGenerationHistory() {
  const workspace = useWorkspaceStore();
  const items = ref<HistoryItem[]>([]), loading = ref(false), error = ref("");
  const releases: (() => void)[] = [];
  let disposed = false, loaded = false;
  onBeforeUnmount(() => { disposed = true; releases.forEach(release => release()); });
  async function load() {
    if (loading.value || loaded || disposed) return;
    loading.value = true;

    const failures: string[] = [];
    for (const project of workspace.projectList) {
      if (disposed) return;
      try {
        const files = useWorkspaceFiles(project.directory);
        const records = await files.readJson<unknown>(".agent/browserResults.json").catch(cause => { if (cause.code === "ENOENT") return []; throw cause; });
        const hidden = await files.readJson<string[]>(".agent/hiddenResults.json").catch(cause => { if (cause.code === "ENOENT") return [] as string[]; throw cause; });
        if (!Array.isArray(records) || !Array.isArray(hidden) || hidden.some(id => typeof id !== "string")) throw new Error("历史记录格式无效");
        for (const record of records) {
          if (disposed) return;
          if (!record || typeof record.id !== "string" || typeof record.path !== "string" || !["image", "video", "audio"].includes(record.kind)) throw new Error("历史记录格式无效");
          if (hidden.includes(record.id)) continue;
          const mimeType = browserAssetMimeType(record.path);
          const handle = files.acquireUrl(record.path, mimeType); releases.push(handle.release);
          const url = await handle.url;
          if (disposed) { handle.release(); return; }
          items.value.push({ ...record, settings: readGenerationSettings(record.settings), origin: readGenerationOrigin(record.origin), name: record.name || record.path.split("/").at(-1), mimeType, createdAt: Number.isFinite(record.createdAt) && record.createdAt > 0 ? record.createdAt : undefined, directory: project.directory, key: `${project.directory}:${record.id}`, url });
        }
      } catch { failures.push(project.name); }
    }
    if (failures.length) error.value = `部分项目历史读取失败：${failures.join("、")}`;
    loading.value = false;
    loaded = true;
  }
  return { items, loading, error, load };
}
