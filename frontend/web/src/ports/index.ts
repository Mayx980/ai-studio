export type StudioResponse<T = Record<string, any>> = { data: T };
export type StudioAction = <T = Record<string, any>>(...inputs: unknown[]) => Promise<StudioResponse<T>>;
export type StudioFailure = { message?: string; data?: { code?: string } };
export type HostConnection = { mode: "local" | "remote"; name?: string; url?: string; online?: boolean | null; appVersion?: string; remoteAppVersion?: string };
export type StudioNoticeFeed<T = unknown> = {
  onConnected?: () => void;
  onNotice?: (value: T) => void;
  onFailure?: () => void;
  readonly closed: boolean;
  close(): void;
};

export class StudioError<T = StudioFailure> extends Error {
  readonly reasonCode?: string;

  constructor(message: string, readonly detail?: T, readonly status?: number, readonly metadata: Record<string, string> = {}, readonly cancelled = false, readonly code?: string) {
    const failure = detail as StudioFailure | undefined;
    super(typeof failure?.message === "string" ? failure.message : message);
    this.reasonCode = typeof failure?.data?.code === "string" ? failure.data.code : undefined;
    this.name = "StudioError";
  }
}

export function isStudioError<T = StudioFailure>(value: unknown): value is StudioError<T> {
  return value instanceof StudioError;
}

export function isActionCancelled(value: unknown) {
  return value instanceof StudioError && value.cancelled || value instanceof Error && value.name === "AbortError";
}

export interface StudioPort {
  assetMediaSource(path: string): string | undefined;
  loadHostConnection(signal: AbortSignal): Promise<HostConnection>;
  notifyDesktopReady(failed: boolean): Promise<void>;
  openDeveloperTools(): Promise<void>;
  closeAssistantSession(sessionId: string): Promise<void>;
  streamConversation<T extends { type: string }>(input: object, signal: AbortSignal): AsyncIterable<T>;
  streamAssistantSession<T extends { type: string }>(input: object, signal: AbortSignal): AsyncIterable<T>;
  streamProviderDebug<T extends { type: string }>(input: object, signal: AbortSignal): AsyncIterable<T>;
  publishCanvasResult(input: object, options: { signal: AbortSignal; keepalive?: boolean }): Promise<void>;
  answerConversationQuestion(input: object): Promise<void>;
  publishToolControl(kind: "state" | "result", input: object, token: string, signal: AbortSignal): Promise<void>;
  observeToolControl<T>(connectionId: string, token: string, signal: AbortSignal): Promise<AsyncIterable<T>>;
  observeMediaAvailability(): StudioNoticeFeed<{ type?: string }>;
  observeProviderBalances<T>(accountIds: string): StudioNoticeFeed<T>;
  loadPluginSource(url: string, kind: "node" | "editor"): Promise<string>;
  loadToolComponent(name: string): Promise<import("vue").Component | undefined>;
  createAssistantSession: StudioAction;
  controlAssistantSession: StudioAction;
  completeAssistantTool: StudioAction;
  addMediaProvider: StudioAction;
  browseMarketplace: StudioAction;
  chooseDownloadDestination: StudioAction;
  chooseLocalDirectory: StudioAction;
  chooseProviderDocument: StudioAction;
  chooseWorkspaceDirectory: StudioAction;
  connectAgent: StudioAction;
  copyWorkspaceFile: StudioAction;
  createAssetFolder: StudioAction;
  createConversation: StudioAction;
  createPayment: StudioAction;
  createSkillFile: StudioAction;
  createWorkspaceFolder: StudioAction;
  disconnectDevice: StudioAction;
  downloadResource: StudioAction;
  exportPlugin: StudioAction;
  importWorkspaceImage: StudioAction;
  inspectProviderDocument: StudioAction;
  inspectWorkspace: StudioAction;
  installLocalPlugin: StudioAction;
  installPlugin: StudioAction;
  listAssets: StudioAction;
  listConversationSkills: StudioAction;
  listConversations: StudioAction;
  listDocumentEditors: StudioAction;
  listInstalledNodes: StudioAction;
  listInstalledPlugins: StudioAction;
  listInstalledTools: StudioAction;
  listMediaProviders: StudioAction;
  listPaymentOptions: StudioAction;
  listSkillFiles: StudioAction;
  listSponsors: StudioAction;
  listWorkspaceDirectories: StudioAction;
  listWorkspaceFiles: StudioAction;
  loadAgentConnections: StudioAction;
  loadApplicationSettings: StudioAction;
  loadDefaultPrompt: StudioAction;
  loadDesktopUpdate: StudioAction;
  loadDeviceConnections: StudioAction;
  loadLanguageModels: StudioAction;
  loadMediaModels: StudioAction;
  loadMediaToolProgress: StudioAction;
  loadMediaToolStatus: StudioAction;
  loadMentionContent: StudioAction;
  loadPaymentStatus: StudioAction;
  loadPersonalization: StudioAction;
  loadProviderBalance: StudioAction;
  loadToolConnection: StudioAction;
  manageDesktopUpdate: StudioAction;
  manageHostConnection: StudioAction;
  manageMediaTool: StudioAction;
  moveSkillFile: StudioAction;
  openConversation: StudioAction;
  pairDevice: StudioAction;
  prepareMobileDownload: StudioAction;
  readAgentDocument: StudioAction;
  readAsset: StudioAction;
  readClipboard: StudioAction;
  readIntegrationGuide: StudioAction;
  readProviderDocument: StudioAction;
  readSkillFile: StudioAction;
  readWorkspaceFile: StudioAction;
  recordUsage: StudioAction;
  removeAsset: StudioAction;
  removeConversationMessage: StudioAction;
  removeMediaProvider: StudioAction;
  removePlugin: StudioAction;
  removeWorkspaceFile: StudioAction;
  renameAsset: StudioAction;
  renameConversation: StudioAction;
  renameWorkspaceFile: StudioAction;
  reorderSkillFiles: StudioAction;
  revealWorkspaceFile: StudioAction;
  saveAgentConnections: StudioAction;
  saveAgentDocument: StudioAction;
  saveApplicationSettings: StudioAction;
  saveAsset: StudioAction;
  saveDeviceConnections: StudioAction;
  saveDocumentEditor: StudioAction;
  saveLocalDownload: StudioAction;
  saveMediaProvider: StudioAction;
  savePersonalization: StudioAction;
  savePluginConfiguration: StudioAction;
  saveSkillFile: StudioAction;
  setPluginEnabled: StudioAction;
  toggleMarketplaceCollection: StudioAction;
  validateMediaProvider: StudioAction;
  writeClipboard: StudioAction;
  writeWorkspaceFile: StudioAction;
}

export let studio: StudioPort;

export function configureStudioPort(port: StudioPort) {
  studio = port;
}
