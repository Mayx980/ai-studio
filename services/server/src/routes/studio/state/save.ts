import { Router } from "express";
import u from "@/utils";
import { validateFields } from "@/lib/middleware";
import { success } from "@/lib/responseFormat";

export default Router().put("/", validateFields(u.studio.stateSchema.shape), async (req, res) => {
  u.mcpControl.assertAppRequest(req);
  const { revision, stores } = u.studio.stateSchema.parse(req.body);
  res.set("Cache-Control", "no-store").json(success(await u.studio.saveState(revision, stores)));
});
