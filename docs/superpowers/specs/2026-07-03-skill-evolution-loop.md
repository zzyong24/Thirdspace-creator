# Skill 迭代循环:经验回流进化(防污染设计)

> SPEC 日期:2026-07-03 · 任务:T-087 · 状态:✅ PASS(2026-07-03 MiniMax 审,0 findings:两通路+四闸门闭环合宪 §3/§5.3/§9.2,无 scope reduction)——可开工
> 用户原话:「用户有一次审核了,审核通过了,但还是违规了。后来他发现是触发了什么违禁词,他在复盘的时候可以跟 Agent 说。那我们的 Skill 是不是可以进化一下?包括每个板块是不是都有它自己的记忆库或迭代库?再或者把这些东西放到经验里面,Skill 里可以引用这些经验。但这里一定要好好设计——**一旦随意引用经验,污染我们的 Skill 也是很麻烦的问题**。」
> 用户红线 = **防污染**:经验引用要有门槛、生效前过确认门、可回滚。
> 上游:T-077 Copilot Skill 化(技能页签 / skillsBrief 自感知,本 SPEC 是它的进化篇)· T-040 服务端可配提示词(`skill_config_overrides` + `settings.prompts.put` 热生效)· T-062 经验沉淀(learnings 全链 + `learning.capture`)· 同批 T-086 文案审核门(违禁词规则库,边界见 §4)。

## §0 第一性定位

宪法护城河 = 飞轮:「盲预测 → 发布 → 采集 → 对照偏差 → **沉淀经验 → 回流让下一条更准**」(宪法 §3)。今天飞轮的最后一环只走了一半:经验能沉淀(learnings 全链已有),回流只有一条粗通路(validated 经验拼成 `learningsBrief` 全局注入)。**Skill 本身不进化**——用户在复盘里说出「审核过了但发出去还是违规,触发了违禁词 X」这种血泪教训后,系统只能存一条经验卡,下次写稿/审核的 Skill 行为一个字都不会变。

本 SPEC 把「经验 → Skill」的回流通路做完整,同时守住用户红线:**一切进化过人工确认门,一切引用有状态门槛,一切变更可一键回滚,坏经验可被发现并归因摘除**。不做自动无人进化——AI 只产「进化候选」,人裁决(宪法 §5.3 / §9.2 确认门铁律的自然延伸:Skill 配置也是关键产物)。

## §0.5 设计依据

### 仓内三件套现状(调研结论,CodeGraph + 源码核实)

1. **Skill 体系(引擎已在)**:`ai-worker/src/prompt/registry.ts` — PromptTemplate 三位一体(system/template+requiredFacets/tools+outputSchema),20 个内置 Skill 注册;`skill_config_overrides` 表(`backend/src/schema/settings.ts`,列:id/version/system/template/tools/required_facets/output_schema/updated_by/updated_at)+ `settings.prompts.list/get/put` ops + `overrideTemplatesFromConfig` 热生效(`frontend/src/server/ai/skill-config-overrides.ts`);「恢复默认 = put 空字段回退内置」语义已定(T-040)。T-077a 技能管理页签(`frontend/src/features/settings/skills-data.ts`)已能查看/编辑 template。
2. **经验模块(沉淀已在)**:contract `learnings.ts`(8 类 learningType + `validationStatus: candidate|validated|discarded` + reuseCount)/ backend `learnings.service.ts`(状态机:candidate→validated|discarded,validated→discarded,discarded 终态;`confidenceScore = min(100, applicationCount*20 + validated?40)`;`getSuggestions` 只回 validated)/ `learningApplications` 表(逐次应用追踪:projectId/outcome/appliedAt/evaluatedAt)/ 经验页(`experience-data.ts`,候选收件箱 + 已验证库 + 折叠废弃区)/ 复盘 chatbox `learning.capture` 与 `review.analyze` 工具(候选卡,人点才落库)。
3. **回流现状(半条通路)**:`creative-context.ts` 把 validated 经验(≤20 条)拼 `learningsBrief` facet 注入创作节点;`chat-context.ts` 同款注入 chatbox。**问题**:全局一锅端(写稿经验会漏进选题 prompt)、无 Skill 级作用域、无「经验 → 模板」的编辑时进化、坏经验混进 validated 后无发现/归因手段。

### 外部参考的取舍

- **Reflexion / 反思循环**(语言反馈自我改进):采「复盘产生结构化教训回喂下轮」的循环形状;**弃**其"自动写回、无人审"——用户红线要求一切过确认门。
- **Voyager skill library**(技能库自增长):采「技能可沉淀、可检索复用」;**弃**其"AI 自动新增技能"——本 SPEC 只进化既有 Skill 的 prompt,不自动造新 Skill(T-077 §3 已裁:新建 Skill 需配套代码,UI 化是假可用)。
- **ACE / Dynamic Cheatsheet**(上下文即课程,增量条目制胜过整篇重写):采「经验以**独立条目**注入,不整篇改写 system prompt」——条目制天然可逐条摘除,是可回滚的前提;这决定了 §1 通路 A 的形态。
- **Claude Code memory 分层**(全局/项目分层记忆):采「作用域声明」思想 → 经验绑定 Skill 而非全局池自动扩散。
- **不采**:embedding 检索式经验召回(单用户经验量级 <100,状态机过滤 + 作用域过滤足够,YAGNI)。

## §1 设计:两条回流通路(核心选型)

经验影响 Skill 只有两条正交通路,各管一类知识,**不新建第二套参数系统**:

| | 通路 A:运行时引用(经验注入 facet) | 通路 B:编辑时进化(template 补丁) |
|---|---|---|
| 机制 | validated 经验按 **Skill 作用域**过滤后拼进该 Skill 的 learnings facet(现有 `learningsBrief` 机制升级) | AI 产 template **diff 候选** → 用户确认 → `settings.prompts.put` 落 `skill_config_overrides`(现有 T-040 通道) |
| 适用 | **软知识**:方法论、风格偏好、爆款要素、失败教训的上下文提醒(「开头别用疑问句,上次掉留存」) | **硬约束**:必须确定性生效的规则(「产出前自查违禁词」「结构固定为 X-Y-Z」) |
| 生效强度 | 建议性(模型看到但可权衡) | 强制性(写进模板正文,每次必吃) |
| 摘除方式 | 经验 discard 或解除绑定 → 下轮即不注入(条目制,零残留) | 恢复默认(put 空回退内置)或改回上一版 |
| 何时选 | 默认路径。经验刚 validated、还没被实绩反复验证时,只走 A | 经验被反复验证、用户明确要"每次都必须这样"时,才升级走 B |

**选型原则(写进 skill.evolve 工具的 prompt)**:先 A 后 B;A 是低风险默认,B 是高承诺升级。违禁词类"零容忍"教训是例外——它们不走 A/B,直走 T-086 审核规则库(§4)。

### §1.1 通路 A:经验的 Skill 作用域(替代"每板块自建记忆库")

用户问「每个板块是不是都有自己的记忆库?」——**裁决:不建 N 个库,统一经验池 + 作用域绑定**(单一真值,避免同一条教训在多库间抄写发散):

- **contract**:`learningResource` 增 `appliesToSkills: string[]`(skill id 数组,默认 `[]`)。语义:`[]` = 仅进通用 `learningsBrief`(现状不变,向后兼容);非空 = **只**注入声明的 Skill(如 `["script.draft"]` 的写稿教训不再漏进 topic.generate 的 prompt)。
- **注入侧**:`creative-context.ts` / `chat-context.ts` 组装 learnings facet 时按「当前 Skill id ∈ appliesToSkills,或 appliesToSkills 为空」过滤;排序按 confidenceScore 降序,上限维持 20。
- **绑定入口**:①经验页 validated 卡上「作用域」编辑(多选 Skill,选项来自 `listTemplates()`);② `learning.capture` 候选卡带 AI 建议的 appliesToSkills(用户确认时可改);③技能详情页(T-077a)新增只读区「引用中的经验」,列出绑定到本 Skill 的 validated 经验,每条带「摘除」(解除绑定,不动经验本体)。
- **candidate 永不注入**(T-062b 既有语义,重申为闸门 1)。

### §1.2 通路 B:`skill.evolve` 对话工具(编辑时进化)

- **chatbox 新工具 `skill.evolve`**(白名单:review surface + 通用 chatbox-turn):入参 `{skillId, rationale, sourceLearningId?}` → 工具内读该 Skill 当前生效 template(运行时 `getTemplate`,含已有 override)→ 模型产**最小 diff 候选**(仅 template/system 文本;tools/outputSchema 不准动,T-077 已裁「改坏即崩」)→ 渲成**进化 diff 卡**:变更前后逐段对照 + 进化理由 + 来源经验链接。
- **确认门**:用户点「采纳进化」→ client 走既有 `settings.prompts.put`(热生效);点「忽略」→ 无副作用。**AI 无任何直接写 override 的路径**。
- **版本与归因**:put 时 `version` 字段写 `evolve:<learningId>:<ISO日期>`(纯审计,复用现有 version 列,不加表);技能详情页显示当前 version,来源是进化的标注「由经验进化 · 〈经验标题〉」。
- **回滚**:技能详情页「恢复默认」既有按钮即全量回滚;本期不做逐版本历史栈(单用户产品,恢复默认 + 重新进化的成本足够低,YAGNI;§5 记录将来路径)。

### §1.3 端到端用户场景(违禁词血泪帖)

1. 复盘对话:「上次审核过了,发出去还是违规,后来发现触发了违禁词『XX』。」
2. 复盘 agent(chatbox.review)响应,**并联产出两张候选卡**:
   - **审核规则补丁候选**(T-086 落地后):`audit.rule.add` 候选卡 —— 违禁词『XX』+ 触发场景 → 用户确认 → 落 T-086 审核规则库(确定性,下次审核必查);T-086 未落地期间降级为 learning.capture(type=failure)+ 对话内提示「审核规则库上线后可转入」。
   - **经验候选**(`learning.capture`,type=failure):「平台对『XX』类表述实际执行比公示规则严」→ 用户采纳 → candidate 落库。
3. 用户在经验页把该 candidate 晋升 validated(闸门 1),可顺手绑定 `appliesToSkills: ["script.draft"]`(闸门 2)——下次写稿 prompt 即带上这条教训(通路 A)。
4. 若反复踩同类坑,用户在复盘/技能页说「把『产出后自查敏感表述』写死进写稿技能」→ `skill.evolve` 产 diff 卡 → 采纳 → template 进化(通路 B,闸门 3)。
5. 后续某作品数据异常,复盘时系统提示「本稿引用了 N 条经验(列表)」,用户判定某条是坏经验 → 一键 discard/解绑,下轮即摘除(闸门 4)。

## §2 防污染四道闸(用户红线,本 SPEC 核心)

| 闸门 | 机制 | 现状/新增 |
|---|---|---|
| **闸 1 · 引用门槛** | 只有 `validated` 经验可被注入;candidate/discarded 永不进任何 prompt;candidate→validated 晋升**只能人工**(经验页操作,无 AI 通路)——状态机已封死其余转移 | 已有(T-062b),本 SPEC 重申为不可违背约束并加验收 |
| **闸 2 · 作用域收窄** | 经验默认只进通用池;进指定 Skill 需**显式绑定**(人工或确认门内确认 AI 建议)。Skill 不会被动吃到未声明的经验;技能详情页可见"我引用了谁" | 新增(§1.1) |
| **闸 3 · 生效确认门** | 通路 B 一切 template 变更以 diff 卡呈现,采纳才 put;复用 `skill_config_overrides` 版本化(version 记来源经验);AI 零直写权限 | 新增(§1.2),复用 T-040 通道 |
| **闸 4 · 可回滚 + 污染检测** | 摘除:通路 A 逐条(discard/解绑,条目制零残留),通路 B 恢复默认(已有)。检测:经验被注入创作节点时**落一条 `learningApplications`**(现表,applicationNote 记 skillId+projectId);复盘面对表现不及预期的作品,列出「本稿引用的经验」供归因,用户可就地降级 | 检测归因为新增;learningApplications 表/摘除机制复用既有 |

**明确不做(防污染的另一半是克制)**:❌ 自动晋升(哪怕 reuseCount 再高)❌ 自动进化(哪怕模式再明显,只能"建议",卡在确认门)❌ 经验注入 system prompt 整篇改写(只走条目 facet)❌ 跨 Skill 自动扩散(绑定就是边界)。

## §3 切片

- **T-087a 经验作用域**:contract `appliesToSkills` 字段(additive)+ backend 存取 + 注入侧按 Skill 过滤 + 经验页绑定编辑 + `learning.capture` 卡带建议作用域。
- **T-087b skill.evolve 工具**:chatbox 工具三件套(白名单 + diff 候选卡 + 采纳走 prompts.put)+ version 归因标注 + 技能详情页「引用中的经验」区与摘除。
- **T-087c 污染检测归因**:注入即记 learningApplications + 复盘面「本稿引用的经验」列表 + 就地降级(discard/解绑)动作。

## §4 与 T-086(文案审核门)的边界

**判据:可枚举、可确定性判定的 → 审核规则库;不可枚举、需要模型权衡的 → 经验。**

- 违禁词/平台红线词表、格式硬规则 → **T-086 审核规则库**(确定性命中,不靠模型"记得")。这是违禁词教训**最自然的落点**——写进经验只能"提醒",写进规则库才能"拦截"。
- 「为什么会踩线」的因果洞察、表述风格教训、平台执行尺度的观察 → **learnings**(通路 A 注入写稿等上游 Skill,防患于产出时,而非只堵在审核时)。
- 同一次复盘可以两头都落(§1.3 步骤 2 的并联双卡),但**内容不重复**:规则库存"词 + 判定",经验存"洞察 + 建议"。审核 Skill(T-086)自身也是 REGISTRY 一员,同样吃通路 A/B——两任务共享全部防污染闸门,不各造机制。

## §5 全局约束与未来路径

- 确认门/诚实数据/无弹窗铁律全部适用;contract 变更 additive(gate-F3 零删除);每片测试全绿 + 真机验收。
- 不建第二套参数系统:作用域挂 learnings、进化走 skill_config_overrides,零新表。
- 未来路径(本期不做):override 逐版本历史栈与 diff 回放;经验效果 A/B 归因(需多作品统计量);审核规则库与经验的自动互转建议。

## §6 验收标准

1. **作用域**:一条 validated 经验绑定 `script.draft` → 「生成脚本」的 prompt 含该条目(抓包验证),topic.generate 的 prompt 不含;解绑后写稿 prompt 即不含(零残留)。candidate 经验在任何 prompt 中都抓不到。
2. **进化**:复盘对话「把违禁词自查写进写稿技能」→ skill.evolve 渲 diff 卡(前后对照+理由)→ 采纳 → `skill_config_overrides` 出现该行(version 含来源经验 id)→ 下次写稿产出体现新约束;技能详情页「恢复默认」→ 回内置模板,再生成不再体现。
3. **端到端**:复盘说「审核过了但发布违规,触发违禁词 X」→ 出现经验候选卡(type=failure)(+T-086 落地后的规则补丁卡)→ 采纳、晋升、绑定后,写稿 prompt 可抓到该教训。
4. **归因**:某项目创作时注入了经验 → learningApplications 有对应记录;该项目复盘面能列出「本稿引用的经验」,就地 discard 后经验页状态同步、下轮不再注入。
5. **AI 零直写**:代码审查确认 skill.evolve / learning.capture 全链无任何绕过确认门直写 learnings 状态或 skill_config_overrides 的路径。
