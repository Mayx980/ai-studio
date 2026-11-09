# 服务端

- [server](server)：Bun、Express 5 和 TypeScript 业务服务。`src/index.ts` 独立监听，`src/app.ts` 的 `createApp` 装配应用，并由原生宿主通过 `@toonflow/server/app` 复用。
- [updateServer](updateServer/readme.md)：独立更新文件和制品服务，保留原启动、发布脚本与存储目录。

业务服务以 `src/routes/` 的文件路径生成 API 注册，公共工具经 `src/utils.ts` 导出；参数校验、响应、配置与文件规则见[Server 开发规范](../AGENTS.md)。路由移动后先在 `services/server` 执行 `bun run routes`，再显式运行 `bun run typecheck`、`bun run build`。生成文件 `src/router.ts` 不手改。

普通 Web 开发在根目录运行 `bun run dev`；完整部署构建及输出见 [ops](../ops/readme.md)。配置读写验证使用临时 `dataDirectory`，不修改真实 `data/`。编译通过不代表 HTTP、持久化或外部模型行为已经验证。

当前[系统边界](../architecture/readme.md)和[接口入口](../contracts/readme.md)描述既有工程；Issue #7 的共享项目、凭据脱敏等产品增量继续按原 Issue 单独实施。
