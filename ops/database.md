# AFXEN 部署：现有MySQL、HTTP OSS、单应用容器

本版按 Issue #7 [note 132070](https://git.aimall-tech.com/yuxin.ma/ai-studio/-/issues/7#note_132070) 取消网站管理员。账号由运维执行SQL维护，网站仅保留登录、本人改密、退出及个人资料隔离。本页给出操作者执行的命令，尚未在目标机验证；不把源码检查当环境验收。

## 部署形态

Compose只运行一个`app`，复用已有MySQL与公司HTTP OSS，不新增数据库服务/数据库卷或Caddy。APISIX继续转发应用端口。画布、对话和模板JSON保存在应用数据目录；新媒体在OSS，元数据在MySQL。数据库协议目标仍为MySQL 8.4/InnoDB，先在现有数据库执行`SELECT VERSION()`核实；其它版本未验证，不自动升级已有MySQL。

以下从`~/afxenDeploy/source`（本仓根目录）运行，使用现有`docker-compose`。首次可在上一级目录停止原`compose.yaml`中的`app`，再切到source。全新测试使用本仓空`data/`目录，不挂载旧appData、不导入旧项目或浏览器资料；不执行删卷或清空数据库的命令。已有同名目录/库应先核对是否为空，不能误用其它业务数据。

## 1. 配置和构建

准备目录：

```sh
cd ~/afxenDeploy/source
umask 077
mkdir -p data secrets dbRuntime
```

在仓库根的未跟踪`.env`填写实际值：

```dotenv
AFXEN_BIND_ADDRESS=0.0.0.0
AFXEN_PORT=31230
AFXEN_PUBLIC_ORIGIN=http://192.168.102.18:31230
AFXEN_STORAGE_BASE_URL=http://实际OSS地址及端口
AFXEN_STORAGE_BUCKET=实际bucket
AFXEN_STORAGE_PREFIX=afxen
AFXEN_MODEL_ALLOWED_BASES=[]
```

使用APISIX域名访问时，PUBLIC_ORIGIN改为浏览器真实的`https://域名`，再重新创建应用；IP直连和域名不能混用不同Origin。OSS与模型允许地址详见[storage](storage.md)，不额外改APISIX或公开OSS旁路。

创建`secrets/database.json`，使用现有MySQL的应用专用账号：

```json
{"host":"实际MySQL可达地址","port":3306,"database":"afxen","username":"afxenApp","password":"应用数据库密码"}
```

host/port必须从应用容器可达，不能把容器的`localhost`当宿主MySQL；若数据库在其它Docker网络，先让应用与数据库具备实际网络通路。此示例为可信内网非TLS连接；要求TLS时JSON增加`ca`字段（PEM CA正文），运维YAML配置匹配CA文件，不关闭证书校验。

首次生成凭据加密密钥；存在时拒绝覆盖：

```sh
python3 - <<'PYKEY'
import base64, json, os, secrets
os.umask(0o077)
with open("secrets/credentialKey.json", "x") as file:
    json.dump({"keyVersion": "v1", "key": base64.b64encode(secrets.token_bytes(32)).decode()}, file)
PYKEY
```

密钥用于加密各用户模型Key，不是数据库密码。开始使用后必须与数据配套备份，不重新生成来覆盖现有密文。

构建（网络已通时可省略代理参数）：

```sh
docker-compose --env-file .env -f ops/compose.yaml build \
  --build-arg HTTP_PROXY=http://192.168.101.51:8234 \
  --build-arg HTTPS_PROXY=http://192.168.101.51:8234 \
  --build-arg NO_PROXY=localhost,127.0.0.1 app
```

构建代理不负责Docker daemon拉基础镜像；沿用目标机已配置的daemon代理。本Compose默认镜像为`afxenapp:local`，需要固定标签时通过`AFXEN_IMAGE`指定，并在以下`docker run`命令使用同一标签。

取得镜像用户并准备目录/配置权限：

```sh
afxenUid=$(docker run --rm --entrypoint id afxenapp:local -u)
afxenGid=$(docker run --rm --entrypoint id afxenapp:local -g)
sudo chown "$afxenUid:$afxenGid" data dbRuntime secrets/database.json secrets/credentialKey.json
sudo chmod 700 data dbRuntime
sudo chmod 600 secrets/database.json secrets/credentialKey.json
```

配置必须是普通文件、无符号链接，且仅所有者可读写（0600/0400）；应用以镜像bun用户运行。先建文件再挂载，不能把缺失文件自动生成的目录当配置，也不能放宽成0644绕过权限校验。仓库source、密码、密钥和SQL不提交Git。

## 2. 首次建立应用表结构

在已有MySQL准备专用空库`afxen`和应用连接账号，不用root连接常驻应用。初始化由你已有的具备DDL权限的运维账号执行一次；它不是网站管理员，也不挂入常驻应用。

按[运维模板](db/database.template.yaml)建立`secrets/database.yaml`：

```yaml
schema: wf-prod.database_operations_targets
schema_version: 1
entities:
  - entity_id: server
    host: 实际MySQL可达地址
    port: 3306
    database: afxen
    username: 已有数据库运维账号
    password: '运维账号密码'
    tls_ca_file: null
```

将该文件权限设置为与镜像UID/GID一致、0600。维护权限为本库SELECT/INSERT/UPDATE/DELETE/CREATE/ALTER/INDEX/REFERENCES/LOCK TABLES；常驻应用的最小权限见[数据库合同](../contracts/data/database.md)。

```sh
sudo chown "$afxenUid:$afxenGid" secrets/database.yaml
sudo chmod 600 secrets/database.yaml

docker-compose --env-file .env -f ops/compose.yaml run --rm --no-deps \
  --entrypoint python3 \
  -v "$PWD/secrets/database.yaml:/run/secrets/database.yaml:ro" \
  -v "$PWD/dbRuntime:/app/ops/db/.runtime" \
  app -B ops/db/db-ops check --entity server --operation diagnose \
  --config /run/secrets/database.yaml --format human

docker-compose --env-file .env -f ops/compose.yaml run --rm --no-deps \
  --entrypoint python3 \
  -v "$PWD/secrets/database.yaml:/run/secrets/database.yaml:ro" \
  -v "$PWD/dbRuntime:/app/ops/db/.runtime" \
  app -B ops/db/db-ops run --entity server --operation initialize \
  --config /run/secrets/database.yaml
```

核对目标和本次计划再按提示确认。空库接受无SQL备份分支前须确认没有业务表；partial/unmanaged/newer/unknown时停止，不删除或自动重跑未知DDL。精确current仅核验，不重建。完整流程和失败恢复见[runbook](db/runbook.md)。应用启动和构建均不隐式建表。

结构建立后，给`afxenApp`授予users/sessions/userSettings/providerSecrets/creationStates/libraryStates/mediaFiles七表SELECT/INSERT/UPDATE/DELETE；schemaMigrations、dataImports只授予SELECT，不授予DDL、FILE或backupCatalog。MySQL账号Host按应用实际来源限制。以后仅新增登录用户时不需要重复初始化表结构。

## 3. 用SQL创建登录用户

离线工具隐藏输入密码，只输出SQL，不读取配置、连接数据库或创建管理员：

```sh
docker run --rm -it --entrypoint bun afxenapp:local build/server/userSql.js create
```

填写用户名、显示名称和两次初始密码，将终端生成的单条INSERT复制到你的MySQL工具，在`afxen`库执行。SQL使用随机UUID、Argon2id哈希和无歧义十六进制文本，兼容字符串中的引号/反斜线，不写入明文密码。执行成功后可查询`id, username, name, enabled, mustChangePassword`核对，不能导出passwordHash或模型凭据作普通日志。

只需新增users记录；首次成功登录会在同一事务中补齐空userSettings/creationStates，已有内容不覆盖，错误密码不初始化。所有账号文件根均为`data/users/<id>/`。schema v1的role/legacyRoot列只为兼容保留，工具固定写user/0，手改admin/1也不获得网站管理员或实例旧根权限。不得用MySQL的MD5/SHA2代替Argon2id密码哈希。

重置、停用和启用同样只生成单条SQL，复制后人工执行：

```sh
docker run --rm -it --entrypoint bun afxenapp:local build/server/userSql.js reset
docker run --rm -it --entrypoint bun afxenapp:local build/server/userSql.js disable
docker run --rm -it --entrypoint bun afxenapp:local build/server/userSql.js enable
```

reset不自动启用已停用账号；reset/enable/disable均递增authVersion，旧会话因此立即失效，不能只修改passwordHash或enabled而忘记版本。确认SQL影响一行；用户名不存在应核对来源，不创建替代用户或覆盖其它账号。本人改密由网站完成，创建/重置后须先改初始密码。不提供HTTP注册、账号列表或代改他人密码入口。

## 4. 启动和核对

```sh
docker-compose --env-file .env -f ops/compose.yaml up -d app
curl --fail http://127.0.0.1:31230/api/health
docker-compose --env-file .env -f ops/compose.yaml logs --tail 100 app
```

打开`http://192.168.102.18:31230`，用SQL创建的普通账号登录并修改初始密码；再配置本人模型API Key。没有网站管理员或账号管理菜单，不运行createAdmin，不接管旧测试资料，也不删除旧卷。

health仅核对DB/schema、密钥与OSS配置，不上传媒体或验证OSS连通。真实环境需分别核对双账号隔离、SQL重置/停用后的旧Cookie失效、同账号CAS、实际上传/生成和持久化。当前这些操作尚未在目标环境验证，构建和隔离Scenario不能替代。

## 恢复边界

备份仍需数据库、应用文件、云对象及匹配密钥。恢复旧SQL可能带回旧会话/密码，隔离流量后按[runbook](db/runbook.md)撤销所有恢复Session并核对账号状态，再开放流量。DB失败不回退JSON，不通过换回旧共享镜像冒充安全回滚。本文不授权执行真实部署、删库、旧资料接管或恢复。
