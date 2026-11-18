import { prototype } from "@/ports/prototype";
import { createRouter, createWebHashHistory } from "vue-router";
import { useHelloStore } from "@/stores/hello";
import { isPlatformAdmin, isCustomerAdmin } from "@/stores/platform";
import { currentAccount } from "@/stores/prototypeAccount";
import { accountsRequired, currentUser } from "@/stores/accounts";
const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: "/admin", component: () => import("@/pages/admin/index.vue") },
    { path: "/login", component: () => import("@/pages/login/index.vue") },
    {
      path: "/",
      redirect: "/hello",
    },
    {
      path: "/hello",
      beforeEnter: async () => await useHelloStore().load() ? { path: "/home", replace: true } : true,
      component: () => import("@/pages/hello/index.vue"),
    },
    {
      path: "/home",
      component: () => import("@/pages/home/index.vue"),
    },
    {
      path: "/canvas",
      redirect: "/workspace",
    },
    {
      path: "/workspace",
      beforeEnter: async () => {
        if (!prototype.supportsCreation) return true;
        const { useWorkspaceStore } = await import("@/stores/workspace");
        const workspace = useWorkspaceStore();
        if (workspace.project && !workspace.pendingCanvasEntry && !workspace.pendingAgentMessage && !workspace.pendingAgentSession) await workspace.restoreProjectEntry();
        return true;
      },
      component: () => import("@/pages/workspace/index.vue"),
    },
  ],
});
router.beforeEach(to => {
  if (accountsRequired.value) {
    if ((!currentUser.value || currentUser.value.mustChangePassword) && to.path !== "/login") return { path: "/login", replace: true };
    if (currentUser.value && !currentUser.value.mustChangePassword && to.path === "/login") return { path: "/home", replace: true };
    if (to.path === "/admin" && !isPlatformAdmin.value) return { path: "/home", replace: true };
    if (to.query.section === "accounts" && !isCustomerAdmin.value) return { path: "/home", replace: true };
    return true;
  }
  if (to.path === "/admin" || to.query.section === "accounts") return { path: "/login", replace: true };
  return !prototype.requiresAccount && to.path === "/login" ? { path: "/home", replace: true }
    : prototype.requiresAccount && to.path !== "/login" && !currentAccount.value ? { path: "/login", replace: true } : true;
});
export default router;
