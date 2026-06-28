# CreatorOS 项目工作流 PRD v0.1

> 用户提供的 PRD。本仓库据此做 **gap 分析**(评估哪些功能未实现),数据模型沿用现有实现,不强制照本 PRD 重写。

## 1. 产品模块定位
- 模块名称:项目工作流 / Project Workspace
- 一句话定位:围绕一个内容项目,从立项 Brief、研究、策划、脚本、制作、发布到复盘,形成一条可追踪、可复用、可沉淀的自媒体内容生产流水线。
- 核心目标:不是简单的项目管理工具,而是一个**编导式内容生产系统**。解决:
  1. 内容项目从选题到发布之间容易断层
  2. 研究资料、策划思路、脚本、素材、发布包、复盘数据分散
  3. 前一阶段产物不能自动流入下一阶段
  4. 创作者靠感觉推进,没有阶段完成标准
  5. 复盘结论不能回流到选题、定位、校准和经验沉淀
- 核心原则:
  1. 每个项目必须有 Brief。
  2. 每个阶段必须有明确交付物。
  3. 每个阶段的产物必须流入下一阶段。
  4. AI 可以辅助生成,但用户必须确认关键产物。
  5. 复盘必须反向沉淀经验,而不是只看数据。

## 2. 核心用户
个人自媒体创作者、内容型独立开发者、知识博主、AI 工程化创作者。
典型场景:选题中心发现候选「为什么你的 Agent 总是跑偏?」→ 立项为项目 → Brief 立项 → 收集资料证据 → 内容合同与论点树 → 分段脚本 → 录屏/B-roll/封面 → 平台发布包 → 发布后复盘 → 沉淀下一轮经验。

## 3. 项目阶段总览
阶段流:`Brief 立项 → 研究 → 策划 → 脚本 → 制作 → 发布 → 复盘`

| 阶段 | 核心交付物 | 进入下一阶段条件 |
|---|---|---|
| Brief 立项 | Project Brief | 明确目标观众、内容目标、形式、平台 |
| 研究 | Research Conclusion | 有可用证据、资料、竞品参考 |
| 策划 | Content Contract | 明确核心论点、结构、受众承诺 |
| 脚本 | Script + Segments | 有完整口播文本和分段结构 |
| 制作 | Production Checklist | 素材、录屏、封面、字幕准备完成 |
| 发布 | Publish Package | 平台版本、标题、封面、标签完成 |
| 复盘 | Review Report + Learning | 数据回流、偏差分析、经验沉淀完成 |

## 4. 全局页面结构
- 左侧全局导航沿用现有:首页/定位中心/选题/校准/项目/知识库/素材中心/发布中心/变现中心/经验沉淀/设置。
- 项目顶部阶段导航:`Brief 立项 → 研究 → 策划 → 脚本 → 制作 → 发布 → 复盘`;每阶段状态:未开始/进行中/已完成/需要补充/已跳过。
- 顶部通用按钮:搜索(项目内只读)、分享(share_link)、更多(设置/复制/归档/删除)、进入下一阶段(校验完成条件 → 更新 current_stage)。

## 5. 核心数据模型(沿用现有,缺字段才补)
- **Project**:id, title, source_topic_id, status, current_stage, created_at, updated_at, owner_id
- **ProjectBrief**:id, project_id, project_name, source_type, source_id, target_audience, content_goal, content_format, target_platforms, duration_estimate, core_message, success_criteria, linked_assets, created/updated_at
- **ResearchItem**:id, project_id, type(trend|competitor|article|video|report|comment|note|evidence), title, summary, source_url, source_platform, linked_file_id, tags, usefulness_score, created_at
- **Evidence**:id, project_id, research_item_id, claim, evidence_text, evidence_type, support_type(support|oppose|neutral), used_in_planning, used_in_script, created_at
- **ContentContract**:id, project_id, target_audience, audience_pain, audience_misunderstanding, core_argument, content_promise, opening_strategy, structure_type, cta_goal, created/updated_at
- **ArgumentNode**:id, project_id, parent_id, node_type(claim|support|evidence|counter|example), content, linked_evidence_id, sort_order
- **Script**:id, project_id, title, mode(spoken|screen_recording|ppt|mixed), status, full_text, version, created/updated_at
- **ScriptSegment**:id, script_id, segment_type(hook|intro|point|case|transition|summary|cta), spoken_text, visual_note, subtitle_highlight, asset_requirement, duration_estimate, sort_order
- **ProductionItem**:id, project_id, script_segment_id, type(shooting|screen_recording|b_roll|screenshot|cover|subtitle|voiceover), title, description, required_asset_id, status(todo|in_progress|done|missing), created/updated_at
- **PublishPackage**:id, project_id, title, description, cover_asset_id, tags, default_platform, status, created/updated_at
- **PlatformVersion**:id, publish_package_id, platform(douyin|xiaohongshu|bilibili|video_account|wechat_article), title, description, tags, cover_asset_id, scheduled_time, status, published_url
- **ReviewReport**:id, project_id, publish_package_id, summary, prediction_comparison, performance_summary, failure_reason, success_reason, next_action, created_at
- **Learning**:id, project_id, source_review_id, type(topic|hook|structure|platform|audience|production), content, reusable_rule, created_at

## 6. 数据链路总览
- 6.1 选题→项目:TopicCandidate「立项为 Project」→ 建 Project + ProjectBrief 草稿,source_topic_id 关联。映射:title→project_name、target_audience→target_audience、recommended_angle→core_message、recommended_format→content_format、source→source_type、score_summary→success_criteria 初参。
- 6.2 定位→项目:PositionMaster 定位规则 → 写入 ProjectBrief 定位约束,后续每阶段校验是否偏离(target_audience_rule/content_boundary/tone_rule/forbidden_topics/script_rule/topic_rule)。
- 6.3 Brief→研究:Brief(core_message/target_audience/content_goal/target_platforms)→ 生成研究问题 + 搜索关键词 → 建 Research Task。
- 6.4 研究→策划:ResearchItem+Evidence → Research Conclusion → ContentContract + ArgumentTree(core_argument/supporting_points/evidence_map/differentiation)。
- 6.5 策划→脚本:ContentContract+ArgumentTree → Script Outline → ScriptSegment(Hook/Intro/Main Points/Case/Transition/CTA)。
- 6.6 脚本→制作:ScriptSegment → ProductionItem(visual_note→description、asset_requirement→type/required_asset_id、duration_estimate→shooting_duration、subtitle_highlight→subtitle task)。
- 6.7 制作→发布:ProductionItem+Asset → PublishPackage(成片/封面/字幕/配音/截图/B-roll)。
- 6.8 发布→复盘:PlatformVersion → MetricSnapshot(播放/完播/赞/评/藏/转/粉/转化/点击率)→ ReviewReport。
- 6.9 复盘→经验沉淀:ReviewReport → Learning → 写入经验沉淀,反向影响选题/校准/定位(某类选题好→选题中心;Hook 预测失误→校准中心;内容边界调整→定位中心;可复用规律→经验沉淀)。

## 7. 页面一:Project Brief / 立项信息
模块 A 项目基础信息卡(项目名称/来源/来源选题/内容形式/目标平台/时长预估/时间)按钮:编辑/保存 Brief、关联选题、关联内容素材。
模块 B 目标受众卡(目标受众/痛点/误区/动机)按钮:AI 补全受众、从定位中心同步。
模块 C 内容目标卡(内容目标/核心信息/认知变化/行动)按钮:AI 校验目标、应用建议。
模块 D 成功标准(播放/互动/收藏/转粉/转化/自定义)按钮:添加/删除标准、AI 推荐指标。
模块 E 关联内容与资产(选题/资料/素材/历史内容)按钮:添加/移除关联、查看来源。
模块 F 右侧项目进度(当前阶段/进度/任务清单/成员/备注/快速操作)按钮:查看全部进度、进入研究阶段、复制项目、归档项目。
Brief 完成标准:项目名称、目标受众、内容目标、内容形式、目标平台(≥1)、核心信息 均不为空。

## 8. 页面二:研究阶段
模块 A 研究问题(研究问题/核心判断/待验证假设)按钮:AI 生成研究问题、编辑、标记核心。
模块 B AI 搜集素材 按钮:帮我搜素材(建 AITask)、导入链接、上传资料、从知识库添加。
模块 C 趋势与背景 按钮:添加趋势、AI 摘要、标记可用。
模块 D 竞品分析 按钮:添加竞品、AI 分析竞品、提取借鉴点。
模块 E 资料收集(文章/视频/报告/播客/评论/截图)按钮:筛选、添加资料、收藏为证据、丢弃资料。
模块 F 证据收藏 按钮:添加证据、绑定观点、进入策划。
模块 G 研究结论(核心判断/可用证据/对标启发/风险点/不采用资料)按钮:AI 生成研究结论、保存、进入策划。
链路:Brief → ResearchQuestion → ResearchItem → Evidence → ResearchConclusion → ContentContract。

## 9. 页面三:策划阶段
模块 A 内容合同(受众定位/价值主张/核心节奏/行动召唤)按钮:AI 生成内容合同、编辑、锁定。
模块 B 核心论点(核心论点/一句话观点/观众误区/认知转变)按钮:AI 提炼、添加论点、设为主论点。
模块 C 论点树(主论点 - 支持依据/证据/反驳/案例)按钮:帮我搭论点树、添加分支、绑定证据、删除节点。
模块 D 证据地图(论点/关联证据/强度/来源/是否进脚本)按钮:自动匹配证据、标记进脚本、查看来源。
模块 E 内容结构方案(结构类型/开头策略/段落安排/结尾策略/CTA)按钮:生成结构方案、选择此方案、进入脚本阶段。
链路:ResearchConclusion+Evidence → ContentContract → ArgumentTree → StructurePlan → ScriptOutline。

## 10. 页面四:脚本阶段
模块 A 脚本模式(口播/录屏/PPT/混合)按钮:切换模式、生成模式建议。
模块 B 大纲结构(章节标题/段落目标/预计时长)按钮:从策划生成大纲、添加章节、调整顺序。
模块 C 主脚本编辑器(段落类型/口播内容/画面建议/字幕重点/素材需求/时长)按钮:保存、AI 改写、生成金句、生成 B-roll 提示、标记为 CTA。
模块 D 金句卡片(金句文本/使用段落/推荐位置)按钮:添加金句、插入脚本、删除。
模块 E AI 写作建议(结构/表达/节奏/CTA/平台适配问题)按钮:生成建议、应用建议、忽略建议。
模块 F 版本记录(版本号/修改原因/时间/差异摘要)按钮:查看版本、恢复版本、对比版本。
链路:ContentContract+StructurePlan → Script → ScriptSegment → ProductionItem。

## 11. 页面五:制作阶段
模块 A 制作总览(成片/素材准备度/录屏/封面/字幕状态)按钮:从脚本生成制作清单、标记制作完成、进入发布阶段。
模块 B 拍摄/录屏清单(任务标题/对应段落/画面说明/素材要求/状态)按钮:添加制作任务、标记完成、标记缺素材、关联素材。
模块 C 素材缺口(缺截图/录屏/封面/B-roll/案例素材)按钮:去素材中心补充、上传素材、AI 生成素材建议。
模块 D 封面草图(封面标题/风格/主视觉/参考图)按钮:生成封面方案、上传封面、设为发布封面。
链路:ScriptSegment → ProductionItem → Asset → PublishPackage。

## 12. 页面六:发布阶段
模块 A 基础信息(标题/简介/封面/标签/分类/系列/评论设置/草稿/通知粉丝)按钮:保存基础信息、生成标题、生成简介、选择封面。
模块 B 发布平台(平台/账号/发布时间/状态)按钮:添加平台版本、复制为其他平台、确认发布、批量发布。
模块 C 平台预览(B站/抖音/视频号/小红书)按钮:切换平台、编辑平台版本、查看平台建议。
模块 D 发布检查清单(标题/封面/标签/时间/评论引导/合规)按钮:自动检查、修复问题、完成发布。
链路:ProductionItem+Asset → PublishPackage → PlatformVersion → MetricSnapshot。

## 13. 页面七:复盘阶段
模块 A 数据总览(播放/赞/评/粉/完播/点击率/分享/收藏/转化)按钮:导入数据、刷新数据、查看平台表现。
模块 B 预测对照(发布前预测/真实表现/偏差/偏差原因)按钮:关联校准预测、AI 分析偏差、标记判断失误点。
模块 C 内容分析(选题/Hook/结构/表达/素材/标题/封面/发布时间/平台适配)按钮:AI 复盘、添加人工洞察、标记成功点、标记失败点。
模块 D 经验沉淀(经验类型/内容/适用场景/可复用/回流模块)按钮:开始复盘、添加洞察、沉淀为经验、回流到选题中心/校准中心/定位中心。
链路:PlatformVersion → MetricSnapshot → ReviewReport → Learning → TopicRule/CalibrationRule/PositionSuggestion。

## 14. AI 助手介入点
- Brief:AI 补全受众、AI 校验目标、AI 推荐成功标准。
- 研究:AI 搜素材、AI 摘要资料、AI 提取证据、AI 生成研究结论。
- 策划:AI 生成内容合同、AI 搭论点树、AI 匹配证据、AI 生成结构方案。
- 脚本:AI 生成大纲、AI 改写脚本、AI 生成金句、AI 生成 B-roll 提示、AI 诊断脚本。
- 制作:AI 生成制作清单、AI 识别素材缺口、AI 生成封面方案。
- 发布:AI 生成标题、AI 生成简介、AI 检查发布包、AI 生成平台建议。
- 复盘:AI 分析偏差、AI 提炼成功点、AI 提炼失败点、AI 生成经验沉淀。

## 15. 阶段流转规则
- 通用:点击「进入下一阶段」时系统须 (1) 检查必填数据 (2) 检查核心交付物存在 (3) 检查有无未处理严重问题 (4) 生成阶段完成记录 (5) 更新 current_stage (6) 将阶段产物写入下一阶段初始数据。
- 回退:可回退上一阶段,但须提示「修改上游可能影响下游产物,是否同步更新?」;数据影响:创建 ChangeLog、标记受影响产物为 need_review。

## 16. 状态设计
- Project:draft/active/paused/completed/archived
- Stage:not_started/in_progress/completed/needs_review/skipped
- 内容产物:draft/locked/published/needs_revision/archived

## 17. MVP 范围
- 必做:7 个阶段页 + 阶段流转 + Mock 数据 + AI 辅助入口占位 + 主要数据链路打通。
- 不做:真实自动发布、复杂团队协作、平台数据自动抓取、复杂权限、移动端、完整视频剪辑、复杂商业化 CRM。

## 18. 验收标准
- 功能:跑通 立项→Brief→研究→内容合同→脚本→制作清单→发布包→复盘数据→沉淀经验。
- 数据:页面数据来自 service(不硬编码);前一阶段产物可被下一阶段读取;复盘结论可写入经验沉淀;关键产物可通过 project_id 查询。
- UI:左导航统一、顶部阶段导航统一、主按钮位置统一、阶段完成状态清晰、空状态有明确下一步、每页有清晰主任务。

## 19. 核心设计总结
Brief 定方向 / 研究找证据 / 策划定打法 / 脚本变表达 / 制作备素材 / 发布做分发 / 复盘沉淀经验。每个阶段是一条数据链路上的节点,目标是让 CreatorOS 帮创作者形成自己的编导系统。
