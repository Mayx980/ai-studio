<template>
  <section class="customerAccounts">
    <div class="filters"><el-input v-model="search" placeholder="搜索账号名或姓名" aria-label="搜索账号名或姓名" clearable @keyup.enter="query" /><el-button @click="query">查询</el-button><el-select v-model="groupFilter" clearable placeholder="全部用户组" aria-label="用户组筛选"><el-option v-for="group in platformState.customers" :key="group.id" :label="group.name" :value="group.id" /></el-select><el-select v-model="status" aria-label="状态筛选"><el-option label="全部状态" value="all" /><el-option label="已启用" value="enabled" /><el-option label="已禁用" value="disabled" /></el-select><el-button @click="resetFilters">重置</el-button><el-button class="createAccount" type="primary" @click="openCreate">创建账号</el-button></div>
    <el-table :data="pagedAccounts" emptyText="暂无符合条件的账号" height="calc(100dvh - 220px)"><el-table-column type="index" label="序号" :index="(index: number) => (page - 1) * pageSize + index + 1" :width="70" /><el-table-column prop="username" label="账号名" :minWidth="130" /><el-table-column prop="name" label="姓名" :minWidth="120" /><el-table-column label="用户组" :minWidth="130"><template #default="{ row }">{{ groupName(row.customerId) }}</template></el-table-column><el-table-column label="状态" :minWidth="100"><template #default="{ row }"><el-tag :type="row.enabled ? 'success' : 'info'">{{ row.enabled ? '已启用' : '已禁用' }}</el-tag></template></el-table-column><el-table-column label="操作" :width="300" fixed="right"><template #default="{ row }"><div class="accountActions"><el-button text @click="openDetail(row as ManagedAccount)">编辑</el-button><el-button text @click="openReset(row as ManagedAccount)">重置密码</el-button><el-button text :type="row.enabled ? 'danger' : 'primary'" @click="toggleAccount(row as ManagedAccount)">{{ row.enabled ? '禁用' : '启用' }}</el-button><el-button text type="danger" :disabled="busy" @click="deleteAccount(row as ManagedAccount)">删除</el-button></div></template></el-table-column></el-table>
    <div class="pagination"><el-pagination v-model:currentPage="page" v-model:pageSize="pageSize" :pageSizes="[10,20,50]" :total="filtered.length" layout="total, sizes, prev, pager, next" /></div>
    <el-drawer v-model="editor" :title="detail ? '账号详情' : '创建账号'" size="min(480px, 100vw)" appendToBody :closeOnClickModal="false" :closeOnPressEscape="!busy" :showClose="!busy" :beforeClose="closeEditor">
      <form class="accountForm" @submit.prevent="submit"><label for="managedUsername">账号名</label><el-input id="managedUsername" v-model="username" :maxlength="64" :disabled="busy" autocomplete="off" /><label for="managedName">姓名</label><el-input id="managedName" v-model="name" :maxlength="64" :disabled="busy" /><label>用户组</label><el-select v-model="createGroup" :disabled="busy" aria-label="所属用户组"><el-option v-for="group in platformState.customers" :key="group.id" :label="group.name" :value="group.id" :disabled="group.enabled === false && group.id !== detail?.customerId" /></el-select><dl v-if="detail"><dt>状态</dt><dd>{{ detail.enabled ? '已启用' : '已禁用' }}</dd><dt>项目数</dt><dd>{{ detail.projects }}</dd><dt>资产数</dt><dd>{{ detail.assets }}</dd><dt>存储用量</dt><dd>{{ detail.storage }}</dd></dl><p v-else>初始密码统一为123456，首次登录必须修改密码。</p><p v-if="failure" class="failure" role="alert">{{ failure }}</p></form>
      <template #footer><el-button :disabled="busy" @click="cancelEditor">取消</el-button><el-button type="primary" :loading="busy" @click="submit">确定</el-button></template>
    </el-drawer>
  </section>
</template>
<script setup lang="ts">
import { computed, h, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { ElMessage, ElMessageBox } from "element-plus";
import { platformState, savePlatform } from "@/stores/platform";
import { type ManagedAccount } from "@/ports/platform";
const props = defineProps<{ customerId: string }>();
const route = useRoute(), router = useRouter();
const groupFilter = ref(props.customerId), appliedSearch = ref(""), createGroup = ref(""), page = ref(1), pageSize = ref(20);
watch(groupFilter, value => { if (route.path === "/admin" && route.query.customerId !== (value || undefined)) void router.replace({ path: "/admin", query: { ...route.query, customerId: value || undefined } }); });
watch(() => props.customerId, value => { groupFilter.value = value; page.value = 1; });
function groupName(id: string) { return platformState.value.customers.find(item => item.id === id)?.name || ""; }
function query() { appliedSearch.value = search.value.trim(); page.value = 1; }
function resetFilters() { search.value = ""; appliedSearch.value = ""; groupFilter.value = ""; status.value = "all"; page.value = 1; }
const search = ref(""), status = ref("all"), editor = ref(false), username = ref(""), name = ref(""), failure = ref(""), busy = ref(false);
const detail = ref<ManagedAccount>();
let initialDraft = "";
function draftSnapshot() { return JSON.stringify([username.value, name.value, createGroup.value]); }
function openDetail(item: ManagedAccount) { detail.value = { ...item }; username.value = item.username; name.value = item.name; createGroup.value = item.customerId; failure.value = ""; initialDraft = draftSnapshot(); editor.value = true; }
const filtered = computed(() => platformState.value.accounts.filter(item => (!groupFilter.value || item.customerId === groupFilter.value) && `${item.username} ${item.name}`.includes(appliedSearch.value) && (status.value === "all" || item.enabled === (status.value === "enabled"))));
const pagedAccounts = computed(() => filtered.value.slice((page.value - 1) * pageSize.value, page.value * pageSize.value));
watch([groupFilter, status, pageSize], () => { page.value = 1; });
watch(() => filtered.value.length, length => { page.value = Math.min(page.value, Math.max(1, Math.ceil(length / pageSize.value))); });
function openCreate() { detail.value = undefined; username.value = ""; name.value = ""; createGroup.value = groupFilter.value; failure.value = ""; initialDraft = draftSnapshot(); editor.value = true; }
async function openReset(item: ManagedAccount) {
  if (busy.value) return;
  const confirmed = await ElMessageBox.confirm(`将 ${item.username} 的密码重置为123456，下次登录必须修改密码。`, "重置密码", { type: "warning", confirmButtonText: "确认重置", cancelButtonText: "取消" }).then(() => true, () => false);
  if (!confirmed) return;
  busy.value = true;
  try { await savePlatform({ type: "resetPassword", id: item.id, password: "123456" }); ElMessage.success("密码已重置为123456，下次登录须修改"); }
  catch (cause) { ElMessage.error(cause instanceof Error ? cause.message : "重置失败"); } finally { busy.value = false; }
}
async function closeEditor(done: () => void) {
  if (busy.value) return;
  if (draftSnapshot() !== initialDraft && !await ElMessageBox.confirm("尚未保存的修改将被清空。", "放弃修改？", { confirmButtonText: "放弃修改", cancelButtonText: "继续编辑" }).then(() => true, () => false)) return;
  done();
}
function cancelEditor() { void closeEditor(() => { editor.value = false; }); }
async function submit() {
  if (busy.value) return;
  failure.value = "";
  const customerId = createGroup.value;
  if (!username.value.trim() || !name.value.trim()) { failure.value = "请填写账号和姓名"; return; }
  if (!customerId) { failure.value = "请选择用户组"; return; }
  busy.value = true;
  try {
    if (detail.value && customerId !== detail.value.customerId) {
      const confirmed = await ElMessageBox.confirm(`保存后，用户组为“${groupName(customerId)}”。个人内容随账号保留。`, "确认用户组", { confirmButtonText: "确定", cancelButtonText: "返回编辑" }).then(() => true, () => false);
      if (!confirmed) return;
    }
    if (detail.value) await savePlatform({ type: "updateAccount", id: detail.value.id, value: { username: username.value.trim(), name: name.value.trim(), customerId } });
    else await savePlatform({ type: "account", value: { username: username.value.trim(), name: name.value.trim(), customerId }, password: "123456" });
    editor.value = false; ElMessage.success(detail.value ? "账号信息已保存" : "账号已创建，首次登录须修改密码");
  } catch (cause) { failure.value = cause instanceof Error ? cause.message : "保存失败"; } finally { busy.value = false; }
}
async function toggleAccount(item: ManagedAccount) {
  if (!item.enabled && platformState.value.customers.some(customer => customer.id === item.customerId && customer.enabled === false)) { ElMessage.warning("所属客户已被平台管理员禁用"); return; }
  const confirmed = await ElMessageBox.confirm(item.enabled ? "禁用后已有登录将失效，项目、资产及归属保留。" : "启用后可继续访问原有个人内容。", item.enabled ? "禁用" : `启用 ${item.username}？`, { type: "warning", confirmButtonText: "确认", cancelButtonText: "取消" }).then(() => true, () => false);
  if (!confirmed) return;
  try { await savePlatform({ type: "accountStatus", id: item.id, enabled: !item.enabled }); } catch (cause) { ElMessage.error(cause instanceof Error ? cause.message : "操作失败"); }
}
async function deleteAccount(item: ManagedAccount) {
  if (busy.value) return;
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
</script>
<style scoped lang="scss">
.customerAccounts {
  .filters { position:sticky; top:0; z-index:5; display:flex; flex-wrap:wrap; align-items:center; gap:12px; padding:12px 0; margin-bottom:12px; background:var(--el-bg-color-page); border-bottom:1px solid var(--el-border-color); > .el-input { width:220px; } > .el-select { width:150px; } .el-button { margin:0; height:32px; } .createAccount { margin-left:auto; } }
  .pagination { display:flex; justify-content:flex-end; margin:16px 0; overflow-x:auto; }
  .accountActions { display:flex; gap:8px; white-space:nowrap; .el-button { margin:0; padding:6px; font-size:13px; flex:none; } }
}
.accountForm { display:grid; gap:12px; label { font-size:14px; } p { color:var(--el-text-color-secondary); line-height:1.6; } .failure { color:var(--el-color-danger); } dl { display:grid; grid-template-columns:100px 1fr; gap:16px; dd { margin:0; } } }
</style>
