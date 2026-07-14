# 数据飞轮串联:现状 → 目标(交接文档)

> 2026-07-13 · 供接手实现的 agent 照做。**本文档只讲「是什么现状 / 要变成什么」**;
> 逐链设计与验收细节看 SPEC:[docs/superpowers/specs/2026-07-13-replication-loop-linkage-design.md](../superpowers/specs/2026-07-13-replication-loop-linkage-design.md)。
> 现状证据(codegraph 追证,含 file:line):[2026-07-13-data-flywheel-linkage-research.md](2026-07-13-data-flywheel-linkage-research.md)。
> BACKLOG 任务:T-284a / T-284b / T-284c / T-284d。

---

## 一、当前现状

![数据串联地图·现状](assets/flywheel-current.svg)

用户的原始问题:「数据有没有串联起来?爆款拆解 → 拆解后复刻/模仿,数据之间的关联」。三个只读子代理用 codegraph 追真实读写两端,结论:

**通了的(绿):选题级数据真串联。**
- `benchmark.teardown`(对标拆解)产的「转化选题(fit=high)」→ `createCandidate(source=benchmark)` → 候选池 → 选题页。
- `topic.attribution`(自作品归因)产的「实验选题(next_experiments)」→ `createExperimentCandidate` → 候选池。
- `reconstruct.project` 反推的策划/研究 → 物化成真 artifact(origin=reconstructed)→ creative-context / 工作台读回。
- 生成端 `script.draft` 若走完整策划链,能拿到 positioning + knowledge + 论点树/合同/结构 + 立项硬锚 + 用户素材(接地充分)。
- 真实数据(metric_snapshots 指标 / audience_signals 评论 / output_script 逐字稿)是**真采真读**,非 fixture。

**断了的(红/橙):要素级回流断,复刻/模仿闭环不通。** 这正是用户问的「拆解 → 复刻」的核心缺口。
- **G1【❌ 最痛·孤岛】** `benchmark.teardown` 的 6 段拆解里,runner 只取「转化选题」,其余 5 段(钩子拆解/结构拆解/为什么爆/可借鉴点/适配建议)**全丢**,连 ai_task_results 都不落。→ 复刻时无从读回「这条为什么爆、结构怎么编」。
- **G2【⚠️ 写了没人读】** `topic.attribution` 的 `reusable_formula`/`structure_formula` 落 `topic_attributions` 表,但唯一读 op 无任何 FE 调用,生成端也不读 → 「本账号可复用公式」写完即沉。
- **G3【⚠️ 卡人工闸】** 复盘经验 `learnings` 默认 `candidate`,生成端 `getSuggestions` 只读 `validated`,candidate→validated 全靠人工「采纳 + 裁决」两道闸 → 人不点 = 复盘对下一次生成影响为 0(除 2 条 seed)。
- **G4【⚠️ 选题裸奔】** `topic.generate` 走 `runTopicGenerateV2` 时传 `projectId=null` → 所有项目态沉淀(thesis/contract/outline/brief/materials)结构性拿不到,选题只靠账号态 4 源。

**一句话现状**:「给你一条新选题」这条通了;「把爆款为什么爆的拆解 / 本账号可复用公式 / 复盘经验 喂回写文案(复刻/模仿)」这条断了。飞轮转了半圈。

---

## 二、预期效果(补链后)

![数据串联地图·补链后目标](assets/flywheel-target.svg)

四条断链接通后,三类高价值沉淀全部回流到生成中枢 `creative-context`,写文案 / 选题时**站在前面所有沉淀之上**生成:

- 写文案(`script.draft`)复刻某爆款时,prompt 里带着**原爆款的「为什么爆 + 结构拆解 + 可借鉴点」**(诚实门:仅作结构参照,禁照搬原文案)。
- **本账号被验证过的可复用公式**(归因产)自动进创作上下文。
- **有真实发布数据背书的复盘经验**自动流进下一次生成,不再卡人工裁决 → 飞轮自转。
- 项目内出题吃得到该项目的策划/立项沉淀,选题不再裸奔。

净效果:**「拆解爆款 → 复刻 → 发布 → 复盘 → 再选题」真正接成一个自转的环**——即产品定位的「品味对齐飞轮」。

---

## 三、四切片对照(接手 agent 照此做)

| 切片 | 断点 | 改法(现状→目标) | gate 状态 |
|---|---|---|---|
| **T-284a · G1** | 爆款拆解要素孤岛 | benchmark-teardown-runner 把 5 段拆解写进该候选 `card.teardown`(复用 jsonb,**createCandidate 后再 patchCandidate 补写**,无新表)→ 立项复制进 `project.briefDetail.benchmarkRef` → creative-context 新 `benchmarkRefBrief` reader(项目态)注入 `script.draft`/`planning`「对标参照·复刻用」段(诚实门段头:禁照搬)。非复刻 project 该段空。 | ✅ 过审可开工 |
| **T-284b · G2** | 可复用公式写了没人读 | attribution runner 产公式(有逐字稿依据)→ **capture 成 learning**(candidate;溯源拼进 `insight` 尾注,**不是写独立字段**——learnings 表无 sourceNote/attributionId)复用 learnings→creative-context 回流;+ 把 `topics.attributions.list`(现零 FE 调用)接进归因/复盘页展示公式明细。 | ✅ 过审可开工 |
| **T-284c · G3** | 复盘经验卡人工闸 | 【用户选定 **G3-A**】保留创建时人工采纳门(第一道);对 candidate→validated 第二道闸加判据:learning **有真实 metric_snapshots / 逐字稿背书**(来自已发布作品复盘 / 有逐字稿的归因)→ 打 `evidenceStrength=grounded` → 自动 `validated` 进生成;凭空 AI 推断的仍留 candidate 人工裁决。判据在 capture 时从既有数据算,加一个派生标志/枚举列,不新建表。**⚠️ 原「confidenceScore≥0.7 自动晋级」被 gate 判空转作废(该分循环定义、新 learning 恒为 0),别照它做。** | ✅ 方案已定(G3-A),可开工 |
| **T-284d · G4** | 选题裸奔 | `topic.generate` 的 dispatch 在**有项目上下文**时(项目内选题面 / chat scoped 到 project)透传真 `projectId` 给 `assembleCreativeContext`;账号态选题会(无 project)保持 `null`(本无项目态数据,行为正确)。纯 plumbing。 | ✅ 过审可开工 |

四切片相互独立、各自可验收(非阶段化减法)。铁律守:AI 产候选走确认门(G3-A 只放行有客观真实数据背书的,不放行 AI 空想);多模型可配;诚实门(他号拆解禁照搬)。

---

## 四、交接须知

- **spec-review gate 已过**(verdict CONCERNS,6 findings 全部代码实证、已逐条处置;记录见 SPEC §7)。跨模型 reviewer(Sonnet)已核实「零新表 / 复用已有件」属实。四切片均可开工。
- **G3 方案已由用户拍板 = G3-A**(有真实数据背书才自动晋级)。别再用 confidenceScore 阈值那套(空转)。
- **动手前先 codegraph/读码反证**(verify-exists-before-building 铁律):本仓有并行会话在改同一 BACKLOG/代码,开工前重读对应任务行 + 目标文件,防重复造 / 撞已改。
- 关键文件锚点(详见 research 文档 file:line):`benchmark-teardown-runner.ts`、`candidate.service.ts`(createCandidate/patchCandidate)、`topic-attribution-runner.ts` + `topic_attributions` 表、`learnings.service.ts`(getSuggestions/evaluateLearning/createLearning + `computeConfidence` 循环坑)、`creative-context.ts`(assembleCreativeContext + resolveContextDeps)、`topic-task-adapter.ts`(runTopicGenerateV2 的 projectId=null)。
- 每切片 DoD:改完**真机验证那条行为本身**(dev server 重启 + 真链路 dispatch 看数据真回流,别只单测过)——改服务端/ai-worker 单例持旧模块,单测过≠live 生效。
