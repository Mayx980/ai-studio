import { ref } from "vue";
import type { AnyTagProps } from "x-sender";
import useWorkspaceFiles from "@/lib/workspaceFiles";
import { browserConfig, browserModelSelection, configuredBrowserModels } from "@/stores/browserGeneration";
import { imageDimensions } from "@toonflow/node-shared/generationDefaults";

export type TemplateMedia = { path: string; mimeType: string; name: string };
export type CreationTemplate = { id: string; name: string; category: string; prompt: string; media: TemplateMedia; references: TemplateMedia[]; kind: "image" | "video"; modelId?: string; ratio?: string; resolution?: string; imageSize?: string };
export type TemplateApplication = { prompt: string; references: File[]; template?: CreationTemplate };
export const templateDirectory = "browser://personalTemplates";
const personal = ref<CreationTemplate[]>([]);
const media = (path: string, name: string, mimeType = "video/mp4"): TemplateMedia => ({ path: `/templates/${path}`, name, mimeType });
const portrait = media("portraitReference.webp", "人物参考.webp", "image/webp");
const coffee = media("coffeeReference.png", "产品与人物参考.png", "image/png");
const builtin: CreationTemplate[] = [
  { id: "portraitReference", name: "自然光人像", category: "人像摄影", kind: "image", media: portrait, references: [], prompt: "产品名称：你的产品名称\n核心卖点：你希望展示的产品特点\n参考图片的自然窗光和人物构图，制作生活化产品人像图片。保留自然肤质和真实产品比例，产品外观以用户上传素材为准。" },
  { id: "coffeeReference", name: "居家好物分享", category: "达人种草", kind: "image", media: coffee, references: [], prompt: "产品名称：你的好物名称\n核心卖点：日常使用场景与细节\n参考图片的人物手持展示方式，制作真实居家环境中的好物分享图片。人物表情自然、光线柔和，清楚展示产品细节，不虚构品牌与功效。" },
  { id: "productShowcase", name: "产品展示", category: "产品展示", kind: "video", media: media("productShowcase.mp4", "产品展示.mp4"), references: [], prompt: "产品名称：你的产品名称\n核心卖点：材质、质感与使用细节\n制作一条产品展示视频，以示例的镜头节奏和光线风格为参考。依次呈现产品全貌、关键细节与真实使用场景，保留产品外观与比例。中文文案，不编造功效或价格。" },
  { id: "productShowcaseTwo", name: "产品细节展示", category: "产品展示", kind: "video", media: media("productShowcaseTwo.mp4", "产品展示2.mp4"), references: [], prompt: "产品名称：你的产品名称\n核心卖点：设计、材质与实用功能\n制作一条细节展示视频，运用微距、缓慢推近和产品使用特写，突出产品结构与质感。卖点以用户提供的资料为准，所有字幕使用中文。" },
  { id: "creatorRecommendation", name: "达人种草好物", category: "达人种草", kind: "video", media: media("creatorRecommendation.mp4", "达人种草.mp4"), references: [], prompt: "产品名称：你的好物名称\n核心卖点：真实使用细节与适用人群\n制作达人种草风格短视频，以朋友分享的中文口吻，先用一个生活痛点开场，再展示上手操作和产品近景，结尾说明适用人群。镜头自然、保留停顿，不虚构购买经历、销量或优惠。" },
  { id: "shortDramaSales", name: "短剧带货", category: "短剧带货", kind: "video", media: media("shortDramaSales.mp4", "短剧带货.mp4"), references: [], prompt: "产品名称：你的产品名称\n核心卖点：解决的实际问题\n制作一条生活情景短剧：用具体小冲突开场，人物在自然对话中发现产品，用实际操作展示解决问题的过程，再以简短反应收尾。中文对白，人物与产品保持一致，不添加未经证实的功效。" },
  { id: "personReview", name: "人物口播", category: "人物口播", kind: "video", media: media("personReview.mp4", "人物口播.mp4"), references: [portrait], prompt: "产品名称：你的产品名称\n核心卖点：你最希望讲清的两点价值\n参考示例的居家光线和人物表达，生成自然中文口播。人物面对镜头，穿插产品展示与使用动作，口型和台词同步，保留真实肤质与停顿，不擅自虚构亲身体验。" },
  { id: "authenticReview", name: "用户真实测评口播", category: "真实测评", kind: "video", media: media("authenticReview.mp4", "真实测评.mp4"), references: [coffee], prompt: "产品名称：你的产品名称\n核心卖点：你提供的真实体验和产品特点\n制作用户测评风格中文口播，按照使用前的问题、实际操作、具体体验和适用人群组织内容。人物坐在自然光的桌前，产品近景与人物半身交替，避免夸张磨皮和虚假前后对比。真实经历和结论必须由用户提供。" },
];
export const creationTemplates = ref<CreationTemplate[]>([...builtin]);
let loading: Promise<void> | undefined;
function parseTemplates(text: string): CreationTemplate[] {
  const values: unknown = JSON.parse(text);
  if (!Array.isArray(values) || values.some(value => !value || typeof value.id !== "string" || typeof value.name !== "string" || typeof value.prompt !== "string" || typeof value.category !== "string" || !["image", "video"].includes(value.kind) || !value.media || typeof value.media.path !== "string" || typeof value.media.mimeType !== "string" || typeof value.media.name !== "string" || ["modelId", "ratio", "resolution", "imageSize"].some(key => value[key] !== undefined && typeof value[key] !== "string") || !Array.isArray(value.references) || value.references.some((item: TemplateMedia) => !item || typeof item.path !== "string" || typeof item.mimeType !== "string" || typeof item.name !== "string"))) throw new Error("个人模板数据无效，请保留浏览器数据并检查模板文件");
  return values;
}
export function loadCreationTemplates() {
  loading ??= (async () => {
    try { personal.value = parseTemplates(await useWorkspaceFiles(templateDirectory).readText("templates.json")); }
    catch (error) { if ((error as { code?: string }).code !== "ENOENT") throw error; }
    creationTemplates.value = [...personal.value, ...builtin];
  })().catch(error => { loading = undefined; throw error; });
  return loading;
}
export function templatePromptModel(prompt: string): AnyTagProps[][] {
  return prompt.split("\n").map(line => {
    const match = /^(产品名称|核心卖点)[：:]\s*(.*)$/.exec(line);
    return match ? [{ type: "Write", text: `${match[1]}：` }, { type: "Input", key: match[1]!, text: match[2]!, placeholder: `填写${match[1]}` }, { type: "Write", text: "" }] : [{ type: "Write", text: line }];
  });
}
export function applyTemplateParameters(template?: CreationTemplate) {
  if (!template) return;
  browserConfig.outputKind = template.kind; browserConfig.outputChosen = true;
  if (template.ratio && imageDimensions[template.ratio] && (template.kind === "image" || ["1:1", "9:16", "16:9"].includes(template.ratio))) browserConfig.ratio = template.ratio;
  if (template.kind === "video" && !["1:1", "9:16", "16:9"].includes(browserConfig.ratio)) browserConfig.ratio = "9:16";
  if (!imageDimensions[browserConfig.ratio]?.includes(browserConfig.imageSize)) browserConfig.imageSize = imageDimensions[browserConfig.ratio]![0]!;
  if (template.imageSize && imageDimensions[browserConfig.ratio]?.includes(template.imageSize)) browserConfig.imageSize = template.imageSize;
  if (template.resolution && ["480P", "720P", "1080P"].includes(template.resolution.toUpperCase())) browserConfig.resolution = template.resolution.toUpperCase();
  const model = configuredBrowserModels(template.kind).find(item => item.modelId === template.modelId);
  if (model) browserModelSelection[template.kind] = model.id;
}
export function isPublicTemplateMedia(path: string) { return /^\/templates\/[a-zA-Z][a-zA-Z0-9]*\.(mp4|png|jpg|webp)$/.test(path); }
export async function readTemplateFile(item: TemplateMedia) {
  const blob = isPublicTemplateMedia(item.path) ? await fetch(item.path).then(response => { if (!response.ok) throw new Error(`模板素材读取失败（HTTP ${response.status}）`); return response.blob(); }) : new Blob([await useWorkspaceFiles(templateDirectory).read(item.path)], { type: item.mimeType });
  return new File([blob], item.name || "模板素材", { type: item.mimeType });
}
export async function saveCreationTemplate(template: Omit<CreationTemplate, "id" | "media" | "references">, preview: File, references: File[]) {
  await loadCreationTemplates();
  if (!template.name.trim() || !template.prompt.trim()) throw new Error("请填写模板名称和提示词");
  if (references.length > 10) throw new Error("每个模板最多保存 10 张参考图片");
  const id = `template${crypto.randomUUID().replaceAll("-", "")}`, files = useWorkspaceFiles(templateDirectory), created: string[] = [];
  const put = async (file: File, index: number): Promise<TemplateMedia> => {
    const header = new Uint8Array(await file.slice(0, 16).arrayBuffer());
    const mimeType = header[0] === 0x89 && header[1] === 0x50 ? "image/png" : header[0] === 0xff && header[1] === 0xd8 ? "image/jpeg" : String.fromCharCode(...header.slice(0, 4)) === "RIFF" && String.fromCharCode(...header.slice(8, 12)) === "WEBP" ? "image/webp" : String.fromCharCode(...header.slice(4, 8)) === "ftyp" ? "video/mp4" : "";
    if (!mimeType || !file.size || file.size > (mimeType === "video/mp4" ? 100 : 10) * 1024 * 1024 || (index && !mimeType.startsWith("image/"))) throw new Error("预览支持 JPG、PNG、WebP、MP4，参考素材仅支持 JPG、PNG、WebP，图片不超过 10 MB，视频不超过 100 MB");
    const path = `assets/${id}/${index ? `reference${index}` : "preview"}.${mimeType === "video/mp4" ? "mp4" : mimeType === "image/png" ? "png" : mimeType === "image/webp" ? "webp" : "jpg"}`;
    await files.write(path, file, true); created.push(path); return { path, mimeType, name: file.name };
  };
  try {
    await files.mkdir("assets").catch(error => { if (error.code !== "EEXIST") throw error; });
    await files.mkdir(`assets/${id}`);
    const media = await put(preview, 0), images: TemplateMedia[] = [];
    for (const [index, file] of references.entries()) images.push(await put(file, index + 1));
    const value: CreationTemplate = { ...template, kind: media.mimeType.startsWith("video/") ? "video" : "image", id, media, references: images };
    const snapshot = await files.readTextSnapshot("templates.json").catch(error => { if (error.code !== "ENOENT") throw error; return undefined; });
    const next = [value, ...(snapshot ? parseTemplates(snapshot.text) : [])];
    if (snapshot) await files.writeTextSnapshot("templates.json", JSON.stringify(next), snapshot); else await files.writeJson("templates.json", next, true);
    personal.value = next; creationTemplates.value = [...next, ...builtin]; return value;
  } catch (error) {
    await Promise.allSettled(created.map(path => files.remove(path)));
    await files.remove(`assets/${id}`).catch(() => {});
    throw error;
  }
}
