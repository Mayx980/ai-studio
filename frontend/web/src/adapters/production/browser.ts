import type { BrowserViewPort } from "@toonflow/tool-browser-ui/ports";
import type { BrowserStreamEvent } from "@toonflow/tool-browser/protocol";
import { readEvents } from "./streams";

export function createBrowserViewPort(): BrowserViewPort {
  return {
    async *observe(scope, sessionId, signal) {
      const query = new URLSearchParams({ ...scope, sessionId });
      const response = await fetch(`/api/browser/stream?${query}`, { headers: { "x-toonflow-workspace": "1" }, signal });
      if (response.status === 404) { yield { type: "closed", sessionId }; return; }
      if (response.ok && !response.headers.get("content-type")?.includes("application/x-ndjson")) throw new Error("未收到浏览器画面流");
      yield* readEvents<BrowserStreamEvent>(response, signal);
    },
    async send(target, input, signal) {
      const response = await fetch("/api/browser/input", {
        method: "POST", headers: { "Content-Type": "application/json", "x-toonflow-workspace": "1" }, body: JSON.stringify({ ...target, input }), signal,
      });
      const result = await response.json();
      if (response.status === 404) return { closed: true, message: result.message };
      if (!response.ok || result.code !== 200) throw new Error(result.message || "网页操作失败");
      return { closed: false, session: result.data };
    },
    async release(target) {
      await fetch("/api/browser/input", {
        method: "POST", headers: { "Content-Type": "application/json", "x-toonflow-workspace": "1" },
        body: JSON.stringify({ ...target, input: { type: "release" } }), keepalive: true, signal: AbortSignal.timeout(5000),
      });
    },
  };
}
