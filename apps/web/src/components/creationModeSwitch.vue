<template>
  <div class="creationModeSwitch" role="group" aria-label="创作模式">
    <div v-for="item in modes" :key="item.value" class="modeItem">
      <el-button :type="mode === item.value ? 'primary' : undefined" :plain="mode === item.value" :aria-pressed="mode === item.value" @click="mode = item.value">
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
  { value: "simple" as const, label: "简单模式", icon: IconSparkles, description: "输入提示词，也可以添加角色或首尾帧参考，快速生成图片、视频等内容。" },
  { value: "professional" as const, label: "专业模式", icon: IconVector, description: "在画布中连接节点、组合素材和调整参数，精细控制创作流程。" },
];
</script>

<style scoped lang="scss">
.creationModeSwitch {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 18px;
  margin: 0 0 14px;
  .modeItem {
    display: flex;
    align-items: center;
    gap: 5px;
    .el-button { gap: 6px; border-radius: 20px; }
    .modeHelp {
      display: grid;
      place-items: center;
      width: 28px;
      height: 28px;
      padding: 0;
      border: 0;
      border-radius: 50%;
      color: var(--el-text-color-secondary);
      background: transparent;
      cursor: help;
      &:focus-visible { outline: 2px solid var(--el-color-primary); }
    }
  }
}
</style>
