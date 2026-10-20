# AI Studio 创作空间交互原型

基于 AI生成视频平台PRD V3.0 的桌面 Web 原型，采用 Vue 3、Vite 和深色画布。页面通过稳定 Port 访问数据；构建期分别选择场景数据或待接入的生产适配器。

在仓库根目录启动唯一 Preview：

```bash
python3 experience/preview/start.py --entity web_creation --runtime local --port 5173
```

打开 `http://127.0.0.1:5173`。场景导航在 `/_uiux`，可选择 loading、empty、error、paging、permission、form-validation。停止入口按 Ctrl-C，或运行同一命令加 `--down`。需 Node 24 和 pnpm；入口安装锁定依赖。不需要业务服务或密钥。

核心演示：打开最近项目，在分镜表右侧点击每行连接点；可连接多个下游节点。点击分镜卡片右上角进入完整表编辑、调整顺序；资产页保存提示词时可设置名称、单选位置、多选标签。图片节点右键保存资产；生成和覆盖操作先确认。下载清单要求显式跳过缺失镜头。

项目数据仅在当前页面内存中保存，刷新重置。模型调用、文件解析、媒体播放、PDF/Excel 导出和素材打包均为交互示意，不会产生真实服务调用或文件；页面明确提示这些边界。正式 SSO、持久化、真实任务、完整 Agent 工具与生成能力尚未接入。

检查：

```bash
cd experience/web_creation
corepack pnpm test
corepack pnpm build
corepack pnpm build:scenario
```

两种构建都执行模块图及最终产物隔离检查。浏览器流程脚本 `browser-check.mjs` 需要运行中的本地 Preview 与 Chromium，可通过 `CHROMIUM_PATH` 指定浏览器路径。

本轮体验补充：侧栏“我的项目”进入独立卡片页，含项目名、上次打开时间和封面；创建卡可新建空项目。灵感入口按场景规则自动创建并连接节点，助手也可按文字指令补节点或整理布局。节点右侧出口可拖到另一节点，或先点击出口再点入口；下游参考区展示上游内容，可取消以断开连线。引用面板实时展示当前画布已就绪内容和版本。

画布支持抓手平移、节点拖动、触控板捏合缩放（普通双指滑动仍用于平移）。图片、视频、音频节点的参数摘要可打开参数面板。选中文字后右键可复制、剪切、粘贴；浏览器剪贴板权限不足时提示使用系统快捷键。

新增体验回归脚本为 `experience-check.mjs` 和 `clipboard-check.mjs`。这些脚本验证原型交互，不代表模型接入或真实生成验收。
