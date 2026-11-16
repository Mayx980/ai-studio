# 独立账号与数据库部署

已确认范围见 Issue #7 notes 131807、131814；本页对应当前源码，操作命令尚未在目标环境执行。继续使用单实例Bun/Express，数据库为Compose内部的MySQL 8.4.13/InnoDB，镜像固定digest见 [compose.yaml](compose.yaml)。原生本机模式不依赖数据库。用户、表和事务的唯一规则见 [数据合同](../contracts/data/database.md)，结构操作见 [运维手册](db/runbook.md)。

## 1. 保留原资料并准备配置

在维护窗口停止旧应用写入，记录当前镜像、源代码完整SHA和真实挂载卷：

```sh
docker-compose -f compose.yaml ps
docker inspect afxentest-app-1 --format '{{range .Mounts}}{{println .Name .Destination}}{{end}}'
```

先备份原 `/app/data` 卷及敏感 `settings.json`；已有SQL、云对象和根密钥同时备份。记录实际卷名，不能只凭目录名推断。不要执行 `down -v`、删卷、清空data或把空卷当旧卷。仓库 `ops/compose.yaml` 要求显式设置 `AFXEN_DATA_VOLUME` 并引用已存在的外部卷；全新环境由运维明确创建空卷。它的应用service仍名为 `toonflow`，数据库service为 `database`。用户已有 `~/afxenDeploy/compose.yaml` 的 `app` 服务可以继续使用原名，只把本仓新增的环境、secret挂载、数据库及健康定义同步进去，保留 `31230:3000` 和原 `appData`。

本仓示例从根目录运行，先在忽略的 `secrets/` 建立普通文件，不能是符号链接。应用以镜像 `bun` 用户运行；JSON和密钥必须0600/0400且可被该UID读取，不能为了省事改成0644。只把应用DML配置和密钥挂入常驻应用，维护账号和DB root不挂入常驻应用。

- `mysqlRoot`：强随机数据库root密码的纯文本文件，由运维安全填写；不输出到日志或命令行。
- `database.json`：应用DML连接，格式如下；`password`由运维安全填写。
- `maintenance.json`：与应用JSON同格式，使用独立维护账号，仅管理员接管的一次性容器挂载。
- `database.yaml`：按 `ops/db/database.template.yaml` 建立的维护连接，仅结构运维的一次性容器挂载。
- `credentialKey.json`：`{"keyVersion":"v1","key":"32字节随机值的base64编码"}`。首次生成后妥善备份，绝不重新生成来覆盖旧密文。该文字不是有效密钥。

```json
{"host":"database","port":3306,"database":"afxen","username":"afxenApp","password":"由运维填写"}
```

外部数据库用 `ca` 字段填写PEM CA正文并验证服务器域名；未提供CA时为明确的非TLS连接，仅适用于可信内部网络。Bun 1.3.14使用其内置MySQL握手，不添加仅在新版本类型声明中存在的选项。MySQL初始认证与实际TLS仍须在目标环境验证。无需额外ORM或数据库npm依赖。

在拥有本仓已安装依赖的受控终端，首次可生成密钥文件（文件存在会拒绝覆盖）：

```sh
bun -e 'import { randomBytes } from "node:crypto"; import { writeAtomic } from "@toonflow/file"; await writeAtomic("secrets/credentialKey.json", JSON.stringify({keyVersion:"v1",key:randomBytes(32).toString("base64")}), {exclusive:true,mode:0o600});'
```

## 2. 启动数据库并建立最小权限账号

按实际位置设置环境；下列使用仓库内Compose。外部卷名必须替换为第一步实际读到的名称，文件目录须为绝对路径：

```sh
export AFXEN_DATA_VOLUME=afxentest_appData
export AFXEN_SECRETS_DIR="$PWD/secrets"
export AFXEN_BIND_ADDRESS=0.0.0.0
export AFXEN_PORT=31230
docker-compose -f ops/compose.yaml up -d database
```

`database`不映射宿主3306。DB健康只表示进程响应；不表示schema已初始化。DBA通过本机受控终端建立 `afxenMaintenance` 与 `afxenApp`，限定本库及Compose网络来源，不复用root作为应用账号。MySQL交互客户端用 `--password` 提示输入并关闭客户端历史，不把密码写成参数；可以由DBA已有凭据管理工具生成和交付账号。所需授权如下：

| 账号 | 必需权限 |
| --- | --- |
| 应用 | `users`、`sessions`、`userSettings`、`providerSecrets`、`creationStates`、`libraryStates`、`mediaFiles` 的 SELECT/INSERT/UPDATE/DELETE；`schemaMigrations`、`dataImports` 的 SELECT。无需DDL、FILE、全局管理权限或读取backup表 |
| 维护 | `afxen.*` 的 SELECT/INSERT/UPDATE/DELETE/CREATE/ALTER/INDEX/REFERENCES/LOCK TABLES；仅在获准维护窗口使用；备份涉及固定backup表 |
| 数据库root | 仅初始创建库和账号等数据库管理，不交给应用 |

Compose首次只创建 `afxen` 空库；不通过启动SQL目录自动建业务表或接管资料。DBA建立账号、填入受限配置后继续，实际密码不进入本仓示例。

## 3. 构建、初始化结构和接管

```sh
docker-compose -f ops/compose.yaml build toonflow
```

网络差时沿用已验证的构建代理 `--build-arg HTTP_PROXY=... --build-arg HTTPS_PROXY=...`；基础镜像拉取仍由Docker daemon的代理配置负责。

创建并持久挂载仅运维可读写的 `dbRuntime/`，使一次性容器退出后保留本次计划；目录UID须与镜像bun用户一致。以下命令会连接数据库，必须先由操作者确认目标及权限，不是构建自动步骤：

```sh
docker-compose -f ops/compose.yaml run --rm --no-deps --entrypoint python3 \
  -v "$PWD/secrets/database.yaml:/run/secrets/database.yaml:ro" \
  -v "$PWD/dbRuntime:/app/ops/db/.runtime" \
  toonflow -B ops/db/db-ops check --entity server --operation diagnose --config /run/secrets/database.yaml --format human

docker-compose -f ops/compose.yaml run --rm --no-deps --entrypoint python3 \
  -v "$PWD/secrets/database.yaml:/run/secrets/database.yaml:ro" \
  -v "$PWD/dbRuntime:/app/ops/db/.runtime" \
  toonflow -B ops/db/db-ops run --entity server --operation initialize --config /run/secrets/database.yaml
```

查看本次计划、备份范围和风险后在终端确认，默认取消。empty库建立v1结构，partial/unmanaged/newer/unknown不自动修复；原计划和结果未知时按runbook核查。没有自动降级、删表或重新执行未知DDL的流程。

随后用本地交互入口接管旧资料；维护JSON临时覆盖本次进程的连接文件，常驻应用仍用DML账号：

```sh
docker-compose -f ops/compose.yaml run --rm --no-deps \
  -v "$PWD/secrets/maintenance.json:/run/secrets/maintenance.json:ro" \
  -e AFXEN_DATABASE_CONFIG=/run/secrets/maintenance.json \
  toonflow bun build/server/createAdmin.js
```

按提示输入管理员用户名、显示名及两次隐藏密码。只在实例无账号时执行；检验旧索引和真实路径、登记local媒体、配置与加密Key，在一个业务事务提交。原文件不改动、不上传旧媒体；有账号会拒绝，不重置密码或再次认领。非法索引、符号链接、超100MiB媒体或超过10万条媒体会明确阻断，不能跳过后宣称接管完整。

## 4. 填OSS并启动应用

OSS配置和受控网络见 [storage.md](storage.md)。填好实际 `AFXEN_STORAGE_BASE_URL`、`AFXEN_STORAGE_BUCKET` 后运行：

```sh
docker-compose -f ops/compose.yaml up -d toonflow
curl --fail http://127.0.0.1:31230/api/health
docker-compose -f ops/compose.yaml logs --tail 100 toonflow
```

`/api/health`核对DB/schema、凭据根密钥和OSS配置是否齐备，不上传文件，也不宣称OSS已连通。真实数据库/OSS/模型尚未在本轮连接验证。APISIX仍转发到应用实际端口，无需为OSS开放浏览器路由；HTTPS网关下设置 `AFXEN_PUBLIC_ORIGIN` 为浏览器实际origin，服务端不盲信转发头。直接HTTP内网测试可不设置该值；HTTP本身不提供凭据的链路保密。

管理员登录后创建普通账号。检查原资料只归初始管理员、新账号空资料、强制改密、跨用户目录和媒体拒绝、改密/停用后的旧Cookie失效、双页面版本冲突以及真实上传/生成。模型域名、结果CDN及内部LLM的部署允许项见storage说明。不要把健康或构建通过当作上述功能验收。

## 失败与恢复

DB错误返回503，不回退JSON、不重建空库；保存409保留草稿。根密钥丢失不自动换钥，先找匹配备份。新云媒体失败保留pending记录和对象，不物理删除；临时处理输出发布失败显示保留位置。只换回旧共享镜像会恢复共享访问语义，不能当作安全回滚。

配套恢复需要同版本SQL、应用文件、云对象及密钥，并隔离流量。按 [runbook](db/runbook.md) 撤销恢复出的全部Session，核对备份时点之后的停用/改密状态，旧Cookie须401后才开放。不在本轮执行实际接管、备份、恢复或部署。
