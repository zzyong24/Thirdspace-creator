# 编导文案审核门:抖音合规双层审(违禁词 lint + 豆包语义审)

> SPEC 日期:2026-07-03 · 任务:T-086 · 状态:⚠️ CONCERNS 已处置(2026-07-03 MiniMax 审:1 major——§3 门强度硬/软是悬而未决的用户裁决,实现无从确认切片边界 → 补 [gate-F1] 缺省裁决规则(未获用户另行裁决即按主案软门实现,硬门只差一个 disabled 条件随时可切);1 minor——script-review-runner 独立 vs 合并 review-runner → [gate-F2] 实现时评估并注释理由)——可开工 T-086a~d
> 用户裁决:「编导产出的文案需要审核;审核模型用豆包比较好;抖音违禁规则之前在 cheat-on-content 里有过,都在里面。」
> 项目铁律:模型绝不写死 —— 豆包走 model-config 用户可配(预设推荐),未配则降级并如实标注。

## §0 第一性定位

审核门唯一存在理由:**别让创作者把限流/自见/删除风险发出去**。宪法定位是「编导智能体」——真编导交稿前会过合规自检,这不是外挂检查器,是编导职能的缺失环节补齐。对照宪法:发布是稿面上的动作(§4 两阶段),审核就挂在稿面;AI 只产候选、人确认(§5.3),审核报告的改写建议走确认门,**绝不自动改稿**;飞轮(§3)要求审核教训能回流——审核通过但实发违规的 case 经复盘回到规则库(与 T-087 衔接,本 SPEC 只建落点)。

**双层结构**(确定性与概率性分工):
- **L1 违禁词/模式 lint**:纯函数、毫秒级、零成本、可解释(命中哪条规则一目了然)——覆盖词表类规则(降权词/营销词/导流谐音/绝对化用语/doud+ 投放词)。
- **L2 LLM 语义审**:豆包(用户可配)——覆盖 lint 抓不住的擦边/暗示/虚假夸大/人设造假/标题党语气/隐私泄露等语义级风险,输出结构化报告。

## §0.5 设计依据(不造轮子调研 + cheat-on-content 规则移植清单)

**规则源已实锤定位**(用户说的「都在里面」验证属实,规则本体在 cheat-on-content 的 canonical 引用链里,落在用户知识库):

| # | 文件(绝对路径) | 内容概貌 | 移植方式 |
|---|---|---|---|
| 1 | `/Users/zyongzhu/ThirdSpace/00-系统/Skills/creative-video-workflow/references/v5/douyin-compliance.md`(110 行) | **Tier 1 官方硬规则**,蒸馏自抖音《社区自律公约》原文(标注小节号:34 恶意导流/33 不当营销/35 欺骗/25 知识产权/隐私/违禁一票否决);**Tier 2 经验限流**(降权词/营销变现词/工具名不违规更正/完播时长);**doud+ 投放特有限流词**(竞品平台词:微信/腾讯/小程序…;权威背书词:诺奖/院士…,2026-07-02 实测);文末「发布前自检」逐项清单 | **主移植源**。Tier1 条文 → L2 语义审 prompt 的规则依据;Tier2 + doud+ 词表 → L1 lint 规则种子;自检清单 → 报告的 checklist 骨架 |
| 2 | `/Users/zyongzhu/ThirdSpace/00-系统/审核/内容发布审核清单.md`(153 行) | 5 大必查(品牌词/营销词/情绪悼念类/本地模型部署/标题短期复用)+ 3 大建议查(时长完播/封面 CTR/多平台差异),每条带 ❌→✅ 替代词表,源自该账号 3-5 月 16 条自见 case | **词表移植源**(替代建议直接进 lint 规则的 `replacement` 字段)。注意:其「第三方品牌词一律禁」已被文件 1 **更正为过严**(AI 教学语境点名工具不违规)——冲突条目以文件 1(更新于 2026-06-25/07-02)为准 |
| 3 | `/Users/zyongzhu/ThirdSpace/00-系统/Skills/creative-video-workflow/references/v5/douyin-policy-snapshot.txt`(71k 字) | 抖音规则中心《社区自律公约》官方原文快照(2026-06-25 CDP 抽取) | **不整体入库**。作规则溯源语料:移植时抽查条文出处;后续规则争议时 grep 查原文 |
| 4 | `/Users/zyongzhu/.claude/skills/cheat-package/SKILL.md`(159 行) | cheat-on-content 的发布物料审核 SOP(Phase 3 强制审核流:Tier1 命中必改+flag、Tier2 提示;「先报审核结论再给物料」呈现顺序;audit_flags 落盘惯例) | **流程参考**(不搬代码):审核报告先结论后明细、命中项带替代建议、tier 分级呈现,均采其惯例 |

> cheat-on-content 仓本体(`/Users/zyongzhu/Workbase/cheat-on-content`)内无独立规则文件——规则经 cheat-package skill 的 canonical 引用落在上述知识库两份文档,**可直接移植**(内容是结构化表格+清单,转 JSON 规则种子为机械工作)。

**仓内现状**(全部实查):
- **模型可配体系现成**:`model_configurations` 表(capability/provider/modelName/secretValue/baseUrl/apiFormat)+ `resolveLlmConfig` 三级回退(per-capability → default capability → env)+ 设置页模型卡先例(T-055h①「素材归类模型」卡)。**豆包零适配器可接**:`ai-worker/src/runtime/provider-factory.ts` 的 `modelFor` 已支持 `openai_chat + baseUrl → @ai-sdk/openai-compatible`,火山方舟 Ark 是 OpenAI 兼容端点(`https://ark.cn-beijing.volces.com/api/v3`,Bearer key)——**配一行 model-config 就通,不写任何厂商代码**(注意:`frontend/src/server/ai/llm/provider.ts` 的旧 LlmCompleter 路径 openai_chat 是 stub,但宪法铁律 #1 本就要求走 Vercel SDK 路径,不碰旧路径)。
- **审核即一个新 Skill**:ai-worker `REGISTRY` + `PromptTemplate`(18 个先例,如 `review.insights`/`script-draft`)+ `runStructuredNode`(generateObject 绑 schema)+ `skill_config_overrides` 服务端可配——新模板 `script.review` 完全走既有轨。
- **任务链现成**:`ai_tasks` dispatch 分支(persistence-client `taskType === "xxx" → void runXxxTask`)+ runner 惯例(markRunning/markFailed/结构化产出)。
- **审核门挂点现成**:两阶段稿面(T-055)有发布包区(「先盲预测」「登记已发布」两动作)+ 成熟度点 MaturityBar + chatbox project surface 工具白名单——审核动作/状态/工具三处都有既定接缝。
- **确认门现成**:chatbox 工具卡 + 采纳门惯例(ChatHookCard「写入稿面」+ createArtifactVersion append-only + 撤销 restore)——改写建议复用此链,不造新写入通路。

**外部参考与取舍**:采 cheat-package 的 tier 分级与「先结论后物料」呈现;弃其 Markdown 清单直读(agent 现读 md 灵活但不可确定性执行)——CreatorOS 是产品,规则须结构化落库才能 lint、才能被 T-087 进化循环引用与回滚。

## §1 规则库:数据层与移植(T-086a)

- **新表 `review_rules`**(backend schema + 迁移下一号):`id, user_id, tier('official_hard'|'empirical'|'doudplus'), category(导流/绝对化/降权词/营销词/情绪类/隐私/复用/其他), match_type('word'|'regex'), pattern, replacement(建议替代,可空), note(触发原因/出处,如「公约34」「2026-07-02 doud+ 实测」), source('seed'|'manual'|'retro'), status('active'|'candidate'|'disabled'), created_at, updated_at`。
  - `status='candidate'` 是 **T-087 回流落点**:复盘发现的新违禁词先落候选态,**用户采纳才 active**——本 SPEC 只建这个门(schema + 采纳操作),自动进化循环、引用门槛、回滚机制归 T-087 设计,边界在此划死:**T-086 绝不做「AI 自动写规则进 active」**。
- **规则种子**:从 §0.5 文件 1/2 移植为 seed JSON(`backend/src/modules/review/review-rules.seed.ts`,幂等 onConflictDoNothing,id 确定性)。移植原则:①词表类(降权词/营销词/doud+ 两类词/谐音导流变体)逐条成行;②替代词随行入 `replacement`;③文件 2 与文件 1 冲突条目按文件 1(「工具名不违规」等更正落 note 说明);④官方条文类(34/33/35/25 语义规则)**不进 lint 表**——它们是语义级,归 L2 prompt(§2)。
- **契约 additive**:`reviewRules.list / create / patch(含采纳 candidate→active、disable)` 三 op;不删不改任何现有 op。
- **L1 lint 引擎**:`ai-worker/src/review/lint.ts` 纯函数 `lintScript(text, rules) → LintFinding[]`(finding: ruleId/quote(命中原文片段)/offset/tier/category/replacement)。word 全文匹配,regex 谨慎白名单(seed 内置数条谐音变体如「V信/薇/+我/主页有」);纯函数零 IO,单测直接喂词表。

## §2 语义审 Skill:豆包可配不写死(T-086b)

- **新 capability `script.review`** 进 `ai.seed.ts` 目录(与 research.analyze 等并列);**新 ai-worker 模板 `script.review`**(REGISTRY 注册,吃 skill_config_overrides 覆盖):
  - facets:`script`(待审全文)、`lintFindings`(L1 结果注入,让 L2 不重复报且可交叉确认)、`officialRules`(§0.5 文件 1 的 Tier1 条文摘要,模板内置默认值,可被 overrides 换)、`positioning`(创作者定位,判「是否带货/医疗金融资质红线」语境)。
  - outputSchema(宪法铁律 #4,generateObject 绑定):`{ verdict: 'pass'|'risk'|'block', summary: string, findings: [{ quote, category, severity: 'block'|'warn'|'info', reason, suggestion(改写建议,可空), ruleRef(公约小节号/规则 id,可空) }] }`。
  - prompt 要点:只审注入文本、逐条给原文引用(quote 必须是原文子串,防幻觉命中)、区分官方硬规则与经验建议、不复述 lint 已报条目、suggestion 给最小改写而非重写全文。
- **runner + dispatch**:`frontend/src/server/ai/script-review-runner.ts`(照 review-runner 惯例:markRunning → 读最新脚本 artifact 版本 → 跑 L1 lint → `resolveModelSpec(ctx, "script.review")` → runStructuredNode → 落报告 → markFailed 兜底);persistence-client 加 `taskType === "script.review"` dispatch 分支。[gate-F2] 实现时先评估能否在既有 `review-runner.ts` 骨架上扩展(泛化 taskType / 加分支)而非新建独立文件;若因「读 artifact 版本 + 前置 L1 lint 步骤」差异决定保持独立,须在文件头注释写明独立理由,方便追踪两套 runner 演化。
- **审核报告落库**:**新表 `script_review_reports`**(`id, project_id, artifact_version(审的是哪一版脚本), verdict, summary, lint_findings jsonb, llm_findings jsonb, model_label(实际用的模型标注), reviewed_at`)。绑版本号 = 改稿后旧报告自然过期(稿面按「报告版本 < 当前版本」显示「稿已改动,建议重审」);契约 additive:`scriptReviews.getLatest / trigger`。
- **豆包预设不写死(核心裁决)**:
  - 设置页模型区加「**文案审核模型**」卡(照「素材归类模型」卡惯例),**预设推荐豆包**:provider=`doubao`、apiFormat=`openai_chat`、baseUrl=`https://ark.cn-beijing.volces.com/api/v3`、modelName 用户填(如 `doubao-seed-1-6-*` 或 Ark 推理接入点 `ep-*`)、key 走 secretValue/secretReference——**全是 model_configurations 一行数据,零厂商代码**。预设按钮只做「一键填表单默认值」,用户可整卡换成任何 openai_chat/anthropic 端点。
  - **降级如实标注**:用户没配 `script.review` capability → resolve 回退链落默认模型照常审,但报告头部与稿面卡片显式标注「本次审核由通用模型(`<model>`)完成,非专用审核模型——建议在设置中配置豆包等审核模型」(`model_label` 字段承载,诚实数据原则)。

## §3 审核门:位置与强度(T-086c)

- **推荐形态(主案):稿面随时手动审 + 关键动作前软提示,不强制卡死**。
  - **稿面「合规审核」动作**:脚本区/发布包区加「审核」按钮 → 创建 `script.review` 任务 → 报告卡渲在稿面(verdict 徽章 + 命中列表:每条 quote 高亮/tier 标签/reason/suggestion);MaturityBar 加「审核」信号点(有 pass 报告且版本匹配才亮)。
  - **软门**:「先盲预测」「登记已发布」两动作点击时检查最新版本审核态——无报告/verdict≠pass/版本过期 → 内联醒目提示「当前稿未过合规审核(原因)」+「先去审核」一键触发,**用户仍可继续**(操作不阻断)。
  - **推荐理由**:①「登记已发布」登记的是平台已发生的事实,卡死它毫无意义(内容已发出,此时更该让它进复盘回流);②宪法 §5.5「人出判断」——审核是编导给意见,发不发是创作者的判断;③cheat-package 的「强制」语境是 agent 生成物料的呈现顺序,不是拦人。
  - **备选(候审时请用户裁决)**:硬门——「先盲预测」前强制 verdict=pass 才可点(登记已发布保持软提示,理由同上)。若用户选硬门,实现只差一个 disabled 条件,切片不变。
  - **[gate-F1] 缺省裁决规则(补,消除实现边界二义)**:门强度是本 SPEC 唯一悬置的用户决策点。规则定死:**未获用户另行裁决前,按主案「软门」实现**(理由 §3 三条已述:登记的是既发生事实、宪法 §5.5 人出判断、cheat-package 的「强制」语境不是拦人);实现 agent 不等待、不追问,直接按软门交付。用户任何时点说「改硬门」= 在「先盲预测」按钮上加一个 `verdict!==pass → disabled` 条件,一行改动、切片与验收不变(验收 §6.4 软门行为链换成 disabled 断言即可)。此规则本身即裁决,§3 不再有开放问题。
- **chatbox 工具 `script.review`**:注册进 registry 白名单 + chat-tools,挂 project surface——对话里「帮我审下这稿」直接触发同一 runner,报告以工具卡渲进对话(与稿面同一份报告数据,不造影子)。
- **改写建议走确认门(宪法铁律 #2,不可协商)**:报告卡每条带 suggestion 的 finding 给「应用改写」——走既有 createArtifactVersion append-only 链(照 ChatHookCard 惯例,替换命中片段成新版本,系统行「已应用·撤销」restore 回滚)。**审核任何路径都不直接改稿**;verdict 也绝不由 AI 落「已通过」以外的领域状态。

## §4 规则库管理与回流落点(T-086d)

- **规则库管理面**:设置页新「审核规则」区(或知识库内独立 tab,实现时按现有 IA 就近归置,禁止新增一级导航——§10.5 撤回案的教训):列表(tier/category 分组、pattern/replacement/note、status 徽章)+ 手动增/停用/编辑;candidate 态规则单独分区「待采纳(来自复盘)」+ 采纳/否决按钮(= T-087 回流的用户确认门,本期建 UI 与 op,进化自动化不做)。
- **复盘回流落点**:复盘 chatbox(chatbox.review surface)白名单加轻工具 `reviewRule.suggest`——用户在复盘对话里说「这条实际触发了 XX 违禁词」→ 工具卡确认 → 落 `review_rules` 一行 `status='candidate', source='retro'`。**到此为止**:候选如何被评估/合并/防污染是 T-087 的题。

## §5 全局约束

模型绝不写死(豆包只是 model_configurations 预设值;所有审核调用经 `resolveModelSpec("script.review")`);全程 Vercel AI SDK + runStructuredNode(不碰旧 LlmCompleter stub);AI 只产候选经确认门(改写建议/规则候选皆是);诚实数据(降级模型如实标注、报告版本过期如实提示、lint 命中带原文引用);契约零删除全 additive;每片测试全绿 + 真机验收;提示词/schema 可被 skill_config_overrides 覆盖(Skill 三位一体)。

## §6 验收标准

1. **规则移植真值**:seed 后 `review_rules` 表内可查到 §0.5 文件 1/2 的词表条目(SQL 抽查:降权词「保姆级」、营销词「割韭菜」、doud+ 词「诺奖」、导流谐音「V信」各在其 tier/category,replacement 与 note 出处正确);文件 1/2 冲突条目按文件 1(表内无「品牌词一律禁」类规则,note 留有更正说明)。
2. **L1 lint 确定性**:喂含「保姆级教程加我V信年入百万」的文本 → lint 命中 ≥3 条,每条 quote 是原文子串、带 replacement;纯函数单测覆盖 word/regex/多命中/零命中。
3. **L2 豆包链路**:配置 script.review = 豆包(Ark openai_chat + baseUrl)后稿面点「审核」→ ai_tasks 落 script.review 任务 → `script_review_reports` 落行(verdict/findings 结构化、llm findings 的 quote 均为原文子串)→ 稿面报告卡渲染命中项;**不配豆包**时同链路走默认模型且报告显「非专用审核模型」标注。
4. **软门行为链**:未审稿点「先盲预测」→ 内联提示 +「先去审核」可一键触发;审过(pass)后提示消失,MaturityBar 审核点亮;改稿出新版本 → 稿面显「稿已改动,建议重审」。
5. **确认门**:报告卡「应用改写」→ 脚本新版本(versionCount+1,命中片段被替换)→「撤销」restore 回原版;全程无任何 AI 直写稿件路径。
6. **回流落点**:复盘对话「这条触发了违禁词 X」→ 工具卡确认 → review_rules 落 `candidate/retro` 行 → 规则管理面「待采纳」区可见 → 采纳后转 active 且 lint 即时生效。
7. 四包(contract/backend/ai-worker/frontend)测试全绿;真机截图归档 `frontend/docs/t086-verify/`。
