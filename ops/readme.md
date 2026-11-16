# 构建与运行

在仓库根目录准备 Bun 1.3.14 及工作区依赖后，执行 `bun run build:server`。该脚本调用 `ops/buildStandalone.ts`，构建节点、工具、编辑器插件、Web、Server、MCP，并复制供应商和技能到根 `build/`。随后 `bun run start:server` 运行构建版，默认访问 `http://localhost:3000`。

容器入口为 `ops/Dockerfile` 和 `ops/compose.yaml`。在根目录执行 `docker compose -f ops/compose.yaml up --build`，构建上下文仍为仓库根；容器数据卷和端口沿用现有配置。容器构建、上线、签名、桌面和移动打包需要对应环境与独立操作，未执行时不声称通过。

平台准备、安装包、更新制品及发布命令的唯一详细说明见[源码手册](../docs/sourceDevelopment.md)与[更新服务](../services/updateServer/readme.md)。`.github/workflows/` 保留上游配置，在本 GitLab 项目不自动执行；本次不增加 GitLab CI 或生产部署。

## 独立账号与数据库运行方案候选（尚未实现）

本轮按人工要求把无数据库候选改为独立 MySQL 服务；具体服务、卷、最小权限、接管、健康、备份恢复和固定命名例外见 [database](database.md)。该方案尚待本版 Plan 审阅，当前 Compose/镜像没有新增数据库，不能按文档宣称已可运行。

目标保留现有应用 HTTP 端口、appData 和 APISIX 转发，仅增加内部数据库及独立 mysqlData 卷。数据库保存账号/会话及用户业务元数据；本轮新媒体拟接公司HTTP云存储，旧媒体与画布/对话/模板JSON仍在原卷；首个管理员通过受控本地入口接管旧资料。实际镜像、初始化、同版本运维和目标机命令待实现并验证后给出，本次不连接环境数据库或部署。

公司HTTP云存储的候选配置、网络、备份和删除缺口见 [storage](storage.md)。服务地址和bucket由部署人员后填，支持配置文件及环境变量；不新增Go服务、不改APISIX或自动迁移旧媒体。当前Compose仍无这些配置，实现/联调完成前不宣称可用。
