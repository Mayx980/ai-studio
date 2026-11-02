<template>
  <el-tour v-model="open" v-model:current="step" :targetAreaClickable="false" :scrollIntoViewOptions="false" :contentStyle="{ maxWidth: 'min(340px, calc(100vw - 32px))' }" @close="emit('complete')" @finish="emit('complete')">
    <el-tour-step title="1. 生成女生图" :target="target('.promptCard', imageIds[0])" :nextButtonProps="{ children: '下一步' }"><p>提示词已填好，选图片模型后点击上箭头生成。</p></el-tour-step>
    <el-tour-step title="2. 生成男生图" :target="target('.promptCard', imageIds[1])" :prevButtonProps="{ children: '上一步' }" :nextButtonProps="{ children: '下一步' }"><p>同样生成男生图。两张人物图已连到视频节点。</p></el-tour-step>
    <el-tour-step title="3. 生成视频" :target="target('.promptFooter')" :prevButtonProps="{ children: '上一步' }" :nextButtonProps="{ children: '开始创作' }"><p>确认人物图，选择双图参考模型后生成10秒视频。参数以模型支持为准，生成可能消耗额度。</p></el-tour-step>
    <template #indicators="{ current, total }"><span>{{ current + 1 }} / {{ total }}</span><el-button text @click="emit('complete')">跳过</el-button></template>
  </el-tour>
</template>
<script setup lang="ts">
import { ref, watch } from "vue";
const props = defineProps<{ nodeId: string; imageIds: string[]; focusNode: (id: string) => Promise<void> | undefined }>();
const emit = defineEmits<{ complete: [] }>();
const open = ref(true), step = ref(0), focusVersion = ref(0);
watch(step, async value => {
  const id = value < 2 ? props.imageIds[value] : props.nodeId;
  if (id) await props.focusNode(id);
  if (step.value === value) focusVersion.value++;
}, { immediate: true });
function target(selector: string, id = props.nodeId) {
  void focusVersion.value;
  return () => document.querySelector<HTMLElement>(`.workspacePage .vue-flow__node[data-id="${CSS.escape(id)}"] ${selector}`)
    ?? document.querySelector<HTMLElement>(`.workspacePage .vue-flow__node[data-id="${CSS.escape(id)}"]`);
}
</script>
