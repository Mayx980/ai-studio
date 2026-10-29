<template>
  <div class="simpleGenerationTools">
    <el-button text aria-label="选择图片产物" :type="browserConfig.outputKind === 'image' ? 'primary' : 'default'" :aria-pressed="browserConfig.outputKind === 'image'" @click="selectOutput('image')"><icon-photo :size="16" />图片</el-button>
    <el-button text aria-label="选择视频产物" :type="browserConfig.outputKind === 'video' ? 'primary' : 'default'" :aria-pressed="browserConfig.outputKind === 'video'" @click="selectOutput('video')"><icon-movie :size="16" />视频</el-button>
    <el-popover trigger="click" placement="top" :width="180" :hideAfter="0">
      <template #reference><el-button text aria-label="选择风格"><icon-palette :size="16" />{{ browserConfig.style || '风格' }}</el-button></template>
      <div class="styleList" role="listbox" aria-label="视觉风格"><button type="button" role="option" :aria-selected="!browserConfig.style" @click="browserConfig.style = ''">不指定风格</button><button v-for="(style, index) in styles" :key="style" type="button" role="option" :aria-selected="browserConfig.style === style" @click="browserConfig.style = style"><span class="styleSwatch" :style="{ background: `hsl(${index * 37 % 360} 24% 62%)` }" />{{ style }}</button></div>
    </el-popover>
  </div>
</template>
<script setup lang="ts">
import { IconPhoto, IconMovie, IconPalette } from "@tabler/icons-vue";
import { browserConfig } from "@/stores/browserGeneration";
const styles = ["人像摄影", "电影写真", "中国风", "动漫", "3D渲染", "赛博朋克", "CG动画", "水墨画", "油画", "古典", "水彩画", "卡通", "平面插画", "风景", "港风动漫", "像素风格", "荧光绘画", "彩铅画", "手办", "儿童绘画", "抽象", "锐笔插画", "二次元", "油墨印刷", "版画", "莫奈", "毕加索", "伦勃朗", "马蒂斯", "巴洛克", "复古动漫", "绘本"];
function selectOutput(kind: "image" | "video") { browserConfig.outputKind = kind; browserConfig.outputChosen = true; }
</script>
<style scoped lang="scss">
.simpleGenerationTools { display: flex; align-items: center; gap: 2px; flex-wrap: wrap; .el-button { margin: 0; } }
.styleList { max-height: min(420px, 60vh); overflow-y: auto; display: grid; gap: 2px; button { display: flex; align-items: center; gap: 10px; border: 0; background: transparent; padding: 9px 7px; text-align: left; cursor: pointer; color: var(--el-text-color-primary); &[aria-selected="true"] { background: var(--el-color-primary-light-9); color: var(--el-color-primary); } .styleSwatch { width: 18px; height: 18px; border-radius: 4px; } } }
</style>
