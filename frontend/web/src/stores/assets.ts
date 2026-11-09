import { defineStore } from "pinia";
import { ref } from "vue";

export type AssetMetadata = { createdAt?: number; source?: string; prompt?: string; model?: string };

export const useAssetStore = defineStore("assets", () => {
  const tags = ref<Record<string, string[]>>({});
  const metadata = ref<Record<string, AssetMetadata>>({});
  return { tags, metadata };
}, { persist: { key: "aiStudio.assetTags", pick: ["tags", "metadata"] } });
