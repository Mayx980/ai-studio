<template>
  <div class="simpleGenerationTools">
    <div class="outputTabs" role="tablist" aria-label="创作类型"><button type="button" role="tab" :aria-selected="browserConfig.outputKind === 'image'" @click="selectOutput('image')"><icon-photo :size="16" />图片生成</button><span v-if="!imageOnly" class="tabDivider" aria-hidden="true">｜</span><button v-if="!imageOnly" type="button" role="tab" :aria-selected="browserConfig.outputKind === 'video'" @click="selectOutput('video')"><icon-movie :size="16" />视频生成</button></div>
    <el-popover v-if="browserConfig.outputChosen && browserConfig.outputKind === 'image'" trigger="click" placement="top" :width="180" :hideAfter="0">
      <template #reference><el-button class="styleSelect" :class="{ selected: !!browserConfig.style }" text aria-label="选择风格"><icon-palette :size="16" />{{ browserConfig.style || '风格' }}</el-button></template>
      <div class="styleList" role="listbox" aria-label="视觉风格"><button type="button" role="option" :aria-selected="!browserConfig.style" @click="browserConfig.style = ''">不指定风格</button><button v-for="(style, index) in styles" :key="style" type="button" role="option" :aria-selected="browserConfig.style === style" @click="browserConfig.style = browserConfig.style === style ? '' : style"><span class="styleSwatch" :style="{ background: `hsl(${index * 37 % 360} 24% 62%)` }" />{{ style }}</button></div>
    </el-popover>
  </div>
</template>
<script setup lang="ts">
import { IconPalette, IconPhoto, IconMovie } from "@tabler/icons-vue";
import { onMounted } from "vue";
import { generationStyles } from "@/lib/generationStyles";
import { browserConfig } from "@/stores/browserGeneration";
defineProps<{ imageOnly?: boolean }>();
const styles = Object.keys(generationStyles);
onMounted(() => { browserConfig.outputChosen = true; });
function selectOutput(kind: string | number | boolean) { if (kind === "image" || kind === "video") { browserConfig.outputKind = kind; browserConfig.outputChosen = true; } }
</script>
<style scoped lang="scss">
.simpleGenerationTools { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; .el-button { margin: 0; height: 30px; border-radius: 12px; } .outputSelect { border: 0; background: transparent; } .el-button:hover, .el-button:focus-visible { background: var(--el-fill-color); border-color: transparent; } .selected { --el-button-text-color: var(--el-color-primary); --el-button-hover-text-color: var(--el-color-primary); --el-button-active-text-color: var(--el-color-primary); color: var(--el-color-primary); } }
.outputTabs { display: flex; align-items: center; gap: 0; border: 1px solid var(--el-border-color); border-radius: 8px; overflow: hidden; .tabDivider { color: var(--el-border-color); } button { display: flex; align-items: center; gap: 5px; padding: 6px 8px; border: 0; background: transparent; color: var(--el-text-color-secondary); font: inherit; font-size: 13px; cursor: pointer; &[aria-selected="true"] { color: var(--el-color-primary); } &:hover { background: var(--el-fill-color); } &:focus-visible { outline: 1px solid var(--el-color-primary); outline-offset: -2px; } } }

.styleList { max-height: min(420px, 60vh); overflow-y: auto; display: grid; gap: 2px; button { display: flex; align-items: center; gap: 10px; border: 0; background: transparent; padding: 9px 7px; text-align: left; cursor: pointer; color: var(--el-text-color-primary); &[aria-selected="true"] { background: var(--el-color-primary-light-9); color: var(--el-color-primary); } .styleSwatch { width: 18px; height: 18px; border-radius: 4px; } } }
</style>
