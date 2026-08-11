# AI 工具选路与产品元 Skill 的业界方案调研

> 日期：2026-08-11
> 对应：T-769 工具语义审计、T-770 CreatorOS 元 Skill
> 目标：回答“工具越来越多后怎样避免选错”和“怎样让产品拥有自己的低误触发说明 Skill”

## 1. 大白话结论

成熟方案不是继续把提示词写长，也不是给每种说法补关键词。业界正在收敛到同一个结构：

1. 模型先看到短而清晰的能力目录；
2. 根据当前请求只取少量相关工具或 Skill；
3. 真正选中后再加载完整说明和知识；
4. 工具参数与结果用严格 schema；
5. 用真实用户表达持续评测“该调用、误调用、漏调用、调用后是否正确使用结果”。

```mermaid
flowchart LR
  U["用户请求"] --> D["短描述/语义检索"]
  D --> S["本轮相关的 3–5 个工具或 Skill"]
  S --> L["按需加载完整说明与知识"]
  L --> C["严格参数调用"]
  C --> R["显式成功/空/部分失败/失败"]
  R --> E["真实表达评测与追踪"]
```

CreatorOS 当前把约 43 个工具同时交给全局助手，恰好位于业界明确警告的高歧义区间。T-769 发现的
“最近项目与最近发布作品混淆”“评论范围不对”“错误被当成空数据”，分别对应上图的工具发现、调用
契约和结果契约三处缺口。

## 2. OpenAI：只暴露当前任务相关工具，并明确路由与错误契约

OpenAI 当前模型指南给出了三条与 CreatorOS 直接相关的建议：

- 只暴露与任务相关的工具，精简并准确描述工具；
- 不要指望“工具可用”本身产生正确路由，要明确限定阶段、允许工具、输出 schema、停止条件和错误行为；
- 用同一批代表性任务比较最终答案是否正确，而不只检查工具有没有被调用。

来源：[OpenAI Model guidance](https://developers.openai.com/api/docs/guides/latest-model)。

OpenAI Responses API 还支持 `allowed_tools` 与严格 schema，用代码限定本轮可选工具和输入形状，而不是
让模型在完整目录里自由猜。来源：[OpenAI Responses API tool choice](https://platform.openai.com/docs/api-reference/responses-streaming/response/custom_tool_call_input/delta?lang=javascript)。

对 CreatorOS 的启示：

- 页面作用域、当前实体、任务阶段先确定工具候选集；
- 模型负责理解“用户要什么”，代码负责限制“这轮最多能用什么”；
- `context.*` 工具必须声明返回字段和 `ok/partial/error` 行为；
- 评测必须覆盖工具结果到最终话术，防止“工具返回对了，模型总结错了”。

## 3. Anthropic：工具超过 30–50 个后选择准确率下降，改用按需发现

Anthropic 的工具搜索文档明确指出：一次加载全部工具时，工具数量超过约 30–50 个后，选择准确率会
下降；其 tool search 通过延迟加载，只在请求需要时展开少量工具定义。官方示例通常只加载 3–5 个
相关工具，并显著减少工具定义占用的上下文。

来源：[Anthropic Tool search tool](https://platform.claude.com/docs/en/agents-and-tools/tool-use/tool-search-tool)。

Anthropic 的工具定义规范还建议：

- 说明不仅写“做什么”，还要写“什么时候用、什么时候不用、不会返回什么”；
- 相关动作尽量合并为更少、更有能力的工具，减少选择歧义；
- 返回高信号、稳定标识和下一步需要的字段，避免把大段无关数据塞给模型；
- 对复杂参数提供经过 schema 验证的输入示例。

来源：[Anthropic Define tools](https://platform.claude.com/docs/en/agents-and-tools/tool-use/define-tools)。

对 CreatorOS 的启示：

- `context.projects / context.projects.search / context.publications` 不能继续靠相似说明同场竞争；
- 兼容型旧工具应从模型可见目录撤下，内部需要时仍可保留；
- 新元 Skill 只把一段短触发描述常驻，完整 CreatorOS 产品知识必须按需加载。

## 4. Microsoft Semantic Kernel：把大工具集当成检索问题

Microsoft 的 Contextual Function Selection 使用 RAG 根据当前对话筛选相关函数，而不是把全部函数
发给模型。它专门用于大插件/大工具目录，目标就是减少模型困惑和错误选择。

来源：[Microsoft Contextual Function Selection](https://learn.microsoft.com/en-us/semantic-kernel/frameworks/agent/agent-contextual-function-selection)。

对 CreatorOS 的启示：

- 工具发现应成为独立可评测环节；
- 语义检索只负责缩小候选集，不能越过权限、账号、真实 ID 和状态守卫；
- 初期不必引入新的向量基础设施，可以先按页面/实体收窄，再让模型在小集合中做语义选择。

## 5. Google ADK：用真实请求数据集评测，而不是凭提示词感觉

Google ADK 的官方教程把 eval case 作为代理项目的基本组成：每条用例提供真实用户 prompt，再按配置
评测代理的行为；部署后还通过 trace 查看模型与工具执行链。

来源：[Google agents-cli evaluation workflow](https://google.github.io/agents-cli/guide/hands-on-tutorial/#7-run-an-evaluation)。

对 CreatorOS 的启示：

- 建立“用户原话 → 预期 Skill/工具 → 必需参数 → 不应调用项 → 最终事实”的数据集；
- 同时保留 no-tool/negative control，专门检查误触发；
- 每次改工具描述、工具集合或模型版本后重跑同一批用例。

## 6. 研究界：只看最终成功率会掩盖工具错误类型

近期工具学习研究把失败拆成漏调用、选错工具、错误参数、忽略结果、伪造输出和不必要调用等不同
类型；另有研究专门注入规格漂移、执行失败与输出漂移，证明“模型平时能用工具”不等于遇到真实环境
故障时仍能正确恢复。

来源：[CRITICTOOL](https://arxiv.org/abs/2506.13977)、[ToolBench-X](https://arxiv.org/abs/2606.25819)。

对 CreatorOS 的启示：T-769 后续不能只新增一个“选对工具率”，还要分别记录：

- `tool_skip`：该调用却没调用；
- `wrong_tool`：调用了近义但错误的工具；
- `wrong_scope`：项目/账号/作品范围错误；
- `wrong_arguments`：过滤、排序、分页参数错误；
- `result_ignore`：工具返回了错误/部分失败但最终话术说“没有数据”；
- `unnecessary_tool`：普通对话误触发产品元 Skill 或付费工具。

## 7. OpenAI Docs Skill 对 CreatorOS 元 Skill 的直接借鉴

OpenAI 官方模型文档把 OpenAI Docs 作为可调用的专属 Skill，并链接到官方 Skill 仓库。

来源：[OpenAI 文档中的 OpenAI Docs Skill](https://developers.openai.com/api/docs/guides/latest-model#migration-quickstart)、[openai/skills 中的 openai-docs](https://github.com/openai/skills/tree/main/skills/.curated/openai-docs)。

其设计最值得借鉴的不是具体内容，而是四个边界：

1. **触发描述非常具体**：列出明确产品与任务，同时写明哪些相似任务不触发。
2. **先找权威来源**：回答前先读取当前官方资料，而不是只凭模型记忆。
3. **渐进加载**：短元数据常驻，完整流程和参考资料选中后再读。
4. **限制事实来源**：产品事实只能来自官方资料，未知或可能变化的信息要说明不确定。

CreatorOS 的对应实现不能直接复制 Codex 文件系统 Skill，因为 CreatorOS 用户运行的是桌面产品，运行
时不具备开发仓库。应该在现有 `ai-worker` official Skill 注册内实现一个产品运行时 Skill。当前
signed remote prompt bundle 与 effective snapshot 不是同一份版本真相，因此初版应随官方代码发布；
热更新要等两条链统一后再单独建设，不能把“验签成功”误当成“当前对话已经生效”。

## 8. 推荐给 CreatorOS 的落地形态

### 8.1 两层加载

- 常驻层：只有 `creatoros.guide` 的短描述，明确正向和负向触发边界。
- 按需层：模型真正选择后，读取版本化、用户安全的 CreatorOS 产品知识；普通对话不注入全文。

### 8.2 一个 Skill，不接管其他 Skill

`creatoros.guide` 只提供产品事实、工作流解释、内容创作依据与边界。它不替代 `topic.generate`、
`script.draft`、`research.gather` 等创作 Skill。模型可以先读元 Skill，再调用原有创作工具。

### 8.3 正确率以“不误触发”为第一约束

正向样例包括：

- “CreatorOS 的数据飞轮怎么运作？”
- “帮我写一条介绍 CreatorOS 本地优先设计的口播稿。”
- “为什么 CreatorOS 不是普通项目管理工具？”

负向样例包括：

- “帮我做一个 AI 工具选题。”
- “介绍一下其他创作系统。”
- “把这段稿子改短一点。”
- 引用材料偶然出现 CreatorOS，但当前请求只要求翻译、摘要或处理其他主题。

### 8.4 工具与 Skill 的长期治理

- 页面先收窄；再由语义检索选择少量工具；最后执行严格 contract。
- 所有上下文工具统一 `ok/partial/error`。
- 工具描述、输入 schema、结果 schema 与卡片文案共同版本化。
- 每次产品事实更新时更新 `creatoros.guide` 版本，并随官方代码版本发布；不把内部 URL、密钥、控制
  ID 或未上线愿景写进用户可用知识。远程更新只有在 future task 统一签名结果与 effective snapshot
  后才能启用。

## 9. 裁决

CreatorOS 不需要再加一个常驻大 system prompt，也不需要用关键词列表判断“是不是在聊 CreatorOS”。
最合适的是：**一个低误触发、按需加载、权威来源受控的 official 元 Skill；它先提供产品真相，再把
创作动作交回现有工具。** 同时把 T-769 后续治理升级为“相关工具检索 + 严格契约 + 正负评测”。
