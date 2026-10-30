<template>
  <teleport to="body">
    <aside v-show="visible" id="agentPanel" class="agentSidebar" :class="{ expanded }" :style="panelStyle" aria-label="智能助手对话侧栏">
      <div v-if="!expanded" class="resizeHandle" role="separator" aria-label="调整对话侧栏宽度" aria-orientation="vertical" :aria-valuemin="minimumWidth" :aria-valuemax="maximumWidth" :aria-valuenow="width" tabindex="0" @pointerdown="startResize" @pointermove="resize" @pointerup="stopResize" @pointercancel="stopResize" @lostpointercapture="stopResize" @keydown.left.prevent="preferredWidth = width + 16" @keydown.right.prevent="preferredWidth = width - 16" />
      <agent v-model="visible" creationModes :closable="!expanded"><template #menuActions><el-button v-if="expanded" text :icon="IconVector" aria-label="进入画布" @click="emit('enterCanvas')">进入画布</el-button></template></agent>
    </aside>
  </teleport>
</template>
<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { IconVector } from "@tabler/icons-vue";
import agent from "@/components/agent/index.vue";
const props = defineProps<{ expanded?: boolean }>();
const visible = defineModel<boolean>({ default: false });
const emit = defineEmits<{ resize: [width: number]; enterCanvas: [] }>();
const viewportWidth = ref(window.innerWidth), viewportHeight = ref(window.innerHeight), preferredWidth = ref(440);
const minimumWidth = computed(() => Math.min(320, viewportWidth.value));
const maximumWidth = computed(() => Math.min(760, viewportWidth.value));
const width = computed(() => Math.max(minimumWidth.value, Math.min(preferredWidth.value, maximumWidth.value)));
const panelStyle = computed(() => props.expanded ? { left: `${Math.max(16, (viewportWidth.value - 960) / 2)}px`, top: "72px", width: `${Math.min(960, viewportWidth.value - 32)}px`, height: `${Math.max(200, viewportHeight.value - 96)}px` } : { right: "0px", top: "0px", width: `${width.value}px`, height: "100dvh" });
let pointer: { id: number; x: number; width: number; element: HTMLElement } | undefined;
function startResize(event: PointerEvent) { if (event.button !== 0) return; const element = event.currentTarget as HTMLElement; element.setPointerCapture(event.pointerId); pointer = { id: event.pointerId, x: event.clientX, width: width.value, element }; event.preventDefault(); }
function resize(event: PointerEvent) { if (pointer?.id === event.pointerId) preferredWidth.value = pointer.width + pointer.x - event.clientX; }
function stopResize() { const previous = pointer; pointer = undefined; if (previous?.element.hasPointerCapture(previous.id)) previous.element.releasePointerCapture(previous.id); }
function updateViewport() { stopResize(); viewportWidth.value = window.innerWidth; viewportHeight.value = window.innerHeight; }
watch(() => visible.value && !props.expanded ? width.value : 0, value => emit("resize", value), { immediate: true });
window.addEventListener("resize", updateViewport);
onBeforeUnmount(() => { stopResize(); window.removeEventListener("resize", updateViewport); });
</script>
<style scoped lang="scss">
.agentSidebar { position: fixed; z-index: 1001; box-sizing: border-box; max-width: 100vw; border-left: 1px solid var(--el-border-color); background: var(--el-bg-color); :deep(.agent) { border-radius: 0; } &.expanded { border: 0; background: transparent; } .resizeHandle { position: absolute; z-index: 2; left: -4px; width: 8px; height: 100%; cursor: ew-resize; touch-action: none; &:focus-visible { background: var(--el-color-primary-light-5); } } }
</style>
