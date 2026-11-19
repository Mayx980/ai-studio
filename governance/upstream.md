# 上游源码基线

本仓库以 [Mayx980/Toonflow-app](https://github.com/Mayx980/Toonflow-app) 的 `master` 提交 `d2e94aca7b59659ff6b4ca15f03cf134ec7f0e1d` 为源码基线，接入目标为 GitLab `yuxin.ma/ai-studio`。对应 [Issue #6](https://git.aimall-tech.com/yuxin.ma/ai-studio/-/issues/6)。

868 个上游文件按原路径引入，除根 README 追加本仓开发入口外，源码、配置、锁文件、许可证与上游开发资料保持原字节和文件模式。新增的本仓资料仅为本文件和[开发流程](development.md)。

按人工决定，原 `main` 的需求文档及 Issue #4 旧计划不带入当前树，历史仍保存在 Git。当前不以旧 PRD 或旧 UIUX 改造 Toonflow；后续优化以这份上游基线为起点。

## 当前工程边界

- 保留 `apps/`、`compat/`、`packages/` 和根目录工作区配置，不重定位代码、不拆包、不改 UI 或业务行为。
- 不添加 Port/Scenario 双 composition、隔离 Preview、占位 Facts、自动测试模块或额外 CI job。原生启动与构建入口见[上游开发说明](../docs/development.md)。
- 尚未建立覆盖原生目录的 wf-prod Project Facts；现有 closed schema 的路径限制无法直接表示 `apps/`、`compat/`。树分类的限制不代表上游源码丢失，也不声明已满足标准目录或隔离 Preview 规范。
- 当前没有本仓 Intent、System、Contract 业务基线；上游 README 与代码中的已有功能不作为旧 PRD 已验收的证据。
- `.github/workflows/` 是保留的上游 GitHub Actions 配置，在 GitLab 中不自动运行；当前未添加 GitLab CI、版本发布或生产部署链路。桌面、移动端和签名/发布仍需要相应平台、工具及独立授权。
- 上游 MIT 许可证和版权声明见 [LICENSE](../LICENSE)。上游 `AGENTS.md`、贡献约定、原有文档保留原样。

实际验证命令、结果、环境限制及独立审核记录集中写在本次 MR；文档中的命令存在不代表已经执行或通过。
