import { browserWorkspaceMode } from "@/lib/browserWorkspaceFiles";
import useWorkspaceFiles from "@/lib/workspaceFiles";
import { uploadNodeFile } from "@toonflow/nodes-scaffold/workspaceFiles";
import { computed, reactive, ref } from "vue";
import imageModel from "@/lib/browserModels/imageModel";
import videoModel from "@/lib/browserModels/videoModel";
import audioModel from "@/lib/browserModels/audioModel";
import { studioFetch } from "@/lib/studioFetch";
import { generateBrowserText } from "@/lib/browserNodeAi";
import textModel from "@/lib/browserModels/textModel";

export type ModelKind = "image" | "video" | "audio" | "text";
export const browserModels = { image: imageModel, video: videoModel, audio: audioModel, text: textModel };
// ACT: 原型直接使用供应商协议；Key 不进入持久化 Store 或服务端配置。
export const browserConfig = reactive({ enabled: false, kind: "image" as ModelKind, keys: { image: "", video: "", audio: "", text: "" }, endpoint: "https://llm-d7hnbcsabhzqr44p.cn-beijing.maas.aliyuncs.com", ratio: "", duration: "", resolution: "" });
export const generationBusy = ref(false);
export const generationError = ref("");
export type BrowserGenerationResult = { id: string; kind: ModelKind; url?: string; text?: string; file?: File; directory?: string; path?: string };
export type BrowserWorkflow = { complete(results: BrowserGenerationResult[]): Promise<void> };
export type BeginBrowserWorkflow = (prompt: string, kind: ModelKind, references: File[], script: boolean) => Promise<BrowserWorkflow>;
export const generationResults = ref<BrowserGenerationResult[]>([]);
export const selectedBrowserModel = computed(() => browserModels[browserConfig.kind].models[0]!);
let controller: AbortController | undefined;
export function stopBrowserGeneration() { controller?.abort(); }
export function clearBrowserKeys() { stopBrowserGeneration(); for (const key of Object.keys(browserConfig.keys) as ModelKind[]) browserConfig.keys[key] = ""; }

export async function restoreBrowserResults(directory: string) {
  if (!browserWorkspaceMode) return;
  const files = useWorkspaceFiles(directory);
  let saved: { id: string; kind: ModelKind; path: string; mimeType?: string; name?: string }[];
  try { saved = await files.readJson(".agent/browserResults.json"); }
  catch (error) { if ((error as { code?: string }).code === "ENOENT") return; throw error; }
  if (!Array.isArray(saved)) throw new Error("浏览器素材记录无效");
  for (const item of saved) {
    if (!item || typeof item.id !== "string" || !["image", "video", "audio"].includes(item.kind) || typeof item.path !== "string") throw new Error("浏览器素材记录无效");
    if (generationResults.value.some(result => result.id === item.id && result.directory === directory)) continue;
    const type = item.mimeType?.startsWith(`${item.kind}/`) ? item.mimeType : `${item.kind}/${item.kind === "video" ? "mp4" : item.kind === "audio" ? "mpeg" : "png"}`;
    const file = new File([await files.read(item.path)], item.name || item.path.split("/").at(-1)!, { type });
    generationResults.value.push({ ...item, directory, file, url: URL.createObjectURL(file) });
  }
}
async function saveBrowserResults(directory: string) {
  const files = useWorkspaceFiles(directory);
  for (const item of generationResults.value.filter(item => item.directory === directory && !item.path && item.kind !== "text")) {
    if (!item.file) {
      const response = await studioFetch(item.url!);
      if (!response.ok) throw new Error(`素材已生成，但下载保存失败（HTTP ${response.status}），请保留页面重试`);
      const blob = await response.blob();
      const mimeType = blob.type.startsWith(`${item.kind}/`) ? blob.type : `${item.kind}/${item.kind === "video" ? "mp4" : item.kind === "audio" ? "mpeg" : "png"}`;
      item.file = new File([blob], `生成素材.${mimeType.split("/")[1]}`, { type: mimeType });
    }
    item.path = await uploadNodeFile(files, item.id, item.file);
    if (item.url?.startsWith("blob:")) URL.revokeObjectURL(item.url);
    item.url = URL.createObjectURL(item.file);
  }
  await files.mkdir(".agent").catch(error => { if (error.code !== "EEXIST") throw error; });
  await files.writeJson(".agent/browserResults.json", generationResults.value.filter(item => item.directory === directory && item.path).map(({ id, kind, path, file }) => ({ id, kind, path, mimeType: file?.type, name: file?.name })));
}

// ACT: 输出意图按动作后的目标优先；参考素材或“视频脚本”中的视频不单独决定输出。
export function explicitGenerationKind(prompt: string): ModelKind | undefined {
  const text = prompt.replace(/(?:不要|无需|不需要|不生成|不做)\s*(?:生成|制作)?\s*(?:图片|视频|短片|动画|音频|脚本|方案)/g, "");
  const kindFor = (target: string): ModelKind => /脚本|方案|策划|文案|大纲|故事|文字|文本|script|plan/i.test(target) ? "text" : /音频|音乐|配音|旁白|音效|audio|music/i.test(target) ? "audio" : /视频|短片|动画|video/i.test(target) ? "video" : "image";
  const targets = [...text.matchAll(/(?:生成|制作|绘制|设计|输出|写一|写个|编写|创作|画一|做一|做成|变成|转(?:为|成)?|给我|我要|generate|create).{0,16}?(视频封面|剧情脚本|分镜脚本|视频脚本|脚本|方案|策划|文案|大纲|故事|文字|文本|短视频|视频|短片|动画|音频|音乐|配音|旁白|音效|图片|图像|海报|封面|插画|照片|肖像|截图|壁纸|静态图|script|plan|image|photo|poster|video|audio|music)/gi)];
  if (targets.length) return kindFor(targets.at(-1)![1]!);
  const target = text.match(/视频封面|剧情脚本|分镜脚本|视频脚本|脚本|方案|策划|文案|大纲|文字|文本|音频|音乐|配音|旁白|音效|视频|短片|动画|海报|封面|插画|壁纸|静态图|图片|图像|script|plan|image|photo|poster|video|audio|music/i)?.[0];
  return target ? kindFor(target) : undefined;
}
export function inferGenerationKind(prompt: string): ModelKind { return explicitGenerationKind(prompt) ?? "image"; }

export async function generateInBrowser(prompt: string, references: File[], directory?: string, requestedKind?: ModelKind) {
  if (generationBusy.value) return false;
  const kind: ModelKind = requestedKind ?? inferGenerationKind(prompt);
  browserConfig.kind = kind;
  const { endpoint, ratio, duration, resolution } = browserConfig;
  const apiKey = browserConfig.keys[kind].trim();
  generationError.value = "";
  if (!apiKey || !prompt.trim()) { generationError.value = "请填写提示词，并在设置 → API 配置中输入当前模型的 Key。"; return false; }
  if (!/^https:\/\//i.test(endpoint)) { generationError.value = "接口地址必须使用 HTTPS。"; return false; }
  if ((kind === "text" || kind === "audio") && references.length) { generationError.value = "当前文字／音频适配器仅支持文字输入，请移除引用素材；输入与素材已保留。"; return false; }
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
    if (kind === "text") {
      const { text } = await generateBrowserText({ providerId: textModel.id, modelId: textModel.models[0]!.id, prompt, signal });
      signal.throwIfAborted();
      generationResults.value.push({ id: crypto.randomUUID(), kind, text, directory });
      return true;
    }
    const images = await Promise.all(references.map(async file => ({ type: "binary" as const, data: new Uint8Array(await file.arrayBuffer()), mimeType: file.type, name: file.name })));
    const tool = { fetch: studioFetch, errorMessage: (value: unknown) => value && typeof value === "object" && "message" in value ? String(value.message) : "接口返回错误" };
    const context = { config: { apiKey, endpoint }, signal, tool };
    const assets = kind === "audio" ? await audioModel.generateAudio.call(context, { model: audioModel.models[0]!.id, prompt }) : kind === "image" ? await imageModel.generateImage.call(context, { model: imageModel.models[0]!.id, prompt, images, ...(ratio ? { ratio } : {}), ...(resolution ? { size: resolution } : {}) })
      : await videoModel.generateVideo.call(context, { model: videoModel.models[0]!.id, prompt, ...(firstFrameIndex !== undefined ? { mode: "singleImage", firstFrame: images[firstFrameIndex!] } : { mode: images.length ? ["imageReference:10"] : "text", images }), ...(ratio ? { ratio } : {}), ...(duration ? { duration: Number(duration) } : {}), ...(resolution ? { resolution } : {}) });
    signal.throwIfAborted();
    if (!assets.length) throw new Error("模型未返回生成素材");
    for (const asset of assets) {
      const mimeType = asset.mimeType || `${kind}/${kind === "image" ? "png" : kind === "audio" ? "mpeg" : "mp4"}`;
      const file = asset.type === "base64" && asset.data ? new File([Uint8Array.from(atob(asset.data), char => char.charCodeAt(0))], `生成结果.${mimeType.split("/")[1]}`, { type: mimeType }) : undefined;
      generationResults.value.push({ id: crypto.randomUUID(), kind, url: file ? URL.createObjectURL(file) : asset.url, file, directory });
    }
    if (browserWorkspaceMode && directory) await saveBrowserResults(directory);
    return true;
  } catch (error) {
    generationError.value = signal.aborted ? "已停止等待；已提交的远端任务可能仍在运行，请先检查供应商任务记录。" : error instanceof TypeError ? "无法访问供应商接口，请检查本机预览服务及网络。输入和参考已保留。" : (error instanceof Error ? error.message : "模型调用失败").replaceAll(apiKey, "[Key]");
    return false;
  } finally { generationBusy.value = false; controller = undefined; }
}

export async function browserResultFile(item: BrowserGenerationResult) {
  let file = item.file;
  if (!file) {
    const response = await studioFetch(item.url!);
    if (!response.ok) throw new Error(`读取模型结果失败（HTTP ${response.status}）`);
    const blob = await response.blob();
    if (!blob.size || (blob.type && !blob.type.startsWith(`${item.kind}/`) && blob.type !== "application/octet-stream")) throw new Error("结果地址没有返回有效素材，请检查供应商的结果地址和有效期");
    file = new File([blob], `生成结果.${item.kind === "video" ? "mp4" : item.kind === "audio" ? "mp3" : "png"}`, { type: (blob.type.startsWith(`${item.kind}/`) ? blob.type : "") || `${item.kind}/${item.kind === "video" ? "mp4" : item.kind === "audio" ? "mpeg" : "png"}` });
  }
  item.file = file;
  return file;
}
