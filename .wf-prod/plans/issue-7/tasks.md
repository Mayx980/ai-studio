# Issue #7 Tasks：HTTP云存储、独立账号与数据库修订候选

本表随 [plan.md](plan.md) 审阅。本版实施项均未开始，勾选不替代功能验收、独立 review 或人工确认。此前工程结构、共享 Server 及修复提交保留在 Git 历史，不因本次修订撤销。

| 顺序 | 完整场景及可观察结果 | 主要位置 | 依赖与验证安排 |
| --- | --- | --- | --- |
| 0a | 优先建立公司HTTP媒体边界：配置文件/环境变量后填；GET/POST multipart file、200空成功与JSON错误体、Range、MIME和取消处理明确；无Go/gRPC/新OSS服务 | `contracts/data/mediaStorage.md`、`ops/storage.md`、`services/server/src/utils/mediaStorage/`（拟新增）、`utils.ts`、启动配置及相关production adapter | 本版先审阅；保存媒体记录依赖0、1–2；既有Server类型/构建检查，不连接真实OSS，不新增测试/自检；目标联调后续核对缺配置、200JSON错误、超时、100MiB与单段Range |
| 0 | 数据库交付：明确 mysql 8.4 协议目标；交付真实表结构、数据库接入、Compose 内部服务/卷、版本化运维和健康入口；缺 DB/schema 时明确失败，不自动改表/删库或回退 JSON | `contracts/data/database.md`、`architecture/nfr.md`（确认后新增）、`utils/database/`、`ops/compose.yaml`、`ops/db/` 及其真实 Facts（确认后实现） | 本版协议目标及固定命名例外先审阅；先做不连接数据库的生成/conformance/构建，实际连接、DDL、备份与恢复只在目标另行获准后执行，完整运维不能只验连通性 |
| 1 | 初始管理员接管：在未初始化实例通过容器本地受控命令建立首个管理员；旧项目、资产、模板、会话与 Key 原位保留并只归该账号；旧索引/设置/Key 经显式事务入库，原文件只读保留；重复运行不重置、不重复认领 | `services/server/scripts/createAdmin.ts`（拟新增）、`utils/accounts/`（拟新增）、`utils/conf/index.ts`、`ops/buildStandalone.ts`、`ops/readme.md` | 依赖0及目标数据库操作许可；临时数据中手动保存业务资料，核对首次、重复、失败/重启及原文件保持；不操作目标机数据卷 |
| 2 | 真实登录：未登录直接访问业务 API 返回 401；用户名密码正确才获得会话，错误返回统一提示；登录失败有限速；刷新恢复当前身份，Cookie/密码不进入业务 JSON、URL 或日志 | `services/server/src/app.ts`、`lib` 与 `routes/auth/`（拟新增）、`utils/accounts/`、Web `ports`/production adapter、`bootstrap.ts`、`router/index.ts`、`pages/login/index.vue` | 1；手动 HTTP 与浏览器核对匿名访问、错误/正确密码、Cookie、CSRF、过期会话、缓存响应和启动顺序 |
| 3 | 账号管理：管理员创建普通账号、停用/启用及重置密码；用户只能改自己的密码；停用、改密/重置使原会话失效；不能停用最后一个有效管理员，无公开注册或用户删除 | Server `routes/accounts/`、`utils/accounts/`（拟新增）、Web `accountMenu.vue` 与 `components/accountManagement.vue`（拟新增） | 2；分别以管理员、普通用户直接调用接口和操作页面，检查强制改密、权限拒绝、并发重名与保存失败 |
| 4 | 各自创作：A 和 B 登录后列表/项目/资产/模板/对话完全独立；B 猜到 A 的真实目录、素材 URL、项目/会话 ID 仍不能读写；各自重启后可恢复；索引/库/媒体记录只读数据库，JSON与旧local文件保持原格式，媒体SQL记录和用户边界先就绪；新媒体完整OSS链路由4a交付，跨用户不能凭逻辑路径或object获得内容 | `utils/studio.ts`、`utils/workspace/*`、`utils/assets/index.ts`、SQL媒体映射、统一媒体实现及相关 routes、Web `sharedState.ts`、`workspace.ts`、`assets.ts` 与模板/对话消费者 | 1–2；临时数据及双上下文覆盖正向读写、跨用户绝对路径/相对路径/符号链接拒绝、Range、复制/下载和旧资料继承 |
| 4a | 云媒体完整链路：本地上传、Agent/节点生成保存、参考读取、历史/资产预览下载、项目/模板独立复制统一使用同一逻辑路径映射；成功上传后才发布SQL，失败不误报且不落回本地 | `utils/media/generation.ts`、`utils/media/priceReference.ts`、`utils/assets/index.ts`、`utils/workspace/*`、`agent/assets.ts`、实际图片编辑/FFmpeg消费者、Web文件/媒体production adapter及相关ports | 0a、0、1–2、4；核对所有间接文件消费者及等价实现，运行受影响既有包检查；联调交接复制/引用、200错误体、Range、SQL冲突/失败、旧local兼容、无鉴权旁路网络条件；HTTP无物理删除，删除提议待本版确认 |
| 5 | 各自配置与生成：每个账号只读到自己的模型状态，事务保存保持/清除只影响自己的加密 Key；模型列表、余额、价格、Agent 和节点调用不得借用另一用户配置 | `utils/conf/*`、`utils/ai/*`、`utils/media/*`、`utils/marketplace.ts`、`routes/settings/*`、`routes/providers/*`、Web `serverApiSettings.vue` 及模型 Store | 2、4、4a；HTTP 核对脱敏、加解密、缺密钥失败及事务保存/缓存；无配置用户不能用管理员 Key；真实生成依赖各自有效 Key，无 Key 列未实测 |
| 6 | 切换与后台：切画布继续生成且结果归原账号/项目；其他账号不能停止、回答或订阅该任务；退出/改密后旧请求失去授权，晚到响应不灌入新账号 | `agent/runtime`、`agent/bridge`、`utils/singleAgent`、余额/事件流、Web `accountMenu`、请求 adapter、生成/会话/素材缓存 | 2、4–5；双上下文手动核对会话 ID、事件流、任务停止权；真实供应商过程仅在有效 Key 明确发送时验证 |
| 7 | 减少无关冲突：当前项目选择/视图不再混入服务端全量项目索引；A/B 分别创建和保存只更新各自 SQL 记录，使用用户+版本 CAS，不互相产生全局 revision 冲突；同账号旧画布保存仍 409 且保留内容 | Web `workspace.ts`、`sharedState.ts`、项目打开/关闭入口；Server 索引读写及冲突文案 | 4；不同账号并行保存，同账号两个标签页先后保存，确认无静默覆盖；不做跨用户实时协作或盲目合并 |
| 8 | 关闭旁路：普通用户不能安装/编辑/调试服务端可执行插件或修改宿主配置；多用户 standalone 不开放未绑定用户的设备互联、外部 MCP/A2A 入口 | `app.ts`、`index.ts`、插件/provider/debug/settings routes、`mcp`、`mobileLink`、`agent/a2a`、Web 设置入口 | 2、5–6；实际路由逐个核对授权分类，直接 HTTP/独立监听端口验证拒绝；不以按钮隐藏当鉴权；原生本机模式按构造参数保留并列未实测平台 |
| 9 | Scenario 与界面：登录失败可恢复、表单有可访问名称和密码自动填充；退出先处理保存，再清用户缓存；同浏览器换账号不显示前用户数据，其他标签页同步退出 | Web `composition`、`scenarios/studio.ts`、`ports`、登录/账号组件、Store 与缓存模块 | 2–8；复用同页面，Scenario 内存无 API/外部请求；生产双账号往返、键盘及窄屏手动检查，不新增模拟生产成功 |
| 10 | 保存和交付：产品、系统、协议、源码和运行说明一致；构建输出含管理员接管入口、真实 schema/运维包；DB+文件+云对象+密钥的备份恢复边界可操作；唯一 MR 提供实际证据、恢复步骤与未验项 | 当前文档、`frontend/web/uiux_manifest.md` 与 Facts（只在实际入口/依赖改变时）、限定命名的 AGENTS 修订、原 source/MR | 以上全部；既有 typecheck/build/聚合构建、运维包 conformance、隔离增量 review；目标机 Compose/真实 Key/原生打包交人工后续验收，不生产部署 |

产品追溯：0 对应本轮新增独立数据库要求；1 对应旧资料归管理员；2–3 对应真实独立登录；4–6、8–9 对应服务端隔离全部直接与间接访问；7 保留原 `SC-conflicting-save` 并解决不同账号索引互相影响；10 延续 `SC-reopen-project`、模型脱敏和项目/资产/模板/教学回归。账号新增场景索引见 [outline](../../../requirements/outline.md)。

已完成本轮只读调查、确认范围与旧数据归属、记录 note 131174、数据库决定 note 131340及本轮HTTP云存储决定 note 131794，并保存本候选文档。未建立账号/数据库、未连接或迁移环境数据、未修改业务代码、未操作测试机文件、未运行账号功能验收；完整实施仍等对本版的明确确认。

数据库专项验收：两个用户并发修改各自记录互不覆盖；同用户旧 revision 仍409；唯一账号冲突与 Session 撤销原子生效；故意中止接管事务不留下半份身份/索引；DB 重启/断连返回503且草稿保留；旧 JSON 不再作为运行回退；文件成功而数据库失败时只补偿本次未发布对象；数据库、文件及密钥配套恢复后重验 owner/凭据。恢复反例采用“先备份，再退出/改密/停用，再恢复较早备份”：保持流量隔离，开放前撤销全部恢复 Session 并核对账号状态/必要改密，原 Cookie 必须401，不能以恢复后再主动退出代替。当前仅为验证安排，不声称已有运行结果，也不新增临时测试代码。

云存储专项交接：0a先完成协议和配置适配，4a接入完整媒体行为；地址和bucket后填，不因此阻断配置化源码与构建交付，但实际联调保持未执行。当前HTTP无物理删除/签名链接/表单直传凭据，不能以Go同名方法、空实现或猜测endpoint冒充支持。云删除先逻辑解除关联的提议随本版审阅；旧数据上云、外部storage改造与实际数据操作未授权。画布/对话入库不在本轮新增任务，避免扩大当前云媒体范围。
