# 产品审计 · 定位中心(/positioning)

> 审计日期:2026-07-02 · 方法:宪法对照 + 代码链路(page → island → contract op → transport → service → 表)+ 真机只读验证(dev :3000,curl dispatch)。所有结论带 file:line 或 curl 证据;未验证处显式标注。

---

## 1. 功能定位

**页面替用户完成的任务**:维护「账号级定位母版」——一个 CreatorProfile(5 基础字段 + 6 richer facets + 5 条下游规则)加一条 **append-only 的定位陈述版本链**(oneLiner + 3 关键词 + 产品锚,v1→vN 不可变)。它不是七步流水线中的一步,而是七步的**上游约束源**:`creative-context.ts` 把当前定位 + 5 条规则格式化成 `positioningBrief`,注入 **17 个 AI runner** 的 prompt(topic/script/planning/copilot/calibration/review/…,证据:`grep positioningBrief` 命中 frontend/src/server/ai/ 下 17 个非测试文件;规则注入点 [creative-context.ts:594-607](../../../frontend/src/server/ai/creative-context.ts))。右栏「改规则即改下游所有 AI 的行为」的承诺**是真的**。

**与宪法关系**:合宪法 §1(编导智能体的"懂这个创作者")与 §6/§7(定位作为 ChatBox surface + 数据底座喂定位)。冲突点见 §6(变现文案、数据反推缺失)。

**入口**:侧栏「定位中心」排在「项目」前([sidebar.tsx:69](../../../frontend/src/components/shell/sidebar.tsx))。路由真机可达:`curl /positioning → 200`。

**代码链路总览**:
```
app/(creator)/positioning/page.tsx  (resolveSession → createServerClient(ctx))
  └─ features/positioning/positioning-center.tsx  (server 读 pages.positioning.get)
       ├─ positioning-interactive-region.tsx  (Dialog 三 tab:upsertProfile / createStatement)
       └─ generate-positioning-island.tsx  (AdoptCandidateCard: positioning.generate 全循环)
contract/src/operations/positioning.ts + pages.ts  (7 个 op)
  └─ backend/src/modules/positioning/positioning.transport.ts → .service.ts → .repository.ts
       └─ PG 表 creator_profiles / positioning_statements
AI 触发:persistence-client.ts:2569-2595  (queued positioning.generate → void runPositioningGenerate)
  └─ frontend/src/server/ai/positioning-runner.ts  (Vercel AI SDK runStructuredNode,真 LLM)
```
注:`resolveSession` 是「单机免登录直通」——无 cookie 时以本机主用户(user-zyongzhu)直通([session.server.ts:23-50](../../../frontend/src/lib/session.server.ts)),所以 dev 下页面读到的是 canonical 用户的真库行。

---

## 2. 区块与交互清单

| # | 元素 | 行为 | 接线 | 状态 |
|---|---|---|---|---|
| 1 | 页头「+ 新建定位版本」 | 打开居中 Dialog(三 tab:账号画像/定位规则/定位陈述) | 纯前端开合 | works(真机 HTML 含 3 处触发器) |
| 2 | Dialog·账号画像 tab 表单(人设/领域/目标人群/差异化/能力清单 + 6 facet) | 提交全量 body | `positioning.profile.upsert` → service.upsertProfile → `creator_profiles` UPDATE/INSERT([transport:61-83](../../../backend/src/modules/positioning/positioning.transport.ts)) | works(库中 profile.updatedAt 已被运行时更新,见 §3) |
| 3 | Dialog·定位规则 tab 表单(5 条规则) | 同上,同一 op(第二个 form 实例) | 同 #2 | works;但见 bug-5(跨 tab 编辑丢失) |
| 4 | Dialog·定位陈述 tab(一句话/3 关键词/产品锚/修改原因) | 提交建新版本 | `positioning.statements.create` → createStatementVersion → `positioning_statements` append v(max+1)([service:246-269](../../../backend/src/modules/positioning/positioning.service.ts)) | works(库中 v3/v4 为运行时真建);**修改原因字段不落库**(dead,见 bug-9) |
| 5 | Dialog sticky footer「保存/创建定位/保存新版本」 | `<button form=activeFormId>` 提交当前 tab 的表单 | 同上 | works;但无 disabled/无校验反馈(bug-7)、无错误反馈(bug-6) |
| 6 | Dialog「取消」/ 右上 × | 关闭 | 纯前端 | works |
| 7 | 英雄区「编辑」(ghost 按钮) | 打开同一 Dialog(预填当前 profile) | 同 #2-#4 | works |
| 8 | 英雄区「当前使用 · v4」pill + 最近更新日期 | 展示 currentStatement.versionNumber + profile.updatedAt | `pages.positioning.get` 读 | works(真机渲染「当前使用 · v」) |
| 9 | AI 带「✦ AI 生成定位建议」 | createAITask(taskType=positioning.generate) → 4s 轮询 getTask+listTaskSteps → awaiting_confirmation 进 review | `ai.tasks.create` → dispatch 触发 [runPositioningGenerate](../../../frontend/src/server/ai/positioning-runner.ts)(Vercel SDK `runStructuredNode`,模板 positioning.generate,模型按 capability 用户可配) | works——库中有 2 条真任务:ai-task-2f9238da-1899(awaiting_confirmation,2026-07-01)、ai-task-ec4e900a-44(cancelled,2026-06-28)(curl ai.tasks.list) |
| 10 | review 态「采纳为当前定位」 | confirmTask → ai.service positioning_profile 分支 → upsertProfile + createStatementVersion(createdByType:"ai") | `ai.tasks.confirm` → [ai.service.ts:842-867](../../../backend/src/modules/ai/ai.service.ts) | works 但 **触发 bug-1(清空 facets/规则)**;未真机点击(写操作,不做) |
| 11 | review 态「丢弃」 | 仅重置本地 state 回 idle | 无服务端调用([adopt-candidate-card.tsx:403-417](../../../frontend/src/components/ai/adopt-candidate-card.tsx)) | works 但 **非持久**:任务留在 awaiting_confirmation,下次进页 hydration 复活(bug-3) |
| 12 | 「在对话里聊定位」链接 | query-only 深链 `?copilot=open&surface=positioning&fn=positioning.generate`,就地开 Copilot 浮层 | [copilot-deeplink.ts:29-44](../../../frontend/src/features/copilot/copilot-deeplink.ts);Copilot 侧 surface/fn 均已注册([ai-copilot-content.tsx:383,475,1176-1179](../../../frontend/src/features/copilot/ai-copilot-content.tsx)) | works(接线完整;浮层内行为属 Copilot 页组,未在本组深验) |
| 13 | 版本历史行「复制为草稿」 | 打开 Dialog,statementSeed 预填陈述表单 | 同 #4 | works 但 **打开落在「账号画像」tab,seed 藏在第三个 tab**(bug-4) |
| 14 | 版本历史「AI 建议」outline 徽标 | createdByType==="ai" 才显示 | 读字段 | works;但 Copilot 路径采纳的 AI 版本被标 human(bug-2 附带,溯源失真) |
| 15 | 「设为当前」(不存在) | 代码注释明确:statements append-only,无对应 op,故不放([positioning-center.tsx:497-498](../../../frontend/src/features/positioning/positioning-center.tsx)) | — | 诚实缺席(回滚 = 复制为草稿→存新版;入口埋得深,见 §5-6) |
| 16 | 空态「创建定位」CTA(profile===null 时) | 打开同一 Dialog | 同 #2 | unverified(当前库有 profile,空态未真机触达;代码路径 [positioning-center.tsx:151-170](../../../frontend/src/features/positioning/positioning-center.tsx)) |

AI 建议 review 卡为**只读整条采纳**:positioning 的 resultData 是 `{suggestion}` 而非 `{items[]}`,AdoptCandidateCard 的 CollabField 逐条改/删依赖 `resultData.items` 对齐([adopt-candidate-card.tsx:128-131,256](../../../frontend/src/components/ai/adopt-candidate-card.tsx)),故定位建议**不能在采纳前就地编辑**(优雅降级,非死按钮)。

---

## 3. 数据来源(四桶归类)

页面唯一读 op:`pages.positioning.get` → `positioningService.getPositioningCenter(ctx)` → 用户 scoped repo → PG 表 `creator_profiles` / `positioning_statements`(migration 0003)。真机 curl 返回完整 DTO(见下)。

| 数据 | 来源链 | 桶 |
|---|---|---|
| profile 画像(persona/field/audience/differentiation/capabilities) | pages.positioning.get → creator_profiles 行(id=profile-canonical) | **real**(种子起底,但已被运行时 upsert 覆写:updatedAt=2026-07-01T03:18,persona 与种子文本已不同——真写路径在工作) |
| profile.facets(6 格)/ downstreamRules(5 条) | 同上 | **real(当前为空)**——种子有丰富值([persistence-client.ts:4330-4344](../../../frontend/src/server/persistence-client.ts)),现库中**全空串**,系被运行时 upsert 清空(见 bug-1/2);页面右栏因此渲染「还没有设置定位规则」空态(真机 HTML 证实 rule-card=0) |
| currentStatement / keywords / productAnchors | 同 op,history[0] 派生 | **real**(v4,2026-07-01 运行时创建) |
| 版本历史 v1-v4 | positioning_statements,version-desc | **real**(v1/v2=canonical 种子行 [persistence-client.ts:4348-4373];v3/v4=运行时真建——id 形如 posstmt-ec4e900a/2f9238da,时间戳非 FIXED_NOW) |
| AI 建议卡内容 | ai.tasks.results.list → ai_task_results.resultData.suggestion | **real**(真 LLM 产物;库中有 awaiting_confirmation 真任务) |
| AI 带文案/步骤日志 | ai.tasks.steps.list | **real** |

**结论:本页无 hardcoded 假数、无「规划中」占位;空 facet/rule 直接 drop 不编造。** 唯一 fixture 性质的是 canonical 种子行(v1/v2 + profile 起底)——它们进的是真库真表、与用户数据同链路,分类为「种子起底的真数据」。

真机验证记录:
```
curl POST /api/v1/dispatch {"id":"pages.positioning.get",...}
→ profile.facets 全 ""、downstreamRules 全 ""、history 4 条(v4 human 2026-07-01)
curl /positioning → 200;HTML: positioning-rule-card×0、「还没有设置定位规则」×2、history-row×4(RSC×2)
curl ai.tasks.list → positioning.generate 任务 2 条(1 awaiting_confirmation / 1 cancelled)
```

---

## 4. 数据流向(写路径)

| 交互 | 写到哪 |
|---|---|
| 画像/规则表单保存 | `positioning.profile.upsert` → creator_profiles **全量覆盖**(service 把缺省 facets/rules 规范化为 "" 后 UPDATE,[positioning.service.ts:216-243](../../../backend/src/modules/positioning/positioning.service.ts)) |
| 陈述表单保存 / 复制为草稿保存 | `positioning.statements.create` → positioning_statements append(versionNumber=max+1,createdByType 默认 human) |
| AI 生成 | ai_tasks(queued→running)→ ai_task_results(positioning_profile candidate)→ ai_task_steps |
| 采纳 AI 建议(岛) | ai.tasks.confirm → upsertProfile(**仅 5 字段**)+ createStatementVersion(ai, aiTaskId)([ai.service.ts:848-861](../../../backend/src/modules/ai/ai.service.ts)) |
| 采纳 AI 建议(Copilot 聊天卡) | 直接 client.upsertProfile(**仅 5 字段**)+ client.createStatement(**human**)([chat-result-cards.tsx:218-240](../../../frontend/src/features/copilot/chat-result-cards.tsx)) |
| 下游消费 | creative-context.assembleCreativeContext → positioningBrief(含【定位规则(必须遵守)】块)→ 17 个 runner prompt |

---

## 5. 疑似 bug(带证据,按严重度)

### bug-1(high)采纳 AI 定位建议会**清空** 6 facets + 5 条下游规则
- 机制:AI confirm 分支只传 persona/field/audience/differentiation/capabilities 5 字段([ai.service.ts:848-854](../../../backend/src/modules/ai/ai.service.ts));service 对缺省 facets/downstreamRules 规范化为 "" 并**全量 UPDATE**([positioning.service.ts:224-241](../../../backend/src/modules/positioning/positioning.service.ts));契约注释自认 "absence = keep blank"([contract/src/operations/positioning.ts:34-38](../../../contract/src/operations/positioning.ts))——即 upsert 是「缺省=清空」而非「缺省=保留」。
- 后果:用户精心写的「改规则即改下游所有 AI」的 5 条硬约束 + 6 格母版补全,点一次「采纳为当前定位」全没;下游 17 个 AI 节点随即失去全部规则约束。
- **真库已发生**:种子 facets/rules 有丰富值(persistence-client.ts:4330-4344),现库全空串;右栏真机渲染空态。

### bug-2(high)Copilot 聊天「采纳写入定位母版」同样清空,且版本标记失真
- [chat-result-cards.tsx:218-228](../../../frontend/src/features/copilot/chat-result-cards.tsx) 只传 5 字段(注释自称「写入定位母版(5 facet)」)→ 同 bug-1 清空。
- 且它走公网 `positioning.statements.create`,transport 不透传 createdByType([positioning.transport.ts:94-105](../../../backend/src/modules/positioning/positioning.transport.ts))→ service 默认 **human**——AI 产的版本在历史里**不带「AI 建议」徽标**,飞轮溯源(哪些定位是 AI 演进的)失真。
- 高置信推断(未直接目击):库中 profile.updatedAt=2026-07-01T03:18:23.400 与 v4(human)createdAt=03:18:23.420 相差 20ms,恰是此路径 upsertProfile→createStatement 的背靠背调用形态;岛路径会标 ai,抽屉路径是两次独立人工提交,均不吻合。**本次 facets/规则清空即由此触发**。

### bug-3(medium)「丢弃」不取消服务端任务 → 被丢弃的建议每次进页复活
- 丢弃仅重置本地 state([adopt-candidate-card.tsx:403-417](../../../frontend/src/components/ai/adopt-candidate-card.tsx)),任务仍 awaiting_confirmation;mount hydration 会 resume 任一 in-flight 同类型任务([adopt-candidate-card.tsx:209-253](../../../frontend/src/components/ai/adopt-candidate-card.tsx))。
- **真机现状**:ai-task-2f9238da-1899 自 2026-07-01 起挂在 awaiting_confirmation——用户今天每次打开 /positioning,AI 带都直接弹出这份旧建议的 review 态(极可能是「怪怪的」直接来源之一);且一键就是「采纳为当前定位」= 一键触发 bug-1。

### bug-4(medium)「复制为草稿」打开的弹窗落在「账号画像」tab,seed 藏在第三个 tab
- Dialog 的 tab state 初始恒为 "profile" 且不随 statementSeed/重开重置([positioning-interactive-region.tsx:711](../../../frontend/src/features/positioning/positioning-interactive-region.tsx);`<Tabs key={String(open)}>` 只重挂 Tabs 子树,tab state 在外层)。
- 后果:用户点「复制 v2 为草稿」看到的是画像表单;此刻 footer「保存」提交的是 **profile 表单**(activeFormId=profile)——想复制版本的人一键保存,实际写的是画像。

### bug-5(medium)跨 tab 未保存编辑被静默丢弃/覆写为旧值
- 画像 tab 与规则 tab 是**两个独立 state 的 PositioningProfileForm 实例**(注释自认 "shares no state",[positioning-interactive-region.tsx:167-170,790-815](../../../frontend/src/features/positioning/positioning-interactive-region.tsx)),各自提交**全量 body**。
- 后果:在画像 tab 改了人设→切到规则 tab 改规则→点「保存」:规则实例用**自己未编辑的旧 persona**覆写全行,画像 tab 的编辑静默丢失,弹窗还成功关闭。

### bug-6(medium)useMutation 无 catch:服务端报错零反馈
- [positioning-interactive-region.tsx:70-90](../../../frontend/src/features/positioning/positioning-interactive-region.tsx) `try { await mutate(); … } finally {…}` 无 catch → 失败成未处理 rejection,无 toast、弹窗不关也不提示。典型触发:全新用户直接在「定位陈述」tab 保存 → ProfileRequiredError([positioning.service.ts:200-210](../../../backend/src/modules/positioning/positioning.service.ts))→ 用户只看到「点了没反应」。

### bug-7(low)陈述表单校验静默 no-op
- keywords 三格有空或 oneLiner 空时 submit 直接 return([positioning-interactive-region.tsx:556-557](../../../frontend/src/features/positioning/positioning-interactive-region.tsx));内联按钮有 disabled,但 **Dialog footer 的「保存新版本」永不 disabled 也无错误提示**([positioning-interactive-region.tsx:838-840](../../../frontend/src/features/positioning/positioning-interactive-region.tsx))→ 又一处「点了没反应」。

### bug-8(low)AI keywords 补 "" 可产出空关键词徽标 + React 重复 key
- runner/聊天卡 clampKeywords 不足 3 个补 ""([positioning-runner.ts:108-115](../../../frontend/src/server/ai/positioning-runner.ts);[chat-result-cards.tsx:199-203](../../../frontend/src/features/copilot/chat-result-cards.tsx));contract 只约束 length===3 不约束非空 → 采纳后英雄区渲染空 Badge,且 `key={kw}` 两个 "" 重复 key([positioning-center.tsx:311-313](../../../frontend/src/features/positioning/positioning-center.tsx))。

### bug-9(low)「修改原因」字段收集但不落库
- 代码注释自认「后端 createStatement body 暂无此槽位,故不注入 wire」([positioning-interactive-region.tsx:549-551](../../../frontend/src/features/positioning/positioning-interactive-region.tsx))——用户填了以为留痕了,实际丢弃。诚实的做法是不渲染或标「规划中」。

---

## 6. 设计不合理

| 严重度 | 问题 | 建议 |
|---|---|---|
| high | **upsert「缺省=清空」语义是 bug-1/2 的根因**:契约允许 facets/rules 缺省,但缺省被解释为抹除,跨模块调用者(ai.service、chat card)显然不知情 | service 层改为「缺省=保留现值」(partial merge),或契约把 facets/rules 设为必填让调用方显式决定 |
| high | 页头副标题、空态文案称下游含「**变现**」,陈述表单有「产品锚(产品/项目 id)」——宪法 §8 明确「变现中心:移除」;/monetization 路由仍 200(已出侧栏) | 文案去掉「变现」;产品锚字段要么随变现一起明确去留,要么改口径为「项目锚」 |
| medium | AI 带文案「让 agent 读你的账号上下文与**历史内容**」夸大:runner 实际只读 当前定位 + 账号基本盘(platform/handle/粉丝数,[creative-context.ts:329-341](../../../frontend/src/server/ai/creative-context.ts)),**不读作品/表现/评论**——宪法 §7 要求定位由真实数据反推 | 短期改文案诚实;长期把 works+metrics+评论摘要喂进 positioning.generate 的 facets |
| medium | AI 建议只有 5 字段,与页面 9-facet + 5 规则的信息结构不对齐:即使修了清空 bug,「AI 帮你定位」也永远填不满母版,采纳后大片空 | 扩展 PositioningSuggestion schema 覆盖 facets/rules,或在卡上注明「仅生成基础画像」 |
| medium | 「领域(field)」可编辑、注入下游 prompt([creative-context.ts:580](../../../frontend/src/server/ai/creative-context.ts)),但英雄区 9-facet 网格不含它——填了在页面上**看不见** | 9 格加入领域,或从表单收进 facets |
| low | 版本回滚(设为当前)无直接动作,只能「复制为草稿→改→存新版」;append-only 设计合理但入口语义没教育用户 | 历史行加「基于此版本新建」文案替代「复制为草稿」,或空态 hint |
| low | 「新建定位版本」按钮名与默认 tab(账号画像)不符——想建版本的人要自己找到第三个 tab | 按触发场景设初始 tab(新建版本/复制为草稿 → statement tab) |

---

## 7. 待对齐点(供全局一致性分析)

1. **createdByType 语义分叉**:同一「采纳 AI 定位建议」动作,定位中心岛走 confirmTask 标 `ai`,Copilot 聊天卡直连公网 op 标 `human`——「AI 建议」徽标可信度、飞轮统计口径受影响。其他页组若也有「聊天卡直连 op」模式,需统一走 confirm 门(也更合宪法 §5「AI 只产候选,经 confirm 门物化」——聊天卡路径实质绕过了 confirm 门)。
2. **upsert 语义**:「缺省=清空」在本模块;其他模块(settings/projects patch)多为 partial-merge——全仓需统一 upsert/patch 口径,否则跨模块调用必再踩。
3. **七步编号口径**:page.tsx 头注释称「七步①②」,contract/src/operations/pages.ts:39 称「七步 ③」,sidebar 注释称「七步①②」——定位其实不在七步流水线内(宪法 §4 七步自立项起),各处编号自说自话。
4. **变现残留**:本页文案 + 产品锚 + gate 评分的「锚定产品一致 +25」([positioning.service.ts:176-186](../../../backend/src/modules/positioning/positioning.service.ts))都锚在 monetization 实体上;宪法已移除变现中心,但 /monetization 路由仍可达。需要一次全局决断:产品锚语义保留(改叫项目锚?)还是随变现一起清。
5. **AI 任务「丢弃」的全局语义**:AdoptCandidateCard 是所有 AI 节点共用件,丢弃不取消服务端任务 + hydration 复活是**所有页面共有**的行为——不止定位中心;对齐时应作为共用件问题处理(丢弃应调 cancelTask 或至少本地记忆已丢弃 taskId)。
6. **evaluateGate/fit 徽标**:positioning 模块的 `positioning.gate.evaluate` op 在本页无消费(PositioningFitBadge 只挂 research 等页)——属正常跨页复用,对齐时别误判为死 op。
