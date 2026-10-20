# 项目图谱

## 路由

| 路由 | 页面 | 说明 |
| --- | --- | --- |
| `/dashboard` | `src/views/dashboard/index.vue` | 数据总览 |
| `/examples/list` | `src/views/examples/list/index.vue` | 基础列表 |
| `/examples/statistics` | `src/views/examples/statistics/index.vue` | 统计页 |
| `/examples/form` | `src/views/examples/form/index.vue` | 基础表单 |
| `/auth` | `src/views/auth/index.vue` | Scenario / production 共用登录页 |

## 公共能力

| 能力 | 文件 |
| --- | --- |
| 路由常量 | `src/enumeration/routes.js` |
| Experience Port | `src/ports/*.js` |
| Scenario catalog | `src/scenarios/catalog.js` |
| Scenario 数据与行为 | `src/scenarios/*.js` |
| Production adapter | `src/adapters/production/*.js` |
| Production transport | `src/apis/request.js` + `src/apis/modules/*.js` |
| 基础列表 Drawer | `src/components/examples/example-record-drawer.vue` |
| 鉴权拦截 | `src/routers/interception.js` |
| 登录态 | `src/stores/modules/auth.js` |
| 页面状态 | `src/stores/modules/page.js` |
| 分页 hook | `src/hooks/use-pagination.js` |
