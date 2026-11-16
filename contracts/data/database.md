# 用户数据数据库合同

本设计属于 `server` 的数据合同，对应 Issue #7 独立账号方案增加数据库的本轮决定。本版已由 note 131807 确认并接入源码；本文不授权操作环境数据库，实际连接和业务验收另行交接。账号认证规则见 [accounts](accounts.md)，配置兼容见 [settings](settings.md)，现有文件协议见 [studio](studio.md)。

## 采用范围及唯一来源

采用 MySQL 8.4 LTS / InnoDB，已确认协议兼容目标为 `mysql 8.4`，唯一目标见 [NFR](../../architecture/nfr.md)，运维profile由该目标派生。SQL、类型、约束和运维行为须符合该目标，不能以连接成功代替兼容验证。

| 数据 | 唯一来源 | 用户边界 |
| --- | --- | --- |
| 账号、角色、启用状态、密码哈希和认证版本 | `users` | 用户 ID 由服务端分配；规范化用户名唯一；最小 admin/user 角色及最后管理员保护 |
| Session 摘要、CSRF 校验材料、有效期 | `sessions` | 关联 users；随机 token 只在 Cookie，数据库不存明文 token |
| 个人设置及模型元数据 | `userSettings` | 每用户一份版本化设置；不含明文 API Key；普通设置保持完整覆盖语义 |
| 模型 API Key | `providerSecrets` | 按用户、供应商与类型唯一；加密保存，使用时只在所属用户的服务端调用中解密 |
| 项目列表、草稿业务索引、资产标签及来源元数据 | `creationStates` | 兼容现有 stores 结构，每用户独立 revision，当前项目视图不作为共享业务字段 |
| 个人模板目录、已移除展示记录等库索引 | `libraryStates` | 按用户和库类型保存有版本的记录，个人模板不自动公开 |
| 运维备份摘要 | `backupCatalog` | 固定同库备份的摘要及创建时间，仅维护账号使用，不对应用授权 |
| 结构版本与数据导入记录 | `schemaMigrations`、`dataImports` | 仅维护和迁移使用，不能通过普通业务接口修改 |
| 媒体归属、逻辑位置与存储引用 | `mediaFiles` | 当前用户身份、逻辑位置和revision唯一；OSS对象键不可变，local明确关联尚未迁移的旧媒体，精确约束见 [媒体合同](mediaStorage.md) |
| 新图片、视频、音频及缩略图内容 | 公司HTTP云存储 | 通过Server授权读写；数据库仅保存引用和已验证属性，不保存媒体BLOB |
| 画布、对话、模板JSON、旧本地媒体与可信插件 | 现有文件卷 | 保留原格式与文件路径；用户文件仍按当前登录用户授权，可信执行代码归实例管理 |

用户子表关联 `users`，唯一键和修改条件都包含用户身份；只有账号表的用户名和 Session token 摘要采用必要的全局唯一约束。下文给出v1完整DDL，由同版本运维包显式初始化；应用启动只核对版本和表存在，不执行DDL。

## 凭据及连接

密码继续采用 Bun Argon2id 哈希。供应商 Key 使用 Node 内置加密能力做认证加密，保存密文、独立随机 nonce、校验 tag 和密钥版本；根加密密钥保存在应用侧受限 secret 文件，不能入数据库、Git、镜像或日志。密钥缺失/不匹配必须失败，不能自动重新生成并覆盖已有密文。部署管理员及其可信代码仍是受信任主体，不宣称防御服务器已被授权的任意执行。

连接配置采用未跟踪的 secret 文件；应用使用只访问本业务库的 DML 账号，初始化/升级使用单独的维护账号，不让普通请求具备 DDL 权限。日志、错误及健康响应不回显连接串、SQL 参数、密码、原始 Key 或加密材料。旧 settings.json 中的历史明文不会被本文自动删除，加密入库不代表旧备份已经消除明文；原文件按敏感迁移材料保管，停止运行时读取后才能另行按授权处理。

## 并发、文件与失败

复用 Bun `SQL` 的参数化查询、显式事务和连接池，禁止拼接外部输入为 SQL。Session 建立/撤销、账号状态与认证版本变化、设置与供应商凭据保存，以及库索引 CAS 分别在所属事务内完成。密码哈希在事务外计算，提交时重验认证版本。所有修改必须带服务端身份条件，不能只按客户端提供的记录 ID 更新。

索引接口继续使用服务端返回的 64 位小写 revision；保存使用用户 ID 和 expectedRevision 条件更新，零行更新且记录已变化时返回 409，不无条件覆盖。内容摘要由确定的写入序列化产生并保存，读取直接回显，不因 MySQL JSON 字段格式重排另算版本。同账号多页面保留旧版本保护，不自动合并；不同账号不再共用一个全局记录。

数据库事务不包含文件系统或OSS。云媒体先上传新对象，再以事务发布媒体记录/索引；上游HTTP没有物理删除，失败处理和逻辑删除见 [mediaStorage](mediaStorage.md)，不得把未发布对象报为已清理。项目/模板复制先写本次独占的文件，再在事务中发布索引；文件失败不发布，事务失败只清理能证明属于本次未发布对象的文件，不能删除源或已有资料。无法清理时报告保留位置和未完成状态。删除项目列表项仍保留原文件。资产文件与元数据失败分别披露，不能把落盘但未登记的部分报告为完整保存成功。

数据库断连、超时、权限或结构版本错误明确返回服务不可用/初始化未完成，不回退原 JSON、不重建空库、不误报账号不存在，也不触发供应商重试。死锁或失败事务回滚；本版不做无条件自动重试，不重提付费生成请求。应用进程中的文件锁及任务仍保持单实例限制，不能因为引入数据库就扩多个写实例。

## 旧数据接管与版本迁移

已有共享索引和配置只由显式接管流程读取：维护窗口停止旧写入，先核对同版本数据卷备份；首次管理员初始化/接管在数据库事务中建立管理员、导入现有设置/凭据与项目/资产/模板索引，并登记来源和完成状态。初始管理员关联旧文件根，其他账号为独立用户根。现有索引路径和每份 JSON 结构须先验证，非法、冲突或不完整资料明确失败，不能忽略后宣称全部接管。

接管事务成功后，业务元数据只从数据库读取，旧 JSON 保持原样、只作迁移来源或敏感备份；不双写、不逐次读取失败再偷偷回退。重复执行须核对既有接管记录、目标状态及来源，已完成则不重新分配、覆盖密码/Key或重复插入；来源或目标不符时停止并报告。数据库已有账号时不允许重认领旧根。取消或事务失败不登记半完成管理员或半份索引。

DDL 初始化/升级与业务资料导入分开：MySQL DDL 不作可随业务事务整体回滚的承诺。采用有版本的前向变更、逐步记录与验证，部分结构失败先诊断，不删库重建或自动降级。支持的初始化/升级起点、备份、恢复、核验和重新执行策略由 [数据库运行方案](../../ops/database.md) 及后续同版本运维包明确交付。

## 验证边界

计划安排双账号、同账号双页面、DB 重启/断连、唯一冲突、事务失败、旧数据重复导入和恢复后会话撤销的手动验证。媒体 Range、跨用户文件边界、缓存/任务 owner 和通用设置脱敏仍逐项核对。未执行任何环境数据库连接或数据操作；数据库结构/导入验证须使用已确认的临时开发目标及获准操作，目标机与生产执行另行绑定。

## 版本1精确结构

字段和索引均区分大小写；用户ID为服务端UUID，用户名在入库前小写。时间均为Unix毫秒无符号BIGINT。所有表InnoDB，文本默认utf8mb4_0900_bin，标识/摘要另用ascii_bin。外键均RESTRICT，不通过删除用户级联丢失资料。应用最大JSON为16 MiB，媒体为100 MiB。

凭据AAD由 `[userId, kind, providerId]` 的JSON元组编码；AES-256-GCM的nonce为12字节、tag为16字节。只有active媒体的locationHash等于pathHash，其他状态为NULL；唯一键防止同用户逻辑位置被并发占用。schemaMigrations的shape存初始化时已核对结构的规范化CHECK表达式，后续表检查比较；不接受自行修改版本标记来跳过差异。

```sql
CREATE TABLE `schemaMigrations` (
  `version` int unsigned NOT NULL,
  `digest` char(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `shape` json NULL,
  `appliedAt` bigint unsigned NOT NULL,
  PRIMARY KEY (`version`)) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin;

CREATE TABLE `users` (
  `id` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `username` varchar(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `name` varchar(80) NOT NULL,
  `role` enum('admin','user') NOT NULL,
  `enabled` tinyint unsigned NOT NULL DEFAULT 1,
  `passwordHash` varchar(255) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `authVersion` bigint unsigned NOT NULL DEFAULT 1,
  `mustChangePassword` tinyint unsigned NOT NULL DEFAULT 1,
  `legacyRoot` tinyint unsigned NOT NULL DEFAULT 0,
  `createdAt` bigint unsigned NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniqUsersUsername` (`username`),
  CONSTRAINT `chkUserEnabled` CHECK (enabled in (0,1)),
  CONSTRAINT `chkUserPasswordChange` CHECK (mustChangePassword in (0,1)),
  CONSTRAINT `chkUserLegacyRoot` CHECK (legacyRoot in (0,1)),
  CONSTRAINT `chkUserAuthVersion` CHECK (authVersion >= 1)) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin;

CREATE TABLE `sessions` (
  `tokenHash` char(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `userId` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `authVersion` bigint unsigned NOT NULL,
  `csrf` char(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `expiresAt` bigint unsigned NOT NULL,
  PRIMARY KEY (`tokenHash`),
  KEY `idxSessionsUserExpires` (`userId`,`expiresAt`),
  KEY `idxSessionsExpiry` (`expiresAt`),
  CONSTRAINT `fkSessionsUser` FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin;

CREATE TABLE `userSettings` (
  `userId` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `payload` json NOT NULL,
  `revision` bigint unsigned NOT NULL DEFAULT 1,
  PRIMARY KEY (`userId`),
  CONSTRAINT `fkUserSettingsUser` FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `chkSettingsRevision` CHECK (revision >= 1)) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin;

CREATE TABLE `providerSecrets` (
  `userId` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `providerId` varchar(128) NOT NULL,
  `kind` enum('text','media') NOT NULL,
  `keyVersion` varchar(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `nonce` binary(12) NOT NULL,
  `ciphertext` varbinary(8192) NOT NULL,
  `tag` binary(16) NOT NULL,
  PRIMARY KEY (`userId`,`providerId`,`kind`),
  CONSTRAINT `fkProviderSecretsUser` FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin;

CREATE TABLE `creationStates` (
  `userId` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `payload` json NOT NULL,
  `revision` char(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  PRIMARY KEY (`userId`),
  CONSTRAINT `fkCreationStatesUser` FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin;

CREATE TABLE `libraryStates` (
  `userId` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `library` enum('assets','templates') NOT NULL,
  `name` varchar(128) NOT NULL,
  `content` longtext NOT NULL,
  `revision` char(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `deleted` tinyint unsigned NOT NULL DEFAULT 0,
  PRIMARY KEY (`userId`,`library`,`name`),
  CONSTRAINT `fkLibraryStatesUser` FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `chkLibraryDeleted` CHECK (deleted in (0,1)),
  CONSTRAINT `chkLibraryJson` CHECK (json_valid(content))) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin;

CREATE TABLE `mediaFiles` (
  `id` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `userId` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `logicalPath` varchar(4096) NOT NULL,
  `pathHash` char(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `locationHash` char(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
  `storageKind` enum('local','oss') NOT NULL,
  `bucket` varchar(255) NULL,
  `object` varchar(1024) NULL,
  `mimeType` varchar(128) NOT NULL,
  `size` bigint unsigned NOT NULL,
  `revision` char(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `status` enum('pending','active','retired','deleted') NOT NULL,
  `createdAt` bigint unsigned NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniqMediaLocation` (`userId`,`locationHash`),
  KEY `idxMediaPath` (`userId`,`pathHash`),
  KEY `idxMediaDirectory` (`userId`,`status`,`createdAt`),
  CONSTRAINT `fkMediaFilesUser` FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `chkMediaSize` CHECK (size between 1 and 104857600),
  CONSTRAINT `chkMediaLocation` CHECK ((status = 'active' and locationHash is not null and locationHash = pathHash) or (status <> 'active' and locationHash is null)),
  CONSTRAINT `chkMediaStorage` CHECK ((storageKind = 'local' and bucket is null and object is null) or (storageKind = 'oss' and bucket is not null and object is not null))) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin;

CREATE TABLE `dataImports` (
  `id` varchar(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `userId` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `sourceDigest` char(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `completedAt` bigint unsigned NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idxImportsUser` (`userId`),
  CONSTRAINT `fkDataImportsUser` FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin;

CREATE TABLE `backupCatalog` (
  `id` varchar(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `digest` char(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `createdAt` bigint unsigned NOT NULL,
  PRIMARY KEY (`id`)) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_bin;

```

`backup*`副本由维护操作CREATE TABLE LIKE创建，复制以上9张业务/迁移表的数据，不复制backupCatalog自身；不把同库副本当作异机灾备。当前版本没有旧SQL结构升级路径，update核对精确v1后返回无待改动并verify/readback；不自动修复漂移。
