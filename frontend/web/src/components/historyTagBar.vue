<template>
  <div class="historyTagBar">
    <nav aria-label="历史素材标签"><button v-for="tag in tagOptions" :key="tag.value" type="button" :aria-pressed="model === tag.value" :disabled="disabled" @click="model = tag.value"><component :is="tag.icon" :size="16" aria-hidden="true" /><span>{{ tag.label }}</span></button></nav>
    <el-dialog v-model="editing" title="修改标签" width="min(420px, 92vw)" appendToBody :closeOnClickModal="false"><p>统一设置所选 {{ targets.length }} 项素材的标签</p><el-checkbox-group v-model="chosen"><el-checkbox-button v-for="name in editableTags" :key="name" :value="name">{{ name }}</el-checkbox-button></el-checkbox-group><template #footer><el-button @click="editing = false">取消</el-button><el-button type="primary" @click="save">保存</el-button></template></el-dialog>
  </div>
</template>
<script setup lang="ts">
import { computed, ref } from "vue";
import { ElMessage } from "element-plus";
import { IconTags, IconUser, IconMountain, IconBox, IconPalette, IconWaveSine, IconTagOff, IconTag } from "@tabler/icons-vue";
import { useAssetStore, historyLabelNames, historyUntaggedLabel } from "@/stores/assets";
import type { HistoryItem } from "@/lib/useGenerationHistory";
const props = defineProps<{ disabled?: boolean }>();
const emit = defineEmits<{ edited: [] }>();
const model = defineModel<string>({ default: "" });
const assets = useAssetStore();
const fixedIcons = [IconUser, IconMountain, IconBox, IconPalette, IconWaveSine];
const editableTags = computed(() => [...new Set([...historyLabelNames, ...assets.historyTagNames, ...targets.value.flatMap(item => assets.historyTagsFor(item))])]);
const tagOptions = computed(() => [{ value: "", label: "全部标签", icon: IconTags }, ...historyLabelNames.map((name, index) => ({ value: name, label: name, icon: fixedIcons[index]! })), ...assets.historyTagNames.map(name => ({ value: name, label: name, icon: IconTag })), { value: historyUntaggedLabel, label: "未标记", icon: IconTagOff }]);
const editing = ref(false), targets = ref<HistoryItem[]>([]), chosen = ref<string[]>([]);
function edit(items: HistoryItem[]) {
  if (props.disabled || !items.length) return;
  targets.value = [...items]; chosen.value = [...new Set(items.flatMap(item => assets.historyTagsFor(item)))]; editing.value = true;
}
function save() {
  try { assets.setHistoryTags(targets.value, chosen.value); editing.value = false; emit("edited"); ElMessage.success(`已修改 ${targets.value.length} 项素材标签`); }
  catch (cause) { ElMessage.error(cause instanceof Error ? cause.message : "修改标签失败"); }
}
defineExpose({ edit });
</script>
<style scoped lang="scss">
.historyTagBar {
  margin-bottom: 12px;
  nav { display: flex; flex-wrap: wrap; gap: 6px;
    button { display: inline-flex; align-items: center; gap: 6px; min-height: 30px; padding: 5px 10px; border: 0; border-radius: 8px; background: transparent; color: var(--el-text-color-secondary); font: inherit; font-size: 13px; cursor: pointer;
      svg { flex: none; }
      &[aria-pressed="true"], &:hover:enabled { color: var(--el-text-color-primary); background: #303136; }
      &:disabled { opacity: .5; cursor: wait; }
      &:focus-visible { outline: 1px solid var(--el-color-primary); }
    }
  }
}
</style>
