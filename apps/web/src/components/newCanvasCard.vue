<template>
  <button class="newCanvasCard" type="button" :disabled="disabled"><svg class="canvasTrails" viewBox="0 0 240 160" preserveAspectRatio="none" aria-hidden="true"><path v-for="(path, index) in canvasTrails" :key="index" :d="path" pathLength="1" /></svg><span class="canvasIcon"><span class="canvasIconFace canvasPlus"><icon-plus :size="24" /></span><span class="canvasIconFace canvasMark" aria-hidden="true" /></span><span class="canvasLabel">新建画布</span></button>
</template>
<script setup lang="ts">
import { IconPlus } from "@tabler/icons-vue";
defineProps<{ disabled?: boolean }>();
const canvasTrails = [
  "M120 80 C76 80 66 30 8 24", "M120 80 C76 80 64 76 8 82", "M120 80 C76 80 66 126 8 134",
  "M120 80 C164 80 174 30 232 24", "M120 80 C164 80 176 76 232 88", "M120 80 C164 80 174 126 232 134",
];
</script>
<style scoped lang="scss">
.newCanvasCard { position: relative; min-width: 0; overflow: hidden; border: 1px solid #ffffff0d; border-radius: 16px; padding: 0; color: #f2f2f2; cursor: pointer; text-align: center; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; font-size: 13px; background: radial-gradient(circle, #ffffff16 1px, transparent 1px) 0 0 / 18px 18px, #202020;
    &:hover:enabled { border-color: #ffffff38; }
    &:focus-visible { outline: 2px solid #a28ae9; outline-offset: -3px; }
    &:disabled { cursor: wait; }
    .canvasTrails { position: absolute; top: -14px; left: 0; width: 100%; height: 100%; pointer-events: none; mask-image: linear-gradient(to right, transparent 0%, #0002 12%, #0008 30%, #000 50%, #0008 70%, #0002 88%, transparent 100%);
      path { fill: none; stroke: #ffffff26; stroke-width: 1; vector-effect: non-scaling-stroke; stroke-dasharray: 1; stroke-dashoffset: 1; opacity: 0; transition: stroke-dashoffset 700ms ease 120ms, opacity 220ms ease; }
    }
    .canvasIcon { position: relative; z-index: 1; display: block; width: 34px; height: 34px; perspective: 180px; }
    .canvasIconFace { position: absolute; inset: 0; display: grid; place-items: center; border-radius: 8px; color: #202020; background: #fff; backface-visibility: hidden; transition: transform 480ms ease;
    }
    .canvasPlus { transform: rotateY(0deg); }
    .canvasMark { transform: rotateY(-180deg); background: #202020;
      &::before { content: ""; position: absolute; inset: 0; border-radius: inherit; background: #fff; mask-image: linear-gradient(#000 0 0), url("/afxenMark.svg"); mask-size: 100% 100%, 25px 25px; mask-position: center; mask-repeat: no-repeat; mask-composite: exclude; }
    }
    .canvasLabel { position: relative; z-index: 1; }
    &:hover:enabled, &:focus-visible { .canvasPlus { transform: rotateY(180deg); } .canvasMark { transform: rotateY(0deg); } .canvasTrails path { stroke-dashoffset: 0; opacity: 1; } }
    @media(prefers-reduced-motion:reduce) { .canvasIconFace, .canvasTrails path { transition: none; } }

  }
</style>
