import conf from "conf";
import { mkdirSync, readdirSync, realpathSync } from "@toonflow/file";
import { resolve } from "node:path";
import tfRouter from "@toonflow/providers/language/tfRouter";
import type { RemoteTeam } from "@/utils/teams";
import type { A2aSettings } from "@/agent/a2a/settings";
import type { desktopUpdateAttempt } from "@/types/desktop";
import type { MobileLinkConfig } from "@/utils/mobileLink";
import { normalizeNodeMenu, serializeNodeMenu } from "@/lib/nodeMenu";
import { currentAccount, requireAccount, usesAccounts } from "@/utils/accounts/context";
import { saveConfiguration } from "@/utils/accounts";

const autoInstallProviders = [tfRouter];
const dataDirectory = process.env.TOONFLOW_DATA_DIR ?? resolve(import.meta.dirname, "../../../../../data");
mkdirSync(dataDirectory, { recursive: true });
const configDirectory = realpathSync(dataDirectory);
process.env.TOONFLOW_DATA_DIR = configDirectory;

const config = new conf<{ settings: Record<string, unknown>; disabledSkills: string[]; toolConfigs: Record<string, Record<string, unknown>>; nodeConfigs: Record<string, Record<string, unknown>>; extConfigs: Record<string, Record<string, unknown>>; remoteConnections: Record<string, RemoteTeam>; a2a: A2aSettings; desktopUpdateAttempt: desktopUpdateAttempt; mobileLink: MobileLinkConfig }>({
  cwd: configDirectory,
  configName: "settings",
  configFileMode: 0o600,
  watch: true,
});

export function removeLegacySettings(settings: Record<string, unknown>) {
  let changed = false;
  // ACT: 只清理已废弃字段，保留其他设置和插件配置。
  for (const [record, key] of [[settings, "developerConfirmed"], [settings.general, "systemPrompt"], [settings.stores, "toonflow.developer"]] as const) {
    if (record && typeof record === "object" && !Array.isArray(record) && Object.hasOwn(record, key)) {
      Reflect.deleteProperty(record, key);
      changed = true;
    }
  }
  return changed;
}

export function cleanNodeMenuSettings(settings: Record<string, unknown>) {
  const general = settings.general;
  if (!general || typeof general !== "object" || Array.isArray(general) || !Object.hasOwn(general, "nodeMenu")) return false;
  const record = general as Record<string, unknown>;
  const installedTypes = new Set<string>();
  try {
    // ACT: 仅扫描已安装文件名；禁用节点保留配置，菜单清理与同步存盘间不插入异步等待。
    for (const file of readdirSync(resolve(configDirectory, "nodes"), { withFileTypes: true })) {
      if (file.isFile() && /^[a-z][a-zA-Z0-9]*\.umd\.js$/.test(file.name)) installedTypes.add(`remote-${file.name.slice(0, -7)}`);
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const nodeMenu = serializeNodeMenu(normalizeNodeMenu(record.nodeMenu), installedTypes);
  if (!nodeMenu.length) {
    delete record.nodeMenu;
    return true;
  }
  if (JSON.stringify(record.nodeMenu) === JSON.stringify(nodeMenu)) return false;
  record.nodeMenu = nodeMenu;
  return true;
}

const settings = config.get("settings", {});
if (!usesAccounts() && removeLegacySettings(settings)) config.set("settings", settings);

// ACT: 仅初始化尚未配置的文本供应商；已有列表（包括用户清空的列表）保持原样。
if (!usesAccounts() && !config.has("settings.customProviders")) {
  config.set("settings.customProviders", autoInstallProviders.map(({ id, label, icon, version, apiUrl, protocol, models }) =>
    ({ id, label, icon, version, apiUrl, protocol, models, apiKey: "" })));
}

const scopedConfig = new Proxy(config, {
  get(target, property) {
    if (property === "get") return (key: string, fallback?: unknown) => {
      if (!usesAccounts()) return target.get(key as never, fallback as never);
      // ACT: 启动阶段没有用户配置；绝不借用实例的模型Key作为默认值。
      const record = currentAccount()?.configuration ?? {};
      let value: unknown = record;
      for (const part of key.split(".")) value = value && typeof value === "object" && Object.hasOwn(value, part) ? (value as Record<string, unknown>)[part] : undefined;
      return structuredClone(value === undefined ? fallback : value);
    };
    if (property === "set" || property === "delete") return (key: string, value?: unknown) => {
      if (!usesAccounts()) return property === "delete" ? target.delete(key as never) : target.set(key as never, value as never);
      const account = requireAccount();
      const next = structuredClone(account.configuration);
      const parts = key.split(".");
      if (parts.some(part => !part || ["__proto__", "prototype", "constructor"].includes(part))) throw Object.assign(new Error("配置路径无效"), { status: 400 });
      let record = next;
      for (const part of parts.slice(0, -1)) {
        const child = record[part];
        record = record[part] = child && typeof child === "object" && !Array.isArray(child) ? child as Record<string, unknown> : {};
      }
      if (property === "delete") delete record[parts.at(-1)!]; else record[parts.at(-1)!] = value;
      return saveConfiguration(next);
    };
    if (property === "onDidChange" && usesAccounts()) return () => () => {};
    const value = Reflect.get(target, property, target);
    return typeof value === "function" ? value.bind(target) : value;
  },
});

export default scopedConfig;
