# 构建与运行

仓库根准备Bun 1.3.14和工作区依赖后运行`bun run build:server`，产物在build/，包含Web、Server、节点/工具/编辑器、MCP及离线`build/server/userSql.js`。构建不连接数据库、不建表或创建账号。

- [部署与SQL账号](database.md)：复用已有MySQL、仅应用Compose、连接/密钥、显式schema初始化、SQL建号/重置/启停、健康与恢复。
- [云媒体配置](storage.md)：现有HTTP OSS地址和bucket、允许网络、媒体保存及任务限制。
- [数据库运维](db/README.md)和[操作手册](db/runbook.md)：版本化初始化/诊断/备份/撤销会话；实际目标由操作者另行核对。
- [源码开发](../docs/sourceDevelopment.md)：工作区、构建入口及原生local兼容。

`ops/compose.yaml`只有app，不提供MySQL容器/数据库卷或Caddy，不改APISIX；应用文件默认绑定仓库data目录。未配置数据库/schema/密钥/OSS时健康失败，不自动建表或回退JSON。网站无管理员，SQL维护账号；旧测试资料不自动导入，不实际删除。真实数据库、OSS、双账号及恢复尚未验收。
