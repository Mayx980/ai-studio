import logger from "morgan";
import express from "express";
import cors from "cors";
import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import { readFile } from "@toonflow/file";
import type { Request, Response, NextFunction } from "express";
import buildRoute from "@/core";
import { redactMessage } from "@/utils/conf/providerCredentials";
import { errorFromCause } from "@/lib/responseFormat";
import desktopRequest from "@/lib/desktop";
import { getRuntimePlatform } from "@/lib/platform";
import initializePlugins from "@/utils/plugins/initialize";
import { languageRequest, resolveRequestLocale, runWithLocale, setLocaleFallback, translateError, translateMessage } from "@/lib/i18n";
import { detectLocale, normalizeLocale } from "@toonflow/i18n";
import { configure, usesAccounts } from "@/utils/accounts/context";

const autoInstallProviders = ["tfRouter.ts", "apiMart.ts", "metaso.ts", "compshare.ts"];

export async function createApp({
  webRoot,
  appVersion = "",
  dataDirectory,
  toolsRoot,
  nodesRoot,
  extRoot,
  providersRoot,
  skillsRoot,
  agentsRoot,
  pluginRevision,
  accountMode = "users",
}: {
  webRoot: string;
  appVersion?: string;
  dataDirectory?: string;
  toolsRoot?: string;
  nodesRoot?: string;
  extRoot?: string;
  providersRoot?: string;
  skillsRoot?: string;
  agentsRoot?: string;
  pluginRevision?: string;
  accountMode?: "local" | "users";
}) {
  // conf 由下方的路由动态加载，必须先确定整个进程共用的数据目录。
  if (dataDirectory) process.env.TOONFLOW_DATA_DIR = resolve(dataDirectory);
  configure(accountMode, process.env.TOONFLOW_DATA_DIR ?? resolve(import.meta.dirname, "../../../data"));
  const { default: conf } = await import("@/utils/conf");
  configure(accountMode, dirname(conf.path));
  if (usesAccounts()) {
    await (await import("@/utils/database")).initialize();
    await (await import("@/utils/database/secrets")).initialize();
  }
  const mediaStorage = await import("@/utils/mediaStorage");
  await mediaStorage.initialize();
  setLocaleFallback(() => normalizeLocale((conf.get("settings", {}).ui as { language?: unknown } | undefined)?.language)
    ?? detectLocale([Intl.DateTimeFormat().resolvedOptions().locale]));
  if (dataDirectory && toolsRoot)
    await initializePlugins(resolve(dataDirectory, "tools"), toolsRoot, /^[a-z][a-zA-Z0-9]*\.tool\.js$/, pluginRevision);
  if (dataDirectory && nodesRoot) await initializePlugins(resolve(dataDirectory, "nodes"), nodesRoot, /^[a-z][a-zA-Z0-9]*\.umd\.js$/, pluginRevision);
  if (dataDirectory && extRoot) {
    const { default: initializeExt } = await import("@/utils/plugins/initializeExt");
    await initializeExt(resolve(dataDirectory, "ext"), extRoot, pluginRevision);
  }
  // ACT: 内置媒体供应商随构建同步，其他供应商文件和独立保存的配置保留。
  if (dataDirectory && providersRoot) {
    const sourceDirectory = resolve(providersRoot, "media");
    let providerRevision = pluginRevision;
    if (providerRevision === undefined) {
      const hash = createHash("sha256");
      for (const name of autoInstallProviders) {
        const source = await readFile(resolve(sourceDirectory, name)).catch((error: NodeJS.ErrnoException) => {
          if (error.code === "ENOENT") return Buffer.alloc(0);
          throw error;
        });
        hash.update(name).update("\0").update(source).update("\0");
      }
      providerRevision = hash.digest("hex");
    }
    await initializePlugins(resolve(dataDirectory, "providers"), sourceDirectory, autoInstallProviders, providerRevision);
  }
  // ACT: 技能和团队只补首次安装，保留用户修改。
  if (dataDirectory && skillsRoot) await initializePlugins(resolve(dataDirectory, "skills"), skillsRoot);
  if (dataDirectory && agentsRoot) await initializePlugins(resolve(dataDirectory, "agents"), agentsRoot);
  const app = express();
  app.locals.appVersion = appVersion;

  if (getRuntimePlatform().development) {
    await buildRoute();
    app.use(logger("dev"));
  }
  if (!usesAccounts()) app.use(cors());
  app.use(languageRequest);
  const accounts = await import("@/utils/accounts");
  app.use("/api", accounts.middleware);
  app.use("/a2a", express.json({ limit: "2mb" }));
  app.use(["/api/workspaces/files/write", "/api/assets/save"], express.raw({ type: "application/octet-stream", limit: "100mb" }));
  app.use(express.json({ limit: "100mb" }));
  app.use(express.urlencoded({ extended: true, limit: "100mb" }));
  app.use("/api/desktop", desktopRequest);

  const { default: initializeProviderModels } = await import("@/utils/ai/initialize");
  if (!usesAccounts()) await initializeProviderModels();
  const router = await import("@/router");
  router.default(app);
  if (!usesAccounts()) {
    const [{ createMcpRouter }, { getMcpTools }, { authorizeMcp }, { skillResources }] = await Promise.all([
    import("@toonflow/mcp"),
    import("@/utils/mcp/tools"),
    import("@/utils/mcp/control"),
    import("@/utils/mcp/resources"),
  ]);
  app.use("/mcp", createMcpRouter({ getTools: getMcpTools, authorize: authorizeMcp, resources: skillResources,
    runInRequest: (request, operation) => runWithLocale(resolveRequestLocale(request.get("accept-language")), operation),
    translate: translateMessage,
    translateError,
  }));
  const { createA2aRouter } = await import("@/agent/a2a");
  app.use("/a2a", createA2aRouter());
  }
  app.use(express.static(webRoot));

  // 错误处理
  app.use((err: Error & { status?: number; code?: string }, request: Request, response: Response, next: NextFunction) => {
    if (response.headersSent) return next(err);
    const credentials = conf.get("settings", {});
    const extra = typeof response.locals.requestApiKey === "string" ? [response.locals.requestApiKey] : [];
    const body = errorFromCause(err);
    // ACT: 文件探测和重复建目录由客户端处理，保留错误响应；其它异常仍记录脱敏堆栈。
    const missingFile = err.code === "ENOENT" && body.code === 404 && request.method === "GET"
      && ["/api/assets/read", "/api/workspaces/files/read", "/api/workspaces/files/list"].includes(request.path);
    const existingDirectory = err.code === "EEXIST" && body.code === 409 && request.method === "POST"
      && request.path === "/api/workspaces/files/mkdir";
    if (!missingFile && !existingDirectory) console.error(redactMessage(err.stack || err.message, credentials, extra));
    body.message = redactMessage(body.message, credentials, extra);
    response.status(body.code).json(body);
  });

  const { initializeMobileLinkRuntime } = await import("@/utils/mobileLink");
  if (!usesAccounts()) initializeMobileLinkRuntime(app);
  return app;
}
