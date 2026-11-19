# 非 UI 公共包与服务插件

`file/` 是统一磁盘操作入口；`ffmpeg/`、`providers/` 提供媒体基础设施和供应商实现；`i18n/` 提供语言运行时及显式抽取；[mcp](mcp/README.md) 提供外部工具接入。

`toolScaffold/`、`tools/`、`teamScaffold/`、`teams/` 与 `skills/` 保留服务工具、团队及技能。展示组件通过 `frontend/tools/` 的独立 UI 包公开导出，通用工具组件加载位于 `frontend/toolScaffold/`。跨包使用包名和 exports，不穿透其它包的 `src/`。

真实依赖关系登记在 [Project Facts](../facts/code-units)，外部版本以包清单及 `bun.lock` 为准。环境、扩展和构建用法见[源码手册](../docs/sourceDevelopment.md)；按改动显式执行包内现有 `typecheck` 或 `build`，不新增测试和自检模块。

MCP README 保留完整协议接入、配置及使用注意事项；它超过 30 行的内容为实际使用资料，本次不按行数删除。
