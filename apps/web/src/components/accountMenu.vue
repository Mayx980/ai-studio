<template>
  <el-dropdown v-if="currentAccount" class="accountMenu" @command="logout">
    <el-button text aria-label="账号菜单"><icon-user :size="16" />{{ currentAccount.name }}</el-button>
    <template #dropdown><el-dropdown-menu><el-dropdown-item command="switch">切换账号</el-dropdown-item><el-dropdown-item command="logout">退出登录</el-dropdown-item></el-dropdown-menu></template>
  </el-dropdown>
</template>
<script setup lang="ts">
import { useRouter } from "vue-router";
import { ElMessage } from "element-plus";
import { currentAccount, signOutPrototype } from "@/stores/prototypeAccount";
const router = useRouter();
let leaving = false;
async function logout() {
  if (leaving) return;
  leaving = true;
  try {
    await router.push("/login");
    if (router.currentRoute.value.path !== "/login") return;
    signOutPrototype();
    window.location.reload();
  } catch (error) { ElMessage.error(error instanceof Error ? error.message : "退出登录失败，请重试"); }
  finally { leaving = false; }
}
</script>
