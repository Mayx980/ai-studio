import conf from "@/utils/conf";

export function savedTfKey(kind: "language" | "media" = "media") {
  const settings = conf.get("settings", {});
  const providers = settings.customProviders;
  const language = Array.isArray(providers) ? providers.find(provider => provider?.id?.toLowerCase() === "tfrouter" && typeof provider.apiUrl === "string"
    && URL.canParse(provider.apiUrl) && new URL(provider.apiUrl).origin === "https://api.toonflow.net")?.apiKey : undefined;
  const media = (settings.mediaProviderConfigs as Record<string, { apiKey?: unknown }> | undefined)?.tfRouter?.apiKey;
  const candidates = kind === "language" ? [language, media] : [media, language];
  return candidates.map(value => typeof value === "string" ? value.trim().replace(/^Bearer\s+/i, "").trim() : "").find(Boolean) ?? "";
}

const endpoints = {
  browse: { method: "POST", path: "/v1/plugin/getPlugin" },
  collection: { method: "POST", path: "/v1/plugin/toggleCollection" },
  payment: { method: "POST", path: "/v1/recharge/pay" },
  options: { method: "GET", path: "/v1/recharge/getRechargeData" },
  order: { method: "GET", path: "/v1/recharge/queryOrder" },
};

export async function request(action: keyof typeof endpoints, data: Record<string, unknown>, authorization?: string) {
  const apiKey = authorization === undefined ? savedTfKey("language") : authorization.replace(/^Bearer\s+/i, "").trim();
  if (!apiKey || apiKey.length > 8192 || /[\r\n]/.test(apiKey)) throw Object.assign(new Error("请先配置 TF-Router API Key"), { status: 400 });
  const endpoint = endpoints[action];
  const url = new URL(endpoint.path, "https://api.toonflow.net");
  if (endpoint.method === "GET") for (const [key, value] of Object.entries(data)) if (value !== undefined) url.searchParams.set(key, String(value));
  const response = await fetch(url, { method: endpoint.method, headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    ...(endpoint.method === "POST" ? { body: JSON.stringify(data) } : {}), signal: AbortSignal.timeout(20000), redirect: "error" });
  if (!response.ok) throw Object.assign(new Error(`TF-Router 请求失败（HTTP ${response.status}）`), { status: 502 });
  // 仅转发既有五类业务操作，不接收调用方 URL；响应中隐藏可能被供应商回显的凭据。
  const result: unknown = await response.json();
  function redact(value: unknown): unknown {
    if (typeof value === "string") return value.replaceAll(apiKey, "[Key]");
    if (Array.isArray(value)) return value.map(redact);
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, redact(item)]));
    return value;
  }
  return redact(result);
}
