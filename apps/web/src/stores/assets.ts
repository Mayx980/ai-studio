import type { GenerationOrigin } from "@/lib/generationOrigin";
import { defineStore } from "pinia";
import { ref } from "vue";

export type AssetMetadata = { createdAt?: number; source?: string; prompt?: string; model?: string; origin?: GenerationOrigin };

export const historyLabelNames = ["角色", "场景", "物品", "风格", "音效"];
export const historyUntaggedLabel = "__untagged__";
type TaggedHistory = { id: string; directory: string; tags?: string[] };

export const useAssetStore = defineStore("assets", () => {
  const tags = ref<Record<string, string[]>>({});
  const metadata = ref<Record<string, AssetMetadata>>({});
  const historyTags = ref<Record<string, string[]>>({});
  const historyTagNames = ref<string[]>([]);
  function historyTagsFor(item: TaggedHistory) { return historyTags.value[JSON.stringify([item.directory, item.id])] ?? item.tags ?? []; }
  function setHistoryTags(items: TaggedHistory[], values: string[]) {
    if (values.some(value => typeof value !== "string" || !value.trim() || value.length > 20 || /[\u0000-\u001f]/.test(value))) throw new Error("标签格式无效");
    for (const item of items) historyTags.value[JSON.stringify([item.directory, item.id])] = [...new Set(values.map(value => value.trim()))];
  }
  return { tags, metadata, historyTags, historyTagNames, historyTagsFor, setHistoryTags };
}, { persist: { key: "aiStudio.assetTags", pick: ["tags", "metadata", "historyTags", "historyTagNames"] } });
