# 服务端

- [server](server)：Bun、Express 5 和 TypeScript 业务服务。`src/index.ts` 独立监听，`src/app.ts` 的 `createApp` 装配应用，并由原生宿主通过 `@toonflow/server/app` 复用。
- [updateServer](updateServer/readme.md)：独立更新文件和制品服务，保留原启动、发布脚本与存储目录。

业务服务以 `src/routes/` 的文件路径生成 API 注册，公共工具经 `src/utils.ts` 导出；参数校验、响应、配置与文件规则见[Server 开发规范](../AGENTS.md)。路由移动后先在 `services/server` 执行 `bun run routes`，再显式运行 `bun run typecheck`、`bun run build`。生成文件 `src/router.ts` 不手改。

普通 Web 开发在根目录运行 `bun run dev`；完整部署构建及输出见 [ops](../ops/readme.md)。配置读写验证使用临时 `dataDirectory`，不修改真实 `data/`。编译通过不代表 HTTP、持久化或外部模型行为已经验证。

共享实例创作复用当前服务：`studioState.json` 保存有版本的项目/资产索引，工作区保存在 `data/workspaces/`，全局库固定为 `data/assets/` 和 `data/templates/`；目录从 `settings.json` 所在的数据根定位，不依赖工作目录。精确读写、Key 脱敏与冲突规则见 [Contract](../contracts/readme.md)，系统边界见 [architecture](../architecture/readme.md)。

独立账号方案见 [accountIsolation](server/designs/accountIsolation.md)，认证和数据合同见 [accounts](../contracts/data/accounts.md)、[database](../contracts/data/database.md)。多用户standalone使用SQL个人配置及加密Key、用户文件根和统一云媒体入口，原生local显式保留原本机模式。

[运行步骤](../ops/database.md)包含现有MySQL连接、schema及离线账号SQL维护；[云存储](../ops/storage.md)包含后填配置及网络条件。当前已接入源码，真实数据库/OSS、双账号与原生平台尚未联调，不把类型/构建通过当业务验收。
