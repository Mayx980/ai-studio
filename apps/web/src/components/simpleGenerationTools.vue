<template>
  <div class="simpleGenerationTools">
    <el-tag v-if="browserConfig.outputChosen" class="outputTag" closable @close="browserConfig.outputChosen = false"><icon-photo v-if="browserConfig.outputChosen && browserConfig.outputKind === 'image'" :size="14" /><icon-movie v-else :size="14" />{{ browserConfig.outputKind === 'image' ? '图像生成' : '视频生成' }}</el-tag>
    <template v-else><el-button text aria-label="选择图片产物" @click="selectOutput('image')"><icon-photo :size="16" />图片</el-button><el-button text aria-label="选择视频产物" @click="selectOutput('video')"><icon-movie :size="16" />视频</el-button></template>
    <el-popover v-if="browserConfig.outputChosen && browserConfig.outputKind === 'image'" trigger="click" placement="top" :width="180" :hideAfter="0">
      <template #reference><el-button text aria-label="选择风格"><icon-palette :size="16" />{{ browserConfig.style || '风格' }}</el-button></template>
      <div class="styleList" role="listbox" aria-label="视觉风格"><button type="button" role="option" :aria-selected="!browserConfig.style" @click="browserConfig.style = ''">不指定风格</button><button v-for="(style, index) in styles" :key="style" type="button" role="option" :aria-selected="browserConfig.style === style" @click="browserConfig.style = style"><span class="styleSwatch" :style="{ background: `hsl(${index * 37 % 360} 24% 62%)` }" />{{ style }}</button></div>
    </el-popover>
  </div>
</template>
<script setup lang="ts">
import { IconPhoto, IconMovie, IconPalette } from "@tabler/icons-vue";
import { generationStyles } from "@/lib/generationStyles";
import { browserConfig } from "@/stores/browserGeneration";
const styles = Object.keys(generationStyles);
function selectOutput(kind: "image" | "video") { browserConfig.outputKind = kind; browserConfig.outputChosen = true; }
</script>
<style scoped lang="scss">
.simpleGenerationTools { display: flex; align-items: center; gap: 2px; flex-wrap: wrap; .el-button { margin: 0; } }
.outputTag { border: 0; border-radius: 18px; :deep(.el-tag__content) { display: flex; align-items: center; gap: 5px; } }
.styleList { max-height: min(420px, 60vh); overflow-y: auto; display: grid; gap: 2px; button { display: flex; align-items: center; gap: 10px; border: 0; background: transparent; padding: 9px 7px; text-align: left; cursor: pointer; color: var(--el-text-color-primary); &[aria-selected="true"] { background: var(--el-color-primary-light-9); color: var(--el-color-primary); } .styleSwatch { width: 18px; height: 18px; border-radius: 4px; } } }
</style>
