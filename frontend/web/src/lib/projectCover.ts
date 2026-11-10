import { getWorkspaceFailure } from "@toonflow/nodes-scaffold/workspaceFiles";
import useWorkspaceFiles from "@/lib/workspaceFiles";
export async function saveProjectCover(directory: string, path: string, mimeType: string) {
  if (!mimeType.startsWith("image/") && !mimeType.startsWith("video/")) return;
  const files = useWorkspaceFiles(directory);
  await files.mkdir(".agent").catch(error => { if (getWorkspaceFailure(error).code !== "EEXIST") throw error; });
  const results = await files.readJson<{ kind: string; path: string; mimeType?: string }[]>(".agent/browserResults.json").catch(error => { if (getWorkspaceFailure(error).code !== "ENOENT") throw error; return []; });
  const first = Array.isArray(results) ? results.find(item => ["image", "video"].includes(item.kind) && typeof item.path === "string") : undefined;
  const cover = first ? { path: first.path, mimeType: first.mimeType || (first.kind === "image" ? "image/png" : "video/mp4") } : { path, mimeType };
  await files.writeJson(".agent/projectCover.json", cover, true).catch(error => { if (getWorkspaceFailure(error).code !== "EEXIST") throw error; });
}
