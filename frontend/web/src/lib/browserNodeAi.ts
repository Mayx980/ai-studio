import { prototype } from "@/ports/prototype";
import { readGenerationOrigin, type GenerationOrigin } from "@/lib/generationOrigin";
import { deferCanvasGeneration, recordGenerationResults, readGenerationSettings, type GenerationSettings } from "@/lib/generationHistory";
import { ElMessage } from "element-plus";
import type { GeneratedMedia, MediaGenerationRequest } from "@toonflow/tools-scaffold/runtime";
import { browserConfig, browserModelSelection, configuredBrowserModels, type ModelKind } from "@/stores/browserGeneration";
import { studioCreationMode } from "./browserWorkspaceFiles";
import type { NodeAiAdapter, NodeAiRequest } from "@toonflow/nodes-scaffold/nodeAi";

export function browserNodeDefaults(kind: ModelKind, saved?: GenerationSettings) {
  const settings = readGenerationSettings(saved);
  const models = configuredBrowserModels(kind);
  const selected = models.find(model => model.id === browserModelSelection[kind]) ?? models[0];
  const providerId = settings?.providerId ?? selected?.providerId, modelId = settings?.modelId ?? selected?.modelId;
  return {
    ...(providerId && modelId ? { model: JSON.stringify([providerId, modelId]), modelLabel: settings?.label ?? selected?.label } : {}),
    ratio: settings?.ratio ?? browserConfig.ratio,
    ...(kind === "image" ? { size: settings?.imageSize ?? browserConfig.imageSize, n: settings?.n ?? browserConfig.count } : {}),
    ...(kind === "video" ? { duration: settings?.duration ?? (Number(browserConfig.duration) || 5), resolution: settings?.resolution ?? browserConfig.resolution, generateAudio: settings?.generateAudio ?? browserConfig.generateAudio,
      ...(settings ? { mode: JSON.stringify(settings.mode === "reference" ? ["imageReference:10", "videoReference:5"] : settings.mode) } : {}) } : {}),
  };
}

export const generateBrowserText = (input: NodeAiRequest) => prototype.generateText(input);
async function recordNodeMedia<T extends GeneratedMedia>(input: MediaGenerationRequest & { directory: string; origin?: GenerationOrigin }, results: T[]) {
  if (!studioCreationMode) return results;
  try {
    const settings: GenerationSettings = {
      providerId: input.providerId, modelId: input.modelId, label: input.modelId, ratio: input.ratio ?? "", imageSize: input.size ?? "",
      n: input.n ?? 1, style: "", duration: input.duration ?? -1, resolution: input.resolution ?? "", generateAudio: input.generateAudio ?? false,
      mode: input.firstFrame || input.lastFrame ? "singleImage" : input.images?.length || input.videos?.length || input.audios?.length ? "reference" : "text",
    };
    const batchId = crypto.randomUUID();
    const origin = readGenerationOrigin(input.origin);
    const records = results.map(item => ({ id: item.path, batchId, origin, kind: item.mediaType, path: item.path, mimeType: item.mimeType, name: item.path.split("/").at(-1), createdAt: Date.now(), prompt: input.prompt, model: input.modelId, settings }));
    if (origin?.type === "canvas") deferCanvasGeneration(origin, records);
    else await recordGenerationResults(input.directory, records);
  } catch (cause) {
    const message = `素材文件已保存，但生成历史登记失败：${cause instanceof Error ? cause.message : "请检查工作区保存状态"}`;
    ElMessage({ type: "error", message, duration: 0, showClose: true });
    if (results[0]) results[0].warning = [results[0].warning, message].filter(Boolean).join("；");
  }
  return results;
}
export const browserNodeAi: NodeAiAdapter = {
  continueOnUnmount: true,
  enabled: () => studioCreationMode || browserConfig.enabled,
  getModels: signal => prototype.nodeAi.getModels(signal),
  getMediaModels: signal => prototype.nodeAi.getMediaModels(signal),
  generate: input => prototype.nodeAi.generate(input),
  generateImage: async (input, signal) => recordNodeMedia(input, await prototype.nodeAi.generateImage(input, signal)),
  generateVideo: async (input, signal) => recordNodeMedia(input, await prototype.nodeAi.generateVideo(input, signal)),
  generateAudio: async (input, signal) => recordNodeMedia(input, await prototype.nodeAi.generateAudio(input, signal)),
};
