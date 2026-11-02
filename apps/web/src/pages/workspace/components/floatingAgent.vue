<template>
  <teleport to="body">
    <aside v-show="visible" id="agentPanel" class="agentSidebar" :class="{ expanded, materialSplit: !!materialEditorState }" :style="panelStyle" :inert="!!materialEditorState" aria-label="智能助手对话侧栏">
      <nav v-if="expanded && !materialEditorState" class="assistantRail" aria-label="助手导航">
        <button class="railBrand" type="button" aria-label="AFXEN 首页" @click="navigate('create')"><brandLogo compact /></button>
        <el-tooltip content="首页" placement="right"><button aria-label="首页" @click="navigate('create')"><icon-home :size="20" /></button></el-tooltip>
        <el-tooltip content="Agent 助手" placement="right"><button class="active" aria-label="Agent 助手" aria-current="page"><icon-sparkles :size="20" /></button></el-tooltip>
        <el-tooltip content="模板中心" placement="right"><button aria-label="模板中心" @click="navigate('templates')"><icon-template :size="20" /></button></el-tooltip>
        <el-tooltip content="历史对话" placement="right"><button aria-label="历史对话" @click="navigate('history')"><icon-history :size="20" /></button></el-tooltip>
        <el-tooltip content="个人资产" placement="right"><button aria-label="个人资产" @click="navigate('assets')"><icon-photo :size="20" /></button></el-tooltip>
        <el-tooltip content="我的项目" placement="right"><button aria-label="我的项目" @click="navigate('projects')"><icon-folder :size="20" /></button></el-tooltip>
      </nav>
      <div v-if="!expanded" class="resizeHandle" role="separator" aria-label="调整对话侧栏宽度" aria-orientation="vertical" :aria-valuemin="minimumWidth" :aria-valuemax="maximumWidth" :aria-valuenow="width" tabindex="0" @pointerdown="startResize" @pointermove="resize" @pointerup="stopResize" @pointercancel="stopResize" @lostpointercapture="stopResize" @keydown.left.prevent="preferredWidth = width + 16" @keydown.right.prevent="preferredWidth = width - 16" />
      <agent v-model="visible" creationModes :closable="!expanded"><template #menuActions><el-button v-if="expanded" class="enterCanvasButton" text :icon="IconVector" aria-label="进入画布" @click="emit('enterCanvas')">进入画布</el-button></template></agent>
    </aside>
  </teleport>
</template>
<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { IconVector, IconHome, IconSparkles, IconTemplate, IconHistory, IconPhoto, IconFolder } from "@tabler/icons-vue";
import { materialEditorState } from "@/stores/materialEditor";
import brandLogo from "@/components/brandLogo.vue";
import { useRouter } from "vue-router";
import agent from "@/components/agent/index.vue";
const router = useRouter();
function navigate(section: string) { void router.push({ path: "/home", query: { section } }); }
const props = defineProps<{ expanded?: boolean }>();
const visible = defineModel<boolean>({ default: false });
const emit = defineEmits<{ resize: [width: number]; enterCanvas: [] }>();
const viewportWidth = ref(window.innerWidth), viewportHeight = ref(window.innerHeight), preferredWidth = ref(440);
const minimumWidth = computed(() => Math.min(320, viewportWidth.value));
const maximumWidth = computed(() => Math.min(760, viewportWidth.value));
const width = computed(() => Math.max(minimumWidth.value, Math.min(preferredWidth.value, maximumWidth.value)));
const panelStyle = computed(() => materialEditorState.value ? { left: "0px", top: "0px", width: viewportWidth.value <= 700 ? "100vw" : "50vw", height: viewportWidth.value <= 700 ? "50dvh" : "100dvh" } : props.expanded ? { left: "0px", top: "0px", width: "100vw", height: "100dvh" } : { right: "0px", top: "0px", width: `${width.value}px`, height: "100dvh" });
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
.agentSidebar { position: fixed; z-index: 1001; box-sizing: border-box; max-width: 100vw; border-left: 1px solid var(--el-border-color); background: var(--el-bg-color); :deep(.agent) { border-radius: 0; } &.expanded { border: 0; background: transparent; } &.materialSplit { z-index: 1901; background: var(--el-bg-color); border: 0; border-radius: 0; overflow: hidden; } .resizeHandle { position: absolute; z-index: 2; left: -4px; width: 8px; height: 100%; cursor: ew-resize; touch-action: none; &:focus-visible { background: var(--el-color-primary-light-5); } } }
</style>

<style scoped lang="scss">
.agentSidebar.expanded:not(.materialSplit) { background: var(--el-bg-color-page); padding: 78px 32px 24px 104px;
  &::before { content: ""; position: absolute; inset: 0; z-index: -1; pointer-events: none; background: radial-gradient(ellipse at 25% 0%, #248f8c30, transparent 42%), radial-gradient(ellipse at 75% -12%, #387ad445, transparent 48%), radial-gradient(ellipse at 50% -25%, #9865b525, transparent 55%); }
  :deep(.agent) { max-width: 1080px; margin: auto; }
  .assistantRail { position: absolute; inset: 12px auto 12px 12px; width: 60px; padding: 12px 7px; display: flex; flex-direction: column; align-items: center; gap: 14px; border: 1px solid var(--el-border-color-light); border-radius: 24px; background: color-mix(in srgb, var(--el-bg-color) 85%, transparent);
    button { display: grid; place-items: center; width: 42px; height: 42px; padding: 0; border: 0; border-radius: 14px; background: transparent; color: var(--el-text-color-secondary); cursor: pointer; &:hover, &.active { background: var(--el-fill-color-light); color: var(--el-text-color-primary); } &.railBrand { margin-bottom: 32px; } }
  }
  @media(max-width:700px) { padding: 78px 8px 12px 64px; .assistantRail { left: 4px; width: 48px; padding: 10px 3px; border-radius: 18px; gap: 10px; button { width: 36px; height: 36px; &.railBrand { margin-bottom: 14px; } } } }
}
</style>
<style scoped lang="scss">
@media(max-width:700px) { .agentSidebar:not(.expanded):not(.materialSplit) { padding-top: 64px; } }
</style>
