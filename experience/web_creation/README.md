# AI Studio 创作空间

基于《AI生成视频平台PRD V3.0》的深色 Web 创作原型，Vue 3 + Vite。需要 Node 24、pnpm。

## UIUX 场景预览

在仓库根运行：
```bash
python3 experience/preview/start.py --entity web_creation --runtime local --port 5173
```
打开 `http://127.0.0.1:5173`，状态导航在 `/_uiux`；按 Ctrl-C 或加 `--down` 停止。此入口只使用场景数据。

## 独立真实模型联调（本次用户另行授权）

```bash
cd experience/web_creation
corepack pnpm models
```
打开 `http://127.0.0.1:5174`，在“真实模型设置”输入四类服务的 Key。详情见 [模型联调说明](model-connect/README.md)。四个上传适配器由本地中转调用；Key 仅在当前页面内存和本次请求中使用，不保存到项目、浏览器存储或文件。

## 交互与边界

支持项目卡片、抓手/移动、捏合缩放、图片粘贴、节点和分镜行连线、右键断开、实时参考封面、个人资产、优化预览应用与参数摘要。支持 @ 分类引用封面、分镜图片按行分配、反向拖线；视频确认1张走单图、2–10张走参考图。节点只从右键菜单删除。重新生成分镜采用当前输入，确认成功后替换旧表；失败保留原表和输入。
项目数据保留在本次浏览器会话中，刷新重置。助手编排仍为规则演示；PDF/Excel、真实文件下载和服务端持久化未接入。真实模型入口的成功状态只由供应商响应产生；结果URL可能失效。

## 验证

在本目录执行 `corepack pnpm test`、`corepack pnpm test:models`、`corepack pnpm build`、`corepack pnpm build:scenario`、`corepack pnpm build:connected`。三个构建分别输出并执行隔离检查。浏览器回归脚本需要启动对应入口和 Chromium，可用 `CHROMIUM_PATH` 指定浏览器。`connected-check.mjs` 使用替身供应商响应验证界面，不能证明供应商实测成功。
