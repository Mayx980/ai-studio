import { StudioError, type StudioAction, type StudioPort, type StudioNoticeFeed, type StudioResponse } from "@/ports";

export const scenarioNames = ["empty", "loading", "error", "permission", "formValidation", "login", "initialPassword", "accountPassword"] as const;
export type ScenarioName = typeof scenarioNames[number];

const unavailable = async () => { throw new StudioError("隔离预览不执行此操作，请使用真实开发服务", { message: "隔离预览不执行此操作，请使用真实开发服务" }, 403); };

function noticeFeed<T>(): StudioNoticeFeed<T> {
  let closed = false;
  return { get closed() { return closed; }, close() { closed = true; } };
}

export function createScenarioPort(scenario: ScenarioName): StudioPort {
  let scenarioSettings: Record<string, unknown> = { helloCompleted: true, privacy: { dataCollectionEnabled: false }, ui: { startupAnimation: false }, stores: { "toonflow.projectList": { project: null, projectList: [] } } };
  const value = (data: unknown): StudioAction => async <T>() => ({ data: { code: 200, data, message: "" } as T });
  const directoryListing: StudioAction = async (...inputs) => {
    const options = inputs[0] as { signal?: AbortSignal } | undefined;
    if (scenario === "loading") {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, 12000);
        options?.signal?.addEventListener("abort", () => { clearTimeout(timer); reject(options.signal?.reason); }, { once: true });
      });
    }
    if (scenario === "error" || scenario === "permission") {
      const message = scenario === "permission" ? "此场景没有访问目录的权限" : "目录暂时不可用，请重试";
      throw new StudioError(message, { message }, scenario === "permission" ? 403 : 503);
    }
    return value({ path: "", absolutePath: "/scenario", parentPath: null, entries: [] })(...inputs);
  };
  return {
    assetMediaSource: () => undefined,
    loadHostConnection: async () => ({ mode: "local" }),
    notifyDesktopReady: unavailable,
    openDeveloperTools: unavailable,
    closeAssistantSession: unavailable,
    async *streamConversation() { await unavailable(); },
    async *streamAssistantSession() { await unavailable(); },
    async *streamProviderDebug() { await unavailable(); },
    publishCanvasResult: unavailable,
    answerConversationQuestion: unavailable,
    publishToolControl: unavailable,
    observeToolControl: unavailable,
    observeMediaAvailability: () => noticeFeed(),
    observeProviderBalances: () => noticeFeed(),
    loadPluginSource: unavailable,
    loadToolComponent: async () => undefined,
    createAssistantSession: unavailable,
    createWorkspace: unavailable,
    loadCreationState: value({ revision: "0".repeat(64), stores: { "toonflow.projectList": { project: null, projectList: [] } } }),
    saveCreationState: unavailable,
    controlAssistantSession: unavailable,
    completeAssistantTool: unavailable,
    addMediaProvider: unavailable,
    browseMarketplace: value({ list: [], total: 0 }),
    chooseDownloadDestination: unavailable,
    chooseLocalDirectory: unavailable,
    chooseProviderDocument: unavailable,
    chooseWorkspaceDirectory: value({ native: false, directory: null }),
    connectAgent: unavailable,
    copyAsset: unavailable,
    copyWorkspaceFile: unavailable,
    createAssetFolder: unavailable,
    createConversation: unavailable,
    createPayment: unavailable,
    createSkillFile: unavailable,
    createWorkspaceFolder: unavailable,
    disconnectDevice: unavailable,
    downloadResource: unavailable,
    exportPlugin: unavailable,
    importWorkspaceImage: unavailable,
    inspectProviderDocument: unavailable,
    inspectWorkspace: unavailable,
    installLocalPlugin: unavailable,
    installPlugin: unavailable,
    listAssets: value([]),
    listConversationSkills: value([]),
    listConversations: value([]),
    listDocumentEditors: value([]),
    listInstalledNodes: value([]),
    listInstalledPlugins: async (category) => value(category === "tools" ? { tools: [], canManage: false } : category === "agents" ? { agents: [], canManage: false } : [])(),
    listInstalledTools: value({ tools: [], canManage: false }),
    listMediaProviders: value([]),
    listPaymentOptions: value([]),
    listSkillFiles: value([]),
    listSponsors: value([]),
    listWorkspaceDirectories: directoryListing,
    listWorkspaceFiles: value({ directory: "/scenario", empty: true, entries: [] }),
    loadAgentConnections: value({ connections: [], enabled: false }),
    loadApplicationSettings: async <T>() => value({ ...scenarioSettings, settingsRevision: 1 })<T>(),
    loadDefaultPrompt: value({ prompt: "" }),
    loadDesktopUpdate: unavailable,
    loadDeviceConnections: value({ enabled: false, hubEnabled: false }),
    loadLanguageModels: value([]),
    loadMediaModels: value([]),
    loadMediaToolProgress: value(null),
    loadMediaToolStatus: value({ installed: false, available: false, download: null }),
    loadMentionContent: unavailable,
    loadPaymentStatus: unavailable,
    loadPersonalization: value({ content: "", revision: "scenario" }),
    loadProviderBalance: value(null),
    loadToolConnection: unavailable,
    manageDesktopUpdate: unavailable,
    manageHostConnection: unavailable,
    manageMediaTool: unavailable,
    moveSkillFile: unavailable,
    openConversation: unavailable,
    pairDevice: unavailable,
    prepareMobileDownload: unavailable,
    readAgentDocument: unavailable,
    readAsset: unavailable,
    readClipboard: unavailable,
    readIntegrationGuide: unavailable,
    readProviderDocument: unavailable,
    readSkillFile: unavailable,
    readWorkspaceFile: unavailable,
    recordUsage: unavailable,
    removeAsset: unavailable,
    removeConversationMessage: unavailable,
    removeMediaProvider: unavailable,
    removePlugin: unavailable,
    removeWorkspaceFile: unavailable,
    renameAsset: unavailable,
    renameConversation: unavailable,
    renameWorkspaceFile: unavailable,
    reorderSkillFiles: unavailable,
    revealWorkspaceFile: unavailable,
    saveAgentConnections: unavailable,
    saveAgentDocument: unavailable,
    saveApplicationSettings: async <T>(...inputs: unknown[]): Promise<StudioResponse<T>> => { scenarioSettings = structuredClone((inputs[0] as { settings: Record<string, unknown> }).settings); return value({ settings: scenarioSettings })<T>(); },
    saveAsset: unavailable,
    saveDeviceConnections: unavailable,
    saveDocumentEditor: unavailable,
    saveLocalDownload: unavailable,
    saveMediaProvider: unavailable,
    savePersonalization: unavailable,
    savePluginConfiguration: unavailable,
    saveSkillFile: unavailable,
    setPluginEnabled: unavailable,
    toggleMarketplaceCollection: unavailable,
    validateMediaProvider: unavailable,
    writeClipboard: unavailable,
    writeWorkspaceFile: unavailable,
  };
}
