# PRD 骨架（outline）

## 端清单

| ID | 端名 | 形态 | 主要用户 | PRD 章节 | 生命周期 |
| --- | --- | --- | --- | --- | --- |
| SF-creation-workbench | 创作工作台 | other | 内部运营人员与短视频创作新手 | 3. 创作工作台能力 | active |

## 主要业务对象 + 分类

| ID | 对象 | 分类轴 | 类别 | PRD 章节 |
| --- | --- | --- | --- | --- |
| OBJ-project | 项目 | 业务容器 | 单一 | 2.2 主要业务对象 |
| OBJ-node | 节点 | 创作内容 | 文字/脚本/图片/视频/音频 | 2.2 主要业务对象 |
| OBJ-conversation | 对话 | 创作方式 | 简单创作/专业创作/素材自定义子对话 | 2.2 主要业务对象 |
| OBJ-media | 素材 | 媒体类型 | 图片/视频/音频 | 2.2 主要业务对象 |
| OBJ-storyboard | 分镜 | 镜头内容 | 单一 | 2.2 主要业务对象 |
| OBJ-template | 模板 | 复用方式 | 视频模板/项目流程模板 | 2.2 主要业务对象 |
| OBJ-model-configuration | 模型配置 | 生成能力 | 文字/图片/视频/音频 | 2.2 主要业务对象 |

## 业务规则

| ID | 标题 | PRD 章节 | 被引用方 |
| --- | --- | --- | --- |
| BR-shared-content | 共享保存与冲突保护 | 3.1 共享保存与恢复 | SC-reopen-project, SC-conflicting-save |
| BR-project-lifecycle | 项目创建、复制与列表管理 | 3.2 首页与项目管理 | SC-project-management |
| BR-mode-roundtrip | 模式共享数据与复杂编排保护 | 3.3 简单创作与结果应用 | SC-mode-roundtrip |
| BR-explicit-generation | 明确提交才生成 | 3.3 简单创作与结果应用 | SC-simple-creation |
| BR-result-application | 已有结果应用不重复生成 | 3.3 简单创作与结果应用 | SC-simple-creation |
| BR-reference-integrity | 真实引用与素材用途 | 3.4 引用与素材自定义 | SC-reference-application |
| BR-professional-confirmation | 专业阶段确认与会话保存 | 3.5 专业创作与阶段确认 | SC-professional-creation |
| BR-canvas-dependencies | 画布编辑与内容依赖 | 3.6 画布与分镜 | SC-storyboard-editing |
| BR-script-input | 脚本文字与有效参考输入边界 | 3.6 画布与分镜 | SC-script-input |
| BR-storyboard-identity | 分镜稳定引用与导入导出 | 3.6 画布与分镜 | SC-storyboard-editing |
| BR-model-credentials | 实例模型与服务凭据 | 3.7 模型配置与生成结果 | SC-model-configuration |
| BR-generation-lifecycle | 生成归属、部分失败与停止 | 3.7 模型配置与生成结果 | SC-generation-navigation |
| BR-asset-preservation | 素材和历史引用保护 | 3.8 素材与生成历史 | SC-asset-management |
| BR-template-snapshot | 模板只读预览与独立复制 | 3.9 模板与创作优选 | SC-template-copy |
| BR-onboarding-controls | 八步教学与原项目保护 | 3.10 教学、设置与操作辅助 | SC-onboarding |
| BR-ui-preferences | 品牌、偏好及操作一致性 | 3.10 教学、设置与操作辅助 | SC-workbench-controls |

## 场景

| ID | 端 | 角色 | 场景 | PRD 章节 |
| --- | --- | --- | --- | --- |
| SC-reopen-project | SF-creation-workbench | 使用者 | 在另一浏览器及服务重启后恢复已保存资料 | 3.1 共享保存与恢复 |
| SC-conflicting-save | SF-creation-workbench | 使用者 | 旧页面保存不能静默覆盖较新内容 | 3.1 共享保存与恢复 |
| SC-project-management | SF-creation-workbench | 使用者 | 项目创建、改名、复制及移除列表项 | 3.2 首页与项目管理 |
| SC-simple-creation | SF-creation-workbench | 使用者 | 明确生成并重复应用同一结果 | 3.3 简单创作与结果应用 |
| SC-mode-roundtrip | SF-creation-workbench | 使用者 | 模式往返和简单视图保存保留复杂编排 | 3.3 简单创作与结果应用 |
| SC-reference-application | SF-creation-workbench | 使用者 | 切换参考用途并应用子对话素材 | 3.4 引用与素材自定义 |
| SC-professional-creation | SF-creation-workbench | 使用者 | 修改剧情分镜后继续并恢复专业会话 | 3.5 专业创作与阶段确认 |
| SC-storyboard-editing | SF-creation-workbench | 使用者 | 导入、排序改号、引用及导出分镜 | 3.6 画布与分镜 |
| SC-script-input | SF-creation-workbench | 使用者 | 仅参考可生成、两者都空不调用模型 | 3.6 画布与分镜 |
| SC-model-configuration | SF-creation-workbench | 使用者 | 保存无关设置不泄露或清空凭据 | 3.7 模型配置与生成结果 |
| SC-generation-navigation | SF-creation-workbench | 使用者 | 生成中切换项目且结果归属不变 | 3.7 模型配置与生成结果 |
| SC-asset-management | SF-creation-workbench | 使用者 | 素材改名移动后恢复文件标签及来源 | 3.8 素材与生成历史 |
| SC-template-copy | SF-creation-workbench | 使用者 | 跨浏览器只读预览并复制独立项目 | 3.9 模板与创作优选 |
| SC-onboarding | SF-creation-workbench | 使用者 | 首次及手动教学可见且不覆盖原项目 | 3.10 教学、设置与操作辅助 |
| SC-workbench-controls | SF-creation-workbench | 使用者 | 偏好、快捷键与侧栏会话保持一致 | 3.10 教学、设置与操作辅助 |

## 待确认问题

| ID | 问题 | 状态 | 待谁确认 |
| --- | --- | --- | --- |

## 修订记录

| 日期 | issue | 摘要 |
| --- | --- | --- |
| 2026-11-06 | #7 | 建立共享实例创作规则和验收场景索引 |
