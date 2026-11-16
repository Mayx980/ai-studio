# 数据库运维包

`server` 的 mysql 8.4 版本化操作入口，不自动在应用启动或构建中执行。

- [操作手册](runbook.md)：配置、诊断、初始化、备份、失败和恢复。
- [部署步骤](../database.md)：Compose、权限、管理员接管。
- [数据合同](../../contracts/data/database.md)：表、索引、约束及兼容边界。
- `python3 -B db-ops describe`：本包操作列表，不连接数据库。
- `python3 -B db-ops config-check`：静态一致性检查，不读取连接配置。

真实配置、密钥、运行材料与备份不入Git。连接或写入实际目标须另有明确授权。
