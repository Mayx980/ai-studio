export const studioFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const request = new Request(input, init);
  const relay = import.meta.env.VITE_STUDIO_RELAY;
  const headers = new Headers(request.headers);
  if (relay) headers.set("x-studio-target", request.url);
  try {
    return await fetch(relay ? "/__studio/request" : request, relay ? {
      method: request.method, headers, body: request.body ? await request.arrayBuffer() : undefined,
      signal: request.signal, credentials: "omit", referrerPolicy: "same-origin",
    } : { credentials: "omit", referrerPolicy: "no-referrer" });
  } catch (error) {
    if (request.signal.aborted || !(error instanceof TypeError)) throw error;
    throw new Error(relay
      ? "无法连接本机供应商中转，请检查预览服务及网络。输入和参考已保留；如已提交任务，请先核查供应商记录。"
      : "浏览器无法直连供应商接口，可能受跨域或网络限制。请使用本机开发预览服务后重试；如已提交任务，请先核查供应商记录。", { cause: error });
  }
}) as typeof fetch;
