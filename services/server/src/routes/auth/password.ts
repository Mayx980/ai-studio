import { Router } from "express";
import { z } from "zod";
import { validateFields } from "@/lib/middleware";
import { success } from "@/lib/responseFormat";
import u from "@/utils";

export default Router().put("/", validateFields({ previous: z.string().min(1).max(128), password: u.accounts.passwordSchema }), async (req, res) => {
  await u.accounts.changePassword(req.body.password, req.body.previous);
  res.json(success(null, "密码已更新，请重新登录"));
});
