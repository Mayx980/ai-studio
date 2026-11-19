<template>
  <el-dialog v-model="visible" class="accountPasswordDialog" title="修改密码" width="min(440px, 94vw)" :beforeClose="beforeClose" :closeOnClickModal="false" :closeOnPressEscape="!busy" :showClose="!busy" destroyOnClose>
    <form class="accountPassword" :aria-busy="busy" @submit.prevent="changePassword">
      <div class="passwordField"><label for="accountNewPassword">新密码（6–15字符）</label><el-input id="accountNewPassword" ref="passwordInput" v-model="password" type="password" autocomplete="new-password" showPassword :maxlength="15" :disabled="busy" :aria-invalid="!!passwordFailure" :aria-describedby="passwordFailure ? 'accountNewPasswordError' : undefined" @input="passwordFailure = ''" /><p v-if="passwordFailure" id="accountNewPasswordError" class="failure" role="alert">{{ passwordFailure }}</p></div>
      <div class="passwordField"><label for="accountPasswordConfirmation">确认新密码</label><el-input id="accountPasswordConfirmation" ref="confirmationInput" v-model="confirmation" type="password" autocomplete="new-password" showPassword :maxlength="15" :disabled="busy" :aria-invalid="!!confirmationFailure" :aria-describedby="confirmationFailure ? 'accountPasswordConfirmationError' : undefined" @input="confirmationFailure = ''" /><p v-if="confirmationFailure" id="accountPasswordConfirmationError" class="failure" role="alert">{{ confirmationFailure }}</p></div>
      <p class="passwordHint">修改成功后，请使用新密码重新登录</p>
      <p v-if="failure" class="failure" role="alert">{{ failure }}</p>
      <div class="passwordActions"><el-button nativeType="submit" type="primary" :loading="busy">确定</el-button></div>
    </form>
  </el-dialog>
</template>
<script setup lang="ts">
import { ref, watch } from "vue";
import { ElInput, ElMessageBox } from "element-plus";
import { accounts } from "@/ports/accounts";
import { useRouter } from "vue-router";
import { notifyPasswordChanged, signOut } from "@/stores/accounts";

const router = useRouter();
const visible = defineModel<boolean>({ default: false });
const busy = ref(false), failure = ref("");
const password = ref(""), confirmation = ref("");
const passwordInput = ref<InstanceType<typeof ElInput>>(), confirmationInput = ref<InstanceType<typeof ElInput>>();
const passwordFailure = ref(""), confirmationFailure = ref("");

async function beforeClose(done: () => void) {
  if (busy.value) return;
  if (password.value || confirmation.value) {
    const discard = await ElMessageBox.confirm("尚未提交的密码将被清空。", "放弃本次修改？", { confirmButtonText: "放弃修改", cancelButtonText: "继续编辑", type: "warning" }).then(() => true, () => false);
    if (!discard) return;
  }
  done();
}

async function changePassword() {
  if (busy.value) return;
  failure.value = "";
  passwordFailure.value = password.value.length < 6 || password.value.length > 15 ? "密码须为6–15字符" : password.value === "123456" ? "新密码不能使用初始密码123456" : "";
  confirmationFailure.value = !confirmation.value ? "请确认新密码" : password.value !== confirmation.value ? "两次密码不一致" : "";
  if (passwordFailure.value) { passwordInput.value?.focus(); return; }
  if (confirmationFailure.value) { confirmationInput.value?.focus(); return; }
  busy.value = true;
  try {
    await accounts.changePassword(password.value);
    notifyPasswordChanged();
    if (accounts.scope === "scenario") { await signOut(); visible.value = false; await router.push("/login"); window.location.reload(); } else { window.location.hash = "/login"; window.location.reload(); }
  } catch (cause) { failure.value = cause instanceof Error ? cause.message : "修改失败，请重试"; }
  finally { busy.value = false; }
}

watch(visible, value => {
  if (!value) {
    password.value = "";
    confirmation.value = "";
    failure.value = "";
    passwordFailure.value = "";
    confirmationFailure.value = "";
  }
});
</script>
<style scoped lang="scss">
:global(.accountPasswordDialog) { padding:24px; }
:global(.accountPasswordDialog .el-dialog__header) { padding:0 28px 24px 0; }
:global(.accountPasswordDialog .el-dialog__title) { font-size:20px; line-height:28px; }
.accountPassword { display:grid; max-height:72dvh; overflow:auto;
  .passwordField { display:grid; gap:8px; + .passwordField { margin-top:20px; } label { font-size:14px; line-height:20px; } :deep(.el-input__wrapper) { min-height:40px; box-sizing:border-box; border-radius:8px; } }
  .passwordHint { margin:16px 0 0; color:var(--el-text-color-secondary); font-size:12px; line-height:18px; }
  .failure { color:var(--el-color-danger); margin:0; font-size:12px; line-height:18px; }
  > .failure { margin-top:8px; }
  .passwordActions { display:flex; justify-content:center; margin-top:24px; .el-button { width:140px; height:40px; border-radius:8px; } }
}
</style>
