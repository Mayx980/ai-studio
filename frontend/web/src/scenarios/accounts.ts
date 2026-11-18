import type { AccountsPort, UserAccount } from "@/ports/accounts";
import type { ScenarioName } from "./studio";

type PreviewAccount = { user: UserAccount; salt: string; passwordHash: string };
const storageKey = "afxen.uiux.previewAccounts";
const sessionKey = "afxen.uiux.previewSession";
const roles = { platform: "platformAdmin", customer: "customerAdmin", user: "user" } as const;
async function hashPassword(password: string, salt: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: new TextEncoder().encode(salt), iterations: 100000 }, key, 256);
  return Array.from(new Uint8Array(bits), byte => byte.toString(16).padStart(2, "0")).join("");
}
function readAccounts(): PreviewAccount[] {
  const raw = localStorage.getItem(storageKey);
  if (!raw) return [];
  const values: unknown = JSON.parse(raw);
  if (!Array.isArray(values) || values.some(item => !item?.user || typeof item.user.username !== "string" || !["user", "customerAdmin", "platformAdmin"].includes(item.user.role) || typeof item.salt !== "string" || !/^[a-f0-9]{64}$/.test(item.passwordHash))) throw new Error("演示账号状态无效，请清除当前浏览器的演示状态后重试");
  return values;
}
async function initialAccounts() {
  let values = readAccounts();
  if (values.length) return values;
  values = await Promise.all(Object.entries(roles).map(async ([username, role]) => {
    const salt = crypto.randomUUID();
    return { user: { id: username === "user" ? "scenarioAccount" : `preview${username}`, username, name: { platform: "平台管理员", customer: "客户管理员", user: "普通用户" }[username]!, role, customerId: "customerPreview", customerName: "演示客户", enabled: true, mustChangePassword: true }, salt, passwordHash: await hashPassword("123456", salt) };
  }));
  localStorage.setItem(storageKey, JSON.stringify(values));
  return values;
}
export async function setScenarioTemporaryPassword(user: UserAccount, password: string) {
  if (password.length < 6 || password.length > 15) throw new Error("临时密码须为6–15字符");
  const values = await initialAccounts();
  const salt = crypto.randomUUID();
  const value = { user: { ...user, mustChangePassword: true }, salt, passwordHash: await hashPassword(password, salt) };
  const index = values.findIndex(item => item.user.username === user.username);
  if (index < 0) values.push(value); else values[index] = value;
  localStorage.setItem(storageKey, JSON.stringify(values));
}
// ACT: 仅隔离预览使用标签页会话与独立的浏览器加盐摘要；不存明文密码、不读取生产会话。
export function createScenarioAccountsPort(scenario: ScenarioName): AccountsPort {
  const preset = scenario === "platformAdmin" || scenario === "platformError" ? "platform" : scenario === "customerAdmin" ? "customer" : ["initialPassword", "accountPassword", "cloudUser"].includes(scenario) ? "user" : undefined;
  let user: UserAccount | null = null;
  const session = () => ({ mode: "users" as const, user: user ? { ...user } : null });
  return { scope: "scenario", session: async () => {
    const values = await initialAccounts();
    const username = sessionStorage.getItem(sessionKey) ?? preset;
    user = values.find(item => item.user.username === username)?.user ?? null;
    if (user && preset && !sessionStorage.getItem(sessionKey)) user = { ...user, mustChangePassword: scenario === "initialPassword" };
    return session();
  },
    login: async (username, password) => {
      const account = (await initialAccounts()).find(item => item.user.username === username);
      if (!account || !account.user.enabled || await hashPassword(password, account.salt) !== account.passwordHash) throw new Error("账号或密码不正确");
      sessionStorage.setItem(sessionKey, username);
      user = { ...account.user };
      return session();
    },
    logout: async () => { sessionStorage.removeItem(sessionKey); user = null; },
    changePassword: async (previous, password) => {
      if (!user) throw new Error("请先登录");
      const values = await initialAccounts();
      const account = values.find(item => item.user.username === user!.username);
      if (!account || await hashPassword(previous, account.salt) !== account.passwordHash) throw new Error("当前密码不正确");
      if (password.length < 6 || password.length > 15) throw new Error("新密码须为6–15字符");
      if (password === previous) throw new Error("新密码不能与当前密码相同");
      const salt = crypto.randomUUID();
      account.salt = salt;
      account.passwordHash = await hashPassword(password, salt);
      account.user.mustChangePassword = false;
      localStorage.setItem(storageKey, JSON.stringify(values));
      user = { ...account.user };
    } };
}
