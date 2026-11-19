<template>
  <el-image-viewer :urlList="urlList" teleported @close="emit('close')"><span ref="anchor" hidden /></el-image-viewer>
</template>
<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";
import { ElImageViewer } from "element-plus";
defineProps<{ urlList: string[] }>();
const emit = defineEmits<{ close: [] }>();
const anchor = ref<HTMLElement>();
let root: HTMLElement | null | undefined, image: HTMLImageElement | null | undefined, frame = 0;
const resize = new ResizeObserver(schedulePosition);
const changes = new MutationObserver(schedulePosition);
function schedulePosition() {
  cancelAnimationFrame(frame);
  frame = requestAnimationFrame(() => {
    const current = root?.querySelector<HTMLImageElement>(".el-image-viewer__img");
    if (current !== image) { if (image) resize.unobserve(image); image = current; if (image) resize.observe(image); }
    const close = root?.querySelector<HTMLElement>(".el-image-viewer__close");
    if (!image || !close) return;
    const rect = image.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    Object.assign(close.style, { position: "fixed", right: "auto", left: `${Math.max(8, Math.min(window.innerWidth - 40, rect.right - 40))}px`, top: `${Math.max(8, Math.min(window.innerHeight - 40, rect.top + 8))}px`, width: "32px", height: "32px", fontSize: "20px", background: "rgba(32,32,32,.8)" });
    close.setAttribute("aria-label", "关闭图片预览");
    close.setAttribute("title", "关闭图片预览");
  });
}
onMounted(() => {
  root = anchor.value?.closest<HTMLElement>(".el-image-viewer__wrapper");
  if (root) { changes.observe(root, { attributes: true, attributeFilter: ["class", "style"] }); resize.observe(root); }
  const canvas = root?.querySelector(".el-image-viewer__canvas");
  if (canvas) changes.observe(canvas, { childList: true, subtree: true, attributes: true, attributeFilter: ["style", "src"] });
  root?.addEventListener("load", schedulePosition, true);
  root?.addEventListener("transitionend", schedulePosition);
  window.addEventListener("resize", schedulePosition);
  schedulePosition();
});
onBeforeUnmount(() => {
  cancelAnimationFrame(frame); resize.disconnect(); changes.disconnect();
  root?.removeEventListener("load", schedulePosition, true);
  root?.removeEventListener("transitionend", schedulePosition);
  window.removeEventListener("resize", schedulePosition);
});
</script>
