<script setup>
import { useCreation } from '../ports/creation'
import Icon from './CreationIcon.vue'
const p = useCreation()
const providers = [
  ['text', '文本 · 分镜与提示词优化', 'qwen3.8-flash · aliyun_bailian_qwen_text.ts'],
  ['image', '图片', 'qwen-image-3.0-pro · aliyunBailianQwenImage30Pro.ts'],
  ['video', '视频 · 文生／图生', 'wan3Video · aliyun_wan3_video_v3.ts'],
  ['audio', '音频', 'seed-audio-1.0 · seed-audio.ts']
]
</script>
<template>
  <div
    v-if="p.models?.open"
    class="modal-backdrop model-settings-backdrop"
    @click.self="p.models.open = false"
  >
    <section class="modal" role="dialog" aria-modal="true" aria-label="真实模型接入">
      <header class="modal-header">
        <h2>真实模型接入</h2>
        <button class="icon-button" title="关闭" @click="p.models.open = false">
          <Icon name="close" />
        </button>
      </header>
      <div class="modal-content">
        <p class="help-copy">
          使用公司提供的四个适配器。本页面临时保留
          Key，刷新即清除，不写入项目、浏览器存储或仓库。生成前会再次确认。
        </p>
        <label v-for="[kind, title, file] in providers" :key="kind" class="model-key-field"
          ><span>{{ title }}</span
          ><small>{{ file }}</small
          ><input
            v-model="p.models[kind]"
            :aria-label="title + ' API Key'"
            type="password"
            autocomplete="off"
            placeholder="在此输入 API Key"
        /></label>
        <p class="help-copy">
          图片：1K／2K、PNG，最多3张参考图；视频：文生或单图生，2–30秒；音频：采用文件提供的音频接口。界面参数最终以适配器验证为准。
        </p>
      </div>
      <footer class="modal-footer">
        <button class="ghost-button" @click="p.clearModelKeys()">清除全部 Key</button
        ><span class="footer-note"></span
        ><button class="primary-button" @click="p.models.open = false">完成配置</button>
      </footer>
    </section>
  </div>
</template>
