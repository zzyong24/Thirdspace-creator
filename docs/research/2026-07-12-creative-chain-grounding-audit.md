# 全链路审计:创作链 AI 上下文与工具接地(2026-07-12)

> 来源:用户从零真用,连环逼出编导「编数字/漂移/工具误接/悬空」。用户 `/goal`:全链路排查创作链(选题→论点树→写稿→封面→视频)的 AI 上下文与工具,定位病灶,逐个修复。5 路并行审计(只读),本文归档诊断 + 修复计划。关联批次任务 T-262~T-271。

## 一句话根因

**编导的创作生成链是「悬空 + 断路」的**:立项 Brief 在读取端就被丢掉、生成子调用各自隔离拿不到 brief/素材/诚实约束、论点树两头都是死代码、整稿同步跑必超时、写稿输出零可溯——于是弱模型**编数字、漂移离 brief、拿别的工具冒充**,而这些假货还会**一路透传到视频信息卡并被"可溯校验通过"背书放大**。

## 冒烟枪:立项 Brief 从读取端就被丢

- 立项 Brief 有 4 核心字段:`coreMessage`(核心信息)/`contentGoal`(内容目标)/`contentFormat`(内容形式)/`targetAudience`(目标受众)(`contract/src/resources/projects.ts:45-55`,存 `projects.brief_detail` jsonb)。
- 但 `ProjectBriefReader.getBriefDetail`(`creative-context.ts:270-275`)**只暴露 `{orientation}`**;绑定层 `persistence-client.ts:2836-2845` 显式 `return o ? {orientation:o} : null` —— **其余全丢**。
- → **Brief 的 4 个核心字段从未进入任何创作上下文。** `script.draft` 模板虽声明依赖 `brief`(script-draft.ts:74),但 reader 只回 orientation,名实不符=假装接地。

## 生成子调用「上下文隔离」是系统性坑

hook/论点树/整稿/补全的**实际生成**都是独立 node 子调用,各拼最小 prompt,**外层对话 system 的 brief/素材/honesty 一律不继承**:

| 生成环 | 位置 | 注入的上下文 | 悬空点 |
|---|---|---|---|
| 论点树 `planning.thesis` | planning-runner.ts:61-77 / 模板 planning-thesis.ts | **只 positioning+learnings+topic** | 无 brief、无素材、无 anti-fabrication;`contextRequirements` 都没声明 |
| hook `script.hooks` | chat-runner.ts:432-454 `buildHooksPrompt` | 只 topic+direction+positioning | 最悬空;还把「数据冲击」列推荐切角却不要求数据真实——「22个AI」假钩子源头 |
| 整稿 `script.draft` | script-runner.ts:107-135 / 模板 script-draft.ts | positioning/learnings/knowledge/thesis/contract/outline/素材(富),但 `brief`=orientation | 无核心信息/避免X 硬约束;模板无 anti-fabrication |
| 补全 `topic.enrich` | topic-enrich-runner.ts:78-119 | positioning/learnings/signals/knowledge | 无 brief、无素材、无 anti-fabrication |
| 对话 system | chat-context.ts:172-179 / chat-runner.ts:672 | positioning/accounts/learnings/signals/knowledge | 无 brief 实质字段、无用户素材原文(弹药) |

honesty rule #9(禁编造数字/案例/来源,chat-runner.ts:608)、rule #10(论点树铁律)、场景块(T-240)**只在对话外层**,不进这些子调用。

## 逐段病灶(定位)

### 论点树(T-265)—— 两头都死
1. **无 chat 工具**:`ALL_CHAT_TOOL_NAMES`(chat-tools.ts:2872,33 个)无 thesis;编导据实自述「工具清单没列 thesis」属实非幻觉。
2. **深链是死链**:「立论点」按钮(thesis-skeleton-panel.tsx:178 / creation-flow-ctas.tsx:127)带 `functionKey:"planning.thesis"`,但它不在白名单 → `forcedTool` 恒 undefined、functionKey 静默丢弃(chat-runner.ts:531/1274)→ 点了=纯文本无工具 → 编导抓最近的 `topic.enrich` 冒充。
3. **runner 是孤儿**:`runPlanningThesis`(planning-runner.ts:151)+ dispatch 分支(persistence-client.ts:3251)存在,但**全仓无任何 `createTask({taskType:"planning.thesis"})`**(T-127 改路由时把创建端删了)→ 后端半条链也断。
- **修**:补 `planning.thesis` chat 工具(复用/复活 runner)产 thesis_tree→确认门→落论点骨架面板;修深链 functionKey↔真 tool 名;登记 ALL_CHAT_TOOL_NAMES+CREATION_TOOL_NAMES+各 surface+词表+渲卡;**新工具生成 prompt 同步注入 brief 硬锚+可溯**(别又造悬空工具)。

### 整稿超时(T-268)
- 超时点:`chat-runner.ts:838` `draftScript` 在工具 execute 里**同步跑 runScriptNode**,MiniMax 分钟级必爆。**异步 runner `runScriptDraft`(script-runner.ts:80)早已存在,chat 工具没用它**。
- 「生成脚本」按钮 forcedTool=script.draft→超时→退回轻量 hooks→用户看到「只出 hook」。「写入稿面」`router.refresh` 整页重渲(chat-script-draft-card.tsx:80)=卡顿。
- **修**:chat script.draft 改 dispatch 已存在的异步 runner+轮询卡(照 review.script/material.generate);写入稿面换局部刷新。

### 编造无防护(T-269)—— 逐环坐实
- `material.gather` 有 grounding+sourceUrl+「需核实」徽标(可溯);**script.draft/hooks/thesis 输出零 source 字段、零 grounding、零可溯绑定** → 弱模型编造零成本。
- **修**:rule #9 反编造+可溯约束**下沉进 script/hooks/thesis 三个子调用 system/模板**;写稿输出加 grounding/「本条含未溯源数字」标注对齐 material.gather;考虑「无绑定素材时口播不得含具体数字/命名事实」硬约束;T-224 同款可溯后处理剔除。

### 立项 Brief 硬锚(T-270)—— 修法三处联动
1. 扩端口 `ProjectBriefReader.getBriefDetail` 返回值含 coreMessage/contentGoal/contentFormat/targetAudience;绑定层停止丢字段。
2. `assembleCreativeContext` 加 `projectBriefHard` 字段,渲成「【本条立项硬约束·必须遵守】核心信息(钦定主张不得自创矛盾)+ 内容目标(含避免X 负向约束)+ 内容形式定调 + 目标观众锁定」,套用现成 `formatUserMaterialBrief` 硬约束范式。
3. 各 runner/模板(thesis/hooks/draft/enrich)+ 对话 system 注入。**建议做成共享 facet 包,所有生成模板统一引入,防逐个漏接。**

### 确认门非阻塞(T-263)
- 现状「结束回合→注入伪 user 消息→开新回合重调」双回合(chat-tools.ts:2155 + onDecision sendMessage)。
- **吞点 bug**:`ai-copilot-content.tsx:1976` `if(streaming)return`——用户在第一回合流式时点允许,自动重读被直接丢=「点了还得手动再发」的确切根因(可先单独快修)。
- **修**:Vercel AI SDK HITL(addToolResult 同回合续跑 + sendAutomaticallyWhen),gate 抽进 defineChatTool 覆盖所有 needApproval。

### 制作封面链(T-271 新)—— 缺失/裸奔
- **无专用封面链**:「生成封面」只是对话发自由文本→`material.generate`→`asset-generate-runner`**纯透传**生图,**零接地零诚实门**(全链唯一完全裸奔的 AI 生成入口)。`cover_brief` 任务类型声明了零实现。
- **修**:建专用封面 runner+模板,prompt 硬注入 brief(核心信息/内容形式)+script,封面文案上 T-224 同款诚实门,生图 prompt 结构化 facet 组装非自由文本;生图模型可配保留。

### 论点/素材逐条采纳(T-264)
- gather/candidate 卡逐条「存入弹药/采纳」;**批量「采纳选中 N 条」范式在知识链现成**(distill/backflow/graph/atom-gate),没复用。**修**:复用批量门,一次 refresh。

### 文件名搜索兜底(T-262)—— 零实现
- `readLocalFile`(persistence-client.ts:8280)realpath miss 直接抛「不存在」,无 basename 兜底。**修**:miss 时提取 basename 在授权目录+常用目录 scoped 搜(守 denylist)→ 多命中确认卡。

### 选题链(T-266/267)—— 5 路审计已补

**重要定位**:选题链是**账号态(projectId=null)**——topic.generate/daily/enrich 全传 projectId:null。所以选题的锚应是**定位中心**(`formatPositioning` 已注入 `avoid`/`forbidRule`/`topicRule` 作硬约束,前提用户填了);T-270 项目立项 Brief 管的是**项目态生成**(script.hooks/planning.thesis/script.draft)。**topic.enrich 挂 T-270 清单但也 projectId=null,须先定夺是否项目化,否则改了也读不到 brief。** getBriefDetail 只投影 orientation 是项目态生成的公共短板,一并扩投影全字段。

**选题接地做得对的**:T-238 signalQuality 段是最强防编造脚手架(四源全空也如实渲「无」+硬指令「评论无→别称『受众在问』/热点未拉到→别称基于实时热榜」);评论出题逐字贴原文(sourceComments schema 强制)。**但只惠及 generate,不惠及 enrich。**

- **T-266 补全卡死胡同**(三处叠加):①`topic.enrich` execute 结果不带 candidateId(chat-tools.ts:1936)②前端 candidateId 只从 selection 取(ai-copilot-content.tsx:1873)③`ChatEnrichCard.adopt` 只有 patchCandidate 一条路,null 即禁用显死胡同文案(chat-enrich-card.tsx:57-201)。**修**:无 candidateId 时采纳=`createCandidate` 新建(附富卡字段),而非禁用。
- **T-267① 采纳新建非更新**:`chat-candidate-card.tsx:84` 无条件 createCandidate,不看 selKind==candidate。**修**:scoped 到候选时 patchCandidate 就地更新;给「更新当前/另存为新」二选一(组件需透传 selection)。
- **T-267② 名=文件路径**:`frontend/src/app/api/chat/route.ts:155` `title=userText.slice(0,24)`——**会话标题**(非 candidate.title)截首条消息前 24 字,零提炼、永不更新。**修**:内容提炼标题(启发式/延迟到首轮 assistant 后命名)+净化 raw 路径/斜杠命令+主题漂移回填。
- **enrich 编造敞口(并入 T-269)**:enrich 无 signalQuality、无 sourceComments 逐字约束、无可溯标注,用未滤噪 signalsBrief,`materialBasis` 可凭空称「能依托某资料」(generate 侧 signalQuality 已挡此,enrich 无护栏)。
- **新发现·enrich 双 prompt 违结构化纪律**:后台 runTopicEnrich 走 runStructuredNode+模板(吃 skill_config_overrides),对话 enrichTopic 却走 runAgentNode 自由文本+buildEnrichPrompt(chat-runner.ts:807)→ MiniMax 下 parse 易吐不出 JSON→parseCard null→补全静默失败。**修**:对话侧切结构化,与后台同模板。

## 传染链(核心危害)

```
选题(悬空) → 论点树(死/文本) → script.draft(编数字,如「22个AI」) → artifact
   → production 读同一 artifact 当口播稿 → SRT/script 相似度门(0.55模糊,可 override 绕)
   → ②信息卡可溯校验「数字必须在 script 出现」——假数字本就在 script 里 → 判定可溯 → 通过 → 上屏
   → 带假数字信息卡渲进成片,还被"可溯校验通过"绿灯背书 = 放大
```
**病根**:信息卡可溯性是**相对 script 的**,不是相对客观真值——只挡「模型新造」,挡不住「上游 script 已造好、卡片忠实搬运」。治本在写稿链接地(T-269/270),视频层可加「数字须同时命中 SRT(真录音)」二次可溯。

## 修复计划(逐波,依赖有序)

- **波 1 · 接地根(T-269+T-270)**:扩 brief 端口不丢字段 + assembleCreativeContext 加 briefHard + 共享 facet 包(brief 硬锚+素材可溯+anti-fabrication)注入 thesis/hooks/draft/enrich 模板 + 对话 system。**治本,先做。**
- **波 2 · 论点树(T-265)**:补 planning.thesis chat 工具 + 复活孤儿 runner + 修死链 + 登记全套;新工具带波1接地。
- **波 3 · 整稿异步(T-268)+ 确认门阻塞(T-263)**:script.draft 改异步 dispatch;确认卡 HITL + 去 streaming 吞点。
- **波 4 · 并行(不撞 backend 核心)**:封面链 T-271 / 选题身份 T-267 / 补全卡 T-266 / 批量入库 T-264 / 文件搜索 T-262。
- 附:functionKey 构建期断言「必须 ∈ ALL_CHAT_TOOL_NAMES」防死链复发。

## 新任务(审计逼出,入 BACKLOG)
- **T-271** 制作封面链 0→1(brief+script 硬锚 + 文案诚实门 + 结构化 prompt;复活 cover_brief 或新建)。
- brief schema 加显式 `avoid`/负向约束字段(现「避免X」埋在 contentGoal 自由文本易被忽略)。
- functionKey↔ALL_CHAT_TOOL_NAMES 构建期不变量校验。
