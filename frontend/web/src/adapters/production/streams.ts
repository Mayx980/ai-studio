import { StudioError } from "@/ports";
import { EventSourceParserStream } from "eventsource-parser/stream";
import { authenticatedFetch } from "./accounts";

async function requireStream(response: Response) {
  if (!response.ok) {
    const detail = await response.json().catch(() => undefined);
    throw new StudioError(detail?.message || `请求失败（${response.status}）`, detail, response.status);
  }
  if (!response.body) throw new Error("未收到响应流");
  return response.body;
}

export async function openEvents<T>(url: string, options: RequestInit, signal: AbortSignal, format: "lines" | "events" = "lines"): Promise<AsyncIterable<T>> {
  const response = await authenticatedFetch(url, options);
  await requireStream(response);
  return readEvents<T>(response, signal, format);
}

export async function* readEvents<T>(response: Response, signal: AbortSignal, format: "lines" | "events" = "lines"): AsyncIterable<T> {
  const body = await requireStream(response);
  const text = body.pipeThrough(new TextDecoderStream());
  const reader = format === "events" ? text.pipeThrough(new EventSourceParserStream()).getReader() : text.getReader();
  let pending = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      signal.throwIfAborted();
      if (value && typeof value !== "string") {
        yield JSON.parse(value.data) as T;
        continue;
      }
      pending += value ?? "";
      const lines = pending.split("\n");
      pending = lines.pop() ?? "";
      if (done) lines.push(pending, "");
      for (const raw of lines) {
        const line = raw.replace(/\r$/, "");
        if (line.trim()) yield JSON.parse(line) as T;
      }
      if (done) return;
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
