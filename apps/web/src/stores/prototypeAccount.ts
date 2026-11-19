import { computed } from "vue";
import { currentUser } from "./accounts";

// ACT: 仅桥接旧创作原型使用的两个角色标识，保留原项目和模板存储规则。
export const currentAccount = computed(() => {
  const user = currentUser.value;
  if (!user) return undefined;
  return { id: user.role === "platformAdmin" ? "admin" as const : "user" as const, name: user.name, role: user.role === "platformAdmin" ? "admin" as const : "user" as const };
});
