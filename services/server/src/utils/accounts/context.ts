import { AsyncLocalStorage } from "node:async_hooks";
import { resolve, relative, isAbsolute, sep } from "node:path";

export type Account = { id: string; username: string; name: string; role: "admin" | "user"; enabled: boolean;
  authVersion: number; mustChangePassword: boolean; legacyRoot: boolean };
export type AccountContext = { user: Account; root: string; session: string; csrf: string;
  configuration: Record<string, unknown>; configurationRevision: number; background?: boolean };
const context = new AsyncLocalStorage<AccountContext>();
let accountMode: "local" | "users" = "local";
let instanceRoot = "";

export function configure(mode: "local" | "users", root: string) { accountMode = mode; instanceRoot = root; }
export function usesAccounts() { return accountMode === "users"; }
export function currentAccount() { return context.getStore(); }
export function requireAccount() {
  const value = currentAccount();
  if (!value) throw Object.assign(new Error("请先登录"), { status: 401 });
  return value;
}
export function runAs<T>(value: AccountContext, operation: () => T) { return context.run(value, operation); }
export function systemRoot() { return instanceRoot || process.env.TOONFLOW_DATA_DIR!; }
export function userRoot() { return usesAccounts() ? requireAccount().root : systemRoot(); }
export function requireAdmin() {
  if (usesAccounts() && requireAccount().user.role !== "admin") throw Object.assign(new Error("此操作需要管理员权限"), { status: 403 });
}
export function ownerId() { return usesAccounts() ? requireAccount().user.id : "local"; }

export function authorizePath(path: string, systemRead = false) {
  if (!usesAccounts()) return;
  if (systemRead) {
    const offset = relative(resolve(systemRoot(), "skills"), resolve(path));
    if (offset !== ".." && !offset.startsWith(`..${sep}`) && !isAbsolute(offset)) return;
  }
  if (requireAccount().user.role === "admin" && ["tools", "nodes", "providers", "ext", "skills", "agents", "ffmpeg"].some(name => {
    const offset = relative(resolve(systemRoot(), name), resolve(path));
    return offset !== ".." && !offset.startsWith(`..${sep}`) && !isAbsolute(offset);
  })) return;
  const root = requireAccount().root;
  const allowed = path === resolve(root, "AGENTS.md") || ["workspaces", "assets", "templates", "singleAgent", "ai", "personalization", "memories"].some(name => {
    const offset = relative(resolve(root, name), resolve(path));
    return offset !== ".." && !offset.startsWith(`..${sep}`) && !isAbsolute(offset);
  });
  if (!allowed) throw Object.assign(new Error("没有权限访问这个工作目录"), { status: 403 });
}
