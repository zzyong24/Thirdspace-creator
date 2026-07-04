# 所有 AI 功能收敛进 Copilot:统一即时反馈 + 确认门进对话卡

> SPEC 日期:2026-07-04 · 任务:T-103 · 状态:📋 待 MiniMax 过审(改交互架构,gate 通过才开工)
> 用户裁决原话(2026-07-04,入宪级引用):「**所有的 AIGC 功能都在 Copilot 里面去实现,这样子更合理。只是说因为不同的场景,它的 skill 不同,优先注入的上下文也不同。**」以及「比如说编导起草、开始预测、先盲预测,这种功能都是在后台去运行,然后也没有给用户任何反馈。但是我们打开会话,这个就是即时反馈,这种模式我觉得是更合理的。如果说它旁边已有打开会话按钮,那我直接移除掉后台按钮就行了。」
> 三个设计拍板(2026-07-04 AskUserQuestion 已答):①**全站统一改造**——每个 AI 触点都改成「打开 Copilot + 预填对应 prompt」;②**对话内产候选 + 确认卡**——带确认门的功能(盲预测 immutable / 文案审核门)保留确认门,以对话卡形式实现;③**预填不自动发**——延续 T-055b 机制(prefill 进输入框,用户回车才发)。
> 宪法依据:§6 编导对话化(唯一 AI 交互面)· §5 原则 5「人出判断,AI 出草稿苦力」· 铁律②(AI 只产候选,人确认关键产物)。延续同方向已落地任务:T-055b(定位岛任务流按钮退役)· T-094(蒸馏 Copilot 化)· T-096(会话 scope 契约)。

## §0 第一性定位

AI 交互的唯一存在形态:**创作者发一句话,编导在对话里流式回应——推理过程可见、产物即时呈现、关键产物走对话内确认卡采纳。** 后台静默跑 AI(点按钮→无反馈→数据默默落库)违背这一形态:用户看不到编导在想什么、不知道跑没跑、错了不知道错在哪。

本 SPEC 把「散落在各工作台、点了在后台静默跑」的 AI 触点,统一收敛为 Copilot 深链(`copilotDeepLink(surface, functionKey, selection)` + 预填话术),退役后台 `createAITask` 按钮。**这不是新功能,是把已有 AI 能力的入口从「后台弹窗任务流」搬到「对话流式反馈」**——与 T-055b/T-094 同款重构的全站推广。

边界:本 SPEC 只动 **AI 触发入口的交互形态**;AI 节点/runner/确认端点一律不动(能力已在),工具已由 T-104 全放开。

## §0.5 现状盘点(代码实锤,2026-07-04 全站 survey)

全站 12 处 AI 触点,4 类状态:

### A. 已迁移(4 处,作迁移范式对照)
| 工作台 | 触发点 | functionKey | 确认门形式 |
|---|---|---|---|
| 定位 | `generate-positioning-island.tsx` | positioning.generate | ChatPositioningCard 对话内采纳 |
| 复盘 | `review-analyze-island.tsx` | review.analyze | 对话内提炼采纳 |
| 知识蒸馏 | `knowledge-dump-zone.tsx` | knowledge.distill | KnowledgeAtomGate 批量确认卡 |
| 选题出题 | `topic-generate-island.tsx` | topic.generate | ChatCandidateCard 逐条采纳 |

**共同范式**:`copilotDeepLink()` 产相对 href(query-only,不跳页)→ 打开 Copilot 浮层 → prefill + selection(kind/id/title)预调 → 用户回车 → 模型调工具 → 对话卡确认采纳。**确认门全移到对话卡,不再弹窗。**

### B. 需迁移(4 处,本任务范围)
| 位置 | AI 动作 | 现状病灶 | 有无确认门 |
|---|---|---|---|
| `draft-workbench/blind-predict-row.tsx:84` | calibration.diagnose | 后台轮询→静默铸 draft Prediction,无中间反馈 | ✓ immutable(锁定后不可改) |
| `draft-workbench/script-review-gate.tsx:102` | script.review | 后台轮询→读结构化审核报告,无过程反馈 | 审核本身无门;改写建议有 apply 门 |
| `topics/topics-interactive-region.tsx:339/990` | topic.enrich | 后台轮询补全选题卡,无对话入口 | ✓ awaiting_confirmation |
| `calibration/calibration-interactive-region.tsx:306/954` | calibration.score / diagnose | **双入口并存**:后台快路按钮 + 「在对话里诊断」Link | ✓ awaiting_confirmation→预填分数 |

### C. 不纳入(3 处,边界已定)
- `ammo-dump-zone.tsx:121` asset.classify:拖入素材 fire-and-forget 增强,**失败不阻断、无需反馈**——保留后台(体验优化项,非「用户等结果」的 AI)。
- `register-published-form.tsx`:登记链接 + 触发指标采集,**不是 AI**(调度作业)——不纳入。
- `script-review-gate` 的「应用改写」:是把已产出的改写建议 apply 落库(createArtifactVersion),**已有确认门**——迁移随 script.review 一起(报告卡里逐条改写走 ChatHookCard 门)。

## §1 三条设计立场(用户拍板落地)

### 1.1 全站统一改造(拍板①)
每个「需迁移」触点都改成 Copilot 深链形态,**退役后台 `createAITask` 按钮**。触点旁若已有会话入口(如校准的「在对话里诊断」Link)→ 直接移除后台按钮、只留会话入口;若无 → 把原按钮**原地改造**成 Copilot 深链按钮(点击=openCopilot+prefill,不再 createAITask)。

### 1.2 确认门进对话卡(拍板②)
带确认门的功能,门**不消失、改形态**——从「后台任务 awaiting_confirmation + 弹窗/内联采纳」搬到「对话内候选卡采纳」,严守铁律②(AI 只产候选,人确认关键产物)。逐触点:
- **盲预测(immutable)**:对话内 calibration.diagnose 流式产诊断 → 渲**盲预测确认卡**(逐维度分 + 综合判断)→ 人点「锁定」→ `lockPrediction`(既有)写 immutable draft Prediction。**immutable 语义由「锁定」这一次确认动作承载**——锁定前是对话内候选(可重生),锁定后不可改(与现后台流同端点)。
- **文案审核**:对话内 script.review 流式产审核报告 → 渲**审核报告卡**(verdict + findings + 逐条改写建议)→ 改写建议复用 **ChatHookCard 逐条「应用」门**(createArtifactVersion append-only,既有)。
- **选题补全 / 校准给分**:沿用已迁移范式(ChatCandidateCard / 分数预填卡),对话内采纳走既有确认端点。

### 1.3 预填不自动发(拍板③)
所有深链 prefill 进输入框、**绝不自动 sendMessage**(延续 T-055b 机制,机制性消灭「重复两遍」)。用户可先改 prompt 再回车;发出后即流式反馈。深链必带 selection(kind/id/title)预调上下文,**免得编导反复索要标题/ID**(如稿面盲预测带 content_output id + 项目标题)。

## §2 统一迁移范式(单一真值,禁各触点各写各的)

```
触点按钮 onClick
  → copilotDeepLink(surface, functionKey, { kind, id, title })   // 相对 href,query-only 不跳页
  → openCopilot(浮层/稿面右栏)+ prefill 话术进输入框(不自动发)
  → 用户回车 → 模型按 functionKey 置顶预调对应工具(T-104 后全工具可调、functionKey 只置顶)
  → 工具流式产候选 → 对话卡渲染(候选/报告/诊断)
  → 人在卡上确认(采纳/锁定/应用)→ 走既有确认端点落库(铁律②)
```

- **深链函数单一真值**:复用已有 `copilotDeepLink()`(已迁移四触点在用);新触点一律走它,不新造。
- **prefill 话术**:每触点一句(如盲预测「基于这份内容,给一个发布前盲预测诊断」),集中定义,不散落。
- **场景差异只体现在 skill + 优先注入上下文**(用户原话):surface 决定基础 skill(system 提示词)+ 优先注入的 CreativeContext facet + functionKey 置顶工具;**工具集不再分场景收窄**(T-104 已放开)。

## §3 逐触点迁移设计

| 触点 | 改造 | 新对话卡 | 确认端点(既有) |
|---|---|---|---|
| 盲预测 `blind-predict-row.tsx` | 按钮改 openCopilot(surface=draft, fn=calibration.diagnose, sel=content_output)+ prefill;退役 createAITask 轮询 | **盲预测确认卡**(逐维度分+综合判断+「锁定」)| lockPrediction |
| 文案审核 `script-review-gate.tsx` | 按钮改 openCopilot(fn=script.review, sel=content_output)+ prefill;退役后台轮询 | **审核报告卡**(verdict+findings)+ 改写走 ChatHookCard 门 | applyRewrite / createArtifactVersion |
| 选题补全 `topics-interactive-region.tsx` | 两处「补全选题卡」改 openCopilot(fn=topic.enrich, sel=候选)+ prefill | 复用 ChatCandidateCard/enrich 卡 | candidates confirm |
| 校准诊断/给分 `calibration-interactive-region.tsx` | 移除后台快路按钮,只留会话入口(统一到对话);给分预填走对话卡「采纳分数」 | 复用诊断卡 + 分数采纳卡 | calibration confirm |

**盲预测/审核需新增 2 张对话卡**(盲预测确认卡、审核报告卡);其余复用既有卡。新卡走 T-104 后的 chatbox 工具结果 kind 分发(ai-copilot-content dispatch),与 T-084b/c 加卡同法。

## §4 边界

- **不纳入**:asset.classify(后台增强、失败不阻)、register-published(非 AI)。
- **能力零改**:calibration.diagnose/score、script.review、topic.enrich 的 AI 节点/runner/确认端点全部复用,本 SPEC 只改**入口交互形态**。
- **稿面右栏 Copilot**:稿面(draft surface)已有嵌入式 AICopilotContent(T-055b),盲预测/审核的深链落它;非稿面触点落全局 Copilot 浮层。
- **与 T-099 边界**:T-099 补的是 context.* 只读查询工具(模型摸数据);T-103 改的是产候选 AI 的触发形态。二者正交:T-103 迁移后的对话里,编导可用 T-099 的 context 工具取全上下文再产候选。
- **与 T-104 边界**:T-104 已让每个 Copilot 全工具可调;T-103 的 functionKey 只负责「置顶预调」对应工具,不再收窄。

## §5 切片(拆 BACKLOG,每片 0→1)

| 切片 | 内容 | 依赖 |
|---|---|---|
| T-103a 盲预测进对话 | blind-predict-row 改深链 + 盲预测确认卡(逐维度分+锁定=immutable)+ 退役后台轮询 | 无 |
| T-103b 文案审核进对话 | script-review-gate 改深链 + 审核报告卡 + 改写复用 ChatHookCard 门 + 退役后台轮询 | 无 |
| T-103c 选题补全 + 校准统一 | topic.enrich 两入口改深链;校准移除后台快路、统一对话(给分预填卡)| 无 |

三片独立可并行,但都改 ai-copilot-content 工具卡分发(共享文件)→ 串行或划禁区。每片交付即对应触点由「后台静默」翻「对话即时反馈」。

## §6 全局约束
- **只改入口,不改能力**:AI 节点/runner/确认端点复用;工具已 T-104 全放开。
- **确认门不消失**:immutable(盲预测锁定)、审核改写 apply 门,以对话卡形态保留(铁律②)。
- **预填不自动发**(T-055b 机制);深链必带 selection 预调,免索要 ID。
- **场景差异 = skill + 优先注入上下文**,不再按场景分叉调用路径。
- **诚实**:未配模型/失败在对话卡内诚实提示(去设置),不假跑;中文文案;dev 改 server 代码须重启。
- **契约零删除**;每片三包测试全绿 + 真机验收。

## §7 验收标准(可验证断言)
1. **无后台静默 AI**:盲预测/审核/选题补全/校准诊断的原后台 `createAITask` 按钮全部退役或改深链;grep 确认这些触点不再直接 createAITask(改走 openCopilot)。
2. **即时反馈**:点盲预测 → Copilot 打开、prefill 到位(不自动发)、回车后流式见编导逐维度诊断过程(真机录屏)。
3. **确认门保留**:对话内锁定盲预测 → DB 写 immutable Prediction(与原后台流同端点、同 immutable 语义,SQL 抽查);审核改写逐条 apply → createArtifactVersion append-only。
4. **selection 预调**:深链带 content_output id + 项目标题 → 编导不再索要 ID/标题(prompt 抓包可见 selection 注入)。
5. **边界守住**:asset.classify 仍后台 fire-and-forget、register-published 未动。
6. 三包测试全绿;每个迁移触点真机走一次(截图归档 `frontend/docs/t103-*/`)。
