import { StudioError } from "@/ports";
import type { AccountsPort, AccountSession } from "@/ports/accounts";

let session: AccountSession = { mode: "local", user: null };
let expired = false;
let requests = new AbortController();
window.addEventListener("afxenIdentityChanged", identityFailed);

export function identityHeaders(): Record<string, string> {
  if (expired) throw new StudioError("账号状态已改变，当前页面不能继续写入；请保留未保存内容后重新登录", undefined, 401);
  return session.mode === "users" && session.user ? { "x-afxen-user": session.user.id, "x-afxen-csrf": session.csrf! } : {};
}
export function identitySignal(signal?: AbortSignal) {
  return signal ? AbortSignal.any([signal, requests.signal]) : requests.signal;
}
export function identityFailed() {
  if (!session.user || expired) return;
  expired = true;
  requests.abort();
  window.dispatchEvent(new Event("afxenSessionExpired"));
}
export function accountMediaSource(value: string) {
  const url = new URL(value, window.location.href);
  if (url.origin !== window.location.origin || !url.pathname.startsWith("/api/")) return value;
  if (session.mode === "users" && session.user) url.searchParams.set("account", session.user.id);
  return url.href;
}

export async function authenticatedFetch(input: RequestInfo | URL, options: RequestInit = {}) {
  const url = new URL(input instanceof Request ? input.url : String(input), window.location.href);
  if (url.origin !== window.location.origin || !url.pathname.startsWith("/api/")) return fetch(input, options);
  const headers = new Headers(options.headers ?? (input instanceof Request ? input.headers : undefined));
  for (const [key, value] of Object.entries(identityHeaders())) headers.set(key, value);
  const signal = options.signal ?? (input instanceof Request ? input.signal : undefined);
  const response = await fetch(input, { ...options, headers, credentials: "same-origin",
    signal: signal ? AbortSignal.any([signal, requests.signal]) : requests.signal });
  if (response.status === 401) identityFailed();
  return response;
}

async function request<T>(path: string, method = "GET", data?: object, anonymous = false): Promise<T> {
  const response = await fetch(`/api/${path}`, { method, credentials: "same-origin", cache: "no-store",
    headers: { "Content-Type": "application/json", ...(anonymous ? {} : identityHeaders()) }, ...(data ? { body: JSON.stringify(data) } : {}) });
  const body = await response.json().catch(() => undefined);
  if (!response.ok || body?.code !== 200) {
    if (response.status === 401 && !anonymous) identityFailed();
    throw new StudioError(body?.message ?? `账号请求失败（HTTP ${response.status}）`, body, response.status);
  }
  return body.data;
}

function remember(value: AccountSession) {
  if (!["local", "users"].includes(value.mode) || value.user && (typeof value.user.id !== "string" || value.user.role !== "user")
    || value.user && !/^[a-f0-9]{64}$/.test(value.csrf ?? "")) throw new Error("服务端返回的账号状态无效");
  session = value;
  expired = false;
  requests = new AbortController();
  return value;
}

export function createAccountsPort(): AccountsPort {
  return {
    scope: "production",
    session: async () => remember(await request<AccountSession>("auth/session", "GET", undefined, true)),
    login: async (username, password) => remember(await request<AccountSession>("auth/login", "POST", { username, password }, true)),
    logout: async () => { await request("auth/logout", "POST"); },
    changePassword: async () => { throw new Error("当前后端尚未接通免旧密码修改接口"); },
  };
}
