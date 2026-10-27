import { computed, reactive, ref } from "vue";
import imageModel from "@/lib/browserModels/imageModel";
import videoModel from "@/lib/browserModels/videoModel";
import audioModel from "@/lib/browserModels/audioModel";
import textModel from "@/lib/browserModels/textModel";

export type ModelKind = "image" | "video" | "audio" | "text";
export type GuideImage = { role: "character" | "first" | "last"; file: File };
export const browserModels = { image: imageModel, video: videoModel, audio: audioModel, text: textModel };
// ACT: 原型直接使用供应商协议；Key 不进入持久化 Store 或服务端配置。
export const browserConfig = reactive({ enabled: false, kind: "image" as ModelKind, keys: { image: "", video: "", audio: "", text: "" }, endpoint: "https://llm-d7hnbcsabhzqr44p.cn-beijing.maas.aliyuncs.com", ratio: "", duration: "", resolution: "" });
export const browserGuides = ref<(GuideImage & { url: string; name: string })[]>([]);
export const generationBusy = ref(false);
export const generationError = ref("");
export const generationResults = ref<{ id: string; kind: ModelKind; url?: string; text?: string; file?: File; directory?: string }[]>([]);
export const selectedBrowserModel = computed(() => browserModels[browserConfig.kind].models[0]!);
let controller: AbortController | undefined;
export function stopBrowserGeneration() { controller?.abort(); }
export function clearBrowserKeys() { stopBrowserGeneration(); for (const key of Object.keys(browserConfig.keys) as ModelKind[]) browserConfig.keys[key] = ""; }

export async function generateInBrowser(prompt: string, guides: GuideImage[], references: File[], directory?: string) {
  if (generationBusy.value) return false;
  const { kind, endpoint, ratio, duration, resolution } = browserConfig;
  const apiKey = browserConfig.keys[kind].trim();
  generationError.value = "";
  if (!apiKey || !prompt.trim()) { generationError.value = "请填写提示词，并在外观 → API 配置中输入当前模型的 Key。"; return false; }
  if (!/^https:\/\//i.test(endpoint)) { generationError.value = "接口地址必须使用 HTTPS。"; return false; }
  if (guides.some(item => item.role === "last")) { generationError.value = "当前四个适配器均未提供尾帧映射，请移除尾帧；不会将其当作普通参考图提交。"; return false; }
  if (kind !== "video" && guides.some(item => item.role === "first")) { generationError.value = "首帧仅适用于视频模型。"; return false; }
  if (["audio", "text"].includes(kind) && (guides.length || references.length)) { generationError.value = "当前文本和音频联调仅支持文字，请移除参考素材。"; return false; }
  if (references.some(file => !file.type.startsWith("image/"))) { generationError.value = "当前创作入口的参考素材仅支持图片。"; return false; }
  if (kind === "video" && guides.some(item => item.role === "first") && (references.length || guides.some(item => item.role === "character"))) { generationError.value = "首帧模式不能与人物或其他参考图片混用。"; return false; }
  controller = new AbortController();
  const signal = controller.signal;
  generationBusy.value = true;
  try {
    const images = await Promise.all([...guides.map(item => item.file), ...references].map(async file => ({ type: "binary" as const, data: new Uint8Array(await file.arrayBuffer()), mimeType: file.type, name: file.name })));
    const tool = { fetch: ((input: RequestInfo | URL, init?: RequestInit) => fetch(input, { ...init, credentials: "omit", referrerPolicy: "no-referrer" })) as typeof fetch, errorMessage: (value: unknown) => value && typeof value === "object" && "message" in value ? String(value.message) : "接口返回错误" };
    const context = { config: { apiKey, endpoint }, signal, tool };
    if (kind === "text") {
      const response = await tool.fetch(`${endpoint.replace(/\/+$/, "")}/compatible-mode/v1/chat/completions`, { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ model: textModel.models[0]!.id, messages: [{ role: "user", content: prompt }], stream: false, enable_thinking: true }), signal: AbortSignal.any([signal, AbortSignal.timeout(180000)]) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message || `文本接口返回 HTTP ${response.status}`);
      const text = body.choices?.[0]?.message?.content;
      if (typeof text !== "string" || !text.trim()) throw new Error("文本接口未返回有效内容");
      signal.throwIfAborted();
      generationResults.value.push({ id: crypto.randomUUID(), kind, text, directory });
    } else {
      const assets = kind === "image" ? await imageModel.generateImage.call(context, { model: imageModel.models[0]!.id, prompt, images, ...(ratio ? { ratio } : {}), ...(resolution ? { size: resolution } : {}) })
        : kind === "audio" ? await audioModel.generateAudio.call(context, { model: audioModel.models[0]!.id, prompt })
        : await videoModel.generateVideo.call(context, { model: videoModel.models[0]!.id, prompt, ...(guides.some(item => item.role === "first") ? { mode: "singleImage", firstFrame: images[0] } : { mode: images.length ? ["imageReference:10"] : "text", images }), ...(ratio ? { ratio } : {}), ...(duration ? { duration: Number(duration) } : {}), ...(resolution ? { resolution } : {}) });
      signal.throwIfAborted();
      for (const asset of assets) {
        const mimeType = asset.mimeType || `${kind}/${kind === "image" ? "png" : kind === "audio" ? "mpeg" : "mp4"}`;
        const file = asset.type === "base64" && asset.data ? new File([Uint8Array.from(atob(asset.data), char => char.charCodeAt(0))], `生成结果.${mimeType.split("/")[1]}`, { type: mimeType }) : undefined;
        generationResults.value.push({ id: crypto.randomUUID(), kind, url: file ? URL.createObjectURL(file) : asset.url, file, directory });
      }
    }
    return true;
  } catch (error) {
    generationError.value = signal.aborted ? "已停止等待；已提交的远端任务可能仍在运行，请先检查供应商任务记录。" : error instanceof TypeError ? "浏览器无法访问供应商接口，请检查网络及供应商 CORS 跨域许可。输入和参考已保留。" : (error instanceof Error ? error.message : "模型调用失败").replaceAll(apiKey, "[Key]");
    return false;
  } finally { generationBusy.value = false; controller = undefined; }
}
