import { Router } from "express";
import { z } from "zod";
import u from "@/utils";
import { validateFields } from "@/lib/middleware";
import { success } from "@/lib/responseFormat";

const router = Router();

export default router.delete("/", validateFields({ library: u.assets.librarySchema.optional(), path: z.string().min(1).max(4096), recursive: z.boolean().optional() }), async (req, res) => {
  u.mcpControl.assertAppRequest(req);
  await u.assets.removeAsset(req.body.path, req.body.recursive === true, req.body.library);
  res.json(success());
});
