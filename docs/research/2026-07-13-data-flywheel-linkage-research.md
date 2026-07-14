# 数据飞轮串联核查:拆解→复刻→复盘→再选题 到底通没通

> 调研日期 2026-07-13 · 触发:用户问「数据有没有串联起来(爆款拆解→拆解后复刻/模仿)+ 数据之间的关联」。
> 方法:3 个只读子代理并行,用 codegraph 追真实读写两端(runner→confirm→repo→reader→生成节点),不看提示词猜。
> 结论层级:✅ 真串联 · ⚠️ 半串联(写了没人读/接了但有闸) · ❌ 断链孤岛(只存不被任何生成端读回)。

## 0. 一句话总结(拍板给用户看)

**「给你一条新选题」这条通了;「把爆款为什么爆的拆解 / 本账号可复用公式 喂回创作(复刻/模仿)」这条没通。**
- 选题级数据真串联:benchmark 转化选题、attribution 实验选题都进 candidates→选题页;reconstruct 的策划/研究物化成真 artifact 被生成端读回。
- 知识/要素级产出以断链为主:benchmark 爆款拆解要素**彻底孤岛(不落库)**;attribution 的 reusable_formula **半串联(落表却无任何读端)**;复盘经验回流被**两道人工闸 + validated-only 过滤**卡住,人不点=对下一次生成影响为 0。

## 1. 拆解→复刻链路(对标 + 自作品)

| 节点 | 产出 | 写入 | 回流读端 | 判定 |
|---|---|---|---|---|
| benchmark.teardown · 转化选题(fit=high) | 换角度新选题 | createCandidate(source=benchmark)→ candidates 表(runner:206 / pc:5471) | topics.overview→选题页 | ✅ |
| benchmark.teardown · 6 段拆解(钩子/结构/为什么爆/可借鉴/适配) | 爆款要素 | **无落库**,runner 只取 `转化选题` 其余字段丢弃(runner:197-198);host `void ...` 不建 ai_task(pc:5450) | 无 | ❌ 孤岛 |
| topic.attribution · next_experiments | 实验选题 | createExperimentCandidate(source=demand)+card.attributionId(runner:377/pc:5312) | 选题页「实验」徽标 | ✅ |
| topic.attribution · reusable_formula / why_worked / structure_formula | 本账号可复用公式 | saveAttribution→topic_attributions 表(repo:91-105) | 唯一读 op `topics.attributions.list` **无任何 FE 调用**;creative-context/topic.generate/script.draft 都不读 | ⚠️ 写了没人读 |
| reconstruct.project · planning(thesis_tree) | 反推论点树 | materializeReconstructed→artifacts(thesis_tree@planning, origin=reconstructed, runner:293) | creative-context 读回成 thesisBrief(带「未确认」标)→喂 planning.contract/outline | ✅ |
| reconstruct.project · research(trend_analysis) | 反推备料 | artifacts(trend_analysis@research, origin=reconstructed, runner:283) | 研究工作台按 stage 读回 + origin 守卫 | ✅ |

补:reconstruct 是三者中唯一走 dispatch(建 ai_task)的;benchmark.teardown 与 topic.attribution 都是采集 job 尾部 `void().catch()` fire-and-forget,连 ai_task_results 都不落,产出纯内存态。

## 2. 复盘→learnings→回流闭环

**写端(全部落 status=candidate)**:review.insights(review-runner:148→confirm ai.service:863→createLearning)、ChatBox learning.capture、改稿 edit_delta、Reviews→Learnings 桥;seed 里仅 2 条直接 validated。
**读端(全部走 getSuggestions,只读 validated)**:script.draft ✅、topic.generate(learningsConstraint)✅、topic.enrich ✅、planning.thesis/contract ✅、calibration.diagnose ✅、Copilot/chat ✅、每日选题 collector ✅。
**两道人工闸**:① learning_list 候选要人点「采纳」才落库(全站无 auto-confirm);② learnings 默认 candidate,唯一晋级入口 evaluateLearning 由复盘页/经验页「裁决」按钮触发,无任何自动 candidate→validated。
**判定 ⚠️**:写端读端物理上都接通、都真注入 prompt,但复盘经验**没人手动采纳+裁决 → 对下一次生成实际影响 = 0**(除 2 条 seed)。这是 SPEC §3「candidate 不进 prompt」的设计,不是 bug,但产品含义是飞轮默认转不起来。
**更正**:calibration.score **不产 learnings**,它写 calibration_result(盲预测 vs 真实指标),喂的是校准那条另一回路。
**真实数据确认**:指标(metric_snapshots.rawMetrics)、评论(audience_signals source=comment,T-007 真抓)、逐字稿(output_script transcript)均真采真读,非 fixture。

## 3. 生成中枢 creative-context 到底串了什么

`assembleCreativeContext`(creative-context.ts:397)是所有生成节点的上下文装配中枢。
**进了中枢的沉淀**:positioning、learnings(仅 validated)、knowledge(distill 原子,相关性检索,T-182a 曾漏接已补)、audience_signals(评论)、trend 登记信源信号、platform_accounts、素材库 assets、用户第一手资料、thesis/contract/outline 策划产物、立项 Brief 硬锚、复盘对象真材料(仅复盘/封面链)。
**没进中枢(断链)**:
1. benchmark.teardown 拆解要素——只进候选池,不回读(grep benchmark|teardown 在 creative-context 零命中)。
2. topic.attribution 归因公式——落 topic_attributions,公式不回流任何生成上下文。
3. 未经采纳+验证的复盘 insight——断在 learnings 的 validated 门之前。
4. **选题裸奔**:topic.generate 走 `runTopicGenerateV2` 时 `projectId=null`(topic-task-adapter:193),所有项目态 facet(thesis/contract/outline/brief/materials)结构性拿不到,选题只吃账号态 4 源(positioning + comments/knowledge/trend 之一)。
**basis 更正**:topic.generate 实际 basis 只有 positioning/comments/knowledge/trend;**不存在 basis=benchmark、不存在 basis=demand**。benchmark 是独立管线直接进候选池,与 creative-context 两套不相干机制。

## 4. 断链清单(可转任务)

- **G1【❌ 最痛】benchmark 爆款拆解要素不落库**:钩子拆解/结构拆解/为什么爆/可借鉴点 全丢,复刻时无从读回参照。这正是「拆解→复刻/模仿」的核心断点。
- **G2【⚠️】attribution 可复用公式写了没人读**:reusable_formula/structure_formula 落 topic_attributions 却无读端,写完即沉。
- **G3【⚠️】复盘经验被两道人工闸卡住**:candidate→validated 全靠手点,飞轮默认不自转。
- **G4【⚠️】选题裸奔**:topic.generate projectId=null,吃不到项目态策划/立项沉淀。

## 5. 待拍板

上述断链如何接通(补哪几条链、benchmark 拆解要素落哪张表/怎么回流、attribution 公式做只读展示还是喂进生成、复盘是否加自动晋级阈值、选题是否传 projectId)——**方案未定,待用户选定方向后拆 Task 落 BACKLOG(T-284)**。本调研只给现状事实与证据,不预设改法。
