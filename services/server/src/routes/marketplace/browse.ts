import { Router } from "express";
import { z } from "zod";
import u from "@/utils";
import { validateFields } from "@/lib/middleware";

export default Router().post("/", validateFields({ page: z.number().int().min(1), limit: z.number().int().min(1).max(50), type: z.enum(["all", "node", "skill", "tool", "agent", "ext", "my", "collection"]), searchKeyword: z.string().max(1000).optional() }, "body"), async (req, res) => {
  u.mcpControl.assertAppRequest(req);
  res.set("Cache-Control", "no-store").json(await u.marketplace.request("browse", req.body, req.get("authorization")));
});
