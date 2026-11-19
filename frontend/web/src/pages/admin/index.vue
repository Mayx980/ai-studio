<template>
  <main class="adminPage">
    <aside class="adminSidebar"><brandLogo /><span class="endLabel">平台端</span><nav><button v-for="item in sections" :key="item.id" :aria-current="section === item.id ? 'page' : undefined" @click="section = item.id"><component :is="item.icon" :size="20" />{{ item.label }}</button></nav><accountMenu /></aside>
    <section class="adminContent">
      <el-alert v-if="platformError" :title="platformError" type="error" :closable="false"><el-button @click="loadPlatform">重试</el-button></el-alert><p v-if="platformLoading" role="status">正在读取…</p>
      <template v-else-if="!platformError">
        <template v-if="section === 'customers'"><div class="sectionToolbar"><el-input v-model="customerSearch" placeholder="搜索客户名称" aria-label="搜索客户名称" clearable @keyup.enter="queryCustomers" /><el-button @click="queryCustomers">查询</el-button><el-button class="createGroup" type="primary" @click="openCustomer()">创建用户组</el-button></div>

          <el-table :data="pagedCustomers" emptyText="暂无用户组" height="calc(100dvh - 220px)"><el-table-column type="index" label="序号" :index="(index: number) => (customerPage - 1) * customerPageSize + index + 1" :width="70" /><el-table-column prop="name" label="客户名称" :minWidth="160" /><el-table-column label="状态" :minWidth="100"><template #default="{ row }"><el-tag :type="row.enabled === false ? 'info' : 'success'">{{ row.enabled === false ? '已禁用' : '已启用' }}</el-tag></template></el-table-column><el-table-column label="操作" :width="280" fixed="right"><template #default="{ row }"><div class="customerActions"><el-button text @click="openAccounts(row.id)">账号管理</el-button><el-button text @click="openCustomer(row as Customer)">编辑</el-button><el-button text :type="row.enabled === false ? 'primary' : 'danger'" :disabled="busy" @click="toggleCustomer(row as Customer)">{{ row.enabled === false ? '启用' : '禁用' }}</el-button><el-button text type="danger" :disabled="busy" @click="deleteCustomer(row as Customer)">删除</el-button></div></template></el-table-column></el-table><div class="pagination"><el-pagination v-model:currentPage="customerPage" v-model:pageSize="customerPageSize" :pageSizes="[10,20,50]" :total="filteredCustomers.length" layout="total, sizes, prev, pager, next" aria-label="用户组分页" /></div>
        </template>
        <customerAccounts v-if="section === 'accounts'" :customerId="String(route.query.customerId || '')" />
        <template v-if="section === 'usage'"><div class="usageFilters"><el-select v-model="usageCustomer" clearable placeholder="全部客户" aria-label="统计客户"><el-option v-for="item in state.customers" :key="item.id" :label="item.name" :value="item.id" /></el-select><el-select v-model="usageAccount" clearable placeholder="全部账号" aria-label="统计账号"><el-option v-for="item in usageAccounts" :key="item.id" :label="item.name" :value="item.id" /></el-select><el-select v-model="usageModel" clearable placeholder="全部模型" aria-label="统计模型"><el-option v-for="item in state.models" :key="item.id" :label="item.name" :value="item.id" /></el-select><el-date-picker v-model="usageDates" type="daterange" startPlaceholder="开始日期" endPlaceholder="结束日期" /></div><div class="usageSummary"><article v-for="status in ['all', 'completed', 'failed', 'running']" :key="status"><span>{{ status === 'all' ? '任务总数' : status === 'running' ? '处理中' : taskLabels[status as PlatformTask['status']] }}</span><strong>{{ usageTasks.filter(item => status === 'all' || (status === 'running' ? ['waiting','running','saving','unknown'].includes(item.status) : item.status === status)).length }}</strong></article></div><p>按实际单位分别记录；未返回用量不计作零。本期不收费，不展示私人提示词或生成结果。</p><el-table :data="usageTasks" emptyText="暂无用量记录" height="calc(100dvh - 350px)"><el-table-column prop="modelId" label="模型" /><el-table-column label="状态"><template #default="{ row }">{{ taskLabels[row.status as PlatformTask['status']] }}</template></el-table-column><el-table-column prop="elapsed" label="耗时" /><el-table-column prop="usage" label="实际用量及单位" /><el-table-column label="时间"><template #default="{ row }">{{ formatDate(row.createdAt) }}</template></el-table-column></el-table></template>
      </template>
    </section>
    <el-drawer v-model="customerVisible" title="用户组" size="min(480px, 100vw)" appendToBody :closeOnClickModal="false" :closeOnPressEscape="!busy" :showClose="!busy" :beforeClose="closeCustomer"><el-form v-if="customerDraft" labelPosition="top"><el-form-item label="客户名称" required><el-input v-model="customerDraft.name" :maxlength="100" /></el-form-item></el-form><p v-if="dialogError" role="alert" class="failure">{{ dialogError }}</p><template #footer><el-button :disabled="busy" @click="cancelCustomer">取消</el-button><el-button type="primary" :loading="busy" @click="saveCustomer">确定</el-button></template></el-drawer>

  </main>
</template>
<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { ElMessage, ElMessageBox } from "element-plus";
import { IconUsers, IconUser, IconChartBar } from "@tabler/icons-vue";
import brandLogo from "@/components/brandLogo.vue";
import accountMenu from "@/components/accountMenu.vue";
import customerAccounts from "@/components/customerAccounts.vue";
import { platformState as state, loadPlatform, platformError, platformLoading, savePlatform } from "@/stores/platform";
import { platform, taskLabels, type Customer, type PlatformCommand, type PlatformTask } from "@/ports/platform";
const route = useRoute(), router = useRouter();
const sections = [{ id: "customers", label: "用户组管理", icon: IconUsers }, { id: "accounts", label: "账号管理", icon: IconUser }, { id: "usage", label: "使用统计", icon: IconChartBar }];
const section = computed({ get: () => sections.some(item => item.id === route.query.section) ? String(route.query.section) : "customers", set: value => { void router.push({ path: "/admin", query: { section: value } }); } });
function openAccounts(customerId: string) { void router.push({ path: "/admin", query: { section: "accounts", customerId } }); }
const customerSearch = ref(""), appliedCustomerSearch = ref("");
function queryCustomers() { appliedCustomerSearch.value = customerSearch.value.trim(); customerPage.value = 1; }
const filteredCustomers = computed(() => state.value.customers.filter(item => item.name.includes(appliedCustomerSearch.value)));
const customerPage = ref(1), customerPageSize = ref(20);
const pagedCustomers = computed(() => filteredCustomers.value.slice((customerPage.value - 1) * customerPageSize.value, customerPage.value * customerPageSize.value));

watch([appliedCustomerSearch, customerPageSize], () => { customerPage.value = 1; });
watch(() => filteredCustomers.value.length, length => { customerPage.value = Math.min(customerPage.value, Math.max(1, Math.ceil(length / customerPageSize.value))); });

const busy = ref(false), dialogError = ref("");
const customerVisible = ref(false), customerDraft = ref<Customer>();
let initialCustomerName = "";
async function closeCustomer(done: () => void) { if (busy.value) return; if (customerDraft.value?.name !== initialCustomerName && !await ElMessageBox.confirm("尚未保存的修改将被清空。", "放弃修改？", { confirmButtonText: "放弃修改", cancelButtonText: "继续编辑" }).then(() => true, () => false)) return; done(); }
function cancelCustomer() { void closeCustomer(() => { customerVisible.value = false; }); }
const usageCustomer = ref(""), usageAccount = ref(""), usageModel = ref(""), usageDates = ref<[Date, Date]>();
const usageAccounts = computed(() => state.value.accounts.filter(item => !usageCustomer.value || item.customerId === usageCustomer.value));
watch(usageCustomer, () => { usageAccount.value = ""; });
const usageTasks = computed(() => state.value.tasks.filter(item => (!usageCustomer.value || item.customerId === usageCustomer.value) && (!usageAccount.value || item.accountId === usageAccount.value) && (!usageModel.value || item.modelId === usageModel.value) && (!usageDates.value || new Date(item.createdAt) >= usageDates.value[0] && new Date(item.createdAt).getTime() < usageDates.value[1].getTime() + 86400000)));
function formatDate(value: string) { return new Date(value).toLocaleString(); }
function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)); }
function openCustomer(value?: Customer) { customerDraft.value = value ? clone(value) : { id: crypto.randomUUID(), name: "", modelIds: state.value.models.filter(item => item.enabled && item.verified).map(item => item.id), defaults: {} }; initialCustomerName = customerDraft.value.name; dialogError.value = ""; customerVisible.value = true; }

async function perform(command: PlatformCommand, close?: () => void) {
  if (busy.value) return; busy.value = true; dialogError.value = "";
  try { await savePlatform(command); close?.(); ElMessage.success(platform.scope === "scenario" ? "演示状态已更新，未写入真实服务" : "操作成功"); }
  catch (cause) { dialogError.value = cause instanceof Error ? cause.message : "保存失败"; ElMessage.error(dialogError.value); }
  finally { busy.value = false; }
}
async function saveCustomer() { if (customerDraft.value) await perform({ type: "customer", value: clone(customerDraft.value) }, () => { customerVisible.value = false; }); }
async function toggleCustomer(customer: Customer) {
  const enabled = customer.enabled === false;
  const confirmed = await ElMessageBox.confirm(enabled ? "解除用户组限制，单独禁用的账号仍保持禁用。" : "该用户组全部账号将暂停登录和提交新任务，已有内容保留。", `${enabled ? "启用" : "禁用"} ${customer.name}？`, { confirmButtonText: "确认", cancelButtonText: "取消", type: "warning" }).then(() => true, () => false);
  if (confirmed) await perform({ type: "customerStatus", id: customer.id, enabled });
}
async function deleteCustomer(customer: Customer) {
  if (state.value.accounts.some(item => item.customerId === customer.id)) { ElMessage.warning("用户组下仍有账号，请先处理账号后再删除用户组"); return; }
  const result = await ElMessageBox.prompt("请输入客户名称确认删除，历史内容与归属保留。", "删除用户组", { inputValidator: value => value === customer.name || "客户名称不匹配", confirmButtonText: "删除", cancelButtonText: "取消", type: "warning" }).catch(() => undefined);
  if (result) await perform({ type: "deleteCustomer", id: customer.id });
}
onMounted(loadPlatform);
</script>
<style scoped lang="scss">
.adminPage { min-height:100dvh; background:#131416; color:var(--el-text-color-primary);
  .adminSidebar { position:fixed; inset:0 auto 0 0; width:232px; padding:28px 16px 16px; background:#191a1d; display:flex; flex-direction:column; gap:20px; box-sizing:border-box; :deep(.brandLogo) { max-width:152px; } .endLabel { font-size:12px; color:var(--el-text-color-secondary); padding-left:12px; } nav { display:grid; gap:4px; flex:1; align-content:start; button { display:flex; align-items:center; gap:12px; border:0; border-radius:8px; padding:12px; background:transparent; color:#b3b8c3; text-align:left; font:inherit; cursor:pointer; &:hover { background:#24262c; } &[aria-current] { color:#c4b6ff; background:#2b2739; } } } }
  .adminContent { margin-left:232px; padding:24px 32px; .sectionToolbar, .usageFilters { position:sticky; top:0; z-index:5; display:flex; flex-wrap:wrap; align-items:center; gap:12px; padding:12px 0; margin-bottom:12px; background:#131416; border-bottom:1px solid var(--el-border-color); > .el-input { width:240px; } > .el-select { width:160px; } .el-button { height:32px; margin:0; } .createGroup { margin-left:auto; } }
    .customerActions { display:flex; gap:8px; white-space:nowrap; .el-button { flex:none; margin:0; padding:6px; font-size:13px; } }
    .pagination { display:flex; justify-content:flex-end; margin:16px 0; overflow-x:auto; }
    .usageSummary { display:grid; grid-template-columns:repeat(4,1fr); gap:16px; margin:20px 0; article { padding:20px; background:#1c1e23; border-radius:12px; span { color:#a7afbd; } strong { display:block; margin-top:12px; font-size:28px; } } }
    p { color:var(--el-text-color-secondary); line-height:1.7; }
  }
  @media(max-width:800px) { .adminSidebar { width:176px; padding:16px 8px; } .adminContent { margin-left:176px; padding:16px 12px; .usageSummary { grid-template-columns:repeat(2,1fr); } } }
}
.failure { color:var(--el-color-danger); }
</style>
