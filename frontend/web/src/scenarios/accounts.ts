import { isPlatformPortal, acceptsPortalRole } from "@/lib/portal";
import type { AccountsPort, UserAccount } from "@/ports/accounts";
import type { ScenarioName } from "./studio";

type PreviewAccount = { user: UserAccount; salt: string; passwordHash: string; sessionVersion?: string };
const userStorageKey = "afxen.uiux.userAccounts";
const platformStorageKey = "afxen.uiux.platformAccounts";
const sessionKey = isPlatformPortal ? "afxen.uiux.platformSession" : "afxen.uiux.userSession";
const roles = { platform: "platformAdmin", user: "user" } as const;
async function hashPassword(password: string, salt: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: new TextEncoder().encode(salt), iterations: 100000 }, key, 256);
  return Array.from(new Uint8Array(bits), byte => byte.toString(16).padStart(2, "0")).join("");
}
function normalizeAccounts(values: PreviewAccount[], platform: boolean) {
  let changed = false;
  for (const account of values) {
    if (String(account.user.role) !== "customerAdmin") continue;
    account.user.role = "user";
    account.sessionVersion = crypto.randomUUID();
    changed = true;
    if (sessionStorage.getItem("afxen.uiux.userSession") === account.user.username) sessionStorage.removeItem("afxen.uiux.userSession");
  }
  if (changed) localStorage.setItem(platform ? platformStorageKey : userStorageKey, JSON.stringify(values));
  return values;
}
function readAccounts(platform = false): PreviewAccount[] {
  const raw = localStorage.getItem(platform ? platformStorageKey : userStorageKey);
  if (!raw) {
    const legacy = localStorage.getItem("afxen.uiux.previewAccounts");
    if (!legacy) return [];
    const values = JSON.parse(legacy) as PreviewAccount[];
    if (!Array.isArray(values) || values.some(item => !item?.user || typeof item.user.username !== "string" || !["user", "customerAdmin", "platformAdmin"].includes(item.user.role) || typeof item.salt !== "string" || !/^[a-f0-9]{64}$/.test(item.passwordHash))) throw new Error("旧演示账号状态无效，请保留数据后检查");
    const migrated = values.filter(item => (item.user.role === "platformAdmin") === platform);
    localStorage.setItem(platform ? platformStorageKey : userStorageKey, JSON.stringify(migrated));
    return normalizeAccounts(migrated, platform);
  }
  const values: unknown = JSON.parse(raw);
  if (!Array.isArray(values) || values.some(item => !item?.user || typeof item.user.username !== "string" || !["user", "customerAdmin", "platformAdmin"].includes(item.user.role) || typeof item.salt !== "string" || !/^[a-f0-9]{64}$/.test(item.passwordHash))) throw new Error("演示账号状态无效，请清除当前浏览器的演示状态后重试");
  return normalizeAccounts(values.filter(item => (item.user.role === "platformAdmin") === platform), platform);
}
async function initialAccounts(platform = false) {
  if (platform) await initialAccounts(false);
  let values = readAccounts(platform);
  if (values.length) return values;
  values = await Promise.all(Object.entries(roles).filter(([, role]) => (role === "platformAdmin") === platform).map(async ([username, role]) => {
    const salt = crypto.randomUUID();
    return { user: { id: username === "user" ? "scenarioAccount" : `preview${username}`, username, name: { platform: "平台管理员", user: "普通用户" }[username]!, role, customerId: "customerPreview", customerName: "演示客户", enabled: true, mustChangePassword: true }, salt, passwordHash: await hashPassword("123456", salt) };
  }));
  localStorage.setItem(platform ? platformStorageKey : userStorageKey, JSON.stringify(values));
  return values;
}
export async function setScenarioTemporaryPassword(user: UserAccount, password: string) {
  if (password !== "123456") throw new Error("初始和重置密码统一为123456");
  if (user.role === "platformAdmin") throw new Error("本版不管理平台端账号");
  const values = await initialAccounts();
  const salt = crypto.randomUUID();
  const value = { user: { ...user, mustChangePassword: true }, sessionVersion: crypto.randomUUID(), salt, passwordHash: await hashPassword(password, salt) };
  const index = values.findIndex(item => item.user.username === user.username);
  if (index < 0) values.push(value); else values[index] = value;
  localStorage.setItem(userStorageKey, JSON.stringify(values));
}
export const scenarioManagementKey = "afxen.uiux.platformManagement";
export function getScenarioAccountSummaries() { return readAccounts().map(item => ({ ...item.user })); }
export function updateScenarioAccount(username: string, patch: Partial<UserAccount>) {
  const values = readAccounts();
  const account = values.find(item => item.user.username === username);
  if (!account) return;
  Object.assign(account.user, patch);
  localStorage.setItem(userStorageKey, JSON.stringify(values));
}
export function scenarioAccountRestriction(user: UserAccount) {
  if (user.role === "platformAdmin") return;
  const raw = localStorage.getItem(scenarioManagementKey);
  if (!raw) return;
  const state = JSON.parse(raw) as import("@/ports/platform").PlatformState;
  const customer = state.customers.find(item => item.id === user.customerId);
  if (customer?.deletedAt) return "所属客户已删除";
  if (customer?.enabled === false) return "所属客户已被平台管理员禁用";
  const account = state.accounts.find(item => item.id === user.id);
  if (account?.deletedAt) return "账号已删除";
  if (account && (account.username !== user.username || (String(account.role) === "customerAdmin" ? "user" : account.role) !== user.role || account.customerId !== user.customerId)) return "账号信息已变更，请重新登录";
  if (account && !account.enabled) return account.disabledBy === "platformAdmin" ? "平台管理员禁用该账号" : "账号已禁用";
}
// ACT: 仅隔离预览使用标签页会话与独立的浏览器加盐摘要；不存明文密码、不读取生产会话。
export function createScenarioAccountsPort(scenario: ScenarioName): AccountsPort {
  const preset = isPlatformPortal ? ["platformAdmin", "platformError"].includes(scenario) ? "platform" : undefined : ["initialPassword", "accountPassword", "cloudUser"].includes(scenario) ? "user" : undefined;
  let user: UserAccount | null = null;
  window.addEventListener("storage", event => {
    if (!user) return;
    if (event.key === scenarioManagementKey && scenarioAccountRestriction(user) || event.key === userStorageKey && !isPlatformPortal && readAccounts().find(item => item.user.id === user?.id)?.user.role !== user.role) window.dispatchEvent(new Event("afxenSessionExpired"));
  });
  const session = () => ({ mode: "users" as const, user: user ? { ...user } : null });
  return { scope: "scenario", session: async () => {
    const values = await initialAccounts(isPlatformPortal);
    const username = sessionStorage.getItem(sessionKey) ?? preset;
    const account = values.find(item => item.user.username === username && item.user.enabled);
    user = account && (!account.sessionVersion || sessionStorage.getItem(`${sessionKey}.version`) === account.sessionVersion) ? account.user : null;
    if (user && scenarioAccountRestriction(user)) user = null;
    if (user && preset && !sessionStorage.getItem(sessionKey)) user = { ...user, mustChangePassword: scenario === "initialPassword" };
    return session();
  },
    login: async (username, password) => {
      const account = (await initialAccounts(isPlatformPortal)).find(item => item.user.username === username);
      if (!account || !account.user.enabled || await hashPassword(password, account.salt) !== account.passwordHash) throw new Error("账号或密码不正确");
      if (!acceptsPortalRole(account.user.role)) throw new Error("该账号不能登录当前端");
      const restriction = scenarioAccountRestriction(account.user);
      if (restriction) throw new Error(restriction);
      sessionStorage.setItem(sessionKey, username);
      sessionStorage.setItem(`${sessionKey}.version`, account.sessionVersion ?? "");
      user = { ...account.user };
      return session();
    },
    logout: async () => { sessionStorage.removeItem(sessionKey); sessionStorage.removeItem(`${sessionKey}.version`); user = null; },
    changePassword: async (password) => {
      if (!user) throw new Error("请先登录");
      const values = await initialAccounts(isPlatformPortal);
      const account = values.find(item => item.user.username === user!.username);
      if (!account || !account.user.enabled || !acceptsPortalRole(account.user.role) || scenarioAccountRestriction(account.user)) throw new Error("账号状态已改变，请重新登录");
      if (password.length < 6 || password.length > 15) throw new Error("新密码须为6–15字符");
      if (password === "123456") throw new Error("新密码不能使用初始密码123456");
      const salt = crypto.randomUUID();
      account.salt = salt;
      account.passwordHash = await hashPassword(password, salt);
      account.user.mustChangePassword = false;
      localStorage.setItem(isPlatformPortal ? platformStorageKey : userStorageKey, JSON.stringify(values));
      user = { ...account.user };
    } };
}
