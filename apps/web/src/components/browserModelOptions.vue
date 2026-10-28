<template>
  <el-popover v-if="browserConfig.enabled || browserWorkspaceMode" trigger="click" placement="top" :width="300">
    <template #reference><el-button text aria-label="模型与生成参数">{{ browserModels[kind].models[0]!.label }} · 参数</el-button></template>
    <el-form labelPosition="top">
      <el-form-item label="生成模型"><span>{{ browserModels[kind].models[0]!.label }}</span></el-form-item>
      <template v-if="kind === 'image' || kind === 'video'">
        <el-form-item label="比例"><el-select v-model="browserConfig.ratio" aria-label="比例"><el-option label="AI 推荐" value="" /><el-option v-for="item in ratios" :key="item" :label="item" :value="item" /></el-select></el-form-item>
        <el-form-item label="分辨率"><el-select v-model="browserConfig.resolution" aria-label="分辨率"><el-option label="AI 推荐" value="" /><el-option v-for="item in resolutions" :key="item" :label="item" :value="item" /></el-select></el-form-item>
        <el-form-item v-if="kind === 'video'" label="时长"><el-select v-model="browserConfig.duration" aria-label="时长"><el-option label="AI 推荐" value="" /><el-option v-for="item in [2, 3, 5, 10, 15, 20, 30]" :key="item" :label="`${item} 秒`" :value="String(item)" /></el-select></el-form-item>
      </template>
      <p>根据输入选择文字、图片、音频或视频模型；简单模式信息模糊时默认生成图片。</p>
      <p>未选择时采用适配器默认／模型推荐值；手动选择后按指定值提交。</p>
      <p v-if="kind === 'video'">图片默认作为参考；首帧请在输入中指定“图1作为首帧”。当前模型不支持尾帧。</p>
      <p v-if="kind === 'audio' || kind === 'text'">当前适配器仅支持文字输入。</p>
    </el-form>
  </el-popover>
</template>

<script setup lang="ts">
import { browserWorkspaceMode } from "@/lib/browserWorkspaceFiles";
import { computed, watch } from "vue";
import { browserConfig, browserModels, generationBusy, inferGenerationKind } from "@/stores/browserGeneration";
const props = withDefaults(defineProps<{ prompt?: string }>(), { prompt: "" });
const kind = computed(() => generationBusy.value ? browserConfig.kind : inferGenerationKind(props.prompt));
watch(() => inferGenerationKind(props.prompt), () => { if (props.prompt.trim() && !generationBusy.value) resetParameters(); });
const ratios = computed(() => kind.value === "image" ? browserModels.image.models[0]!.imageRatios : ["16:9", "9:16", "1:1"]);
const resolutions = computed(() => kind.value === "image" ? ["1K", "2K", "auto"] : ["480P", "720P", "1080P"]);
function resetParameters() { browserConfig.ratio = ""; browserConfig.resolution = ""; browserConfig.duration = ""; }
</script>
