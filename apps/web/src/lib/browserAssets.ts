import useWorkspaceFiles from "./workspaceFiles";
export const browserAssetsDirectory = "browser://personalAssets";
export function browserAssetFiles() { return useWorkspaceFiles(browserAssetsDirectory); }
export type BrowserAssetEntry = { name: string; path: string; type: "file" | "directory"; children?: BrowserAssetEntry[] };
export async function listBrowserAssets(path = ""): Promise<BrowserAssetEntry[]> {
  const { entries } = await browserAssetFiles().list(path);
  return Promise.all(entries.map(async entry => ({ ...entry, ...(entry.type === "directory" ? { children: await listBrowserAssets(entry.path) } : {}) })));
}

export function browserAssetMimeType(path: string) {
  const types: Record<string, string> = {
    png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif", avif: "image/avif", svg: "image/svg+xml", bmp: "image/bmp",
    mp4: "video/mp4", webm: "video/webm", mov: "video/quicktime", m4v: "video/mp4",
    mp3: "audio/mpeg", wav: "audio/wav", ogg: "audio/ogg", opus: "audio/ogg", flac: "audio/flac", m4a: "audio/mp4", aac: "audio/aac",
  };
  return types[path.split(".").at(-1)?.toLowerCase() ?? ""] ?? "application/octet-stream";
}
