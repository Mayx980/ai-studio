import type { AssetLibrary } from "@/utils/assets";
import { decodeText } from "@/lib/textEncoding";
import { success } from "@/lib/responseFormat";
import { lstat } from "@toonflow/file";
import { sendFile } from "@/utils/fileHttp";
import { basename } from "node:path";
import { Router } from "express";
import { z } from "zod";
import u from "@/utils";
import { validateFields } from "@/lib/middleware";

const router = Router();

export default router.get("/", validateFields({ path: z.string().min(1).max(4096), download: z.literal("true").optional(), library: u.assets.librarySchema.optional(), snapshot: z.literal("true").optional(), maxBytes: z.coerce.number().int().positive().max(20 * 1024 * 1024).optional() }, "query"), async (req, res, next) => {
  const library = req.query.library as AssetLibrary | undefined;
  const root = await u.assets.getAssetsDirectory(library);
  const { directory, path } = await u.workspaceFile.resolveWorkspacePath(root, req.query.path as string);
  u.workspaceFile.protectWorkspaceRoot(directory, path);
  if (!(await u.workspaceFile.statWorkspaceFile(path)).isFile()) throw Object.assign(new Error("只能读取文件"), { status: 400 });
  if (req.query.snapshot === "true") {
    const maxBytes = req.query.maxBytes === undefined ? 20 * 1024 * 1024 : Number(req.query.maxBytes);
    if ((await u.workspaceFile.statWorkspaceFile(path)).size > maxBytes) throw Object.assign(new Error("文件超过本次文本读取的大小限制"), { status: 413 });
    const { content, revision } = await u.assets.readAssetFile(req.query.path as string, undefined, library);
    if (content.length > maxBytes) throw Object.assign(new Error("文件超过本次文本读取的大小限制"), { status: 413 });
    res.set("Cache-Control", "no-store").json(success({ ...decodeText(content), revision }));
    return;
  }
  if (req.query.download === "true") res.attachment(basename(path));
  res.set({ "Cache-Control": "no-store", "Content-Security-Policy": "sandbox", "X-Content-Type-Options": "nosniff" });
  await sendFile(res, path, { dotfiles: "allow" }, err => { if (err) next(err); });
});
