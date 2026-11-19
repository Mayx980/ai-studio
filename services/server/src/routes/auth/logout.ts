import { Router } from "express";
import { success } from "@/lib/responseFormat";
import u from "@/utils";

export default Router().post("/", async (req, res) => {
  await u.accounts.logout(req, res);
  res.json(success());
});
