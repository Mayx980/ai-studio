import type { AssetLibrary } from "@/utils/assets";
import { encodeText, type TextEncoding } from "@/lib/textEncoding";
import { Router } from "express";
import { z } from "zod";
import u from "@/utils";
import { validateFields } from "@/lib/middleware";
import { success } from "@/lib/responseFormat";

const router = Router();

export default router.put("/", validateFields({ path: z.string().min(1).max(4096), library: u.assets.librarySchema.optional(), expectedRevision: z.string().regex(/^[a-f0-9]{64}$/).optional(), encoding: z.enum(["utf-8", "utf-8-bom", "utf-16le", "utf-16be"]).optional() }, "query"), async (req, res) => {
  u.mcpControl.assertAppRequest(req);
  if (!req.is("application/octet-stream") || (req.body !== undefined && !Buffer.isBuffer(req.body))) {
    throw Object.assign(new Error("请发送文件原始内容"), { status: 400 });
  }
  const content = encodeText(req.body ?? Buffer.alloc(0), req.query.encoding as TextEncoding | undefined);
  const result = await u.assets.writeAssetFile(req.query.path as string, content, req.query.expectedRevision as string | undefined, req.query.library as AssetLibrary | undefined);
  res.json(success(result));
});
