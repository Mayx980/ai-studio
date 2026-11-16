import { getWorkspaceFailure } from "@toonflow/nodes-scaffold/workspaceFiles";
import { computed, ref } from "vue";
import { prototype } from "@/ports/prototype";
import { browserWorkspaceMode } from "./browserWorkspaceFiles";
import { currentAccount } from "@/stores/prototypeAccount";
import type { AnyTagProps } from "x-sender";
import useWorkspaceFiles from "@/lib/workspaceFiles";
import { browserConfig, browserModelSelection, configuredBrowserModels } from "@/stores/browserGeneration";
import { imageClaritySizes, imageDimensions } from "@toonflow/node-shared/generationDefaults";

export type TemplateMedia = { directory?: string; path: string; mimeType: string; name: string };
export type TemplateProject = { files: { path: string; sha256: string }[]; canvases: string[] };
export type TemplateReview = { authorId: string; status: "pending" | "approved" | "rejected"; reason?: string; reviewedAt?: string };
export type CreationTemplate = { sourceDirectory?: string; id: string; name: string; category: string; prompt: string; media: TemplateMedia; references: TemplateMedia[]; kind: "image" | "video"; modelId?: string; ratio?: string; resolution?: string; imageSize?: string; duration?: number; project?: TemplateProject; review?: TemplateReview };
export type TemplateApplication = { prompt: string; references: File[]; template?: CreationTemplate };
export const templateDirectory = browserWorkspaceMode ? "browser://personalTemplates" : "studio://templates";
export const canManageTemplates = computed(() => !browserWorkspaceMode || !prototype.requiresAccount || currentAccount.value?.role === "admin");
const personal = ref<CreationTemplate[]>([]);
const removedTemplateIds = ref<string[]>([]);
export function templateIsRemoved(item: CreationTemplate) { return removedTemplateIds.value.includes(item.id) || item.id === "creatorRecommendationProject" || (item.name === "达人种草" && item.kind === "image" && (item.media.name === "项目编排.png" || item.media.path.endsWith("/preview.png"))); }
export const submittedTemplates = computed(() => personal.value.filter(item => !templateIsRemoved(item)).filter(item => canManageTemplates.value || item.review?.authorId === currentAccount.value?.id));
const media = (path: string, name: string, mimeType = "video/mp4"): TemplateMedia => ({ path: `/templates/${path}`, name, mimeType });
const builtin: CreationTemplate[] = [
  { id: "productShowcase", name: "重庆溜达节 · 落地签模板", category: "产品展示", kind: "video", media: media("productShowcase.mp4", "产品展示.mp4"), references: [], ratio: "9:16", resolution: "720P", duration: 10, prompt: "创意：重庆溜达节-落地签模板\n请上传一张产品底图" },
  { id: "productShowcaseTwo", name: "产品高光展示", category: "产品展示", kind: "video", media: media("productShowcaseTwo.mp4", "产品展示2.mp4"), references: [], ratio: "9:16", resolution: "720P", duration: 15, prompt: "创意：产品高光展示\n请基于上传的产品图与产品信息，制作一支「产品展示」风格短视频。\n产品名称：大容量补水保湿喷雾\n核心卖点：300ml大容量；细腻喷雾水油同补；妆前妆后可用" },
  { id: "creatorRecommendation", name: "达人开箱逛买", category: "达人种草", kind: "video", media: media("creatorRecommendation.mp4", "达人种草.mp4"), references: [], ratio: "9:16", resolution: "720P", duration: 15, prompt: "创意：达人开箱逛买\nBased on the uploaded product image and info, create a video.\nProduct Name: Creator Shopping Haul Product 2\nKey Selling Points: Accurate product appearance, clear everyday utility, simple operation, and a believable purchase reason." },
  { id: "shortDramaSales", name: "甜宠短剧带货", category: "短剧带货", kind: "video", media: media("shortDramaSales.mp4", "短剧带货.mp4"), references: [], ratio: "9:16", resolution: "720P", duration: 15, prompt: "创意：甜宠短剧带货\n请基于上传的产品图与产品信息，制作一支15秒的「霸总甜宠」广告。\n产品名称：雨后木质香氛蜡烛\n核心卖点：木质雨后香；燃烧稳定；睡前放松氛围" },
  { id: "personReview", name: "达人口播种草", category: "达人种草", kind: "video", media: media("personReview.mp4", "人物口播.mp4"), references: [], ratio: "9:16", resolution: "720P", duration: 15, prompt: "创意：达人口播种草\n请基于上传的产品图与产品信息，制作一支「口播种草」风格短视频。\n产品名称：冷萃咖啡浓缩液（无糖低酸）\n核心卖点：冷萃低酸更顺滑；一瓶兑水/兑奶秒变冰美式/拿铁；0糖低卡；随身便携" },
  { id: "authenticReview", name: "对镜真心口播", category: "真实测评", kind: "video", media: media("authenticReview.mp4", "真实测评.mp4"), references: [], ratio: "9:16", resolution: "720P", duration: 15, prompt: "创意：对镜真心口播\n请基于上传的产品图与产品信息，制作一支「对镜口播」风格短视频。\n产品名称：维C亮肤精华\n核心卖点：维C提亮抗氧；淡化暗沉；清爽好吸收" },
];
export const creationTemplates = computed(() => [...personal.value.filter(item => (item.kind === "video" || item.project) && item.review?.status === "approved"), ...builtin.filter(item => item.kind === "video")].filter(item => !templateIsRemoved(item)));
let loading: Promise<void> | undefined;
function parseTemplates(text: string): CreationTemplate[] {
  const values: unknown = JSON.parse(text);
  if (!Array.isArray(values) || values.some(value => !value || typeof value.id !== "string" || typeof value.name !== "string" || typeof value.prompt !== "string" || typeof value.category !== "string" || !["image", "video"].includes(value.kind) || !value.media || typeof value.media.path !== "string" || typeof value.media.mimeType !== "string" || typeof value.media.name !== "string" || (value.duration !== undefined && (!Number.isInteger(value.duration) || value.duration < 3 || value.duration > 30)) || ["modelId", "ratio", "resolution", "imageSize"].some(key => value[key] !== undefined && typeof value[key] !== "string") || !Array.isArray(value.references) || value.references.some((item: TemplateMedia) => !item || typeof item.path !== "string" || typeof item.mimeType !== "string" || typeof item.name !== "string"))) throw new Error("模板数据无效，请保留当前内容并检查服务端模板文件");
  for (const value of values) {
    if (!value.review) value.review = { authorId: "user", status: "pending" };
    if (typeof value.review.authorId !== "string" || !value.review.authorId || !["pending", "approved", "rejected"].includes(value.review.status) || (value.review.reason !== undefined && typeof value.review.reason !== "string")) throw new Error("模板审核信息无效");
  }
  return values;
}
export function loadCreationTemplates() {
  loading ??= (async () => {
    try {
      const removed: unknown = await useWorkspaceFiles(templateDirectory).readJson("removedTemplates.json");
      if (!Array.isArray(removed) || removed.some(id => typeof id !== "string")) throw new Error("模板删除记录无效");
      removedTemplateIds.value = removed;
    } catch (error) { if (getWorkspaceFailure(error).code !== "ENOENT") throw error; }
    try { personal.value = parseTemplates(await useWorkspaceFiles(templateDirectory).readText("templates.json")); }
    catch (error) { if (getWorkspaceFailure(error).code !== "ENOENT") throw error; }
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
export async function saveCreationTemplate(template: Omit<CreationTemplate, "id" | "media" | "references" | "project" | "review">, preview: File, references: File[], projectSnapshot?: { files: Map<string, ArrayBuffer>; project: TemplateProject }) {
  const account = currentAccount.value;
  if (prototype.requiresAccount && !account) throw new Error("请先登录再提交模板");
  await loadCreationTemplates();
  if (template.kind !== "video" && !projectSnapshot) throw new Error("模板中心仅支持视频模板");
  if (!template.name.trim() || !template.prompt.trim()) throw new Error("请填写模板名称和提示词");
  if (references.length > 10) throw new Error("每个模板最多保存 10 张参考图片");
  const id = `template${crypto.randomUUID().replaceAll("-", "")}`, files = useWorkspaceFiles(templateDirectory);
  let createdRoot = false;
  const put = async (file: File, index: number): Promise<TemplateMedia> => {
    const header = new Uint8Array(await file.slice(0, 16).arrayBuffer());
    const mimeType = header[0] === 0x89 && header[1] === 0x50 ? "image/png" : header[0] === 0xff && header[1] === 0xd8 ? "image/jpeg" : String.fromCharCode(...header.slice(0, 4)) === "RIFF" && String.fromCharCode(...header.slice(8, 12)) === "WEBP" ? "image/webp" : String.fromCharCode(...header.slice(4, 8)) === "ftyp" ? "video/mp4" : "";
    if (!mimeType || !file.size || file.size > (mimeType === "video/mp4" ? 100 : 10) * 1024 * 1024 || (index && !mimeType.startsWith("image/"))) throw new Error("预览支持 JPG、PNG、WebP、MP4，参考素材仅支持 JPG、PNG、WebP，图片不超过 10 MB，视频不超过 100 MB");
    const path = `assets/${id}/${index ? `reference${index}` : "preview"}.${mimeType === "video/mp4" ? "mp4" : mimeType === "image/png" ? "png" : mimeType === "image/webp" ? "webp" : "jpg"}`;
    await files.write(path, file, true); return { path, mimeType, name: file.name };
  };
  try {
    await files.mkdir("assets").catch(error => { if (getWorkspaceFailure(error).code !== "EEXIST") throw error; });
    await files.mkdir(`assets/${id}`); createdRoot = true;
    const media = await put(preview, 0), images: TemplateMedia[] = [];
    if (media.mimeType !== "video/mp4" && !projectSnapshot) throw new Error("请上传 MP4 视频模板");
    for (const [index, file] of references.entries()) images.push(await put(file, index + 1));
    if (projectSnapshot) {
      const directories = new Set<string>();
      for (const [path, bytes] of projectSnapshot.files) {
        const destination = `assets/${id}/project/${path}`;
        const parts = destination.split("/"); parts.pop();
        for (let i = 3; i <= parts.length; i++) {
          const parent = parts.slice(0, i).join("/");
          if (!directories.has(parent)) { await files.mkdir(parent); directories.add(parent); }
        }
        await files.write(destination, bytes, true);
      }
    }
    if (prototype.requiresAccount && currentAccount.value !== account) throw new Error("账号已切换，请重新提交");
    const value: CreationTemplate = { ...template, kind: media.mimeType.startsWith("video/") ? "video" : "image", id, media, references: images, review: { authorId: account?.id ?? "shared", status: browserWorkspaceMode && prototype.requiresAccount ? "pending" : "approved" }, ...(projectSnapshot ? { project: projectSnapshot.project } : {}) };
    const snapshot = await files.readTextSnapshot("templates.json").catch(error => { if (getWorkspaceFailure(error).code !== "ENOENT") throw error; return undefined; });
    const next = [value, ...(snapshot ? parseTemplates(snapshot.text) : [])];
    if (snapshot) await files.writeTextSnapshot("templates.json", JSON.stringify(next), snapshot); else await files.writeJson("templates.json", next, true);
    personal.value = next; return value;
  } catch (error) {
    if (!createdRoot) throw error;
    const cleanup = await files.remove(`assets/${id}`, true).then(() => true, error => getWorkspaceFailure(error).code === "ENOENT");
    if (!cleanup) throw new Error(`模板保存失败，部分临时文件未能清理：${error instanceof Error ? error.message : "存储错误"}`);
    throw error;
  }
}
export async function reviewCreationTemplate(id: string, status: "approved" | "rejected", reason = "") {
  if (!canManageTemplates.value) throw new Error("仅管理员可以审核模板");
  if (!["approved", "rejected"].includes(status)) throw new Error("无效审核结果");
  if (status === "rejected" && (!reason.trim() || reason.trim().length > 300)) throw new Error("请填写1–300个字符的拒绝原因");
  const files = useWorkspaceFiles(templateDirectory);
  const snapshot = await files.readTextSnapshot("templates.json");
  const next = parseTemplates(snapshot.text);
  const item = next.find(item => item.id === id);
  if (!item || item.review?.status !== "pending") throw new Error("模板状态已变化，请刷新后重试");
  if (!canManageTemplates.value) throw new Error("账号已切换");
  item.review = { authorId: item.review.authorId, status, reason: status === "rejected" ? reason.trim() : undefined, reviewedAt: new Date().toISOString() };
  await files.writeTextSnapshot("templates.json", JSON.stringify(next), snapshot);
  personal.value = next;
}

export async function removeCreationTemplate(id: string) {
  if (!canManageTemplates.value) throw new Error("仅管理员可以删除展示卡片");
  if (!id.trim() || id.length > 200) throw new Error("模板标识无效");
  const files = useWorkspaceFiles(templateDirectory);
  const snapshot = await files.readTextSnapshot("removedTemplates.json").catch(error => { if (getWorkspaceFailure(error).code !== "ENOENT") throw error; return undefined; });
  const removed: unknown = snapshot ? JSON.parse(snapshot.text) : [];
  if (!Array.isArray(removed) || removed.some(value => typeof value !== "string")) throw new Error("模板删除记录无效");
  if (!canManageTemplates.value) throw new Error("账号已切换");
  const next = [...new Set([...removed, id])];
  if (snapshot) await files.writeTextSnapshot("removedTemplates.json", JSON.stringify(next), snapshot);
  else await files.writeJson("removedTemplates.json", next, true);
  removedTemplateIds.value = next;
}
