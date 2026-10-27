<template>
  <div class="canvasLayers">
    <el-input v-model="query" placeholder="搜索节点" aria-label="搜索层级节点" clearable />
    <el-scrollbar maxHeight="min(480px, 60vh)">
      <el-collapse v-model="expanded">
        <el-collapse-item v-for="group in groups" :key="group.id" :name="group.id" :title="`${group.label}（${group.nodes.length}）`">
          <button v-for="node in group.nodes" :key="node.id" class="layerNode" type="button" :aria-pressed="node.selected" @click="focusNode(node.id)">{{ node.data.label || group.label }}</button>
        </el-collapse-item>
      </el-collapse>
    </el-scrollbar>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { useVueFlow } from "@vue-flow/core";
const flow = useVueFlow();
const query = ref("");
const expanded = ref(["text", "script", "image", "video"]);
const groups = computed(() => [
  { id: "text", label: "文字", match: (type: string, kind?: string) => type === "remote-textNode" && kind !== "script" },
  { id: "script", label: "脚本", match: (type: string, kind?: string) => type === "remote-textNode" && kind === "script" },
  { id: "image", label: "图片", match: (type: string) => /^remote-image(?:Generation)?Node$/.test(type) },
  { id: "video", label: "视频", match: (type: string) => /^remote-video(?:Generation)?Node$/.test(type) },
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
  .layerNode { display: block; width: 100%; padding: 8px 10px; border: 0; border-radius: 6px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-align: left; font: inherit; color: var(--el-text-color-primary); background: transparent; cursor: pointer; &:hover, &[aria-pressed="true"] { color: var(--el-color-primary); background: var(--el-color-primary-light-9); } }
}
</style>
