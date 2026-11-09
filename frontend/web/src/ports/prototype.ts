import type { NodeAiAdapter, NodeAiRequest, NodeAiResult } from "@toonflow/nodes-scaffold/nodeAi";
import type { TextSnapshot } from "@/lib/workspaceFiles";

export type PrototypeKind = "image" | "video" | "audio" | "text";
type WorkspaceListing = { directory: string; empty: boolean; entries: { name: string; path: string; type: "file" | "directory" }[] };
export type NativeWorkspaceReader = {
  list(path?: string, signal?: AbortSignal, directory?: string): Promise<WorkspaceListing>;
  read(path: string, directory?: string): Promise<ArrayBuffer>;
};
export interface BrowserWorkspaceFiles {
  list(path?: string, signal?: AbortSignal): Promise<WorkspaceListing>;
  read(path: string): Promise<ArrayBuffer>;
  write(path: string, content: string | Blob | ArrayBuffer, exclusive?: boolean, revision?: string, encoding?: TextSnapshot["encoding"]): Promise<string>;
  mkdir(path: string): Promise<void>;
  remove(path: string, recursive?: boolean): Promise<void>;
  rename(path: string, target: string): Promise<void>;
  copy(path: string, target: string): Promise<void>;
  readTextSnapshot(path: string, maxBytes?: number): Promise<TextSnapshot>;
  writeTextSnapshot(path: string, text: string, snapshot: Pick<TextSnapshot, "revision" | "encoding">): Promise<string>;
  importImage(url: string): Promise<{ path: string; mimeType: string }>;
}
export type PrototypeMediaRequest = {
  kind: Exclude<PrototypeKind, "text">;
  modelId: string;
  prompt: string;
  config: { apiKey: string; endpoint: string };
  references: { type: "binary"; data: Uint8Array; mimeType: string; name: string }[];
  ratio: string;
  imageSize: string;
  count: number;
  generateAudio: boolean;
  duration: string;
  resolution: string;
  firstFrameIndex?: number;
  signal: AbortSignal;
};
export type PrototypeMediaAsset = { type: string; data?: string; url?: string; mimeType?: string };

export interface PrototypePort {
  readonly workspaceMode: boolean;
  readonly requiresAccount: boolean;
  readAccount(): string | null;
  writeAccount(id: string): void;
  clearAccount(): void;
  createWorkspaceFiles(getDirectory: () => string, nativeFiles: NativeWorkspaceReader): BrowserWorkspaceFiles;
  nodeAi: Omit<NodeAiAdapter, "enabled" | "continueOnUnmount">;
  generateText(input: NodeAiRequest): Promise<NodeAiResult>;
  generateMedia(input: PrototypeMediaRequest): Promise<PrototypeMediaAsset[]>;
  readMedia(url: string, signal?: AbortSignal): Promise<Blob>;
  loadModels(base: string, apiKey: string, signal: AbortSignal): Promise<{ id: string }[]>;
}

let configuredPort: PrototypePort | undefined;
export function configurePrototypePort(port: PrototypePort) { configuredPort = port; }
export const prototype = new Proxy({} as PrototypePort, {
  get(_target, key: keyof PrototypePort) {
    if (!configuredPort) throw new Error("创作宿主尚未配置");
    return configuredPort[key];
  },
});
