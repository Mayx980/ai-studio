<template>
  <div class="simpleGenerationTools">
    <span class="outputToggle" @keydown.space.capture.stop.prevent="selectOutput(browserConfig.outputKind === 'image' ? 'video' : 'image')" @keydown.enter.capture.stop.prevent="selectOutput(browserConfig.outputKind === 'image' ? 'video' : 'image')"><el-switch :modelValue="browserConfig.outputKind" activeValue="video" inactiveValue="image" activeText="视频" inactiveText="图片" aria-label="切换图片或视频" @change="selectOutput" /></span>
    <el-popover v-if="browserConfig.outputChosen && browserConfig.outputKind === 'image'" trigger="click" placement="top" :width="180" :hideAfter="0">
      <template #reference><el-button text aria-label="选择风格"><icon-palette :size="16" />风格</el-button></template>
      <div class="styleList" role="listbox" aria-label="视觉风格"><button type="button" role="option" :aria-selected="!browserConfig.style" @click="browserConfig.style = ''">不指定风格</button><button v-for="(style, index) in styles" :key="style" type="button" role="option" :aria-selected="browserConfig.style === style" @click="browserConfig.style = browserConfig.style === style ? '' : style"><span class="styleSwatch" :style="{ background: `hsl(${index * 37 % 360} 24% 62%)` }" />{{ style }}</button></div>
    </el-popover>
  </div>
</template>
<script setup lang="ts">
import { IconPalette } from "@tabler/icons-vue";
import { onMounted } from "vue";
import { generationStyles } from "@/lib/generationStyles";
import { browserConfig } from "@/stores/browserGeneration";
const styles = Object.keys(generationStyles);
onMounted(() => { browserConfig.outputChosen = true; });
function selectOutput(kind: string | number | boolean) { if (kind === "image" || kind === "video") { browserConfig.outputKind = kind; browserConfig.outputChosen = true; } }
</script>
<style scoped lang="scss">
.simpleGenerationTools { display: flex; align-items: center; gap: 2px; flex-wrap: wrap; .el-button { margin: 0; } }
.styleList { max-height: min(420px, 60vh); overflow-y: auto; display: grid; gap: 2px; button { display: flex; align-items: center; gap: 10px; border: 0; background: transparent; padding: 9px 7px; text-align: left; cursor: pointer; color: var(--el-text-color-primary); &[aria-selected="true"] { background: var(--el-color-primary-light-9); color: var(--el-color-primary); } .styleSwatch { width: 18px; height: 18px; border-radius: 4px; } } }
</style>
