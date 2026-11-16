import { Router } from "express";
import { success } from "@/lib/responseFormat";
import u from "@/utils";

export default Router().get("/", async (req, res) => {
  res.set("Cache-Control", "no-store");
  if (!u.accounts.usesAccounts()) return res.json(success({ mode: "local", user: null }));
  await u.database.health();
  try {
    const value = await u.accounts.authenticate(req);
    res.json(success({ mode: "users", user: u.accounts.publicAccount(value.user), csrf: value.csrf }));
  } catch (cause) {
    if ((cause as { status?: number }).status !== 401) throw cause;
    res.json(success({ mode: "users", user: null }));
  }
});
