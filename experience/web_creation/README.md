# AI Studio 创作空间

基于《AI生成视频平台PRD V3.0》的深色 Web 创作原型，Vue 3 + Vite。需要 Node 24、pnpm。

## UIUX 场景预览

在仓库根运行：
```bash
python3 experience/preview/start.py --entity web_creation --runtime local --port 5173
```
打开 `http://127.0.0.1:5173`，状态导航在 `/_uiux`；按 Ctrl-C 或加 `--down` 停止。此入口只使用场景数据。

## 当前仅使用模拟数据

真实模型调用已暂停，等待用户明确提出切换。`corepack pnpm models` 现在同样在 5174 启动模拟预览，不展示 Key 输入，也不加载模型中转服务。已有适配器代码仅保留备查。

## 交互与边界

支持项目卡片、抓手/移动、捏合缩放、图片粘贴、节点和分镜行连线、右键断开、实时参考封面、个人资产、优化预览应用与参数摘要。支持 @ 分类引用封面、分镜图片按行分配、反向拖线；视频确认1张走单图、2–10张走参考图。节点右上角和右键菜单均可删除，统一二次确认。重新生成分镜采用当前输入，确认成功后替换旧表；失败保留原表和输入。
UIUX支持本地示例PNG/WebM/WAV下载，单个素材直接保存，选定镜头的多素材打包ZIP；示例文件不代表真实模型输出。
引用支持本地MD/Word/PDF和图片（Word/PDF解析模拟）；分镜可导出本地XLSX。
项目数据保留在本次浏览器会话中，刷新重置。助手编排仍为规则演示；PDF导出、正式生成素材下载和服务端持久化未接入。当前模型调用保持停用，附件与导出均在本地运行。

## 验证

在本目录执行 `corepack pnpm test`、`corepack pnpm test:models`、`corepack pnpm build`、`corepack pnpm build:scenario`、`corepack pnpm build:connected`。三个构建分别输出并执行隔离检查。浏览器回归脚本需要启动对应入口和 Chromium，可用 `CHROMIUM_PATH` 指定浏览器。`connected-check.mjs` 使用替身供应商响应验证界面，不能证明供应商实测成功。
