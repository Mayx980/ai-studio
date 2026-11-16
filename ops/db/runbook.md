# MySQL 数据库操作手册

本包归 `server` 数据域，协议目标为 [mysql 8.4](../../architecture/nfr.md)。版本1包含9张业务/迁移表及运维用 `backupCatalog`，精确结构见 [数据合同](../../contracts/data/database.md)。操作只通过本目录 `db-ops` 分派，不直接执行 `operations/*.py`。普通部署与初始管理员接管见 [数据库部署](../database.md)。不需要安装 Skill。

## 准备

Linux/macOS、Python 3.10+、PyMySQL、PyYAML、cryptography 和 Git；本仓镜像已声明相应系统包。数据库及维护账号须先由 DBA 建立，应用不执行DDL。复制本包空模板为未跟踪的本地配置，权限仅所有者可读写：

```sh
install -m 600 database.template.yaml database.test.yaml
python3 -B db-ops describe
python3 -B db-ops config-check
```

工作目录为 `ops/db`。填写实际 `host`、整数 `port`、`database`、`username`、`password`。`tls_ca_file` 不使用时为 `null`；使用时填配置文件旁未跟踪的 CA 相对路径，验证证书及主机名，不关闭校验。真实配置、CA、运行目录及备份不可提交。应用使用独立JSON配置，不能把这里的YAML直接当作应用配置。

`config-check`只校验本包，不读取连接配置、不连接数据库。以下 `check/run/verify` 会连接实际目标；先核对本次环境、完整代码SHA、目标及授权。可以在每条命令后传 `--config /绝对路径/database.yaml`；无指定时按工具本地约定选择配置，不允许用另一个环境的配置代替缺失文件。不要输出实际配置或密码。

## 诊断、初始化和更新

```sh
python3 -B db-ops check --entity server --operation diagnose --config /run/secrets/database.yaml --format human
python3 -B db-ops run --entity server --operation initialize --config /run/secrets/database.yaml --dry-run
python3 -B db-ops run --entity server --operation initialize --config /run/secrets/database.yaml
python3 -B db-ops check --entity server --operation table-check --config /run/secrets/database.yaml --format human
```

所有操作输入均为闭合的空对象 `{}`，可省略 `--input`。`diagnose`区分 empty/current/partial/unmanaged/newer/unknown；它不修改数据库。仅空业务库可建立结构；精确 current 的 initialize/update 仍核验，不重建或降级。版本1没有更早SQL结构的升级路径，`update`只确认当前无待变更；不伪造空成功的升级。

`run`先保存计划并显示结构、风险和备份范围，默认取消。只有确认了**本次**计划才在交互提示中选择执行。空库没有可用的业务表备份，先人工备份原业务文件/密钥；核实目标确为空且接受无SQL备份后才可在提示中选择 `n`。已有库的更新应选择已验证的备份，不盲目选择跳过。`h`会暂停，要求提供同目标且绑定的备份计划及结果；不是输入任意“已备份”字符串。执行后自动 verify/readback，材料在 `.runtime/`，保留其目录用于恢复和审计。

失败或连接中断可能已提交DDL。保留现场，重新 diagnose 和原计划 verify；不得自动重跑、删库或重置标记。partial/unmanaged/newer/unknown没有本包支持的普通修复路径，需维护者另行确定前向修复。

## 备份与恢复

```sh
python3 -B db-ops run --entity server --operation backup --config /run/secrets/database.yaml
python3 -B db-ops verify --plan .runtime/实际运行目录/plan.json --config /run/secrets/database.yaml
```

backup在同库为9张表创建固定 `backup*` 副本，持有源表READ锁和副本WRITE锁，核对完整表校验和，把副本摘要写入 `backupCatalog`；需要维护窗口及 LOCK TABLES/CREATE/SELECT/INSERT/UPDATE 权限。它会阻塞业务写入，不复制 `backupCatalog` 自身。已有副本只验证，不覆盖；部分副本保留并阻止继续，需另行维护决定。

同库副本用于操作前保护，**不是灾备或滚动备份**。异机灾备须同时保管匹配版本的SQL导出或停库卷快照、应用文件卷、云对象和根加密密钥。业务停止写入后再确定一致性时点；不能只备份索引或重新生成密钥。恢复由DBA按已获准目标执行，本包没有自动恢复/删除/降级命令。

恢复较早SQL会带回旧Session、密码及启用状态。外部流量保持隔离，完成SQL/文件/云对象/密钥配套恢复后执行：

```sh
python3 -B db-ops run --entity server --operation revokesessions --config /run/secrets/database.yaml
python3 -B db-ops check --entity server --operation table-check --config /run/secrets/database.yaml --format human
```

`revokesessions`只删除全部会话并核实为空；不删账号/项目/文件。DBA还须核对备份时点后的停用/改密事件，恢复相应账号状态或重设密码。重新开放前用旧Cookie验证401，再以管理员、普通账号检查各自项目/资产/模型状态。不能以“恢复后点退出”替代全体会话撤销。

## 结果与限制

通过条件是本操作计划、执行、verify/readback均一致。连通性check不代表表结构或业务通过；类型和构建检查不代表连接、DDL、接管或恢复通过。本轮仅完成静态包校验，未连接环境数据库，未执行上述操作。
