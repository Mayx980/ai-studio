<template>
  <el-button text :disabled="disabled" aria-label="选择项目文件夹" @click="choose"><icon-folder :size="16" />{{ selectedName || '选择项目文件夹' }}</el-button>
  <el-dialog v-model="visible" title="选择项目文件夹" width="min(560px, 92vw)" appendToBody @close="finish()">
    <div class="projectFolders"><button v-for="project in store.projectList" :key="project.directory" type="button" :aria-pressed="model === project.directory" @click="select(project.directory)"><icon-folder :size="18" />{{ project.name }}</button></div>
    <el-form labelPosition="top" @submit.prevent="create"><el-form-item label="新建项目文件夹"><el-input v-model="name" maxlength="80" aria-label="新项目文件夹名称" /></el-form-item><el-button type="primary" :loading="creating" @click="create">新建并选择</el-button></el-form>
    <el-alert v-if="error" :title="error" type="error" :closable="false" />
    <p>画布、对话与加入画布的素材保存在当前浏览器的该项目中。</p>
  </el-dialog>
</template>
<script setup lang="ts">
import { computed, ref } from "vue";
import { IconFolder } from "@tabler/icons-vue";
import { useWorkspaceStore } from "@/stores/workspace";
import useWorkspaceFiles from "@/lib/workspaceFiles";
defineProps<{ disabled?: boolean }>();
const model = defineModel<string>({ default: "" });
const store = useWorkspaceStore();
const selectedName = computed(() => store.projectList.find(project => project.directory === model.value)?.name);
const visible = ref(false), creating = ref(false), name = ref(""), error = ref("");
let resolveChoice: ((directory?: string) => void) | undefined;
function finish() { resolveChoice?.(); resolveChoice = undefined; }
function choose() { finish(); error.value = ""; visible.value = true; return new Promise<string | undefined>(resolve => { resolveChoice = resolve; }); }
function select(directory: string) { model.value = directory; resolveChoice?.(directory); resolveChoice = undefined; visible.value = false; }
async function create() {
  if (creating.value) return;
  error.value = "";
  const value = name.value.trim();
  if (!value) { error.value = "请输入项目文件夹名称"; return; }
  if (store.projectList.some(project => project.name === value)) { error.value = "已有同名项目，请直接选择或使用其它名称"; return; }
  creating.value = true;
  const directory = `browser://${crypto.randomUUID()}`;
  try {
    await useWorkspaceFiles(directory).writeJson("画布1.json", { toonflowCanvas: true, nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } }, true);
    await store.openProject(directory); store.renameProject(directory, value);
    select(directory); name.value = "";
  } catch (reason) { error.value = reason instanceof Error ? reason.message : "创建项目失败"; }
  finally { creating.value = false; }
}
defineExpose({ choose });
</script>
<style scoped lang="scss">
.projectFolders { display: grid; gap: 8px; max-height: 260px; overflow: auto; margin-bottom: 20px; button { display: flex; align-items: center; gap: 10px; padding: 12px; border: 1px solid var(--el-border-color); border-radius: 8px; background: var(--el-bg-color); color: var(--el-text-color-primary); cursor: pointer; &[aria-pressed="true"] { border-color: var(--el-color-primary); } } }
p { color: var(--el-text-color-secondary); font-size: 12px; }
</style>
