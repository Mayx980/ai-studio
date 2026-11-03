<template>
  <span class="projectThumbnail">
    <img v-if="url && kind === 'image'" :src="url" alt="项目图片预览" @error="url = ''" />
    <video v-else-if="url && kind === 'video'" :src="url" muted playsinline preload="metadata" @loadedmetadata="($event.target as HTMLVideoElement).currentTime = Math.min(0.1, ($event.target as HTMLVideoElement).duration / 2)" aria-label="项目视频封面" @error="url = ''" />
    <svg v-else class="emptyCover" width="48" height="40" viewBox="0 0 56 44" aria-hidden="true"><circle cx="42" cy="9" r="4" fill="currentColor" /><path d="M4 38L21 12a2 2 0 0 1 3.4 0L37 31l5-8a2 2 0 0 1 3.4 0L54 38z" fill="currentColor" /></svg>
  </span>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import useWorkspaceFiles from "@/lib/workspaceFiles";
import { readCanvasFiles } from "@/pages/workspace/panels/canvas/canvasFiles";
const props = defineProps<{ directory: string }>();
const url = ref("");
const kind = ref("");
watch(() => props.directory, async (directory, _previous, onCleanup) => {
  const controller = new AbortController();
  let release: (() => void) | undefined;
  onCleanup(() => { controller.abort(); release?.(); });
  url.value = "";
  const files = useWorkspaceFiles(directory);
  async function showCover(cover?: { path?: string; mimeType?: string }) {
    if (!cover || typeof cover.path !== "string" || typeof cover.mimeType !== "string" || !/^(image|video)\//.test(cover.mimeType)) return false;
    if (controller.signal.aborted) return true;
    const handle = files.acquireUrl(cover.path, cover.mimeType);
    try {
      const source = await handle.url;
      if (controller.signal.aborted) { handle.release(); return true; }
      release = handle.release; kind.value = cover.mimeType.startsWith("image/") ? "image" : "video"; url.value = source;
      return true;
    } catch { handle.release(); return false; }
  }
  try {
    const cover = await files.readJson<{ path: string; mimeType: string }>(".agent/projectCover.json").catch(() => undefined);
    if (await showCover(cover)) return;
    const results = await files.readJson<{ kind: string; path: string; mimeType?: string }[]>(".agent/browserResults.json").catch(() => []);
    if (Array.isArray(results)) for (const item of results) {
      if (item && ["image", "video"].includes(item.kind) && await showCover({ path: item.path, mimeType: item.mimeType || (item.kind === "image" ? "image/png" : "video/mp4") })) return;
    }
    // ACT: 优先读取已有封面，缺失时才复用画布读取入口查找含嵌套画布的真实媒体。
    for (const canvas of await readCanvasFiles(files, "", { signal: controller.signal, onError: () => {} })) {
      for (const node of canvas.data.nodes) for (const value of Object.values(node.data?.outputs ?? {})) {
        const output = value as { dataType?: string; value?: { url?: string; mimeType?: string } };
        if (["IMAGE", "VIDEO"].includes(output?.dataType ?? "") && await showCover({ path: output.value?.url, mimeType: output.value?.mimeType })) return;
      }
    }
  } catch { /* 不可读或无媒体的项目保留图片占位，不修改原项目。 */ }
}, { immediate: true });
</script>

<style scoped lang="scss">
.projectThumbnail { display: grid; place-items: center; width: 100%; height: 160px; flex: none; overflow: hidden; border-radius: 12px; background: #202020; color: #4b4b4b; .emptyCover { opacity: .85; } img, video { width: 100%; height: 100%; object-fit: cover; object-position: center; } }
</style>
