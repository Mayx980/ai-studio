import { computed, reactive, ref } from "vue";
import imageModel from "@/lib/browserModels/imageModel";
import videoModel from "@/lib/browserModels/videoModel";
import audioModel from "@/lib/browserModels/audioModel";
import { studioFetch } from "@/lib/studioFetch";
import textModel from "@/lib/browserModels/textModel";

export type ModelKind = "image" | "video" | "audio" | "text";
export const browserModels = { image: imageModel, video: videoModel, audio: audioModel, text: textModel };
// ACT: 原型直接使用供应商协议；Key 不进入持久化 Store 或服务端配置。
export const browserConfig = reactive({ enabled: false, kind: "video" as ModelKind, keys: { image: "", video: "", audio: "", text: "" }, endpoint: "https://llm-d7hnbcsabhzqr44p.cn-beijing.maas.aliyuncs.com", ratio: "", duration: "", resolution: "" });
export const generationBusy = ref(false);
export const generationError = ref("");
export const generationResults = ref<{ id: string; kind: ModelKind; url?: string; text?: string; file?: File; directory?: string }[]>([]);
export const selectedBrowserModel = computed(() => browserModels[browserConfig.kind].models[0]!);
let controller: AbortController | undefined;
export function stopBrowserGeneration() { controller?.abort(); }
export function clearBrowserKeys() { stopBrowserGeneration(); for (const key of Object.keys(browserConfig.keys) as ModelKind[]) browserConfig.keys[key] = ""; }

// ACT: 只依据明确的输出意图分类，参考素材本身不决定输出；模糊输入默认视频。
export function inferGenerationKind(prompt: string): "image" | "video" {
  const text = prompt.replace(/(?:不要|无需|不需要|不生成|不做)\s*(?:生成|制作)?\s*(?:图片|视频|短片|动画)/g, "");
  const image = /视频封面|图片|图像|海报|封面|插画|照片|肖像|截图|壁纸|静态图|image|photo|poster/i;
  const targets = [...text.matchAll(/(?:生成|制作|绘制|设计|输出|画一|做一|做成|变成|转(?:为|成)?|给我|我要|generate|create).{0,16}?(视频封面|短视频|视频|短片|动画|图片|图像|海报|封面|插画|照片|肖像|截图|壁纸|静态图|image|photo|poster|video)/gi)];
  if (targets.length) return image.test(targets.at(-1)![1]!) ? "image" : "video";
  const subject = text.replace(/(?:参考|根据|使用|上传|这张|该张).{0,8}?(?:图片|图像|照片)/g, "");
  if (/视频封面|海报|封面|插画|壁纸|静态图/.test(subject)) return "image";
  return (image.test(subject) || /绘制|画一|画个|画出/.test(subject)) && !/视频|短片|动画|video/i.test(subject) ? "image" : "video";
}

export async function generateInBrowser(prompt: string, references: File[], directory?: string) {
  if (generationBusy.value) return false;
  const kind: ModelKind = inferGenerationKind(prompt);
  browserConfig.kind = kind;
  const { endpoint, ratio, duration, resolution } = browserConfig;
  const apiKey = browserConfig.keys[kind].trim();
  generationError.value = "";
  if (!apiKey || !prompt.trim()) { generationError.value = "请填写提示词，并在外观 → API 配置中输入当前模型的 Key。"; return false; }
  if (!/^https:\/\//i.test(endpoint)) { generationError.value = "接口地址必须使用 HTTPS。"; return false; }
  if (references.some(file => !file.type.startsWith("image/"))) { generationError.value = "当前创作入口的参考素材仅支持图片。"; return false; }
  let firstFrameIndex: number | undefined;
  if (kind === "video") {
    // ACT: 只识别明确编号或唯一图片的首尾帧指令；多图映射不明确时要求补充，不猜测用途。
    const rolePrompt = prompt.replace(/(?:不要|无需|不必|不需要|不使用)\s*(?:把|将)?\s*(?:图(?:片)?\s*\d+|第[一二三四五六七八九十\d]+张(?:图(?:片)?)?)?\s*(?:作为|用作|当作|设为|设置为)?\s*(?:首帧|尾帧)/g, "");
    const frameIndex = (role: string) => {
      const image = "(?:图(?:片)?\\s*(\\d+)|第\\s*([一二三四五六七八九十\\d]+)\\s*张(?:图(?:片)?)?)";
      const match = rolePrompt.match(new RegExp(`${image}\\s*(?:作为|用作|当作|设为|设置为|是|为)\\s*${role}|${role}\\s*(?:使用|用|采用|为|是)\\s*${image}`));
      const number = match?.slice(1).find(Boolean);
      if (number) return /^\d+$/.test(number) ? Number(number) - 1 : "一二三四五六七八九十".indexOf(number);
      if (references.length === 1 && new RegExp(`(?:作为|用作|当作|设为|设置为)\\s*${role}|${role}\\s*(?:使用|用|采用|为|是)\\s*(?:这|该)`).test(rolePrompt)) return 0;
    };
    const lastFrameIndex = frameIndex("尾帧");
    firstFrameIndex = frameIndex("首帧");
    if (lastFrameIndex !== undefined || /(?:作为|用作|设为|设置为)\s*尾帧|分别.{0,6}首尾帧/.test(rolePrompt)) { generationError.value = "当前视频模型不支持尾帧，素材已保留。请更换支持尾帧的模型或修改要求。"; return false; }
    if (firstFrameIndex !== undefined && (!references[firstFrameIndex] || references.length !== 1)) { generationError.value = "当前首帧模式仅接受一张图片，请仅保留指定的首帧图片；其他图片不会被静默忽略。"; return false; }
    if (firstFrameIndex === undefined && /(?:作为|用作|设为|设置为)\s*首帧/.test(rolePrompt)) { generationError.value = "请明确指定首帧图片，例如“图1作为首帧”。"; return false; }
  }
  controller = new AbortController();
  const signal = controller.signal;
  generationBusy.value = true;
  try {
    const images = await Promise.all(references.map(async file => ({ type: "binary" as const, data: new Uint8Array(await file.arrayBuffer()), mimeType: file.type, name: file.name })));
    const tool = { fetch: studioFetch, errorMessage: (value: unknown) => value && typeof value === "object" && "message" in value ? String(value.message) : "接口返回错误" };
    const context = { config: { apiKey, endpoint }, signal, tool };
    const assets = kind === "image" ? await imageModel.generateImage.call(context, { model: imageModel.models[0]!.id, prompt, images, ...(ratio ? { ratio } : {}), ...(resolution ? { size: resolution } : {}) })
      : await videoModel.generateVideo.call(context, { model: videoModel.models[0]!.id, prompt, ...(firstFrameIndex !== undefined ? { mode: "singleImage", firstFrame: images[firstFrameIndex!] } : { mode: images.length ? ["imageReference:10"] : "text", images }), ...(ratio ? { ratio } : {}), ...(duration ? { duration: Number(duration) } : {}), ...(resolution ? { resolution } : {}) });
    signal.throwIfAborted();
    for (const asset of assets) {
      const mimeType = asset.mimeType || `${kind}/${kind === "image" ? "png" : "mp4"}`;
      const file = asset.type === "base64" && asset.data ? new File([Uint8Array.from(atob(asset.data), char => char.charCodeAt(0))], `生成结果.${mimeType.split("/")[1]}`, { type: mimeType }) : undefined;
      generationResults.value.push({ id: crypto.randomUUID(), kind, url: file ? URL.createObjectURL(file) : asset.url, file, directory });
    }
    return true;
  } catch (error) {
    generationError.value = signal.aborted ? "已停止等待；已提交的远端任务可能仍在运行，请先检查供应商任务记录。" : error instanceof TypeError ? "无法访问供应商接口，请检查本机预览服务及网络。输入和参考已保留。" : (error instanceof Error ? error.message : "模型调用失败").replaceAll(apiKey, "[Key]");
    return false;
  } finally { generationBusy.value = false; controller = undefined; }
}
