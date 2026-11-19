<template>
  <section class="customerAccounts">
    <header><h2 v-if="!isPlatformAdmin">账号管理</h2><el-button type="primary" @click="openCreate">创建账号</el-button></header>
    <p class="accountHelp">删除账号后，已有登录将失效；项目、资产及历史记录保留原归属，不会移交或释放存储空间。</p>
    <div class="filters"><el-select v-if="isPlatformAdmin" v-model="groupFilter" clearable placeholder="全部用户组" aria-label="用户组筛选"><el-option v-for="group in platformState.customers" :key="group.id" :label="group.name" :value="group.id" /></el-select><el-select v-if="isPlatformAdmin" v-model="roleFilter" clearable placeholder="全部角色" aria-label="角色筛选"><el-option label="客户管理员" value="customerAdmin" /><el-option label="普通用户" value="user" /></el-select><el-select v-model="status" aria-label="状态筛选"><el-option label="全部状态" value="all" /><el-option label="已启用" value="enabled" /><el-option label="已禁用" value="disabled" /></el-select><el-input v-model="search" placeholder="搜索账号名或姓名" aria-label="搜索账号名或姓名" clearable @keyup.enter="query" /><el-button @click="query">查询</el-button><el-button @click="resetFilters">重置</el-button></div>
    <div class="pagination"><el-pagination v-model:currentPage="page" v-model:pageSize="pageSize" :pageSizes="[10,20,50]" :total="filtered.length" layout="total, sizes, prev, pager, next" /></div>
    <el-table :data="pagedAccounts" emptyText="暂无符合条件的账号"><el-table-column type="index" label="序号" :index="(index: number) => (page - 1) * pageSize + index + 1" :width="70" /><el-table-column prop="username" label="账号名" :minWidth="130" /><el-table-column prop="name" label="姓名" :minWidth="120" /><el-table-column v-if="isPlatformAdmin" label="用户组" :minWidth="130"><template #default="{ row }">{{ groupName(row.customerId) }}</template></el-table-column><el-table-column label="角色" :minWidth="110"><template #default="{ row }">{{ roleLabels[row.role as PlatformRole] }}</template></el-table-column><el-table-column label="状态" :minWidth="100"><template #default="{ row }"><el-tag :type="row.enabled ? 'success' : 'info'">{{ row.enabled ? '已启用' : row.disabledBy === 'platformAdmin' ? '平台禁用' : '已禁用' }}</el-tag></template></el-table-column><el-table-column label="操作" :width="isPlatformAdmin ? 410 : 300" fixed="right"><template #default="{ row }"><div class="accountActions"><el-button text @click="detail = row as ManagedAccount">详情</el-button><el-button text @click="openReset(row as ManagedAccount)">重置密码</el-button><el-button text :type="row.enabled ? 'danger' : 'primary'" @click="toggleAccount(row as ManagedAccount)">{{ row.enabled ? '禁用' : '启用' }}</el-button><el-button v-if="isPlatformAdmin" text @click="toggleRole(row as ManagedAccount)">{{ row.role === 'customerAdmin' ? '撤销管理员' : '任命管理员' }}</el-button><el-button text type="danger" :disabled="busy" @click="deleteAccount(row as ManagedAccount)">删除</el-button></div></template></el-table-column></el-table>
    <el-dialog v-model="editor" title="创建普通账号" width="min(480px, 94vw)" :closeOnClickModal="false" :beforeClose="closeEditor">
      <form class="accountForm" @submit.prevent="submit"><template v-if="isPlatformAdmin"><label>用户组</label><el-select v-model="createGroup" aria-label="所属用户组"><el-option v-for="group in platformState.customers.filter(item => item.enabled !== false)" :key="group.id" :label="group.name" :value="group.id" /></el-select></template><label for="managedUsername">账号</label><el-input id="managedUsername" v-model="username" :maxlength="64" autocomplete="off" /><label for="managedName">姓名</label><el-input id="managedName" v-model="name" :maxlength="64" /><p>初始密码统一为123456，用户首次登录必须修改密码。</p><p v-if="failure" class="failure" role="alert">{{ failure }}</p><el-button type="primary" nativeType="submit" :loading="busy">创建账号</el-button></form>
    </el-dialog>
    <el-dialog :modelValue="!!detail" title="账号详情" width="min(520px, 94vw)" @update:modelValue="detail = undefined"><dl v-if="detail"><dt>账号</dt><dd>{{ detail.username }}</dd><dt>角色</dt><dd>{{ roleLabels[detail.role] }}</dd><dt>状态</dt><dd>{{ detail.enabled ? '已启用' : '已禁用' }}</dd><dt>项目数</dt><dd>{{ detail.projects }}</dd><dt>资产数</dt><dd>{{ detail.assets }}</dd><dt>存储用量</dt><dd>{{ detail.storage }}</dd></dl><p>账号管理权限不包含打开、预览或下载此账号的私人内容。</p></el-dialog>
  </section>
</template>
<script setup lang="ts">
import { computed, h, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { ElMessage, ElMessageBox } from "element-plus";
import { platformState, savePlatform, isPlatformAdmin } from "@/stores/platform";
import { roleLabels, type ManagedAccount, type PlatformRole } from "@/ports/platform";
const props = defineProps<{ customerId: string }>();
const route = useRoute(), router = useRouter();
const groupFilter = ref(props.customerId), roleFilter = ref(""), appliedSearch = ref(""), createGroup = ref(""), page = ref(1), pageSize = ref(20);
watch(groupFilter, value => { if (isPlatformAdmin.value && route.path === "/admin" && route.query.customerId !== (value || undefined)) void router.replace({ path: "/admin", query: { ...route.query, customerId: value || undefined } }); });
watch(() => props.customerId, value => { groupFilter.value = value; page.value = 1; });
function groupName(id: string) { return platformState.value.customers.find(item => item.id === id)?.name || ""; }
function query() { appliedSearch.value = search.value.trim(); page.value = 1; }
function resetFilters() { search.value = ""; appliedSearch.value = ""; groupFilter.value = ""; roleFilter.value = ""; status.value = "all"; page.value = 1; }
const search = ref(""), status = ref("all"), editor = ref(false), username = ref(""), name = ref(""), failure = ref(""), busy = ref(false);
const detail = ref<ManagedAccount>();
const filtered = computed(() => platformState.value.accounts.filter(item => (isPlatformAdmin.value ? !groupFilter.value || item.customerId === groupFilter.value : item.customerId === props.customerId && item.role === "user") && (!roleFilter.value || item.role === roleFilter.value) && `${item.username} ${item.name}`.includes(appliedSearch.value) && (status.value === "all" || item.enabled === (status.value === "enabled"))));
const pagedAccounts = computed(() => filtered.value.slice((page.value - 1) * pageSize.value, page.value * pageSize.value));
watch([groupFilter, roleFilter, status, pageSize], () => { page.value = 1; });
watch(() => filtered.value.length, length => { page.value = Math.min(page.value, Math.max(1, Math.ceil(length / pageSize.value))); });
function openCreate() { username.value = ""; name.value = ""; createGroup.value = isPlatformAdmin.value ? groupFilter.value : props.customerId; failure.value = ""; editor.value = true; }
async function openReset(item: ManagedAccount) {
  if (busy.value) return;
  const confirmed = await ElMessageBox.confirm(`将 ${item.username} 的密码重置为123456，下次登录必须修改密码。`, "重置密码", { type: "warning", confirmButtonText: "确认重置", cancelButtonText: "取消" }).then(() => true, () => false);
  if (!confirmed) return;
  busy.value = true;
  try { await savePlatform({ type: "resetPassword", id: item.id, password: "123456" }); ElMessage.success("密码已重置为123456，下次登录须修改"); }
  catch (cause) { ElMessage.error(cause instanceof Error ? cause.message : "重置失败"); } finally { busy.value = false; }
}
function closeEditor(done: () => void) { if (!busy.value) done(); }
async function submit() {
  if (busy.value) return; busy.value = true; failure.value = "";
  try {
    const customerId = isPlatformAdmin.value ? createGroup.value : props.customerId;
    if (!customerId) throw new Error("请选择用户组");
    await savePlatform({ type: "account", value: { username: username.value.trim(), name: name.value.trim(), customerId }, password: "123456" });
    editor.value = false; ElMessage.success("账号已创建，首次登录须修改密码");
  } catch (cause) { failure.value = cause instanceof Error ? cause.message : "保存失败"; } finally { busy.value = false; }
}
async function toggleAccount(item: ManagedAccount) {
  if (!item.enabled && !isPlatformAdmin.value && item.disabledBy === "platformAdmin") { ElMessage.warning("平台管理员禁用该账号"); return; }
  if (!item.enabled && platformState.value.customers.some(customer => customer.id === item.customerId && customer.enabled === false)) { ElMessage.warning("所属客户已被平台管理员禁用"); return; }
  const confirmed = await ElMessageBox.confirm(item.enabled ? "禁用后已有登录将失效，项目、资产及归属保留。" : "启用后可继续访问原有个人内容。", `${item.enabled ? '禁用' : '启用'} ${item.username}？`, { type: "warning", confirmButtonText: "确认", cancelButtonText: "取消" }).then(() => true, () => false);
  if (!confirmed) return;
  try { await savePlatform({ type: "accountStatus", id: item.id, enabled: !item.enabled }); } catch (cause) { ElMessage.error(cause instanceof Error ? cause.message : "操作失败"); }
}
async function deleteAccount(item: ManagedAccount) {
  if (busy.value) return;
  if (!isPlatformAdmin.value && item.disabledBy === "platformAdmin") { ElMessage.warning("该账号已被平台管理员禁用，请联系平台管理员处理"); return; }
  const result = await ElMessageBox.prompt(h("div", [h("p", "删除后，该账号将无法登录。"), h("p", "请输入账号名确认删除。")]), "删除账号", {
    inputPlaceholder: "输入完整账号名",
    inputValidator: value => value === item.username || "账号名不匹配", confirmButtonText: "确认删除", cancelButtonText: "取消", type: "warning",
    beforeClose: async (action, instance, done) => {
      if (busy.value) return;
      if (action !== "confirm") { done(); return; }
      busy.value = true; instance.confirmButtonLoading = true;
      try { await savePlatform({ type: "deleteAccount", id: item.id }); done(); }
      catch (cause) { ElMessage.error(cause instanceof Error ? cause.message : "删除失败"); }
      finally { busy.value = false; instance.confirmButtonLoading = false; }
    },
  }).catch(() => undefined);
  if (result) ElMessage.success("账号已删除，历史内容保留");
}
async function toggleRole(item: ManagedAccount) {
  const role = item.role === "customerAdmin" ? "user" : "customerAdmin";
  const confirmed = await ElMessageBox.confirm(role === "customerAdmin" ? "该账号将可管理本客户普通账号，私人内容仍按个人隔离。" : "撤销后保留普通用户创作能力及个人内容。", "调整客户管理员", { confirmButtonText: "确认", cancelButtonText: "取消" }).then(() => true, () => false);
  if (confirmed) try { await savePlatform({ type: "accountRole", id: item.id, role }); } catch (cause) { ElMessage.error(cause instanceof Error ? cause.message : "操作失败"); }
}
</script>
<style scoped lang="scss">
.deleteAction { color:var(--el-color-danger); }
.customerAccounts { .accountHelp { margin:12px 0; color:var(--el-text-color-secondary); font-size:13px; line-height:1.6; } .pagination { display:flex; justify-content:flex-end; margin:16px 0; overflow-x:auto; } .accountActions { display:flex; gap:8px; white-space:nowrap; .el-button { margin:0; padding:6px; font-size:13px; flex:none; } } header { .el-button { margin-left:auto; } display:flex; justify-content:space-between; gap:16px; align-items:center; h2 { margin:0; font-size:20px; } p { color:var(--el-text-color-secondary); font-size:14px; } } .filters { display:flex; flex-wrap:wrap; gap:12px; margin:20px 0; .el-input { max-width:320px; } .el-select { width:160px; } } small { display:block; color:var(--el-text-color-secondary); } dl { display:grid; grid-template-columns:100px 1fr; gap:16px; dd { margin:0; } } .accountForm { display:grid; gap:12px; p { color:var(--el-text-color-secondary); line-height:1.6; } .failure { color:var(--el-color-danger); } } }
</style>
