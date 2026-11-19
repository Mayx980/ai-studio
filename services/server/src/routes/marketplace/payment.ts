import { Router } from "express";
import { z } from "zod";
import u from "@/utils";
import { validateFields } from "@/lib/middleware";

export default Router().post("/", validateFields({ comboId: z.number().int().refine(value => value === -1 || value > 0), customMoney: z.number().min(0.01).max(50000).optional(), payType: z.enum(["wechat", "alipay"]) }, "body"), async (req, res) => {
  u.mcpControl.assertAppRequest(req);
  if (req.body.comboId === -1 && req.body.customMoney === undefined) throw Object.assign(new Error("请填写充值金额"), { status: 400 });
  res.set("Cache-Control", "no-store").json(await u.marketplace.request("payment", req.body, req.get("authorization")));
});
