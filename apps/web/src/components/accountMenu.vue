<template>
  <el-dropdown v-if="currentAccount" class="accountMenu" @command="handleCommand">
    <el-button class="userCenterButton" text aria-label="用户中心"><icon-user :size="20" /><span class="userCenterText"><strong class="userCenterLabel">用户中心</strong><small class="accountName">{{ currentAccount.name }}</small></span></el-button>
    <template #dropdown><el-dropdown-menu><el-dropdown-item v-if="!isPlatformPortal" command="settings">外观与设置</el-dropdown-item><el-dropdown-item command="password">修改密码</el-dropdown-item><el-dropdown-item command="switch">切换账号</el-dropdown-item><el-dropdown-item command="logout">退出登录</el-dropdown-item></el-dropdown-menu></template>
  </el-dropdown>
  <accountPassword v-model="passwordVisible" />
</template>
<script setup lang="ts">
import { useRouter } from "vue-router";
import { ElMessage } from "element-plus";
import { currentAccount } from "@/stores/prototypeAccount";
import { signOut } from "@/stores/accounts";
import { isPlatformPortal, portalHome } from "@/lib/portal";
import { ref } from "vue";
import accountPassword from "./accountPassword.vue";
const passwordVisible = ref(false);
const router = useRouter();
const emit = defineEmits<{ openSettings: [] }>();
function handleCommand(command: string) { if (command === "settings") emit("openSettings"); else if (command === "password") passwordVisible.value = true; else void logout(); }
let leaving = false;
async function logout() {
  if (leaving) return;
  leaving = true;
  try {
    await router.push(portalHome);
    if (router.currentRoute.value.path !== portalHome) return;
    await signOut();
    window.location.hash = "/login";
    window.location.reload();
  } catch (error) { ElMessage.error(error instanceof Error ? error.message : "退出登录失败，请重试"); }
  finally { leaving = false; }
}
</script>

<style scoped lang="scss">
.accountMenu { .userCenterButton { display: flex; justify-content: flex-start; gap: 10px; height: 54px; width: 100%; border-radius: 12px; color: #d6d9df; background: transparent; &:hover, &[aria-expanded="true"] { background: transparent; } :deep(> span) { display: flex; align-items: center; gap: 10px; } .userCenterText { display: grid; gap: 4px; text-align: left; strong { font-size: 13px; font-weight: 500; } small { font-size: 11px; color: #969aa5; } } } }
</style>
