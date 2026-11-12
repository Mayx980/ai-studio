# Issue #7 修订计划：独立账号与用户数据隔离

本版是待人工审阅的候选，尚未获准实施。范围和旧数据归属已由 [note 131174](https://git.aimall-tech.com/yuxin.ma/ai-studio/-/issues/7#note_131174) 确认；沿用 [note 128562](https://git.aimall-tech.com/yuxin.ma/ai-studio/-/issues/7#note_128562) 的先审阅计划约定。本版不能作为账号功能已完成或已通过验收的证明。

## 对象、保留成果与本次变化

- 项目：`yuxin.ma/ai-studio`；[Issue #7](https://git.aimall-tech.com/yuxin.ma/ai-studio/-/issues/7)；唯一 source 为 `issue/7`，target 为 `main`，继续使用 [MR !7](https://git.aimall-tech.com/yuxin.ma/ai-studio/-/merge_requests/7)。
- 调查时 source 为 `40ef191d04e16c23d53f7fba024fece12a64360d`，target 为 `8679f4192fa8fa7fa6e811f3d06ace42ccd6ce5c`。保留共享服务端接线及设备轮询、内网 HTTP UUID、文件日志修复，不重做原型合入或工程迁移。
- 原型来源仍为人工已合入的 `issue-design/7@2dea9eee5529659cf9723bca4e82ca9bab7c4b8d`，设计基线 `309eb5a43f9cc029edcf3d6d4a91c0d51fd0ed33`；不吸收第二轮设计，不整体承接 #4。
- 本次将原计划中的“实例共享、不新增账号”改为真实登录及按用户隔离。旧共享项目、资产和 API Key 归初始管理员；新账号从空工作区开始。对话、历史、模板和模型结果随其所属项目或用户隔离，避免从旁路泄露。
- 继续沿用 Bun/Express、统一文件入口、Port 与同页面 Scenario，不新增测试/自检模块、框架、CI 自动测试入口；不增加 SSO、开放注册、跨用户共享或实时协作、持久任务队列、成片合成，不执行生产部署或最终 MR approve/merge。

## 核实到的真实影响

`studioState.json`、资产库和设置目前按实例保存；前端 `sharedState.ts` 的 revision 及保存队列只保护当前页面。`workspace.ts` 还把当前项目和列表放在同一持久键中。不同页面触发 409 是过期快照保护，不能靠移除校验解决。

真实账号不能复用 `prototypeAccount.ts` 的演示身份。启动阶段目前先读取设置和模型，必须调整为先验证服务端会话。服务端全局 `conf`、模型初始化、余额订阅、Agent 会话和桥接 pending map 也必须核对归属；只改项目目录不够。插件源码安装/调试会执行服务端代码，普通用户必须被服务端拒绝，不能只隐藏按钮。

## 设计依据及取舍

系统范围见 [architecture](../../../architecture/architecture.md) 的“独立账号修订目标”；账号数据与认证规则见 [accounts](../../../contracts/data/accounts.md)，创作索引和凭据变化分别见 [studio](../../../contracts/data/studio.md)、[settings](../../../contracts/data/settings.md) 的候选补充。服务端内部方案唯一保存在 [accountIsolation](../../../services/server/designs/accountIsolation.md)；界面变化见 [creationExperience](../../../frontend/web/designs/creationExperience.md) 的“正式账号接入候选”，运行和初始化见 [ops](../../../ops/readme.md)。上述候选均待本版确认后落地。

账号与会话复用 `@toonflow/file` 的协调锁和原子 JSON 保存，密码使用已核实存在的 Bun 1.3.14 `Bun.password` Argon2id；不新增数据库服务、依赖或认证框架。选择依据是当前面向内部使用、单进程及既有文件持久化：新增账号记录和会话是必要业务数据，复用文件原语足够；引入 SQLite 或独立数据库会新增存储和运维路径，本版没有多副本写入或大规模会话查询需求。文件方案仅承诺同一进程的协调与失败保护，后续多进程部署须另行设计，不能直接扩副本。

用户配置实例在现有 conf 模块按用户 ID 缓存创建，系统配置保持独立；请求和后台任务复用项目现有 AsyncLocalStorage 使用方式捕获身份。新增身份上下文用于实际的跨异步调用归属，不能每个请求改全局数据目录或全局供应商变量。具体边界与失败策略见服务端设计，不在 Plan 复制第二份实现。

## 实施安排与依赖

1. 审阅并确认本版设计与 Tasks；未确认前仅保存文档。
2. 完成初始管理员建立、登录会话及路由授权，再接通个人配置和路径解析；未登录请求不得先加载业务数据。
3. 旧资料原位归初始管理员，新账号使用独立根；逐项切换项目/资产/模板/对话及模型配置的读写和缓存。
4. 接通前端登录、账号管理、退出与用户状态清理；修正当前项目视图与持久索引的混存，不删除旧 revision 保护。
5. 核对所有后台任务、事件流和高权限操作，完成双用户并发保存及越权拒绝验证，再交独立审查。

完整行为、位置和完成依据见 [tasks.md](tasks.md)。所有改动仍在同一 source/MR。现有共享服务端代码已保存不表示 #7 所有产品验收均已完成；本次回归受影响创作链路，真实供应商和目标机验收分别交接。

## 验证与交付

- 文档阶段：核对人工决定、设计/任务一致性、相对链接、actual diff 和命名；不声称已完成登录或隔离验证。
- 实现阶段：路由变化先 `bun run --cwd services/server routes`，再执行 Server 的 `typecheck`、`build`；Web 执行 `typecheck`、`build`、`build:scenario`。检查受影响公开包的既有命令，最后运行根 `bun run build:server` 核实聚合输出及管理员初始化入口。
- 开发手动验证使用临时数据目录、两个独立浏览器上下文及同账号两个标签页：认证、登录失败限速、CSRF、登出/改密失效、管理员账号操作、跨用户文件/配置/会话拒绝、不同用户并行保存、同用户旧版本冲突、Range 媒体读取、服务重启及旧资料继承。不得连接或修改测试机真实数据卷，不写临时测试代码。
- 真实模型：只有各自用户明确发送才调用各自凭据；任务结果和停止权归发起用户。缺有效 Key 时保留未实测项，不伪造供应商成功，不为验证自动收费重试。
- Scenario：复用同一登录/创作页面，内存身份与展示数据不访问真实 API、工作区或供应商；不将内存切换说成生产鉴权通过。UI 实现时按适用 Skill 审视实际页面，本轮没有界面实现。
- 交付前 fresh 核对同一 MR、HEAD 和必要 checks；按实际增量做隔离安全、正确性及验证审查。旧审查与有效检查按输入影响复用；未完成项如实报告，MR 不因本计划转 Ready。

候选确认后才实现。交付保留命令与实际结果、未实测协议、数据备份/恢复说明；部署继续沿用现有 31230 到 3000 的映射和 appData 卷，由人工在目标环境执行。
