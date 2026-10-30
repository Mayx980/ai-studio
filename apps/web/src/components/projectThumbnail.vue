<template>
  <span class="projectThumbnail">
    <img v-if="url && kind === 'image'" :src="url" alt="项目图片预览" @error="url = ''" />
    <video v-else-if="url && kind === 'video'" :src="url" muted playsinline preload="metadata" @loadedmetadata="($event.target as HTMLVideoElement).currentTime = Math.min(0.1, ($event.target as HTMLVideoElement).duration / 2)" aria-label="项目视频封面" @error="url = ''" />
    <icon-folder v-else :size="44" aria-hidden="true" />
  </span>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import { IconFolder } from "@tabler/icons-vue";
import useWorkspaceFiles from "@/lib/workspaceFiles";
const props = defineProps<{ directory: string }>();
const url = ref("");
const kind = ref("");
watch(() => props.directory, async (directory, _previous, onCleanup) => {
  const controller = new AbortController();
  let release: (() => void) | undefined;
  onCleanup(() => { controller.abort(); release?.(); });
  url.value = "";
  const files = useWorkspaceFiles(directory);
  try {
    let cover = await files.readJson<{ path: string; mimeType: string }>(".agent/projectCover.json").catch(error => { if (error.code !== "ENOENT") throw error; return undefined; });
    if (!cover) {
      const results = await files.readJson<{ kind: string; path: string; mimeType?: string }[]>(".agent/browserResults.json").catch(error => { if (error.code !== "ENOENT") throw error; return []; });
      const first = Array.isArray(results) ? results.find(item => ["image", "video"].includes(item.kind) && typeof item.path === "string") : undefined;
      if (first) cover = { path: first.path, mimeType: first.mimeType || (first.kind === "image" ? "image/png" : "video/mp4") };
    }
    if (controller.signal.aborted) return;
    if (cover && typeof cover.path === "string" && /^(image|video)\//.test(cover.mimeType)) {
      kind.value = cover.mimeType.startsWith("image/") ? "image" : "video";
      const handle = files.acquireUrl(cover.path, cover.mimeType); release = handle.release;
      const source = await handle.url; if (!controller.signal.aborted) url.value = source;
      return;
    }
    const { entries } = await files.list("", controller.signal);
    // ACT: 卡片只读取首个画布的有限文件头，不递归扫描整个项目。
    const canvas = entries.find(item => item.type === "file" && item.name.endsWith(".json"));
    if (!canvas) return;
    const data = JSON.parse(await files.readText(canvas.path, 1024 * 1024, controller.signal));
    if (data.toonflowCanvas !== true || !Array.isArray(data.nodes)) return;
    for (const node of data.nodes) {
      const outputs: unknown[] = Object.values(node?.data?.outputs ?? {});
      for (const value of outputs) {
        const output = value as { dataType?: string; value?: { url?: string; mimeType?: string } };
        if (!["IMAGE", "VIDEO"].includes(output?.dataType ?? "") || typeof output.value?.url !== "string") continue;
        if (controller.signal.aborted) return;
        kind.value = output.dataType === "IMAGE" ? "image" : "video";
        const handle = files.acquireUrl(output.value.url, output.value.mimeType);
        release = handle.release;
        const source = await handle.url;
        if (!controller.signal.aborted) url.value = source;
        return;
      }
    }
  } catch { /* 不可读或无媒体的项目保留原文件夹封面。 */ }
}, { immediate: true });
</script>

<style scoped lang="scss">
.projectThumbnail { display: grid; place-items: center; width: 100%; height: 160px; flex: none; overflow: hidden; border-radius: 12px; background: var(--el-fill-color-light); color: var(--el-text-color-secondary); img, video { width: 100%; height: 100%; object-fit: cover; } }
</style>
