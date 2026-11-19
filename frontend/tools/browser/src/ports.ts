import type { BrowserInput, BrowserSessionState, BrowserStreamEvent } from "@toonflow/tool-browser/protocol";

export type BrowserScope = { directory: string } | { toolSessionId: string };
export type BrowserTarget = BrowserScope & { sessionId: string; tabId: string };
export interface BrowserViewPort {
  observe(scope: BrowserScope, sessionId: string, signal: AbortSignal): AsyncIterable<BrowserStreamEvent>;
  send(target: BrowserTarget, input: BrowserInput, signal: AbortSignal): Promise<{ closed: boolean; session?: BrowserSessionState; message?: string }>;
  release(target: BrowserTarget): Promise<void>;
}

const portKey = Symbol.for("toonflow.browserViewPort");
const host = globalThis as typeof globalThis & { [portKey]?: BrowserViewPort };

export function configureBrowserViewPort(port: BrowserViewPort) {
  host[portKey] = port;
}

export function browserViewPort() {
  const port = host[portKey];
  if (!port) throw new Error("浏览器界面宿主尚未配置");
  return port;
}
