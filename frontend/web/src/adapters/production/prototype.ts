import type { PrototypePort } from "@/ports/prototype";
import { createBrowserWorkspaceFiles } from "./browserWorkspaceFiles";
import { studioFetch } from "./studioFetch";
import imageModel from "./browserModels/imageModel";
import videoModel from "./browserModels/videoModel";
import audioModel from "./browserModels/audioModel";

const nodeAi = async () => (await import("./browserNodeAi")).browserNodeAi;

export function createPrototypePort(): PrototypePort {
  return {
    workspaceMode: true,
    requiresAccount: true,
    readLegacyState: key => localStorage.getItem(key),
    readAccount: () => sessionStorage.getItem("afxen.prototypeAccount"),
    writeAccount: id => sessionStorage.setItem("afxen.prototypeAccount", id),
    clearAccount: () => sessionStorage.removeItem("afxen.prototypeAccount"),
    createWorkspaceFiles: createBrowserWorkspaceFiles,
    nodeAi: {
      getModels: async signal => (await nodeAi()).getModels(signal),
      getMediaModels: async signal => (await nodeAi()).getMediaModels(signal),
      generate: async input => (await nodeAi()).generate(input),
      generateImage: async (input, signal) => (await nodeAi()).generateImage(input, signal),
      generateVideo: async (input, signal) => (await nodeAi()).generateVideo(input, signal),
      generateAudio: async (input, signal) => (await nodeAi()).generateAudio(input, signal),
    },
    generateText: async input => (await import("./browserNodeAi")).generateBrowserText(input),
    async generateMedia(input) {
      const { kind, modelId, prompt, config, references, ratio, imageSize, count, generateAudio, duration, resolution, firstFrameIndex, signal } = input;
      const images = references.filter(item => item.mimeType.startsWith("image/"));
      const videos = references.filter(item => item.mimeType.startsWith("video/"));
      const context = { config, signal, tool: { fetch: studioFetch, errorMessage: (value: unknown) => value && typeof value === "object" && "message" in value ? String(value.message) : "接口返回错误" } };
      if (kind === "audio") return audioModel.generateAudio.call(context, { model: modelId, prompt });
      if (kind === "image") return imageModel.generateImage.call(context, { model: modelId, prompt, images, ...(ratio ? { ratio } : {}), size: imageSize, n: count });
      return videoModel.generateVideo.call(context, {
        generateAudio, model: modelId, prompt,
        ...(firstFrameIndex !== undefined ? { mode: "singleImage", firstFrame: references[firstFrameIndex] } : { mode: images.length || videos.length ? ["imageReference:10", "videoReference:5"] : "text", images, videos }),
        ...(ratio ? { ratio } : {}), ...(duration ? { duration: Number(duration) } : {}), ...(resolution ? { resolution } : {}),
      });
    },
    async readMedia(url, signal) {
      const response = await studioFetch(url, { signal });
      if (!response.ok) throw new Error(`读取模型结果失败（HTTP ${response.status}）`);
      return response.blob();
    },
    async loadModels(base, apiKey, signal) {
      const response = await studioFetch(`${base}/models`, { headers: { Authorization: `Bearer ${apiKey}` }, signal });
      const result = await response.json();
      if (!response.ok) throw new Error(`获取模型失败（HTTP ${response.status}）：${String(result.error?.message || result.message || "请检查 Key 和模型权限").replaceAll(apiKey, "[Key]")}`);
      if (!Array.isArray(result.data) || result.data.length > 2000 || result.data.some((item: unknown) => !item || typeof item !== "object" || !("id" in item) || typeof item.id !== "string" || !item.id.trim() || item.id.length > 200)) throw new Error("厂商未返回有效模型列表，请手动填写模型 ID");
      return result.data;
    },
  };
}
