import { Router } from "express";
import { z } from "zod";
import { validateFields } from "@/lib/middleware";
import { success } from "@/lib/responseFormat";
import u from "@/utils";

export default Router().post("/", validateFields({ username: u.accounts.usernameSchema, password: z.string().min(1).max(128) }), async (req, res) => {
  res.json(success(await u.accounts.login(req, res, req.body.username, req.body.password)));
});
