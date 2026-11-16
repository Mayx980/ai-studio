# 现有接口与数据边界

业务服务身份为 [server](../facts/entities/server.yaml)，更新服务身份为 [updateserver](../facts/entities/updateserver.yaml)。本页索引现有接口及 #7 已确认的独立账号服务端协议。既有字段、设置覆盖及文件冲突规则见 [settings](data/settings.md)，更新边界见 [updateArtifacts](data/updateArtifacts.md)。

业务 API 的具体方法与字段以 [routes](../services/server/src/routes) 中校验及注册为准；路由生成器按文件路径添加 `/api`，`index.ts` 不生成 `/index`，注册文件为派生结果。普通 JSON 使用 `{ code, data, message }`，HTTP 状态需由接口显式设置。流式接口沿用原有 SSE 或逐行 JSON 格式。

设置读取为 `GET /api/settings/get`，保存为 `PUT /api/settings/save`，用户模式请求体为 `{ settings: { ... }, expectedRevision }`，保持普通设置完整覆盖并校验 revision。`createApp` 在加载路由前指定进程级数据目录；用户设置和加密模型凭据分别保存在 MySQL，原生本机模式继续使用权限 `0o600` 的 `settings.json`。Key 的保存、保留、清除和读取脱敏遵循 [凭据合同](data/settings.md)。

工作区文件接口使用 `directory` 指定工作区目录、`path`/`target` 指定工作区内相对路径，服务端继续负责授权、路径边界和冲突保护。Web 使用 [workspaceFiles](../frontend/web/src/lib/workspaceFiles.ts) 统一入口；消费侧传输放在生产适配层，Port 与 Scenario 不成为第二份 HTTP 协议定义。

AI、媒体、插件、MCP、原生宿主与更新协议保留已有实现及公开导出。节点的 `NodeAiPort`、浏览器和提问组件的宿主 Port 是进程内交互边界；Scenario 不模拟真实生成、支付或文件保存成功。

共享项目索引、服务端项目目录创建、固定资产/模板库及 revision 规则见 [创作数据](data/studio.md)。工程登记、实现、编译和功能验收分别报告。

Issue #7 已按 note 131807 接入[独立账号](data/accounts.md)和[MySQL 数据协议](data/database.md)，账号、会话与用户业务元数据按用户归属。首次管理员的显式接管将旧共享资料归初始管理员；画布、对话及旧媒体仍保留原卷，不自动迁移或覆盖。部署前须由维护者完成数据库运维包初始化和管理员建立，源码接入不等于真实环境验收。

[媒体云存储](data/mediaStorage.md)记录公司 storage 的真实 HTTP 协议、用户授权、Range、响应误判、缺少的删除/签名能力及旧文件兼容。新增媒体使用 OSS 和 MySQL 归属映射；旧媒体保留本地读取，删除只解除关联。本轮未连接实际数据库、OSS 或付费模型，联调结果以 MR 的实际记录为准。
