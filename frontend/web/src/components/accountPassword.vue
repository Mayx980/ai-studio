<template>
  <el-dialog v-model="visible" title="修改密码" width="min(480px, 94vw)" :beforeClose="beforeClose" :closeOnClickModal="false" :closeOnPressEscape="!busy" :showClose="!busy" destroyOnClose>
    <form class="accountPassword" :aria-busy="busy" @submit.prevent="changePassword">
      <p v-if="failure" class="failure" role="alert">{{ failure }}</p>
      <label for="accountNewPassword">新密码（6–15字符）</label>
      <el-input id="accountNewPassword" v-model="password" type="password" autocomplete="new-password" showPassword :maxlength="15" />
      <label for="accountPasswordConfirmation">再次输入新密码</label>
      <el-input id="accountPasswordConfirmation" v-model="confirmation" type="password" autocomplete="new-password" showPassword :maxlength="15" />
      <el-button nativeType="submit" type="primary" :loading="busy">修改并重新登录</el-button>
    </form>
  </el-dialog>
</template>
<script setup lang="ts">
import { ref, watch } from "vue";
import { ElMessageBox } from "element-plus";
import { accounts } from "@/ports/accounts";
import { useRouter } from "vue-router";
import { notifyPasswordChanged, signOut } from "@/stores/accounts";

const router = useRouter();
const visible = defineModel<boolean>({ default: false });
const busy = ref(false), failure = ref("");
const password = ref(""), confirmation = ref("");

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
  busy.value = true;
  failure.value = "";
  try {
    if (password.value.length < 6 || password.value.length > 15) throw new Error("密码须为6–15字符");
    if (password.value !== confirmation.value) throw new Error("两次密码不一致");
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
  }
});
</script>
<style scoped lang="scss">
.accountPassword { display: grid; gap: 12px; max-height: 72dvh; overflow: auto;
  .failure { color: var(--el-color-danger); margin: 0; line-height: 1.5; }
  label { font-size: 14px; }
  > .el-button { justify-self: start; min-height: 44px; }
}
</style>
