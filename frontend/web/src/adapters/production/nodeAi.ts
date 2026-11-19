import { EventSourceParserStream } from "eventsource-parser/stream";
import type { NodeAiPort, NodeAiHostEvent, NodeMediaPrice } from "@toonflow/nodes-scaffold/nodeAi";
import { ElMessage } from "element-plus";
import { authenticatedFetch } from "./accounts";

async function readResult<T>(response: Response): Promise<T> {
  const result = await response.json();
  if (!response.ok || result.code !== 200) throw new Error(result.message || `AI 请求失败（HTTP ${response.status}）`);
  return result.data;
}

export function createNodeAiPort(): NodeAiPort {
  return {
    loadModels(kind) {
      return authenticatedFetch(kind === "language" ? "/api/ai/models" : "/api/ai/media/models", { cache: "no-store" }).then(readResult<unknown[]>);
    },
    async *streamText(input, signal) {
      const response = await authenticatedFetch("/api/ai/generate", {
        method: "POST", headers: { "Content-Type": "application/json", "x-toonflow-workspace": "1" },
        body: JSON.stringify(input), signal,
      });
      if (!response.ok) await readResult(response);
      if (!response.body || !response.headers.get("content-type")?.includes("text/event-stream")) throw new Error("AI 未返回 SSE 数据流");
      const reader = response.body.pipeThrough(new TextDecoderStream()).pipeThrough(new EventSourceParserStream()).getReader();
      try {
        while (true) {
          const { value, done } = await reader.read();
          signal.throwIfAborted();
          if (done) return;
          const event = JSON.parse(value.data) as NodeAiHostEvent;
          yield event;
          if (event.type === "done" || event.type === "error") return;
        }
      } finally {
        await reader.cancel().catch(() => {});
        reader.releaseLock();
      }
    },
    quoteMedia(input, signal) {
      return authenticatedFetch("/api/ai/media/price", {
        method: "POST", headers: { "Content-Type": "application/json", "x-toonflow-workspace": "1" }, body: JSON.stringify(input), signal,
      }).then(readResult<NodeMediaPrice | null>);
    },
    async generateMedia(mediaType, input, signal) {
      const requestId = crypto.randomUUID();
      const stop = () => { void authenticatedFetch("/api/ai/media/stop", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ requestId }) }).catch(() => {}); };
      signal.throwIfAborted();
      signal.addEventListener("abort", stop, { once: true });
      try {
        const files = await readResult<{ path: string; mimeType: string; mediaType: typeof mediaType; warning?: string }[]>(await authenticatedFetch("/api/ai/media/generate", {
          method: "POST", headers: { "Content-Type": "application/json", "x-toonflow-workspace": "1" }, body: JSON.stringify({ ...input, mediaType, requestId }), signal,
        }));
        for (const warning of new Set(files.flatMap(file => file.warning ? [file.warning] : []))) ElMessage({ type: "warning", message: warning, duration: 0, showClose: true });
        return files;
      } finally { signal.removeEventListener("abort", stop); }
    },
  };
}
