import u from "@/utils";
import { Router } from "express";
import { success } from "@/lib/responseFormat";

const router = Router();

export default router.get("/", async (req, res) => {
  u.mcpControl.assertAppRequest(req);
  res.set("Cache-Control", "no-store");
  const settings = u.conf.get("settings", {});
  if (u.cleanNodeMenuSettings(settings)) await u.conf.set("settings", settings);
  res.json(success({ ...u.providerCredentials.publicSettings(settings),
    ...(u.accounts.usesAccounts() ? { settingsRevision: u.accounts.requireAccount().configurationRevision } : {}) }));
});
