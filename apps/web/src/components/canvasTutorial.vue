<template>
  <el-tour v-model="open" v-model:current="step" :mask="false" :targetAreaClickable="true" :scrollIntoViewOptions="false" :contentStyle="{ maxWidth: 'min(340px, calc(100vw - 32px))' }" @close="emit('complete')" @finish="emit('complete')">
    <el-tour-step title="1. 输入图片提示词" :target="target('.promptCard', imageIds[0])" :nextButtonProps="{ children: '下一步' }"><p>点击图片节点，编辑预填的女生提示词。选择图片模型，点击右下角上箭头生成；现有图片只是教学参考预览。</p></el-tour-step>
    <el-tour-step title="2. 生成另一张人物图" :target="target('.promptCard', imageIds[1])" :prevButtonProps="{ children: '上一步' }" :nextButtonProps="{ children: '下一步' }"><p>编辑男生图片提示词，选择模型后生成。两张人物图将作为视频的参考素材。</p></el-tour-step>
    <el-tour-step title="3. 连接图片与视频节点" :target="target('.vue-flow__handle[data-handleid=in]')" placement="right" :prevButtonProps="{ children: '上一步' }" :nextButtonProps="{ children: '下一步', disabled: connections < 2 }"><p>从每个图片节点右侧的输出连接点拖线，到视频节点左侧的输入连接点。也可以在视频节点“引用 → 当前画布资产”中选择图片。</p><p role="status">已连接 {{ connections }} / 2 张人物图</p></el-tour-step>
    <el-tour-step title="4. 输入视频提示词" :target="target('.promptInputWrap')" :prevButtonProps="{ children: '上一步' }" :nextButtonProps="{ children: '下一步' }"><p>点击视频节点，在输入框编辑镜头、人物动作和时长描述。两张参考图会显示在输入框上方，原有剧情提示词可直接修改。</p></el-tour-step>
    <el-tour-step title="5. 生成视频" :target="target('.promptFooter')" :prevButtonProps="{ children: '上一步' }" :nextButtonProps="{ children: '开始创作' }"><p>选择支持两张参考图的视频模型，调整参数，点击上箭头生成。可继续移动节点、修改提示词或重新连线。</p><p>未接入模型时先到设置配置 API；引导不会自动发起生成。</p></el-tour-step>
    <template #indicators="{ current, total }"><span>{{ current + 1 }} / {{ total }}</span><el-button text @click="emit('complete')">跳过</el-button></template>
  </el-tour>
</template>
<script setup lang="ts">
import { ref, watch } from "vue";
const props = defineProps<{ nodeId: string; imageIds: string[]; connections: number; focusNode: (id: string) => Promise<void> | undefined }>();
const emit = defineEmits<{ complete: [] }>();
const open = ref(true), step = ref(0), focusVersion = ref(0);
watch(step, async value => {
  const id = value < 2 ? props.imageIds[value] : value === 2 ? "" : props.nodeId;
  if (id !== undefined) await props.focusNode(id);
  if (step.value === value) focusVersion.value++;
}, { immediate: true });
function target(selector: string, id = props.nodeId) {
  void focusVersion.value;
  return () => document.querySelector<HTMLElement>(`.workspacePage .vue-flow__node[data-id="${CSS.escape(id)}"] ${selector}`)
    ?? document.querySelector<HTMLElement>(`.workspacePage .vue-flow__node[data-id="${CSS.escape(id)}"]`);
}
</script>
