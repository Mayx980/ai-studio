<template>
  <section class="browserApiSettings">
    <p>使用本次提供的模型适配器直接联调。Key 仅保存在当前浏览器页面内存，刷新后清除，不写入服务端设置。</p>
    <el-switch v-model="browserConfig.enabled" activeText="启用浏览器模型联调" aria-label="启用浏览器模型联调" />
    <el-form labelPosition="top" autocomplete="off">
      <el-form-item v-for="(model, kind) in browserModels" :key="kind" :label="model.label">
        <el-input v-model="browserConfig.keys[kind]" type="password" showPassword autocomplete="off" :aria-label="`${model.label} API Key`" placeholder="输入 API Key，刷新后清除" />
      </el-form-item>
      <el-form-item label="百炼业务空间接口地址（图片／文本）"><el-input v-model="browserConfig.endpoint" aria-label="百炼业务空间接口地址" /></el-form-item>
      <el-card v-for="model in additionalBrowserModels" :key="model.id" class="modelEntry" shadow="never">
        <el-form-item label="模型类型"><el-select v-model="model.kind"><el-option v-for="(label, kind) in kindLabels" :key="kind" :label="label" :value="kind" /></el-select></el-form-item>
        <el-form-item label="显示名称"><el-input v-model="model.label" /></el-form-item>
        <el-form-item label="模型 ID"><el-input v-model="model.modelId" /></el-form-item>
        <el-form-item label="接口地址（HTTPS）"><el-input v-model="model.endpoint" /></el-form-item>
        <el-form-item label="API Key"><el-input v-model="model.apiKey" type="password" showPassword autocomplete="off" /></el-form-item>
        <p>使用{{ kindLabels[model.kind] }}协议：{{ protocols[model.kind] }}。模型 ID 须由供应商支持，填写配置不会自动调用模型。</p>
        <el-button text type="danger" @click="additionalBrowserModels.splice(additionalBrowserModels.indexOf(model), 1)">移除模型</el-button>
      </el-card>
      <el-button @click="addModel">接入更多模型</el-button>
    </el-form>
    <p>万相视频沿用文件中的业务空间地址；音频使用火山引擎固定地址。本机原型通过临时中转访问供应商，Key 只随当次请求转发，不保存或记录；普通部署仍需供应商允许跨域。发送才产生真实请求及费用；停止等待不保证撤销远端任务。</p>
    <el-button @click="clearBrowserKeys">清除全部 Key 并停止等待</el-button>
  </section>
</template>

<script setup lang="ts">
import { browserConfig, browserModels, additionalBrowserModels, clearBrowserKeys } from "@/stores/browserGeneration";
const kindLabels = { text: "文字", image: "图片", video: "视频", audio: "音频" };
const protocols = { text: "OpenAI Chat Completions", image: "百炼 DashScope 图像生成", video: "百炼万相异步视频", audio: "火山 Seed-Audio" };
function addModel() { additionalBrowserModels.push({ id: `browser:${crypto.randomUUID()}`, kind: "text", label: "", modelId: "", endpoint: browserConfig.endpoint, apiKey: "" }); }
</script>

<style scoped lang="scss">
.browserApiSettings { p { color: var(--el-text-color-secondary); font-size: 13px; line-height: 1.7; } .el-form { margin-top: 18px; } }
</style>
