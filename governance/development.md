# 使用 wf-prod 开发

[返回项目首页](../README.md) · [来源与接入边界](upstream.md) · [源码运行与扩展](../docs/sourceDevelopment.md) · [贡献约定](../CONTRIBUTING.md)

本仓保留上游 Toonflow 的业务实现，并按 Issue #7 的明确决定迁移工程结构、登记真实 Project Facts。环境、依赖安装、开发、构建及平台打包命令以原生[开发说明](../docs/sourceDevelopment.md)和各组件脚本为准；隔离场景入口见 [Preview](../frontend/previewGuide.md)，当前没有 GitLab 发布链路。

## 需求与修改

可以先讨论目标和问题；讨论本身不授权修改。需要本地试验时明确要求快速修改；需要正式交付时，用 `wf-prod-intake` 提供目标和范围，确认完整候选后建立 Issue。已有清晰普通 Issue 时，用 `wf-prod-implement` 绑定该 Issue。集中交付多个来源时分别使用 `wf-prod-intake-batch` 与 `wf-prod-implement-batch`。

初次上游引入已由 Issue #6 完成；当前工程升级由 `wf-prod-onboard` 在原 [Issue #7](https://git.aimall-tech.com/yuxin.ma/ai-studio/-/issues/7) / `issue/7` 分支承载。人工已在远端合入设计原型，本次恢复保留该历史并修正其接入缺口；工程接入不宣称共享服务端产品功能完成。

## 工作区与验证

源码修改、依赖安装、构建及人工验证都在启动会话的同一工作区串行进行。正式任务使用 `issue/<IID>` 分支，完成后交付一个 MR；不直接写默认分支，不更改其它工作区。

遵循[项目开发约定](../AGENTS.md)。开发可显式运行现有类型检查、构建和必要的手动验证，不新增测试模块、测试框架或自检入口。验证持久化行为时使用隔离数据目录，不覆盖真实用户配置；不要提交 `data/`、模型密钥、签名凭证或本机构建产物。模型生成需要另行配置服务，不以编译通过代替生成能力已实测。

工程入口、依赖和物理归属见 [Project Facts](../facts/project.yaml)，代码单元均为 `project_observed`。后续实施按实际改动检查所需设计与业务合同，不把目录登记、类型检查或预览健康回读当作产品功能已完成。

## Review、合并与恢复

Agent 在同一 source 上完成已授权修改、实际检查和独立审核，MR 写明检查结果与未验证项。最终 MR 由人工 review 和合并；代码已推送、构建通过与生产上线是不同结果。

任务中可直接补充、提问，或说“停一下”“继续”。重要范围变更记录到原 Issue；例行进度不建新对象。新会话恢复时提供原 Issue；接入任务使用 `wf-prod-onboard #7` 绑定原对象，不重复建单。只读诊断可用 `wf-prod-issue-check`。上述能力名用于识别宿主中的 Skill，不是 shell 命令。

## 版本与部署

上游 `.github/workflows/` 在本 GitLab 项目中不自动执行。上游本地构建、容器和更新服务说明仍保留，但本次接入未发布 tag、制品或部署环境。需要发布版本时明确绑定仓库与提交，使用 `wf-prod-release`；上线、签名和数据库操作分别确认其对象和影响，不从开发授权推导生产操作。
