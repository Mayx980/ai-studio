import { getWorkspaceFailure } from "@toonflow/nodes-scaffold/workspaceFiles";
import { studio } from "@/ports";
import { browserWorkspaceMode } from "./browserWorkspaceFiles";
import useWorkspaceFiles from "./workspaceFiles";
import { useAssetStore } from "@/stores/assets";
export const browserAssetsDirectory = browserWorkspaceMode ? "browser://personalAssets" : "studio://assets";
export function requiresAssetFolder(path: string, mimeType = browserAssetMimeType(path)) { return /^(image|video)\//.test(mimeType); }
function validateAssetLocation(path: string, mimeType?: string) {
  const normalized = path.replaceAll("\\", "/").split("/").filter(part => part && part !== ".").join("/");
  if (!normalized.includes("/") && (requiresAssetFolder(path) || mimeType && requiresAssetFolder(path, mimeType))) throw new Error("图片和视频必须保存到个人资产库的文件夹中");
}
export function browserAssetFiles() {
  const files = useWorkspaceFiles(browserAssetsDirectory);
  async function validateTransfer(path: string, target: string) {
    const entries = (await files.list(path.slice(0, Math.max(0, path.lastIndexOf("/"))))).entries;
    if (entries.find(entry => entry.path === path)?.type !== "directory") validateAssetLocation(target, browserAssetMimeType(path));
  }
  return { ...files,
    async write(path: string, content: string | Blob | ArrayBuffer, exclusive = false) {
      validateAssetLocation(path, content instanceof Blob ? content.type : undefined);
      return files.write(path, content, exclusive);
    },
    async writeJson(path: string, data: unknown, exclusive = false) { validateAssetLocation(path); return files.writeJson(path, data, exclusive); },
    async rename(path: string, target: string) { await validateTransfer(path, target); return files.rename(path, target); },
    async copy(path: string, target: string) { await validateTransfer(path, target); return files.copy(path, target); },
  };
}
let migration: Promise<void> | undefined;
export function ensureAssetFolders() {
  if (migration) return migration;
  migration = (async () => {
    const files = useWorkspaceFiles(browserAssetsDirectory), assets = useAssetStore();
    const { entries } = await files.list();
    const looseMedia = entries.filter(entry => entry.type === "file" && requiresAssetFolder(entry.name));
    if (!looseMedia.length && entries.some(entry => entry.type === "directory")) return;
    await files.mkdir("未分类").catch(error => { if (getWorkspaceFailure(error).code !== "EEXIST") throw error; });
    for (const entry of looseMedia) {
      let target = `未分类/${entry.name}`;
      try { await files.rename(entry.path, target); }
      catch (error) { if (getWorkspaceFailure(error).code !== "EEXIST") throw error; target = `未分类/${crypto.randomUUID()}-${entry.name}`; await files.rename(entry.path, target); }
      if (assets.tags[entry.path]) { assets.tags[target] = assets.tags[entry.path]; delete assets.tags[entry.path]; }
      if (assets.metadata[entry.path]) { assets.metadata[target] = assets.metadata[entry.path]; delete assets.metadata[entry.path]; }
    }
  })().finally(() => { migration = undefined; });
  return migration;
}
export type BrowserAssetEntry = { name: string; path: string; type: "file" | "directory"; children?: BrowserAssetEntry[] };
export async function listBrowserAssets(path = ""): Promise<BrowserAssetEntry[]> {
  await ensureAssetFolders();
  if (!browserWorkspaceMode) return (await studio.listAssets<{ data: { entries: BrowserAssetEntry[] } }>({ params: { path, recursive: true } })).data.data.entries;
  async function collect(folder: string): Promise<BrowserAssetEntry[]> {
    const { entries } = await browserAssetFiles().list(folder);
    return Promise.all(entries.map(async entry => ({ ...entry, ...(entry.type === "directory" ? { children: await collect(entry.path) } : {}) })));
  }
  return collect(path);
}

export function browserAssetMimeType(path: string) {
  const types: Record<string, string> = {
    png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif", avif: "image/avif", svg: "image/svg+xml", bmp: "image/bmp",
    mp4: "video/mp4", webm: "video/webm", mov: "video/quicktime", m4v: "video/mp4",
    mp3: "audio/mpeg", wav: "audio/wav", ogg: "audio/ogg", opus: "audio/ogg", flac: "audio/flac", m4a: "audio/mp4", aac: "audio/aac",
  };
  return types[path.split(".").at(-1)?.toLowerCase() ?? ""] ?? "application/octet-stream";
}
