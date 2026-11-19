import { Router } from "express";
import { z } from "zod";
import u from "@/utils";
import { validateFields } from "@/lib/middleware";
import { success } from "@/lib/responseFormat";

export default Router().post("/", validateFields({ name: z.string().trim().min(1).max(80), initializeCanvas: z.boolean().optional() }), async (req, res) => {
  u.mcpControl.assertAppRequest(req);
  res.set("Cache-Control", "no-store").json(success(await u.studio.createWorkspace(req.body.name, req.body.initializeCanvas !== false)));
});
