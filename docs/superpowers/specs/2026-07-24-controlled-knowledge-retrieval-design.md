# SPEC：用户知识库受控检索、注入与引用证据（T-497）

> 日期：2026-07-24  
> 用户原则确认：confirmed（资料可入库、可检索，但不能无控制地支配输出）  
> 默认策略确认：pending  
> 独立评审：FAIL（第三轮仍有 blocker，按流程退回 PLAN）  
> 上游：[Context 层统一重设计](2026-07-03-context-layer-redesign.md)、[Skill 驱动编导智能体](2026-07-10-skill-driven-creative-agent-design.md)

## 1. 问题

当前脚本链已做相关性搜索和字符预算，但仍有四个结构性问题：

1. 检索无命中会退回最近 40 条知识，等于把“不相关”误当成“至少塞一点”。
2. 知识 brief 默认允许 40,000 字符；模型窗口变大后，预算反而被放宽。
3. 高优先级项目文档最多 8 份、每份最多 200,000 字符直接注入；“优先”被实现成“整篇支配上下文”。
4. `KnowledgeRow` 只带标题、类型和来源备注，没有稳定 source/chunk 锚；结果只保存脚本，不保存检索与引用证据。

用户遇到的不是“知识库没接”，而是“知识进入模型的方式不可控、不可见、不可追责”。

### 1.1 价值与可行性证据

- 直接用户证据：用户已经上传私募法律资料，但无法判断系统是否调用；同时明确担心“大语料”
  和“高质量/高权威资料”反而支配输出。
- 代码 RAT（2026-07-24 已执行）：当前知识预算可达 40,000 字符；高优先级文档理论上可达
  `8 × 200,000 = 1,600,000` 字符；零检索命中会退回最近 40 条。风险不是假设，而是已存在路径。
- 可行性：仓内已有 account-scoped hybrid search、知识 revision、项目资料 role/priority 和
  AI 候选确认门；本设计新增的是受控投影、装配策略与证据清单，不需要替换模型或迁移到云端。
- 待产品验证的假设：用户能理解“本次将参考 N 个片段”而不会觉得多一步。先用折叠摘要 +
  默认自动受控，不要求每次配置；上线前用 5 个真实脚本任务做可用性走查。

### 1.2 替代方案

| 方案 | 结果 | 决定/切换触发器 |
|---|---|---|
| 忍着现状，只把模型窗口开大 | 放大噪声、成本、延迟和单源支配 | 拒绝；若受控方案采纳率更低则回退为“本次不使用知识”，不回退 dump |
| 每次让用户手工勾文档 | 可控但摩擦过大，知识库失去自动价值 | 拒绝；若自动模式关闭率 >40%，将“仅所选”提升为常用入口 |
| 只做 top-k，不记录 manifest | 控制了数量，但用户仍不知道实际发送/引用了什么 | 拒绝；证据透明是用户原始诉求 |
| 单一“质量分”排序 | 权威材料会顺带控制观点与风格，且无法解释 | 拒绝，无切换条件 |
| 分角色、硬过滤、预算装配、可见证据 | 默认省心，同时保留边界和可追责性 | 采用；第 28 天按 §10 指标复核 |

## 2. 设计原则

1. **可入库不等于可自动注入。**
2. **检索到不等于发送给模型，发送给模型不等于模型采用。**
3. **上下文窗口是容量上限，不是装满目标。**
4. **权威性只提高事实/合规角色，不自动获得表达、立场或风格控制权。**
5. **没有相关命中宁可为空，不用随机最近资料凑数。**
6. **用户不需要每次配置；默认自动受控，只有需要时才展开干预。**

## 3. 资料不是一个“质量分”

每个可检索片段必须分别保存以下维度，禁止合并成一个总质量分：

| 维度 | 值示例 | 用途 |
|---|---|---|
| `role` | `constraint / evidence / reference / style / negative` | 决定允许影响什么 |
| `trust` | `user_confirmed / authoritative / derived / unverified` | 决定事实可信度 |
| `scope` | account/project/topic | 决定在哪个创作范围可用 |
| `freshness` | 生效日、失效日、抓取时间 | 法律、政策、数据是否过期 |
| `jurisdiction` | 中国大陆/地区/平台 | 防止法规跨地域误用 |
| `domainRisk` | normal/professional/high_stakes | 资料所在领域的最低风险建议 |
| `provenance` | sourceId/revisionId/chunkId/offset | 形成稳定引用链 |

例子：

- 法规原文：`authoritative + evidence/constraint`，约束事实与合规，但不能替用户决定表达风格。
- 用户已确认的产品事实：`user_confirmed + constraint`，可以成为项目硬事实。
- 爆款脚本：可以是 `style/reference`，不能当法律事实。
- AI 自动总结：`derived`，未经用户确认不能升级为硬约束。

### 3.1 字段落点、默认值与权限

业务真值仍在原实体：`knowledge_items / knowledge_item_revisions`、项目资料、Skill 配置及专业
provider；检索层只新增可删除重建的 `context_chunks` 投影，不把搜索结果变成业务真值。

```ts
type ContextChunk = {
  id: string; // hash(provider, sourceId, revisionId, startOffset, endOffset, contentHash)
  userId: string;
  accountId: string;
  provider: "knowledge" | "project_document" | "skill" | "professional_db";
  sourceId: string;
  revisionId: string | null;
  chunkIndex: number;
  startOffset: number;
  endOffset: number;
  contentHash: string;
  content: string;
  title: string;
  role: "constraint" | "evidence" | "reference" | "style" | "negative";
  trust: "user_confirmed" | "authoritative" | "derived" | "unverified";
  scopeType: "account" | "project" | "topic";
  projectId: string | null;
  topicId: string | null;
  effectiveAt: string | null;
  expiresAt: string | null;
  jurisdiction: string | null;
  domainRisk: "normal" | "professional" | "high_stakes";
  facts: ContextFact[];
  metadata: Record<string, string | number | boolean | null>;
  indexedAt: string;
};

type ContextFact = {
  key: string; // 命名空间化，如 cn.csrc.private_fund.minimum_requirement
  normalizedValue: string;
  valueType: "text" | "number" | "date" | "enum" | "boolean";
  unit: string | null;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  confirmation: "user_confirmed" | "deterministic_import";
  startOffset: number;
  endOffset: number;
};
```

默认与升级规则：

- 存量知识默认 `role=reference`、`trust=unverified`、`scopeType=account`、
  `domainRisk=normal`，时间/地域未知为 `null`；禁止因“用户上传”自动视为已确认或权威。
- AI 解析只可提出 metadata/fact candidate；`trust=user_confirmed`、`role=constraint` 和
  `facts` 的升级必须由用户或确定性导入器经 backend service 确认，AI 不直接改真值。
- authoritative 法律资料缺来源、地域或生效信息时，装配时按 `unverified` 处理。
- facts 规范化：文本做 Unicode NFC + 空白折叠；数字使用十进制定点字符串并要求 unit 一致；
  日期为 ISO-8601；enum 使用导入器定义的 canonical ID。只有 key、适用时间区间重叠且
  valueType/unit 可比、normalizedValue 不同才构成确定冲突。
- 旧 manifest 不跟随投影改写；它保存当时 included excerpt/hash，保证历史脚本仍可审计。
- `context_chunks` 仅由 owning module 的 projection port 写入；AI runtime 只读，仍不得直连 PG。

revision 重建使用 durable `context_reindex` execution task：

- task 状态复用 `queued/running/cancelled/succeeded/failed/blocked`，幂等键为
  `context-reindex:{accountId}:{provider}:{sourceId}:{revisionId}`；checkpoint 保存最后 chunkIndex，
  租约过期走现有重启恢复，瞬态失败最多 2 次，解析/权限错误直接 blocked。
- `context_source_projections` 保存 `currentRevisionId / activeRevisionId / stagingRevisionId /
  status(ready|stale|indexing|failed|blocked) / taskId / lastErrorCode`。新 chunks 先写 staging；全部校验成功后由 backend service
  单事务切换 activeRevisionId，旧 chunks 再异步清理。
- 真值 revision 更新后若 activeRevisionId 尚未追上，投影状态为 `stale`，自动检索必须排除；
  UI 显示“资料正在重新索引/重试”。重建失败不回退注入旧内容，高风险模式也不得绕过。
- 用户取消时保留旧 active chunks 供历史 manifest 展开，但当前 revision 仍不得自动检索；
  点击重试创建同幂等任务的新 attempt。

### 3.2 检索内容不是系统指令

除用户明确确认的 `constraint` 外，所有 retrieved chunk 都作为不可信引用数据放在隔离区，
其中出现的“忽略上文”“必须按此执行”等指令句不得提升为系统指令。即使来源权威，
它也只能在其 role 允许的维度生效。

## 4. 受控上下文流水线

```mermaid
flowchart LR
  A["知识/文件/Skill/专业库"] --> B["解析、切块、去重、标注角色与来源"]
  B --> C["按当前选题召回候选"]
  C --> D["范围/权限/时效/风险硬过滤"]
  D --> E["相关性重排 + 单源上限 + 多样性"]
  E --> F["token 预算装配"]
  F --> G["Context Manifest"]
  G --> H["发送给用户配置的模型"]
  H --> I["脚本 + 声明引用"]
```

### FR-KNOW-01 分块索引，不整库/整篇注入

- 知识条目、项目文档、专业数据库和 Skill 记忆都通过统一只读 `ContextProvider` 暴露候选片段。
- 长文按标题/段落语义切块，每块保留稳定 `sourceId/revisionId/chunkId/offset/contentHash`。
- 原文仍可按需全文读取，但自动生成只消费检索出的片段。
- “高优先级资料”表示优先进入候选池和保留预算，不表示全文必进 prompt。

`chunk-policy-v1` 是确定性算法：

- 输入先统一 UTF-8、换行与 Unicode NFC；offset 使用归一化 UTF-8 byte offset，hash 也基于
  同一字节流。
- 先按标题层级、段落和句子边界切分；单块最多 700 tokens，相邻块最多重叠 80 tokens；
  超长句按 token 边界硬切。
- 表格按行切分，每块重复表头且计入 700-token 上限；不能解析的二进制/图片表格为
  `blocked / PARSE_FAILED`，不注入 OCR 猜测。
- 优先使用本次模型的官方 tokenizer；不可用时使用
  `max(Unicode code points, ceil(UTF8 bytes / 3))` 的保守估算，并在 manifest 记录
  `tokenizer=conservative-v1`。
- `chunkId` 带 `chunkPolicyVersion`；策略升级会触发全量可恢复 reindex，不把新旧 offset 混用。

### FR-KNOW-02 两段检索

1. 召回：每个 provider 关键词 top 20；有 embedding 时再取余弦
   `score >= 0.35` 的 semantic top 30；去重后全局最多 50 个候选。
2. 重排：先硬过滤，再按下述稳定 tuple 排序并装配，不把所有维度压成一个“质量分”。

排序 tuple：

1. 用户本次显式 pin；
2. 任务相关性分桶（exact / semantic score；trust 不得把低相关资料提到高相关桶）；
3. scope 精确度（topic > project > account）；
4. 当前 Skill `contextRequirements` 声明的 role 顺序；
5. 仅在 `evidence/constraint` 同桶内，以 trust、freshness 作 tie-break；
6. `sourceId + chunkIndex` 保证确定性。

硬过滤先于排序：跨账号、archived、解析失败、过期且要求时效、jurisdiction 不匹配的片段不能进入候选。

`riskMode` 不是模型猜测：由 Skill 声明最低值（通用脚本默认 `normal`；法律类 Skill 应声明
`high_stakes`），用户只可选更严格值，不能低于 Skill 基线。运行时取
`max(skillMinimum, userChoice, includedChunks.domainRisk)` 并写入 manifest。

### FR-KNOW-03 明确预算

脚本节点默认知识预算：

- 不超过可用输入预算的 20%，且绝对上限 8,000 tokens；
- 最多 12 个片段；
- 同一 source 最多 3 个片段，且不超过总知识预算 30%；
- `style/reference` 合计最多 2 个片段；
- 用户显式选择“仅使用此资料”时才允许单源超过 30%，并在 UI 明示。

预算属于 Skill 的 `contextRequirements`，不同节点可以声明更小值，不能因为模型支持 1M context 自动放宽。

“可用输入预算”固定为：

`模型输入上限 - system - tool schemas - 用户输入/历史 - Skill.maxOutputTokens 预留 - 10% 安全余量`。

各项先用与 chunk 相同 tokenizer 计数；`Skill.maxOutputTokens` 必填，存量通用脚本回填 4,000。
知识预算再取 `min(可用输入预算 × 20%, 8,000)`；若结果小于 512 tokens，知识上下文为空并
记录 `insufficient_budget`，不得挤压 system/tool/output 预算。

### FR-KNOW-04 禁止无命中 dump

- 搜索正常但零命中：知识上下文为空，manifest 记录 `no_relevant_hit`。
- embedding 未配置：允许关键词检索，UI 标记“仅关键词检索”。
- 检索服务异常：普通创作可带可见警告继续；professional/high-stakes 模式不得悄悄继续生成事实性结论。
- 唯一允许的兜底是用户本次显式 pin 的资料；禁止回退“最近 N 条”。

### FR-KNOW-05 冲突处理

- 只有以下可确定情况进入自动冲突门：`ContextFact` 按 §3.1 规则可比但值不同，或知识图存在显式
  `contradicts` 关系。一般语义相似不能被系统冒充为已证实冲突。
- 同一事实出现可确定冲突时，不通过排序悄悄选赢家。
- manifest 记录冲突片段；普通创作在结果中提示，professional/high-stakes 的冲突事实不生成确定性结论。
- 无确认 facts 的非结构化资料可以提示“疑似口径不同”，但不自动阻断；用户可将确认后的关系
  写回知识图，后续才进入确定性冲突门。
- `negative` 资料只表达“不要这样写/不要采用”，不能被模型当正向事实。
- 当前账号定位与表达规则控制“怎么说”；权威证据控制“事实能不能这样说”，两者不可互相覆盖。

### FR-KNOW-06 Context Manifest

每次生成持久化一个 manifest 聚合根：

```ts
type ContextManifest = {
  id: string;
  userId: string;
  accountId: string;
  aiTaskId: string;
  runId: string | null;
  projectId: string | null;
  resultId: string | null;
  queryText: string; // 仅本地持久化，普通日志只记 hash
  queryHash: string;
  policyVersion: string;
  chunkPolicyVersion: string;
  tokenizerVersion: string;
  modelProvider: string;
  modelId: string;
  riskMode: "normal" | "professional" | "high_stakes";
  selectionMode: "auto" | "selected_only" | "off";
  tokenBudget: number;
  tokenUsed: number;
  status: "assembling" | "sent" | "completed" | "generation_failed" | "citation_warning";
  createdAt: string;
  completedAt: string | null;
};

type ContextManifestEntry = {
  manifestId: string;
  sourceId: string;
  revisionId: string | null;
  chunkId: string;
  role: "constraint" | "evidence" | "reference" | "style" | "negative";
  trustAtSelection: "user_confirmed" | "authoritative" | "derived" | "unverified";
  effectiveScopeAtSelection: "account" | "project" | "topic";
  effectiveAt: string | null;
  expiresAt: string | null;
  jurisdiction: string | null;
  domainRiskAtSelection: "normal" | "professional" | "high_stakes";
  factsHash: string;
  title: string;
  excerpt: string | null; // 只为 included 快照正文，未 included 不复制全文
  contentHash: string;
  retrievedRank: number;
  includedOrder: number | null;
  citedAt: string | null;
  citedBy: string[]; // paragraph/shot stable ids
  scores: {
    matchType: "pinned" | "exact" | "semantic";
    relevance: number | null;
    scopeRank: number;
    roleRank: number;
    trustRank: number | null;
    freshnessRank: number | null;
  };
  userDecision: "auto" | "pinned" | "excluded";
  reasonCodes: string[];
  tokenEstimate: number;
  sourceTokenShare: number;
  decision:
    | "included"
    | "below_threshold"
    | "over_budget"
    | "duplicate"
    | "scope_mismatch"
    | "expired"
    | "conflict";
};
```

必须区分：

- `retrieved`：进入候选集；
- `included`：真实发送给模型；
- `cited`：模型在结构化结果中声明使用。

系统只能展示这三种客观状态，不能声称“某资料影响了 37%”或“模型一定采纳”。

事务与生命周期：

1. 检索完成后，在调用模型前创建 manifest + 全部 retrieved entries；included 行保存 excerpt，
   manifest 从 `assembling` 变 `sent`。
2. 模型失败时保留 `generation_failed` manifest，便于解释费用与失败点。
3. 模型返回后先做本地结构和引用校验，再由 backend service 在一个工作单元内保存候选结果、
   `resultId`、citedBy 和 manifest 终态；AI runtime 不直接写表。
4. pin/exclude 属于本次 manifest 的用户决策，不回写资料全局权重；需要永久调整时走知识
   metadata 的独立确认操作。
5. entry 快照所有参与决策的归一化字段、rank、reasonCodes 和预算结果；历史解释只依赖
   manifest + `policyVersion/chunkPolicyVersion/tokenizerVersion`，不读取后来已变化的投影。

### FR-KNOW-07 结构化引用

- script schema 的段落/镜头由连续 segments 组成，最终正文只能由 segments 顺序拼接，不能存在
  schema 外的未分类文本：

```ts
type ScriptSegment = {
  id: string;
  text: string;
  kind: "expression" | "factual_claim" | "legal_claim" | "opinion";
  certainty: "asserted" | "qualified";
  sourceRefs: string[];
  verificationStatus: "supported" | "conflicted" | "unverified";
};
```

- `sourceRefs` 只能引用本次 manifest 中 `included` 的 chunkId；`supported` 只表示存在可追溯
  evidence，不表示事实为真。模型给出的 kind/verificationStatus 也是候选，不能作为专业核验。
- 服务端本地校验引用 ID 存在、属于当前账号且确实发送过；无效 ID 从引用数组移除并记录
  `CITATION_INVALID`，不能靠模型自证。
- 引用表示“模型声明该段依据此资料”，不冒充法律/事实核验结论。
- `expression/opinion` 允许无引用；`factual_claim/legal_claim` 无 included 引用时只能
  `qualified + unverified`。schema coverage validator 必须证明 segments 拼接与展示正文逐字相同。
- 引用错误不触发自动付费重跑：普通模式保留候选并标 `citation_warning /
  needs_source_review`，未复核前不能把相关段落标成“有依据”；professional/high-stakes 模式
  task 进入 `blocked / CITATION_INVALID`，保留预览但不可采纳。用户可显式“重新生成”或删除/
  改写该事实段，由新 task 产生新 manifest。现有 SDK 自身的结构化输出重试不额外叠加。
- professional/high-stakes 的候选无论引用是否齐全，都带
  `requires_professional_review=true`，用户完成“我已核对专业表述”确认前不可采纳为正式稿。
  这是对模型可能误分类 claim 的 fail-safe；产品不宣称自动识别已覆盖全部法律事实。

### FR-KNOW-08 轻量用户控制

生成前默认只显示一行：

> 本次将自动参考 6 个片段，来自 4 份资料 · 查看/调整

展开后允许：

- pin 必须参考的资料；
- exclude 本次不要用的资料；
- 选择“自动受控 / 仅所选资料 / 本次不使用知识库”。

生成后显示“本稿资料依据”，按已发送与声明引用分组；读取失败、零命中和冲突必须可见。

## 5. 专业法律语料的额外规则

对私募法律、法规、监管口径等资料：

- authoritative 资料应要求来源、适用地域和生效/更新时间；缺失则降为 unverified。
- 高权威资料只约束事实与合规，不自动覆盖用户定位、观点角度和口播风格。
- 法律 claim 没有 included evidence 时只能 `qualified + unverified`；即使有 evidence，
  high-stakes 候选仍需人工专业确认后才能采纳。
- 产品不得把“有引用”包装成法律意见或专业审核通过。

## 6. 隐私与日志

- 原始资料、索引和 manifest 默认保存在当前账号本地数据中。
- 生成时只把 `included` 片段发送给用户配置的模型服务商；使用本地模型时可不离开本机。
- 普通诊断日志只记录 source/chunk ID、数量、token、decision 和错误类型，不记录全文、Cookie、签名 URL 或模型密钥。
- UI 的隐私说明必须明确“本地保存”和“生成时必要片段出网”是两件事。

## 7. 现网事实与复用

| 能力 | 现有实现 | 证据 | 决定 |
|---|---|---|---|
| hybrid search | 已有 | `frontend/src/server/persistence-client.ts:3421-3458`、`backend/src/modules/search/search.service.ts:228-268` | 复用召回层 |
| account-scoped search | 已有 | `backend/src/modules/search/search.repository.ts:88-95` | 保持严格隔离 |
| 知识 revision/source | 已有 | `backend/src/schema/knowledge.ts:18-46` | 复用 source/revision 真值 |
| 知识预算 | 已有但过宽 | `backend/src/modules/ai-runtime/creative-context.ts:742-788` | 改为 token/片段/单源三重预算 |
| 无命中退 list | 已有且需删除 | `backend/src/modules/ai-runtime/creative-context.ts:523-531` | 零命中不再 dump |
| 高优先文档全文注入 | 已有且需收口 | `backend/src/modules/ai-runtime/creative-context.ts:851-934` | 改成分块检索；硬约束只来自显式事实 |
| script result | 无 `sourceRefs/contextManifest` | `backend/src/modules/ai-runtime/script-runner.ts:171-189`；全仓 `rg "sourceRefs\\|context_manifest"` 零命中 | additive 增 manifest/citations |
| 其他 citation/provenance | 有，但不属于脚本引用 | 全仓检索仅命中知识图 `citationNote`、素材/选题 provenance 等 | 不误当成脚本来源证据 |

不引入独立向量数据库：当前目标量级下 PGlite JSON embedding + 现有 SearchService 足够；只有 10,000 项索引 P95 超过 PRD 500ms 且优化现有索引无效时，才重新评估 pgvector/专用向量库。

### 7.1 现成方案/OSS 调研

| 候选 | 采用 | 不采用 |
|---|---|---|
| LlamaIndex hybrid retrieval + metadata filters + CitationQueryEngine | metadata 硬过滤、独立 citation chunk、来源节点粒度 | 不整体引入 Python/Cloud SDK；CreatorOS 已有 TS SearchService 与本地 PGlite |
| Haystack DocumentSplitter | source_id、页码/offset、原 metadata 随 chunk 继承 | 不引入第二套 pipeline/runtime |
| LangChain ContextualCompressionRetriever | “先宽召回、后只保留相关内容”的两段思想 | 首版不使用 LLM compressor，避免额外费用、延迟及资料指令被错误保留 |

参考：[LlamaIndex 检索 API](https://developers.api.llamaindex.ai/api/resources/beta/subresources/retrieval/methods/retrieve/)、
[LlamaIndex CitationQueryEngine](https://docs.llamaindex.ai/en/v0.10.17/api_reference/query/query_engines/citation_query_engine.html)、
[Haystack DocumentSplitter](https://docs.haystack.deepset.ai/docs/documentsplitter)、
[LangChain Contextual Compression](https://reference.langchain.com/python/langchain-classic/retrievers/contextual_compression)。

## 8. 验收

1. 10,000 条知识、100 份长文时，单次脚本知识上下文仍满足 8,000 tokens、12 chunks、单源 30% 上限。
2. 搜索零命中时 included=0，绝不出现最近知识 dump。
3. 200,000 字高优先文档只注入相关片段；除非用户选“仅使用此资料”，不得支配超过 30% 知识预算。
4. 跨账号、过期、解析失败和 jurisdiction 不匹配片段 included=0。
5. 每个引用 ID 都存在于本次 included manifest；普通模式伪造引用被本地删除并产生
   `citation_warning`，不得标“有依据”；professional/high-stakes 进入 blocked 且不可采纳。
6. 用户能看到检索失败、零命中、裁剪、冲突和实际引用，不需阅读技术日志。
7. professional/high-stakes 模式的正文与 segments 逐字覆盖；无依据法律 claim 只能
   qualified/unverified，且所有候选在人工专业确认前不可采纳。
8. 日志与 API 响应不泄漏密钥、Cookie、签名 URL；manifest excerpt 遵守本地数据权限。
9. 存量知识回填后默认仍为 reference/unverified；AI 不能自行升级 constraint/user_confirmed。
10. 无效 sourceRefs 不触发隐藏的第二次付费模型调用；专业模式进入可恢复的 blocked 终态。

## 9. 完整交付与难点

| HARD ID | 难点 | 关联 | 解决位置 |
|---|---|---|---|
| HARD-KNOW-01 | 长文切块后仍保持 revision/offset/contentHash 稳定 | FR-KNOW-01/06 | contract + search projection |
| HARD-KNOW-02 | 相关、权威、角色、时效不能压成一个分数 | FR-KNOW-02/05 | context policy/reranker |
| HARD-KNOW-03 | 引用是模型声明，不是因果影响或事实核验 | FR-KNOW-06/07 | schema + UI 文案 + validation |
| HARD-KNOW-04 | 专业模式缺依据时既不能编，也不能让整个创作无恢复出口 | FR-KNOW-04/05 | failure policy + visible recovery |

## 10. 成功信号

- 北极星：上线后第 28 天，用户查看“本稿资料依据”的脚本中，引用后仍被采纳的脚本占比 ≥60%。
- 护栏：零命中 dump 次数为 0；跨号 included 次数为 0；单源超预算但未获显式确认次数为 0。
- 若第 28 天用户主动关闭知识库生成的比例 >40%，或引用脚本采纳率低于无知识脚本，则回到 PLAN 校正检索角色与默认预算，而不是继续扩大上下文。

## 11. 风险与最小验证

| 类别 | 风险/当前证据 | 最小检验 | 通过阈值/时点 |
|---|---|---|---|
| 价值 | 用户看不到知识是否被用；直接反馈已成立 | 5 个真实脚本比较现状与受控版 | ≥4/5 能正确说出使用了哪些资料；Contract 前 |
| 可用性 | 控制太严会觉得“上传了但没用” | 折叠摘要 + pin/exclude 走查 | ≥4/5 不需指导完成；Design gate |
| 可行性 | 切块可能破坏法律上下文 | 20 个含标题/表格/超长段的法律 fixture | offset/hash 100% 稳定，人工上下文可理解率 ≥95%；Build 前 |
| 商业生存性 | manifest/reindex 增加本地存储和模型输入成本 | 10k items/100 docs benchmark | 检索 P95 ≤500ms；知识 token ≤8k；发布前 |
| 依赖 | embedding/provider/tokenizer 可能不可用 | 断开 embedding/tokenizer/模型 provider | 关键词与保守计数降级 100% 可见，无隐藏付费重试；发布前 |
| 信任/合规 | 引用被误当法律审核 | 文案理解测试 + high-stakes adoption gate | 5/5 理解“引用≠核验”；未确认采纳次数 0；发布前 |
| 安全 | retrieved 内容可能提示注入或跨号泄露 | 对抗 chunk + 跨号 fixture | 系统指令提升 0、跨号 included 0、日志全文泄漏 0；发布前 |

PR-FAQ：

- **我可以完全不用知识库吗？** 可以，单次选择“本次不使用”，不会偷偷回退最近资料。
- **我能只选一份资料吗？** 可以选择“仅所选资料”；系统仍显示单源占比和专业风险，不伪装多源验证。
- **为什么不把我所有高质量资料都交给模型？** 质量不等于相关，也不代表它有权控制风格和立场；
  过量上下文会降低可解释性并增加费用。
- **迁移和维护成本是什么？** 存量资料用安全默认值自动建派生索引；用户只在要升级为约束/
  权威时确认，原始资料无需搬家。
- **是否单独收费？** 本功能不引入 CreatorOS 云端知识库费用；实际模型 token 仍由用户配置的
  服务商计费，预览会显示 included token，引用错误不会自动产生第二次调用。

Pre-mortem（可证伪死因）：

1. 第 28 天主动关闭知识库比例 >40%，说明默认检索带来的噪声大于价值；
2. 任一跨号 included 或 retrieved 指令提升为系统指令，说明安全边界失败，应立即阻断发布；
3. 有引用脚本的采纳率低于无知识脚本，说明“可见来源”没有转化为更好内容；
4. 10k 数据下检索 P95 >500ms 或 reindex 失败恢复率 <99%，说明本地投影方案无法支撑目标规模。

## 12. 可追溯矩阵

| FR | Contract/API | Service/投影 | UI | Migration | TEST |
|---|---|---|---|---|---|
| FR-KNOW-01 | 内部 `ContextProvider.listChunks` + `context_reindex` task | owning projection ports + staging/active 原子切换 | 资料索引/失败重试状态 | `MIG-CTX-001` chunk/projection backfill | `TEST-CTX-001..004` + `TEST-CTX-REINDEX-001..006` |
| FR-KNOW-02 | `context.assembly.preview` | `ContextAssemblyService` 硬过滤/稳定排序 | 预览候选与原因 | 无 | `TEST-CTX-005..010` |
| FR-KNOW-03 | Skill `contextRequirements` schema | token/chunk/source budget | 预算摘要 | Skill 默认值 backfill | `TEST-CTX-011..014` |
| FR-KNOW-04 | preview/result warning codes | no-hit/no-embedding/error policy | 零命中/降级/错误提示 | 删除 recent-list fallback | `TEST-CTX-015..018` |
| FR-KNOW-05 | `ContextFact` + conflict DTO | normalized fact/knowledge-edge gate | 冲突卡与待核实 | `facts=[]` 默认 | `TEST-CTX-019..022` |
| FR-KNOW-06 | `context.manifests.get` | manifest repository + backend UoW | “本次将参考/本稿依据” | `MIG-CTX-002` 新表 | `TEST-CTX-023..028` |
| FR-KNOW-07 | script `segments/sourceRefs/requiresProfessionalReview` | coverage + citation + adoption gate | 引用/待核实/专业确认 | additive result schema | `TEST-CTX-029..034` + `TEST-CTX-CLAIM-001..006` |
| FR-KNOW-08 | preview pin/exclude/selectionMode | manifest-local decisions | 折叠控制面 | 无 | `TEST-CTX-035..038` |

发布前必须另有三组非功能证据：`TEST-CTX-PERF-001`（10k items/100 docs P95）、
`TEST-CTX-SEC-001`（跨号/日志/提示注入）和 `TEST-CTX-E2E-001`（真实法律资料预览→生成→引用→采纳门）。
