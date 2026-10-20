---
title: README
type: note
permalink: web-admin/docs/readme
---

# Docs 索引

## 目录结构

| 目录/文件 | 内容归属 |
| --- | --- |
| [standards/](standards/README.md) | admin 工程规范、UI 特殊约定与边界说明 |
| [project-map/](project-map/README.md) | 当前工程目录、路由、页面和公共组件索引 |
| [changelog/](changelog/README.md) | admin 内的变更记录索引 |

## 推荐阅读顺序

1. 新接手项目：先读 [项目图谱](project-map/README.md)
2. 准备改代码：再读 [工程规范](standards/engineering.md)
3. 涉及页面或弹窗：补读 [UI 与交互规范](standards/ui.md)
4. 核对模块边界：查看 [兼容说明](standards/workflow-compatibility.md)

## 维护规则

- 本目录只记录物化后工程可直接执行的约定；项目特殊选择由项目自己的知识源维护。
- admin 内只保留本工程结构、Experience Port/Provider 装配、基础页面和组件边界等特殊约定。
- 不再把来源项目业务域、业务流程或远程部署信息写入 admin 文档。
