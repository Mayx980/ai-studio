<template>
  <div class="canvasLayers">
    <el-input v-model="query" placeholder="搜索节点" aria-label="搜索层级节点" clearable />
    <el-scrollbar maxHeight="min(480px, 60vh)">
      <el-collapse v-model="expanded">
        <el-collapse-item v-for="group in groups" :key="group.id" :name="group.id" :title="`${group.label}（${group.nodes.length}）`">
          <div v-for="node in group.nodes" :key="node.id" class="layerItem">
            <button class="layerNode" type="button" :aria-pressed="node.selected" @click="focusNode(node.id)">
              <img v-if="previews[node.id]?.kind === 'IMAGE'" :src="previews[node.id]?.url" alt="节点封面" />
              <video v-else-if="previews[node.id]?.kind === 'VIDEO'" :src="previews[node.id]?.url" muted playsinline preload="metadata" @loadedmetadata="videoCover" />
              <span><strong>{{ node.data.label || group.label }}</strong><small v-if="node.data.outputs?.text?.value">{{ String(node.data.outputs.text.value).slice(0, 100) }}</small><small v-else>{{ group.label }}</small></span>
            </button>
            <audio v-if="previews[node.id]?.kind === 'AUDIO'" :src="previews[node.id]?.url" controls preload="none" aria-label="节点音频预览" />
          </div>
        </el-collapse-item>
      </el-collapse>
    </el-scrollbar>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useVueFlow } from "@vue-flow/core";
import useWorkspaceFiles from "@/lib/workspaceFiles";
import { isNodeOutput } from "@toonflow/nodes-scaffold/values";
const props = defineProps<{ directory?: string }>();
const flow = useVueFlow();
const query = ref("");
const expanded = ref(["text", "script", "image", "video", "audio"]);
const previews = ref<Record<string, { kind: string; url: string }>>({});
const media = computed(() => flow.getNodes.value.flatMap(node => Object.values(node.data.outputs ?? {}).flatMap(output => isNodeOutput(output) && ["IMAGE", "VIDEO", "AUDIO"].includes(output.dataType) && output.value && typeof output.value === "object" && "url" in output.value ? [{ id: node.id, kind: output.dataType, path: output.value.url, mimeType: output.value.mimeType }] : []).slice(0, 1)));
watch([() => props.directory, media], async ([directory, items], _previous, onCleanup) => {
  let cancelled = false;
  const releases: (() => void)[] = [];
  onCleanup(() => { cancelled = true; releases.forEach(release => release()); });
  previews.value = {};
  if (!directory) return;
  const files = useWorkspaceFiles(directory);
  await Promise.all(items.map(async item => {
    const preview = files.acquireUrl(item.path, item.mimeType);
    releases.push(preview.release);
    try { const url = await preview.url; if (!cancelled) previews.value[item.id] = { kind: item.kind, url }; }
    catch { /* 失效素材仍可通过节点名称定位，原节点保留读取错误。 */ }
  }));
}, { immediate: true });
function videoCover(event: Event) { const video = event.target as HTMLVideoElement; if (video.duration > 0) video.currentTime = Math.min(0.1, video.duration / 2); }
const groups = computed(() => [
  { id: "text", label: "文字", match: (type: string, kind?: string) => type === "remote-textNode" && kind !== "script" },
  { id: "script", label: "脚本", match: (type: string, kind?: string) => type === "remote-textNode" && kind === "script" },
  { id: "image", label: "图片", match: (type: string) => /^remote-image(?:Generation)?Node$/.test(type) },
  { id: "video", label: "视频", match: (type: string) => /^remote-video(?:Generation)?Node$/.test(type) },
  { id: "audio", label: "音频", match: (type: string) => /^remote-audio(?:Generation)?Node$/.test(type) },
].map(group => ({ ...group, nodes: flow.getNodes.value.filter(node => group.match(node.type ?? "", node.data.contentKind) && String(node.data.label ?? "").toLocaleLowerCase().includes(query.value.trim().toLocaleLowerCase())) })));
function focusNode(id: string) {
  const node = flow.findNode(id);
  if (!node) return;
  flow.removeSelectedElements();
  flow.addSelectedNodes([node]);
  void flow.fitView({ nodes: [id], padding: 0.5, maxZoom: 1.2 });
}
</script>

<style scoped lang="scss">
.canvasLayers {
  .el-input { margin-bottom: 12px; }
  .layerItem { audio { width: 100%; height: 32px; } .layerNode { display: flex; align-items: center; gap: 8px; width: 100%; padding: 8px 10px; border: 0; border-radius: 6px; text-align: left; font: inherit; color: var(--el-text-color-primary); background: transparent; cursor: pointer; img, video { width: 64px; height: 48px; object-fit: cover; border-radius: 6px; } span { min-width: 0; flex: 1; strong, small { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } small { margin-top: 4px; color: var(--el-text-color-secondary); } } &:hover, &[aria-pressed="true"] { color: var(--el-color-primary); background: var(--el-color-primary-light-9); } } }
}
</style>
