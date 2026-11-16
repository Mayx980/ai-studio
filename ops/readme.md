# 构建与运行

仓库根目录准备Bun 1.3.14和工作区依赖后，执行 `bun run build:server`，产物在 `build/`。聚合构建包含节点、工具、编辑器、Web、Server、MCP以及 `build/server/createAdmin.js`；构建不初始化数据库或接管资料。

- [多用户部署](database.md)：Compose、原卷复用、连接及加密密钥、结构初始化、管理员接管、健康与恢复。
- [公司HTTP云存储](storage.md)：后填配置、网络、模型允许地址、媒体及云对象保留。
- [数据库运维](db/runbook.md)：当前版本独立操作包，不需要Skill。
- [源码手册](../docs/sourceDevelopment.md)：源码运行、平台依赖与现有检查。
- [更新服务](../services/updateServer/readme.md)：独立更新制品服务。

`ops/compose.yaml`默认单个应用和内部MySQL，无Caddy、无新增Go服务、不改APISIX。必须显式选现有数据卷及填写配置，不能直接沿用旧版“up即共享匿名可用”的步骤。未配置数据库/schema/密钥/OSS时健康失败，不自动建表或回退JSON。

本轮未在目标机部署、连接数据库/OSS或进行生产操作。桌面、移动打包和签名在对应平台验证；`.github/workflows/`保留上游资料，不新增GitLab CI或测试入口。
