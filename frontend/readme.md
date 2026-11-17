# 前端与交互组件

本目录负责 Web 页面、桌面及移动宿主、节点和编辑器插件的 UI；非 UI 服务和公共包位于 [services](../services/readme.md) 与 [packages](../packages/readme.md)。

- [web](web)：Vue 页面与 Pinia 状态。生产入口为 `src/composition/production.ts`；场景入口为 `src/composition/scenario.ts`，二者共用 `src/bootstrap.ts`、路由和页面。
- `nodes/`、`ext/`：原有可构建插件；`nodeScaffold/`、`extScaffold/` 提供通用宿主能力；跨节点业务 UI 仍由 `nodeShared/` 公开导出。
- `tools/`：从服务工具中分离的展示组件；`toolScaffold/` 提供生产组件加载能力。包名、插件标识及构建产物名称保持原值。
- `desktop/`、`mobile/`、`compat/`：复用同一 Web 的原生启动与打包宿主，没有第二套页面实现。平台构建前提见[源码手册](../docs/sourceDevelopment.md)。
- [preview](previewGuide.md)：唯一隔离预览入口；[端级说明](web/uiux_manifest.md)记录适用范围。

页面、状态和共享交互组件通过 Port 消费能力；HTTP、事件流和生产组件加载放在 Web 的 `src/adapters/production/`。插件通过宿主注入的公开 Port 复用交互，不自行连网。场景 Provider 直接返回合成展示数据，不能导入生产适配层。

AFXEN 正式创作入口复用已确认的原型页面，经 `src/ports/prototype.ts` 注入按账号授权的 Server 能力。项目与会话使用统一工作区入口；全局资产和模板通过固定库适配器访问各自服务器目录；模型请求使用现有 NodeAiPort。`workspaceMode` 表示浏览器文件存储，`supportsCreation` 表示简单/专业创作交互，二者独立。

启动先核实登录会话，再加载当前用户的脱敏设置、项目索引及可用模型并挂载页面；不读取旧浏览器业务列表或 IndexedDB，不自动迁移旧数据。保存 Key 时只短暂持有用户当次输入，成功后以脱敏配置更新 Store。主流程使用真实账号，项目、资产、模板和模型 Key 按当前用户隔离；网站不设管理员或账号管理界面，账号由运维SQL维护，用户可修改自己的密码。旧浏览器适配代码保留供设计来源参考，不进入正式生产组装。

Scenario 使用独立的内存展示宿主，拒绝真实文件保存和模型调用；它不连接共享 Server，不读取旧浏览器项目或账号。协议细节见 [Contract](../contracts/readme.md)，当前外部供应商、跨浏览器及原生宿主实测情况以 MR 为准。

开发、构建及现有类型检查命令以[源码手册](../docs/sourceDevelopment.md)和各包 `package.json` 为准。遵守[项目规范](../AGENTS.md)，不新增测试、自检或 CI 自动测试入口。工程迁移不替代 Issue #7 的业务验收。
