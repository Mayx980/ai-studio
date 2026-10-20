---
title: workflow-compatibility
type: note
permalink: web-admin/docs/standards/workflow-compatibility
---

# 模块与项目边界

## 模块保证

- 页面只消费 Experience Port，Scenario Provider 与 production adapter 共享页面源码。
- 路由名来自 `ROUTES` 常量，路由 path 使用 kebab-case。
- 默认时区取浏览器环境，不写死部署区域。
- 工程只带 `en-US` 与 `zh-CN` 两组基础语言包。
- 基础页面和 Scenario Provider 可在无业务网络依赖时运行。

## 项目拥有

- 业务域、业务流程、业务资产与真实 Contract。
- 部署环境、凭据、远程测试入口与发布流程。
- 项目级依赖选择、版本偏离和补充工程规范。
- 变更记录、milestone 与 review 证据。

## 禁止回写

项目特有内容不得回写到模块版本。需要改变模块通用行为时，应发布新的模块版本，并保持已发布版本不可变。
