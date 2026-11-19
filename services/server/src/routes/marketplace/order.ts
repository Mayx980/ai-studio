import { Router } from "express";
import { z } from "zod";
import u from "@/utils";
import { validateFields } from "@/lib/middleware";

export default Router().get("/", validateFields({ orderNumber: z.string().trim().min(1).max(200) }, "query"), async (req, res) => {
  u.mcpControl.assertAppRequest(req);
  res.set("Cache-Control", "no-store").json(await u.marketplace.request("order", req.query, req.get("authorization")));
});
