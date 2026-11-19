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

AFXEN页面沿用已合入原型交互，正式Web由Bun/Express提供真实账号与按用户隔离的数据边界。现有server拥有SQL元数据、文件卷和公司HTTP媒体存储的业务职责；MySQL及OSS是基础设施依赖，不另造本仓源码实体。独立数据库协议目标见 [NFR](nfr.md)。

用户配置与加密模型凭据、项目/库/媒体索引存MySQL；画布、对话和模板正文保持原JSON，新媒体以SQL映射指向云对象。按note 132070取消网站管理员和旧测试资料接管，账号通过SQL维护，所有账号使用独立用户根。浏览器业务数据不自动导入或清除。具体合同见 [accounts](../contracts/data/accounts.md)、[database](../contracts/data/database.md) 和 [mediaStorage](../contracts/data/mediaStorage.md)。

部署仍为一个可写应用实例；文件协调、SDK会话和后台任务在进程内，不承诺多副本写入或持久任务队列。模型请求只使用所属用户配置，任务与结果保留发起owner。已接受媒体请求不因切画布/HTTP断开而自动停止，显式停止保留原权限校验。

## 服务与页面通信矩阵

| 调用方（页面） | 被调方（服务） | 关系 | 认证边界 | Contract identity |
| --- | --- | --- | --- | --- |
| `web` | `server` | HTTP 查询、命令与事件流 | opaque Session、CSRF、页面身份一致性及用户根授权；原生local保留本机边界 | [settings](../contracts/data/settings.md)，其余接口见现有 [routes](../services/server/src/routes) |

## 服务间通信与事件矩阵

| 上游 | 下游 | 关系（调用 / 发布 / 订阅） | Contract identity | 备注 |
| --- | --- | --- | --- | --- |

独立业务服务与更新文件服务之间没有新增内部 RPC 或事件总线。模型供应商、市场和更新下载属于已有外部边界，不伪造为本仓实体。

## 网络与部署

浏览器开发时由 Vite 代理至本机 Server；构建后由同一 Server 提供 Web 静态资源和 API。原生宿主嵌入同一 Web 并复用服务应用。更新文件服务独立监听；生产端口、签名、部署与访问控制沿用既有运行资料，本次不发布或部署。

## 数据域归属

| 数据域 | 唯一归属 Entity | Contract identity | 说明 |
| --- | --- | --- | --- |
| 账号、会话、个人配置/凭据、项目/库/媒体元数据 | `server` | [database](../contracts/data/database.md) | 唯一SQL业务owner，MySQL为已有基础设施依赖，Compose仅部署应用 |

## 文件与制品归属

| 文件范围 | 唯一归属 Entity | Contract identity | 说明 |
| --- | --- | --- | --- |
| 画布、对话、模板正文、旧媒体与可信插件 | `server` | [studio](../contracts/data/studio.md) | 原文件格式和单进程冲突边界保留；新媒体按云存储合同 |
| 更新文件 | `updateserver` | [updateArtifacts](../contracts/data/updateArtifacts.md) | 仅既有发布器的普通制品，不使用本次业务SQL |

## 跨实体关系

| 关系 | 上游 Entity | 下游 Entity | Contract identity | 说明 |
| --- | --- | --- | --- | --- |
| 页面读取及保存工作区 | `web` | `server` | [settings](../contracts/data/settings.md) | 通过生产适配层，不共享磁盘路径写权限 |

## 保留的工程限制

配置和文件冲突协调均为单进程；不承诺多进程并发写同一工作区。生成调用仍由真实供应商能力决定，不自动付费重试，不将 Scenario 的可达性作为模型成功证据。统一文件操作继续使用 `@toonflow/file`，完整快照显式原子保存；软件测试仍由软测承担。

## 安全与兼容边界

Web先取得真实会话再初始化个人业务Store。所有个人API、媒体和事件流验证身份及owner；普通用户不能安装、编辑或调试服务端可执行扩展。多用户standalone不挂载未绑定用户的外部MCP/A2A和设备互联入口，原生宿主通过明确local参数保留原流程。仅伪造header不能切回local。

公司HTTP OSS没有鉴权，部署侧限制其可达范围；浏览器只访问AFXEN授权媒体代理。模型出站使用供应商和运维登记的base，公共网页下载校验DNS并固定公网IP，避免普通工具绕过内网存储。FFmpeg仅接受受控文件与当前编辑参数，临时物化云输入；输出发布成功后才报告成功。可信部署管理员及其安装代码仍在信任边界内，不宣称能防御恶意宿主。

系统conf单例保留实例资源配置；个人配置由请求上下文消费数据库，不每用户再建conf。启动缺上下文不借用其它用户Key；缺数据库、schema、密钥或OSS配置明确失败，不自动建立、降级或回退JSON。数据、字段及错误在相应Contract维护；内部实现见 [accountIsolation](../services/server/designs/accountIsolation.md)。

Compose及运维见 [database](../ops/database.md)、[storage](../ops/storage.md)。本轮只交付源码与材料，未执行环境连接、资料接管、部署或生产操作。真实模型、双账号、恢复和原生平台验证按实际结果交接。
