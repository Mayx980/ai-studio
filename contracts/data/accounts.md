# 独立账号数据与认证

server提供认证，web经Port消费。本版按Issue #7 [note 132070](https://git.aimall-tech.com/yuxin.ma/ai-studio/-/issues/7#note_132070)取消网站管理员，替代原先的管理员建号和旧资料接管要求。真实数据库、OSS和双账号环境验收尚未执行。

## 身份、数据和SQL维护

- 运维通过SQL创建、启停及重置登录账号，网站不提供管理账号、公开注册、提权或删除用户接口。离线userSql入口生成SQL，随机UUID、规范化用户名、显示名称及Argon2id密码哈希由同版本代码生成；实际执行及数据库授权由操作者负责，见[运行手册](../../ops/database.md)。
- 用户名3–64位ASCII字母/数字/点，首位为字母或数字，存为小写且全局唯一；显示名1–80字符。密码15–128字符，不截断，不要求无意义组合；用户界面支持粘贴、密码管理器和显示密码。
- schema v1历史role/legacyRoot列保留以避免无关DDL迁移，新账号固定user/0；服务端始终返回普通用户身份，文件根统一为users/<userId>/，任何列值不授予网站管理员或实例旧根。旧测试资料不自动导入、删除或重新分配。
- 单条users INSERT即可建立账号。正确密码验证后，登录事务锁定并重验用户启用状态/authVersion，幂等建立缺失的空userSettings和creationStates，再创建Session；任一步失败整体回滚，不覆盖已有资料，错误密码不产生个人记录。
- 首次及SQL重置的密码要求先改密；SQL重置/启停递增authVersion，重置不自动启用停用账号。本人改密撤销其全部会话。SQL维护工具不读取配置或连接数据库，不产生管理员初始化、旧资料导入或绕过schema的入口。

账号和Session唯一来源为MySQL，模型凭据加密、个人配置及索引由[database](database.md)维护。数据库错误、缺表或写入失败明确503，不报告匿名/新实例，不回退JSON或重建表。

## 会话及HTTP安全

使用12小时opaque Session，HttpOnly、SameSite=Lax、Path=/ Cookie；HTTPS公开Origin启用Secure。数据库仅存随机token的SHA-256摘要、userId、authVersion、expiresAt及CSRF材料。密码、原Key、完整Cookie和配置秘密不进入URL、业务文件或日志。直接内网HTTP不提供传输加密，不盲信转发头。

业务请求要求Cookie身份与x-afxen-user一致（媒体标签使用account查询项），这些值只比较、不据此选择账号；写入/生成另验证Origin与x-afxen-csrf。登录本身验证Origin，响应禁止共享缓存。强制改密完成前仅会话、改密、退出可用。匿名仅可读取无敏感信息的health及登录/会话入口。

多用户模式不提供网站管理员；插件/Provider/全局技能源码写入、调试、宿主控制及未绑定用户的MCP/A2A/设备互联旁路始终拒绝，由可信部署运维处理。取消管理员不把这些能力开放给普通用户。明确的原生local模式保留原宿主流程，HTTP请求不能选择local。

失败按来源IP与规范化用户名限制为每15分钟10次，密码哈希/验证共用最多4个并发，记录最多一万项；不信任任意X-Forwarded-For。401为身份失效，403为来源/CSRF/能力拒绝，409为名称或版本冲突，429为限速。DB故障不伪装密码错误。

## 当前接口

统一响应`{code,data,message}`，已登录用户仅返回id、username、name、role（固定user）、enabled、mustChangePassword。

| 方法与路径 | 输入 | data |
| --- | --- | --- |
| GET /api/auth/session | 无 | mode=users/local、user或null；登录时有csrf |
| POST /api/auth/login | username、password | user、mode、csrf，设置HttpOnly Cookie |
| POST /api/auth/logout | 空对象 | 撤销当前会话并清Cookie |
| PUT /api/auth/password | previous、password | 修改本人密码、撤销全部会话；不接受目标用户ID |

原/api/accounts/list、create、update、resetPassword路由已移除；多用户中间件对该前缀拒绝，不能通过旧客户端继续管理账号。

## 生命周期和验收

长连接每5秒复核启用状态、authVersion及Session，失权或DB不可用关闭；已接受任务保存到原owner，不借用新账号Key。退出、改密、SQL重置/停用后旧会话不能写入。跨标签页身份变化取消页面请求并遮蔽旧内容，保留未保存草稿的明确处理；Scenario不接触真实Cookie或生产广播。

验收分别核对SQL创建后的首次登录/改密、已有个人记录不覆盖、无效密码不初始化、SQL重置/启停版本失效、移除的管理接口与实例能力拒绝、双账号文件/媒体/配置/对话隔离、同账号CAS及DB故障。代码检查或Scenario通过不表示真实环境已通过。配套恢复撤销全部旧Session，见[数据库运维手册](../../ops/db/runbook.md)。
