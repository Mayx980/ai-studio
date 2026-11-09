# 隔离 Preview

在仓库根目录显式执行 `bun install --frozen-lockfile`，使用 Bun 1.3.14、Node 24+、Python 3.10+ 和 Git；随后运行：

```sh
python3 frontend/preview/start.py
```

入口读取当前分支、origin 和 Project Facts，启动全部 UI entity，输出动态 loopback URL。Web 以 `node --run=scenario` 启动原 Vite 工程；默认 `empty` 场景。以输出地址追加 `?scenario=loading`、`?scenario=error`、`?scenario=permission` 或 `?scenario=formValidation` 后打开首页，在“我的项目”点击“导入项目”查看目录选择器状态；`formValidation` 场景选择合成目录后新建目录并输入非法名称，使用原页面的输入校验。场景数据只在内存中，不读真实工作区、浏览器项目、密钥或供应商，也不要求原型登录。

Ctrl+C 回收本次进程组。停止后可执行 `python3 frontend/preview/clean.py`，仅清理本工作区的运行记录，保留 Bun 依赖与下载缓存。运行结果位于 Git 忽略的 `runtime/`，绑定实际 source SHA、输入和健康回读；它不证明全部 UI 交互已验证。

可选 `--sync` 只从当前 origin/分支 fast-forward，同步前要求完整工作区 clean 和现有 Git 认证，入口不注入凭据。不要把凭据写入 URL 或提交本机运行记录。

本项目采用 wf-prod 0.8.6 的 Preview 四文件结构、绑定校验、静态 Compose、安全 argv、运行锁、来源回读和信号回收；local 依赖准备适配为只读复用根 Bun 安装树，缺依赖时提示显式安装，不自动下载。依赖快照只证明启动窗口未变化，不代替 frozen install。Compose 保留标准静态结构；Bun 工作区的 Docker 依赖准备尚未实现，入口在 mutation 前明确拒绝 Docker，不宣称 Docker 运行已验证。
