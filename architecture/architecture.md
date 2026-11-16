# 当前工程系统边界

本页记录迁移后既有系统的组成和已确认工程接入决定；产品目标和待实施行为以 [Issue #7](https://git.aimall-tech.com/yuxin.ma/ai-studio/-/issues/7)、[PRD](../requirements/prd.md)为准。首次登记不代表该 Issue 的全部方案已经落地。

| Facts entity | 职责与边界 |
| --- | --- |
| `web` | 唯一 Vue 页面工程；浏览器交互经 Port 调用生产适配层，再访问业务服务或现有市场服务。Scenario 使用同一页面和独立组装入口。 |
| `server` | 单进程 Bun/Express 服务；提供业务 API、工作区与配置文件访问、模型请求和构建后静态页面。数据目录在动态路由加载前确定。 |
| `updateserver` | 独立更新制品服务，不承载创作业务。 |
| `desktophost` | Electrobun 主进程、原生窗口及打包工具；复用 Web 和 `createApp`，不再启动独立 Server 入口或 cluster。 |
| `mobilehost` | Android 原生壳与嵌入式服务启动、打包；复用 Web，没有独立页面工程。 |
| `ohoshost` | HarmonyOS 原生壳和构建入口；复用 Web 与 Server。 |
| `macintelhost` | Intel Mac 的旧 Electrobun 兼容构建入口；保留独立版本与锁文件，复用同一应用。 |

实体 identity 只在 [facts/entities](../facts/entities) 分配。四个原生项以 `tool` 登记实际启动/打包宿主，UI 归属唯一 `web`；公共库和 UI 插件是共享代码单元，没有伪造为独立运行服务。

`frontend/` 持有完整交互单元和共享 UI，`services/` 与 `packages/` 持有非 UI 实现，`ops/` 持有聚合构建和容器资料。原服务与 SDK 包名、插件 ID、`build/` 产物名、`data/` 和用户工作区格式保留；路径与依赖以 [Project Facts](../facts/project.yaml)和真实包清单为准。

工具 UI 分离后，原 `@toonflow/tool-browser/panel` 入口迁至 `@toonflow/tool-browser-ui`，原 `@toonflow/tools-scaffold/client` 入口迁至 `@toonflow/tool-client`，内部调用方已同步使用这些新入口。

所有代码单元采用 `project_observed`；保留 Bun、TypeScript、Vue、Express 和现有依赖，不因工具默认值切换包管理器。Preview 的项目适配和未支持的 Docker 路径见[运行说明](../frontend/previewGuide.md)。

AFXEN 页面沿用人工合入的原型交互，正式组装改为共享 Server：工作区保存项目/画布/会话和生成素材，固定全局库保存资产与模板，共享索引独立以 revision 更新。实例级模型凭据由 Server 保存，普通读取只返回配置状态；供应商调用与结果下载在 Server 执行。具体协议见 [studio](../contracts/data/studio.md) 和 [settings](../contracts/data/settings.md)。

访问同一实例的浏览器共享同一数据边界，没有生产账号、个人隔离或可信管理员权限。旧浏览器业务数据保留，不自动导入；首次教学和视图等偏好仍可在当前浏览器记录。单进程文件锁和版本校验阻止过期快照覆盖，不提供实时协作或持久任务队列。

## 服务与页面通信矩阵

| 调用方（页面） | 被调方（服务） | 关系 | 认证边界 | Contract identity |
| --- | --- | --- | --- | --- |
| `web` | `server` | HTTP 查询、命令与事件流 | 保留现有工作区授权及应用来源校验；本次不新增账号 | [settings](../contracts/data/settings.md)，其余接口见现有 [routes](../services/server/src/routes) |

## 服务间通信与事件矩阵

| 上游 | 下游 | 关系（调用 / 发布 / 订阅） | Contract identity | 备注 |
| --- | --- | --- | --- | --- |

独立业务服务与更新文件服务之间没有新增内部 RPC 或事件总线。模型供应商、市场和更新下载属于已有外部边界，不伪造为本仓实体。

## 网络与部署

浏览器开发时由 Vite 代理至本机 Server；构建后由同一 Server 提供 Web 静态资源和 API。原生宿主嵌入同一 Web 并复用服务应用。更新文件服务独立监听；生产端口、签名、部署与访问控制沿用既有运行资料，本次不发布或部署。

## 数据域归属

| 数据域 | 唯一归属 Entity | Contract identity | 说明 |
| --- | --- | --- | --- |
| 应用配置、共享创作索引与工作区文件 | `server` | [settings](../contracts/data/settings.md) | 维持进程级单例、数据目录和路径边界 |
| 更新文件 | `updateserver` | [updateArtifacts](../contracts/data/updateArtifacts.md) | 仅服务既有发布器产生的普通文件 |

## 跨实体关系

| 关系 | 上游 Entity | 下游 Entity | Contract identity | 说明 |
| --- | --- | --- | --- | --- |
| 页面读取及保存工作区 | `web` | `server` | [settings](../contracts/data/settings.md) | 通过生产适配层，不共享磁盘路径写权限 |

## 保留的工程限制

配置和文件冲突协调均为单进程；不承诺多进程并发写同一工作区。生成调用仍由真实供应商能力决定，不自动付费重试，不将 Scenario 的可达性作为模型成功证据。统一文件操作继续使用 `@toonflow/file`，完整快照显式原子保存；软件测试仍由软测承担。

## 独立账号修订目标（待计划确认，未实现）

[note 131174](https://git.aimall-tech.com/yuxin.ma/ai-studio/-/issues/7#note_131174) 将上述实例共享目标替换为用户隔离。独立账号仍使用 `web`、`server`；本轮 [note 131340](https://git.aimall-tech.com/yuxin.ma/ai-studio/-/issues/7#note_131340) 进一步要求新增数据库服务，候选由 Compose 部署 MySQL 8.4 LTS，不新增独立认证服务或伪造数据库源码实体。当前代码仍按上文共享边界运行；以下目标须经本版 Plan 确认和实现验证，不因写入架构文档自动生效。

| 边界 | 目标 |
| --- | --- |
| 页面到 Server | 真实账号会话先于业务数据初始化；所有个人 API、媒体与事件流由服务端核对身份及归属，修改/生成防 CSRF |
| 用户资料 | 账号/会话、个人配置和项目/资产/模板/媒体索引存数据库；新媒体拟接公司HTTP云存储，旧媒体及画布/对话/模板JSON留原卷；模型配置及 Key 只供所属用户调用，不随通用读取回传 |
| 原共享资料 | 文件原位归初始管理员，索引和配置经显式事务接管入库；不覆盖原 JSON，不双写；新用户从空资料开始 |
| 实例资源 | 账号记录、可信插件代码和宿主设置由 Server 保管；普通用户不具备服务端任意代码/文件操作权限 |
| 异步执行 | 任务、Agent、缓存及订阅绑定用户，结果固定回写发起用户的原项目；不承诺重启后的任务恢复 |
| 外部旁路 | 多用户 standalone 不开放未绑定用户的 MCP/A2A/设备互联监听；原生本机模式保留明确的启动边界，不以 HTTP header 绕过登录 |

候选采用 MySQL 8.4 LTS/InnoDB 与 Bun SQL；协议兼容目标 mysql 8.4 尚待本版人工确认，批准后才写入 NFR。SQL 数据域由现有 server 唯一负责，部署数据库是其基础设施依赖；精确数据范围见 [database](../contracts/data/database.md)，运维材料及固定命名例外见 [运行方案](../ops/database.md)。文件写入继续单进程，保留版本冲突保护，不能因数据库存在扩多个写实例。没有跨用户实时协作或分享，也不把可信服务器管理员纳入抵御恶意宿主的隔离承诺。

账号及兼容数据规则见 [accounts](../contracts/data/accounts.md)，服务内部实现设计见 [accountIsolation](../services/server/designs/accountIsolation.md)，既有协议的修订见 [studio](../contracts/data/studio.md) 与 [settings](../contracts/data/settings.md)。所有设计仅对应本次范围，旧业务验收仍按 PRD 保留。

本轮云存储修订保留 Bun 后端，复用公司既有无鉴权 HTTP storage；AFXEN 负责当前用户授权及同源媒体代理，外部存储地址只从部署配置读取。实际网络隔离是用户资料保密的前提，不以隐藏 URL 代替。精确协议、缺少的物理删除/签名链接能力及仍待确认的提议见 [mediaStorage](../contracts/data/mediaStorage.md)，配置与恢复见 [storage](../ops/storage.md)。该段为待审目标，不表示当前共享代码已接入云存储。
