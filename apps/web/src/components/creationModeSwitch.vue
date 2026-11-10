<template>
  <div class="creationModeSwitch" role="group" aria-label="创作模式">
    <div v-for="item in modes" :key="item.value" class="modeItem">
      <el-button class="modeButton" :class="{ selected: mode === item.value, simple: item.value === 'simple' }" :aria-pressed="mode === item.value" :title="item.description" @click="mode = item.value">
        <component :is="item.icon" :size="16" aria-hidden="true" />{{ item.label }}
      </el-button>
      <el-tooltip :content="item.description" placement="top" :showAfter="150">
        <button class="modeHelp" type="button" :aria-label="item.description"><icon-info-circle :size="16" /></button>
      </el-tooltip>
    </div>
  </div>
</template>

<script setup lang="ts">
import { IconInfoCircle, IconSparkles, IconVector } from "@tabler/icons-vue";
const mode = defineModel<"simple" | "professional">({ default: "simple" });
const modes = [
  { value: "simple" as const, label: "简单模式", icon: IconSparkles, description: "输入提示词，或者加入参考图，即可生成对应的图片或内容" },
  { value: "professional" as const, label: "专业模式", icon: IconVector, description: "在画布中连接节点、组合素材和调整参数，精细控制创作流程。" },
];
</script>

<style scoped lang="scss">
.creationModeSwitch {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0;
  width: min(340px, 100%);
  padding: 4px;
  border-radius: 48px;
  background: var(--el-fill-color-dark);
  margin: 0 0 14px;
  .modeItem {
    display: flex;
    align-items: center;
    position: relative;
    flex: 1;
    min-width: 0;
    gap: 0;
    .modeButton { width: 100%; height: 36px; border: 0; border-radius: 40px; background: transparent; color: var(--el-text-color-primary); font-size: 13px; font-weight: 600; padding: 0 30px 0 10px; &.selected.simple { background: radial-gradient(ellipse at 25% 65%, #ffe3d4, transparent 58%), radial-gradient(ellipse at 67% 55%, #94eaf8, transparent 63%), #fff; color: #15272c; } &.selected { background: radial-gradient(ellipse at 70% 60%, var(--el-color-primary-light-7), transparent 70%), var(--el-bg-color-overlay); box-shadow: 0 2px 8px #0001; } }
    .modeHelp {
      position: absolute;
      right: 6px;
      display: grid;
      place-items: center;
      width: 24px;
      height: 24px;
      padding: 0;
      border: 0;
      border-radius: 50%;
      color: var(--el-text-color-secondary);
      background: transparent;
      cursor: default;
      &:focus-visible { outline: 2px solid var(--el-color-primary); }
    }
  }
}
</style>
