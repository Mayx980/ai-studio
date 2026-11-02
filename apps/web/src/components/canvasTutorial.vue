<template>
  <el-tour v-model="open" v-model:current="step" :targetAreaClickable="false" :scrollIntoViewOptions="false" :contentStyle="{ maxWidth: 'min(380px, calc(100vw - 32px))' }" @close="emit('complete')" @finish="emit('complete')">
    <el-tour-step title="从这个视频节点开始" :target="target('.videoContent')" :nextButtonProps="{ children: '下一步' }"><p>两张图片节点已连接到视频节点，三个节点都已填好提示词。先生成两个人物图，再生成10秒剧情短片；当前图片是你提供的预置参考预览。</p></el-tour-step>
    <el-tour-step title="1. 生成图1：女大学生" :target="target('.promptCard', imageIds[0])" :prevButtonProps="{ children: '上一步' }" :nextButtonProps="{ children: '下一步' }"><p>图1是可生图的图片节点，已填入完整女生影棚人像提示词。教学结束后，选择图片模型并点击上箭头生成，输出会沿连线传入视频节点。</p></el-tour-step>
    <el-tour-step title="2. 生成图2：男主播" :target="target('.promptCard', imageIds[1])" :prevButtonProps="{ children: '上一步' }" :nextButtonProps="{ children: '下一步' }"><p>图2已填入完整男主播影棚人像提示词。同样选择图片模型生成，再确认两个角色图的效果。</p></el-tour-step>
    <el-tour-step title="3. 确认视频引用" :target="target('.referenceList')" :prevButtonProps="{ children: '上一步' }" :nextButtonProps="{ children: '下一步' }"><p>图1是女大学生，图2是男主播。左侧图片节点通过连线引用到这里，人物顺序与提示词对应；可以预览或更换素材。</p></el-tour-step>
    <el-tour-step title="4. 认识视频提示词" :target="target('.promptCard')" :prevButtonProps="{ children: '上一步' }" :nextButtonProps="{ children: '下一步' }"><p>提示词已按0–2、2–4、4–7、7–10秒描述人物、镜头和动作。教学结束后可点击编辑，尝试修改其中一段。</p></el-tour-step>
    <el-tour-step title="5. 选择视频模型和参数" :target="target('.promptFooter')" :prevButtonProps="{ children: '上一步' }" :nextButtonProps="{ children: '下一步' }"><p>请在设置中配置视频模型，并选择支持双图人物参考的模型，不要选首尾帧模式。预填时长为10秒，实际可选参数取决于模型。</p><p>原文保留2.39电影宽画幅要求；当前比例先用16:9，模型未提供的比例不能直接输出。</p></el-tour-step>
    <el-tour-step title="6. 生成剧情视频" :target="target('.generationActions')" :prevButtonProps="{ children: '上一步' }" :nextButtonProps="{ children: '开始创作' }"><p>检查参考图、提示词与参数后，点击上箭头生成。未配置模型时按钮不可用；生成会调用所选模型并可能消耗额度。</p><p>教学不会自动生成，结果完成后可在节点中播放、下载。</p></el-tour-step>
    <template #indicators="{ current, total }"><span>{{ current + 1 }} / {{ total }}</span><el-button text @click="emit('complete')">跳过教学</el-button></template>
  </el-tour>
</template>
<script setup lang="ts">
import { ref, watch } from "vue";
const props = defineProps<{ nodeId: string; imageIds: string[]; focusNode: (id: string) => Promise<void> | undefined }>();
const emit = defineEmits<{ complete: [] }>();
const open = ref(true), step = ref(0);
const focusVersion = ref(0);
watch(step, async value => {
  const id = value === 1 ? props.imageIds[0] : value === 2 ? props.imageIds[1] : props.nodeId;
  if (id) await props.focusNode(id);
  if (step.value === value) focusVersion.value++;
});
function target(selector: string, id = props.nodeId) {
  void focusVersion.value;
  return () => document.querySelector<HTMLElement>(`.workspacePage .vue-flow__node[data-id="${CSS.escape(id)}"] ${selector}`)
    ?? document.querySelector<HTMLElement>(`.workspacePage .vue-flow__node[data-id="${CSS.escape(id)}"]`);
}
</script>
