import { useAssetStore, historyUntaggedLabel } from "@/stores/assets";
import { onBeforeUnmount, ref } from "vue";
import { useWorkspaceStore } from "@/stores/workspace";
import useWorkspaceFiles from "./workspaceFiles";
import { browserAssetMimeType } from "./browserAssets";
import { readGenerationOrigin, type GenerationOrigin } from "./generationOrigin";
import { readGenerationSettings, readGenerationTags, type GenerationSettings, type GenerationRecord } from "./generationHistory";

export type HistoryItem = { id: string; kind: "image" | "video" | "audio"; path: string; name: string; fileName: string; tags?: string[]; mimeType: string; prompt?: string; model?: string; settings?: GenerationSettings; origin?: GenerationOrigin; createdAt?: number; directory: string; key: string; url: string };

function defaultHistoryName(record: GenerationRecord, index: number, total: number) {
  const fileName = record.name || record.path.split("/").at(-1) || "生成素材";
  const stem = fileName.replace(/\.[a-z0-9]+$/i, "");
  const automatic = !record.name || /^(?:生成(?:素材|结果|图片|视频|音频)(?:[ _-]?\d+)?|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.test(stem);
  if (!automatic || typeof record.prompt !== "string" || !record.prompt.trim() || record.kind === "audio") return fileName;
  const prompt = record.prompt.trim().replace(/^(?:(?:请帮我|帮我|请)\s*)?(?:生成|绘制|画出|制作|创建)(?:一[张幅个段条组])?\s*/u, "").replace(/^(?:图片|视频|照片|图像|插画)\s*[：:]\s*/u, "");
  const summary = prompt.split(/[，。！？；\n!?;]/u).find(part => part.trim())?.replace(/\s+/gu, " ").trim();
  if (!summary) return fileName;
  const suffix = total > 1 ? `-${index + 1}` : "";
  return Array.from(summary).slice(0, Math.max(1, 16 - suffix.length)).join("") + suffix;
}

export default function useGenerationHistory() {
  const workspace = useWorkspaceStore();
  const assets = useAssetStore();
  function matchesTag(item: HistoryItem, tag: string) { const tags = assets.historyTagsFor(item); return !tag || (tag === historyUntaggedLabel ? !tags.length : tags.includes(tag)); }
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
        const batches = new Map<string, GenerationRecord[]>();
        for (const record of records) {
          if (!record || typeof record.id !== "string" || typeof record.path !== "string" || !["image", "video", "audio"].includes(record.kind)) throw new Error("历史记录格式无效");
          // ACT: 旧记录仅在生成时刻、提示词和来源均一致时归为一批，不推测相邻时间的请求。
          const key = typeof record.batchId === "string" && record.batchId ? JSON.stringify([record.kind, record.batchId]) : Number.isFinite(record.createdAt) && record.createdAt > 0 ? JSON.stringify([record.kind, record.createdAt, record.prompt, record.model, record.origin]) : record.id;
          const batch = batches.get(key) ?? [];
          batch.push(record); batches.set(key, batch);
        }
        const names = new Map<string, string>();
        for (const batch of batches.values()) batch.forEach((record, index) => names.set(record.id, defaultHistoryName(record, index, batch.length)));
        for (const record of records) {
          if (disposed) return;
          if (hidden.includes(record.id)) continue;
          const mimeType = browserAssetMimeType(record.path);
          const handle = files.acquireUrl(record.path, mimeType); releases.push(handle.release);
          const url = await handle.url;
          if (disposed) { handle.release(); return; }
          items.value.push({ ...record, tags: readGenerationTags(record.tags), settings: readGenerationSettings(record.settings), origin: readGenerationOrigin(record.origin), name: names.get(record.id)!, fileName: record.name || record.path.split("/").at(-1)!, mimeType, createdAt: Number.isFinite(record.createdAt) && record.createdAt > 0 ? record.createdAt : undefined, directory: project.directory, key: `${project.directory}:${record.id}`, url });
        }
      } catch { failures.push(project.name); }
    }
    if (failures.length) error.value = `部分项目历史读取失败：${failures.join("、")}`;
    loading.value = false;
    loaded = true;
  }
  return { items, loading, error, load, matchesTag, tagsFor: assets.historyTagsFor };
}
