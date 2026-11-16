# 非功能要求

| 指标 | 目标 | 说明 |
| --- | --- | --- |
| 数据库协议兼容目标 | mysql 8.4 | Issue #7 已确认，使用 InnoDB、utf8mb4；不声明兼容 MySQL 8.0 或 MariaDB |
| 应用写入实例 | 1 | 继续使用既有文件锁及进程内任务，不支持多个应用进程共同写卷 |
| 单份媒体上限 | 100 MiB | 上传、供应商结果及云端完整读取统一限制 |
| 个人配置及创作索引 | 每份16 MiB | 数据库故障明确失败，不回退共享JSON或静默覆盖 |
| 浏览器与上游存储 | 由Server授权代理 | 无鉴权OSS位于受控网络，不向浏览器发放直接访问地址 |

数据库及存储的具体约束分别见 [数据库合同](../contracts/data/database.md) 与 [媒体合同](../contracts/data/mediaStorage.md)。计划确认见 [note 131807](https://git.aimall-tech.com/yuxin.ma/ai-studio/-/issues/7#note_131807)；当前源码和静态检查不表示目标环境已经完成初始化或功能验收。
