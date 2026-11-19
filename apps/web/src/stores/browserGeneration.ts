import { clipReferenceVideo } from "@toonflow/node-video/referenceClip";
import { readGenerationOrigin, rememberFileOrigin, type GenerationOrigin } from "@/lib/generationOrigin";
import { recordGenerationResults, readGenerationSettings, type GenerationSettings, type GenerationRecord } from "@/lib/generationHistory";
import { saveProjectCover } from "@/lib/projectCover";
import { generationStyles } from "@/lib/generationStyles";
import { imageClaritySizes, defaultRatio, defaultVideoResolution } from "@toonflow/node-shared/generationDefaults";
import { browserWorkspaceMode } from "@/lib/browserWorkspaceFiles";
import useWorkspaceFiles from "@/lib/workspaceFiles";
import { uploadNodeFile } from "@toonflow/nodes-scaffold/workspaceFiles";
import { computed, reactive, ref, watch } from "vue";
import imageModel from "@/lib/browserModels/imageModel";
import videoModel from "@/lib/browserModels/videoModel";
import audioModel from "@/lib/browserModels/audioModel";
import { studioFetch } from "@/lib/studioFetch";
import { generateBrowserText } from "@/lib/browserNodeAi";
import textModel from "@/lib/browserModels/textModel";

export type ModelKind = "image" | "video" | "audio" | "text";
export const browserModels = { image: imageModel, video: videoModel, audio: audioModel, text: textModel };
// ACT: 原型直接使用供应商协议；Key 不进入持久化 Store 或服务端配置。
export const browserConfig = reactive({ enabled: false, kind: "image" as ModelKind, keys: { image: "", video: "", audio: "", text: "" }, endpoint: "https://llm-d7hnbcsabhzqr44p.cn-beijing.maas.aliyuncs.com", ratio: defaultRatio, imageSize: imageClaritySizes["480P"]![defaultRatio]!, imageResolution: "480P", count: 1, style: "", outputKind: "image" as "image" | "video", outputChosen: false, generateAudio: true, duration: "", resolution: defaultVideoResolution });
export const browserParameterKeys = ["kind", "ratio", "imageSize", "imageResolution", "count", "style", "outputKind", "outputChosen", "generateAudio", "duration", "resolution"] as const;
export const additionalBrowserModels = reactive<{ id: string; kind: ModelKind; label: string; modelId: string; endpoint: string; apiKey: string }[]>([]);
export const browserModelSelection = reactive<Record<ModelKind, string>>({ image: "", video: "", audio: "", text: "" });
export type BrowserModelConnection = {
  enabled: boolean;
  endpoint: string;
  keys: typeof browserConfig.keys;
  models: (typeof additionalBrowserModels)[number][];
  selection: typeof browserModelSelection;
};
// ACT: 同源来源编辑页只接收主页面内存中的连接配置，凭据不经过URL或持久化存储。
if (window.parent !== window && window.frameElement?.getAttribute("data-source-editor") === "true") {
  window.addEventListener("afxen:source-models", event => {
    const connection = (event as CustomEvent<BrowserModelConnection>).detail;
    if (!connection || typeof connection.enabled !== "boolean" || typeof connection.endpoint !== "string" || !connection.keys || !connection.selection || !Array.isArray(connection.models)) return;
    const kinds = ["image", "video", "audio", "text"] as const;
    if (kinds.some(kind => typeof connection.keys[kind] !== "string" || typeof connection.selection[kind] !== "string") || connection.models.some(model => !model || !kinds.includes(model.kind) || [model.id, model.label, model.modelId, model.endpoint, model.apiKey].some(value => typeof value !== "string"))) return;
    browserConfig.enabled = connection.enabled;
    browserConfig.endpoint = connection.endpoint;
    Object.assign(browserConfig.keys, connection.keys);
    additionalBrowserModels.splice(0, additionalBrowserModels.length, ...connection.models.map(model => ({ ...model })));
    Object.assign(browserModelSelection, connection.selection);
  });
}
export function configuredBrowserModels(kind: ModelKind, config = browserConfig) {
  if (!config.enabled) return [];
  const adapter = browserModels[kind];
  return [
    ...adapter.models.map(model => ({ id: adapter.id, kind, label: model.label, modelId: model.id, endpoint: config.endpoint, apiKey: config.keys[kind] })),
    ...additionalBrowserModels.filter(model => model.kind === kind),
  ].filter(model => model.apiKey.trim() && model.modelId.trim() && model.label.trim());
}
// 仅使用已声明的能力；自定义模型不能借用默认模型的视频参考能力。
export function browserVideoCapability(modelId?: string) {
  return videoModel.models.find(model => model.id === modelId) as (typeof videoModel.models)[number] & { motionImitation?: boolean } | undefined;
}
export function supportsVideoReference(modelId?: string) {
  return browserVideoCapability(modelId)?.mode.some(mode => Array.isArray(mode) && mode.some(value => value.startsWith("videoReference:"))) ?? false;
}
export function resolveBrowserModel(kind: ModelKind, providerId?: string, modelId?: string) {
  const models = configuredBrowserModels(kind);
  const model = providerId ? models.find(model => model.id === providerId && model.modelId === modelId) : models.find(model => model.id === browserModelSelection[kind]) ?? models[0];
  if (!model) throw new Error("请先在设置 → API 配置中接入并选择对应模型");
  return model;
}
export const generationBusy = ref(false);
export const generationError = ref("");
export type BrowserGenerationResult = { id: string; batchId?: string; tags?: string[]; kind: ModelKind; createdAt?: number; prompt?: string; model?: string; url?: string; text?: string; file?: File; directory?: string; path?: string; settings?: GenerationSettings; origin?: GenerationOrigin; references?: GenerationRecord["references"] };
export type BrowserConversationImport = { id: string; directory: string; request: string; references: { file: File; label: string; role?: "firstFrame" | "reference" | "middleFrame" | "lastFrame" }[]; results: BrowserGenerationResult[] };
export type BrowserWorkflowNode = { canvasPath: string; nodeId: string };
export type ProfessionalCanvas = {
  focus(directory: string, node: BrowserWorkflowNode): Promise<void>;
  read(directory: string, node: BrowserWorkflowNode): Promise<string>;
  mount(directory: string, node: BrowserWorkflowNode, target: HTMLElement): Promise<() => void>;
  apply(directory: string, result: BrowserGenerationResult, sources: BrowserWorkflowNode[], label: string, model?: string, prompt?: string): Promise<BrowserWorkflowNode>;
};
export type BrowserWorkflow = { node: BrowserWorkflowNode; complete(results: BrowserGenerationResult[]): Promise<void> };
export type BeginBrowserWorkflow = (prompt: string, kind: ModelKind, references: File[], script: boolean, visible?: boolean, sources?: BrowserWorkflowNode[]) => Promise<BrowserWorkflow>;
export const generationResults = ref<BrowserGenerationResult[]>([]);
export const selectedBrowserModel = computed(() => configuredBrowserModels(browserConfig.kind).find(model => model.id === browserModelSelection[browserConfig.kind]) ?? configuredBrowserModels(browserConfig.kind)[0] ?? { label: "未接入模型" });
let controller: AbortController | undefined;
export function stopBrowserGeneration() { controller?.abort(); }
export function clearBrowserKeys() { stopBrowserGeneration(); for (const key of Object.keys(browserConfig.keys) as ModelKind[]) browserConfig.keys[key] = ""; additionalBrowserModels.forEach(model => { model.apiKey = ""; }); }

export async function restoreBrowserResults(directory: string) {
  if (!browserWorkspaceMode) return;
  const files = useWorkspaceFiles(directory);
  let saved: GenerationRecord[];
  try { saved = await files.readJson(".agent/browserResults.json"); }
  catch (error) { if ((error as { code?: string }).code === "ENOENT") return; throw error; }
  if (!Array.isArray(saved)) throw new Error("浏览器素材记录无效");
  for (const item of saved) {
    if (!item || typeof item.id !== "string" || !["image", "video", "audio"].includes(item.kind) || typeof item.path !== "string") throw new Error("浏览器素材记录无效");
    if (generationResults.value.some(result => result.id === item.id && result.directory === directory)) continue;
    const type = item.mimeType?.startsWith(`${item.kind}/`) ? item.mimeType : `${item.kind}/${item.kind === "video" ? "mp4" : item.kind === "audio" ? "mpeg" : "png"}`;
    const file = new File([await files.read(item.path)], item.name || item.path.split("/").at(-1)!, { type });
    // 文件读取期间其他窗口可能已恢复同一记录，写入前再次核对。
    if (generationResults.value.some(result => result.id === item.id && result.directory === directory)) continue;
    generationResults.value.push({ ...item, settings: readGenerationSettings(item.settings), origin: readGenerationOrigin(item.origin), directory, file, url: URL.createObjectURL(file) });
  }
}
async function saveBrowserResults(directory: string, signal?: AbortSignal) {
  const files = useWorkspaceFiles(directory);
  for (const item of generationResults.value.filter(item => item.directory === directory && !item.path && item.kind !== "text")) {
    if (!item.file) {
      const response = await studioFetch(item.url!, { signal });
      if (!response.ok) throw new Error(`素材已生成，但下载保存失败（HTTP ${response.status}），请保留页面重试`);
      const blob = await response.blob();
      const mimeType = blob.type.startsWith(`${item.kind}/`) ? blob.type : `${item.kind}/${item.kind === "video" ? "mp4" : item.kind === "audio" ? "mpeg" : "png"}`;
      item.file = new File([blob], `生成素材.${mimeType.split("/")[1]}`, { type: mimeType });
    }
    signal?.throwIfAborted();
    item.path = await uploadNodeFile(files, item.id, item.file);
    await saveProjectCover(directory, item.path, item.file.type);
    if (item.url?.startsWith("blob:")) URL.revokeObjectURL(item.url);
    item.url = URL.createObjectURL(item.file);
  }
  await recordGenerationResults(directory, generationResults.value.filter(item => item.directory === directory && item.path && item.kind !== "text").map(({ id, batchId, tags, kind, path, file, createdAt, prompt, model, settings, origin, references }) => ({ id, batchId, tags, prompt, model, origin, references, settings: readGenerationSettings(settings), kind: kind as GenerationRecord["kind"], path: path!, createdAt, mimeType: file?.type, name: file?.name })));
}

// ACT: 输出意图按动作后的目标优先；参考素材或“视频脚本”中的视频不单独决定输出。
export function explicitGenerationKind(prompt: string): ModelKind | undefined {
  const text = prompt.replace(/(?:不要|无需|不需要|不生成|不做)\s*(?:生成|制作)?\s*(?:图片|视频|短片|动画|音频|脚本|方案)/g, "");
  const kindFor = (target: string): ModelKind => /脚本|方案|策划|文案|大纲|故事|文字|文本|script|plan/i.test(target) ? "text" : /音频|音乐|配音|旁白|音效|audio|music/i.test(target) ? "audio" : /视频|短片|动画|video/i.test(target) ? "video" : "image";
  const targets = [...text.matchAll(/(?:生成|制作|绘制|设计|输出|写一|写个|编写|创作|画一|做一|做成|变成|转(?:为|成)?|给我|我要|generate|create).{0,16}?(视频封面|剧情脚本|分镜脚本|分镜设计|剧情|视频脚本|脚本|方案|策划|文案|大纲|故事|文字|文本|短视频|视频|短片|动画|音频|音乐|配音|旁白|音效|图片|图像|海报|封面|插画|照片|肖像|截图|壁纸|静态图|script|plan|image|photo|poster|video|audio|music)/gi)];
  if (targets.length) return kindFor(targets.at(-1)![1]!);
  const target = text.match(/视频封面|剧情脚本|分镜脚本|分镜设计|剧情|视频脚本|脚本|方案|策划|文案|大纲|文字|文本|音频|音乐|配音|旁白|音效|视频|短片|动画|海报|封面|插画|壁纸|静态图|图片|图像|script|plan|image|photo|poster|video|audio|music/i)?.[0];
  return target ? kindFor(target) : undefined;
}
export function inferGenerationKind(prompt: string): ModelKind {
  const kind = explicitGenerationKind(prompt);
  return browserConfig.outputChosen ? browserConfig.outputKind : kind ?? browserConfig.outputKind;
}

export async function generateInBrowser(prompt: string, references: File[], directory?: string, requestedKind?: ModelKind, style = "", referenceRoles?: ("firstFrame" | "reference" | "middleFrame" | "lastFrame" | undefined)[], options?: { config?: typeof browserConfig; tags?: string[]; origin?: GenerationOrigin; references?: GenerationRecord["references"]; modelSelection?: typeof browserModelSelection; queue?: boolean; cancelled?: () => boolean; onStart?: () => void; onTask?: (id: string) => void; onPreparing?: () => void; onPrepared?: () => void }) {
  while (options?.queue && generationBusy.value) await new Promise<void>(resolve => { const stop = watch(generationBusy, busy => { if (!busy) { stop(); resolve(); } }); });
  if (options?.cancelled?.()) { generationError.value = "已取消等待生成"; return false; }
  const config = options?.config ?? browserConfig;
  const modelSelection = options?.modelSelection ?? browserModelSelection;
  if (generationBusy.value) return false;
  if (!config.enabled) { generationError.value = "请先在设置 → API 配置中启用模型联调"; return false; }
  const kind: ModelKind = requestedKind ?? inferGenerationKind(prompt);
  const origin = readGenerationOrigin(options?.origin);
  if ((kind === "image" || kind === "video") && (!origin || origin.directory !== directory)) { generationError.value = "缺少生成来源，请重新打开原画布或对话后生成"; return false; }
  config.kind = kind;
  const chosen = configuredBrowserModels(kind, config).find(model => model.id === modelSelection[kind]) ?? configuredBrowserModels(kind, config)[0];
  const { ratio, duration, resolution, imageSize, count, generateAudio } = config;
  if (!Number.isInteger(count) || count < 1 || count > 6) { generationError.value = "图片生成数量须为 1–6 张"; return false; }
  if (kind === "image" && generationStyles[style]) prompt += `\n图片风格要求：${style}。${generationStyles[style]}保留用户指定的主体、产品特征与构图要求，不额外添加文字或水印。`;
  const endpoint = chosen?.endpoint || config.endpoint;
  const apiKey = chosen?.apiKey.trim() ?? "";
  generationError.value = "";
  if (!apiKey || !prompt.trim()) { generationError.value = "请填写提示词，并在设置 → API 配置中输入当前模型的 Key。"; return false; }
  if (!/^https:\/\//i.test(endpoint)) { generationError.value = "接口地址必须使用 HTTPS。"; return false; }
  if ((kind === "text" || kind === "audio") && references.length) { generationError.value = "当前文字／音频适配器仅支持文字输入，请移除引用素材；输入与素材已保留。"; return false; }
  if (references.some(file => !/^(image|video)\//.test(file.type))) { generationError.value = "参考素材仅支持图片或视频。"; return false; }
  if (kind === "image" && references.some(file => file.type.startsWith("video/"))) { generationError.value = "当前图片模型不支持参考视频，请切换视频生成或移除视频。素材已保留。"; return false; }
  if (kind === "video" && references.some(file => file.type.startsWith("video/")) && !supportsVideoReference(chosen?.modelId)) { generationError.value = "当前模型未声明视频参考能力，请切换模型；素材已保留。"; return false; }
  let firstFrameIndex: number | undefined;
  if (referenceRoles && (referenceRoles.length !== references.length || referenceRoles.some(role => role !== undefined && !["firstFrame", "reference", "middleFrame", "lastFrame"].includes(role)))) { generationError.value = "素材用途与图片不匹配，请重新选择素材"; return false; }
  const selectedFirstFrame = referenceRoles?.indexOf("firstFrame") ?? -1;
  const selectedLastFrame = referenceRoles?.indexOf("lastFrame") ?? -1;
  if (kind !== "video" && (selectedFirstFrame >= 0 || selectedLastFrame >= 0)) { generationError.value = "首帧和尾帧用于视频生成，请选择视频产物或将图片放入参考图。素材已保留。"; return false; }
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
    firstFrameIndex = selectedFirstFrame >= 0 ? selectedFirstFrame : frameIndex("首帧");
    if (selectedLastFrame >= 0 || lastFrameIndex !== undefined || /(?:作为|用作|设为|设置为)\s*尾帧|分别.{0,6}首尾帧/.test(rolePrompt)) { generationError.value = "当前视频模型不支持尾帧，素材已保留。请更换支持尾帧的模型或修改要求。"; return false; }
    if ((referenceRoles?.filter(role => role === "firstFrame").length ?? 0) > 1 || selectedFirstFrame >= 0 && frameIndex("首帧") !== undefined && frameIndex("首帧") !== selectedFirstFrame) { generationError.value = "首帧选择与输入要求冲突，请确认后重试。素材已保留。"; return false; }
    if (firstFrameIndex !== undefined && (!references[firstFrameIndex]?.type.startsWith("image/") || references.length !== 1)) { generationError.value = "当前首帧模式仅接受一张图片，请仅保留指定的首帧图片；其他图片不会被静默忽略。"; return false; }
    if (firstFrameIndex === undefined && /(?:作为|用作|设为|设置为)\s*首帧/.test(rolePrompt)) { generationError.value = "请明确指定首帧图片，例如“图1作为首帧”。"; return false; }
  }
  controller = new AbortController();
  const signal = controller.signal;
  generationBusy.value = true;
  options?.onStart?.();
  try {
    if (kind === "text") {
      const { text } = await generateBrowserText({ providerId: chosen!.id, modelId: chosen!.modelId, prompt, signal });
      signal.throwIfAborted();
      generationResults.value.push({ id: crypto.randomUUID(), kind, text, directory });
      return true;
    }
    const referenceDetails = options?.references?.filter(item => /^(image|video)\//.test(item.mimeType));
    const media = await Promise.all(references.map(async (file, index) => {
      const range = referenceDetails?.[index]?.videoClip;
      let prepared = file;
      if (file.type.startsWith("video/") && range) {
        if (!directory || !Number.isFinite(range.duration) || range.duration <= 0 || !Number.isFinite(range.start) || !Number.isFinite(range.end) || range.start < 0 || range.end <= range.start || range.end > range.duration + 0.05) throw new Error("视频片段范围无效，请重新选择");
        if (range.outputDuration !== Number(duration)) throw new Error("生成时长已变化，请重新确认参考片段");
        if (range.start > 0 || range.end < range.duration - 0.05) { options?.onPreparing?.(); prepared = await clipReferenceVideo(file, range, signal); }
      }
      return { type: "binary" as const, data: new Uint8Array(await prepared.arrayBuffer()), mimeType: prepared.type, name: prepared.name };
    }));
    options?.onPrepared?.();
    const images = media.filter(item => item.mimeType.startsWith("image/")), videos = media.filter(item => item.mimeType.startsWith("video/"));
    const generationFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const response = await studioFetch(input, init);
      if (options?.onTask && init?.method?.toUpperCase() === "POST" && response.ok && response.headers.get("content-type")?.includes("json")) {
        const payload = await response.clone().json();
        const id = payload?.output?.task_id;
        if (typeof id === "string" && id.length <= 512) options.onTask(id);
      }
      return response;
    }) as typeof fetch;
    const tool = { fetch: generationFetch, errorMessage: (value: unknown) => value && typeof value === "object" && "message" in value ? String(value.message) : "接口返回错误" };
    const context = { config: { apiKey, endpoint }, signal, tool };
    const settings: GenerationSettings = { providerId: chosen!.id, modelId: chosen!.modelId, label: chosen!.label, ratio, imageSize, n: count, style, duration: Number(duration) || 5, resolution, generateAudio, mode: firstFrameIndex !== undefined ? "singleImage" : references.length ? "reference" : "text" };
    const assets = kind === "audio" ? await audioModel.generateAudio.call(context, { model: chosen!.modelId, prompt }) : kind === "image" ? await imageModel.generateImage.call(context, { model: chosen!.modelId, prompt, images, ...(ratio ? { ratio } : {}), size: imageSize, n: count })
      : await videoModel.generateVideo.call(context, { generateAudio, model: chosen!.modelId, prompt, ...(firstFrameIndex !== undefined ? { mode: "singleImage", firstFrame: media[firstFrameIndex!] } : { mode: images.length || videos.length ? ["imageReference:10", "videoReference:5"] : "text", images, videos }), ...(ratio ? { ratio } : {}), ...(duration ? { duration: Number(duration) } : {}), ...(resolution ? { resolution } : {}) });
    signal.throwIfAborted();
    if (!assets.length) throw new Error("模型未返回生成素材");
    const batchId = crypto.randomUUID();
    for (const asset of assets) {
      const mimeType = asset.mimeType || `${kind}/${kind === "image" ? "png" : kind === "audio" ? "mpeg" : "mp4"}`;
      const file = asset.type === "base64" && asset.data ? new File([Uint8Array.from(atob(asset.data), char => char.charCodeAt(0))], `生成结果.${mimeType.split("/")[1]}`, { type: mimeType }) : undefined;
      generationResults.value.push({ id: crypto.randomUUID(), batchId, tags: options?.tags, kind, createdAt: Date.now(), prompt, model: chosen!.label, settings, origin, references: options?.references, url: file ? URL.createObjectURL(file) : asset.url, file, directory });
    }
    if (browserWorkspaceMode && directory) await saveBrowserResults(directory, signal);
    return true;
  } catch (error) {
    generationError.value = signal.aborted ? "已停止等待；已提交的远端任务可能仍在运行，请先检查供应商任务记录。" : (error instanceof Error ? error.message : "模型调用失败").replaceAll(apiKey, "[Key]");
    return false;
  } finally { generationBusy.value = false; controller = undefined; }
}

const pendingResultFiles = new WeakMap<BrowserGenerationResult, Promise<File>>();
export async function browserResultFile(item: BrowserGenerationResult): Promise<File> {
  if (item.file) return rememberFileOrigin(item.file, item.origin);
  let pending = pendingResultFiles.get(item);
  if (!pending) {
    pending = readBrowserResultFile(item).finally(() => pendingResultFiles.delete(item));
    pendingResultFiles.set(item, pending);
  }
  return rememberFileOrigin(await pending, item.origin);
}
async function readBrowserResultFile(item: BrowserGenerationResult) {
  if (item.kind === "text") return new File([item.text || ""], "生成文字.md", { type: "text/markdown" });
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
