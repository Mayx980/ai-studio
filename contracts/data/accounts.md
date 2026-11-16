# 独立账号数据与认证

所属 entity 为 `server`，调用方为 `web`。需求依据为 Issue #7 [note 131174](https://git.aimall-tech.com/yuxin.ma/ai-studio/-/issues/7#note_131174)。本版已按 note 131807 接入源码；真实环境与双账号业务验收尚未执行。

## 身份和数据

- 服务端分配不可变随机用户 ID；用户名规范化后唯一，显示名不能用作磁盘目录或授权依据。角色仅 `admin`、`user`；可信管理员管理账号与实例可执行扩展，普通用户管理自己的资料。停用替代删除，本版无开放注册或跨用户分享。
- 依据本轮增加数据库的决定，账号和会话改由 MySQL 中的 users/sessions 保存，事务及数据唯一来源见 [database](database.md)；不再采用 accounts.json。密码只保存 Argon2id 哈希；会话仅保存高熵随机 token 的 SHA-256 摘要、用户 ID、有效期、认证版本及 CSRF 校验材料，不保存明文 token 或密码。数据库错误、缺表、权限异常或写入失败不能重建空表、回退匿名/JSON 或报告成功。
- 用户记录含用户名、显示名、角色、启用状态、密码哈希、认证版本、强制改密标记及创建时间。管理员创建/重置的密码要求首次登录改密，改密完成前只允许会话、改密和退出操作。密码采用 15–128 字符，允许粘贴和密码管理器，不作无意义组合限制或截断。
- Session 有效期为登录后 12 小时；登录及权限/密码变化轮换会话。退出撤销当前会话，停用、改密和管理员重置撤销该用户全部旧会话。跨标签页不能因 Cookie 换成另一账号就继续写旧页面草稿。
- 初始管理员是唯一允许引用实例旧文件位置的账号；该关联由受控初始化建立，不接受客户端提交。其它账号的文件根为 `users/<userId>/`，只保存 workspaces、assets、templates 等业务文件；个人配置、索引、账号和会话按 [数据库合同](database.md) 保存，不能另建个人配置/索引文件或故障回退来源。系统插件与账号记录不属于用户可访问目录。

## HTTP 安全边界

沿用 `{ code, data, message }` 与 Zod 校验。新增接口在 `routes/auth/` 和 `routes/accounts/` 按单接口单文件定义，下表为当前接口；实现与文档保持同一语义。

认证使用服务端 opaque Session 与 `HttpOnly; SameSite=Lax; Path=/` Cookie；HTTPS 部署启用 `Secure`。当前内网 HTTP 可用于测试，不能宣称密码和 Cookie 具有链路保密性。只信明确配置的可信代理/公开地址，不因任意请求伪造转发头认定安全连接。Cookie 不进入 localStorage/sessionStorage，登录、配置和个人业务响应禁止共享缓存。

除登录与必要的会话状态外，所有业务 API 默认要求登录。修改和生成请求校验同源、会话绑定的 CSRF token 及账号身份；登录本身也校验来源；最小服务健康接口可匿名访问，但不返回配置或用户信息。媒体标签 GET 使用同源 Cookie，读取仍核对 owner 并保留 Range；不能为了媒体播放放开匿名目录。账号 ID、角色、绝对路径、旧演示身份或任意自定义 header 均不能证明权限。

前端每次业务请求携带页面已加载的身份标识，服务端只将其用于与 Cookie 身份比较，绝不据此选择用户。两者不一致返回 401 并拒绝操作；媒体 URL 同样有身份一致性校验。初始化、登录和改密的窄范围例外由明确路由控制，不提供“任意账号操作”参数。

登录错误统一提示，避免暴露账号是否存在；按来源和规范化账号限制失败尝试与并发密码哈希数，记录和过期清理有上限。限速不信任未配置代理的 `X-Forwarded-For`。401 表示未认证、会话失效或身份改变；403 表示操作无权/CSRF 拒绝；409 保留同名和 revision 冲突；429 表示暂时限速。错误、日志和管理列表不返回密码哈希、Session 摘要、CSRF 材料或原始 Key。

## 兼容和验收

受控本地初始化只在没有账号时创建首个管理员并建立旧数据归属；不对外提供“谁先打开谁成为管理员”的入口。重复执行失败而不重置旧密码或重新分配资料；初始化与登录不能因旧数据缺失而初始化第二套共享资料。备份和恢复包含数据库、相关文件卷及凭据加密密钥，密码/会话与项目备份不入 Git。DB 不可用返回明确 503，不能误报密码错误或当新实例再初始化。

不同用户不能查询、修改或借用对方项目、素材、模板、对话、模型凭据、任务和事件流。同用户多页面保留冲突保护；服务重启保留账号与未过期会话，用户停用/改密之后旧会话仍无效。文件安全和密码参数的实际校验以实现与手动验证分别证明，文档不表示已通过。

## 当前账号接口

均使用同源Cookie，修改接口还需x-afxen-csrf；已登录业务请求需x-afxen-user与当前Cookie身份一致（媒体标签用account查询项，不能据此选择账号）。响应统一 `{code,data,message}`。

| 方法与路径 | 输入 | data |
| --- | --- | --- |
| GET /api/auth/session | 无 | mode=users/local、user或null；已登录时有csrf |
| POST /api/auth/login | username、password | user、mode、csrf，并设置HttpOnly Cookie |
| POST /api/auth/logout | 空对象 | 无；撤销当前会话、清Cookie |
| PUT /api/auth/password | previous、password | 无；修改当前用户密码并撤销全部会话 |
| GET /api/accounts/list | 无，管理员 | 最多1000个账号，超限413不截断 |
| POST /api/accounts/create | username、name、password，管理员 | 服务端生成id，普通角色，强制改密 |
| PUT /api/accounts/update | id、enabled，管理员 | 无；最后有效管理员不能停用 |
| PUT /api/accounts/resetPassword | id、password，管理员 | 无；强制改密、撤销该用户全部会话 |

user仅含id、username、name、role、enabled、mustChangePassword。用户名3–64位ASCII字母/数字/点，首位字母或数字，入库小写；显示名1–80字符。无升级角色、公开注册或删除用户接口。密码15–128字符。失败按IP和规范用户名限每15分钟10次，密码校验最多4个并发，记录最多一万项。实际代理下共享出口可能共用IP限速，不采信任意X-Forwarded-For。

长连接每5秒复核当前会话，失权或DB不可用关闭订阅；已接受媒体任务独立保留原owner，退出后不借用新账号凭据。前端身份变化取消页面请求并遮蔽旧内容，跨标签页仅生产组装广播；Scenario不接触真实Cookie或广播通道。
