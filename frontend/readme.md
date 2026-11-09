# 前端与交互组件

本目录负责 Web 页面、桌面及移动宿主、节点和编辑器插件的 UI；非 UI 服务和公共包位于 [services](../services/readme.md) 与 [packages](../packages/readme.md)。

- [web](web)：Vue 页面与 Pinia 状态。生产入口为 `src/composition/production.ts`；场景入口为 `src/composition/scenario.ts`，二者共用 `src/bootstrap.ts`、路由和页面。
- `nodes/`、`ext/`：原有可构建插件；`nodeScaffold/`、`extScaffold/` 提供通用宿主能力；跨节点业务 UI 仍由 `nodeShared/` 公开导出。
- `tools/`：从服务工具中分离的展示组件；`toolScaffold/` 提供生产组件加载能力。包名、插件标识及构建产物名称保持原值。
- `desktop/`、`mobile/`、`compat/`：复用同一 Web 的原生启动与打包宿主，没有第二套页面实现。平台构建前提见[源码手册](../docs/sourceDevelopment.md)。
- [preview](preview/readme.md)：唯一隔离预览入口；[端级说明](web/uiux_manifest.md)记录适用范围。

页面、状态和共享交互组件通过 Port 消费能力；HTTP、事件流和生产组件加载放在 Web 的 `src/adapters/production/`。插件通过宿主注入的公开 Port 复用交互，不自行连网。场景 Provider 直接返回合成展示数据，不能导入生产适配层。

开发、构建及现有类型检查命令以[源码手册](../docs/sourceDevelopment.md)和各包 `package.json` 为准。遵守[项目规范](../AGENTS.md)，不新增测试、自检或 CI 自动测试入口。迁移不代表 Issue #7 的创作业务已经实现。
