# 使用 wf-prod 开发

[返回项目首页](../README.md) · [来源与接入边界](upstream.md) · [源码运行与扩展](../docs/development.md) · [贡献约定](../CONTRIBUTING.md)

本仓保留上游 Toonflow 的工程结构、UI 和业务实现。环境、依赖安装、开发、构建及平台打包命令以原生[开发说明](../docs/development.md)和各组件脚本为准；当前没有独立 Scenario Preview，也没有 GitLab 发布链路。

## 需求与修改

可以先讨论目标和问题；讨论本身不授权修改。需要本地试验时明确要求快速修改；需要正式交付时，用 `wf-prod-intake` 提供目标和范围，确认完整候选后建立 Issue。已有清晰普通 Issue 时，用 `wf-prod-implement` 绑定该 Issue。集中交付多个来源时分别使用 `wf-prod-intake-batch` 与 `wf-prod-implement-batch`。

当前接入由 `wf-prod-onboard` 和 [Issue #6](https://git.aimall-tech.com/yuxin.ma/ai-studio/-/issues/6) 承载，后续优化以引入的上游版本为起点另行确定。不把当前代码等同于旧需求已实现，也不隐式升级目录和 UI 架构。

## 工作区与验证

源码修改、依赖安装、构建及人工验证都在启动会话的同一工作区串行进行。正式任务使用 `issue/<IID>` 分支，完成后交付一个 MR；不直接写默认分支，不更改其它工作区。

遵循[项目开发约定](../AGENTS.md)。开发可显式运行现有类型检查、构建和必要的手动验证，不新增测试模块、测试框架或自检入口。验证持久化行为时使用隔离数据目录，不覆盖真实用户配置；不要提交 `data/`、模型密钥、签名凭证或本机构建产物。模型生成需要另行配置服务，不以编译通过代替生成能力已实测。

当前版本尚未完成标准化 Project Facts 和隔离 Scenario Preview。后续正式实施先核对该任务真正依赖的事实和缺口，不伪造受管路径、不为绕过检查建立第二套实现；确需结构调整时先明确目标和范围。

## Review、合并与恢复

Agent 在同一 source 上完成已授权修改、实际检查和独立审核，MR 写明检查结果与未验证项。最终 MR 由人工 review 和合并；代码已推送、构建通过与生产上线是不同结果。

任务中可直接补充、提问，或说“停一下”“继续”。重要范围变更记录到原 Issue；例行进度不建新对象。新会话恢复时提供原 Issue；接入任务使用 `wf-prod-onboard #6` 绑定原对象，不重复建单。只读诊断可用 `wf-prod-issue-check`。上述能力名用于识别宿主中的 Skill，不是 shell 命令。

## 版本与部署

上游 `.github/workflows/` 在本 GitLab 项目中不自动执行。上游本地构建、容器和更新服务说明仍保留，但本次接入未发布 tag、制品或部署环境。需要发布版本时明确绑定仓库与提交，使用 `wf-prod-release`；上线、签名和数据库操作分别确认其对象和影响，不从开发授权推导生产操作。
