# 构建与运行

在仓库根目录准备 Bun 1.3.14 及工作区依赖后，执行 `bun run build:server`。该脚本调用 `ops/buildStandalone.ts`，构建节点、工具、编辑器插件、Web、Server、MCP，并复制供应商和技能到根 `build/`。随后 `bun run start:server` 运行构建版，默认访问 `http://localhost:3000`。

容器入口为 `ops/Dockerfile` 和 `ops/compose.yaml`。在根目录执行 `docker compose -f ops/compose.yaml up --build`，构建上下文仍为仓库根；容器数据卷和端口沿用现有配置。容器构建、上线、签名、桌面和移动打包需要对应环境与独立操作，未执行时不声称通过。

平台准备、安装包、更新制品及发布命令的唯一详细说明见[源码手册](../docs/sourceDevelopment.md)与[更新服务](../services/updateServer/readme.md)。`.github/workflows/` 保留上游配置，在本 GitLab 项目不自动执行；本次不增加 GitLab CI 或生产部署。
