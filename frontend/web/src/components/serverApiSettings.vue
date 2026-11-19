<template>
  <section class="serverApiSettings">
    <p>模型配置供本实例共享使用，Key 由服务器保存。编辑时留空保留已保存的 Key，清除需明确勾选。</p>
    <el-tabs v-model="active">
      <el-tab-pane label="文字模型" name="text"><languageModel :visible="visible && active === 'text'" /></el-tab-pane>
      <el-tab-pane label="图片、视频与音频" name="media"><mediaModel :visible="visible && active === 'media'" /></el-tab-pane>
    </el-tabs>
  </section>
</template>
<script setup lang="ts">
import { ref } from "vue";
import languageModel from "./settings/panels/languageModel/index.vue";
import mediaModel from "./settings/panels/mediaModel/index.vue";
defineProps<{ visible: boolean }>();
const active = ref("text");
</script>
<style scoped lang="scss">
.serverApiSettings { p { margin: 0 0 16px; color: var(--el-text-color-secondary); font-size: 13px; line-height: 1.7; } }
</style>
