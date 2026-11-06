<template>
  <el-tour v-model="open" v-model:current="step" :mask="false" :targetAreaClickable="true" :scrollIntoViewOptions="false" :contentStyle="{ width: '300px', maxWidth: 'calc(100vw - 24px)', maxHeight: 'calc(100dvh - 24px)', overflowY: 'auto', background: '#34343c', color: '#f1f1f5', border: '1px solid #8775ef', borderRadius: '12px', boxShadow: '0 0 0 1px #4e97f080, 0 8px 28px #0005'  }" @close="emit('complete')" @finish="emit('complete')">
    <template v-if="kind !== 'canvas'">
      <el-tour-step title="1. 查看示例提示词" :target="target(kind === 'image' ? '.promptCard' : '.promptInputWrap')" :nextButtonProps="{ children: '下一步' }"><p v-if="kind === 'image'">已添加图1，并填写“去掉人物，其他不变”。可以直接体验去除人物，也可以修改提示词。</p><p v-else>上传参考图片，然后在输入框中补充提示词内容</p></el-tour-step>
      <el-tour-step :title="kind === 'image' ? '2. 查看参考图片' : '2. 使用 @ 引用参考图'" :target="target(kind === 'video' ? '.mentionButton' : '.referenceCovers')" :prevButtonProps="{ children: '上一步' }" :nextButtonProps="{ children: '下一步' }"><p v-if="kind === 'image'">输入框上方的图1是本次编辑的参考图片。点击缩略图可以放大查看，移除后可通过上传或引用入口替换。</p><p v-else>提示词已插入真实的图1、图2引用标签。点击输入框的 @ 按钮可再次选择参考图；女人引用图2，房顶引用图1，点击标签可以查看对应图片。</p></el-tour-step>
      <el-tour-step title="3. 选择模型与参数" :target="target('.promptFooter, .promptCard')" :prevButtonProps="{ children: '上一步' }" :nextButtonProps="{ children: '下一步' }"><p>选择已配置、{{ kind === 'image' ? '支持参考图编辑的图片' : '支持参考图的视频' }}模型，调整比例、清晰度{{ kind === 'video' ? '和时长' : '及数量' }}。没有可用模型时，先到设置的 API 配置中接入模型。</p></el-tour-step>
      <el-tour-step title="4. 生成并查看结果" :target="target('.promptFooter, .promptCard')" :prevButtonProps="{ children: '上一步' }" :nextButtonProps="{ children: '开始创作' }"><p>点击右下角上箭头提交生成，成功后结果显示在当前节点中，可放大查看或保存。引导不会自动调用模型。</p></el-tour-step>
    </template>
    <template v-else>
      <el-tour-step v-for="(item, index) in steps" :key="`${item.nodeId}:${index}`" :title="`${index + 1}. ${item.title}`" :target="target(item.selector, item.nodeId, item.area)" :prevButtonProps="{ children: '上一步' }" :nextButtonProps="{ children: index === steps.length - 1 ? '开始创作' : '下一步' }"><p>{{ item.description }}</p></el-tour-step>
    </template>
    <template #indicators="{ current, total }"><span>{{ current + 1 }} / {{ total }}</span><el-button text @click="emit('complete')">跳过</el-button></template>
  </el-tour>
</template>
<script setup lang="ts">
import type { CanvasTutorialStep } from "@/lib/canvasTutorial";
import { onBeforeUnmount, ref, watch } from "vue";
const props = defineProps<{ kind: "image" | "video" | "canvas"; nodeId: string; steps: CanvasTutorialStep[]; focusNode: (id: string) => Promise<void> | undefined }>();
const emit = defineEmits<{ complete: [] }>();
const open = ref(true), step = ref(0), focusVersion = ref(0);
watch(step, async value => {
  const id = props.kind === "canvas" ? props.steps[value]?.nodeId ?? "" : props.nodeId;
  if (id !== undefined) await props.focusNode(id);
  if (step.value === value) focusVersion.value++;
}, { immediate: true });
function refreshTarget() { focusVersion.value++; }
window.addEventListener("resize", refreshTarget);
onBeforeUnmount(() => {
  window.removeEventListener("resize", refreshTarget);
  document.querySelectorAll("[data-tour-target]").forEach(element => element.removeAttribute("data-tour-target"));
});
function target(selector: string, id = props.nodeId, area?: "toolbar") {
  void focusVersion.value;
  return () => {
    document.querySelectorAll("[data-tour-target]").forEach(element => element.removeAttribute("data-tour-target"));
    const canvas = document.querySelector<HTMLElement>(".workspacePage .canvasRuntime:not(.backgroundCanvas)");
    const node = id ? canvas?.querySelector<HTMLElement>(`.vue-flow__node[data-id="${CSS.escape(id)}"]`) : undefined;
    const root = area === "toolbar" ? document.querySelector<HTMLElement>(".workspacePage .toolMenuContent") : id ? node : canvas;
    const element = selector.split(",").map(part => root?.querySelector<HTMLElement>(part.trim())).find(Boolean) ?? (id ? node : undefined);
    element?.setAttribute("data-tour-target", "");
    if (!element) return null;
    const bounds = element.getBoundingClientRect();
    // ACT: 目标太大或已离屏时改为居中，避免教程排到视口之外；高亮仍保留。
    const room = Math.max(bounds.top, window.innerHeight - bounds.bottom);
    if (room < 320 || bounds.bottom < 0 || bounds.top > window.innerHeight || bounds.right < 0 || bounds.left > window.innerWidth) return null;
    return element;
  };
}
</script>

<style lang="scss">
[data-tour-target] { outline: 2px solid #8075ef; outline-offset: 4px; box-shadow: 0 0 16px #6981ed66; }
</style>
