type Settings = Record<string, unknown>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function invalid(message: string): never {
  throw Object.assign(new Error(message), { status: 400 });
}

function preserveKey(provider: Record<string, unknown>, previous: unknown) {
  if (Object.hasOwn(provider, "apiKey")) {
    const key = provider.apiKey;
    if (typeof key !== "string" || key.trim().length > 8192 || /[\r\n]/.test(key)) invalid("API Key 格式无效");
    provider.apiKey = key.trim();
  } else {
    provider.apiKey = isRecord(previous) && typeof previous.apiKey === "string" ? previous.apiKey : "";
  }
  delete provider.apiKeyConfigured;
}

export function prepareSettings(next: Settings, previous: Settings): Settings {
  const settings = structuredClone(next);
  if (Object.hasOwn(settings, "customProviders")) {
    if (!Array.isArray(settings.customProviders)) invalid("文本供应商配置必须是数组");
    const ids = new Set<string>();
    for (const provider of settings.customProviders) {
      if (!isRecord(provider) || typeof provider.id !== "string" || !provider.id.trim() || ids.has(provider.id)) invalid("文本供应商 ID 无效或重复");
      ids.add(provider.id);
      const existing = Array.isArray(previous.customProviders)
        ? previous.customProviders.find(item => isRecord(item) && item.id === provider.id) : undefined;
      preserveKey(provider, existing);
    }
  }
  if (Object.hasOwn(settings, "mediaProviderConfigs")) {
    if (!isRecord(settings.mediaProviderConfigs)) invalid("媒体供应商配置必须是对象");
    const existing = isRecord(previous.mediaProviderConfigs) ? previous.mediaProviderConfigs : {};
    for (const [id, config] of Object.entries(settings.mediaProviderConfigs)) {
      if (!isRecord(config)) invalid("媒体供应商配置必须是对象");
      preserveKey(config, Object.hasOwn(existing, id) ? existing[id] : undefined);
    }
  }
  return settings;
}

export function publicSettings(value: Settings, credentialSettings: Settings = value): Settings {
  const settings = structuredClone(value);
  const providers = [
    ...(Array.isArray(settings.customProviders) ? settings.customProviders : []),
    ...(isRecord(settings.mediaProviderConfigs) ? Object.values(settings.mediaProviderConfigs) : []),
  ];
  for (const provider of providers) {
    if (!isRecord(provider)) continue;
    provider.apiKeyConfigured = typeof provider.apiKey === "string" && !!provider.apiKey.trim();
    delete provider.apiKey;
  }
  return redactValue(settings, credentialValues(credentialSettings)) as Settings;
}

export function languageKey(settings: Settings, id: string, apiUrl: string, protocol: string) {
  const provider = Array.isArray(settings.customProviders)
    ? settings.customProviders.find(item => isRecord(item) && item.id === id) : undefined;
  if (!isRecord(provider) || provider.apiUrl !== apiUrl || provider.protocol !== protocol) {
    throw Object.assign(new Error("供应商配置已变更，请刷新后重试"), { status: 409 });
  }
  return typeof provider.apiKey === "string" ? provider.apiKey : "";
}

function credentialValues(settings: Settings) {
  return [
    ...(Array.isArray(settings.customProviders) ? settings.customProviders : []),
    ...(isRecord(settings.mediaProviderConfigs) ? Object.values(settings.mediaProviderConfigs) : []),
  ].flatMap(provider => isRecord(provider) && typeof provider.apiKey === "string" && provider.apiKey.trim() ? [provider.apiKey.trim()] : []);
}

function redactValue(value: unknown, secrets: string[]): unknown {
  if (typeof value === "string") return secrets.reduce((text, secret) => text.replaceAll(secret, "[Key]"), value);
  if (Array.isArray(value)) return value.map(item => redactValue(item, secrets));
  if (isRecord(value)) return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, redactValue(item, secrets)]));
  return value;
}

export function redactMessage(message: string, settings: Settings, extra: string[] = []) {
  return redactValue(message, [...credentialValues(settings), ...extra.filter(Boolean)]) as string;
}
