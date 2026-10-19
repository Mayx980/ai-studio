# AI生成视频平台PRD V3.0 内容索引

本文件仅索引 [PRD 正文](prd.md)，不补充产品规则。正文基于 Issue #4 归档稿，包含后续对话确认的本地需求修订；规则和场景编号仅用于索引导航。

## 端清单

| ID | 端名 | 形态 | 主要用户 | PRD 章节 | 生命周期 |
|---|---|---|---|---|---|
| SF-creation-platform | 内部视频创作平台 | other | 员工、管理员 | 3. 产品结构与主流程 | active |

## 主要业务对象 + 分类

| ID | 对象 | 分类轴 | 类别 | PRD 章节 |
|---|---|---|---|---|
| OBJ-project | 项目 | 画幅 | 横屏 / 竖屏 | 3.3 项目约定 |
| OBJ-node | 节点 | 创作内容 | 文字 / 图片 / 视频 / 音频 / 脚本 | 5.1 节点能力 |
| OBJ-asset | 个人资产 | 媒体类型 | 图片 / 视频 / 音频 / 提示词 | 7.2 个人资产 |
| OBJ-task | 任务 | 执行目的 | 媒体生成 / 批量下载准备 | 10.1 后台任务 |
| OBJ-feedback | 线下确认反馈 | 确认结果 | 待确认 / 需修改 / 已确认 | 9.4 线下确认与反馈记录 |

## 业务规则

| ID | 标题 | PRD 章节 | 被引用方 |
|---|---|---|---|
| BR-scope | 本期范围及排除项 | 1.4 本期范围 | SC-node-creation, SC-delivery |
| BR-isolation | 统一登录与个人内容隔离 | 2. 用户、权限与资料边界 | SC-access |
| BR-material | 资料外发与产品准确性 | 2.3 资料使用范围 | SC-node-creation |
| BR-project | 项目创建、复制与画幅 | 3.3 项目约定 | SC-node-creation, SC-delivery |
| BR-agent | 灵感入口、会话、结构化提问、画布和资产操作 | 3.4～3.6 | SC-node-creation |
| BR-document | 文档创作及 Office／PDF 读取 | 3.7 文档创作与读取 | SC-node-creation |
| BR-script | 完整分镜表、参考生成、按行连接及Excel导出 | 5.8 脚本节点（分镜） | SC-node-creation |
| BR-canvas | 画布编辑与保存 | 4. 节点画布 | SC-node-creation |
| BR-node | 节点、粘贴、参数及手动生成 | 5. 五类节点创作 | SC-node-creation |
| BR-model | 模型配置及能力校验 | 6.1 模型 | SC-node-creation |
| BR-connection | 连线依赖与限制 | 6.2 连线 | SC-node-creation |
| BR-assets | 手动保存、分类标签、具体版本与独立保留 | 7.2 个人资产 | SC-reuse |
| BR-reference | 媒体、提示词及分镜行引用与版本保留 | 8. 引用与撤销恢复 | SC-reuse |
| BR-undo | 画布编辑撤销边界 | 8.2 撤销与恢复 | SC-node-creation |
| BR-feedback | 线下确认、反馈与返工 | 9.3 来源版本与返工<br>9.4 线下确认与反馈记录 | SC-delivery |
| BR-text-export | 文本编辑、确定保存与PDF导出 | 5.2 文本节点交互与 PDF 导出 | SC-node-creation |
| BR-export | 单素材及按镜头批量下载 | 9.1 单素材下载<br>9.2 按选定镜头批量下载 | SC-delivery |
| BR-task | 后台执行、停止与重试 | 10. 任务、异常与数据保留 | SC-task |
| BR-recycle | 30 天回收站及引用保护 | 10.3 回收站 | SC-reuse |

## 场景

| ID | 端 | 角色 | 场景 | PRD 章节 |
|---|---|---|---|---|
| SC-access | SF-creation-platform | 员工、管理员 | 登录、隔离及模型管理 | 2. 用户、权限与资料边界 |
| SC-node-creation | SF-creation-platform | 员工 | 手动节点创作和生成 | 5. 五类节点创作 |
| SC-reuse | SF-creation-platform | 员工 | 资产保存、跨项目引用与删除恢复 | 7. 个人资产 |
| SC-delivery | SF-creation-platform | 员工 | 素材下载、外部剪辑与反馈记录 | 9. 素材下载与线下反馈 |
| SC-task | SF-creation-platform | 员工 | 离开页面后查看任务及主动重试 | 10. 任务、异常与数据保留 |

## 待确认问题

以下事项均来自 PRD 第 14 节，不是本次文档归档的开发任务。

| ID | 问题 | 状态 | 待谁确认 |
|---|---|---|---|
| Q-agent | Agent 流程中未执行步骤及待回答问题的恢复 | open | 产品、技术评估 |
| Q-document | 文档读取格式、大小及还原范围 | open | 产品、技术评估 |
| Q-model | 模型准确标识与实际能力 | open | 技术评估 |
| Q-audio | Seed Audio1.0 接口及中英文配音、音乐能力验证 | open | 产品、技术评估 |
| Q-login | 公司身份系统与接入条件 | open | 公司身份系统负责人 |
| Q-resources | 文件、并发与存储限制 | open | 产品、技术评估 |
| Q-performance | 生成、预览、导出耗时 | open | 产品、技术评估 |
| Q-template | 是否保留纯节点示例 | open | 产品负责人 |
| Q-compatibility | 本地旧项目兼容范围 | open | 产品、技术评估 |
| Q-retention | 内容、历史导出与离职处理 | open | 产品负责人 |

## 修订记录

| 日期 | issue | 摘要 |
|---|---|---|
| 2026-10-16 | [#4](https://git.aimall-tech.com/yuxin.ma/ai-studio/-/issues/4) | 收录内部视频创作平台需求与待确认事项 |
| 2026-10-16 | [#4](https://git.aimall-tech.com/yuxin.ma/ai-studio/-/issues/4#note_119801) | 补充灵感创作、Agent、文档、脚本及个人资产规则，指定音频模型 |
| 2026-10-19 | [#4](https://git.aimall-tech.com/yuxin.ma/ai-studio/-/issues/4) | 移除收藏及成片工作区旁白编辑、配音和配乐配置 |

| 2026-10-19 | [#4](https://git.aimall-tech.com/yuxin.ma/ai-studio/-/issues/4) | 补充文本PDF、分镜Excel、下载及外部剪辑流程 |

| 2026-10-19 | [#4](https://git.aimall-tech.com/yuxin.ma/ai-studio/-/issues/4) | 分镜表按行连接，移除脚本内媒体生成，新增提示词资产 |

| 2026-10-19 | [#4](https://git.aimall-tech.com/yuxin.ma/ai-studio/-/issues/4) | 统一文档名称为AI生成视频平台PRD V3.0 |
