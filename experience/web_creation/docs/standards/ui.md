---
title: ui-standard
type: note
permalink: web-admin/docs/standards/ui
---

# UI 与交互规范

## 1. 规范边界

本文件只记录 Web Admin 的可运行交互基线。页面骨架、主题变量、图标尺寸、Sheet / Dialog、危险操作确认、loading、重复触发限制、旧响应保护、防抖 / 节流等通用规则由物化后的项目规范约束。

## 2. Admin 特殊约定

- Layout 固定为顶部 header + 左侧 sider + 内容区。
- 页面背景、容器、边界、正文、普通数据和非激活结构使用黑、白、中性灰；默认 preset 的品牌紫只示范交互强调，不是项目不可替换的品牌事实。
- `--brand-accent` 是主按钮、链接、focus ring、当前导航、当前 Tab、选中态和交互图标的唯一品牌色源。项目替换该 token 后必须复核浅色与暗色主题的文字对比度和焦点可见性，不逐页覆盖颜色。
- destructive、warning、success 等状态色只表达业务语义；Logo palette 只属于 Logo 资产。Logo 可以多色，但其颜色不扩散到头像、数据图标、卡片、表格行或状态 token。
- 侧边栏菜单由 `src/routers/routes.js` 的 layout children 派生，不单独维护菜单配置。
- 内容页优先使用 `page-panel`，内部采用 `query-filter`、`admin-content`、`admin-footer` 三段结构。
- 页面级筛选复用 `query-filter`：`fields` 只放带常驻 label 的筛选条件，时间范围放最前；`actions` 始终提供重置 / 查询并紧随条件同行，空间不足时换行；`primary` 放添加 / 导入等页面主操作与视图工具并靠最右。布局与关键词宽度只读 `--field-width-keyword` / `--field-width-keyword-max`。
- 基础页面必须能由 Scenario Provider 独立运行，不能把真实后端作为 Experience 评审前提。
- 登录页保留主题切换和语言切换，Scenario 账号写在登录提示中。
- 卡片视图不能与页面容器同白底混在一起，卡片需使用弱填充背景、边框和明确间距，hover 态可轻微加深背景或阴影。

## 3. 公共组件

| 组件 | 用途 |
| --- | --- |
| `page-panel` | 页面统一外框 |
| `query-filter` | 页面级筛选（fields/actions/primary 三区、默认重置 / 查询） |
| `pro-table` | 页面级自然增长、显式有界虚拟滚动、固定列、树形、编辑、列设置、密度、选择与批量栏；动作列设置 `actionColumn: true` |
| `table-row-actions` / `table-row-action` | 操作列左对齐紧凑容器，以及普通、危险、纯图标动作的唯一变体 |
| `tree-select` / `cascader` | 搜索、多选与异步加载选择器 |
| `common-confirm` | 删除/危险操作确认 |
| `empty-state` | 空态 |
| `error-state` | 错误态与重试 |
| `status-dot` | 状态点 |
| `view-type-switch` | 列表/卡片切换 |
| `switch-lang` | 语言切换 |
| `switch-theme` | 明暗主题切换 |
| `echarts-*` | 基础图表 |
| `example-record-drawer` | 基础列表添加/编辑 Drawer |

组合使用时由页面持有业务状态：`page-panel` 提供壳，`query-filter` 只提交输入态，页面通过 `useListPagination` 获取当前页结果，`pro-table` 与卡片视图只消费该结果。删除和批量删除统一经过 `common-confirm`；添加/编辑统一打开 `example-record-drawer`，不得把请求、分页或脏数据语义下沉进展示组件。

## 4. 基础页面检查清单

- 筛选、分页、刷新、删除等主动请求必须有 loading 或禁用态。
- 表格和卡片视图共享同一份数据和分页。
- 添加 / 编辑默认使用 Sheet；表单 Sheet 要抽离为组件，通过 `ref.open(record?)` 供页面调用。
- 删除使用 `common-confirm`，不直接发请求。
- 卡片视图需要区分容器背景、卡片背景和卡片间隔。
- 图表容器必须有稳定高度。
- 表单提交失败不关闭页面状态，成功后给出反馈。
- 页面级表格不传 `height`，最小填满首屏剩余空间，长内容由 Layout 页面滚动区承载；有明确高度边界的嵌入式表格才传正数 `height` 启用表体内部滚动与虚拟化。
- 列宽按表头、字段类型、典型内容与双语文案规划 `size` / `minSize` / `maxSize`。业务列按基础宽度同比填满容器；不足时按比例收缩并钳制最小宽度，仍放不下才表内横向滚动。`maxSize` 限制基础宽度和手动调整，不限制比例填满；不按当前页数据测量，翻页保持稳定。固定业务列同样参与分配。
- 序号、独立展开控件列标 `toolColumn: true`，操作列标 `actionColumn: true`，与选择框一起保持紧凑宽度。没有可见业务列时工具列不拉伸，背景仍填满整行。长表头换行；正文用 `wrap: true` 或省略加完整内容入口，连续长字符不能撑宽。手动列宽调整修改基础宽度，容器和显隐列改变后统一重新分配。
- 表格操作列设置 `actionColumn: true`，内容使用 `table-row-actions` / `table-row-action`：表头和动作共享左侧起点，容器按内容宽度收缩且以 `--density-control-gap` 保持单行间距。普通动作使用 link，危险动作仅增加 destructive 语义色并保留确认，纯图标动作使用 ghost 且同时提供 Tooltip 和本地化可访问名称。操作列宽度要覆盖中英文文案；不足时明确扩列、菜单化或换行，不以撑满右对齐制造左侧空白。
- 表单内 `show-input` 类进度条必须保持 slider 与输入框同一行，输入框使用固定宽度，slider 使用剩余空间。

## 5. 基础列表示例验收基线

`/examples/list` 与 `/examples/form` 是 scaffold 的可运行基线，不是占位说明页。生成或显著调整管理后台列表时，至少对照以下行为：

- 服务端分页与筛选 URL 的行为由项目 Contract 与 adapter 约束；本清单只以 hook、Port 与页面的运行结果验收。
- 列表复用 `QueryFilter`、`ProTable`、列设置、密度、选择与批量栏；表格和卡片共享筛选、当前页与分页。
- 首次加载展示同构 skeleton；空态区分无数据和筛选无结果并给出下一步；错误态可重试，权限态以不可重试的降级说明呈现。
- 页面级表格、loading、empty 与少量数据最小填满首屏剩余空间；当前页内容增多时表格自然增长、页面整体纵向滚动，分页紧随表格内容。
- 删除、批量删除的确认文案包含动作、对象或数量、后果；提交期间不能重复触发。
- 添加/编辑 Drawer 使用 Field 形态，脏数据关闭前确认；提交中不能关闭，失败保留输入。
- `/views/examples` 的人读说明、默认值、状态与操作文案全部通过 locale key 提供。
