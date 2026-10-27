<template>
  <el-popover v-if="browserConfig.enabled" trigger="click" placement="top" :width="300">
    <template #reference><el-button text aria-label="模型与生成参数">{{ selectedBrowserModel.label }} · 参数</el-button></template>
    <el-form labelPosition="top">
      <el-form-item label="生成模型"><el-select v-model="browserConfig.kind" aria-label="生成模型" @change="resetParameters"><el-option v-for="(model, kind) in browserModels" :key="kind" :label="model.models[0]!.label" :value="kind" /></el-select></el-form-item>
      <template v-if="browserConfig.kind === 'image' || browserConfig.kind === 'video'">
        <el-form-item label="比例"><el-select v-model="browserConfig.ratio" aria-label="比例"><el-option label="AI 推荐" value="" /><el-option v-for="item in ratios" :key="item" :label="item" :value="item" /></el-select></el-form-item>
        <el-form-item label="分辨率"><el-select v-model="browserConfig.resolution" aria-label="分辨率"><el-option label="AI 推荐" value="" /><el-option v-for="item in resolutions" :key="item" :label="item" :value="item" /></el-select></el-form-item>
        <el-form-item v-if="browserConfig.kind === 'video'" label="时长"><el-select v-model="browserConfig.duration" aria-label="时长"><el-option label="AI 推荐" value="" /><el-option v-for="item in [2, 3, 5, 10, 15, 20, 30]" :key="item" :label="`${item} 秒`" :value="String(item)" /></el-select></el-form-item>
      </template>
      <p>直接调用所选模型，不执行 Agent 的画布工具。</p>
      <p>未选择时采用适配器默认／模型推荐值；手动选择后按指定值提交。</p>
      <p v-if="browserConfig.kind === 'video'">支持人物参考或单独首帧；当前适配器不支持尾帧。</p>
      <p v-if="browserConfig.kind === 'audio' || browserConfig.kind === 'text'">当前适配器仅支持文字输入。</p>
    </el-form>
  </el-popover>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { browserConfig, browserModels, selectedBrowserModel } from "@/stores/browserGeneration";
const ratios = computed(() => browserConfig.kind === "image" ? browserModels.image.models[0]!.imageRatios : ["16:9", "9:16", "1:1"]);
const resolutions = computed(() => browserConfig.kind === "image" ? ["1K", "2K", "auto"] : ["480P", "720P", "1080P"]);
function resetParameters() { browserConfig.ratio = ""; browserConfig.resolution = ""; browserConfig.duration = ""; }
</script>
