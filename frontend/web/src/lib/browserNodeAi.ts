import { prototype } from "@/ports/prototype";
import { readGenerationSettings, type GenerationSettings } from "@/lib/generationHistory";
import { browserConfig, browserModelSelection, configuredBrowserModels, type ModelKind } from "@/stores/browserGeneration";
import { browserWorkspaceMode } from "./browserWorkspaceFiles";
import type { NodeAiAdapter, NodeAiRequest } from "@toonflow/nodes-scaffold/nodeAi";

export function browserNodeDefaults(kind: ModelKind, saved?: GenerationSettings) {
  const settings = readGenerationSettings(saved);
  const models = configuredBrowserModels(kind);
  const selected = models.find(model => model.id === browserModelSelection[kind]) ?? models[0];
  const providerId = settings?.providerId ?? selected?.id, modelId = settings?.modelId ?? selected?.modelId;
  return {
    ...(providerId && modelId ? { model: JSON.stringify([providerId, modelId]), modelLabel: settings?.label ?? selected?.label } : {}),
    ratio: settings?.ratio ?? browserConfig.ratio,
    ...(kind === "image" ? { size: settings?.imageSize ?? browserConfig.imageSize, n: settings?.n ?? browserConfig.count } : {}),
    ...(kind === "video" ? { duration: settings?.duration ?? (Number(browserConfig.duration) || 5), resolution: settings?.resolution ?? browserConfig.resolution, generateAudio: settings?.generateAudio ?? browserConfig.generateAudio,
      ...(settings ? { mode: JSON.stringify(settings.mode === "reference" ? ["imageReference:10", "videoReference:5"] : settings.mode) } : {}) } : {}),
  };
}

export const generateBrowserText = (input: NodeAiRequest) => prototype.generateText(input);
export const browserNodeAi: NodeAiAdapter = {
  continueOnUnmount: true,
  enabled: () => browserWorkspaceMode || browserConfig.enabled,
  getModels: signal => prototype.nodeAi.getModels(signal),
  getMediaModels: signal => prototype.nodeAi.getMediaModels(signal),
  generate: input => prototype.nodeAi.generate(input),
  generateImage: (input, signal) => prototype.nodeAi.generateImage(input, signal),
  generateVideo: (input, signal) => prototype.nodeAi.generateVideo(input, signal),
  generateAudio: (input, signal) => prototype.nodeAi.generateAudio(input, signal),
};
