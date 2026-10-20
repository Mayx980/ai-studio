---
title: engineering-standard
type: note
permalink: web-admin/docs/standards/engineering
---

# Web Admin 工程规范

## 1. 目标与适用范围

本规范约束 `web/admin` 系统后台前端工程。当前工程提供后台前端基础能力，不包含来源项目业务模块、业务枚举、业务资产、真实接口或远程部署配置。

## 2. 规范边界

- 本文只约束模块物化出的 Web Admin 工程。
- Vue、路由、状态、国际化与图表库的通用用法以项目锁定版本的官方文档为准。
- 项目级补充规范由物化后的 code unit 显式选择并维护。
- 项目规范与本文冲突时，由项目记录选择与偏离，不回写模块内容。

## 3. 技术栈

- Vue 3 + `<script setup>`
- Vite
- shadcn-vue 源码组件 + reka-ui primitive
- Vue Router 4
- Pinia + `pinia-plugin-persistedstate`
- Tailwind CSS v4
- vue-i18n
- ECharts
- Experience Port + Scenario Provider + production adapter

语言集：

- 当前工程仅启用 `en-US` / `zh-CN`，不保留其他语言包。

## 4. 目录约定

| 目录 | 说明 |
| --- | --- |
| `src/ports` | 页面、组件与状态唯一消费的 Experience Port |
| `src/scenarios` | 无网络的 Scenario Provider 与场景 catalog |
| `src/adapters/production` | 消费已确认 Contract 并映射到 Port 的 production adapter |
| `src/apis` | 仅供 production adapter 使用的 Axios request 与 modules |
| `src/components/common` | 通用组件，如确认、空态、状态点、语言/主题切换 |
| `src/components/ui` | code unit 自有 shadcn-vue 基础 primitive |
| `src/components/examples` | 基础页面可复用组件，如基础列表添加/编辑 Drawer |
| `src/components/layout` | 后台 layout、侧边栏、头部、标签栏 |
| `src/components/echarts` | ECharts 基础图表封装 |
| `src/enumeration` | `ROUTES`、状态等跨模块常量 |
| `src/hooks` | 可复用组合式逻辑，如分页 |
| `src/locale` | i18n 入口与语言包 |
| `src/routers` | 路由表、模块路由与鉴权拦截 |
| `src/stores/modules` | Pinia 状态模块 |
| `src/views` | 页面视图 |

## 5. 路由规范

- `name` 必须来自 `src/enumeration/routes.js` 的 `ROUTES` 常量。
- `path` 使用 kebab-case，`ROUTES` 常量值使用大驼峰。
- 新增路由必须补齐 `meta.title`，标题值使用 i18n key。
- 菜单图标写入 `meta.icon`，由 layout 侧边栏统一渲染。
- 鉴权逻辑只放在 `src/routers/interception.js`。

## 6. Port、Scenario 与 production adapter

- 页面、共享组件与状态只从 `src/ports` 导入，不能直接消费 transport 或 Contract shape。
- Scenario assembly 由 `src/scenarios` 直接生成 view model 和 command/query 结果，覆盖 loading、empty、error、paging、permission 与 form validation，且不得发网络请求。
- `src/adapters/production` 只消费 `src/apis/modules` 的业务请求函数，并把已确认 Contract 结果映射到同一 Port；`src/apis/request.js` 是 modules 共用的 transport。
- Port 返回错误时页面必须展示反馈；Scenario 与 production 复用同一份页面源码。

## 7. 基础页面边界

当前工程保留以下基础页面类型：

- 登录/退出
- 数据总览
- 基础列表（筛选、分页、列表/卡片视图、删除确认）
- 基础列表添加/编辑 Drawer（组件化复用）
- 统计页（图表和描述列表）
- 基础表单（校验、loading、Scenario 提交）

新增真实业务时，应复制这些模式并替换为业务 API，不在基础页面上叠业务逻辑。

## 8. 禁止事项

- 禁止重新引入来源项目业务代码、业务图片、模型文件、远程部署账号或业务 OpenAPI。
- 禁止在页面中硬编码路由名、状态文案和用户可见文案。
- 禁止新增未使用的重量级依赖。
- 禁止让 Scenario Provider 读取真实 endpoint、用户数据或凭据。

## 9. 验证

- 修改路由、store、公共组件、构建配置或请求链路后，需要运行 `pnpm build`。
- 纯文档调整可用 `git diff --check` 进行轻量校验。
