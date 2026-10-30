import { ref } from "vue";
import type { AnyTagProps } from "x-sender";
import useWorkspaceFiles from "@/lib/workspaceFiles";
import { browserConfig, browserModelSelection, configuredBrowserModels } from "@/stores/browserGeneration";
import { imageClaritySizes, imageDimensions } from "@toonflow/node-shared/generationDefaults";

export type TemplateMedia = { path: string; mimeType: string; name: string };
export type CreationTemplate = { id: string; name: string; category: string; prompt: string; media: TemplateMedia; references: TemplateMedia[]; kind: "image" | "video"; modelId?: string; ratio?: string; resolution?: string; imageSize?: string; duration?: number };
export type TemplateApplication = { prompt: string; references: File[]; template?: CreationTemplate };
export const templateDirectory = "browser://personalTemplates";
const personal = ref<CreationTemplate[]>([]);
const media = (path: string, name: string, mimeType = "video/mp4"): TemplateMedia => ({ path: `/templates/${path}`, name, mimeType });
const builtin: CreationTemplate[] = [
  { id: "productShowcase", name: "重庆溜达节 · 落地签模板", category: "产品展示", kind: "video", media: media("productShowcase.mp4", "产品展示.mp4"), references: [], ratio: "9:16", resolution: "720P", duration: 10, prompt: "创意：重庆溜达节-落地签模板\n请上传一张产品底图" },
  { id: "productShowcaseTwo", name: "产品高光展示", category: "产品展示", kind: "video", media: media("productShowcaseTwo.mp4", "产品展示2.mp4"), references: [], ratio: "9:16", resolution: "720P", duration: 15, prompt: "创意：产品高光展示\n请基于上传的产品图与产品信息，制作一支「产品展示」风格短视频。\n产品名称：大容量补水保湿喷雾\n核心卖点：300ml大容量；细腻喷雾水油同补；妆前妆后可用" },
  { id: "creatorRecommendation", name: "达人开箱逛买", category: "达人种草", kind: "video", media: media("creatorRecommendation.mp4", "达人种草.mp4"), references: [], ratio: "9:16", resolution: "720P", duration: 15, prompt: "创意：达人开箱逛买\nBased on the uploaded product image and info, create a video.\nProduct Name: Creator Shopping Haul Product 2\nKey Selling Points: Accurate product appearance, clear everyday utility, simple operation, and a believable purchase reason." },
  { id: "shortDramaSales", name: "甜宠短剧带货", category: "短剧带货", kind: "video", media: media("shortDramaSales.mp4", "短剧带货.mp4"), references: [], ratio: "9:16", resolution: "720P", duration: 15, prompt: "创意：甜宠短剧带货\n请基于上传的产品图与产品信息，制作一支15秒的「霸总甜宠」广告。\n产品名称：雨后木质香氛蜡烛\n核心卖点：木质雨后香；燃烧稳定；睡前放松氛围" },
  { id: "personReview", name: "达人口播种草", category: "达人种草", kind: "video", media: media("personReview.mp4", "人物口播.mp4"), references: [], ratio: "9:16", resolution: "720P", duration: 15, prompt: "创意：达人口播种草\n请基于上传的产品图与产品信息，制作一支「口播种草」风格短视频。\n产品名称：冷萃咖啡浓缩液（无糖低酸）\n核心卖点：冷萃低酸更顺滑；一瓶兑水/兑奶秒变冰美式/拿铁；0糖低卡；随身便携" },
  { id: "authenticReview", name: "对镜真心口播", category: "真实测评", kind: "video", media: media("authenticReview.mp4", "真实测评.mp4"), references: [], ratio: "9:16", resolution: "720P", duration: 15, prompt: "创意：对镜真心口播\n请基于上传的产品图与产品信息，制作一支「对镜口播」风格短视频。\n产品名称：维C亮肤精华\n核心卖点：维C提亮抗氧；淡化暗沉；清爽好吸收" },
];
export const creationTemplates = ref<CreationTemplate[]>(builtin.filter(item => item.kind === "video"));
let loading: Promise<void> | undefined;
function parseTemplates(text: string): CreationTemplate[] {
  const values: unknown = JSON.parse(text);
  if (!Array.isArray(values) || values.some(value => !value || typeof value.id !== "string" || typeof value.name !== "string" || typeof value.prompt !== "string" || typeof value.category !== "string" || !["image", "video"].includes(value.kind) || !value.media || typeof value.media.path !== "string" || typeof value.media.mimeType !== "string" || typeof value.media.name !== "string" || (value.duration !== undefined && (!Number.isInteger(value.duration) || value.duration < 3 || value.duration > 30)) || ["modelId", "ratio", "resolution", "imageSize"].some(key => value[key] !== undefined && typeof value[key] !== "string") || !Array.isArray(value.references) || value.references.some((item: TemplateMedia) => !item || typeof item.path !== "string" || typeof item.mimeType !== "string" || typeof item.name !== "string"))) throw new Error("个人模板数据无效，请保留浏览器数据并检查模板文件");
  return values;
}
export function loadCreationTemplates() {
  loading ??= (async () => {
    try { personal.value = parseTemplates(await useWorkspaceFiles(templateDirectory).readText("templates.json")); }
    catch (error) { if ((error as { code?: string }).code !== "ENOENT") throw error; }
    creationTemplates.value = [...personal.value.filter(item => item.kind === "video"), ...builtin.filter(item => item.kind === "video")];
  })().catch(error => { loading = undefined; throw error; });
  return loading;
}
export function templatePromptModel(prompt: string): AnyTagProps[][] {
  return prompt.split("\n").map(line => {
    const match = /^(产品名称|核心卖点|Product Name|Key Selling Points)[：:]\s*(.*)$/.exec(line);
    return match ? [{ type: "Write", text: `${match[1]}：` }, { type: "Input", key: match[1]!, text: match[2]!, placeholder: `填写${match[1]}` }, { type: "Write", text: "" }] : [{ type: "Write", text: line }];
  });
}
export function applyTemplateParameters(template?: CreationTemplate) {
  if (!template) return;
  browserConfig.outputKind = template.kind; browserConfig.outputChosen = true;
  if (template.ratio && imageDimensions[template.ratio]) browserConfig.ratio = template.ratio;
  browserConfig.imageSize = imageClaritySizes[browserConfig.imageResolution]?.[browserConfig.ratio] ?? browserConfig.imageSize;
  if (template.imageSize) {
    const resolution = Object.keys(imageClaritySizes).find(key => imageClaritySizes[key]?.[browserConfig.ratio] === template.imageSize);
    if (resolution) { browserConfig.imageResolution = resolution; browserConfig.imageSize = template.imageSize; }
  }
  if (template.resolution && ["480P", "720P", "1080P"].includes(template.resolution.toUpperCase())) browserConfig.resolution = template.resolution.toUpperCase();
  if (template.duration !== undefined && Number.isInteger(template.duration) && template.duration >= 3 && template.duration <= 30) browserConfig.duration = String(template.duration);
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
  if (template.kind !== "video") throw new Error("模板中心仅支持视频模板");
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
    if (media.mimeType !== "video/mp4") throw new Error("请上传 MP4 视频模板");
    for (const [index, file] of references.entries()) images.push(await put(file, index + 1));
    const value: CreationTemplate = { ...template, kind: media.mimeType.startsWith("video/") ? "video" : "image", id, media, references: images };
    const snapshot = await files.readTextSnapshot("templates.json").catch(error => { if (error.code !== "ENOENT") throw error; return undefined; });
    const next = [value, ...(snapshot ? parseTemplates(snapshot.text) : [])];
    if (snapshot) await files.writeTextSnapshot("templates.json", JSON.stringify(next), snapshot); else await files.writeJson("templates.json", next, true);
    personal.value = next; creationTemplates.value = [...next.filter(item => item.kind === "video"), ...builtin.filter(item => item.kind === "video")]; return value;
  } catch (error) {
    await Promise.allSettled(created.map(path => files.remove(path)));
    await files.remove(`assets/${id}`).catch(() => {});
    throw error;
  }
}
