import { studio } from "@/ports";
import { prototype } from "@/ports/prototype";
import { loadSharedState, sharedStorage, sharedStoreKeys } from "@/stores/sharedState";
import { browserWorkspaceMode } from "@/lib/browserWorkspaceFiles";
import axios from "axios";
import { normalizeLocale } from "@toonflow/i18n";
import { computed, nextTick, ref, watch } from "vue";
import { ElMessage } from "element-plus";
import { invalidateNodeModels } from "@toonflow/nodes-scaffold/nodeAi";
import { canvasShortcutFields, defaultCanvasShortcuts, getShortcutBindings, isShortcutAllowed, normalizeShortcut, type CanvasShortcuts } from "@/lib/canvasShortcuts";
import { normalizeNodeMenu, type StoredNodeMenuItem } from "@toonflow/server/nodeMenu";
import { accountsRequired } from "./accounts";
import "element-plus/es/components/message/style/css";

export const settings = ref<Record<string, unknown>>({});
// ACT: 页面在 loadSettings 完成后才挂载，加载标记仅保留在设置初始化与自动保存内部。
let settingsReady = false;
let saveQueue = Promise.resolve();
let lastSettingsSave: Promise<unknown> = Promise.resolve();
let applyingSettings = false;
let settingsRevision: number | undefined;

export const settingsStorage = {
  getItem(key: string) {
    if (!browserWorkspaceMode && sharedStoreKeys.includes(key)) return sharedStorage.getItem(key);
    if (browserWorkspaceMode && localStorage.getItem(key) !== null) return localStorage.getItem(key);
    const stores = settings.value.stores as Record<string, unknown> | undefined;
    if (stores && Object.hasOwn(stores, key)) return JSON.stringify(stores[key]);
    // ACT: 只迁移当前来源可读取的旧缓存，保留原值；不同端口的 localStorage 不能互读。
    const value = prototype.readLegacyState(key);
    if (value !== null) settingsStorage.setItem(key, value);
    return value;
  },
  setItem(key: string, value: string) {
    if (!browserWorkspaceMode && sharedStoreKeys.includes(key)) { sharedStorage.setItem(key, value); return; }
    if (browserWorkspaceMode) { localStorage.setItem(key, value); return; }
    settings.value.stores = { ...(settings.value.stores as Record<string, unknown> | undefined), [key]: JSON.parse(value) };
  },
};

export const defaultUiSettings = { theme: "dark", language: "system", primaryColor: "#409eff", fontScale: 100, mobileScale: 75, radius: 8, startupAnimation: true };
export const uiSettings = computed(() => {
  const raw = settings.value.ui;
  const ui = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
  return {
    language: normalizeLocale(ui.language) ?? "system" as const,
    theme: ui.theme === "dark" || ui.theme === "system" || ui.theme === "light" ? ui.theme : defaultUiSettings.theme,
    primaryColor: typeof ui.primaryColor === "string" && /^#[\da-f]{6}$/i.test(ui.primaryColor) ? ui.primaryColor : defaultUiSettings.primaryColor,
    fontScale: typeof ui.fontScale === "number" && Number.isFinite(ui.fontScale) ? Math.min(125, Math.max(85, ui.fontScale)) : defaultUiSettings.fontScale,
    mobileScale: typeof ui.mobileScale === "number" && Number.isFinite(ui.mobileScale) ? Math.min(100, Math.max(50, ui.mobileScale)) : defaultUiSettings.mobileScale,
    radius: typeof ui.radius === "number" && Number.isFinite(ui.radius) ? Math.min(16, Math.max(0, ui.radius)) : defaultUiSettings.radius,
    startupAnimation: ui.startupAnimation !== false,
  };
});

export function updateUiSettings(patch: Partial<typeof defaultUiSettings>) {
  const current = settings.value.ui;
  settings.value = { ...settings.value, ui: { ...(current && typeof current === "object" && !Array.isArray(current) ? current : {}), ...patch } };
}

export const generalSettings = computed(() => {
  const raw = settings.value.general;
  const general = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
  const shortcuts = general.canvasShortcuts && typeof general.canvasShortcuts === "object" && !Array.isArray(general.canvasShortcuts)
    ? general.canvasShortcuts as Record<string, unknown> : {};
  const savedBindings = new Map(canvasShortcutFields.flatMap(field => {
    const value = shortcuts[field.id];
    const binding = typeof value === "string" ? normalizeShortcut(value) : undefined;
    return binding !== undefined && isShortcutAllowed(field, binding) ? [[field.id, binding] as const] : [];
  }));
  return {
    nodeMenu: normalizeNodeMenu(general.nodeMenu),
    canvasCompositingEnabled: general.canvasCompositingEnabled === true,
    canvasEdgeAnimationEnabled: general.canvasEdgeAnimationEnabled !== false,
    canvasEdgeColorMode: general.canvasEdgeColorMode === "none" || general.canvasEdgeColorMode === "custom" ? general.canvasEdgeColorMode : "theme",
    canvasEdgeColor: typeof general.canvasEdgeColor === "string" && /^#[\da-f]{6}$/i.test(general.canvasEdgeColor) ? general.canvasEdgeColor : defaultUiSettings.primaryColor,
    canvasShortcuts: Object.fromEntries(canvasShortcutFields.map(field => {
      if (savedBindings.has(field.id)) return [field.id, savedBindings.get(field.id)];
      const binding = defaultCanvasShortcuts[field.id];
      const conflicts = canvasShortcutFields.some(other => other.gesture === field.gesture
        && getShortcutBindings(savedBindings.get(other.id) ?? "").some(value => getShortcutBindings(binding).includes(value)));
      return [field.id, conflicts ? "" : binding];
    })) as CanvasShortcuts,
  };
});

export function updateGeneralSettings(patch: Omit<Partial<typeof generalSettings.value>, "nodeMenu"> & { nodeMenu?: StoredNodeMenuItem[] }) {
  const current = settings.value.general;
  settings.value = { ...settings.value, general: { ...(current && typeof current === "object" && !Array.isArray(current) ? current : {}), ...patch } };
}

export const privacySettings = computed(() => {
  const raw = settings.value.privacy;
  const privacy = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
  return {
    dataCollectionEnabled: privacy.dataCollectionEnabled !== false,
    anonymousId: typeof privacy.anonymousId === "string" ? privacy.anonymousId : "",
  };
});

export type CustomProviderModel = { id: string; label: string; contextWindow?: number; maxOutputTokens?: number };
export type CustomProvider = { id: string; label: string; icon?: string; version?: string; apiUrl: string; apiKey?: string; apiKeyConfigured?: boolean; protocol: string; models: CustomProviderModel[] };
export const customProviders = computed<CustomProvider[]>(() => Array.isArray(settings.value.customProviders)
  ? settings.value.customProviders.filter((item): item is CustomProvider => !!item && typeof item.id === "string" && typeof item.label === "string" && Array.isArray(item.models)
    && item.models.every((model: CustomProviderModel) => !!model && typeof model.id === "string" && typeof model.label === "string"))
  : []);

export const modelChoices = computed(() => customProviders.value.filter(provider => provider.apiKeyConfigured).flatMap(provider => provider.models.map(model => ({
  value: JSON.stringify([provider.id, model.id]), providerId: provider.id, modelId: model.id, label: model.label, contextWindow: model.contextWindow,
}))));

export async function loadSettings() {
  if (settingsReady) return;
  const { data } = await studio.loadApplicationSettings({ headers: { "Cache-Control": "no-cache", "x-toonflow-workspace": "1" } });
  if (settingsReady) return;
  if (data.code !== 200 || !data.data || typeof data.data !== "object" || Array.isArray(data.data)) {
    throw new Error("读取设置失败");
  }
  let preferences: Record<string, unknown> = {};
  if (browserWorkspaceMode) {
    try {
      const stored = JSON.parse(localStorage.getItem("aiStudio.preferences") ?? "{}");
      if (stored && typeof stored === "object" && !Array.isArray(stored)) {
        preferences = Object.fromEntries(["ui", "general", "privacy"].filter(key => stored[key] && typeof stored[key] === "object" && !Array.isArray(stored[key])).map(key => [key, stored[key]]));
      }
    } catch { throw new Error("浏览器外观设置损坏，请清除此项设置后重试；项目数据未改动"); }
  }
  const { settingsRevision: revision, ...saved } = data.data;
  if (accountsRequired.value && (!Number.isSafeInteger(revision) || revision < 1)) throw new Error("个人设置版本无效，请刷新重试");
  settingsRevision = revision;
  settings.value = { ...saved, ...preferences };
  const ui = settings.value.ui && typeof settings.value.ui === "object" && !Array.isArray(settings.value.ui) ? settings.value.ui as Record<string, unknown> : {};
  if (browserWorkspaceMode && ui.themePreset !== "black") {
    // ACT: 本轮将已有原型切为黑色一次，后续手动选择浅色／跟随系统仍然保留。
    settings.value = { ...settings.value, ui: { ...ui, theme: "dark", themePreset: "black" } };
    await saveSettings();
  }
  if (!browserWorkspaceMode) await loadSharedState();
  // 等初始化引发的监听执行完，再允许自动保存。
  await nextTick();
  settingsReady = true;
}

export function saveSettings(update?: (current: Record<string, unknown>) => Record<string, unknown> | undefined) {
  // ACT: 队列内读取最新配置再计算变更，确认成功后发布；仅协调当前页面的保存。
  const saving = saveQueue.then(async () => {
    const patch = update?.(settings.value);
    if (update && !patch) return false;
    if (browserWorkspaceMode && (!patch || Object.keys(patch).every(key => ["ui", "general", "privacy"].includes(key)))) {
      if (patch) settings.value = { ...settings.value, ...patch };
      const preferences = Object.fromEntries(["ui", "general", "privacy"].filter(key => settings.value[key] !== undefined).map(key => [key, settings.value[key]]));
      localStorage.setItem("aiStudio.preferences", JSON.stringify(preferences));
      return true;
    }
    const requestedNodeMenu = JSON.stringify(((patch?.general ?? settings.value.general) as { nodeMenu?: unknown } | undefined)?.nodeMenu);
    const { data } = await studio.saveApplicationSettings<{ code: number; data: { settings: Record<string, unknown>; settingsRevision?: number; customProviders?: CustomProvider[]; mediaProvider?: { id: string }; modelRefreshErrors?: string[]; nodeMenu?: StoredNodeMenuItem[] | null } | null }>({ settings: { ...settings.value, ...patch }, ...(accountsRequired.value ? { expectedRevision: settingsRevision } : {}) }, { headers: { "x-toonflow-workspace": "1" } });
    if (data.code !== 200) throw new Error("保存设置失败");
    if (!data.data?.settings || typeof data.data.settings !== "object" || Array.isArray(data.data.settings)) throw new Error("设置已提交，但未收到脱敏配置，请刷新后继续");
    if (accountsRequired.value && (!Number.isSafeInteger(data.data.settingsRevision) || data.data.settingsRevision! < 1)) throw new Error("设置已提交，但未收到有效版本，请刷新后继续");
    settingsRevision = data.data.settingsRevision;
    const providers = data.data?.customProviders;
    if ((patch && Object.hasOwn(patch, "customProviders")) || providers) invalidateNodeModels("language");
    if (patch || providers) {
      applyingSettings = true;
      try {
        const next = { ...settings.value, ...patch };
        // ACT: 凭据只存在于本次提交参数，Store 使用服务端回读的脱敏配置。
        for (const key of ["customProviders", "mediaProviderConfigs"]) {
          if (Object.hasOwn(data.data.settings, key)) next[key] = data.data.settings[key];
          else delete next[key];
        }
        settings.value = next;
      }
      finally { applyingSettings = false; }
    }
    if (data.data && Object.hasOwn(data.data, "nodeMenu")
      && requestedNodeMenu === JSON.stringify((settings.value.general as { nodeMenu?: unknown } | undefined)?.nodeMenu)
      && requestedNodeMenu !== JSON.stringify(data.data.nodeMenu ?? undefined)) {
      applyingSettings = true;
      try {
        const general = { ...(settings.value.general as Record<string, unknown> | undefined) };
        if (data.data.nodeMenu?.length) general.nodeMenu = data.data.nodeMenu;
        else delete general.nodeMenu;
        settings.value = { ...settings.value, general };
      } finally { applyingSettings = false; }
    }
    if (data.data?.mediaProvider) {
      invalidateNodeModels("media");
      window.dispatchEvent(new CustomEvent("toonflow:plugin-installed", { detail: { type: "provider", name: data.data.mediaProvider.id } }));
    }
    if (patch && Object.hasOwn(patch, "mediaProviderConfigs")) {
      window.dispatchEvent(new Event("toonflow:provider-config-changed"));
    }
    if (data.data?.modelRefreshErrors?.length) ElMessage.warning(`API Key 已保存，部分模型获取失败：${data.data.modelRefreshErrors.join("；")}`);
    return true;
  });
  lastSettingsSave = saving;
  saveQueue = saving.then(() => {}, () => {});
  return saving;
}

export async function flushSettings() { await nextTick(); await lastSettingsSave; }

watch(settings, () => {
  if (!settingsReady || applyingSettings) return;
  void saveSettings().catch(() => { ElMessage.error("设置保存失败，请稍后重试"); });
}, { deep: true, flush: "sync" });
