<template>
  <section class="browserApiSettings">
    <h3>API 配置</h3>
    <p>使用本次提供的模型适配器直接联调。Key 仅保存在当前浏览器页面内存，刷新后清除，不写入服务端设置。</p>
    <el-switch v-model="browserConfig.enabled" activeText="启用浏览器模型联调" aria-label="启用浏览器模型联调" />
    <el-form labelPosition="top" autocomplete="off">
      <el-form-item v-for="(model, kind) in browserModels" :key="kind" :label="model.label">
        <el-input v-model="browserConfig.keys[kind]" type="password" showPassword autocomplete="off" :aria-label="`${model.label} API Key`" placeholder="输入 API Key，刷新后清除" />
      </el-form-item>
      <el-form-item label="百炼业务空间接口地址（图片／文本）"><el-input v-model="browserConfig.endpoint" aria-label="百炼业务空间接口地址" /></el-form-item>
    </el-form>
    <p>万相视频沿用文件中的业务空间地址；音频使用火山引擎固定地址。供应商需允许浏览器跨域访问。发送才产生真实请求及费用；停止等待不保证撤销远端任务。</p>
    <el-button @click="clearBrowserKeys">清除全部 Key 并停止等待</el-button>
  </section>
</template>

<script setup lang="ts">
import { browserConfig, browserModels, clearBrowserKeys } from "@/stores/browserGeneration";
</script>

<style scoped lang="scss">
.browserApiSettings { margin-top: 32px; border-top: 1px solid var(--el-border-color-light); padding-top: 18px; p { color: var(--el-text-color-secondary); font-size: 13px; line-height: 1.7; } .el-form { margin-top: 18px; } }
</style>
