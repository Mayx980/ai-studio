<template>
  <div class="simpleGenerationTools">
    <el-dropdown trigger="click" placement="top-start" @command="selectOutput">
      <el-button class="outputSelect" text :class="{ selected: browserConfig.outputChosen }" aria-label="切换创作类型"><icon-photo v-if="browserConfig.outputKind === 'image'" :size="16" /><icon-movie v-else :size="16" />{{ browserConfig.outputKind === 'image' ? '图片生成' : '视频生成' }}<icon-chevron-down :size="13" /></el-button>
      <template #dropdown><el-dropdown-menu class="outputMenu"><li class="menuLabel" role="presentation">创作类型</li><el-dropdown-item command="image" :class="{ selected: browserConfig.outputKind === 'image' }"><icon-photo :size="16" />图片生成<icon-check v-if="browserConfig.outputKind === 'image'" :size="16" /></el-dropdown-item><el-dropdown-item command="video" :class="{ selected: browserConfig.outputKind === 'video' }"><icon-movie :size="16" />视频生成<icon-check v-if="browserConfig.outputKind === 'video'" :size="16" /></el-dropdown-item></el-dropdown-menu></template>
    </el-dropdown>
    <el-popover v-if="browserConfig.outputChosen && browserConfig.outputKind === 'image'" trigger="click" placement="top" :width="180" :hideAfter="0">
      <template #reference><el-button class="styleSelect" :class="{ selected: !!browserConfig.style }" text aria-label="选择风格"><icon-palette :size="16" />{{ browserConfig.style || '风格' }}</el-button></template>
      <div class="styleList" role="listbox" aria-label="视觉风格"><button type="button" role="option" :aria-selected="!browserConfig.style" @click="browserConfig.style = ''">不指定风格</button><button v-for="(style, index) in styles" :key="style" type="button" role="option" :aria-selected="browserConfig.style === style" @click="browserConfig.style = browserConfig.style === style ? '' : style"><span class="styleSwatch" :style="{ background: `hsl(${index * 37 % 360} 24% 62%)` }" />{{ style }}</button></div>
    </el-popover>
  </div>
</template>
<script setup lang="ts">
import { IconPalette, IconPhoto, IconMovie, IconChevronDown, IconCheck } from "@tabler/icons-vue";
import { onMounted } from "vue";
import { generationStyles } from "@/lib/generationStyles";
import { browserConfig } from "@/stores/browserGeneration";
const styles = Object.keys(generationStyles);
onMounted(() => { browserConfig.outputChosen = true; });
function selectOutput(kind: string | number | boolean) { if (kind === "image" || kind === "video") { browserConfig.outputKind = kind; browserConfig.outputChosen = true; } }
</script>
<style scoped lang="scss">
.simpleGenerationTools { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; .el-button { margin: 0; height: 30px; border-radius: 12px; } .outputSelect { border: 0; background: transparent; } .el-button:hover, .el-button:focus-visible { background: var(--el-fill-color); border-color: transparent; } .selected { --el-button-text-color: var(--el-color-primary); --el-button-hover-text-color: var(--el-color-primary); --el-button-active-text-color: var(--el-color-primary); color: var(--el-color-primary); } }
.outputMenu { min-width: 180px; .menuLabel { padding: 6px 12px; font-size: 12px; color: var(--el-text-color-secondary); } :deep(.el-dropdown-menu__item) { gap: 9px; margin: 3px 6px; border-radius: 8px; svg:last-child:not(:first-child) { margin-left: auto; } &.selected { background: var(--el-fill-color-light); color: var(--el-text-color-primary); } } }
.styleList { max-height: min(420px, 60vh); overflow-y: auto; display: grid; gap: 2px; button { display: flex; align-items: center; gap: 10px; border: 0; background: transparent; padding: 9px 7px; text-align: left; cursor: pointer; color: var(--el-text-color-primary); &[aria-selected="true"] { background: var(--el-color-primary-light-9); color: var(--el-color-primary); } .styleSwatch { width: 18px; height: 18px; border-radius: 4px; } } }
</style>
