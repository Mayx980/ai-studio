import { detectMimeType } from "@/utils/media/mime";
import { objectPath, requireConfiguration, storageError } from "./config";

export { initialize, requireConfiguration } from "./config";
export const maxMediaBytes = 100 * 1024 * 1024;
// ACT: 单文件上限沿用现有入口；120秒仅限制本次传输，不自动重试未知上传。
const transferTimeout = 120_000;

export function validateMedia(bytes: Uint8Array, declaredType?: string) {
  if (!bytes.byteLength || bytes.byteLength > maxMediaBytes) throw storageError("媒体不能为空或超过100 MiB", 413);
  // PCM没有容器头，只在生成格式、逻辑.pcm文件或已保存元数据明确声明时接收；不猜采样参数。
  if (declaredType === "audio/pcm") return declaredType;
  const mimeType = detectMimeType(Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength), "");
  if (!/^(image|video|audio)\//.test(mimeType)) throw storageError("文件不是支持的图片、视频或音频", 400);
  return mimeType;
}
export function mediaType(bytes: Uint8Array) { return detectMimeType(bytes, ""); }

function objectUrl(bucket: string, object: string) {
  const config = requireConfiguration();
  if (bucket !== config.bucket) throw storageError("媒体 bucket 与实例配置不一致");
  return `${config.baseUrl}/${objectPath(bucket)}/${objectPath(object)}`;
}

function transferSignal(signal?: AbortSignal) {
  const timeout = AbortSignal.timeout(transferTimeout);
  return signal ? AbortSignal.any([timeout, signal]) : timeout;
}

export async function save(object: string, bytes: Uint8Array, declaredType?: string, signal?: AbortSignal) {
  const config = requireConfiguration();
  const mimeType = validateMedia(bytes, declaredType);
  const body = new FormData();
  body.set("file", new Blob([new Uint8Array(bytes)], { type: mimeType }), "media");
  try {
    const response = await fetch(objectUrl(config.bucket, object), { method: "POST", body, signal: transferSignal(signal), redirect: "error" });
    if (response.status !== 200) { await response.body?.cancel(); throw storageError("云媒体上传失败", 502); }
    const reader = response.body?.getReader();
    if (reader) {
      try {
        while (true) {
          const chunk = await reader.read();
          if (chunk.done) break;
          if (chunk.value.byteLength) throw storageError("云存储未确认上传成功，未发布媒体记录", 502);
        }
      } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
    }
    return { bucket: config.bucket, object, mimeType, size: bytes.byteLength };
  } catch (cause) {
    if (signal?.aborted) throw storageError("媒体上传已中断，远端保存状态未知", 499);
    if ((cause as { code?: string }).code === "ESTORAGE") throw cause;
    throw storageError("云媒体上传超时或连接失败，远端保存状态未知", 502);
  }
}

export async function open(bucket: string, object: string, range?: string, signal?: AbortSignal) {
  if (range && !/^bytes=(?:\d+-\d*|-\d+)$/.test(range)) throw storageError("仅支持单段媒体 Range", 416);
  try {
    const response = await fetch(objectUrl(bucket, object), {
      headers: range ? { Range: range } : {}, signal: transferSignal(signal), redirect: "error",
    });
    const contentRange = response.headers.get("content-range");
    const valid = response.status === 416 ? /^bytes \*\/\d+$/.test(contentRange ?? "")
      : response.status === 206 ? !!range && /^bytes \d+-\d+\/\d+$/.test(contentRange ?? "")
        : response.status === 200 && !range;
    if (response.status === 416 && valid) {
      await response.body?.cancel();
      return new Response(null, { status: 416, headers: { "Content-Range": contentRange!, "Content-Length": "0", "Accept-Ranges": "bytes" } });
    }
    if (!valid || /(?:json|html)/i.test(response.headers.get("content-type") ?? "")) {
      await response.body?.cancel();
      throw storageError("云媒体读取失败或返回了非媒体内容", 502);
    }
    return response;
  } catch (cause) {
    if ((cause as { code?: string }).code === "ESTORAGE") throw cause;
    throw storageError(signal?.aborted ? "媒体读取已中断" : "云媒体读取超时或连接失败", signal?.aborted ? 499 : 502);
  }
}

export async function read(bucket: string, object: string, signal?: AbortSignal, declaredType?: string) {
  const response = await open(bucket, object, undefined, signal);
  const reader = response.body?.getReader();
  if (!reader) throw storageError("云媒体内容为空", 502);
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > maxMediaBytes) throw storageError("云媒体超过100 MiB", 413);
      chunks.push(chunk.value);
    }
    const bytes = Buffer.concat(chunks, size);
    validateMedia(bytes, declaredType);
    return bytes;
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}
