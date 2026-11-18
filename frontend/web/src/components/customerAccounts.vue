<template>
  <section class="customerAccounts">
    <header><div><h2>{{ isPlatformAdmin ? '账号管理' : '本客户账号管理' }}</h2><p>仅展示账号状态和资产概况，私人项目与资产保持个人隔离</p></div><el-button type="primary" :disabled="!customerId" @click="openCreate">创建账号</el-button></header>
    <div class="filters"><el-input v-model="search" placeholder="搜索账号或姓名" aria-label="搜索账号或姓名" clearable /><el-select v-model="status" aria-label="账号状态"><el-option label="全部状态" value="all" /><el-option label="已启用" value="enabled" /><el-option label="已禁用" value="disabled" /></el-select></div>
    <el-table :data="filtered" emptyText="暂无符合条件的账号" tableLayout="auto"><el-table-column prop="username" label="账号" /><el-table-column prop="name" label="姓名" /><el-table-column label="角色"><template #default="{ row }">{{ roleLabels[row.role as PlatformRole] }}</template></el-table-column><el-table-column label="状态"><template #default="{ row }"><el-tag :type="row.enabled ? 'success' : 'info'">{{ row.enabled ? '已启用' : '已禁用' }}</el-tag><small v-if="row.mustChangePassword">待修改临时密码</small></template></el-table-column><el-table-column label="操作" minWidth="300"><template #default="{ row }"><el-button text @click="detail = row as ManagedAccount">详情</el-button><el-button text @click="openReset(row as ManagedAccount)">重置密码</el-button><el-button text :type="row.enabled ? 'danger' : 'primary'" @click="toggleAccount(row as ManagedAccount)">{{ row.enabled ? '禁用' : '启用' }}</el-button><el-button v-if="isPlatformAdmin" text @click="toggleRole(row as ManagedAccount)">{{ row.role === 'customerAdmin' ? '撤销管理员' : '任命管理员' }}</el-button></template></el-table-column></el-table>
    <el-dialog v-model="editor" :title="resetId ? '重置临时密码' : '创建普通账号'" width="min(480px, 94vw)" :closeOnClickModal="false" :beforeClose="closeEditor" @closed="password = ''">
      <form class="accountForm" @submit.prevent="submit"><template v-if="!resetId"><label for="managedUsername">账号</label><el-input id="managedUsername" v-model="username" :maxlength="64" autocomplete="off" /><label for="managedName">姓名</label><el-input id="managedName" v-model="name" :maxlength="64" /></template><p v-else>为 {{ resetName }} 设置新的临时密码</p><label for="temporaryPassword">临时密码（6–15字符）</label><el-input id="temporaryPassword" v-model="password" type="password" showPassword :maxlength="15" autocomplete="new-password"><template #append><el-button @click="copyPassword">复制</el-button></template></el-input><p>默认123456，可自行修改。用户下次登录必须先修改密码。</p><p v-if="failure" class="failure" role="alert">{{ failure }}</p><el-button type="primary" nativeType="submit" :loading="busy">{{ resetId ? '确认重置' : '创建账号' }}</el-button></form>
    </el-dialog>
    <el-dialog :modelValue="!!detail" title="账号详情" width="min(520px, 94vw)" @update:modelValue="detail = undefined"><dl v-if="detail"><dt>账号</dt><dd>{{ detail.username }}</dd><dt>角色</dt><dd>{{ roleLabels[detail.role] }}</dd><dt>状态</dt><dd>{{ detail.enabled ? '已启用' : '已禁用' }}</dd><dt>项目数</dt><dd>{{ detail.projects }}</dd><dt>资产数</dt><dd>{{ detail.assets }}</dd><dt>存储用量</dt><dd>{{ detail.storage }}</dd></dl><p>账号管理权限不包含打开、预览或下载此账号的私人内容。</p></el-dialog>
  </section>
</template>
<script setup lang="ts">
import { computed, ref } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import { platformState, savePlatform, isPlatformAdmin } from "@/stores/platform";
import { roleLabels, type ManagedAccount, type PlatformRole } from "@/ports/platform";
const props = defineProps<{ customerId: string }>();
const search = ref(""), status = ref("all"), editor = ref(false), username = ref(""), name = ref(""), password = ref(""), resetId = ref(""), resetName = ref(""), failure = ref(""), busy = ref(false);
const detail = ref<ManagedAccount>();
const filtered = computed(() => platformState.value.accounts.filter(item => item.customerId === props.customerId && (isPlatformAdmin.value || item.role === "user") && `${item.username} ${item.name}`.includes(search.value.trim()) && (status.value === "all" || item.enabled === (status.value === "enabled"))));
function openCreate() { resetId.value = ""; username.value = ""; name.value = ""; password.value = "123456"; failure.value = ""; editor.value = true; }
function openReset(item: ManagedAccount) { resetId.value = item.id; resetName.value = item.name; password.value = "123456"; failure.value = ""; editor.value = true; }
function closeEditor(done: () => void) { if (!busy.value) done(); }
async function copyPassword() { try { await navigator.clipboard.writeText(password.value); ElMessage.success("临时密码已复制"); } catch { ElMessage.error("复制失败，请手动复制"); } }
async function submit() {
  if (busy.value) return; busy.value = true; failure.value = "";
  try {
    if (password.value.length < 6 || password.value.length > 15) throw new Error("临时密码须为6–15字符");
    await savePlatform(resetId.value ? { type: "resetPassword", id: resetId.value, password: password.value } : { type: "account", value: { username: username.value.trim(), name: name.value.trim(), customerId: props.customerId }, password: password.value });
    editor.value = false; password.value = ""; ElMessage.success(resetId.value ? "已设置临时密码，下次登录须修改" : "账号已创建，首次登录须修改密码");
  } catch (cause) { failure.value = cause instanceof Error ? cause.message : "保存失败"; } finally { busy.value = false; }
}
async function toggleAccount(item: ManagedAccount) {
  const confirmed = await ElMessageBox.confirm(item.enabled ? "禁用后已有登录将失效，项目、资产及归属保留。" : "启用后可继续访问原有个人内容。", `${item.enabled ? '禁用' : '启用'} ${item.username}？`, { type: "warning", confirmButtonText: "确认", cancelButtonText: "取消" }).then(() => true, () => false);
  if (!confirmed) return;
  try { await savePlatform({ type: "accountStatus", id: item.id, enabled: !item.enabled }); } catch (cause) { ElMessage.error(cause instanceof Error ? cause.message : "操作失败"); }
}
async function toggleRole(item: ManagedAccount) {
  const role = item.role === "customerAdmin" ? "user" : "customerAdmin";
  const confirmed = await ElMessageBox.confirm(role === "customerAdmin" ? "该账号将可管理本客户普通账号，私人内容仍按个人隔离。" : "撤销后保留普通用户创作能力及个人内容。", "调整客户管理员", { confirmButtonText: "确认", cancelButtonText: "取消" }).then(() => true, () => false);
  if (confirmed) try { await savePlatform({ type: "accountRole", id: item.id, role }); } catch (cause) { ElMessage.error(cause instanceof Error ? cause.message : "操作失败"); }
}
</script>
<style scoped lang="scss">
.customerAccounts { header { display:flex; justify-content:space-between; gap:16px; align-items:center; h2 { margin:0; font-size:20px; } p { color:var(--el-text-color-secondary); font-size:14px; } } .filters { display:flex; gap:12px; margin:20px 0; .el-input { max-width:320px; } .el-select { width:160px; } } small { display:block; color:var(--el-text-color-secondary); } dl { display:grid; grid-template-columns:100px 1fr; gap:16px; dd { margin:0; } } .accountForm { display:grid; gap:12px; p { color:var(--el-text-color-secondary); line-height:1.6; } .failure { color:var(--el-color-danger); } } }
</style>
