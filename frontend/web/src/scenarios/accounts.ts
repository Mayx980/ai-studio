import type { AccountsPort, UserAccount } from "@/ports/accounts";
import type { ScenarioName } from "./studio";

// ACT: 仅隔离预览的内存身份；刷新恢复场景，不持久化密码或冒充真实账号。
export function createScenarioAccountsPort(scenario: ScenarioName): AccountsPort {
  const authenticated = ["initialPassword", "accountPassword", "platformAdmin", "customerAdmin", "cloudUser", "platformError"].includes(scenario);
  let user: UserAccount | null = authenticated ? {
    id: "scenarioAccount", username: "preview", name: "隔离预览账号",
    role: scenario === "platformAdmin" || scenario === "platformError" ? "platformAdmin" : scenario === "customerAdmin" ? "customerAdmin" : "user",
    customerId: "customerPreview", customerName: "演示客户", enabled: true, mustChangePassword: scenario === "initialPassword",
  } : null;
  const session = () => ({ mode: "users" as const, user: user ? { ...user } : null });
  return { scope: "scenario", session: async () => session(),
    login: async (username, password) => {
      if (!["platform", "customer", "user"].includes(username)) throw new Error("请选择页面上的演示角色，或输入对应演示账号");
      if (password !== "123456") throw new Error("隔离预览请使用临时密码123456");
      const role = username === "platform" ? "platformAdmin" : username === "customer" ? "customerAdmin" : "user";
      user = { id: "scenarioAccount", username, name: "隔离预览账号", role, customerId: "customerPreview", customerName: "演示客户", enabled: true, mustChangePassword: true };
      return session();
    },
    logout: async () => { user = null; },
    changePassword: async (previous, password) => {
      if (!user) throw new Error("请先登录");
      if (previous !== "123456") throw new Error("临时密码不正确");
      if (password === previous || password.length < 15 || password.length > 128) throw new Error("新密码须为15–128字符且不能与临时密码相同");
      user = { ...user, mustChangePassword: false };
    } };
}
