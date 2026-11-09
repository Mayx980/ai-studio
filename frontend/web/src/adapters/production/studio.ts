import axios, { type AxiosInstance, type AxiosRequestConfig } from "axios";
import { locale } from "@toonflow/i18n/vue";
import { StudioError, type StudioPort, type StudioResponse, type StudioNoticeFeed, type HostConnection } from "@/ports";
import { loadToolComponent } from "@toonflow/tool-client";
import { readEvents, openEvents } from "./streams";

const applicationClient = axios.create();
const workspaceClient = axios.create({ baseURL: "/api/workspaces/files", headers: { "x-toonflow-workspace": "1" } });
const marketplaceClient = axios.create({ baseURL: "https://api.toonflow.net" });

for (const client of [axios, applicationClient, workspaceClient]) {
  client.interceptors.request.use(config => {
    const url = new URL(client.getUri(config), window.location.href);
    if (url.origin === window.location.origin && url.pathname.startsWith("/api/")) config.headers.set("Accept-Language", locale.value);
    return config;
  });
}

async function request<T>(client: AxiosInstance, method: string, url: string, inputs: unknown[]): Promise<StudioResponse<T>> {
  const command = !["get", "delete"].includes(method);
  const options = inputs[command ? 1 : 0];
  if (options !== undefined && (options === null || typeof options !== "object" || Array.isArray(options))) throw new TypeError("操作选项无效");
  try {
    const response = await client.request<T>({ ...(options as AxiosRequestConfig | undefined), method, url, ...(command ? { data: inputs[0] } : {}) });
    return { data: response.data };
  } catch (error) {
    if (!axios.isAxiosError(error)) throw error;
    const headers = Object.fromEntries(Object.entries(error.response?.headers ?? {}).map(([key, value]) => [key, String(value)]));
    throw new StudioError(error.message, error.response?.data, error.response?.status, headers, axios.isCancel(error), error.code);
  }
}

const commandHeaders = () => ({ "Accept-Language": locale.value, "Content-Type": "application/json", "x-toonflow-workspace": "1" });

async function submit(url: string, input: object, options: RequestInit = {}) {
  const response = await fetch(url, { method: "POST", headers: commandHeaders(), body: JSON.stringify(input), ...options });
  if (!response.ok) {
    const detail = await response.json().catch(() => undefined);
    throw new StudioError(detail?.message || `请求失败（${response.status}）`, detail, response.status);
  }
}

function observe<T>(url: string): StudioNoticeFeed<T> {
  const connection = new EventSource(url);
  const feed: StudioNoticeFeed<T> = { get closed() { return connection.readyState === EventSource.CLOSED; }, close: () => connection.close() };
  connection.onopen = () => feed.onConnected?.();
  connection.onerror = () => feed.onFailure?.();
  connection.onmessage = event => {
    let notice: T;
    try { notice = JSON.parse(event.data) as T; }
    catch { return; }
    feed.onNotice?.(notice);
  };
  return feed;
}

export function createProductionPort(): StudioPort {
  return {
    assetMediaSource: path => `/api/assets/read?path=${encodeURIComponent(path)}`,
    async loadHostConnection(signal) {
      return (await request<HostConnection>(applicationClient, "get", "/api/connection/connection", [{ signal, headers: { "Cache-Control": "no-store" } }])).data;
    },
    notifyDesktopReady: failed => submit("/api/desktop/ready", { failed }, { headers: { ...commandHeaders(), "x-toonflow-desktop": "1" } }),
    openDeveloperTools: () => submit("/api/desktop/devtools", {}, { headers: { ...commandHeaders(), "x-toonflow-desktop": "1" } }),
    async closeAssistantSession(sessionId) {
      try { await submit("/api/singleAgent/control", { sessionId, action: "close" }, { keepalive: true }); }
      catch (error) { if (!(error instanceof StudioError) || error.status !== 404) throw error; }
    },
    async *streamConversation<T extends { type: string }>(input: object, signal: AbortSignal) {
      yield* readEvents<T>(await fetch("/api/agent", { method: "POST", headers: commandHeaders(), body: JSON.stringify(input), signal }), signal);
    },
    async *streamAssistantSession<T extends { type: string }>(input: object, signal: AbortSignal) {
      yield* readEvents<T>(await fetch("/api/singleAgent/run", { method: "POST", headers: commandHeaders(), body: JSON.stringify(input), signal }), signal);
    },
    async *streamProviderDebug<T extends { type: string }>(input: object, signal: AbortSignal) {
      yield* readEvents<T>(await fetch("/api/providers/debug/run", { method: "POST", headers: commandHeaders(), body: JSON.stringify(input), signal }), signal);
    },
    publishCanvasResult: (input, options) => submit("/api/agent/canvasResult", input, options),
    answerConversationQuestion: input => submit("/api/agent/answer", input),
    publishToolControl: (kind, input, token, signal) => submit(`/api/mcp/control/${kind}`, input, { headers: { ...commandHeaders(), Authorization: `Bearer ${token}` }, signal }),
    observeToolControl<T>(connectionId: string, token: string, signal: AbortSignal) {
      return openEvents<T>(`/api/mcp/control/events?connectionId=${encodeURIComponent(connectionId)}`, { headers: { ...commandHeaders(), Authorization: `Bearer ${token}` }, signal }, signal, "events");
    },
    observeMediaAvailability: () => observe("/api/ffmpeg/events"),
    observeProviderBalances: <T>(accountIds: string) => observe<T>(`/api/ai/media/balanceEvents?accountIds=${encodeURIComponent(accountIds)}`),
    async loadPluginSource(url, kind) {
      const address = new URL(url, window.location.href);
      if (kind === "editor" && (address.origin !== window.location.origin || !address.pathname.startsWith("/api/ext/"))) throw new Error("扩展脚本地址无效");
      const response = await fetch(url);
      if (!response.ok) throw new Error(`插件脚本加载失败（${response.status}）`);
      return response.text();
    },
    loadToolComponent,
    controlAssistantSession: <T>(...inputs: unknown[]) => request<T>(applicationClient, "post", "/api/singleAgent/control", inputs),
    completeAssistantTool: <T>(...inputs: unknown[]) => request<T>(applicationClient, "post", "/api/singleAgent/toolResult", inputs),
    createAssistantSession: <T>(...inputs: unknown[]) => request<T>(applicationClient, "post", "/api/singleAgent/create", inputs),
    addMediaProvider: <T>(...inputs: unknown[]) => request<T>(applicationClient, "post", "/api/providers/media/add", inputs),
    browseMarketplace: <T>(...inputs: unknown[]) => request<T>(marketplaceClient, "post", "/v1/plugin/getPlugin", inputs),
    chooseDownloadDestination: <T>(...inputs: unknown[]) => request<T>(applicationClient, "post", "/api/desktop/selectSaveFile", inputs),
    chooseLocalDirectory: <T>(...inputs: unknown[]) => request<T>(applicationClient, "post", "/api/desktop/selectDirectory", inputs),
    chooseProviderDocument: <T>(...inputs: unknown[]) => request<T>(applicationClient, "post", "/api/desktop/providerFile/select", inputs),
    chooseWorkspaceDirectory: <T>(...inputs: unknown[]) => request<T>(applicationClient, "post", "/api/workspaces/selectDirectory", inputs),
    connectAgent: <T>(...inputs: unknown[]) => request<T>(applicationClient, "post", "/api/agents/connect", inputs),
    copyWorkspaceFile: <T>(...inputs: unknown[]) => request<T>(workspaceClient, "post", "/copy", inputs),
    createAssetFolder: <T>(...inputs: unknown[]) => request<T>(applicationClient, "post", "/api/assets/mkdir", inputs),
    createConversation: <T>(...inputs: unknown[]) => request<T>(applicationClient, "post", "/api/agent/create", inputs),
    createPayment: <T>(...inputs: unknown[]) => request<T>(marketplaceClient, "post", "/v1/recharge/pay", inputs),
    createSkillFile: <T>(...inputs: unknown[]) => request<T>(applicationClient, "post", "/api/skills/create", inputs),
    createWorkspaceFolder: <T>(...inputs: unknown[]) => request<T>(workspaceClient, "post", "/mkdir", inputs),
    disconnectDevice: <T>(...inputs: unknown[]) => request<T>(applicationClient, "post", "/api/mobileLink/revoke", inputs),
    downloadResource: <T>(selection0: unknown, ...inputs: unknown[]) => request<T>(applicationClient, "get", String(selection0), inputs),
    exportPlugin: <T>(...inputs: unknown[]) => request<T>(applicationClient, "get", "/api/plugins/export", inputs),
    importWorkspaceImage: <T>(...inputs: unknown[]) => request<T>(workspaceClient, "post", "/importImage", inputs),
    inspectProviderDocument: <T>(...inputs: unknown[]) => request<T>(applicationClient, "post", "/api/providers/debug/inspect", inputs),
    inspectWorkspace: <T>(...inputs: unknown[]) => request<T>(applicationClient, "get", "/api/workspaces/check", inputs),
    installLocalPlugin: <T>(...inputs: unknown[]) => request<T>(applicationClient, "post", "/api/desktop/plugins/install", inputs),
    installPlugin: <T>(selection0: unknown, ...inputs: unknown[]) => request<T>(applicationClient, "post", `/api/${selection0}/install`, inputs),
    listAssets: <T>(...inputs: unknown[]) => request<T>(applicationClient, "get", "/api/assets/list", inputs),
    listConversationSkills: <T>(...inputs: unknown[]) => request<T>(applicationClient, "get", "/api/agent/skills", inputs),
    listConversations: <T>(...inputs: unknown[]) => request<T>(applicationClient, "get", "/api/agent/list", inputs),
    listDocumentEditors: <T>(...inputs: unknown[]) => request<T>(applicationClient, "get", "/api/ext/list", inputs),
    listInstalledNodes: <T>(...inputs: unknown[]) => request<T>(applicationClient, "get", "/api/nodes/get", inputs),
    listInstalledPlugins: <T>(selection0: unknown, selection1: unknown, ...inputs: unknown[]) => request<T>(applicationClient, "get", `/api/${selection0}/${selection1}`, inputs),
    listInstalledTools: <T>(...inputs: unknown[]) => request<T>(applicationClient, "get", "/api/tools/get", inputs),
    listMediaProviders: <T>(...inputs: unknown[]) => request<T>(applicationClient, "get", "/api/providers/media/list", inputs),
    listPaymentOptions: <T>(...inputs: unknown[]) => request<T>(marketplaceClient, "get", "/v1/recharge/getRechargeData", inputs),
    listSkillFiles: <T>(...inputs: unknown[]) => request<T>(applicationClient, "get", "/api/skills/list", inputs),
    listSponsors: <T>(...inputs: unknown[]) => request<T>(marketplaceClient, "post", "/web/sponsor/getSponsorList", inputs),
    listWorkspaceDirectories: <T>(...inputs: unknown[]) => request<T>(applicationClient, "get", "/api/workspaces/list", inputs),
    listWorkspaceFiles: <T>(...inputs: unknown[]) => request<T>(workspaceClient, "get", "/list", inputs),
    loadAgentConnections: <T>(...inputs: unknown[]) => request<T>(applicationClient, "get", "/api/agents/a2a/get", inputs),
    loadApplicationSettings: <T>(...inputs: unknown[]) => request<T>(applicationClient, "get", "/api/settings/get", inputs),
    loadDefaultPrompt: <T>(...inputs: unknown[]) => request<T>(applicationClient, "get", "/api/settings/systemPrompt", inputs),
    loadDesktopUpdate: <T>(...inputs: unknown[]) => request<T>(applicationClient, "get", "/api/desktop/update", inputs),
    loadDeviceConnections: <T>(...inputs: unknown[]) => request<T>(applicationClient, "get", "/api/mobileLink/status", inputs),
    loadLanguageModels: <T>(...inputs: unknown[]) => request<T>(applicationClient, "post", "/api/providers/models", inputs),
    loadMediaModels: <T>(...inputs: unknown[]) => request<T>(applicationClient, "post", "/api/providers/media/models", inputs),
    loadMediaToolProgress: <T>(...inputs: unknown[]) => request<T>(applicationClient, "get", "/api/ffmpeg/progress", inputs),
    loadMediaToolStatus: <T>(...inputs: unknown[]) => request<T>(applicationClient, "get", "/api/ffmpeg/status", inputs),
    loadMentionContent: <T>(...inputs: unknown[]) => request<T>(applicationClient, "get", "/api/agent/mentionSource", inputs),
    loadPaymentStatus: <T>(...inputs: unknown[]) => request<T>(marketplaceClient, "get", "/v1/recharge/queryOrder", inputs),
    loadPersonalization: <T>(...inputs: unknown[]) => request<T>(applicationClient, "get", "/api/settings/personalization/get", inputs),
    loadProviderBalance: <T>(...inputs: unknown[]) => request<T>(applicationClient, "post", "/api/ai/media/balance", inputs),
    loadToolConnection: <T>(...inputs: unknown[]) => request<T>(applicationClient, "get", "/api/mcp/status", inputs),
    manageDesktopUpdate: <T>(selection0: unknown, ...inputs: unknown[]) => request<T>(applicationClient, "post", `/api/desktop/update/${selection0}`, inputs),
    manageHostConnection: <T>(selection0: unknown, ...inputs: unknown[]) => request<T>(applicationClient, "post", `/api/connection/${selection0}`, inputs),
    manageMediaTool: <T>(selection0: unknown, ...inputs: unknown[]) => request<T>(applicationClient, "post", `/api/ffmpeg/${selection0}`, inputs),
    moveSkillFile: <T>(...inputs: unknown[]) => request<T>(applicationClient, "put", "/api/skills/move", inputs),
    openConversation: <T>(...inputs: unknown[]) => request<T>(applicationClient, "get", "/api/agent/get", inputs),
    pairDevice: <T>(...inputs: unknown[]) => request<T>(applicationClient, "post", "/api/mobileLink/pairing", inputs),
    prepareMobileDownload: <T>(...inputs: unknown[]) => request<T>(applicationClient, "post", "/api/mobile/exports", inputs),
    readAgentDocument: <T>(...inputs: unknown[]) => request<T>(applicationClient, "get", "/api/agents/read", inputs),
    readAsset: <T>(...inputs: unknown[]) => request<T>(applicationClient, "get", "/api/assets/read", inputs),
    readClipboard: <T>(...inputs: unknown[]) => request<T>(applicationClient, "post", "/api/desktop/clipboard/read", inputs),
    readIntegrationGuide: <T>(...inputs: unknown[]) => request<T>(applicationClient, "get", "/api/mcp/skill", inputs),
    readProviderDocument: <T>(...inputs: unknown[]) => request<T>(applicationClient, "post", "/api/desktop/providerFile/read", inputs),
    readSkillFile: <T>(...inputs: unknown[]) => request<T>(applicationClient, "get", "/api/skills/read", inputs),
    readWorkspaceFile: <T>(...inputs: unknown[]) => request<T>(workspaceClient, "get", "/read", inputs),
    recordUsage: <T>(...inputs: unknown[]) => request<T>(applicationClient, "post", "https://api.toonflow.net/web/telemetry/report", inputs),
    removeAsset: <T>(...inputs: unknown[]) => request<T>(applicationClient, "delete", "/api/assets/remove", inputs),
    removeConversationMessage: <T>(...inputs: unknown[]) => request<T>(applicationClient, "delete", "/api/agent/message", inputs),
    removeMediaProvider: <T>(...inputs: unknown[]) => request<T>(applicationClient, "delete", "/api/providers/media/delete", inputs),
    removePlugin: <T>(selection0: unknown, ...inputs: unknown[]) => request<T>(applicationClient, "delete", `/api/${selection0}/uninstall`, inputs),
    removeWorkspaceFile: <T>(...inputs: unknown[]) => request<T>(workspaceClient, "delete", "/remove", inputs),
    renameAsset: <T>(...inputs: unknown[]) => request<T>(applicationClient, "post", "/api/assets/rename", inputs),
    renameConversation: <T>(...inputs: unknown[]) => request<T>(applicationClient, "patch", "/api/agent/rename", inputs),
    renameWorkspaceFile: <T>(...inputs: unknown[]) => request<T>(workspaceClient, "post", "/rename", inputs),
    reorderSkillFiles: <T>(...inputs: unknown[]) => request<T>(applicationClient, "put", "/api/skills/order", inputs),
    revealWorkspaceFile: <T>(...inputs: unknown[]) => request<T>(workspaceClient, "post", "/reveal", inputs),
    saveAgentConnections: <T>(...inputs: unknown[]) => request<T>(applicationClient, "put", "/api/agents/a2a/save", inputs),
    saveAgentDocument: <T>(...inputs: unknown[]) => request<T>(applicationClient, "put", "/api/agents/save", inputs),
    saveApplicationSettings: <T>(...inputs: unknown[]) => request<T>(applicationClient, "put", "/api/settings/save", inputs),
    saveAsset: <T>(...inputs: unknown[]) => request<T>(applicationClient, "put", "/api/assets/save", inputs),
    saveDeviceConnections: <T>(...inputs: unknown[]) => request<T>(applicationClient, "put", "/api/mobileLink/config", inputs),
    saveDocumentEditor: <T>(...inputs: unknown[]) => request<T>(applicationClient, "put", "/api/ext/save", inputs),
    saveLocalDownload: <T>(...inputs: unknown[]) => request<T>(applicationClient, "post", "/api/desktop/saveFile", inputs),
    saveMediaProvider: <T>(...inputs: unknown[]) => request<T>(applicationClient, "put", "/api/providers/media/save", inputs),
    savePersonalization: <T>(...inputs: unknown[]) => request<T>(applicationClient, "put", "/api/settings/personalization/save", inputs),
    savePluginConfiguration: <T>(selection0: unknown, ...inputs: unknown[]) => request<T>(applicationClient, "put", `/api/${selection0}/save`, inputs),
    saveSkillFile: <T>(...inputs: unknown[]) => request<T>(applicationClient, "put", "/api/skills/save", inputs),
    setPluginEnabled: <T>(selection0: unknown, ...inputs: unknown[]) => request<T>(applicationClient, "put", `/api/${selection0}/setEnabled`, inputs),
    toggleMarketplaceCollection: <T>(...inputs: unknown[]) => request<T>(marketplaceClient, "post", "/v1/plugin/toggleCollection", inputs),
    validateMediaProvider: <T>(...inputs: unknown[]) => request<T>(applicationClient, "post", "/api/providers/media/validate", inputs),
    writeClipboard: <T>(...inputs: unknown[]) => request<T>(applicationClient, "post", "/api/desktop/clipboard/write", inputs),
    writeWorkspaceFile: <T>(...inputs: unknown[]) => request<T>(workspaceClient, "put", "/write", inputs),
  };
}
