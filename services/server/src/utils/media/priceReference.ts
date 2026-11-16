import { detectMimeType } from "./mime";
export { detectMimeType } from "./mime";
import { open, stat, withFileAccess } from "@toonflow/file";
import type { ProviderPriceReference } from "@toonflow/providers";
import type { MediaReference } from "@toonflow/tools-scaffold/runtime";
import conf from "@/utils/conf";
import { lookup, withLocalFile } from "@/utils/mediaStorage/files";
import { relative } from "node:path";
import { getStatus } from "@/utils/ffmpeg";
import { resolveWorkspacePath } from "@/utils/workspace/files";

const references = new Map<string, { revision: string; expires: number; value: Promise<ProviderPriceReference> }>();
let probeStatus: { config: string; expires: number; value: Promise<string | null> } | undefined;


async function waitForMetadata<T>(value: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return value;
  let abort: (() => void) | undefined;
  try {
    return await Promise.race([value, new Promise<never>((_resolve, reject) => {
      abort = () => reject(signal.reason);
      if (signal.aborted) abort();
      else signal.addEventListener("abort", abort, { once: true });
    })]);
  } finally { if (abort) signal.removeEventListener("abort", abort); }
}

function probePath(config: string) {
  if (probeStatus?.config === config && probeStatus.expires > Date.now()) return probeStatus.value;
  const entry = { config, expires: Infinity, value: Promise.resolve<string | null>(null) };
  // ACT: 合并在途版本检查，完成后缓存 10 秒；配置变化立即重查，不触发缺工具安装提示。
  entry.value = getStatus().then(({ tools }) => tools.ffprobe.error ? null : tools.ffprobe.path).catch(() => null)
    .finally(() => { entry.expires = Date.now() + 10000; });
  probeStatus = entry;
  return entry.value;
}

function positive(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : undefined;
}

async function probeMedia(path: string, mediaType: string, config: string, signal: AbortSignal) {
  const executable = await waitForMetadata(probePath(config), signal);
  if (!executable) return {};
  signal.throwIfAborted();
  return withFileAccess([path], "read", async () => {
    const child = Bun.spawn([executable, "-v", "error", "-protocol_whitelist", "file",
      "-format_whitelist", "mov,matroska,webm,ogg,wav,mp3,flac,aac",
      "-select_streams", mediaType === "video" ? "V:0" : "a:0", "-show_entries",
      "stream=width,height,duration,avg_frame_rate:format=duration", "-of", "json", "-i", path], {
      stdin: "ignore", stdout: "pipe", stderr: "ignore", windowsHide: true, timeout: 5000, signal,
      env: Object.fromEntries(Object.entries(process.env).filter(([key]) => key.toUpperCase() !== "FFREPORT")),
    });
    const [output, code] = await Promise.all([child.stdout.text(), child.exited]);
    signal.throwIfAborted();
    if (code !== 0) return {};
    const data = JSON.parse(output);
    const stream = data.streams?.[0];
    if (!stream) return {};
    const duration = positive(stream.duration) ?? positive(data.format?.duration);
    const width = positive(stream.width);
    const height = positive(stream.height);
    const [numerator, denominator = "1"] = String(stream.avg_frame_rate ?? "").split("/");
    const frameRate = positive(Number(numerator) / Number(denominator));
    return { ...(duration ? { duration } : {}), ...(width ? { width } : {}), ...(height ? { height } : {}), ...(frameRate ? { frameRate } : {}) };
  }, signal);
}

async function loadPriceReference(cwd: string, reference: MediaReference, mediaType: string, signal?: AbortSignal): Promise<ProviderPriceReference> {
  signal?.throwIfAborted();
  const { path } = await resolveWorkspacePath(cwd, reference.path);
  if ((await lookup(path))?.storageKind === "oss") {
    return withLocalFile(path, local => loadPriceReference(cwd, { ...reference, path: relative(cwd, local) }, mediaType, signal), signal);
  }
  signal?.throwIfAborted();
  const info = await stat(path);
  signal?.throwIfAborted();
  if (!info.isFile() || !info.size || info.size > 100 * 1024 * 1024) throw new Error("参考媒体须为不超过 100 MB 的非空文件");
  const config = JSON.stringify(conf.get("settings", {}).ffmpeg ?? {});
  const key = JSON.stringify([path, reference.mimeType, mediaType, config]);
  const revision = `${info.mtimeMs}:${info.ctimeMs}:${info.size}`;
  const now = Date.now();
  for (const [key, cached] of references) if (cached.expires <= now) references.delete(key);
  const cached = references.get(key);
  if (cached?.revision === revision) return cached.value;
  const value = (async () => {
    const header = Buffer.alloc(16);
    const handle = await open(path, "r");
    try { await handle.read(header, 0, header.length, 0); }
    finally { await handle.close(); }
    const mimeType = detectMimeType(header, reference.mimeType);
    if (!mimeType.startsWith(`${mediaType}/`)) throw new Error(`参考媒体类型须为 ${mediaType}`);
    const metadata: ProviderPriceReference = { mimeType, sizeBytes: info.size };
    const deadline = AbortSignal.timeout(5000);
    try {
      if (mediaType === "image") {
        const image = await waitForMetadata(withFileAccess([path], "read", () => new Bun.Image(path).metadata(), deadline), deadline);
        if (positive(image.width)) metadata.width = image.width;
        if (positive(image.height)) metadata.height = image.height;
      } else Object.assign(metadata, await waitForMetadata(probeMedia(path, mediaType, config, deadline), deadline));
    } catch {
      // ACT: 缺探测工具、格式不支持或 5 秒内无法探测时保留类型/大小，未知维度不伪造为 0。
    }
    const latest = await stat(path);
    if (`${latest.mtimeMs}:${latest.ctimeMs}:${latest.size}` !== revision) throw new Error("参考媒体已变化，请重试估价");
    return metadata;
  })();
  const entry = { revision, expires: now + 30000, value };
  // ACT: 元信息缓存最多 500 项 / 30 秒；每次核对 mtime/ctime/size，不保存素材内容。
  if (references.size >= 500) references.delete(references.keys().next().value!);
  references.set(key, entry);
  void value.catch(() => { if (references.get(key) === entry) references.delete(key); });
  return value;
}

export function readPriceReference(cwd: string, reference: MediaReference, mediaType: string, signal?: AbortSignal) {
  // 单个请求取消只结束自己的等待，不中断其他请求共用的探测；路径查询也受等待时限约束。
  return waitForMetadata(loadPriceReference(cwd, reference, mediaType, signal), signal);
}
