<template>
  <el-popover v-model:visible="settingsVisible" trigger="click" placement="top-start" width="min(340px, calc(100vw - 24px))" :disabled="disabled" :showArrow="false" :popperStyle="{ padding: '14px' }">
    <template #reference>
      <el-button class="settingsButton" text size="small" :disabled="disabled" :aria-expanded="settingsVisible" aria-label="图片生成设置">
        <span class="ratioShape" :style="ratioStyle(ratio)" aria-hidden="true" />
        <span>{{ ratio }} · {{ sizeLabel(size) }} · {{ count }}张</span>
        <component :is="settingsVisible ? IconChevronDown : IconChevronUp" :size="14" aria-hidden="true" />
      </el-button>
    </template>
    <div class="generationSettings nodrag nopan nowheel" @pointerdown.stop @mousedown.stop @dblclick.stop @keydown.stop @wheel.stop>
      <div class="sectionLabel">图片尺寸</div>
      <el-radio-group v-model="size" class="sizeOptions" :disabled="disabled" aria-label="图片分辨率">
        <el-radio-button v-for="item in visibleSizes" :key="item" :value="item">{{ sizeLabel(item) }}</el-radio-button>
      </el-radio-group>
      <div class="sectionLabel">比例</div>
      <div class="ratioOptions" role="group" aria-label="图片比例">
        <el-button
          v-for="item in visibleRatios"
          :key="item"
          class="ratioButton"
          :disabled="disabled"
          :aria-label="`比例 ${item}`"
          :aria-pressed="ratio === item"
          @click="ratio = item">
          <span class="ratioContent">
            <span class="ratioShape" :style="ratioStyle(item)" aria-hidden="true" />
            <span>{{ item }}</span>
          </span>
        </el-button>
      </div>
      <div class="sectionLabel">生成数量</div><el-radio-group v-model="count" :disabled="disabled" aria-label="图片生成数量"><el-radio-button v-for="item in 6" :key="item" :value="item">{{ item }}</el-radio-button></el-radio-group>
    </div>
  </el-popover>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { imageDimensions, imageClaritySizes } from "@toonflow/node-shared/generationDefaults";
import { ElButton, ElPopover, ElRadioGroup, ElRadioButton } from "element-plus";
import { IconChevronDown, IconChevronUp } from "@tabler/icons-vue";

const props = defineProps<{ sizes: string[]; ratios: string[]; disabled?: boolean }>();
const settingsVisible = ref(false);
const count = defineModel<number>("count", { default: 1 });
const size = defineModel<string>("size", { required: true });
const ratio = defineModel<string>("ratio", { required: true });

const visibleSizes = computed(() => {
  const sizes = Object.values(imageClaritySizes).flatMap(value => value[ratio.value] && props.sizes.includes(value[ratio.value]!) ? [value[ratio.value]!] : []);
  return sizes.length ? sizes : imageDimensions[ratio.value] ?? props.sizes;
});
function sizeLabel(value: string) { return Object.entries(imageClaritySizes).find(([, sizes]) => sizes[ratio.value] === value)?.[0].toLowerCase() ?? value; }
const visibleRatios = computed(() => Object.keys(imageDimensions).filter(value => props.ratios.includes(value)));
watch(ratio, (_, previous) => { const clarity = Object.values(imageClaritySizes).find(value => value[previous] === size.value); const mapped = clarity?.[ratio.value]; if (mapped && visibleSizes.value.includes(mapped)) size.value = mapped; else if (!visibleSizes.value.includes(size.value)) size.value = visibleSizes.value[0]!; });
function ratioStyle(value: string) {
  const [width = 1, height = 1] = value.split(":").map(Number);
  return { width: `${16 * Math.min(width / height, 1)}px`, height: `${16 * Math.min(height / width, 1)}px` };
}
</script>

<style scoped lang="scss">
.ratioShape {
  display: inline-block;
  flex-shrink: 0;
  border: 1px solid currentColor;
  border-radius: 2px;
  box-sizing: border-box;
}

.settingsButton {
  flex-shrink: 0;
  :deep(> span) { gap: 6px; }
}

.generationSettings {
  text-align: left;
  .sectionLabel {
    margin-bottom: 8px;
    color: var(--el-text-color-secondary);
    font-size: 12px;
    font-weight: 500;
  }

  .sizeOptions {
    display: flex;
    gap: 8px;
    margin-bottom: 14px;
    .el-radio-button {
      flex: 1;
      --el-radio-button-checked-bg-color: var(--el-fill-color);
      --el-radio-button-checked-text-color: var(--el-text-color-primary);
      --el-radio-button-checked-border-color: var(--el-text-color-regular);

      :deep(.el-radio-button__inner) {
        width: 100%;
        padding: 8px 12px;
        border: 1px solid var(--el-border-color);
        border-radius: var(--el-border-radius-base);
        box-shadow: none;

        &:hover { color: var(--el-text-color-primary); }
      }

      &.is-active :deep(.el-radio-button__inner) {
        border-color: var(--el-text-color-regular);
      }
    }
  }

  .ratioOptions {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 8px;

    .ratioButton {
      height: 60px;
      margin: 0;
      padding: 8px 4px;
      color: var(--el-text-color-secondary);
      --el-button-bg-color: var(--el-fill-color-light);
      --el-button-hover-bg-color: var(--el-fill-color);
      --el-button-hover-text-color: var(--el-text-color-primary);
      --el-button-hover-border-color: var(--el-border-color-darker);

      &[aria-pressed="true"] {
        color: var(--el-text-color-primary);
        border-color: var(--el-text-color-regular);
        background: var(--el-fill-color);
      }

      .ratioContent {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 8px;
        font-size: 12px;
      }
    }
  }
}
</style>
