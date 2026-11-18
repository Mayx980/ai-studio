# 隔离 Preview

在仓库根目录显式执行 `bun install --frozen-lockfile`，使用 Bun 1.3.14、Node 24+、Python 3.10+ 和 Git；随后运行：

```sh
python3 frontend/preview/start.py
```

入口读取当前分支、origin 和 Project Facts，启动全部 UI entity，输出动态 loopback URL。Web 以 `node --run=scenario` 启动原 Vite 工程；默认数据场景为 `empty`，页面先进入登录；演示登录页提供三角色选择和默认临时密码123456，首次登录须先修改密码。以输出地址追加 `?scenario=loading`、`?scenario=error`、`?scenario=permission` 或 `?scenario=formValidation` 后打开首页，在“我的项目”点击“导入项目”查看目录选择器状态；`formValidation` 场景选择合成目录后新建目录并输入非法名称，使用原页面的输入校验。场景数据只在内存中，不读真实工作区、浏览器项目、密钥或供应商，生产身份不受演示角色选择影响。

Ctrl+C 回收本次进程组。停止后可执行 `python3 frontend/preview/clean.py`，仅清理本工作区的运行记录，保留 Bun 依赖与下载缓存。运行结果位于 Git 忽略的 `runtime/`，绑定实际 source SHA、输入和健康回读；它不证明全部 UI 交互已验证。

可选 `--sync` 只从当前 origin/分支 fast-forward，同步前要求完整工作区 clean 和现有 Git 认证，入口不注入凭据。不要把凭据写入 URL 或提交本机运行记录。

本项目采用 wf-prod 0.8.6 的 Preview 四文件结构、绑定校验、静态 Compose、安全 argv、运行锁、来源回读和信号回收；local 依赖准备适配为只读复用根 Bun 安装树，缺依赖时提示显式安装，不自动下载。依赖快照只证明启动窗口未变化，不代替 frozen install。Compose 保留标准静态结构；Bun 工作区的 Docker 依赖准备尚未实现，入口在 mutation 前明确拒绝 Docker，不宣称 Docker 运行已验证。


## 用户端与平台端独立预览／构建

本轮双端为用户端与平台端，不存在超级管理员或平台账号管理。使用现有scenario开发服务时分别打开 `http://127.0.0.1:5187/user/#/login` 和 `http://127.0.0.1:5187/platform/#/login`；实际端口以启动输出为准。独立路径会固定对应端身份，不能通过hash或角色选择跨端。开发服务命令在 `frontend/web` 执行 `node node_modules/.bin/vite --mode scenario --host 127.0.0.1 --port 5187`。

双端采用同源独立地址进行Scenario演示，使平台端创建的用户账号能在用户端验证登录；两端认证账号及会话分别存储。新演示账号初始密码123456，旧演示账号按角色迁入各自集合，保留已改密码。生产数据库及跨域认证不由此浏览器机制实现。

分别构建：`node node_modules/.bin/vite build` 生成用户端 `build/web`；`node node_modules/.bin/vite build --mode platform` 生成平台端 `build/platform`。独立Scenario产物为mode `scenario`的`build/scenario`及mode `platformScenario`的`build/platformScenario`。平台端构建固定平台身份，可独立部署，不需要在用户端暴露管理页面；域名及真实双端后端尚未配置，生产管理／免旧密码改密仍明确提示未接通。
