import { Router } from "express";
import { z } from "zod";
import { validateFields } from "@/lib/middleware";
import { success } from "@/lib/responseFormat";
import u from "@/utils";

export default Router().put("/", validateFields({ id: z.uuid(), password: u.accounts.passwordSchema }), async (req, res) => {
  await u.accounts.changePassword(req.body.password, undefined, req.body.id);
  res.json(success());
});
