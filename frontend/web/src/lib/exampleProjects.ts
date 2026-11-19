import { useWorkspaceStore } from "@/stores/workspace";
import { useAssetStore } from "@/stores/assets";
import { currentAccount } from "@/stores/prototypeAccount";
import { browserWorkspaceMode } from "@/lib/browserWorkspaceFiles";
import useWorkspaceFiles from "@/lib/workspaceFiles";
import { browserAssetFiles } from "@/lib/browserAssets";
import { curatedCreatorFiles } from "@/lib/curatedProject";
import { recordGenerationResults, type GenerationRecord } from "@/lib/generationHistory";
import { saveProjectCover } from "@/lib/projectCover";

const preparing = new Map<string, Promise<void>>();
// ACT: 仅保存已有媒体的业务演示，不调用模型；完成标记防止刷新后恢复用户删除的示例。
export function ensureExampleProject() {
  const account = currentAccount.value;
  if (!browserWorkspaceMode || !account) return Promise.resolve();
  const marker = `afxen.exampleProject.${account.id}`;
  if (localStorage.getItem(marker) === "saved") return Promise.resolve();
  const existing = preparing.get(marker);
  if (existing) return existing;
  const pending = (async () => {
    const directory = `browser://exampleCreator${account.id}`, files = useWorkspaceFiles(directory);
    const assets = browserAssetFiles(), assetStore = useAssetStore(), workspace = useWorkspaceStore();
    const folder = `示例素材（${account.name}）`;
    async function mkdir(target: ReturnType<typeof useWorkspaceFiles>, path: string) { await target.mkdir(path).catch(cause => { if (cause.code !== "EEXIST") throw cause; }); }
    async function put(target: ReturnType<typeof useWorkspaceFiles>, path: string, content: Blob | string) { await target.write(path, content, true).catch(cause => { if (cause.code !== "EEXIST") throw cause; }); }
    await mkdir(files, "assets"); await mkdir(files, "assets/creativeRequest"); await mkdir(files, ".agent"); await mkdir(files, ".agent/browserSessions"); await mkdir(assets, folder);
    for (const [path, url] of Object.entries(curatedCreatorFiles)) {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`示例素材读取失败（HTTP ${response.status}）`);
      await put(files, path, await response.blob());
    }
    const records: GenerationRecord[] = [
      { id: "exampleCreatorImage", kind: "image", path: "assets/reference.png", name: "示例·视频参考画面.png", mimeType: "image/png" },
      { id: "exampleCreatorVideo", kind: "video", path: "assets/creatorRecommendation.mp4", name: "示例·达人开箱逛买.mp4", mimeType: "video/mp4" },
    ];
    for (const item of records) Object.assign(item, { prompt: "示例素材（mock）：复用已有达人开箱视频与参考图片，用于预览创作流程，并非本次模型生成。", model: "示例素材 · 非本次生成" });
    await recordGenerationResults(directory, records);
    await saveProjectCover(directory, records[1]!.path, "video/mp4");
    const file = "exampleCreator.json";
    await put(files, `.agent/browserSessions/${file}`, JSON.stringify({ file, name: "示例·达人开箱逛买", creationMode: "simple", messages: [
      { id: "exampleRequest", role: "user", content: "示例：了解达人开箱视频的创作流程。" },
      { id: "exampleResponse", role: "assistant", content: "以下为已有素材的 mock 展示，用于预览图片、视频及项目编排；并非本次调用模型生成。", browserResultIds: records.map(item => item.id) },
    ] }));
    for (const record of records) {
      const path = `${folder}/${record.name}`;
      await put(assets, path, new Blob([await files.read(record.path)], { type: record.mimeType }));
      assetStore.metadata[path] ??= { source: "示例素材（mock）", prompt: record.prompt, model: record.model };
    }
    if (currentAccount.value !== account) throw new Error("账号已切换，请返回首页载入示例");
    if (!workspace.projectList.some(item => item.directory === directory)) workspace.projectList.push({ directory, name: "示例·达人开箱逛买", lastOpenedAt: Date.now(), creationMode: "professional", historyArchived: true, example: true });
    localStorage.setItem(marker, "saved");
  })().finally(() => preparing.delete(marker));
  preparing.set(marker, pending);
  return pending;
}
