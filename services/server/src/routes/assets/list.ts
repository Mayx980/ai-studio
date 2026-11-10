import { readdir } from "@toonflow/file";
import { relative, sep } from "node:path";
import { Router } from "express";
import { z } from "zod";
import type { AssetLibrary } from "@/utils/assets";
import u from "@/utils";
import { validateFields } from "@/lib/middleware";
import { success } from "@/lib/responseFormat";

type AssetEntry = { name: string; path: string; type: "file" | "directory"; children?: AssetEntry[] };
const router = Router();

export default router.get("/", validateFields({ library: u.assets.librarySchema.optional(), path: z.string().max(4096).optional(), recursive: z.enum(["true", "false"]).optional() }, "query"), async (req, res) => {
  const directory = await u.assets.getAssetsDirectory(req.query.library as AssetLibrary | undefined);
  const root = await u.workspaceFile.resolveWorkspacePath(directory, req.query.path as string || ".");
  let count = 0;
  async function listEntries(path: string, depth = 0): Promise<AssetEntry[]> {
    // ACT: 原型资产树最多返回一万项；大规模库应增加业务分页，不截断并冒充完整结果。
    if (depth > 64) throw Object.assign(new Error("素材文件夹层级过深"), { status: 413 });
    const entries = await readdir(path, { withFileTypes: true });
    const items: AssetEntry[] = [];
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name, "zh-CN", { numeric: true }))) {
      if (!entry.isDirectory() && !entry.isFile()) continue;
      if (++count > 10000) throw Object.assign(new Error("素材库超过一万项，请使用素材搜索或进入具体文件夹"), { status: 413 });
      const relativePath = [relative(directory, path).split(sep).join("/"), entry.name].filter(Boolean).join("/");
      const resolved = await u.workspaceFile.resolveWorkspacePath(directory, relativePath);
      items.push({ name: entry.name, path: relativePath, type: entry.isDirectory() ? "directory" : "file",
        ...(entry.isDirectory() && req.query.recursive !== "false" ? { children: await listEntries(resolved.path, depth + 1) } : {}) });
    }
    return items;
  }
  res.set("Cache-Control", "no-store").json(success({ directory, entries: await listEntries(root.path) }));
});
