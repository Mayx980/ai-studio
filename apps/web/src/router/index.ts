import { createRouter, createWebHashHistory } from "vue-router";
import { useHelloStore } from "@/stores/hello";
import { currentUser, sessionExpired } from "@/stores/accounts";
import { isPlatformPortal, acceptsPortalRole, portalHome } from "@/lib/portal";
const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    ...(isPlatformPortal ? [{ path: "/admin", component: () => import("@/pages/admin/index.vue") }] : []),
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
    { path: "/source", component: () => import("@/pages/sourceEditor/index.vue") },
    {
      path: "/workspace",
      component: () => import("@/pages/workspace/index.vue"),
    },
  ],
});
router.beforeEach(to => {
  const user = currentUser.value;
  if ((!user || !acceptsPortalRole(user.role) || user.mustChangePassword || sessionExpired.value) && to.path !== "/login") return { path: "/login", replace: true };
  if (user && !user.mustChangePassword && !sessionExpired.value && to.path === "/login") return { path: portalHome, replace: true };
  if (isPlatformPortal && !["/login", "/admin"].includes(to.path)) return { path: "/admin", replace: true };
  if (!isPlatformPortal && to.path === "/admin") return { path: "/home", replace: true };
  return true;
});
export default router;
