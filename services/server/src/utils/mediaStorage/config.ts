import { readFile } from "@toonflow/file";
import { isAbsolute } from "node:path";
import { z } from "zod";

type StorageConfig = { baseUrl: string; bucket: string; prefix: string };
let configuration: StorageConfig | undefined;
let configurationError = "未配置云存储服务地址和 bucket";

export function storageError(message: string, status = 503) {
  return Object.assign(new Error(message), { status, code: "ESTORAGE" });
}

export function objectPath(value: string) {
  const parts = value.split("/");
  if (!value || parts.some(part => !part || part === "." || part === ".." || /[\\\x00-\x1f\x7f]/.test(part))) {
    throw storageError("云存储对象路径无效", 400);
  }
  return parts.map(encodeURIComponent).join("/");
}

export async function initialize() {
  configuration = undefined;
  try {
    let values: Record<string, string> = {};
    const path = process.env.AFXEN_STORAGE_CONFIG;
    if (path !== undefined) {
      if (!isAbsolute(path)) throw new Error();
      values = z.object({ baseUrl: z.string().optional(), bucket: z.string().optional(), prefix: z.string().optional() })
        .strict().parse(JSON.parse(await readFile(path, "utf8"))) as Record<string, string>;
    }
    for (const [key, variable] of [["baseUrl", "AFXEN_STORAGE_BASE_URL"], ["bucket", "AFXEN_STORAGE_BUCKET"], ["prefix", "AFXEN_STORAGE_PREFIX"]]) {
      if (process.env[variable!] !== undefined) values[key!] = process.env[variable!]!;
    }
    if (!values.baseUrl || !values.bucket) {
      configurationError = "未配置云存储服务地址和 bucket";
      return;
    }
    const url = new URL(values.baseUrl);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error();
    if (values.bucket.includes("/")) throw new Error();
    objectPath(values.bucket);
    const prefix = values.prefix ?? "afxen";
    objectPath(prefix);
    configuration = Object.freeze({ baseUrl: url.href.replace(/\/+$/, ""), bucket: values.bucket, prefix });
  } catch {
    configurationError = "云存储配置无效或指定配置文件无法读取";
  }
}

export function requireConfiguration() {
  if (!configuration) throw storageError(configurationError);
  return configuration;
}
