import { createRouter, createWebHashHistory } from "vue-router";
import { useHelloStore } from "@/stores/hello";
import { currentAccount } from "@/stores/prototypeAccount";
const router = createRouter({
  history: createWebHashHistory(),
  routes: [
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
router.beforeEach(to => to.path !== "/login" && !currentAccount.value ? { path: "/login", replace: true } : true);
export default router;
