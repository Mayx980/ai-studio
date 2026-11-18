<template>
  <main class="loginPage">
    <el-card class="loginCard" shadow="never">
      <brandLogo />
      <h1>{{ currentUser?.mustChangePassword ? "设置新密码" : "登录 AFXEN" }}</h1><p v-if="accounts.scope === 'scenario'" class="previewHint">隔离预览：platform／customer／user 对应三类角色，临时密码123456</p>
      <form v-if="!currentUser?.mustChangePassword" @submit.prevent="login">
        <label for="afxenUsername">用户名</label>
        <el-input id="afxenUsername" v-model="username" autocomplete="username" :maxlength="64" autofocus />
        <label for="afxenPassword">密码</label>
        <el-input id="afxenPassword" v-model="password" type="password" autocomplete="current-password" :maxlength="128" showPassword />
        <p v-if="failure" role="alert">{{ failure }}</p>
        <el-button type="primary" nativeType="submit" :loading="busy">登录</el-button>
      </form>
      <form v-else @submit.prevent="changePassword">
        <p>首次登录或密码重置后，必须先设置新密码才能继续。</p>
        <label for="previousPassword">临时密码</label>
        <el-input id="previousPassword" v-model="password" type="password" autocomplete="current-password" :maxlength="128" showPassword />
        <label for="newPassword">新密码（15–128字符）</label>
        <el-input id="newPassword" v-model="nextPassword" type="password" autocomplete="new-password" :maxlength="128" showPassword />
        <label for="confirmPassword">再次输入新密码</label>
        <el-input id="confirmPassword" v-model="confirmation" type="password" autocomplete="new-password" :maxlength="128" showPassword />
        <p v-if="failure" role="alert">{{ failure }}</p>
        <el-button type="primary" nativeType="submit" :loading="busy">确认修改</el-button>
      </form><el-button v-if="currentUser?.mustChangePassword" text :disabled="busy" @click="exitLogin">退出登录</el-button>
    </el-card>
  </main>
</template>
<script setup lang="ts">
import { ref } from "vue";
import { useRouter } from "vue-router";
const router = useRouter();
import brandLogo from "@/components/brandLogo.vue";
import { currentUser, signIn, signOut, loadAccountSession, notifyPasswordChanged } from "@/stores/accounts";
import { accounts } from "@/ports/accounts";
const username = ref("");
const password = ref("");
const nextPassword = ref("");
const confirmation = ref("");
const failure = ref("");
const busy = ref(false);
async function login() {
  if (busy.value) return;
  busy.value = true;
  failure.value = "";
  try {
    if (!username.value.trim() || !password.value) throw new Error("请输入用户名和密码");
    await signIn(username.value.trim(), password.value);
    if (accounts.scope === "scenario") { await router.push(currentUser.value?.mustChangePassword ? "/login" : currentUser.value?.role === "platformAdmin" ? "/admin" : "/home"); }
    else { window.location.hash = currentUser.value?.mustChangePassword ? "/login" : "/home"; window.location.reload(); }
  } catch (cause) { failure.value = cause instanceof Error ? cause.message : "登录失败，请重试"; }
  finally { busy.value = false; }
}
async function changePassword() {
  if (busy.value) return;
  busy.value = true;
  failure.value = "";
  try {
    if (nextPassword.value.length < 15 || nextPassword.value.length > 128) throw new Error("新密码须为15–128字符");
    if (nextPassword.value === password.value) throw new Error("新密码不能与临时密码相同");
    if (confirmation.value !== nextPassword.value) throw new Error("两次新密码不一致");
    await accounts.changePassword(password.value, nextPassword.value);
    notifyPasswordChanged();
    if (accounts.scope === "scenario") { await loadAccountSession(); password.value = ""; nextPassword.value = ""; confirmation.value = ""; await router.push(currentUser.value?.role === "platformAdmin" ? "/admin" : "/home"); } else window.location.reload();
  } catch (cause) { failure.value = cause instanceof Error ? cause.message : "修改失败，请重试"; }
  finally { busy.value = false; }
}
async function exitLogin() { try { await signOut(); password.value = ""; nextPassword.value = ""; confirmation.value = ""; await router.push("/login"); } catch (cause) { failure.value = cause instanceof Error ? cause.message : "退出失败"; } }
</script>
<style scoped lang="scss">
.loginPage { min-height: 100dvh; display: grid; place-items: center; padding: 24px; background: var(--el-bg-color-page);
  .loginCard { width: min(420px, 100%); text-align: center; border-radius: 20px;
    :deep(.brandLogo) { margin: auto; max-width: 180px; }
    h1 { font-size: 22px; }
    form { text-align: left; display: grid; gap: 12px; margin-top: 24px;
      label { font-size: 14px; }
      p { color: var(--el-text-color-secondary); font-size: 14px; line-height: 1.5; }
      p[role="alert"] { color: var(--el-color-danger); }
      .el-button { width: 100%; min-height: 44px; margin-top: 12px; }
    }
  }
}
</style>
