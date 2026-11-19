<template>
  <el-dialog v-model="visible" title="快捷键" width="min(720px, 92vw)" appendToBody>
    <el-tabs v-model="tab">
      <el-tab-pane label="使用说明" name="help">
        <p>快捷键在专业模式的画布中使用；编辑文字时保留系统输入与编辑操作。</p>
        <div class="shortcutHelp">
          <div v-for="field in canvasShortcutFields" :key="field.id" class="shortcutRow"><span>{{ field.label }}</span><kbd>{{ shortcutLabel(generalSettings.canvasShortcuts[field.id]) || '未绑定' }}{{ field.gesture === 'drag' ? ' + 拖动' : field.gesture === 'wheel' ? ' + 滚轮' : '' }}</kbd></div>
        </div>
      </el-tab-pane>
      <el-tab-pane label="快捷键设置" name="settings"><canvasShortcuts /></el-tab-pane>
    </el-tabs>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { canvasShortcutFields, shortcutLabel } from "@/lib/canvasShortcuts";
import { generalSettings } from "@/stores/settings";
import canvasShortcuts from "@/components/settings/panels/general/canvasShortcuts.vue";
const visible = defineModel<boolean>({ default: false });
const tab = ref("help");
</script>

<style scoped lang="scss">
.shortcutHelp { max-height: 55vh; overflow-y: auto; .shortcutRow { display: flex; justify-content: space-between; align-items: center; gap: 14px; padding: 11px 2px; border-bottom: 1px solid var(--el-border-color-lighter); kbd { padding: 4px 8px; border: 1px solid var(--el-border-color); border-radius: 5px; background: var(--el-fill-color-light); font: inherit; font-size: 12px; } } }
</style>
