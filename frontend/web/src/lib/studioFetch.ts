export const studioFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  if (!import.meta.env.VITE_STUDIO_RELAY) return fetch(input, { ...init, credentials: "omit", referrerPolicy: "no-referrer" });
  const request = new Request(input, init);
  const headers = new Headers(request.headers);
  headers.set("x-studio-target", request.url);
  return fetch("/__studio/request", { method: request.method, headers, body: request.body ? await request.arrayBuffer() : undefined, signal: request.signal, credentials: "omit", referrerPolicy: "same-origin" });
}) as typeof fetch;
