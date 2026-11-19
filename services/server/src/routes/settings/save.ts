import u from "@/utils";
import { Router } from "express";
import { z } from "zod";
import { validateFields } from "@/lib/middleware";
import { success } from "@/lib/responseFormat";
import { maxSystemPromptLength } from "@/agent/runtime/prompt";
import { t } from "@/lib/i18n";

const router = Router();

export default router.put("/", validateFields({ expectedRevision: z.number().int().positive().optional(), settings: z.record(z.string(), z.json()).and(z.object({
  agentSystemPrompt: z.string().max(maxSystemPromptLength, { error: () => t`系统提示词不能超过 ${maxSystemPromptLength} 个字符` }).optional(),
  desktopUpdateSource: z.enum(["official", "github", "custom"]).optional(),
  desktopUpdateCustomUrl: z.string().max(2048).refine(value => !value || u.desktop.isValidUpdateUrl(value),
    "自定义更新源必须是不含账号、查询参数或锚点的 HTTP(S) 地址").optional(),
  mcp: z.object({ enabled: z.boolean().optional(), token: z.string().optional(), port: z.number().int().min(1).max(65535).optional() }).optional(),
})).refine(value => value.desktopUpdateSource !== "custom" || !!value.desktopUpdateCustomUrl, {
  path: ["desktopUpdateCustomUrl"], message: "选择自定义更新源前，请先填写有效地址",
}) }), async (req, res) => {
  u.mcpControl.assertAppRequest(req);
  if (u.accounts.usesAccounts() && req.body.expectedRevision !== u.accounts.requireAccount().configurationRevision) {
    throw Object.assign(new Error("设置已被其它页面修改，请保留输入并刷新后重试"), { status: 409, code: "ESTALE" });
  }
  const previousSettings = u.conf.get("settings", {});
  const settings = u.providerCredentials.prepareSettings(req.body.settings, previousSettings);
  if (u.accounts.usesAccounts() && ["mcp", "desktopUpdateSource", "desktopUpdateCustomUrl"].some(key => Object.hasOwn(settings, key))) {
    throw Object.assign(new Error("Web个人设置不能修改宿主或外部监听配置"), { status: 403 });
  }
  u.removeLegacySettings(settings);
  u.cleanNodeMenuSettings(settings);
  await u.conf.set("settings", settings);
  const models = await u.ai.refreshProviderModels(previousSettings);
  if (!u.accounts.usesAccounts()) await u.mcpRuntime.reloadMcpRuntime();
  res.json(success({
    ...u.providerCredentials.publicSettings(models, u.conf.get("settings", {})),
    settings: u.providerCredentials.publicSettings(u.conf.get("settings", {})),
    ...(u.accounts.usesAccounts() ? { settingsRevision: u.accounts.requireAccount().configurationRevision } : {}),
    nodeMenu: u.conf.get("settings.general.nodeMenu") ?? null,
  }, "设置已保存"));
});
