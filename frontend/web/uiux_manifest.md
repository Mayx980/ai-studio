# Web 工程接入说明

## 端

本次登记既有 `web` entity，复用 [PRD](../../requirements/prd.md)描述的浏览器入口；不新分配产品端 ID。AFXEN 创作交互复用已合入的原型，正式数据与模型传输由真实账号的Server承接。原生端共享同一 Web 页面工程。

## 通用约束

| 项 | 当前约束 |
| --- | --- |
| 可访问性 | 保留既有键盘交互、控件标签、焦点和对话框行为；本次不重新设计视觉。 |
| 国际化 | 沿用 `@toonflow/i18n`、浏览器语言和现有语言字典，合成场景不携带用户正文或密钥。 |
| RTL | 沿用现有实现；本次没有完成全端 RTL 验收。 |
| 响应式 | 保留现有 Web 与移动宿主适配；原生平台构建需在对应平台验证。 |

## 设计边界

生产和 Scenario 共用 `src/bootstrap.ts`、路由、页面和组件；入口由 Vite mode 在构建时选择。页面及状态只消费 `src/ports/`，生产 HTTP/流适配位于 `src/adapters/production/`。Scenario Provider 直接提供内存展示数据，不导入生产适配层、HTTP 客户端或真实服务配置。

创作宿主由 `src/ports/prototype.ts` 声明，生产组装使用服务端工作区和固定资产/模板库，模型请求复用 NodeAiPort；旧 IndexedDB、内存 Key 和演示账号不进入正式主流程。隔离组装拒绝真实文件保存与模型调用，不读取旧浏览器业务数据。接口与共享边界见 [Contract](../../contracts/readme.md)。

账号场景 `login`、`initialPassword`、`accountPassword`复用同一登录和本人改密组件；网站账号管理菜单和场景已移除，失败操作保持内存态且不执行真实账号写入、不进入生产广播通道。基础场景 `empty`、`loading`、`error`、`permission`、`formValidation` 的进入方式见[Preview](../previewGuide.md)。当前覆盖首页及“我的项目 → 导入项目”的目录选择器接入链路；分页、真实模型生成、媒体处理、支付及完整业务页面场景尚未覆盖，不能以预览启动当作这些能力验收。

## 待确认问题

| 问题 | 状态 | 责任入口 |
| --- | --- | --- |
| 共享服务端与供应商的实际验收 | open | Issue #7 同一 source/MR |

## 修订记录

| 日期 | 摘要 |
| --- | --- |
| 2026-11-09 | 迁移工程并为现有页面分离生产与隔离场景入口。 |

## 云平台 1.0 补充场景

新增管理／用户角色场景，替代上文“网站账号管理菜单和场景已移除”的旧范围说明；需求依据为 Issue #7 notes 132580、132672 和当前人工确认。平台管理员提交模板，取消用户投稿。

| scenario | 路由 | 可观察范围 |
| --- | --- | --- |
| platformAdmin | `#/admin` | 客户、账号、模型授权、连接、模型参数预览、模板、通知和用量统计；仅内存演示 |
| customerAdmin | `#/home?section=accounts` | 本客户普通账号管理、账号详情与临时密码；无跨客户入口 |
| cloudUser | `#/home?section=messages`、`#/home?section=assets` | 个人消息未读／已读、生成任务六种状态与恢复操作；无管理入口 |
| platformError | `#/admin` | 查询失败及重试，不展示保存成功 |
| login | `#/login` | platform／customer／user 三角色示例登录，临时密码123456，首次必须改密 |
| initialPassword | `#/login` | 强制改密与退出，改密完成前直接访问业务路由仍被阻止 |

新增平台业务 Port 的生产入口明确返回尚未接通，不连接未定义端点；这些场景不验证真实账户、模型、云端上传、任务恢复或永久保留。现有原生画布及阶段式专业助手保持；具体规则见 [共享交互设计](designs/creationExperience.md#云端双端与客户权限10-补充)。

默认预览及显式 `empty` 场景先展示登录页，支持选择三类演示角色，首次改密后进入相应端；用户中心支持退出和切换账号，不再要求手工拼接角色 URL 才能找到账号管理。
