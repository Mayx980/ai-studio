import { readGenerationOrigin, type GenerationOrigin } from "@/lib/generationOrigin";
import { deferCanvasGeneration } from "@/lib/generationHistory";
import { recordGenerationResults, type GenerationSettings } from "@/lib/generationHistory";
import { saveProjectCover } from "@/lib/projectCover";
import type { NodeAiAdapter, NodeAiRequest, NodeMediaModel, NodeImageRequest, NodeVideoRequest } from "@toonflow/nodes-scaffold/nodeAi";
import { browserWorkspaceMode } from "@/lib/browserWorkspaceFiles";
import { browserConfig, configuredBrowserModels, resolveBrowserModel, type ModelKind } from "@/stores/browserGeneration";
import useWorkspaceFiles from "@/lib/workspaceFiles";
import { studioFetch } from "./studioFetch";
import imageModel from "./browserModels/imageModel";
import videoModel from "./browserModels/videoModel";
import audioModel from "./browserModels/audioModel";
const browserModels = { image: imageModel, video: videoModel, audio: audioModel };

function availableBrowserModels(): NodeMediaModel[] {
  return (["image", "video", "audio"] as const).flatMap(kind => configuredBrowserModels(kind).map(model => ({
    ...browserModels[kind].models[0]!, type: kind,
    ...(kind === "video" ? { durationResolutionMap: [{ duration: Array.from({ length: 28 }, (_, index) => index + 3), resolution: ["480P", "720P", "1080P"] }] } : {}), audio: kind === "video" ? "optional" as const : undefined,
    providerId: model.id, providerLabel: model.label, modelId: model.modelId, label: model.label,
  })));
}
function modelContext(kind: ModelKind, providerId: string, modelId: string, signal?: AbortSignal) {
  const model = resolveBrowserModel(kind, providerId, modelId);
  if (!/^https:\/\//i.test(model.endpoint)) throw new Error("接口地址必须使用 HTTPS");
  signal?.throwIfAborted();
  return { config: { apiKey: model.apiKey.trim(), endpoint: model.endpoint }, signal, tool: { fetch: studioFetch, errorMessage: (value: unknown) => value && typeof value === "object" && "message" in value ? String(value.message) : "接口返回错误" } };
}

export async function generateBrowserText(input: NodeAiRequest) {
  const context = modelContext("text", input.providerId, input.modelId, input.signal);
  const references = input.references ?? [];
  if (references.some(item => item.dataType !== "STRING")) throw new Error("当前文本模型仅支持文字参考，请移除图片、视频或文件引用后重试");
  if (input.tools?.length) throw new Error("当前浏览器文本适配器不支持工具调用");
  const endpoint = new URL(context.config.endpoint);
  const isAliyun = endpoint.hostname.endsWith(".aliyuncs.com");
  if (endpoint.pathname === "/" && isAliyun) endpoint.pathname = "/compatible-mode/v1";
  const base = endpoint.href.replace(/\/+$/, "");
  const response = await studioFetch(base.endsWith("/chat/completions") ? base : `${base}/chat/completions`, {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${context.config.apiKey}` }, signal: input.signal,
    body: JSON.stringify({ model: input.modelId, stream: false, ...(isAliyun ? { enable_thinking: false } : {}), messages: [
      { role: "system", content: input.systemPrompt || "根据用户要求生成对应内容。明确要求方案、剧情脚本或分镜脚本时输出完整文字内容，不要改成图片提示词。" },
      { role: "user", content: [input.prompt, ...references.map(item => item.value)].join("\n\n") },
    ] }),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(String(body.error?.message || `文本生成失败（HTTP ${response.status}）`).replaceAll(context.config.apiKey, "[Key]"));
  const text = body.choices?.[0]?.message?.content;
  if (body.choices?.[0]?.finish_reason === "length") throw new Error("文本输出达到模型上限，请缩小要求后重试");
  if (typeof text !== "string" || !text.trim()) throw new Error("文本模型没有返回有效内容");
  input.signal?.throwIfAborted();
  input.onEvent?.({ type: "text", delta: text });
  return { text };
}

async function imageInputs(directory: string, inputs: { path: string; mimeType: string }[] = []) {
  return Promise.all(inputs.map(async item => ({ type: "binary" as const, data: new Uint8Array(await useWorkspaceFiles(directory).read(item.path)), mimeType: item.mimeType })));
}

async function saveAssets(assets: { type: string; data?: string | Uint8Array; url?: string; mimeType?: string }[], input: { directory: string; outputDirectory: string; prompt?: string; modelId?: string; settings?: GenerationSettings; origin?: GenerationOrigin; images?: { path: string; mimeType: string }[]; videos?: { path: string; mimeType: string }[]; firstFrame?: { path: string; mimeType: string }; lastFrame?: { path: string; mimeType: string } }, kind: "image" | "video" | "audio", signal?: AbortSignal) {
  if (!assets.length) throw new Error("模型未返回生成素材");
  const files = useWorkspaceFiles(input.directory);
  // ACT: 沿用节点给出的工作区相对输出目录；文件授权和冲突保护仍由统一入口处理。
  let directory = "";
  for (const part of input.outputDirectory.split("/")) {
    directory = directory ? `${directory}/${part}` : part;
    await files.mkdir(directory).catch(error => { if (error.code !== "EEXIST" && error.response?.data?.data?.code !== "EEXIST") throw error; });
  }
  const saved = await Promise.all(assets.map(async asset => {
    signal?.throwIfAborted();
    const fallback = `${kind}/${kind === "image" ? "png" : kind === "video" ? "mp4" : "mpeg"}`;
    let blob: Blob;
    if (asset.type === "binary" && asset.data instanceof Uint8Array) blob = new Blob([new Uint8Array(asset.data).buffer], { type: asset.mimeType || fallback });
    else if (asset.type === "base64" && typeof asset.data === "string") blob = new Blob([Uint8Array.from(atob(asset.data.replace(/^data:[^,]*;base64,/, "")), char => char.charCodeAt(0))], { type: asset.mimeType || fallback });
    else if (asset.url) {
      const response = await studioFetch(asset.url, { signal });
      if (!response.ok) throw new Error(`下载生成素材失败（HTTP ${response.status}）`);
      blob = await response.blob();
    } else throw new Error("模型未返回有效素材地址");
    if (!blob.size || (blob.type && !blob.type.startsWith(`${kind}/`) && blob.type !== "application/octet-stream")) throw new Error("模型结果不是有效媒体");
    const mimeType = blob.type.startsWith(`${kind}/`) ? blob.type : asset.mimeType || fallback;
    const path = `${input.outputDirectory}/${crypto.randomUUID()}.${({ "image/jpeg": "jpg", "image/webp": "webp", "video/webm": "webm", "audio/wav": "wav", "audio/mpeg": "mp3" } as Record<string, string>)[mimeType] || (kind === "image" ? "png" : kind === "video" ? "mp4" : "mp3")}`;
    signal?.throwIfAborted();
    await files.write(path, blob, true);
    return { path, mimeType, mediaType: kind };
  }));
  const batchId = crypto.randomUUID();
  const records = saved.map(item => ({ id: crypto.randomUUID(), batchId, kind, path: item.path, mimeType: item.mimeType, name: item.path.split("/").at(-1), createdAt: Date.now(), prompt: input.prompt, model: input.modelId, settings: input.settings, origin: readGenerationOrigin(input.origin), references: [...(input.images ?? []), ...(input.videos ?? []), ...[input.firstFrame, input.lastFrame].filter((item): item is { path: string; mimeType: string } => !!item)] }));
  if (input.origin?.type === "canvas" && input.outputDirectory !== `assets/${input.origin.nodeId}`) deferCanvasGeneration(input.origin, records);
  else {
    await recordGenerationResults(input.directory, records);
    if (saved[0]) await saveProjectCover(input.directory, saved[0].path, saved[0].mimeType);
  }
  return saved;
}

export const browserNodeAi: NodeAiAdapter = {
  enabled: () => browserWorkspaceMode || browserConfig.enabled,
  async getModels(signal) {
    signal?.throwIfAborted();
    return configuredBrowserModels("text").map(model => ({ providerId: model.id, providerLabel: model.label, modelId: model.modelId, label: model.label, protocol: "openai-completions" as const }));
  },
  async getMediaModels(signal) { signal?.throwIfAborted(); return availableBrowserModels(); },
  async generateImage(input: NodeImageRequest & { origin?: GenerationOrigin }, signal?: AbortSignal) {
    if (!input.origin) throw new Error("缺少原画布来源，请重新打开节点后生成");
    const context = modelContext("image", input.providerId, input.modelId, signal);
    const label = resolveBrowserModel("image", input.providerId, input.modelId).label;
    const assets = await browserModels.image.generateImage.call(context, { ...input, model: input.modelId, images: await imageInputs(input.directory, input.images) });
    return await saveAssets(assets, { ...input, settings: { providerId: input.providerId, modelId: input.modelId, label, ratio: input.ratio ?? "", imageSize: input.size ?? "自动", n: input.n ?? 1, style: "", duration: 5, resolution: "", generateAudio: false, mode: input.images?.length ? "reference" : "text" } }, "image", signal) as Awaited<ReturnType<NodeAiAdapter["generateImage"]>>;
  },
  async generateVideo(input: NodeVideoRequest & { origin?: GenerationOrigin }, signal?: AbortSignal) {
    if (!input.origin) throw new Error("缺少原画布来源，请重新打开节点后生成");
    const context = modelContext("video", input.providerId, input.modelId, signal);
    const label = resolveBrowserModel("video", input.providerId, input.modelId).label;
    const frame = async (item?: { path: string; mimeType: string }) => item ? (await imageInputs(input.directory, [item]))[0] : undefined;
    const assets = await browserModels.video.generateVideo.call(context, { ...input, model: input.modelId, images: await imageInputs(input.directory, input.images), videos: await imageInputs(input.directory, input.videos), audios: await imageInputs(input.directory, input.audios), firstFrame: await frame(input.firstFrame), lastFrame: await frame(input.lastFrame) });
    return await saveAssets(assets, { ...input, settings: { providerId: input.providerId, modelId: input.modelId, label, ratio: input.ratio ?? "adaptive", imageSize: "", n: 1, style: "", duration: input.duration ?? 5, resolution: input.resolution ?? "480P", generateAudio: input.generateAudio ?? true, mode: input.mode === "singleImage" ? "singleImage" : input.mode === "text" ? "text" : "reference" } }, "video", signal) as Awaited<ReturnType<NodeAiAdapter["generateVideo"]>>;
  },
  async generateAudio(input, signal) {
    const context = modelContext("audio", input.providerId, input.modelId, signal);
    if (input.audios?.length || input.images?.length) throw new Error("当前音频模型仅支持文字输入");
    const { images, audios, language, ...parameters } = input;
    const prompt = [input.prompt, language ? `生成语言：${language}` : ""].filter(Boolean).join("\n");
    const assets = await browserModels.audio.generateAudio.call(context, { ...parameters, model: input.modelId, prompt });
    return await saveAssets(assets, input, "audio", signal) as Awaited<ReturnType<NodeAiAdapter["generateAudio"]>>;
  },
  generate: generateBrowserText,
} satisfies NodeAiAdapter;
