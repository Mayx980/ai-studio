import { EventSourceParserStream } from "eventsource-parser/stream";
import type { NodeAiPort, NodeAiHostEvent, NodeMediaPrice } from "@toonflow/nodes-scaffold/nodeAi";

async function readResult<T>(response: Response): Promise<T> {
  const result = await response.json();
  if (!response.ok || result.code !== 200) throw new Error(result.message || `AI 请求失败（HTTP ${response.status}）`);
  return result.data;
}

export function createNodeAiPort(): NodeAiPort {
  return {
    loadModels(kind) {
      return fetch(kind === "language" ? "/api/ai/models" : "/api/ai/media/models", { cache: "no-store" }).then(readResult<unknown[]>);
    },
    async *streamText(input, signal) {
      const response = await fetch("/api/ai/generate", {
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
      return fetch("/api/ai/media/price", {
        method: "POST", headers: { "Content-Type": "application/json", "x-toonflow-workspace": "1" }, body: JSON.stringify(input), signal,
      }).then(readResult<NodeMediaPrice | null>);
    },
    async generateMedia(mediaType, input, signal) {
      return readResult(await fetch("/api/ai/media/generate", {
        method: "POST", headers: { "Content-Type": "application/json", "x-toonflow-workspace": "1" }, body: JSON.stringify({ ...input, mediaType }), signal,
      }));
    },
  };
}
