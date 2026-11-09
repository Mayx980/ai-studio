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

`frontend/` 持有完整交互单元和共享 UI，`services/` 与 `packages/` 持有非 UI 实现，`ops/` 持有聚合构建和容器资料。包名、插件 ID、公开导出语义、`build/` 产物名、`data/` 和用户工作区格式保持兼容；路径与依赖以 [Project Facts](../facts/project.yaml)和真实包清单为准。

所有代码单元采用 `project_observed`；保留 Bun、TypeScript、Vue、Express 和现有依赖，不因工具默认值切换包管理器。Preview 的项目适配和未支持的 Docker 路径见[运行说明](../frontend/preview/readme.md)。

共享实例项目持久化、凭据读写合同及 AFXEN 创作页面的后续设计/实现仍由 #7 承接；本次仅补齐工程身份与当前接口导航，不以存量代码反向认可尚未实现的产品设计。

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
| 应用配置与工作区文件 | `server` | [settings](../contracts/data/settings.md) | 维持进程级单例、数据目录和路径边界 |
| 更新文件 | `updateserver` | [updateArtifacts](../contracts/data/updateArtifacts.md) | 仅服务既有发布器产生的普通文件 |

## 跨实体关系

| 关系 | 上游 Entity | 下游 Entity | Contract identity | 说明 |
| --- | --- | --- | --- | --- |
| 页面读取及保存工作区 | `web` | `server` | [settings](../contracts/data/settings.md) | 通过生产适配层，不共享磁盘路径写权限 |

## 保留的工程限制

配置和文件冲突协调均为单进程；不承诺多进程并发写同一工作区。生成调用仍由真实供应商能力决定，不自动付费重试，不将 Scenario 的可达性作为模型成功证据。统一文件操作继续使用 `@toonflow/file`，完整快照显式原子保存；软件测试仍由软测承担。
