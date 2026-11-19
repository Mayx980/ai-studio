# Issue #7：SQL维护账号与现有服务部署

本轮在已交付的 `issue/7@7b508b5f10fe636e2db075eb3fb2ed41880c28b0` 上按 [note 132070](https://git.aimall-tech.com/yuxin.ma/ai-studio/-/issues/7#note_132070) 的明确实施决定修订。既有HTTP云存储、MySQL个人配置及文件/会话隔离成果保留；本计划不代表真实环境已经验收。

## 目标、对象和约束

- 同一项目 `yuxin.ma/ai-studio`、Issue #7、source `issue/7`、target `main` 和唯一 MR !7；不新建分支、重写历史或修改默认分支。
- 取消网站管理员及账号管理界面/HTTP接口。运维通过SQL维护登录账号，网站保留登录、本人改密、退出和个人数据隔离。
- 复用现有MySQL和公司HTTP OSS，只部署一个应用容器；不再默认部署MySQL容器/卷，不改APISIX职责。应用业务文件仍须持久保存，测试环境可从空目录开始，不实际删除旧资料。
- 保留Bun/Express/TypeScript/Vue、统一文件入口、Port及同页面Scenario、Argon2id、CSRF、会话撤销、个人配置加密、同账号CAS和文件边界。不新增测试或自检模块、框架、CI入口、ORM或服务框架。
- 本轮不连接实际数据库/OSS，不执行DDL、账号SQL、目标部署、数据接管或恢复；不approve/merge或关闭Issue。

## 已核实的实现及兼容取舍

当前管理员同时承担网站账号管理和实例可执行资源权限。删除管理员不能把插件安装/调试、全局技能写入或宿主目录授予所有用户：多用户模式始终拒绝这些操作，可信local模式继续按原宿主能力运行。

当前首次创建普通账号还建立userSettings和creationStates；仅INSERT users会导致认证后读取个人资料失败。因此在密码校验成功并锁定用户行的登录事务内，幂等初始化缺失的空个人记录；已有内容不覆盖。SQL创建用户后即可登录，不需要初始化管理员或由运维拼接多表业务事务。

schema v1的role和legacyRoot历史列暂保留，避免为取消网站管理额外引入DDL迁移；新账号SQL固定user/0，运行时不再由这些历史列赋予管理员或旧实例根权限，文件根统一为users/<id>。旧测试资料不自动导入，不为兼容旧管理员恢复特权。

账号SQL由离线userSql入口生成：隐藏输入密码并用Bun Argon2id计算哈希，输出创建、重置、停用/启用SQL供运维在自己的数据库工具执行。它不接数据库，不保存明文密码，不再需要maintenance.json或createAdmin。重置/启停递增authVersion，使旧Session立即失效；首次/重置密码仍要求用户改密。

### Task 1: 去除管理员并打通SQL账号首次登录

Consumes：当前accounts/context、认证路由、工作区根及全局技能写入边界。修改services/server/src/utils/accounts/、agent/skills/index.ts；删除routes/accounts四个管理接口并用现有routes命令重新生成router。删除createAdmin入口，新增scripts/userSql.ts，更新既有构建。

Produces：仅普通身份的会话、本人改密、受控系统能力拒绝、幂等空配置/创作索引、离线SQL输出。验证成功登录事务不会覆盖已有记录、错误密码不初始化、重置/停用版本失效、SQL文字正确转义；不使用真实数据库或新增测试代码。

### Task 2: 简化用户中心与隔离场景

依赖Task 1的AccountsPort。去除账号管理菜单、Port管理方法及生产调用；账号组件只保留三项密码表单，沿用标签、显示密码、提交loading、错误保留、关闭确认及成功重新登录。设置中的实例管理面在所有多用户账号下隐藏。

保留login/accountPassword场景，去除已删除的accountManagement场景；生产与Scenario仍共用页面且不接真实业务。局部图稿位于frontend/web/designs/accountAccess.svg，配套设计沿creationExperience.md维护，不改创作页布局或品牌。

### Task 3: 交付单应用容器和SQL运维说明

依赖Task 1。ops/compose.yaml仅保留应用，外部MySQL地址由受限database.json配置；画布/对话文件使用明确应用数据目录，OSS地址和bucket通过环境变量填写。数据库schema仍由现有ops/db包在操作者自己的目标显式初始化，不把DDL绑定应用启动。

更新ops/database.md、readme/storage导航、源码说明，以及受影响产品/系统/账号/数据库合同与内部设计；给出创建用户、重置/启停、初始化、密钥生成、权限及31230端口部署步骤。历史schema列、旧资料不接管、无真实环境验证和单实例限制如实说明。存量tasks.md仅修订冲突安排，不产生第二份当前方案。

### Task 4: 检查、独立审核和原MR交付

先运行services/server现有routes；执行Server和Web现有typecheck、根build:server及Web build:scenario、数据库运维包config-check及git diff --check。共享包未改，仅按真实公开类型依赖扩大必要检查；不执行根聚合typecheck来替代已知可靠包入口。

适用时在同页面隔离Scenario手动核对登录失败、本人改密和用户中心已无账号管理，记录浏览器可用性和未验范围。手动执行离线userSql输入/输出，不执行生成SQL，不声明真实账号/DB/OSS通过。

按已选择wf-prod-implement-plus对本轮完整增量做隔离正确性和验证审核，验真并修复复审。复用旧合法成果，不重做历史原型或工程迁移。检查与审核闭合后提交推送原issue/7，更新唯一MR !7，保留真实环境及仍受基线限制的检查缺口；不进行实际部署或最终合并。
