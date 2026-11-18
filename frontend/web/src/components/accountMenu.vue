<template>
  <el-dropdown v-if="currentAccount" class="accountMenu" @command="handleCommand">
    <el-button class="userCenterButton" text :title="accountDescription" aria-label="用户中心"><icon-user :size="20" /><span class="userCenterText"><strong class="userCenterLabel">{{ currentAccount.name }}</strong><small v-if="currentUser" class="accountRole">{{ roleLabels[currentUser.role] }}<template v-if="currentUser.role !== 'platformAdmin' && currentUser.customerName"> · {{ currentUser.customerName }}</template></small></span></el-button>
    <template #dropdown><el-dropdown-menu><el-dropdown-item command="settings">外观与设置</el-dropdown-item><el-dropdown-item v-if="accountsRequired" command="password">修改密码</el-dropdown-item><el-dropdown-item command="switch">切换账号</el-dropdown-item><el-dropdown-item command="logout">退出登录</el-dropdown-item></el-dropdown-menu></template>
  </el-dropdown>
  <el-button v-else-if="!prototype.requiresAccount" text aria-label="共享工作区设置" @click="emit('openSettings')"><icon-settings :size="20" /><span>设置</span></el-button>
  <accountPassword v-if="accountsRequired" v-model="passwordVisible" />
</template>
<script setup lang="ts">
import { useRouter } from "vue-router";
import { ElMessage } from "element-plus";
import { prototype } from "@/ports/prototype";
import { currentAccount, signOutPrototype } from "@/stores/prototypeAccount";
import { computed, ref } from "vue";
import { roleLabels } from "@/ports/platform";
import { accounts } from "@/ports/accounts";
import { accountsRequired, signOut, currentUser } from "@/stores/accounts";
import { flushSharedState } from "@/stores/sharedState";
import { flushSettings } from "@/stores/settings";
import accountPassword from "./accountPassword.vue";
const router = useRouter();
const emit = defineEmits<{ openSettings: [] }>();
const passwordVisible = ref(false);
const accountDescription = computed(() => [currentAccount.value?.name, currentUser.value ? roleLabels[currentUser.value.role] : "", currentUser.value?.role === "platformAdmin" ? "" : currentUser.value?.customerName].filter(Boolean).join(" · "));
function handleCommand(command: string) {
  if (command === "settings") emit("openSettings");
  else if (command === "password") passwordVisible.value = true;
  else void logout();
}
let leaving = false;
async function logout() {
  if (leaving) return;
  leaving = true;
  try {
    if (accountsRequired.value) {
      const home = "/home";
      await router.push(home);
      if (router.currentRoute.value.path !== home) return;
      await flushSharedState();
      await flushSettings();
      await signOut();
      window.location.hash = "/login";
      window.location.reload();
      return;
    }
    await router.push("/login");
    if (router.currentRoute.value.path !== "/login") return;
    signOutPrototype();
    window.location.reload();
  } catch (error) { ElMessage.error(error instanceof Error ? error.message : "退出登录失败，请重试"); }
  finally { leaving = false; }
}
</script>

<style scoped lang="scss">
.accountMenu { width:100%; min-width:0; max-width:100%; .userCenterButton { display: flex; justify-content: flex-start; gap: 10px; height: 54px; width: 100%; border-radius: 12px; color: #d6d9df; background: transparent; &:hover, &[aria-expanded="true"] { background: transparent; } :deep(> span) { display:flex; align-items:center; gap:10px; min-width:0; max-width:100%; } svg { flex:none; } .userCenterText { display:grid; gap:4px; text-align:left; min-width:0; overflow:hidden; strong, small { display:block; max-width:100%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; } strong { font-size: 13px; font-weight: 500; } small { font-size: 12px; color: #969aa5; } } } }
</style>
