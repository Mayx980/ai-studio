import { Router } from "express";
import { success } from "@/lib/responseFormat";
import u from "@/utils";

export default Router().get("/", async (_req, res) => {
  if (u.accounts.usesAccounts()) {
    await u.database.health();
    u.databaseSecrets.checkConfiguration();
    u.mediaStorage.requireConfiguration();
  }
  res.set("Cache-Control", "no-store").json(success({ ready: true }));
});
