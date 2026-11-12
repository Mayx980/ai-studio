<template>
  <div class="simpleGenerationTools">
    <div v-if="controls !== 'style'" class="outputTabs" role="tablist" aria-label="创作类型" @keydown.right.prevent="moveOutput($event, 1)" @keydown.left.prevent="moveOutput($event, -1)"><button type="button" role="tab" :disabled="disabled || !!lockedKind && lockedKind !== 'image'" :tabindex="browserConfig.outputKind === 'image' ? 0 : -1" :aria-selected="browserConfig.outputKind === 'image'" @click="selectOutput('image')"><icon-photo :size="16" />图片生成</button><button v-if="!imageOnly" type="button" role="tab" :disabled="disabled || !!lockedKind && lockedKind !== 'video'" :tabindex="browserConfig.outputKind === 'video' ? 0 : -1" :aria-selected="browserConfig.outputKind === 'video'" @click="selectOutput('video')"><icon-movie :size="16" />视频生成</button></div>
    <el-popover v-if="controls !== 'tabs' && browserConfig.outputKind === 'image'" v-model:visible="styleVisible" trigger="click" placement="top" :width="180" :hideAfter="0" :disabled="disabled" :popperStyle="{ background: '#262626', padding: '12px 0' }">
      <template #reference><el-button class="styleSelect" :aria-expanded="styleVisible" :class="{ selected: !!browserConfig.style }" plain :disabled="disabled" title="选择图片风格" aria-label="选择风格"><icon-palette :size="16" />{{ browserConfig.style || '风格' }}</el-button></template>
      <div class="styleList" role="listbox" aria-label="视觉风格"><button type="button" role="option" :aria-selected="!browserConfig.style" @click="browserConfig.style = ''">不指定风格</button><button v-for="(style, index) in styles" :key="style" type="button" role="option" :aria-selected="browserConfig.style === style" @click="browserConfig.style = browserConfig.style === style ? '' : style"><span class="stylePreview" aria-hidden="true" :style="{ backgroundPosition: `${index % 4 / 3 * 100}% ${Math.floor(index / 4) / 7 * 100}%` }" />{{ style }}</button></div>
    </el-popover>
  </div>
</template>
<script setup lang="ts">
import { IconPalette, IconPhoto, IconMovie } from "@tabler/icons-vue";
import { inject, onMounted, ref } from "vue";
import { generationStyles } from "@/lib/generationStyles";
import { browserConfig as defaultBrowserConfig } from "@/stores/browserGeneration";
const browserConfig = inject("generationConfig", defaultBrowserConfig);
const props = withDefaults(defineProps<{ imageOnly?: boolean; lockedKind?: "image" | "video"; disabled?: boolean; controls?: "all" | "tabs" | "style" }>(), { controls: "all" });
const emit = defineEmits<{ select: [kind: "image" | "video"] }>();
const styleVisible = ref(false);
const styles = Object.keys(generationStyles);
onMounted(() => { browserConfig.outputChosen = true; });
function moveOutput(event: KeyboardEvent, direction: number) {
  if (props.disabled) return;
  const buttons = Array.from((event.currentTarget as HTMLElement).querySelectorAll<HTMLButtonElement>('[role="tab"]')).filter(button => !button.disabled);
  const index = buttons.indexOf(event.target as HTMLButtonElement);
  const next = buttons[(Math.max(0, index) + direction + buttons.length) % buttons.length];
  next?.click(); next?.focus();
}
function selectOutput(kind: string | number | boolean) {
  if (props.disabled || kind !== "image" && kind !== "video" || props.lockedKind && props.lockedKind !== kind) return;
  browserConfig.outputKind = kind; browserConfig.outputChosen = true; emit("select", kind);
}
</script>
<style scoped lang="scss">
.simpleGenerationTools { display: contents;
  .outputTabs { display: inline-flex; flex: none; align-items: center; gap: 2px; padding: 2px; border: 1px solid transparent; border-radius: 12px; background: #29272f;
    button { display: inline-flex; flex: none; align-items: center; justify-content: center; gap: 6px; height: 26px; min-width: 80px; padding: 0 12px; border: 0; border-radius: 9px; background: transparent; color: #f2f2f2; font: 400 13px/1 Arial, sans-serif; white-space: nowrap; cursor: pointer; transition: background 180ms, color 180ms; &[aria-selected="true"] { color: #00b7ff; background: #45414f; box-shadow: 0 1px 3px #0003; } &:hover:enabled:not([aria-selected="true"]) { background: #36323c; color: #ffffff; } &:focus-visible { outline: 2px solid #a28ae9; outline-offset: -2px; } &:disabled { opacity: .5; cursor: not-allowed; } }
  }
  .styleSelect { flex: none; margin: 0; height: 32px; min-width: 72px; padding: 0 12px; border: 1px solid transparent; border-radius: 12px; background: transparent; color: #f2f2f2; font: 400 13px/1 Arial, sans-serif; :deep(> span) { gap: 6px; } &:hover:enabled, &[aria-expanded="true"] { border-color: transparent; background: #303030; } &:focus-visible { outline: 2px solid #a28ae9; outline-offset: 2px; } &.selected { color: #00b7ff; border-color: transparent; } &.is-disabled { color: #8e879e; background: transparent; border-color: transparent; } }
}
.styleList { max-height: min(420px, 60vh); overflow-y: auto; display: grid; gap: 0; padding-left: 12px; background: #262626;
  button { display: flex; align-items: center; gap: 10px; margin-right: 8px; border: 0; border-radius: 10px; background: transparent; padding: 9px 7px; text-align: left; cursor: pointer; color: var(--el-text-color-primary); &:hover { background: #ffffff0a; } &[aria-selected="true"] { background: #303030; color: #f2f2f2; } .stylePreview { flex: none; width: 32px; height: 32px; border-radius: 4px; background-image: url("/generationStyleAtlas.webp"); background-size: 400% 800%; background-repeat: no-repeat; } }
}
@media (prefers-reduced-motion: reduce) { .simpleGenerationTools button { transition: none !important; } }
</style>
