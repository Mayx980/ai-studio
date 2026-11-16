import { Router } from "express";
import { z } from "zod";
import { validateFields } from "@/lib/middleware";
import { success } from "@/lib/responseFormat";
import u from "@/utils";

export default Router().put("/", validateFields({ id: z.uuid(), enabled: z.boolean() }), async (req, res) => {
  await u.accounts.updateAccount(req.body.id, req.body.enabled);
  res.json(success());
});
