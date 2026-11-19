import { Router } from "express";
import { z } from "zod";
import { validateFields } from "@/lib/middleware";
import { success } from "@/lib/responseFormat";
import u from "@/utils";

const router = Router();

export default router.post("/", validateFields({
  apiUrl: z.url().refine(value => {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password && !url.search && !url.hash;
  }, "请填写不含查询参数的 HTTP API 基础地址"),
  protocol: z.enum(["openai-completions", "openai-responses", "anthropic-messages"]),
  apiKey: z.string().max(8192).refine(value => !/[\r\n]/.test(value), "API Key 格式无效").optional(),
  providerId: z.string().min(1).max(200).optional(),
}), async (req, res) => {
  u.mcpControl.assertAppRequest(req);
  const { apiUrl, protocol, providerId } = req.body as { apiUrl: string; protocol: string; providerId?: string };
  const apiKey = req.body.apiKey === undefined && providerId
    ? u.providerCredentials.languageKey(u.conf.get("settings", {}), providerId, apiUrl, protocol)
    : req.body.apiKey ?? "";
  res.locals.requestApiKey = apiKey;
  res.json(success(await u.ai.fetchProviderModels({ apiUrl, protocol, apiKey })));
});
