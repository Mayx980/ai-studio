# 既有更新制品边界

所属 entity 为 `updateserver`。公开目录由启动参数/环境确定，发布器生成平铺 ASCII 文件名；服务只接受 `GET` 与 `HEAD`，其它方法返回 405。合法名称匹配 `[a-zA-Z0-9][a-zA-Z0-9._-]*`，缺文件、目录及非法路径返回 404，不跟随符号链接；响应使用 `Cache-Control: no-store`。

具体文件名、版本、完整包与补丁生成及发布校验保持 [更新服务说明](../../services/updateServer/readme.md)和[发布器](../../services/updateServer/scripts/publish.ts)的既有规则。本次目录迁移不发布任何制品，不移动 tag，不改变签名或安装数据路径。
