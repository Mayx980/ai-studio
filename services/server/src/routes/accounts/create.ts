import { Router } from "express";
import { z } from "zod";
import { validateFields } from "@/lib/middleware";
import { success } from "@/lib/responseFormat";
import u from "@/utils";

export default Router().post("/", validateFields({ username: u.accounts.usernameSchema, name: z.string().trim().min(1).max(80), password: u.accounts.passwordSchema }), async (req, res) => {
  res.json(success(await u.accounts.createAccount(req.body.username, req.body.name, req.body.password)));
});
