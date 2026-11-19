<template>
  <section class="taskHistory" aria-label="生成任务记录">
    <div class="taskSummary"><el-button v-if="activeCount" text @click="openTasks('active')">进行中 {{ activeCount }}</el-button><el-button v-if="failedCount" text @click="openTasks('failed')">失败 {{ failedCount }}</el-button><el-button text @click="openTasks('all')">查看生成任务</el-button></div>
    <el-drawer v-model="drawerVisible" title="生成任务" size="min(860px, 100vw)">
    <header><h3>任务记录</h3><el-select v-model="status" aria-label="任务状态筛选"><el-option label="全部状态" value="all" /><el-option label="全部处理中" value="active" /><el-option v-for="(label, value) in taskLabels" :key="value" :label="label" :value="value" /></el-select><el-button text :loading="platformLoading" @click="loadPlatform">刷新状态</el-button></header>
    <el-alert v-if="platformError" :title="platformError" type="warning" :closable="false" />
    <el-table v-else :data="tasks" emptyText="暂无任务记录"><el-table-column prop="name" label="任务" /><el-table-column prop="modelId" label="生成模型" /><el-table-column label="状态"><template #default="{ row }"><el-tag :type="row.status === 'failed' ? 'danger' : row.status === 'completed' ? 'success' : 'info'">{{ taskLabels[row.status as PlatformTask['status']] }}</el-tag></template></el-table-column><el-table-column label="操作"><template #default="{ row }"><el-button text @click="selected = row as PlatformTask">详情</el-button></template></el-table-column></el-table>
    </el-drawer>
    <el-dialog :modelValue="!!selected" title="生成任务详情" width="min(640px, 94vw)" :closeOnClickModal="false" @update:modelValue="selected = undefined"><template v-if="selected"><h3>{{ selected.name }}</h3><p>{{ taskLabels[selected.status] }} · {{ selected.modelId }}</p><p v-if="selected.status === 'unknown'">正在核对原任务，提交结果未确认前请勿重复生成。</p><p v-if="selected.status === 'saving'">模型已返回，结果正在保存；保存完成后才标记整个任务完成。</p><p v-if="selected.failure" role="alert">{{ selected.failure }}</p><dl><template v-for="(value, key) in selected.parameters" :key="key"><dt>{{ key }}</dt><dd>{{ value }}</dd></template></dl><p>实际用量：{{ selected.usage }}</p><el-button v-if="selected.recoverable" :loading="busy" @click="recover">恢复保存</el-button><el-button v-if="selected.directory" @click="returnToSource">{{ selected.conversationFile ? '返回来源对话' : '返回来源项目' }}</el-button><el-button :loading="platformLoading" @click="refreshTask">核对原任务</el-button><p v-if="failure" role="alert">{{ failure }}</p><small>离开页面或停止等待不代表供应商已取消。输入、引用和已有结果保留。</small></template></el-dialog>
  </section>
</template>
<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { loadPlatform, platformState, platformError, platformLoading, savePlatform } from "@/stores/platform";
import { taskLabels, type PlatformTask } from "@/ports/platform";
import { currentUser } from "@/stores/accounts";
import { useWorkspaceStore } from "@/stores/workspace";
const drawerVisible = ref(false);
const status = ref("all"), selected = ref<PlatformTask>(), busy = ref(false), failure = ref("");
const tasks = computed(() => platformState.value.tasks.filter(item => item.accountId === currentUser.value?.id && (status.value === "all" || status.value === "active" && ["waiting", "running", "saving", "unknown"].includes(item.status) || item.status === status.value)));
const ownedTasks = computed(() => platformState.value.tasks.filter(item => item.accountId === currentUser.value?.id));
const activeCount = computed(() => ownedTasks.value.filter(item => ["waiting", "running", "saving", "unknown"].includes(item.status)).length);
const failedCount = computed(() => ownedTasks.value.filter(item => item.status === "failed").length);
function openTasks(value: string) { status.value = value; drawerVisible.value = true; }
const router = useRouter(), workspace = useWorkspaceStore();
async function refreshTask() { await loadPlatform(); if (selected.value) selected.value = platformState.value.tasks.find(item => item.id === selected.value?.id); }
async function recover() { if (!selected.value || busy.value) return; busy.value = true; failure.value = ""; try { await savePlatform({ type: "recoverTask", id: selected.value.id }); await refreshTask(); } catch (cause) { failure.value = cause instanceof Error ? cause.message : "恢复失败"; } finally { busy.value = false; } }
async function returnToSource() {
  const task = selected.value; if (!task?.directory) return;
  const project = workspace.projectList.find(item => item.directory === task.directory);
  if (!project) { failure.value = "来源项目不可访问，任务记录仍保留"; return; }
  try { await workspace.openProject(project.directory); if (task.conversationFile) { workspace.pendingAgentSession = { directory: task.directory, file: task.conversationFile }; workspace.creationMode = "simple"; } else { workspace.creationMode = "professional"; workspace.pendingCanvasEntry = { directory: task.directory }; } await router.push({ path: "/workspace", query: { returnSection: "assets" } }); selected.value = undefined; }
  catch (cause) { failure.value = cause instanceof Error ? cause.message : "打开来源失败"; }
}
onMounted(loadPlatform);
</script>
<style scoped lang="scss">
.taskHistory { margin:8px 0 16px; .taskSummary { display:flex; gap:12px; justify-content:flex-end; } header { display:flex; flex-wrap:wrap; gap:12px; align-items:center; .el-select { width:160px; } h3 { margin:0; margin-right:auto; font-size:16px; font-weight:500; } } .el-table { margin-top:16px; } p { line-height:1.7; } small { display:block; margin-top:24px; color:var(--el-text-color-secondary); line-height:1.6; } dl { display:grid; grid-template-columns:100px 1fr; gap:12px; dd { margin:0; } } }
</style>
