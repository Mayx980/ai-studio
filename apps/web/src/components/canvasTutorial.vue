<template>
  <el-tour v-model="open" v-model:current="step" :mask="false" :targetAreaClickable="true" :scrollIntoViewOptions="false" :contentStyle="{ width: '300px', maxWidth: 'calc(100vw - 24px)'  }" @close="emit('complete')" @finish="emit('complete')">
    <template v-if="kind !== 'canvas'">
      <el-tour-step title="1. 查看示例提示词" :target="target(kind === 'image' ? '.promptCard' : '.promptInputWrap')" :nextButtonProps="{ children: '下一步' }"><p v-if="kind === 'image'">已添加图1，并填写“去掉人物，其他不变”。可以直接体验去除人物，也可以修改提示词。</p><p v-else>已添加图1和图2，并填写女人在房顶给云朵刷粉色油漆的完整提示词。图2对应女人，图1对应房顶场景。</p></el-tour-step>
      <el-tour-step :title="kind === 'image' ? '2. 查看参考图片' : '2. 使用 @ 引用参考图'" :target="target(kind === 'video' ? '.mentionButton' : '.referenceCovers')" :prevButtonProps="{ children: '上一步' }" :nextButtonProps="{ children: '下一步' }"><p v-if="kind === 'image'">输入框上方的图1是本次编辑的参考图片。点击缩略图可以放大查看，移除后可通过上传或引用入口替换。</p><p v-else>提示词已插入真实的图2、图1引用标签。点击输入框的 @ 按钮可再次选择参考图；女人引用图2，房顶引用图1，点击标签可以查看对应图片。</p></el-tour-step>
      <el-tour-step title="3. 选择模型与参数" :target="target('.promptFooter, .promptCard')" :prevButtonProps="{ children: '上一步' }" :nextButtonProps="{ children: '下一步' }"><p>选择已配置、{{ kind === 'image' ? '支持参考图编辑的图片' : '支持两张参考图的视频' }}模型，调整比例、清晰度{{ kind === 'video' ? '和时长' : '及数量' }}。没有可用模型时，先到设置的 API 配置中接入模型。</p></el-tour-step>
      <el-tour-step title="4. 生成并查看结果" :target="target('.promptFooter, .promptCard')" :prevButtonProps="{ children: '上一步' }" :nextButtonProps="{ children: '开始创作' }"><p>点击右下角上箭头提交生成，成功后结果显示在当前节点中，可放大查看或保存。引导不会自动调用模型。</p></el-tour-step>
    </template>
    <template v-else>
    <el-tour-step title="1. 输入图片提示词" :target="target('.promptCard', imageIds[0])" :nextButtonProps="{ children: '下一步' }"><p>点击图片节点，编辑预填的女生提示词。选择图片模型，点击右下角上箭头生成；现有图片只是教学参考预览。</p></el-tour-step>
    <el-tour-step title="2. 生成另一张人物图" :target="target('.promptCard', imageIds[1])" :prevButtonProps="{ children: '上一步' }" :nextButtonProps="{ children: '下一步' }"><p>编辑男生图片提示词，选择模型后生成。两张人物图将作为视频的参考素材。</p></el-tour-step>
    <el-tour-step title="3. 连接图片与视频节点" :target="target('.vue-flow__handle[data-handleid=in]')" placement="right" :prevButtonProps="{ children: '上一步' }" :nextButtonProps="{ children: '下一步', disabled: connections < 2 }"><p>从每个图片节点右侧的输出连接点拖线，到视频节点左侧的输入连接点。也可以在视频节点“引用 → 当前画布资产”中选择图片。</p><p role="status">已连接 {{ connections }} / 2 张人物图</p></el-tour-step>
    <el-tour-step title="4. 输入视频提示词" :target="target('.promptInputWrap')" :prevButtonProps="{ children: '上一步' }" :nextButtonProps="{ children: '下一步' }"><p>点击视频节点，在输入框编辑镜头、人物动作和时长描述。两张参考图会显示在输入框上方，原有剧情提示词可直接修改。</p></el-tour-step>
    <el-tour-step title="5. 生成视频" :target="target('.promptFooter')" :prevButtonProps="{ children: '上一步' }" :nextButtonProps="{ children: '开始创作' }"><p>选择支持两张参考图的视频模型，调整参数，点击上箭头生成。可继续移动节点、修改提示词或重新连线。</p><p>未接入模型时先到设置配置 API；引导不会自动发起生成。</p></el-tour-step>
    </template>
    <template #indicators="{ current, total }"><span>{{ current + 1 }} / {{ total }}</span><el-button text @click="emit('complete')">跳过</el-button></template>
  </el-tour>
</template>
<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from "vue";
const props = defineProps<{ kind: "image" | "video" | "canvas"; nodeId: string; imageIds: string[]; connections: number; focusNode: (id: string) => Promise<void> | undefined }>();
const emit = defineEmits<{ complete: [] }>();
const open = ref(true), step = ref(0), focusVersion = ref(0);
watch(step, async value => {
  const id = props.kind !== "canvas" ? props.nodeId : value < 2 ? props.imageIds[value] : value === 2 ? "" : props.nodeId;
  if (id !== undefined) await props.focusNode(id);
  if (step.value === value) focusVersion.value++;
}, { immediate: true });
onBeforeUnmount(() => document.querySelectorAll("[data-tour-target]").forEach(element => element.removeAttribute("data-tour-target")));
function target(selector: string, id = props.nodeId) {
  void focusVersion.value;
  return () => { document.querySelectorAll("[data-tour-target]").forEach(element => element.removeAttribute("data-tour-target")); const element = document.querySelector<HTMLElement>(`.workspacePage .vue-flow__node[data-id="${CSS.escape(id)}"] ${selector}`)
    ?? document.querySelector<HTMLElement>(`.workspacePage .vue-flow__node[data-id="${CSS.escape(id)}"]`); element?.setAttribute("data-tour-target", ""); return element; };
}
</script>
