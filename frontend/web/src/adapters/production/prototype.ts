import type { PrototypePort } from "@/ports/prototype";
import { studio } from "@/ports";
import { createNodeAi, type NodeVideoRequest } from "@toonflow/nodes-scaffold/nodeAi";
import { createAssetFiles } from "./assetFiles";

const nodeAi = createNodeAi();
const unavailableAccount = () => { throw new Error("当前实例使用共享工作区，没有演示账号"); };

export function createPrototypePort(): PrototypePort {
  return {
    workspaceMode: false,
    supportsCreation: true,
    requiresAccount: false,
    readLegacyState: () => null,
    readAccount: () => null,
    writeAccount: unavailableAccount,
    clearAccount: unavailableAccount,
    createWorkspaceFiles: getDirectory => {
      if (getDirectory().startsWith("browser://")) throw new Error("此项目属于旧浏览器原型，尚未导入服务器；原浏览器数据未改动");
      return createAssetFiles(getDirectory);
    },
    nodeAi,
    generateText: input => nodeAi.generate(input),
    async generateMedia(input) {
      const { kind, directory, providerId, modelId, prompt, references, ratio, imageSize, count, generateAudio, duration, resolution, firstFrameIndex, signal } = input;
      const media = references.map(({ path, mimeType }) => ({ path, mimeType }));
      const images = media.filter(item => item.mimeType.startsWith("image/")), videos = media.filter(item => item.mimeType.startsWith("video/"));
      const model = (await nodeAi.getMediaModels(signal)).find(item => item.providerId === providerId && item.modelId === modelId && item.type === kind);
      if (!model) throw new Error("所选模型未配置或已停用，输入与引用已保留");
      const modes = model.mode ?? [];
      if (kind === "image" && images.length && !modes.some(mode => mode === "multiReference" || mode === "singleImage" && images.length === 1)) throw new Error("所选图片模型未声明支持当前参考组合，素材已保留");
      let videoMode: NodeVideoRequest["mode"];
      if (kind === "video") {
        if (firstFrameIndex !== undefined) {
          videoMode = ["startFrameOptional", "endFrameOptional", "singleImage"].find(mode => modes.includes(mode)) as typeof videoMode;
          if (!videoMode || !media[firstFrameIndex]?.mimeType.startsWith("image/") || media.length !== 1) throw new Error("所选视频模型不支持当前首帧组合，素材已保留");
        } else if (images.length || videos.length) {
          const mode = modes.find(mode => Array.isArray(mode) && images.length <= Number(mode.find(value => value.startsWith("imageReference:"))?.split(":")[1] ?? 0) && videos.length <= Number(mode.find(value => value.startsWith("videoReference:"))?.split(":")[1] ?? 0));
          if (!Array.isArray(mode)) throw new Error("所选视频模型未声明支持当前参考类型或数量，素材已保留");
          videoMode = mode as typeof videoMode;
        } else if (modes.includes("text")) videoMode = "text";
        else if (modes.length) throw new Error("所选视频模型需要参考素材，请先添加支持的引用");
      }
      const common = { directory, providerId, modelId, prompt, outputDirectory: `assets/generated${crypto.randomUUID().replaceAll("-", "")}` };
      const files = kind === "image" ? await nodeAi.generateImage({ ...common, images, ...(model.imageRatios?.length && ratio ? { ratio } : {}), ...(model.imageSizes?.length && imageSize ? { size: imageSize } : {}), n: count }, signal)
        : kind === "audio" ? await nodeAi.generateAudio(common, signal)
          : await nodeAi.generateVideo({ ...common, ...(model.audio === "optional" ? { generateAudio } : typeof model.audio === "boolean" ? { generateAudio: model.audio } : {}),
            ...(firstFrameIndex !== undefined ? { mode: videoMode, firstFrame: media[firstFrameIndex] } : { mode: videoMode, images, videos }),
            ...(ratio ? { ratio } : {}), ...(model.durationResolutionMap?.length && duration ? { duration: Number(duration) } : {}), ...(model.durationResolutionMap?.length && resolution ? { resolution } : {}),
          }, signal);
      return files.map(file => ({ type: "file", path: file.path, mimeType: file.mimeType }));
    },
    async readMedia(url, signal) {
      const address = new URL(url, window.location.href);
      if (!["blob:", "data:"].includes(address.protocol) && (address.origin !== window.location.origin || !address.pathname.startsWith("/api/"))) throw new Error("模型结果必须先通过服务器保存到项目");
      const response = await fetch(address, { signal });
      if (!response.ok) throw new Error(`读取模型结果失败（HTTP ${response.status}）`);
      return response.blob();
    },
    async loadModels(base, apiKey, signal) {
      const { data } = await studio.loadLanguageModels<{ data: { id: string }[] }>({ apiUrl: base, protocol: "openai-completions", apiKey }, { signal });
      return data.data;
    },
  };
}
