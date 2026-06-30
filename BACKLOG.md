# CreatorOS 任务看板(BACKLOG)

> **单一执行真相。每个会话必读(SessionStart hook 自动注入)。** 规则见 `CLAUDE.md` 的「任务流程铁律」。
> 状态:📋 待办 · 🔨 进行中 · ✅ 完成 · ⏸️ 搁置。
> 读取顺序:**本看板 → 任务引用的 SPEC → 代码**。
> 铁律:需求即任务(提了就建);开工从看板顶取;做完改状态+提交;**禁止 P0/P1 分级、禁止多阶段执行**,任务清楚即起 Workflow/并行 subagent 一次做完。

## 🔨 进行中 / 📋 待办(按执行顺序,从上往下取)

| ID | 任务 | 状态 | 文档 | 一句话 |
|---|---|---|---|---|
| T-013 | Harness 宪法 + 卡位 | ✅ | [产品定位.md](docs/产品定位.md) | 宪法立(docs/产品定位.md)+ 看板 + SessionStart hook + 执行策略入 CLAUDE.md + 固化进 orchestrator skill。done |
| T-012 | SPEC 审核 gate | 🔨 | orchestrator `prompts/spec-reviewer.md` | reviewer 角色+findings schema 已定;**剩**:接 MiniMax(spec.review capability)+ "没过审不准开工" enforcement hook。先跑一轮审现有 SPEC |
| T-001 | 数据底座:已发布作品导入历史项目 | ✅ | [data-foundation-and-director-chatbox §1](docs/superpowers/specs/2026-06-30-data-foundation-and-director-chatbox-design.md) | `9010166` projects.source+platformRef+迁移0008+ensureImportedProject+refresh改;契约88+后端87+前端31绿。done |
| T-002 | B2 编导自动评分 | ✅ | [同上 §5](docs/superpowers/specs/2026-06-30-data-foundation-and-director-chatbox-design.md) | 真实指标 → 维度分 → 预填录入,人审核 |
| T-003 | 三方向读侧接真(底座→各模块) | 📋 | [同上 §2](docs/superpowers/specs/2026-06-30-data-foundation-and-director-chatbox-design.md) | 校准/选题评论/定位/知识库/首页 读真,mock 让位 |
| T-004 | ChatBox 进化(上下文感知) | 📋 | [同上 §3](docs/superpowers/specs/2026-06-30-data-foundation-and-director-chatbox-design.md) | Copilot→useChat + ChatContext 三层注入 + 首波 5 工具 + 指挥/画布 |
| T-005 | Skill 三位一体 + 每轮 schema 约束 | 📋 | [同上 §4](docs/superpowers/specs/2026-06-30-data-foundation-and-director-chatbox-design.md) | 模板⊕工具⊕Zod schema + JSON Schema 配置口子 |
| T-006 | research.gather_material 迁 Vercel | ✅ | [同上 §6](docs/superpowers/specs/2026-06-30-data-foundation-and-director-chatbox-design.md) | 去最后一个 Claude Agent SDK 依赖 + 门卫断言 |
| T-007 | 任务调度系统 + 调度页面 | 📋 | [data-source-pipeline-design](docs/superpowers/specs/2026-06-30-data-source-pipeline-design.md) | 定时采集 prompt+scheduler → 唤醒 Agent → CDP 采集(**曾被丢的需求**) |
| T-008 | 横竖屏:平台退回发布层 | ✅ | [project-lifecycle-0to1-spec](docs/superpowers/specs/2026-06-30-project-lifecycle-0to1-spec.md) | `6db68d8` SKL-08 立项不强制平台 + SKL-09 关系表为唯一真值(patch 同步,jsonb 降级镜像)+ §8 发布层手动加平台/标签真增删。契约88+后端85+前端461绿。done |
| T-009 | SEAM-01/02 策划→脚本上下文 | 📋 | [project-lifecycle-0to1-spec](docs/superpowers/specs/2026-06-30-project-lifecycle-0to1-spec.md) | 阶段交接缝(原 #186) |
| T-010 | 误导文案 / 桩字段清扫 | 📋 | [product-workflow-and-triage](docs/superpowers/specs/2026-06-30-product-workflow-and-triage.md) | 含项目概览硬编码"AI Native Browser"假副标题(原 #187) |
| T-011 | CollabField 候选逐字内联编辑(COLLAB-01) | 📋 | [同 ChatBox §human-in-loop](docs/superpowers/specs/2026-06-30-data-foundation-and-director-chatbox-design.md) | 采纳前可改字段(逐条删已完成) |

## ✅ 已完成(粗粒度,倒序)

| 任务 | 文档 |
|---|---|
| 抖音采集重写(launchPersistentContext + 扫码登录,去 connectOverCDP)+ http-transport 错误透传 | [douyin-collection-approach(memory)] |
| 飞轮 FLY-02(后端建真 run 保 §C-4 + computeDeviation 修 + 前端录入表单) | data-foundation §5 |
| 编导起草(一句话→AI 补全选题卡,填表→审稿) | data-foundation §3 |
| 横竖屏(画幅 enum + 立项工作台 + 喂写文案 AI) | project-lifecycle-0to1-spec |
| CollabField COLLAB-02(候选逐条可删,采纳前 patch) | project-lifecycle-0to1-spec |
| 脊柱-1 提示词模板系统 + 8 AI 节点迁 Vercel SDK + 步骤日志 | project-lifecycle-0to1-spec |
| brief 立项阶段 + 工作台 | project-lifecycle-0to1-spec |
| 选题中心三栏 + 4 出题 + 富候选卡 + enrich | (选题中心大改) |
| 校准中心三栏 + 维度评分 + 盲预测 | (校准中心大改) |
| 定位中心(9 facet + 规则卡 + 居中弹窗) | (定位中心大改) |
| 数据持久化 PG + 对象存储 MinIO + 模型配置(可切模型) | p1-persistence-foundation-design |
| 真实抖音 fixture(46 作品 + 创作链 + 账号画像) | (导出真实抖音数据) |
| Dashboard 飞轮驾驶舱 + 脚本编辑器 + Copilot 全局助手 + 各页读侧做真 | (Wave 1-4) |
| 学习系统 / 内容合成 / 平台账号 / 内容日历 / 用料链 / 素材库 / 阶段状态机 | (各模块垂直切片) |
| 变现中心移除 | (产品定调) |

> 注:历史里的 180+ 条微任务已归档到上面粗粒度条目;细节见 git log 与各 SPEC。
