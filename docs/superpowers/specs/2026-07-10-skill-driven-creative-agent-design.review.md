# SPEC 审核记录:skill-driven-creative-agent-design(L1/L2 = T-182~T-186)

- **被审 SPEC**:`2026-07-10-skill-driven-creative-agent-design.md`
- **审核日期**:2026-07-10
- **裁决**:✅ **PASS**(可开工 T-182~T-186;两条须按"复用既有"接线,不重造)
- **审核范围**:重点 L1/L2 改架构切片(T-182 飞轮补断链 / T-183 改稿 delta / T-184 声明式 context 注入 / T-185 访谈式自定义 Skill)。L3/L4/L5(T-176~T-191)为已实现的地基层,作背景。

## review_mode:双通道(cross-family + 代码接地核查)

单一文本 reviewer 够不到"不造轮子/已存在"维度(跑不了 codegraph),故本次用双通道互补:

### ① cross-family(MiniMax,`mmx text chat`)
- **verdict:PASS / findings:[]**
- summary:飞轮主轴对齐宪法定位(§3 飞轮复利);架构分层合理;复用仓内已有实现(带 file:line 锚点);Task 拆分具体可执行;无范围缩水。
- **覆盖维度**:合定位 / 方案合理性 / 完整性可执行 / 范围缩水。
- **盲区(诚实标注)**:MiniMax 是纯文本 chat,**无法执行 codegraph/grep**,故"不造轮子 / X 已存在 / X 无实现"这一维**未由 MiniMax 验证**——由通道 ② 补。

### ② 代码接地核查(同仓 subagent + codegraph/grep + Read,防重造闸门)
逐条核实 SPEC 里"断链/无实现"断言是真缺口还是已存在。结论:5 条断言全属实(0 需撤销),2 条须按"复用既有"接线。

| CLAIM | 任务 | 判定 | 证据 | 处置 |
|---|---|---|---|---|
| 1 | T-182a script.draft 漏 knowledge reader | **CONFIRMED-GAP(1 行接线)** | `persistence-client.ts:2627-2670` `runScriptDraft` deps 无 `knowledge`;对比 `topic.generate`(:2327)已注入;下游 `KnowledgeReader`/`assembleCreativeContext`/`runScriptNode(knowledgeBrief)` 全就绪;`script-runner.ts:111-114` 有 `[T-182 待接]` 自认领注释 | 接线:`runScriptDraft` deps 加 `knowledge: knowledgeReader`(binding 已在 :2137) |
| 2 | T-182b 复盘评论账号级 `void projectId` | **PARTIAL(描述须改)** | `persistence-client.ts:1990-2005` reader 选了账号级;但 per-work 归属**已建齐**:`audienceSignals.publicationId` + `listCommentsForPublication`(`candidate.repository.ts:488`)+ 索引 `ix_audience_signals_pub`,别处已用(`:3805`),ingestion 已回填 publicationId | [gate-F1] **任务描述从"没做/无外键"改为"reader 未接已有 per-work 查询"**;接既有查询(仿 metrics reader :2593 project→publications→逐 pub),**别改数据模型** |
| 3 | T-182c trend 空壳 | **CONFIRMED-GAP** | `topic-task-adapter.ts:67-72` trend 分支 basisBrief 落 `""`;`topic-node.ts:48-53` 仅静态 hint;`topic-generate` 模板 tools 空→无检索 | [gate-F2] 可开工,但**复用 T-126 rss/browser search adapter**(`persistence-client.ts:5282-5284`)装配 basisBrief,**别重造采集** |
| 4 | T-183 改稿 delta 捕捉 | **CONFIRMED-GAP** | `learnings.service.ts` 仅 create/promote/patch 三口径,无 edit-diff 捕捉;chat-tools ~20 工具无编辑差异捕捉;稿面门 `script-review-gate.tsx` 走 restoreArtifact 不产 learning | 可开工;埋点面二选一(稿面存版本时 diff / 改写门采纳时),新增 learning source 仿 `promoteReviewInsight` |
| 5① | T-184 声明式 context 注入 | **CONFIRMED-GAP** | `template.ts:27-51` `requiredFacets` 仅 bind 时非空校验(`:78-85`),非"上下文来源声明",不驱动装配;仍逐节点硬接线(CLAIM-1/2 漏接根因) | 可开工;加"上下文需求声明"字段 + 装配层按声明注入 reader,根治漏接 |
| 5② | T-185 访谈式自定义 Skill 多轮 elicitation | **CONFIRMED-GAP** | 全仓无 elicit/多轮/custom skill authoring 命中;chat-runner `maxSteps:2` 产候选即止;"Skill"=代码内 template+override,无用户多轮访谈创作机制 | 可开工;新建 elicitation 流程 + 落成 template/override |

## 逐条裁决(人裁决)

- **[gate-F1](CLAIM-2,major→接受)**:T-182b 任务描述误导("无 per-project 外键"),会诱导重造数据模型。**裁决:改任务描述为"reader 未接已有 per-work 查询",实现走 `listCommentsForPublication` 复用,零 schema 变更。**(已在 BACKLOG 更新)
- **[gate-F2](CLAIM-3,minor→接受)**:trend 实现须复用 T-126 rss/browser adapter,不重造采集。**裁决:接受,开工时装配既有 adapter 结果进 basisBrief。**
- **CLAIM-1/4/5**:真缺口,方向合宪(§3 飞轮 / §6 编导对话化),可开工。CLAIM-1 为 1 行接线优先做。

## 结论
- **可开工**:T-182(切 3 子项:a=接 knowledge 1 行 / b=接 per-work 评论 / c=trend 复用 T-126)→ T-183 → T-184 → T-185。
- **需撤销的重造任务**:无。
- **防重造红线**:CLAIM-1 用既有 `knowledgeReader`;CLAIM-2 用既有 `listCommentsForPublication`(不改 schema);CLAIM-3 用既有 T-126 adapter(不重造采集)。
