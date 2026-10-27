import { defineStore } from "pinia";
import { ref } from "vue";

export const useAssetStore = defineStore("assets", () => {
  const tags = ref<Record<string, string[]>>({});
  return { tags };
}, { persist: { key: "aiStudio.assetTags", pick: ["tags"] } });
