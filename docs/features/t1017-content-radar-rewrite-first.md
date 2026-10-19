# T-1017 内容雷达改写优先：产品与实现 SPEC

状态：草案，待独立评审。评审通过前不进入实现。

## 1. 用户目标

用户已选中一条对标作品，CreatorOS 使用这条作品的真实文案和可用的账号定位，尽快给出一份可编辑、可复制的“我的改写稿”。用户看重首稿能用，不要求系统先完成多段分析或补齐一张字段齐全的选题卡。若当前没有可用定位，仍生成通用改写稿，并明确标注“未应用账号定位”，不阻断首稿，也不谎称结果已个性化。

```mermaid
flowchart LR
  A[选择对标作品] --> B[读取作品文案与可用定位]
  B --> C[一次生成我的改写稿]
  C --> D[立即查看、编辑、复制]
  D -.可选.-> E[补充整理为选题卡]
```

## 2. 当前问题与范围

用户日志中，同一内容雷达 `topic_preview` 生成请求两次以 `output_invalid` 失败。日志可证明服务拒绝了不合格输出，但没有记录模型 `finishReason`，因此不能把具体供应商拦截原因写成已确认事实。

现有产品把来源拆解、改写策略、选题卡和改写稿串成必须全部成功的步骤，并要求模型返回较多结构化字段。任一中间步骤或字段格式出错，用户就拿不到最重要的改写稿。本任务将主结果改为纯文本改写稿，移除其对这些中间产物和卡片字段的依赖。

本任务覆盖内容雷达里“已选来源 → 我的改写稿”的产品和生成链路，并确保现有采纳/创建 Project 流程能继续拿到这份首稿及真实来源证据。创作者中心自动扫码保留在 T-633；发布链路不在本任务范围。

## 3. 目标行为

1. 用户在内容雷达选中已有文案的对标作品，点击“生成我的改写稿”。系统直接以服务端确认的来源文案和该账号当前可用定位为输入，执行一个主生成步骤；不要求用户依次触发拆解、策略、选题卡和改写稿。
2. 主生成请求要求产出可读的纯文本，不要求 JSON 或固定字段/段落数量。输出中可以带可选标题，但标题、角度、差异化、来源摘要、四段策略和选题卡字段不作为成功条件。
3. 只要服务端收到并保存了非空正文，主任务就显示成功，并立即让用户查看、编辑和复制。可选信息整理不在此任务中自动运行；失败或缺少它们不能把已有正文改成失败或清空正文。
4. 首稿失败时，保留上次成功正文及来源快照，给出清晰的重试入口。只有用户明确重试才发起新调用；调用结果未知时先回读原任务状态，不能盲目重发产生重复调用。
5. 选题卡不是第二个 AI 生成任务。用户可在首稿已可用后显式“采纳为选题”或“一键升级项目”；服务端以真实来源标题作为缺省标题，携带已生成正文和最小来源证据，其他选题字段留空供用户以后补充。候选/Project 写入失败只影响该次写入，不改变已成功的改写任务，也不重新调用模型或覆盖正文。
6. 页面刷新、切换作品或重新打开时，从服务端任务和已保存快照恢复状态；迟到的旧作品响应不得覆盖当前作品。不得要求用户切 Tab、重选作品或手动刷新才能看到已完成结果。
7. 缺少定位只影响个性化程度，不阻断改写：系统生成通用候选，清楚显示“未应用账号定位”，且快照不记录虚假的定位版本。用户之后补充定位时可明确重新生成。

## 4. 生成、持久化与边界

- `intelligence.transforms.previewTopic` 的 `positioningVersionId` 改为可选以兼容旧客户端；服务端不以客户端传入的 ID 作为当前定位真相。有正式定位时，服务端读取当前完整定位母版（陈述、关键词、画像、规则及版本，复用 T-678 要求）并在任务创建时冻结；没有定位时冻结 null 并走通用改写。旧版显式 ID 请求仍被接受，但只作为提示，不可让过期版本覆盖当前正式定位。
- 生成输入必须绑定真实来源和可用的来源文本快照。服务端负责写入 source URL/ID、snapshot ID、transcript hash、定位是否实际应用及可用时的 positioning version、template/model 运行回执与时间；客户端或模型不得伪造、覆盖这些来源证据。新 `rewrite_only` transform 的定位版本允许为空，旧 transform 的版本和读法不变。
- 权限、账号归属、来源存在性和并发/幂等冲突继续作为硬门。来源文案真实可用时，即使定位缺失仍可走通用改写路径；不得伪造来源、定位或个性化事实。模型返回的正文必须是模型实际返回并通过最小非空检查的文本，不能拼接占位内容报成功。
- 新生成的改写稿只要求真实来源文本哈希、模板版本和模型运行身份等可核验 provenance；不要求生成 strategy hash、拆解、改写策略或结构化卡片。未生成的证据必须保持缺省，禁止用空壳、假策略或虚构拆解来满足旧 schema。
- 生成结果先作为候选供用户查看与编辑，不自动发布、不静默覆盖已采纳 Project 正文。需要采纳/创建 Project 时继续走现有显式操作和权限检查。
- 现有关于事实风险、隐私和内容相似风险的提示/采纳规则不在本 SPEC 中放宽。为保证用户能先看到候选，生成页可以显示已生成正文和风险提示；若现有采纳规则拒绝高风险候选，仍不得绕过该规则。该规则不得阻止用户先查看、编辑和复制候选。
- 任一失败不得删除历史 transform、来源或成功正文。旧选题卡与旧 Project 继续按兼容读路径展示；本任务不迁移或重写历史正文。
- 新增明确的 `rewrite_only` 结果变体：候选正文携带 `generationMode: "rewrite_only"`、真实 `sourceSnapshotId` / transcript hash、模板版本、模型运行回执引用及 `personalizationStatus: "applied" | "not_applied"`；实际应用的 positioning version 可选记录。strategy hash、拆解、改写策略和结构化选题字段可以不存在。旧版 strategy-backed 结构继续原样读取。
- Candidate `adaptedDraft` 与 Project `adaptedDraftSeed` 接受两个兼容变体：旧记录保留必需 `strategyHash` 的完整形状；新记录通过 `generationMode: "rewrite_only"` 明确表示 `strategyHash`、拆解和策略不存在。Candidate 写入校验仍从服务端 transform 回读 source snapshot / transcript hash / positioning snapshot，客户端只能提交可编辑正文，不能提交或覆盖 provenance。
- 新的 Project `contentRadarEvidence` 使用显式 union：旧版完整 evidence 仍要求并读取 `decomposition + strategy + strategyHash`；`rewrite_only` 仅要求服务端核验的真实 `sourceReferences + sourceSnapshotId + transcriptHash + adaptedDraftSeed`，并保留定位是否应用/实际版本与模型回执。Project contract、service parser、candidate promotion 和 `draft-workbench` seed reader 必须识别该变体；可选拆解/策略缺失不得使 Project 丢弃首稿。
- 现有候选确认和 Project 创建仍需显式用户操作。`confirmTopic` 对旧版完整任务维持 `topic + draft + strategyHash` 校验；仅对 `rewrite_only` 分支以主任务成功、非空 draft、来源/逐字稿 hash、模型回执与幂等证明作为门槛，不要求 `topic` checkpoint 或 strategy hash。候选卡标题回退到真实来源作品标题；其他未生成字段保持缺省，允许用户以后补充。
- 基于 `rewrite_only` seed 执行 Project 后续 `script.draft` 时，将已确认改写稿、真实来源引用、可读取的逐字稿和当时实际使用的定位快照作为上下文；缺少拆解/策略时明确说明该证据不存在并继续，不伪造分析，也不把其缺失当作整单硬失败。若真实来源、hash 或权限校验失败，仍明确受阻。既有事实、权限、来源一致性和相似性采纳规则保持有效。
- 前后端共用的 `previewTopic`、Candidate 和 Project contract 以向后兼容方式扩展该新变体；旧客户端请求和旧存量记录继续可读。后端业务逻辑仍位于 backend，单次模型调用仍通过 worker/ai-runtime，worker 写库仍经 backend service port。

### 4.1 `rewrite_only` 的协议与任务状态

- `intelligence.transforms.previewTopic` 请求体中的 `positioningVersionId` 改为 optional；旧客户端继续可传。服务端新建任务时解析当前完整定位母版并冻结到任务输入，不把请求中的历史 ID 当权威版本；无当前正式定位时冻结 null。`intelligence_transforms.positioning_version_id` 及 transform/provenance 资源需要允许新记录为空，旧记录无需迁移、内容不变。
- 新 transform 的 `outputSnapshot` 使用 `generationMode: "rewrite_only"`，`adaptedDraft` 形状为：`contentText`、`sourceSnapshotId`、`generatedFromTranscriptHash`、`templateVersion`、`personalizationStatus`，以及可选 `positioningVersionId`。执行任务及模型 call ledger 仍由 `aiTaskId` 关联，服务端可追溯模型身份和调用回执；不把供应商配置或密钥写入用户可见字段。
- 旧 `adaptedDraft`（`contentText + generatedFromTranscriptHash + strategyHash + templateVersion`）继续作为 strategy-backed 变体接受。解析器不得要求 rewrite-only 变体带 `strategyHash`，也不得把可选字段补成空策略。
- 新 Project `contentRadarEvidence` 使用 `generationMode: "rewrite_only"` 作为 discriminant，必需 `sourceReferences + sourceSnapshotId + generatedFromTranscriptHash + adaptedDraftSeed`，可选 `positioningVersionId` / `personalizationStatus`；不要求 decomposition/strategy/strategyHash。无 discriminant 的旧完整 shape 按原逻辑读取。合同、schema parser、Candidate promotion、Project seed reader 与 Project reference reader 都要遵守该 union。
- 主任务仅一个 `rewriteDraft` 状态：`pending | running | completed | failed`。worker 返回非空正文并完成 provenance 检查、checkpoint 保存后立即将主任务标记 `succeeded`；不再运行或等待 `decomposition`、`topic` 或卡片整理状态。调用状态未知时沿同一 task/call ledger 恢复；只有用户明确再次生成才用新的 idempotency key 建新任务，并固定该次的 source snapshot、transcript hash 和定位快照。旧的成功稿在新尝试失败时仍保留。
- 客户端在发送生成请求之前，为这次用户尝试生成并持久保存稳定的 `idempotencyKey`；请求超时、连接中断或响应无法判定时，恢复操作必须复用同一 key 查询/重放，并由服务端返回同一个 task/call ledger，禁止自动创建新尝试。只有服务端已确认原尝试进入终态且用户再次明确点击“重新生成”后，客户端才创建并持久保存新 key。可恢复的首稿按 `sourceSnapshotId + transcriptHash + 实际定位快照（或 null）` 隔离；当前定位已变化时，不把旧定位快照的稿件显示为当前个性化结果，旧稿仍可在历史尝试中查看。
- `confirmTopic` 的 rewrite-only 分支只接受服务端已保存 transform 中的非空改写稿及经过归属/哈希核验的 provenance，不检查 `topic.completed`、策略存在性或策略哈希。允许客户端附带 `editedDraftContentText` 作为用户编辑结果；服务端只把此字段视为正文编辑，不信任客户端提交的来源、定位或模型 provenance。旧 strategy-backed 分支维持现行校验。
- `confirmTopic` 请求体必须在共享 contract 中表达兼容 union：旧 `strategy-backed` 分支继续接受现有完整 `editedCandidate`（不改变旧客户端字段要求）；新的 `rewrite_only` 分支只需 `idempotencyKey`，可选携带非空 `editedDraftContentText`，不要求 `editedCandidate`、strategy hash 或任何选题卡字段。服务端按已保存 transform 的 `generationMode` 选择分支；客户端不能靠空数组、空策略或占位字段满足旧 shape，也不能把可选编辑正文中的值当作来源 provenance。
- 用户在雷达中直接编辑的正文先是本地草稿，复制不要求额外保存；显式“采纳为选题/一键升级项目”时把当前编辑正文与既有生成 provenance 一同保存。刷新会恢复服务端保存的原始生成正文，不丢失 AI 结果；界面需清楚提示本地编辑尚未采纳。已确认 Project 正文继续遵循现有 output_script 优先规则。

兼容 union：

```ts
type RewriteOnlyDraft = {
  generationMode: "rewrite_only";
  contentText: string;
  sourceSnapshotId: string;
  generatedFromTranscriptHash: string;
  positioningVersionId?: string;
  personalizationStatus: "applied" | "not_applied";
  templateVersion: string;
};

type LegacyAdaptedDraft = {
  contentText: string;
  generatedFromTranscriptHash: string;
  strategyHash: string;
  templateVersion: string;
};

type ContentRadarEvidence =
  | { generationMode: "rewrite_only"; sourceReferences: SourceRef[]; sourceSnapshotId: string; generatedFromTranscriptHash: string; adaptedDraftSeed: RewriteOnlyDraft; positioningVersionId?: string; personalizationStatus: "applied" | "not_applied" }
  | { sourceReferences: SourceRef[]; decomposition: SourceDecomposition; strategy: AdaptationStrategy; adaptedDraftSeed: LegacyAdaptedDraft };
```

`sourceSnapshotId` 和 transcript hash 在服务端落库与读回核验；第二个无 discriminant 的分支仅用于兼容已经保存的完整旧 evidence，新写不能伪装成旧分支。

### 4.2 Project `script.draft` 的 rewrite-only 行为

- Project intelligence reader 校验 reference 所属用户/账号、sourceSnapshotId、transcript hash 和 transform provenance；任一真实来源或权限检查失败时照常受阻，不做泛化降级。
- 合法 `rewrite_only` reference 缺少 decomposition/strategy 是预期形状：上下文包含来源链接、可用逐字稿、实际使用的定位（如有）和已确认改写稿，并用简短说明指出拆解/策略未生成。AI 使用现有候选和创作任务继续处理，不启动前置 enrichment 模型调用，不虚构拆解或策略；既有事实/相似度审核仍在原位置执行。

## 5. 页面表达

- 主操作命名为“生成我的改写稿”，完成状态叫“改写稿已生成”。不再把“生成选题卡”当作拿到首稿的必要入口；不自动再建选题卡生成任务。
- 生成页首先呈现来源文案、当前定位是否实际应用的提示和可编辑正文；中间分析步骤不占用必经交互空间。定位缺失时仍可生成，明确提示为通用改写。主生成只有一项 `rewriteDraft` 状态；任务成功与否只由该正文是否保存决定。
- 初次模型正文由服务端立即持久化。用户可在页面编辑并复制；编辑未提交前只保留在本次 UI 会话，刷新后恢复原始已保存正文。用户采纳为选题或创建 Project 时，当前编辑正文随该显式操作一并保存；不得静默覆盖已采纳版本。
- 空正文/真实调用失败时显示“这次没有生成改写稿”及重试操作，不展示内部 schema、SDK、供应商原始异常或未经日志证实的原因。
- 选题卡整理放在次级可选入口，并在成功后回显；不得要求用户完成它才能复制正文或继续现有手工流程。

## 6. 不在本任务中的内容

- 不改变定位模型本身、抖音采集能力、外部作品抓取授权、CreatorOS 激活或 Creator Center 登录。
- 不重做 Project/脚本/发布数据模型；仅扩展现有 `contentRadarEvidence` 读取和 `adaptedDraftSeed` provenance 以兼容 `rewrite_only`，并保留旧完整 evidence。不自动创建 Project，不改变已采纳稿件、发布和相似性采纳政策。
- 不改 `intelligence.projects.enqueue` 的转写后批量升级队列；T-678 对该独立队列读取当前定位的任务继续有效。本任务的完整定位快照解析只覆盖 `intelligence.transforms.previewTopic` 主改写请求。
- 不承诺特定供应商、模型或毫秒级完成时间；以是否可靠地产生并保留可用首稿作为本任务目标。

## 7. 验收标准

1. 从内容雷达已选作品触发主操作时，生成链路不再要求 source decomposition、adaptation strategy 或完整 TopicBriefCandidate 先成功；用户能先看到正文。
2. 合法的纯文本、无标题输出可以成功保存和编辑；缺少任意可选字段不能导致 `output_invalid` 或清空结果。
3. Candidate 或 Project 写入失败时，可单独重试该次显式写入；非空正文和主任务成功状态保持不变，不重新调用模型。
4. 正文生成失败时，之前成功正文、来源与定位快照保持不变；用户重试可明确确认，未知调用状态不会自动复制提交。
5. 两个作品并行/交错完成时，结果仍按作品隔离，当前页面只展示当前作品结果。
6. 无定位但有真实来源文案时，可生成、保存、查看、编辑和复制通用候选，明确标出未应用定位且不伪造定位版本；无来源文案、无权限或账号归属不匹配时不编造成功。
7. `rewrite_only` Candidate/Project 仅有 `sourceReferences + adaptedDraftSeed` 时也能确认、创建 Project 并将 seed 装入稿面；Project `script.draft` 可据此继续，缺失策略被如实说明而不阻断。旧的完整 evidence、手工 Project、普通稿件和已采纳内容保持兼容。
8. 请求未携带 positioning ID 或当前没有正式定位时仍能从真实来源文案生成通用候选；快照准确标注定位未应用、不伪造版本。存在定位时 worker 使用服务端在任务创建时冻结的当前完整定位母版，不读陈旧客户端状态。
9. `rewrite_only` 模型调用、主稿 checkpoint、任务成功状态相互一致；此流程不启动选题卡模型任务。显式候选/Project 写入失败可单独重试，不重跑主生成且不覆盖成功正文。
10. 用户编辑草稿后可立即复制；只有显式采纳/创建 Project 才持久化这些编辑，刷新会恢复服务端已保存的原始生成稿。

## 8. 既有契约的局部覆盖

- 本 SPEC 与 DEC-T1017 只对新的 `rewrite_only` 变体覆盖 T-642 / DEC-RADAR-048 中“先生成策略和拆解”“Candidate / Project evidence 必须包含 strategy/decomposition/hash”以及“无策略时脚本生成阻断”的规则。
- 对已有 strategy-backed transform、已保存 Candidate/Project、已采纳稿件及普通 Project，T-642 原约束、旧 schema 和既有读写行为保持不变。
- 新变体不削弱账号/来源归属、真实来源快照/逐字稿哈希、当前定位快照准确性（仅定位实际应用时）、模型调用回执、CAS/幂等与事实/隐私/相似性安全规则。
