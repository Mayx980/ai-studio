// 运行时配置 —— 环境无关 dist 的唯一环境注入点，构建期禁止烘入环境差异。
// 镜像自带本默认值；环境差异由部署侧单文件挂载覆盖 /usr/share/nginx/html/config.js，不重新构建。
window.__APP_CONFIG__ = {
  // apiBase: '',   // API 前缀，默认同源相对路径（环境差异由部署侧 nginx 反代 /api 承担），通常无需覆盖
}
