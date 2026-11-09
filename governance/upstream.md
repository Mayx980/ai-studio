# 上游源码基线

本仓库以 [Mayx980/Toonflow-app](https://github.com/Mayx980/Toonflow-app) 的 `master` 提交 `d2e94aca7b59659ff6b4ca15f03cf134ec7f0e1d` 为源码基线，接入目标为 GitLab `yuxin.ma/ai-studio`。对应 [Issue #6](https://git.aimall-tech.com/yuxin.ma/ai-studio/-/issues/6)。

初次接入在 Issue #6 / MR !4 保留了 868 个上游文件及原有许可证和资料，该提交仍可由 Git 历史回读。后续 Issue #7 已建立独立产品规格；当前工程迁移按该 Issue 的明确决定在原 `issue/7` 分支推进，不恢复旧原型或覆盖上游历史。

## 当前工程边界

- 依 [note 129227](https://git.aimall-tech.com/yuxin.ma/ai-studio/-/issues/7#note_129227)，将原 `apps/`、`compat/` 和 UI 包迁入 `frontend/`、`services/`；非 UI 包保留在 `packages/`，聚合构建与容器文件归 `ops/`，同步修正引用和工作区配置。
- 真实入口、归属和包内依赖登记在 [Project Facts](../facts/project.yaml)。所有单元采用 `project_observed`，不隐式切换 Bun 或升级生产架构。
- 页面和生产行为保持原有实现，增加 Port 及独立场景组装；唯一 [Preview](../frontend/preview/readme.md) 只提供隔离展示，不连接真实模型或用户数据。未新增测试模块、自检入口或 CI job。
- [需求](../requirements/readme.md)、[系统基线](../architecture/readme.md)与[现有协议入口](../contracts/readme.md)分别说明目标、工程组成和当前接口；登记并不表示 #7 产品增量完成。
- `.github/workflows/` 保留上游 GitHub Actions 配置，在 GitLab 不自动运行；当前未添加 GitLab CI、版本发布或生产部署。平台、签名和发布要求见[源码手册](../docs/sourceDevelopment.md)。
- 上游 MIT 许可证和版权声明见 [LICENSE](../LICENSE)，贡献与原有开发资料保留有效内容。

实际验证、环境限制和独立审核结果写在本次 MR。根源码手册与流程指南各自保留唯一职责，不复制命令为第二份来源。
