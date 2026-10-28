<template>
  <teleport v-if="active" to="#canvasToolExtras" defer>
      <div class="canvasControls">
        <el-button text :disabled="!canUndo" aria-label="撤销" title="撤销" @click="undo"><icon-arrow-back-up :size="18" /></el-button>
        <el-button text :disabled="!canRedo" aria-label="重做" title="重做" @click="redo"><icon-arrow-forward-up :size="18" /></el-button>

        <!-- trigger 用 contextmenu 是为了让整理按钮只由 arrangeNodes 控制显隐，同时仍保留点击外部自动关闭 -->
        <el-tooltip :showArrow="false" content="整理画布" placement="top" :hideAfter="0" :enterable="false" :triggerKeys="[]" :disabled="undoPopoverVisible">
          <span class="toolTrigger">
            <el-popover trigger="contextmenu" placement="top-start" :width="180" v-model:visible="undoPopoverVisible">
              <template #reference>
                <el-button class="toolButton" text :disabled="!canArrange" aria-label="整理画布" @click="arrangeNodes">
                  <icon-sitemap :size="18" />
                </el-button>
              </template>
              <div class="zoomMenu">
                <el-button class="zoomAction" style="width: 100%" text @click="undoArrange">撤销整理</el-button>
              </div>
            </el-popover>
          </span>
        </el-tooltip>


        <el-tooltip :showArrow="false" :content="showEdges ? '隐藏连线' : '显示连线'" placement="top" :hideAfter="0" :enterable="false" :triggerKeys="[]">
          <el-button
            class="toolButton"
            text
            :type="showEdges ? 'primary' : 'default'"
            :aria-pressed="showEdges"
            aria-label="显示或隐藏连线"
            @click="showEdges = !showEdges">
            <icon-arrow-guide :size="18" />
          </el-button>
        </el-tooltip>
        <el-tooltip :showArrow="false" content="适应视图" placement="top" :hideAfter="0" :enterable="false" :triggerKeys="[]">
          <el-button class="toolButton" text aria-label="适应视图" @click="fitView({ maxZoom: 1 })">
            <icon-focus-centered :size="18" />
          </el-button>
        </el-tooltip>

      </div>
  </teleport>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { useVueFlow, type XYPosition } from "@vue-flow/core";
import { IconFocusCentered, IconArrowBackUp, IconArrowForwardUp } from "@tabler/icons-vue";
import { ElMessage } from "element-plus";
import { arrangeCanvas } from "../arrangeCanvas";

const props = defineProps<{
  active: boolean;
  canUndo: boolean;
  canRedo: boolean;
  undo: () => void;
  redo: () => void;
  canvasId: string;
  directory: string | undefined;
  batchHistory: (action: () => Promise<void>) => Promise<void>;
}>();
const snapEnabled = defineModel<boolean>("snapEnabled", { required: true });
const showEdges = defineModel<boolean>("showEdges", { required: true });
const assetsVisible = defineModel<boolean>("assetsVisible", { default: false });
const flow = useVueFlow();
const { fitView, getNodes, updateNode } = flow;
const layoutSnapshot = ref<{ id: string; position: XYPosition }[]>();
const undoPopoverVisible = ref(false);
const arranging = ref(false);
let arrangeController: AbortController | undefined;
const canArrange = computed(() => {
  const nodes = getNodes.value.filter((node) => !node.parentNode);
  return (
    !!props.canvasId &&
    !!props.directory &&
    !arranging.value &&
    nodes.length > 0 &&
    nodes.every((node) => node.dimensions.width > 0 && node.dimensions.height > 0)
  );
});
defineExpose({ arrangeNodes });

watch(
  () => [props.canvasId, props.directory],
  () => {
    arrangeController?.abort();
    layoutSnapshot.value = undefined;
    undoPopoverVisible.value = false;
  },
  { flush: "sync" }
);
onBeforeUnmount(() => arrangeController?.abort());



async function arrangeNodes() {
  if (!canArrange.value) return;
  const controller = new AbortController();
  arrangeController = controller;
  arranging.value = true;
  try {
    await props.batchHistory(async () => {
      const { snapshot, arrangedNodeIds } = await arrangeCanvas(flow, controller.signal);
      controller.signal.throwIfAborted();
      if (!arrangedNodeIds.length) return;
      layoutSnapshot.value = snapshot;
      undoPopoverVisible.value = true;
    });
  } catch (error) {
    if (!controller.signal.aborted) ElMessage.error(error instanceof Error ? error.message : "整理画布失败");
  } finally {
    arrangeController = undefined;
    arranging.value = false;
  }
}

async function undoArrange() {
  const snapshot = layoutSnapshot.value;
  if (!snapshot) return;
  try {
    await props.batchHistory(async () => {
      const nodeIds = new Set(getNodes.value.map((node) => node.id));
      snapshot.forEach(({ id, position }) => {
        if (nodeIds.has(id)) updateNode(id, { position });
      });
      layoutSnapshot.value = undefined;
      undoPopoverVisible.value = false;
    });
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "撤销整理失败");
  }
}
</script>

<style lang="scss" scoped>
.canvasMiniMap.vue-flow__minimap { bottom: 52px; }

@container canvasWorkspace (max-width: 1040px) {
  .canvasControlsPanel.vue-flow__panel { bottom: 52px; }
  .canvasMiniMap.vue-flow__minimap { bottom: 104px; }
}

.canvasControlsCard { height: 40px; box-sizing: border-box; }

.canvasControls {
  display: flex;
  align-items: center;
  gap: 2px;

  .toolTrigger {
    display: inline-flex;
  }

  .toolButton {
    width: 32px;
    height: 32px;
    flex-shrink: 0;
    margin-left: 0;
    padding: 0;
    font-size: 12px;
    font-variant-numeric: tabular-nums;
  }
}

.zoomMenu {
  display: flex;
  flex-direction: column;

  .zoomInput {
    width: 100%;
  }

  .zoomAction {
    justify-content: flex-start;
    margin-left: 0;
  }
}
</style>

<style scoped lang="scss">
.canvasControls { display: flex; align-items: center; flex-wrap: wrap; gap: 0; :deep(.el-button) { margin: 0; width: 32px; padding: 0; } }
</style>
