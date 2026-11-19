import { usesAccounts } from "@/utils/accounts/context";
import { requireConfiguration } from "@/utils/mediaStorage/config";

const vendorHosts = new Set([
  "api.deepseek.com", "api.toonflow.net", "api.openai.com", "api.anthropic.com", "api.moonshot.cn", "api.moonshot.ai",
  "api.siliconflow.cn", "api.siliconflow.com", "open.bigmodel.cn", "api.z.ai", "ark.cn-beijing.volces.com",
  "dashscope.aliyuncs.com", "dashscope-intl.aliyuncs.com", "dashscope-us.aliyuncs.com", "openspeech.bytedance.com",
  "api.modelverse.cn", "cp.compshare.cn", "api.apimart.ai", "api.apib.ai", "metaso.cn",
]);

function forbidden(): never {
  throw Object.assign(new Error("模型或媒体地址未获实例允许；请联系管理员登记供应商接口及结果域名，输入和配置已保留"), { status: 403 });
}

export function authorizeModelUrl(value: string | URL) {
  const url = new URL(value);
  if (!usesAccounts()) return url;
  if (url.username || url.password || url.hash || !["http:", "https:"].includes(url.protocol)
    || /%(?:2f|5c|25|00)/i.test(url.pathname) || /[\\\x00-\x1f]/.test(decodeURIComponent(url.pathname))) forbidden();
  let storageOrigin: string | undefined;
  try { storageOrigin = new URL(requireConfiguration().baseUrl).origin; } catch { /* 缺OSS配置仍可读取模型列表。 */ }
  if (url.origin === storageOrigin) forbidden();
  let extra: string[] = [];
  try {
    const input: unknown = JSON.parse(process.env.AFXEN_MODEL_ALLOWED_BASES ?? "[]");
    if (!Array.isArray(input) || input.length > 100 || input.some(item => typeof item !== "string")) forbidden();
    extra = input;
  } catch { forbidden(); }
  const explicitlyAllowed = extra.some(value => {
    const base = new URL(value);
    if (!["https:", "http:"].includes(base.protocol) || base.username || base.password || base.search || base.hash
      || /[%\\]/.test(base.pathname)) forbidden();
    const path = base.pathname.replace(/\/+$/, "");
    return url.origin === base.origin && (url.pathname === path || url.pathname.startsWith(`${path}/`));
  });
  const vendor = url.protocol === "https:" && !url.port && (vendorHosts.has(url.hostname)
    || /^llm-[a-z0-9]+\.[a-z0-9-]+\.maas\.aliyuncs\.com$/.test(url.hostname)
    || /^[a-z0-9.-]+\.oss-[a-z0-9-]+\.aliyuncs\.com$/.test(url.hostname)
    || /^[a-z0-9.-]+\.(?:volces\.com|byteimg\.com|tos-cn-beijing\.volces\.com)$/.test(url.hostname));
  if (!vendor && !explicitlyAllowed) forbidden();
  return url;
}

// ACT: 多用户只向可信供应商或运维登记的精确base发请求；不解析任意内网地址，也不跟随重定向。
export function restrictModelFetch(request: typeof fetch = fetch): typeof fetch {
  return Object.assign((input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    authorizeModelUrl(input instanceof Request ? input.url : String(input));
    return request(input, usesAccounts() ? { ...init, redirect: "error" } : init);
  }, { preconnect: () => {} }) as typeof fetch;
}

export const modelFetch = restrictModelFetch();
