import type { Response } from "express";
import { resolve } from "node:path";
import { withFileAccess } from "@toonflow/file";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import * as mediaFiles from "@/utils/mediaStorage/files";
import * as storage from "@/utils/mediaStorage";

export async function sendFile(res: Response, path: string, options: Parameters<Response["sendFile"]>[1] = {}, callback?: (error?: Error) => void) {
  const controller = new AbortController();
  const cancel = () => controller.abort();
  const req = res.req;
  req.once("aborted", cancel);
  res.once("close", cancel);
  if (req.aborted || res.destroyed) cancel();
  let failure: Error | undefined;
  try {
    if (mediaFiles.isLibraryIndex(path)) {
      const bytes = await mediaFiles.read(path, controller.signal);
      res.set({ "Content-Type": "application/json; charset=utf-8", "Content-Length": String(bytes.length), "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
      res.send(bytes);
      return;
    }
    const media = await mediaFiles.lookup(resolve(options.root ?? "", path));
    if (media?.storageKind === "oss") {
      const upstream = await storage.open(media.bucket!, media.object!, req.get("range"), controller.signal);
      const size = Number(media.size);
      const range = upstream.headers.get("content-range");
      const match = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(range ?? "");
      let length = size;
      let valid = upstream.status === 200;
      if (upstream.status === 206 && match) {
        const [start, end, total] = match.slice(1).map(Number) as [number, number, number];
        const requested = /^bytes=(\d*)-(\d*)$/.exec(req.get("range") ?? "")!;
        const from = requested[1] ? Number(requested[1]) : Math.max(0, size - Number(requested[2]));
        const to = requested[1] && requested[2] ? Math.min(size - 1, Number(requested[2])) : size - 1;
        length = end - start + 1;
        valid = total === size && start === from && end === to && length > 0 && length <= size;
      } else if (upstream.status === 416) valid = range === `bytes */${size}`;
      if (!valid || upstream.status !== 416 && upstream.headers.has("content-length") && Number(upstream.headers.get("content-length")) !== length) {
        await upstream.body?.cancel();
        throw Object.assign(new Error("云媒体长度或Range与已保存记录不符"), { status: 502 });
      }
      res.status(upstream.status);
      res.set({ "Content-Type": media.mimeType, "X-Content-Type-Options": "nosniff", "Accept-Ranges": "bytes", "Cache-Control": "no-store" });
      for (const name of ["content-length", "content-range"]) { const value = upstream.headers.get(name); if (value) res.set(name, value); }
      if (upstream.status === 416 || req.method === "HEAD") { await upstream.body?.cancel(); res.end(); }
      else if (upstream.body) {
        let received = 0;
        const bounded = new Transform({ transform(chunk, _encoding, callback) {
          received += chunk.length;
          callback(received > length ? new Error("云媒体响应超过已保存长度") : null, chunk);
        }, flush(callback) { callback(received !== length ? new Error("云媒体响应提前结束") : undefined); } });
        await pipeline(Readable.fromWeb(upstream.body as never), bounded, res, { signal: controller.signal });
      }
      else throw Object.assign(new Error("云媒体响应为空"), { status: 502 });
      return;
    }
    await withFileAccess([resolve(options.root ?? "", path)], "read", () => new Promise<void>((done, reject) => {
      if (req.aborted || res.destroyed) return done();
      const finish = () => complete();
      const complete = (error?: Error) => {
        res.off("finish", finish);
        res.off("close", finish);
        if (error) reject(error); else done();
      };
      res.once("finish", finish);
      res.once("close", finish);
      try {
        res.sendFile(path, options, error => {
          if (error) complete(error);
          else if (res.writableFinished || res.destroyed) complete();
        });
      } catch (error) { complete(error instanceof Error ? error : new Error(String(error))); }
    }), controller.signal);
  } catch (error) {
    failure = error instanceof Error ? error : new Error(String(error));
  } finally {
    req.off("aborted", cancel);
    res.off("close", cancel);
  }
  if (req.aborted || res.destroyed) return;
  if (callback) callback(failure);
  else if (failure) throw failure;
}
