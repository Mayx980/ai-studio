# 既有设置与工作区数据

所属 entity 为 `server`，消费方为 `web` 及复用服务的原生宿主。本页记录迁移前已有协议，不声明 #7 新产品协议已完成。

## 设置

`settings.json` 位于 `TOONFLOW_DATA_DIR` 规范化后的目录；进程内由单例 `conf` 读写，文件权限为 `0o600`。根记录包含 `settings`，另有工具、节点、编辑器和连接配置，见 [conf 实例](../../services/server/src/utils/conf/index.ts)。普通设置请求只覆盖 `settings` 对象，不覆盖其它根记录。

| 交互 | 既有数据规则 |
| --- | --- |
| 读取 | `GET /api/settings/get`，返回 `{ code: 200, data: settings, message }`；无设置时为空对象。读取可清理已不存在的节点菜单项。 |
| 保存 | `PUT /api/settings/save`，JSON `{ settings: object }`。`settings` 的每个值必须是合法 JSON；完整替换，不部分合并。 |
| 额外校验 | `agentSystemPrompt` 长度受现有常量限制；更新源是 `official/github/custom`，自定义源必须为不含账号、查询或锚点的 HTTP(S) 地址；MCP 端口为 1–65535 整数。精确校验见 [save](../../services/server/src/routes/settings/save.ts)。 |
| 保存结果 | `{ code, data, message }`，`data` 可含模型刷新信息和清理后的节点菜单；错误由既有统一中间件设置 HTTP 状态，不能以请求完成代替保存成功。 |

本轮不改变凭据字段、旧配置兼容或模型刷新语义。#7 要求的凭据保留/清除、读取脱敏与并发设置保存需后续形成精确变更合同。

## 工作区文件

文件由 `server` 访问，Web 不直接访问磁盘。`directory` 是经服务规范化和授权的工作区目录，`path`/`target` 是其内部相对路径；不得逃逸目录或覆盖已有改名目标。列表返回 `{ directory, empty, entries }`，条目为 `{ name, path, type }`，`type` 为 `file/directory`。

原始内容保存使用 `PUT /api/workspaces/files/write` 和 `application/octet-stream`。`exclusive=true` 只允许新建；可选 `expectedRevision` 是 64 位小写 SHA-256 字符串，与现有内容不匹配时返回 409，保留原内容。编码转换及响应 revision 继续按 [write](../../services/server/src/routes/workspaces/files/write.ts)实现。删除、复制和改名继续使用所属接口与冲突锁，不由 Port 或 Preview 放宽授权。

新增、删除或移动接口后运行既有路由生成器；本合同随实际生产协议变化同步维护。软件测试由软测负责，项目不新增测试或自检模块。
