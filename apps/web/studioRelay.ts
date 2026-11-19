import type { Plugin } from "vite";
import { lookup } from "node:dns";
import { request as httpsRequest } from "node:https";

// ACT: 仅本机原型的传输适配，不保存凭证，不提供生产代理入口。
export default function studioRelay(): Plugin {
  return { name: "studioRelay", configureServer(server) {
    server.middlewares.use("/__studio/request", async (request, response) => {
      response.setHeader("Cache-Control", "no-store");
      const controller = new AbortController();
      response.on("close", () => controller.abort());
      try {
        const origin = request.headers.origin || (request.headers.referer ? new URL(request.headers.referer).origin : "");
        if (!["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(request.socket.remoteAddress ?? "") || origin !== `http://${request.headers.host}`) {
          response.writeHead(403).end("仅允许本机原型页面访问"); return;
        }
        const target = new URL(String(request.headers["x-studio-target"] || ""));
        const allowed = target.hostname.endsWith(".aliyuncs.com") || ["openspeech.bytedance.com", "api.deepseek.com", "api.siliconflow.cn", "api.moonshot.cn", "api.moonshot.ai", "open.bigmodel.cn", "api.openai.com"].includes(target.hostname) || [".bytecdn.cn", ".byteimg.com", ".ibytedtos.com", ".volces.com"].some(suffix => target.hostname.endsWith(suffix));
        if (!allowed || target.protocol !== "https:" || target.username || target.password || (target.port && target.port !== "443") || !["GET", "POST", "HEAD"].includes(request.method ?? "")) {
          response.writeHead(400).end("不支持该供应商地址或请求方法"); return;
        }
        const headers = new Headers();
        for (const name of ["authorization", "content-type", "x-api-key", "x-dashscope-async", "x-dashscope-ossresourceresolve"]) {
          const value = request.headers[name];
          if (typeof value === "string") headers.set(name, value);
        }
        const chunks: Uint8Array[] = [];
        let size = 0;
        for await (const chunk of request) {
          size += chunk.length;
          if (size > 48 * 1024 * 1024) { response.writeHead(413).end("上传内容超过 48 MB"); return; }
          chunks.push(chunk);
        }
        const body = new Uint8Array(size);
        let offset = 0;
        for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.length; }
        // ACT: 建立连接时尝试域名的全部地址，不重发已提交的生成请求。
        const upstream = await new Promise<import("node:http").IncomingMessage>((resolve, reject) => {
          const connectionOptions = { autoSelectFamily: true };
          const outgoing = httpsRequest(target, {
            ...connectionOptions,
            method: request.method, headers: Object.fromEntries(headers),
            lookup(hostname, _, callback) { lookup(hostname, { all: true }, callback); },
            signal: AbortSignal.any([controller.signal, AbortSignal.timeout(180000)]),
          }, resolve);
          outgoing.on("error", reject);
          outgoing.end(size ? body : undefined);
        });
        response.writeHead(upstream.statusCode || 502, { "Content-Type": upstream.headers["content-type"] || "application/octet-stream" });
        for await (const chunk of upstream) {
          if (!response.write(chunk)) await new Promise<void>(resolve => { response.once("drain", resolve); response.once("close", resolve); });
        }
        response.end();
      } catch {
        if (response.destroyed) return;
        if (response.headersSent) { response.destroy(); return; }
        response.writeHead(502, { "Content-Type": "application/json" });
        response.end(JSON.stringify({ code: "StudioUpstreamError", message: "本机中转连接供应商失败或等待超时；请求可能已被受理，请先检查厂商任务记录，勿重复提交。" }));
      }
    });
  } };
}
