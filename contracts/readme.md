# 现有接口与数据边界

业务服务身份为 [server](../facts/entities/server.yaml)，更新服务身份为 [updateserver](../facts/entities/updateserver.yaml)。本页只索引现有接口，不创建 #7 尚未实施的新协议。既有字段、设置覆盖及文件冲突规则见 [settings](data/settings.md)，更新边界见 [updateArtifacts](data/updateArtifacts.md)。

业务 API 的具体方法与字段以 [routes](../services/server/src/routes) 中校验及注册为准；路由生成器按文件路径添加 `/api`，`index.ts` 不生成 `/index`，注册文件为派生结果。普通 JSON 使用 `{ code, data, message }`，HTTP 状态需由接口显式设置。流式接口沿用原有 SSE 或逐行 JSON 格式。

设置读取为 `GET /api/settings/get`，保存为 `PUT /api/settings/save`，请求体 `{ settings: { ... } }`，保持原有完整覆盖语义。`createApp` 在加载路由前指定进程级数据目录，配置写入 `settings.json`，文件权限 `0o600`；本次不改变存量字段、密钥返回语义或保存模型。

工作区文件接口使用 `directory` 指定工作区目录、`path`/`target` 指定工作区内相对路径，服务端继续负责授权、路径边界和冲突保护。Web 使用 [workspaceFiles](../frontend/web/src/lib/workspaceFiles.ts) 统一入口；消费侧传输放在生产适配层，Port 与 Scenario 不成为第二份 HTTP 协议定义。

AI、媒体、插件、MCP、原生宿主与更新协议保留已有实现及公开导出。节点的 `NodeAiPort`、浏览器和提问组件的宿主 Port 是进程内交互边界；Scenario 不模拟真实生成、支付或文件保存成功。

#7 后续的共享项目索引、冲突 revision、凭据更新/保留/清除及读取脱敏需要在实施前形成精确合同；当前工程登记不会将这些产品能力标为完成。
