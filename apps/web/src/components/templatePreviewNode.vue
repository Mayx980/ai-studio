<template>
  <article ref="nodeElement" class="templatePreviewNode" :class="{ selected }">
    <header><icon-photo v-if="data.media.some(item => item.mimeType.startsWith('image/'))" :size="15" /><icon-movie v-else-if="data.media.some(item => item.mimeType.startsWith('video/'))" :size="15" /><icon-file-text v-else :size="15" />{{ data.label }}</header>
    <div class="nodeCard"><div v-if="data.media.length" class="nodeMedia"><template v-for="media in data.media" :key="media.url"><img v-if="media.mimeType.startsWith('image/')" :src="media.url" :alt="data.label" draggable="false" tabindex="0" role="button" @click="previewImage = media.url" @keydown.enter.prevent="previewImage = media.url" @load="positionInput" /><video v-else-if="media.mimeType.startsWith('video/')" :src="media.url" :controls="selected" muted playsinline preload="metadata" class="nodrag nopan" @loadedmetadata="positionInput" /><audio v-else :src="media.url" controls class="nodrag nopan" /></template></div><p v-else-if="data.text">{{ data.text.slice(0, 300) }}</p><handle id="in" type="target" :position="Position.Left" :connectable="false" /><handle id="out" type="source" :position="Position.Right" :connectable="false" /></div>
    <teleport to="body"><section v-if="selected && !previewImage" class="previewNodeInput" :style="inputPosition" data-safe-popup aria-label="节点只读输入框" @keydown.esc.stop.prevent="emit('closeInput')"><header><strong>{{ data.label }}</strong><span>只读</span><el-button text circle aria-label="关闭节点输入框" @click="emit('closeInput')"><icon-x :size="16" /></el-button></header><div v-if="data.references.length" class="referenceInputs"><button v-for="reference in data.references" :key="reference.id" type="button" :aria-label="`查看引用 ${reference.label}`" @click="emit('selectReference', reference.id)"><img v-if="reference.media?.mimeType.startsWith('image/')" :src="reference.media.url" alt="" /><video v-else-if="reference.media?.mimeType.startsWith('video/')" :src="reference.media.url" muted playsinline preload="metadata" /><icon-file-text v-else :size="24" /><span>{{ reference.label }}</span></button></div><el-input :modelValue="inputText" type="textarea" :rows="8" readonly aria-label="节点输入内容" /><footer><span v-for="parameter in data.parameters" :key="parameter.label">{{ parameter.label }}：{{ parameter.value }}</span></footer></section></teleport>
    <imageViewer v-if="previewImage" :urlList="[previewImage]" @close="previewImage = ''" />
  </article>
</template>
<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { Handle, Position, useVueFlow } from "@vue-flow/core";
import { IconPhoto, IconMovie, IconFileText, IconX } from "@tabler/icons-vue";
import imageViewer from "@toonflow/node-shared/imageViewer";
const props = defineProps<{ id: string; data: { label: string; text: string; media: { url: string; mimeType: string }[]; parameters: { label: string; value: string }[]; references: { id: string; label: string; text: string; media?: { url: string; mimeType: string } }[] }; selected?: boolean }>();
const emit = defineEmits<{ closeInput: []; selectReference: [id: string] }>();
const nodeElement = ref<HTMLElement>(), previewImage = ref("");
const inputPosition = ref({ left: "0px", top: "0px" });
const { viewport, fitView } = useVueFlow();
const inputText = computed(() => [props.data.text, ...props.data.references.filter(item => item.text).map(item => `${item.label}：\n${item.text}`)].filter(Boolean).join("\n\n"));
function positionInput() { const rect = nodeElement.value?.getBoundingClientRect(); if (rect) inputPosition.value = { left: `${Math.max(12, Math.min(rect.left + rect.width / 2 - 300, window.innerWidth - 612))}px`, top: `${rect.bottom + 16}px` }; }
watch(viewport, () => { if (props.selected) positionInput(); }, { deep: true, flush: "post" });
watch(() => props.selected, (selected, _previous, onCleanup) => {
  if (!selected) return;
  const frame = requestAnimationFrame(positionInput);
  const observer = new ResizeObserver(positionInput); if (nodeElement.value) observer.observe(nodeElement.value);
  const canvas = nodeElement.value?.closest(".previewBody");
  const canvasObserver = new ResizeObserver(() => { if (document.body.classList.contains("popupSpaceReserved")) void fitView({ nodes: [props.id], maxZoom: .8, padding: .2 }); positionInput(); });
  if (canvas) canvasObserver.observe(canvas);
  window.addEventListener("resize", positionInput); window.addEventListener("scroll", positionInput, true);
  onCleanup(() => { cancelAnimationFrame(frame); observer.disconnect(); canvasObserver.disconnect(); window.removeEventListener("resize", positionInput); window.removeEventListener("scroll", positionInput, true); });
}, { immediate: true, flush: "post" });
</script>
<style scoped lang="scss">
.templatePreviewNode { color: #e5eaf3; > header { display: flex; align-items: center; gap: 6px; padding: 0 4px 10px; font-size: 13px; } .nodeCard { position: relative; overflow: visible; padding: 7px; border: 1px solid #494d55; border-radius: 12px; background: #262626; &.selected { border-color: var(--el-color-primary); } p { padding: 8px; margin: 0; white-space: pre-wrap; line-height: 1.7; font-size: 13px; } } &.selected .nodeCard { border-color: var(--el-color-primary); } .nodeMedia { display: grid; gap: 6px; img, video { display: block; width: 100%; height: auto; max-height: 420px; object-fit: contain; background: #141414; border-radius: 6px; } img { cursor: zoom-in; } audio { width: 100%; } } }
.previewNodeInput { position: fixed; z-index: 3200; width: 600px; max-width: calc(100vw - 24px); padding: 14px 16px 12px; border: 1px solid #494d55; border-radius: 12px; background: #262626; color: #e5eaf3; box-shadow: 0 8px 28px #0004; header { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; strong { font-size: 13px; } > span { margin-left: auto; color: #a3a6ad; font-size: 12px; } } .referenceInputs { display: flex; gap: 8px; overflow-x: auto; margin-bottom: 12px; button { flex: none; display: grid; place-items: center; width: 72px; padding: 0; border: 0; border-radius: 8px; background: #36383d; color: inherit; cursor: pointer; img, video { width: 72px; height: 56px; object-fit: cover; border-radius: 8px 8px 0 0; } span { display: block; max-width: 72px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; padding: 4px; font-size: 11px; } } } :deep(.el-textarea__inner) { resize: none; border: 0; box-shadow: none; background: transparent; color: inherit; line-height: 1.7; } footer { display: flex; flex-wrap: wrap; gap: 10px; padding-top: 12px; font-size: 12px; color: #a3a6ad; } }
</style>
