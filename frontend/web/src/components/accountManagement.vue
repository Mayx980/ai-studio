<template>
  <el-dialog v-model="visible" :title="kind === 'password' ? '修改密码' : '账号管理'" width="min(760px, 94vw)" :beforeClose="beforeClose" :closeOnClickModal="false" :closeOnPressEscape="!busy" :showClose="!busy" destroyOnClose>
    <section class="accountManagement" :aria-busy="busy || loading">
      <p v-if="failure" class="failure" role="alert">{{ failure }}</p>
      <form v-if="kind === 'password'" @submit.prevent="changePassword">
        <label for="accountPreviousPassword">当前密码</label>
        <el-input id="accountPreviousPassword" v-model="previousPassword" type="password" autocomplete="current-password" showPassword :maxlength="128" />
        <label for="accountNewPassword">新密码（15–128字符）</label>
        <el-input id="accountNewPassword" v-model="password" type="password" autocomplete="new-password" showPassword :maxlength="128" />
        <label for="accountPasswordConfirmation">再次输入新密码</label>
        <el-input id="accountPasswordConfirmation" v-model="confirmation" type="password" autocomplete="new-password" showPassword :maxlength="128" />
        <el-button nativeType="submit" type="primary" :loading="busy">修改并重新登录</el-button>
      </form>
      <template v-else>
        <div class="toolbar"><el-button type="primary" :disabled="busy || loading" @click="startCreate">创建普通账号</el-button><el-button :loading="loading" :disabled="busy" @click="load">刷新列表</el-button></div>
        <p v-if="loading" role="status">正在读取账号…</p>
        <div v-else class="accountList">
          <article v-for="row in rows" :key="row.id" class="accountRow">
            <div><strong>{{ row.name }}</strong><span>{{ row.username }} · {{ row.role === 'admin' ? '管理员' : '普通用户' }} · {{ row.enabled ? '启用' : '停用' }}</span></div>
            <div class="rowActions"><el-button text :disabled="busy" @click="startReset(row)">重置密码</el-button><el-button text :disabled="busy || row.role === 'admin'" :title="row.role === 'admin' ? '保留初始管理员账号' : undefined" @click="toggle(row)">{{ row.enabled ? '停用' : '启用' }}</el-button></div>
          </article>
        </div>
        <form v-if="editing" @submit.prevent="saveAccount">
          <h3>{{ resetting ? `重置密码：${resetting.name}` : '创建普通账号' }}</h3>
          <template v-if="!resetting">
            <label for="managedUsername">用户名（3–64位字母、数字或点）</label>
            <el-input id="managedUsername" v-model="username" autocomplete="off" :maxlength="64" />
            <label for="managedName">显示名称</label>
            <el-input id="managedName" v-model="name" autocomplete="off" :maxlength="80" />
          </template>
          <label for="managedPassword">初始密码（15–128字符，首次登录须修改）</label>
          <el-input id="managedPassword" v-model="password" type="password" autocomplete="new-password" showPassword :maxlength="128" />
          <label for="managedConfirmation">再次输入初始密码</label>
          <el-input id="managedConfirmation" v-model="confirmation" type="password" autocomplete="new-password" showPassword :maxlength="128" />
          <div><el-button :disabled="busy" @click="cancelEdit">取消</el-button><el-button type="primary" nativeType="submit" :loading="busy">{{ resetting ? '重置密码' : '创建账号' }}</el-button></div>
        </form>
      </template>
    </section>
  </el-dialog>
</template>
<script setup lang="ts">
import { ref, watch } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import { accounts, type UserAccount } from "@/ports/accounts";
import { isAdministrator, notifyPasswordChanged } from "@/stores/accounts";
const visible = defineModel<boolean>({ default: false });
const props = defineProps<{ kind: "manage" | "password" }>();
const rows = ref<UserAccount[]>([]), loading = ref(false), busy = ref(false), failure = ref("");
const editing = ref(false), resetting = ref<UserAccount>();
const username = ref(""), name = ref(""), password = ref(""), confirmation = ref(""), previousPassword = ref("");
let sequence = 0;
const dirty = () => !!(username.value || name.value || password.value || confirmation.value || previousPassword.value);
function reset() { username.value = ""; name.value = ""; password.value = ""; confirmation.value = ""; previousPassword.value = ""; editing.value = false; resetting.value = undefined; }
async function discard() {
  if (!dirty()) return true;
  return ElMessageBox.confirm("尚未提交的账号信息或密码将被清空。", "放弃本次修改？", { confirmButtonText: "放弃修改", cancelButtonText: "继续编辑", type: "warning" }).then(() => true, () => false);
}
async function beforeClose(done: () => void) { if (!busy.value && await discard()) done(); }
async function cancelEdit() { if (!busy.value && await discard()) reset(); }
async function startCreate() { if (busy.value || !isAdministrator.value || !await discard()) return; reset(); editing.value = true; }
async function startReset(row: UserAccount) { if (busy.value || !isAdministrator.value || !await discard()) return; reset(); resetting.value = row; editing.value = true; }
async function load() {
  if (!visible.value || !isAdministrator.value || loading.value) return;
  const current = ++sequence;
  loading.value = true;
  failure.value = "";
  try { const result = await accounts.list(); if (visible.value && current === sequence) rows.value = result; }
  catch (cause) { if (current === sequence) failure.value = cause instanceof Error ? cause.message : "读取账号失败，请重试"; }
  finally { if (current === sequence) loading.value = false; }
}
function validatePassword() {
  if (password.value.length < 15 || password.value.length > 128) throw new Error("密码须为15–128字符");
  if (password.value !== confirmation.value) throw new Error("两次密码不一致");
}
async function run(operation: () => Promise<void>) {
  if (busy.value) return;
  busy.value = true; failure.value = "";
  try { await operation(); }
  catch (cause) { if (cause !== "cancel" && cause !== "close") failure.value = cause instanceof Error ? cause.message : "操作失败，请重试"; }
  finally { busy.value = false; }
}
async function saveAccount() {
  if (!isAdministrator.value) return;
  await run(async () => {
    validatePassword();
    if (resetting.value) {
      const row = resetting.value;
      await ElMessageBox.confirm(`将重置“${row.name}”的密码并撤销其全部登录会话。`, "重置账号密码", { confirmButtonText: "重置密码", cancelButtonText: "取消", type: "warning" });
      await accounts.resetPassword(row.id, password.value);
      row.mustChangePassword = true;
      reset(); ElMessage.success("密码已重置");
    } else {
      if (!/^[a-zA-Z0-9][a-zA-Z0-9.]{2,63}$/.test(username.value) || !name.value.trim()) throw new Error("请填写有效的用户名和显示名称");
      await accounts.create({ username: username.value, name: name.value.trim(), password: password.value });
      reset(); ElMessage.success("账号已创建");
      await load();
    }
  });
}
async function toggle(row: UserAccount) {
  if (!isAdministrator.value || row.role === "admin") return;
  await run(async () => {
    await ElMessageBox.confirm(`将${row.enabled ? '停用' : '启用'}“${row.name}”，其原登录会话将失效。`, "修改账号状态", { confirmButtonText: row.enabled ? "停用账号" : "启用账号", cancelButtonText: "取消", type: "warning" });
    await accounts.update(row.id, !row.enabled);
    row.enabled = !row.enabled;
    ElMessage.success("账号状态已更新");
  });
}
async function changePassword() {
  await run(async () => {
    validatePassword();
    if (!previousPassword.value) throw new Error("请输入当前密码");
    await accounts.changePassword(previousPassword.value, password.value);
    notifyPasswordChanged();
    reset(); window.location.hash = "/login"; window.location.reload();
  });
}
watch(visible, value => {
  sequence++; loading.value = false; failure.value = "";
  if (!value) { reset(); rows.value = []; return; }
  if (props.kind === "manage") void load();
});
</script>
<style scoped lang="scss">
.accountManagement { display: grid; gap: 20px; max-height: 72dvh; overflow: auto;
  .failure { color: var(--el-color-danger); margin: 0; line-height: 1.5; }
  .toolbar { display: flex; flex-wrap: wrap; gap: 8px; }
  .accountList { display: grid;
    .accountRow { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; justify-content: space-between; padding: 14px 0; border-bottom: 1px solid var(--el-border-color);
      > div:first-child { display: grid; gap: 6px; span { color: var(--el-text-color-secondary); font-size: 13px; } }
      .rowActions { display: flex; gap: 8px; }
    }
  }
  form { display: grid; gap: 12px;
    h3 { margin: 0; font-size: 16px; }
    label { font-size: 14px; }
    > .el-button { justify-self: start; min-height: 44px; }
  }
}
</style>
