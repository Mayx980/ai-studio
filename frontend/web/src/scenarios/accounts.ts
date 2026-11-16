import type { AccountsPort, UserAccount } from "@/ports/accounts";
import type { ScenarioName } from "./studio";

// Scenario 只展示同一页面；不接触真实会话、数据库或旧浏览器账号。
export function createScenarioAccountsPort(scenario: ScenarioName): AccountsPort {
  const unavailable = async (): Promise<never> => { throw new Error("隔离预览不操作真实账号"); };
  const enabled = ["login", "accountPassword", "accountManagement"].includes(scenario);
  const user: UserAccount | null = scenario === "accountManagement" || scenario === "accountPassword"
    ? { id: "scenarioAccount", username: "preview", name: "隔离预览账号", role: "admin", enabled: true, mustChangePassword: scenario === "accountPassword" } : null;
  return { scope: "scenario", session: async () => ({ mode: enabled ? "users" : "local", user }), login: unavailable, logout: unavailable,
    changePassword: unavailable, list: async () => user ? [user] : [], create: unavailable, update: unavailable, resetPassword: unavailable };
}
