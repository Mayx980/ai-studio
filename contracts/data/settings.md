# 既有设置与工作区数据

所属 entity 为 `server`，消费方为 `web` 及复用服务的原生宿主。工作区文件沿用现有协议；模型凭据按 Issue #7 [已确认服务端方案](https://git.aimall-tech.com/yuxin.ma/ai-studio/-/issues/7#note_128590)由服务端保存和使用。

## 设置

`settings.json` 位于 `TOONFLOW_DATA_DIR` 规范化后的目录；进程内由单例 `conf` 读写，文件权限为 `0o600`。根记录包含 `settings`，另有工具、节点、编辑器和连接配置，见 [conf 实例](../../services/server/src/utils/conf/index.ts)。普通设置请求只覆盖 `settings` 对象，不覆盖其它根记录。

| 交互 | 既有数据规则 |
| --- | --- |
| 读取 | `GET /api/settings/get`，返回 `{ code: 200, data: settings, message }`；模型凭据按下节脱敏，无设置时为空对象。读取可清理已不存在的节点菜单项。 |
| 保存 | `PUT /api/settings/save`，JSON `{ settings: object }`。`settings` 的每个值必须是合法 JSON；普通字段及供应商列表完整替换，凭据采用下节的保留／更新／清除语义。 |
| 额外校验 | `agentSystemPrompt` 长度受现有常量限制；更新源是 `official/github/custom`，自定义源必须为不含账号、查询或锚点的 HTTP(S) 地址；MCP 端口为 1–65535 整数。精确校验见 [save](../../services/server/src/routes/settings/save.ts)。 |
| 保存结果 | `{ code, data, message }`，`data` 可含模型刷新信息和清理后的节点菜单；错误由既有统一中间件设置 HTTP 状态，不能以请求完成代替保存成功。 |

## 模型凭据

实例级凭据继续存入同一 `settings.json`：文本供应商使用 `settings.customProviders[].apiKey`，媒体供应商使用 `settings.mediaProviderConfigs[providerId].apiKey`。保留原字段和已有服务端凭据，不读取、导入或清理旧浏览器项目与内存配置。共享实例的访问者使用同一份模型配置，本协议不提供账号或个人凭据隔离。

通用设置读取不返回上述 `apiKey`；在对应供应商对象内返回布尔字段 `apiKeyConfigured`，表示服务端是否保存了非空 Key。该字段只读，不作为凭据、权限证明或磁盘保存内容。模型刷新和设置保存的响应同样不得包含原始 Key。Key 不进入浏览器持久化、项目、对话、资产、模板、日志或可见错误。

| 保存请求中的凭据字段 | 服务端动作 |
| --- | --- |
| 现有供应商对象省略 `apiKey` | 按同一供应商 ID 保留服务端当前值；修改名称、地址或模型列表不会清空 Key。 |
| 新供应商对象省略 `apiKey` | 以未配置凭据保存，不继承其它供应商的 Key。 |
| `apiKey` 为非空字符串 | 替换该供应商的 Key；去除首尾空白后至多 8192 字符，不接受换行。 |
| `apiKey` 为 `""` 或仅空白 | 显式清除该供应商的 Key。编辑界面保留已保存 Key 与主动清除必须是不同操作。 |
| `apiKey` 为 `null`、非字符串或格式非法 | HTTP 400，整次设置不写入。 |
| 从完整列表或配置映射移除供应商 | 随该供应商配置一起移除其凭据；不保留隐藏的第二份 Key。 |

普通设置仍采用完整覆盖，不因凭据脱敏改为任意字段合并。服务端在写入前统一验证并补回被省略的现有凭据，再沿用单进程配置写入及模型刷新入口；保存失败必须向调用方报错。前端仅在编辑与提交期间持有新输入的 Key，成功后回读脱敏设置并清除编辑值，不能将待提交明文合并进长期 Store。

已保存文本供应商主动获取模型列表时，`POST /api/providers/models` 可使用 `providerId` 与省略的 `apiKey`；服务端仅在请求地址、协议与当前已保存供应商一致时使用该供应商的凭据。明确传入的字符串 Key 仍用于尚未保存的连接配置验证。请求不会触发生成，不返回 Key；配置不存在或已变更时明确拒绝，不回退其它供应商。

## 工作区文件

文件由 `server` 访问，Web 不直接访问磁盘。`directory` 是经服务规范化和授权的工作区目录，`path`/`target` 是其内部相对路径；不得逃逸目录或覆盖已有改名目标。列表返回 `{ directory, empty, entries }`，条目为 `{ name, path, type }`，`type` 为 `file/directory`。

原始内容保存使用 `PUT /api/workspaces/files/write` 和 `application/octet-stream`。`exclusive=true` 只允许新建；可选 `expectedRevision` 是 64 位小写 SHA-256 字符串，与现有内容不匹配时返回 409，保留原内容。编码转换及响应 revision 继续按 [write](../../services/server/src/routes/workspaces/files/write.ts)实现。删除、复制和改名继续使用所属接口与冲突锁，不由 Port 或 Preview 放宽授权。

新增、删除或移动接口后运行既有路由生成器；本合同随实际生产协议变化同步维护。软件测试由软测负责，项目不新增测试或自检模块。

## 既有市场和账户调用的凭据兼容

保存的 TF-Router Key 由服务端用于既有市场、余额和充值操作，不回传浏览器。`/api/marketplace/browse`、`collection`、`payment` 为 POST，`options`、`order` 为 GET，分别对应原有插件查询、收藏、下单、套餐及订单查询。服务端只映射这五个固定官方业务路径，不接收 URL，不跟随重定向，不自动下单或重试。临时编辑 Key 可通过当次 Authorization 提交，省略时使用已保存的官方配置；仍要求应用同源和工作区请求头。模型生成错误隐藏已保存的 Key。

模型列表只列出已配置 Key 且未停用的模型；请求仍核对供应商、模型和媒体类型。图片生成保留 `n`（1–6）、size 和 ratio；参考文件仍按原工作区相对路径读取。服务端先保存真实生成文件，再返回路径。供应商协议和模型权限未通过真实有效 Key 联调时，不宣称生成成功。

## 用户凭据修订候选（尚未实现）

依据 [note 131174](https://git.aimall-tech.com/yuxin.ma/ai-studio/-/issues/7#note_131174)，目标由实例凭据改为所属用户凭据。上文 Key 的保存字段、脱敏、按供应商 ID 保留/替换/清除、禁止回传和错误脱敏语义保持；个人保存不能修改实例宿主或可执行插件设置。

新账号从未配置状态开始，不能隐式继承管理员或其它用户 Key。旧实例模型配置原位归初始管理员；供应商模型列表、价格/余额及所有生成、市场或工具调用只使用当前所属用户配置，缓存与刷新也按用户区分。登录接口以外的相关请求先认证；请求中的 providerId 不构成跨用户授权。账号规则见 [accounts](accounts.md)，配置实例及系统设置的分离见 [服务端设计](../../services/server/designs/accountIsolation.md)。本段待计划确认后实施，当前运行代码未完成此隔离。
