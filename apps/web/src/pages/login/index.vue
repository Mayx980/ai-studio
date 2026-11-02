<template>
  <main class="loginPage">
    <el-card class="loginCard" shadow="never">
      <brandLogo />
      <h1>登录 AFXEN</h1>
      <p>原型账号，仅用于当前浏览器演示。</p>
      <el-radio-group v-model="accountId" aria-label="原型账号">
        <el-radio-button v-for="account in prototypeAccounts" :key="account.id" :value="account.id">{{ account.name }}</el-radio-button>
      </el-radio-group>
      <el-button type="primary" @click="login">登录</el-button>
    </el-card>
  </main>
</template>
<script setup lang="ts">
import { ref } from "vue";
import brandLogo from "@/components/brandLogo.vue";
import { prototypeAccounts, signInPrototype } from "@/stores/prototypeAccount";
const accountId = ref("user");
function login() {
  signInPrototype(accountId.value);
  window.location.hash = "/home";
  window.location.reload();
}
</script>
<style scoped lang="scss">
.loginPage { min-height: 100dvh; display: grid; place-items: center; padding: 24px; background: var(--el-bg-color-page);
  .loginCard { width: min(420px, 100%); text-align: center; border-radius: 20px;
    :deep(.brandLogo) { margin: auto; max-width: 180px; }
    h1 { font-size: 22px; } p { color: var(--el-text-color-secondary); font-size: 13px; }
    .el-radio-group { display: flex; justify-content: center; margin: 24px 0; }
    .el-button { width: 100%; }
  }
}
</style>
