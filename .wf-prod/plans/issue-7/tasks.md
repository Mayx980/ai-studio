# Issue #7 Tasks：独立账号修订候选

本表随 [plan.md](plan.md) 审阅。本版实施项均未开始，勾选不替代功能验收、独立 review 或人工确认。此前工程结构、共享 Server 及修复提交保留在 Git 历史，不因本次修订撤销。

| 顺序 | 完整场景及可观察结果 | 主要位置 | 依赖与验证安排 |
| --- | --- | --- | --- |
| 1 | 初始管理员接管：在未初始化实例通过容器本地受控命令建立首个管理员；旧项目、资产、模板、会话与 Key 原位保留并只归该账号；重复运行不重置、不重复认领 | `services/server/scripts/createAdmin.ts`（拟新增）、`utils/accounts/`（拟新增）、`utils/conf/index.ts`、`ops/buildStandalone.ts`、`ops/readme.md` | 人工确认本版后执行；临时数据中手动保存业务资料，核对首次、重复、失败/重启及原文件保持；不操作目标机数据卷 |
| 2 | 真实登录：未登录直接访问业务 API 返回 401；用户名密码正确才获得会话，错误返回统一提示；登录失败有限速；刷新恢复当前身份，Cookie/密码不进入业务 JSON、URL 或日志 | `services/server/src/app.ts`、`lib` 与 `routes/auth/`（拟新增）、`utils/accounts/`、Web `ports`/production adapter、`bootstrap.ts`、`router/index.ts`、`pages/login/index.vue` | 1；手动 HTTP 与浏览器核对匿名访问、错误/正确密码、Cookie、CSRF、过期会话、缓存响应和启动顺序 |
| 3 | 账号管理：管理员创建普通账号、停用/启用及重置密码；用户只能改自己的密码；停用、改密/重置使原会话失效；不能停用最后一个有效管理员，无公开注册或用户删除 | Server `routes/accounts/`、`utils/accounts/`（拟新增）、Web `accountMenu.vue` 与 `components/accountManagement.vue`（拟新增） | 2；分别以管理员、普通用户直接调用接口和操作页面，检查强制改密、权限拒绝、并发重名与保存失败 |
| 4 | 各自创作：A 和 B 登录后列表/项目/资产/模板/对话完全独立；B 猜到 A 的真实目录、素材 URL、项目/会话 ID 仍不能读写；各自重启后可恢复 | `utils/studio.ts`、`utils/workspace/*`、`utils/assets/index.ts`、相关 routes、Web `sharedState.ts`、`workspace.ts`、`assets.ts` 与模板/对话消费者 | 1–2；临时数据及双上下文覆盖正向读写、跨用户绝对路径/相对路径/符号链接拒绝、Range、复制/下载和旧资料继承 |
| 5 | 各自配置与生成：每个账号只读到自己的模型状态，保存保持/清除只影响自己的 Key；模型列表、余额、价格、Agent 和节点调用不得借用另一用户配置 | `utils/conf/*`、`utils/ai/*`、`utils/media/*`、`utils/marketplace.ts`、`routes/settings/*`、`routes/providers/*`、Web `serverApiSettings.vue` 及模型 Store | 2、4；HTTP 核对脱敏及独立保存/缓存；无配置用户不能用管理员 Key；真实生成依赖各自有效 Key，无 Key 列未实测 |
| 6 | 切换与后台：切画布继续生成且结果归原账号/项目；其他账号不能停止、回答或订阅该任务；退出/改密后旧请求失去授权，晚到响应不灌入新账号 | `agent/runtime`、`agent/bridge`、`utils/singleAgent`、余额/事件流、Web `accountMenu`、请求 adapter、生成/会话/素材缓存 | 2、4–5；双上下文手动核对会话 ID、事件流、任务停止权；真实供应商过程仅在有效 Key 明确发送时验证 |
| 7 | 减少无关冲突：当前项目选择/视图不再混入服务端全量项目索引；A/B 分别创建和保存不互相产生全局 revision 冲突；同账号旧画布保存仍 409 且保留内容 | Web `workspace.ts`、`sharedState.ts`、项目打开/关闭入口；Server 索引读写及冲突文案 | 4；不同账号并行保存，同账号两个标签页先后保存，确认无静默覆盖；不做跨用户实时协作或盲目合并 |
| 8 | 关闭旁路：普通用户不能安装/编辑/调试服务端可执行插件或修改宿主配置；多用户 standalone 不开放未绑定用户的设备互联、外部 MCP/A2A 入口 | `app.ts`、`index.ts`、插件/provider/debug/settings routes、`mcp`、`mobileLink`、`agent/a2a`、Web 设置入口 | 2、5–6；实际路由逐个核对授权分类，直接 HTTP/独立监听端口验证拒绝；不以按钮隐藏当鉴权；原生本机模式按构造参数保留并列未实测平台 |
| 9 | Scenario 与界面：登录失败可恢复、表单有可访问名称和密码自动填充；退出先处理保存，再清用户缓存；同浏览器换账号不显示前用户数据，其他标签页同步退出 | Web `composition`、`scenarios/studio.ts`、`ports`、登录/账号组件、Store 与缓存模块 | 2–8；复用同页面，Scenario 内存无 API/外部请求；生产双账号往返、键盘及窄屏手动检查，不新增模拟生产成功 |
| 10 | 保存和交付：产品、系统、协议、源码和运行说明一致；构建输出含初始化入口；唯一 MR 提供实际证据、恢复步骤与未验项 | 当前文档、`frontend/web/uiux_manifest.md` 与 Facts（只在实际入口/依赖改变时）、原 source/MR | 以上全部；既有 typecheck/build/聚合构建、隔离增量 review；目标机 Compose/真实 Key/原生打包交人工后续验收，不生产部署 |

产品追溯：1 对应旧资料归管理员；2–3 对应真实独立登录；4–6、8–9 对应服务端隔离全部直接与间接访问；7 保留原 `SC-conflicting-save` 并解决不同账号索引互相影响；10 延续 `SC-reopen-project`、模型脱敏和项目/资产/模板/教学回归。账号新增场景索引见 [outline](../../../requirements/outline.md)。

已完成本轮只读调查、确认范围与旧数据归属、记录 note 131174，并保存本候选文档。未建立账号、未修改业务代码、未操作测试机文件、未运行账号功能验收；完整实施仍等对本版的明确确认。
