<template>
  <div class="simpleGenerationTools">
    <div v-if="controls !== 'style'" class="outputTabs" role="tablist" aria-label="创作类型" @keydown.right.prevent="moveOutput($event, 1)" @keydown.left.prevent="moveOutput($event, -1)"><button type="button" role="tab" :disabled="disabled" :tabindex="browserConfig.outputKind === 'image' ? 0 : -1" :aria-selected="browserConfig.outputKind === 'image'" @click="selectOutput('image')"><icon-photo :size="16" />图片生成</button><button v-if="!imageOnly" type="button" role="tab" :disabled="disabled" :tabindex="browserConfig.outputKind === 'video' ? 0 : -1" :aria-selected="browserConfig.outputKind === 'video'" @click="selectOutput('video')"><icon-movie :size="16" />视频生成</button></div>
    <el-popover v-if="controls !== 'tabs' && browserConfig.outputKind === 'image'" trigger="click" placement="top" :width="180" :hideAfter="0" :disabled="disabled">
      <template #reference><el-button class="styleSelect" :class="{ selected: !!browserConfig.style }" plain :disabled="disabled || browserConfig.outputKind !== 'image'" :title="browserConfig.outputKind === 'video' ? '当前仅图片生成支持风格预设' : '选择图片风格'" aria-label="选择风格"><icon-palette :size="16" />{{ browserConfig.style || '风格' }}</el-button></template>
      <div class="styleList" role="listbox" aria-label="视觉风格"><button type="button" role="option" :aria-selected="!browserConfig.style" @click="browserConfig.style = ''">不指定风格</button><button v-for="(style, index) in styles" :key="style" type="button" role="option" :aria-selected="browserConfig.style === style" @click="browserConfig.style = browserConfig.style === style ? '' : style"><span class="styleSwatch" :style="{ background: `hsl(${index * 37 % 360} 24% 62%)` }" />{{ style }}</button></div>
    </el-popover>
  </div>
</template>
<script setup lang="ts">
import { IconPalette, IconPhoto, IconMovie } from "@tabler/icons-vue";
import { onMounted } from "vue";
import { generationStyles } from "@/lib/generationStyles";
import { browserConfig } from "@/stores/browserGeneration";
const props = withDefaults(defineProps<{ imageOnly?: boolean; disabled?: boolean; controls?: "all" | "tabs" | "style" }>(), { controls: "all" });
const styles = Object.keys(generationStyles);
onMounted(() => { browserConfig.outputChosen = true; });
function moveOutput(event: KeyboardEvent, direction: number) {
  if (props.disabled) return;
  const buttons = Array.from((event.currentTarget as HTMLElement).querySelectorAll<HTMLButtonElement>('[role="tab"]')).filter(button => !button.disabled);
  const index = buttons.indexOf(event.target as HTMLButtonElement);
  const next = buttons[(Math.max(0, index) + direction + buttons.length) % buttons.length];
  next?.click(); next?.focus();
}
function selectOutput(kind: string | number | boolean) { if (kind === "image" || kind === "video") { browserConfig.outputKind = kind; browserConfig.outputChosen = true; } }
</script>
<style scoped lang="scss">
.simpleGenerationTools { display: contents;
  .outputTabs { display: inline-flex; flex: none; align-items: center; gap: 2px; padding: 2px; border: 1px solid #3b3743; border-radius: 6px; background: #29272f;
    button { display: inline-flex; flex: none; align-items: center; justify-content: center; gap: 6px; height: 26px; min-width: 80px; padding: 0 12px; border: 0; border-radius: 4px; background: transparent; color: #aaa6b5; font: inherit; font-size: 12px; white-space: nowrap; cursor: pointer; transition: background 180ms, color 180ms; &[aria-selected="true"] { color: #8ab4ff; background: #45414f; box-shadow: 0 1px 3px #0003; } &:hover:enabled:not([aria-selected="true"]) { background: #36323c; color: #d0cbdc; } &:focus-visible { outline: 2px solid #a28ae9; outline-offset: -2px; } &:disabled { opacity: .5; cursor: not-allowed; } }
  }
  .styleSelect { flex: none; margin: 0; height: 32px; min-width: 72px; padding: 0 12px; border: 1px solid #45414e; border-radius: 12px; background: #24232c; color: #d0cbdc; font-size: 12px; :deep(> span) { gap: 6px; } &:hover:enabled { border-color: #9071d5; background: #2e2938; } &:focus-visible { outline: 2px solid #a28ae9; outline-offset: 2px; } &.selected { color: #c0a3ff; border-color: #7960ba; } &.is-disabled { color: #8e879e; background: #24232c; border-color: #393541; } }
}
.styleList { max-height: min(420px, 60vh); overflow-y: auto; display: grid; gap: 2px;
  button { display: flex; align-items: center; gap: 10px; border: 0; background: transparent; padding: 9px 7px; text-align: left; cursor: pointer; color: var(--el-text-color-primary); &[aria-selected="true"] { background: var(--el-color-primary-light-9); color: var(--el-color-primary); } .styleSwatch { width: 18px; height: 18px; border-radius: 4px; } }
}
@media (prefers-reduced-motion: reduce) { .simpleGenerationTools button { transition: none !important; } }
</style>
