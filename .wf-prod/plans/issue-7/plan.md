# Issue #7 修订计划：公司HTTP云存储、独立账号与MySQL

本版在 `352aad9` 的数据库候选上按 [note 131794](https://git.aimall-tech.com/yuxin.ma/ai-studio/-/issues/7#note_131794) 优先补齐公司HTTP云存储，仍待对本版明确确认后实施。保留已批准的共享Server成果，不把新候选当作已实现。新增数据库的决定见 [note 131340](https://git.aimall-tech.com/yuxin.ma/ai-studio/-/issues/7#note_131340)；独立账号范围和旧数据归属已由 [note 131174](https://git.aimall-tech.com/yuxin.ma/ai-studio/-/issues/7#note_131174) 确认；沿用 [note 128562](https://git.aimall-tech.com/yuxin.ma/ai-studio/-/issues/7#note_128562) 的先审阅计划约定。本版不能作为账号功能已完成或已通过验收的证明。

## 对象、保留成果与本次变化

- 项目：`yuxin.ma/ai-studio`；[Issue #7](https://git.aimall-tech.com/yuxin.ma/ai-studio/-/issues/7)；唯一 source 为 `issue/7`，target 为 `main`，继续使用 [MR !7](https://git.aimall-tech.com/yuxin.ma/ai-studio/-/merge_requests/7)。
- 本版修订基于 source `352aad9f9ee740af9df153cb4545c745d419b366`，target 为 `8679f4192fa8fa7fa6e811f3d06ace42ccd6ce5c`。保留共享服务端接线及设备轮询、内网 HTTP UUID、文件日志修复，不重做原型合入或工程迁移。
- 原型来源仍为人工已合入的 `issue-design/7@2dea9eee5529659cf9723bca4e82ca9bab7c4b8d`，设计基线 `309eb5a43f9cc029edcf3d6d4a91c0d51fd0ed33`；不吸收第二轮设计，不整体承接 #4。
- 本次将原计划中的“实例共享、不新增账号”改为真实登录及按用户隔离。旧共享项目、资产和 API Key 归初始管理员；新账号从空工作区开始。对话、历史、模板和模型结果随其所属项目或用户隔离，避免从旁路泄露。
- 继续沿用 Bun/Express、统一文件入口、Port 与同页面 Scenario，不新增测试/自检模块、框架、CI 自动测试入口；不增加 SSO、开放注册、跨用户共享或实时协作、持久任务队列、成片合成，不执行生产部署或最终 MR approve/merge。

## 核实到的真实影响

`studioState.json`、资产库和设置目前按实例保存；前端 `sharedState.ts` 的 revision 及保存队列只保护当前页面。`workspace.ts` 还把当前项目和列表放在同一持久键中。不同页面触发 409 是过期快照保护，不能靠移除校验解决。

真实账号不能复用 `prototypeAccount.ts` 的演示身份。启动阶段目前先读取设置和模型，必须调整为先验证服务端会话。服务端全局 `conf`、模型初始化、余额订阅、Agent 会话和桥接 pending map 也必须核对归属；只改项目目录不够。插件源码安装/调试会执行服务端代码，普通用户必须被服务端拒绝，不能只隐藏按钮。

## 设计依据及取舍

系统范围见 [architecture](../../../architecture/architecture.md) 的“独立账号修订目标”；账号数据与认证规则见 [accounts](../../../contracts/data/accounts.md)，创作索引和凭据变化分别见 [studio](../../../contracts/data/studio.md)、[settings](../../../contracts/data/settings.md) 的候选补充。服务端内部方案唯一保存在 [accountIsolation](../../../services/server/designs/accountIsolation.md)；界面变化见 [creationExperience](../../../frontend/web/designs/creationExperience.md) 的“正式账号接入候选”，运行和初始化见 [ops](../../../ops/readme.md)。数据库数据范围、事务和接管规则见 [database](../../../contracts/data/database.md)，Compose 与运维交付见 [数据库运行方案](../../../ops/database.md)。云存储的外部协议、唯一数据来源、用户授权、缺失能力与删除提议见 [mediaStorage](../../../contracts/data/mediaStorage.md)，环境/文件配置和恢复见 [storage](../../../ops/storage.md)。上述候选均待本版确认后落地。

按本轮明确要求增加独立数据库服务。候选选择 MySQL 8.4 LTS / InnoDB，协议兼容目标为 `mysql 8.4`，待本版人工确认后写入 NFR。账号、Session、个人设置、模型凭据及项目/资产/模板/媒体索引入库；新图片/视频/音频与缩略图拟存公司HTTP云存储，画布、对话、模板JSON及旧媒体仍留原卷。当前只确认先解决云存储，不顺带批准或实施此前讨论的画布/对话入库。复用 Bun 1.3.14 已核实存在的 `SQL` 与 `Bun.password`，采用参数化查询、事务、按用户 CAS 和 Argon2id，不增加 ORM、Redis 或第二服务框架。选择独立数据库符合本轮决定，并为账号/索引并发提供事务和约束；SQLite 或继续 JSON 不满足这次独立数据库服务的选择。新增成本为 DB 容器、独立卷、维护账号及备份/版本演进，均纳入本次交付。

系统 conf 单例继续保存可信宿主设置；个人设置改为数据库事实，加载到当前认证上下文后供现有同步消费者使用，按用户和配置版本刷新缓存，不能为每用户再创建 conf 文件。模型 Key 加密入库，根加密密钥由应用侧受限 secret 文件保存。请求与后台任务沿用 AsyncLocalStorage 方式捕获身份及目录，不每请求改全局目录或供应商。数据库不能事务化磁盘文件或OSS：先完成本次新对象/文件写入，再发布SQL记录与索引；上传成功但SQL失败单独报告，HTTP缺物理删除时不得伪称回滚已清理云对象。具体方案由相应设计唯一维护。

## 实施安排与依赖

1. 审阅并确认本版设计与 Tasks，包括HTTP云存储删除提议、`mysql 8.4` 协议兼容目标及下述工具命名例外；未确认前仅保存文档。
2. 优先完成配置化的HTTP媒体适配与逻辑路径/媒体记录契约：复用真实GET/POST、Range与错误体规则，不引入Go、gRPC或新存储服务；实际持久链路依赖后续账号/SQL边界，不能单独把无鉴权OSS开放给浏览器。
3. 在同一主仓完成 schema、版本化运维包、Compose 与应用 SQL 接入材料；数据库操作只在实际目标另行获准后执行，不由本次计划确认推导连接或迁移环境权限。
4. 完成数据库账号/会话、服务端授权及个人数据读取。旧索引与配置通过显式事务接管给初始管理员，原文件保留；成功切换后只读数据库元数据，不双写或失败回退 JSON。
5. 接通前端登录、账号管理、退出和用户状态清理；当前项目视图与持久索引分离，保留同账号 revision 和所有文件冲突保护。
6. 核对后台任务、事件流、高权限旁路、数据库故障和文件/DB 部分失败；按许可完成双账号及恢复验证后交独立审查，目标机执行仍由人工或独立获准入口完成。

存量任务文件继续原位维护；本轮云存储新增任务及完整行为、位置和完成依据见 [tasks.md](tasks.md)。所有改动仍在同一 source/MR。现有共享服务端代码已保存不表示 #7 所有产品验收均已完成；本次回归受影响创作链路，真实供应商和目标机验收分别交接。

## 验证与交付

- 文档阶段：核对人工决定、真实storage HTTP文档/路由、配置可后填、200错误体、Range、MIME和删除/签名能力缺口，以及数据库选型、唯一数据来源、接管与恢复、任务依赖、相对链接、actual diff 及命名例外候选；不声称已连接数据库或完成账号功能。
- 实现阶段：路由变化先 `bun run --cwd services/server routes`，再执行 Server 的 `typecheck`、`build`；Web 执行 `typecheck`、`build`、`build:scenario`。检查受影响公开包的既有命令，最后运行根 `bun run build:server` 核实聚合输出及管理员初始化入口。
- 实现中先执行不连接数据库的运维包生成/conformance 和实际 schema 静态核对；需要连接的开发验证使用独立获准的临时数据库目标与数据目录，不读取真实测试/生产配置，不使用临时测试代码。验收覆盖 DB 断连/重启、唯一约束、CAS、事务回滚、旧资料接管重复/失败和备份恢复；再用两个独立浏览器上下文及同账号两个标签页核对：认证、登录失败限速、CSRF、登出/改密失效、管理员账号操作、跨用户文件/配置/会话拒绝、不同用户并行保存、同用户旧版本冲突、Range 媒体读取、服务重启及旧资料继承。不得连接或修改测试机真实数据卷，不写临时测试代码。
- 真实模型：只有各自用户明确发送才调用各自凭据；任务结果和停止权归发起用户。缺有效 Key 时保留未实测项，不伪造供应商成功，不为验证自动收费重试。
- Scenario：复用同一登录/创作页面，内存身份与展示数据不访问真实 API、工作区或供应商；不将内存切换说成生产鉴权通过。UI 实现时按适用 Skill 审视实际页面，本轮没有界面实现。
- 交付前 fresh 核对同一 MR、HEAD 和必要 checks；按实际增量做隔离安全、正确性及验证审查。旧审查与有效检查按输入影响复用；未完成项如实报告，MR 不因本计划转 Ready。

候选确认后才实现。交付保留实际命令/结果、未实测项，以及数据库+文件卷+云对象+凭据加密密钥的配套备份恢复说明。Compose 增加内部 MySQL 服务和 mysqlData 卷，沿用既有应用端口及 appData；不映射数据库端口、不改 APISIX、不执行目标机部署。应用暂仍为单个可写实例，数据库不解除文件锁和任务单进程限制。

新增数据库运维包存在工具强制名称，限定命名例外的完整路径见 [ops/database.md](../../../ops/database.md)；现有 AGENTS 尚未允许这些路径。本版把该例外与数据库协议目标合并交人工审阅，批准前不创建固定工具文件或写 NFR 目标，不以旧 Facts/UIUX 例外推导授权。

## 本轮云存储的明确取舍与待审项

- 保留Bun/TypeScript；参考Go封装的业务职责，但采用已核实公司storage的HTTP接口，不直接调用Go SDK，不建Go旁路。外部仓库只读调查，不修改其协议或部署。
- 服务地址、bucket、可选prefix由配置文件或Compose环境变量后填，环境变量优先；缺失、非法或配置文件不可读时明确不可用，不填猜测地址，也不静默降级写本地。当前源码不支持拟定配置，实施后才给出可执行配置示例。
- 当前外部HTTP只有multipart POST保存、GET读取及单段Range；没有物理DELETE、GetAccessURL或GetUploadInfo HTTP操作。上传成功必须200且空响应，非空JSON错误不能误判成功；代理按实际媒体元数据修正MIME。
- 首版建议云媒体删除解除当前用户业务关联并保留仍被引用内容，暂不物理清理云对象。这是待本版明确确认的回收行为；若要求立即物理删除，须先取得真实HTTP删除合同，不改外部storage或擅自切换gRPC。
- Browser经本项目授权媒体入口读取；普通用户不能选bucket/object/origin。无鉴权OSS须限制网络可达范围，可绕过应用直接访问时不能宣称用户资料保密。模型引用不发送容器内网URL，按已有适配器的真实传输能力处理。
- 新媒体以SQL映射指向云对象，旧local记录保留原文件、校验与路径边界；不自动迁移、删除或覆盖旧资料。复制以新键建立独立媒体并核对引用后发布，不能依赖源项目的可变对象。
- 本轮只修订文档，未配置地址/bucket、未访问真实OSS、未上传/下载/删除媒体、未连接数据库或更改Compose/业务代码。外部联调交后续获准目标；不新增测试或自检代码。
