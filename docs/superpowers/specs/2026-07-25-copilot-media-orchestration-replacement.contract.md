# T-510 Copilot 媒体工具编排 Replacement SERVICE CONTRACT

> Stage：`2-contract`  
> Status：`draft / blocked-by-PLAN-review`  
> Upstream：`2026-07-25-copilot-media-orchestration-replacement.md`  
> Decision：DEC-021、DEC-BATCH-20260725-001  
> 约束：本文只定义目标契约；未通过独立评审、Service Contract Gate、Completeness Gate 和确认②前，
> 不得进入 DESIGN/BUILD。

## 1. Contract name

`CopilotMediaOrchestrationContract`

该契约把封面参考生成与抖音分享转写收进 backend 媒体 workflow。核心不是增加更多聊天工具，而是
冻结三条数据库不变量：

1. `externalWorkId` 必须由只读 resolver 先得到；
2. canonical binding 只能有一个 winner，loser 不留下任何持久行；
3. cancel、ASR enqueue intent、ASR provider start 必须在同一 workflow 行上线性化。

## 2. Consumers and providers

| 角色 | 责任 | 禁止 |
| --- | --- | --- |
| Copilot route guard | 只产生确定性 route decision 和 contract request | 不直连 Cookie、DB、ASR/provider |
| frontend task/候选卡 | 通过 typed RPC 读 workflow projection、发 cancel/retry/confirm | 不拼状态、不生成幂等键 |
| backend media orchestration service | resolve 调用、canonical claim、workflow state、取消与 child task materialization | 不在事务内发外网请求 |
| intelligence service port | winner 的 source/item/snapshot 幂等持久化与 effect receipt 查询 | 不决定 Copilot route |
| execution service port | 幂等创建/读取/cancel parent/child task，提供唯一 lease/retry runtime | 不拥有媒体授权或领域转换 |
| host resolver/ASR adapter | 只读解析分享输入、下载音频、调用 ASR | 不直连领域表；写回经 backend port |
| T-501 capability projection | 返回精确配置的 `referenceImage` 证据与费用门 | 未交付时不得由 T-510 自造“已验证” |

## 3. Global invariants

### INV-MO-01 Resolve-before-write

`API-MO-003` 在取得合法 `externalWorkId` 前不得写：

- `copilot_media_workflows`；
- `media_operation_bindings`；
- `execution_tasks` / `ai_tasks`；
- intelligence source/item/snapshot/transcript；
- 持久 cache、短链映射或数据库审计事件。

允许的只有外部只读解析及脱敏进程日志。resolver 失败/超时的数据库写入数必须为 0。

### INV-MO-02 Canonical single winner

canonical key：

```text
(userId, accountId, opVersion, platform="douyin", externalWorkId)
```

数据库唯一约束位于 `media_operation_bindings`。winner workflow ID 在事务开始前于内存生成。
候选 workflow 先插入事务私有可见行，再尝试 binding insert；若 binding 冲突，必须抛出
`CanonicalClaimLost` 使整个事务回滚。事务外只读现有 binding/workflow 并返回。

因此：

- winner：提交 1 workflow + 1 binding；
- loser：候选 workflow 回滚，持久写入 0；
- 不存在 provisional workflow、`deduplicated_to` 行或 loser audit row。

### INV-MO-03 Workflow row linearization

以下动作都以 `copilot_media_workflows.id + userId + accountId + revision` 条件更新同一行，并在成功时
`revision = revision + 1`：

- `requestCancel`；
- `request/confirmItemEffect`；
- `commitTranscriptEnqueueIntent`；
- `linkTranscriptTask`；
- `beginAsrProviderSideEffect`；
- child terminal projection。

每次成功 CAS 都在同一事务追加一条 `MediaWorkflowEventV1`。更新影响 0 行时调用方重读新 revision，
按 operation 的冲突契约返回，不盲重放。数据库提交顺序就是外部可观察顺序。

### INV-MO-04 No external call in transaction

数据库事务内只能做 workflow/binding/checkpoint/state 写入。短链解析、item adapter、execution service
根 db port、ASR/provider 网络均在事务外调用。禁止在 PGlite transaction 回调里调用绑定根 db 的
跨模块 port，避免 `transactionMutex` 嵌套死锁。

### INV-MO-05 Cancel-before-enqueue

“enqueue”在本契约中指 workflow 行上的 `transcriptIntentState: none → committed` 线性化点，而非
稍后 materialize 的 child row。

- cancel 先提交：intent CAS 影响 0 行，child task=0；
- intent 先提交：enqueue 已先发生，后续 cancel 可阻止 materialize/provider start 或取消 child；
- provider-start 也必须再过 workflow 行 CAS。cancel 先于 provider-start 时网络 ASR=0。

## 4. Resource schemas

### 4.1 `ResolvedDouyinShareV1`（仅内存）

```ts
type ResolvedDouyinShareV1 = {
  platform: "douyin";
  externalWorkId: string;
  authorExternalId: string;
  authorDisplayName: string;
  canonicalUrl: string;
  title: string;
  coverUrl: string | null;
  publishedAt: string | null;
  durationMs: number | null;
  collectorAccountId: string;
  sessionRefHash: string;
  resolutionReceipt: {
    resolverVersion: string;
    resolvedAt: string;
    category: "public_video";
    inputHash: string;
  };
};
```

resolver 必须从 server session 的 `ctx.accountId` 选择该账号对应的 collector session，request、模型与 frontend
不得传 `browserSessionRef`。`collectorAccountId` 必须等于联合归属的 `accountId`；`sessionRefHash` 仅用于
故障关联。不得包含 Cookie/token。claim 前不得序列化到数据库、任务 payload 或持久 cache。

### 4.2 `MediaOperationBindingV1`

```ts
type MediaOperationBindingV1 = {
  userId: string;
  accountId: string;
  opVersion: "douyin-share-transcribe-1";
  platform: "douyin";
  externalWorkId: string;
  workflowId: string;
  createdAt: string;
};
```

唯一键：`(user_id, account_id, op_version, platform, external_work_id)`。`workflow_id` 也唯一。
不提供 delete；账号删除沿账号级清理事务处理。

### 4.3 `CopilotMediaWorkflowV1`

```ts
type CopilotMediaWorkflowState =
  | "canonical_claimed"
  | "runtime_task_pending"
  | "persisting_item"
  | "item_reconciling"
  | "item_persisted"
  | "transcript_intent_committed"
  | "transcript_task_linking"
  | "transcript_task_queued"
  | "transcribing"
  | "blocked"
  | "succeeded"
  | "failed"
  | "cancelled";

type TranscriptIntentState =
  | "none"
  | "committed"
  | "linking"
  | "materialized"
  | "cancelled";

type CopilotMediaWorkflowV1 = {
  id: string;
  userId: string;
  accountId: string;
  opVersion: "douyin-share-transcribe-1";
  platform: "douyin";
  externalWorkId: string;
  collectionId: string | null;
  state: CopilotMediaWorkflowState;
  revision: number;
  resolvedSnapshot: Omit<
    ResolvedDouyinShareV1,
    "sessionRefHash" | "resolutionReceipt"
  > & {
    sessionRefHash: string;
    resolverVersion: string;
    inputHash: string;
  };
  runtimeTaskId: string | null;
  itemEffectKey: string;
  itemEffectState: "none" | "requested" | "confirmed";
  itemId: string | null;
  transcriptIntentState: TranscriptIntentState;
  transcriptTaskId: string | null;
  cancelRequestedAt: string | null;
  cancelReason: "user" | null;
  blockedCode: MediaWorkflowErrorCode | null;
  nextAction: "login" | "configure_asr" | "retry" | "none";
  createdAt: string;
  updatedAt: string;
  finishedAt: string | null;
};
```

`resolvedSnapshot` 只允许 winner 持久化，且不保存原始分享正文或可复用 session reference。workflow
是领域投影/协调记录，不拥有 `leaseOwner/leaseExpiresAt/attempt`；这些字段只属于唯一 durable runtime。
workflow 不硬删除，避免 binding 悬空；用户界面可归档。

### 4.4 `MediaWorkflowEventV1`

```ts
type MediaWorkflowEventV1 = {
  id: string;
  workflowId: string;
  userId: string;
  accountId: string;
  sequence: number;
  beforeRevision: number;
  afterRevision: number;
  type: string;
  safeDetails: Record<string, string | number | boolean | null>;
  occurredAt: string;
};
```

owner 是 backend media orchestration。每次 workflow CAS 必须在同一事务追加一条事件，唯一键为
`(workflow_id, sequence)`；`safeDetails` 只存 effect receipt/task ID/错误分类/哈希，不存 share payload、
完整 URL、Cookie、逐字稿或图片字节。

### 4.5 `ReferenceCapabilityEvidenceV1`

本合同不声明本地同名类型。唯一 canonical resource 的 Defined-In 是
`2026-07-24-model-configuration-experience-redesign.contract.md` §6.1
`ReferenceCapabilityEvidenceV1`；本合同与后续 contract/schema test 必须直接引用它，完整字段固定为：
`capability/status/configurationId/slot/configFingerprint/probeProfileVersion/checkedAt/expiresAt/receiptId`。
其中 `capability="referenceImage"`、`slot="image.generate"`；字段不得省略、扩展或本地复制。

仅 `verified` 且未过期、`configurationId` 等于服务端当前 active `image.generate` 配置、
fingerprint/profile/receipt 全部匹配才允许生成；无 active 配置时 `configurationId=null` 且
status 必须为 `unknown`。

### 4.6 `MediaWorkflowProjectionV1`

```ts
type MediaWorkflowProjectionV1 = {
  id: string;
  state: CopilotMediaWorkflowState;
  revision: number;
  externalWorkId: string;
  itemId: string | null;
  transcriptTaskId: string | null;
  cancelRequestedAt: string | null;
  progress: Array<{
    step:
      | "resolved"
      | "canonical_claimed"
      | "item_persisted"
      | "asr_queued"
      | "transcribing"
      | "done";
    status: "pending" | "running" | "done" | "blocked" | "cancelled";
  }>;
  blockedCode: MediaWorkflowErrorCode | null;
  nextAction: "login" | "configure_asr" | "retry" | "none";
  message: string;
  links: {
    itemHref: string | null;
    transcriptHref: string | null;
    settingsHref: string | null;
  };
  createdAt: string;
  updatedAt: string;
};
```

frontend 只能渲染此 projection，不根据 child task 自行拼状态。

## 5. Error schema

```ts
type MediaWorkflowErrorCode =
  | "INVALID_ROUTE_INPUT"
  | "INVALID_SHARE_INPUT"
  | "DOUYIN_RESOLVE_TIMEOUT"
  | "DOUYIN_LOGIN_REQUIRED"
  | "DOUYIN_CAPTCHA_REQUIRED"
  | "DOUYIN_PRIVATE_OR_DELETED"
  | "DOUYIN_RESPONSE_INVALID"
  | "CANONICAL_WORKFLOW_NOT_FOUND"
  | "WORKFLOW_CONFLICT"
  | "WORKFLOW_DISPATCH_PENDING"
  | "WORKFLOW_LINK_PENDING"
  | "ITEM_PERSIST_FAILED"
  | "ASR_NOT_CONFIGURED"
  | "ASR_AUDIO_UNAVAILABLE"
  | "ASR_DOWNLOAD_FAILED"
  | "ASR_PROVIDER_FAILED"
  | "REFERENCE_ASSET_NOT_FOUND"
  | "REFERENCE_ASSET_AMBIGUOUS"
  | "REFERENCE_CAPABILITY_UNVERIFIED"
  | "REFERENCE_CAPABILITY_UNSUPPORTED"
  | "REFERENCE_BYTES_INVALID"
  | "CAPABILITY_EVIDENCE_INVALID"
  | "FEE_CONFIRMATION_REQUIRED"
  | "FEE_TOKEN_INVALID"
  | "VISION_NOT_CONFIGURED"
  | "OWNERSHIP_DENIED";

type MediaWorkflowError = {
  code: MediaWorkflowErrorCode;
  message: string;
  requestId: string;
  traceId: string;
  details: {
    workflowId?: string;
    nextAction?: string;
    retryable?: boolean;
    currentRevision?: number;
    currentWorkflow?: MediaWorkflowProjectionV1;
  };
};
```

错误响应不得包含完整 URL、分享正文、Cookie、Key、逐字稿或图片字节。

## 6. Operations

### API-MO-001 `copilot.media.route`

**Source**：FR-MO-010、012。

内部纯函数 operation，不持久化：

```ts
request: {
  currentTurnText: string;
}
response: {
  decision:
    | "douyin_share_preview"
    | "douyin_share_import"
    | "douyin_share_transcribe"
    | "cover_generate_with_reference"
    | "asset_visual_inspect"
    | "model_decides"
    | "clarify";
  reasonCode: string;
  inputHash: string;
}
```

权限：当前会话。重复调用：同一规范化本条输入返回同一 decision。否定、假设、能力询问不返回副作用
decision。具体示例：

```json
{
  "request": {"currentTurnText": "帮我转写 https://v.douyin.com/example"},
  "response": {
    "decision": "douyin_share_transcribe",
    "reasonCode": "CURRENT_TURN_EXPLICIT_TRANSCRIBE",
    "inputHash": "sha256:..."
  }
}
```

### API-MO-002 `copilot.douyin.shares.preview`

**Source**：FR-MO-005、010。

```ts
request: {
  accountId: string;
  shareInput: string; // 1..2000
}
response: {
  candidate: {
    externalWorkId: string;
    title: string;
    authorDisplayName: string;
    coverUrl: string | null;
    canonicalUrl: string;
  };
  expiresAt: string;
}
```

权限：`ctx.accountId === request.accountId` 且账号归当前 user。只读保证：所有数据库表写入 0。
重复调用可重复外部只读请求，不产生持久副作用。错误：resolve 类错误、`OWNERSHIP_DENIED`。

### API-MO-003 `copilot.douyin.transcriptions.create`

**Source**：FR-MO-005..010。

```ts
request: {
  accountId: string;
  collectionId: string | null;
  shareInput: string;
  authorization: "current_turn_explicit_transcribe";
}
response: {
  workflow: MediaWorkflowProjectionV1;
  canonicalResult: "winner_created" | "existing_winner";
}
```

权限：联合 user/account；collection 若非空也需同账号归属。客户端/模型不得传 idempotency key。

执行顺序：

1. 验证本条授权枚举与 route decision；
2. 调 `resolveDouyinShareReadOnly`，deadline 30 秒；
3. resolver 成功后生成 candidate `workflowId`；
4. 执行 §7.1 canonical claim transaction；
5. winner 返回 `winner_created`；loser 事务回滚后只读 winner，返回 `existing_winner`；
6. 只有 winner 按 §7.2 ensure existing execution parent task；ensure 成功返回 200，commit 后 ensure 失败返回
   202 + `WORKFLOW_DISPATCH_PENDING` projection，由同一 composition-root one-shot reconcile 修复。

resolve 失败无 workflow response，返回结构化错误。HTTP retry 会重新只读 resolve，但 canonical claim
保证最终同一 winner。

### API-MO-004 `copilot.douyin.transcriptions.get`

**Source**：FR-MO-009。

```ts
request: { workflowId: string }
response: { workflow: MediaWorkflowProjectionV1 }
```

权限：联合 user/account。重复读取无副作用。不存在或越权统一返回 `OWNERSHIP_DENIED`，不泄露存在性。

### API-MO-005 `copilot.douyin.transcriptions.cancel`

**Source**：FR-MO-008、011。

```ts
request: {
  workflowId: string;
  expectedRevision: number;
  reason: "user";
}
response: {
  workflow: MediaWorkflowProjectionV1;
  result:
    | "cancellation_requested_reconciling_item"
    | "cancelled_before_enqueue"
    | "cancelled_before_provider"
    | "cancel_requested_after_provider"
    | "already_terminal";
}
```

service 只执行一次带 `expectedRevision` 的 CAS，不在 server 内补读 revision 后静默重试。若影响 0 行：

- 重读后仍是可取消非终态：HTTP 409 `WORKFLOW_CONFLICT`，details 必须返回脱敏的
  `currentRevision/currentWorkflow`，不得伪造任何 cancelled result；
- 重读后已经 terminal：可诚实返回 `already_terminal` 与当前 projection；
- 重读后 `cancelRequestedAt` 已由同一用户请求写入：返回与当前阶段一致的 cancel result，且首次时间不改写。

item effect 为 `requested`、receipt 尚未确认时，cancel 只写 `cancelRequestedAt`，response 显示
`cancellation_requested_reconciling_item`，workflow 保持非终态；只有 §7.2 reconcile 结清未知 effect 后才能
进入 `cancelled`。已成功 transcript 不删除。

### API-MO-006 `copilot.douyin.transcriptions.retry`

**Source**：FR-MO-007、009。

```ts
request: {
  workflowId: string;
  expectedRevision: number;
}
response: { workflow: MediaWorkflowProjectionV1 }
```

只允许 `blocked` 且 `cancelRequestedAt=null`；根据 checkpoint 回 `persisting_item` 或已提交 intent 的恢复态。
`failed/succeeded/cancelled` 返回 `WORKFLOW_CONFLICT`，不复活终态。

### API-MO-007 `covers.references.resolve`

**Source**：FR-MO-001。

```ts
request: {
  accountId: string;
  strategy:
    | { kind: "asset_id"; assetId: string }
    | { kind: "latest_published_cover" };
}
response: {
  referenceAssetId: string;
  assetName: string;
  thumbnailUrl: string;
  sourcePublicationId: string | null;
}
```

0 条 `REFERENCE_ASSET_NOT_FOUND`；同一发布时间多条且无唯一 tie-break 返回
`REFERENCE_ASSET_AMBIGUOUS`；越权统一拒绝。纯读取。

### API-MO-008 `settings.models.capabilities.get`

**Source**：FR-MO-002。

消费 T-501 `API-MC-010` 的唯一正式 operation；`API-MO-008` 只是 T-510 的消费侧 trace alias，
不得生成第二个 endpoint、resource 或 registry：

```ts
request: { slot: "image.generate"; capability: "referenceImage" }
response: { evidence: ReferenceCapabilityEvidenceV1 }
```

`slot` 是 strict wire 的必填常量，T-510 wrapper 不得猜测或省略。T-501 未交付时返回
`status=unknown`，不是 mock `verified`。
T-501 已在唯一 Defined-In 冻结 `ReferenceCapabilityEvidenceV1`。T-510 不再维护本地副本，并从当前
active `image.generate` 配置计算 fingerprint；configurationId/slot/过期、receipt 不可读或
fingerprint/profile 不匹配一律 fail closed。

### API-MO-009 `covers.generate`

**Source**：FR-MO-001..003。

扩展既有 cover operation，新增：

```ts
request: {
  projectId: string;
  prompt: string;
  referenceAssetId: string;
  capabilityReceiptId: string;
  feeConfirmationToken: string;
}
response: {
  taskId: string;
  referenceEvidence: {
    status:
      | "resolved"
      | "bytes_loaded"
      | "attached_to_provider_request"
      | "provider_accepted";
    providerUsageProof: "unavailable" | "provider_receipt";
  };
}
```

任一参考阶段失败则 task 失败，不移除 `referenceAssetId` 重试纯文生成。
`feeConfirmationToken` 是一次性、绑定 user/account/project/reference/config/fee quote 的授权 nonce；
backend 以 token hash 派生 `cover-reference:{hash}`，重复请求返回同一 task，过期/被不同参数使用返回
`WORKFLOW_CONFLICT`，不得再次扣费。

### API-MO-010 `assets.visual.inspect`

**Source**：FR-MO-004。

```ts
request: { assetId: string }
response: {
  composition: string;
  palette: Array<{ hex?: string; label: string }>;
  typography: Array<{
    role: string;
    style: string;
    confidence: number;
  }>;
  visualElements: string[];
  evidence: { assetId: string; model: string };
}
```

只读 user-scoped bytes；Vision 未配置时明确错误，不从标题生成假结果。

### API-MO-011 `copilot.douyin.transcriptions.events.list`

```ts
request: { workflowId: string; afterSequence?: number; limit?: number }
response: { events: MediaWorkflowEventV1[]; nextAfterSequence: number | null }
```

联合 user/account 归属；越权与不存在统一 `OWNERSHIP_DENIED`。`limit` 为 1..50，按 sequence 升序，
重复读取无副作用。只返回脱敏事件；支持性保留为至少 30 天或每 workflow 最近 50 条，以较大者为准。

### 6.12 Operation completeness matrix（规范性）

| API | 权限 | 成功状态 | 主要错误 / transport | 重复语义 | 示例锚点 |
| --- | --- | --- | --- | --- | --- |
| 001 | current server session | 200 | invalid input 400 | 纯函数同输入同结果 | §6.1 |
| 002 | user+account；server-derived collector session | 200 | invalid 400；login/captcha/private 409；timeout 504；ownership 404 | 可重复只读，DB=0 | §6.2 |
| 003 | user+account+collection | 200/202 | resolve 同 002；dispatch pending 202；ownership 404 | canonical winner 相同 | §13.1/13.2 |
| 004 | user+account | 200 | ownership/not found 404 | 无副作用 | projection schema |
| 005 | user+account+required revision | 200 | conflict 409；ownership 404 | 同一已提交 cancel 返回当前真实结果 | §13.3 |
| 006 | user+account+required revision | 200 | conflict 409；blocked cause 409；ownership 404 | CAS 只恢复一次 | state table |
| 007 | user+account+asset/publication | 200 | not found/ambiguous 409；ownership 404 | 纯读取 | §6.7 |
| 008 | user+active config | 200 | ownership 404；provider evidence invalid 409 | 同 fingerprint 同 evidence | T-501 alias |
| 009 | user+account+project+asset+fee nonce | 200/202 | capability/bytes/fee 409；provider 502 | token hash 派生同一 task/收费 operation | §6.9 |
| 010 | user+account+asset | 200 | Vision unconfigured 409；provider 502；ownership 404 | backend task 幂等 | §6.10 |
| 011 | user+account+workflow | 200 | ownership/not found 404 | 游标读取无副作用 | §6.11 |

所有错误都使用 §5 envelope；400 只表示请求格式，404 隐藏资源存在性，409 表示可见状态/配置冲突，
502 表示已授权 provider 失败，504 只表示只读 resolver deadline。表中未列的异常不得降级成成功 projection。

Representative concrete samples（字段省略只为版面，真实 response 必须符合上文完整 schema）：

| API | Request | Success / error sample |
| --- | --- | --- |
| 001 | `{"currentTurnText":"帮我转写 https://v.douyin.com/x"}` | `{"decision":"douyin_share_transcribe","reasonCode":"CURRENT_TURN_EXPLICIT_TRANSCRIBE","inputHash":"sha256:1"}` |
| 002 | `{"accountId":"a1","shareInput":"https://v.douyin.com/x"}` | `{"candidate":{"externalWorkId":"w1","title":"t","authorDisplayName":"u","coverUrl":null,"canonicalUrl":"https://www.douyin.com/video/w1"},"expiresAt":"2026-07-25T01:00:00Z"}` |
| 003 | `{"accountId":"a1","collectionId":null,"shareInput":"https://v.douyin.com/x","authorization":"current_turn_explicit_transcribe"}` | `{"canonicalResult":"winner_created","workflow":{"id":"wf1","state":"canonical_claimed","revision":1}}` |
| 004 | `{"workflowId":"wf1"}` | `{"workflow":{"id":"wf1","state":"item_persisted","revision":4}}` |
| 005 | `{"workflowId":"wf1","expectedRevision":4,"reason":"user"}` | 409 `{"code":"WORKFLOW_CONFLICT","details":{"workflowId":"wf1","currentRevision":5,"currentWorkflow":{"id":"wf1","state":"item_persisted","revision":5}}}` |
| 006 | `{"workflowId":"wf1","expectedRevision":6}` | `{"workflow":{"id":"wf1","state":"item_reconciling","revision":7}}` |
| 007 | `{"accountId":"a1","strategy":{"kind":"asset_id","assetId":"asset1"}}` | `{"referenceAssetId":"asset1","assetName":"cover","thumbnailUrl":"/assets/asset1/thumb","sourcePublicationId":null}` |
| 008 | `{"capability":"referenceImage"}` | `{"evidence":{"capability":"referenceImage","status":"unknown","configurationId":null,"slot":"image.generate","configFingerprint":"sha256:c1","probeProfileVersion":"1","checkedAt":null,"expiresAt":null,"receiptId":null}}` |
| 009 | `{"projectId":"p1","prompt":"新封面","referenceAssetId":"asset1","capabilityReceiptId":"r1","feeConfirmationToken":"fee1"}` | `{"taskId":"cover-task1","referenceEvidence":{"status":"resolved","providerUsageProof":"unavailable"}}` |
| 010 | `{"assetId":"asset1"}` | `{"composition":"centered","palette":[{"label":"blue"}],"typography":[],"visualElements":[],"evidence":{"assetId":"asset1","model":"vision1"}}` |
| 011 | `{"workflowId":"wf1","afterSequence":4,"limit":20}` | `{"events":[{"id":"e5","workflowId":"wf1","userId":"u1","accountId":"a1","sequence":5,"beforeRevision":4,"afterRevision":5,"type":"cancel_requested","safeDetails":{},"occurredAt":"2026-07-25T00:00:00Z"}],"nextAfterSequence":5}` |

## 7. Internal transaction and concurrency algorithms

### 7.1 Canonical claim

```text
resolved = await resolveDouyinShareReadOnly(...)       // DB writes = 0
candidateWorkflowId = uuid()

try transaction(tx):
  tx.insert(workflow {
    id: candidateWorkflowId,
    state: canonical_claimed,
    externalWorkId: resolved.externalWorkId,
    resolvedSnapshot: sanitized(resolved),
    revision: 1
  })
  inserted = tx.insert(binding {
    canonical tuple,
    workflowId: candidateWorkflowId
  }).onConflictDoNothing().returning()
  if inserted is empty:
    throw CanonicalClaimLost                         // transaction rollback
commit
return candidate workflow                            // winner

catch CanonicalClaimLost:
  existing = read binding JOIN workflow by full ownership tuple
  return existing workflow                           // loser; no writes
```

若 winner transaction 在 commit 前崩溃，两行都不存在，下一请求可成为 winner。commit 后 workflow
即为恢复真值。binding/workflow 不允许各自独立提交。

### 7.2 Winner item persistence

workflow 不取得 lease。canonical commit 后，API 立即调用 existing execution service
`ensureTask` 创建唯一父 runtime task；完整稳定 tuple 为：

```text
kind="copilot_media_workflow"
ownerType="copilot_media_workflow"
ownerId=workflowId
idempotencyKey="media-workflow-run:{workflowId}"
payload={workflowId, opVersion:"douyin-share-transcribe-1"}
priority=20, maxAttempts=3, costEstimate=null
```

若 commit 后、ensure 前崩溃，existing execution composition root 在启动时执行一次
`reconcileCopilotMediaWorkflowRuntimeTasks()`，查询 `runtimeTaskId IS NULL` 的非终态 workflow 并用完整 tuple
ensure/link；create API 的 ensure 失败返回 202 `WORKFLOW_DISPATCH_PENDING`。这是 one-shot repair hook，不是
ticker/launcher：不得新增 interval、workflow lease/attempt 或第二套 claim/recovery。T-517 cutover 时该固定
handler/reconcile hook 注册到唯一 `automation_run` runtime，禁止双跑。

父 runtime task 执行 item effect：

1. workflow CAS 将 `itemEffectState=none → requested`、state=`persisting_item`，稳定键固定为
   `media-workflow:{workflowId}:item`；同事务追加事件；
2. 事务外调用 intelligence `persistResolvedDouyinItem(effectKey, resolvedSnapshot)`。该 port 必须以
   effect key 幂等，并提供 `getPersistedDouyinItemByEffectKey(effectKey)` 查询 receipt；
3. 返回 `itemId` 后 CAS 写 `itemEffectState=confirmed,itemId`。若 kill 发生在 port commit 后、workflow CAS 前，
   重启先查询 receipt：找到则确认同一 `itemId`；未找到才以同 key 重试；查询不可判定时进入非终态
   `item_reconciling`，不得 `failed/cancelled`；
4. cancel 在 requested/unknown 窗口只写 `cancelRequestedAt`。receipt 确认后，若 cancel 已存在则进入
   `cancelled` 且 intent=`cancelled`；否则进入 `item_persisted`；
5. intelligence receipt 必须绑定 user/account/effectKey/itemId，item/source/snapshot 最终均为 1。

取消不能回滚已提交的领域 item；但 terminal 也不能掩盖一个尚未判定是否提交的 item effect。

### 7.3 Cancel vs enqueue intent

`commitTranscriptEnqueueIntent`：

```sql
UPDATE copilot_media_workflows
SET state = 'transcript_intent_committed',
    transcript_intent_state = 'committed',
    revision = revision + 1,
    updated_at = :now
WHERE id = :id
  AND user_id = :userId
  AND account_id = :accountId
  AND revision = :expectedRevision
  AND state = 'item_persisted'
  AND transcript_intent_state = 'none'
  AND cancel_requested_at IS NULL
RETURNING *;
```

`requestCancel` 更新同一行、同一 revision。PostgreSQL/PGlite 对同一行更新给出唯一提交顺序：

| 先提交者 | 后提交者结果 | child task | ASR 网络 |
| --- | --- | --- | --- |
| cancel | intent CAS 0 行 | 0 | 0 |
| intent | cancel 记录在新 revision | 0 或 1；若已物化则取消 | provider-start 前取消则 0 |

### 7.4 Intent materialization under the single durable runtime

workflow 行的 `transcriptIntentState=committed` 是领域 intent；父 existing execution task 是唯一执行者，
不再创建 workflow dispatcher/lease 状态机：

1. 父 task 读到 committed 且未取消后 CAS 为 `linking/transcript_task_linking`；
2. 事务外调用 execution service，完整稳定 tuple 固定为：
   `kind="transcribe", ownerType="item", ownerId=itemId,
   idempotencyKey="media-transcript:{workflowId}:{externalWorkId}",
   payload={itemId,workflowId}, priority=20, maxAttempts=3, costEstimate=null`；
3. 相同完整 tuple 返回同一 child；任何字段不同都必须报 `WORKFLOW_CONFLICT`，不得复用模糊 key；
4. ensure 后 CAS link `transcriptTaskId`、intent=`materialized`、state=`transcript_task_queued`。ensure 后 kill
   时，父 task lease recovery 以同 tuple 查回/link 同一 child；
5. child 可能在 link 前被 claim。child handler 在 `markTranscriptRunning`、下载、ASR 之前调用 §7.5 gate；
   workflow 尚未 link 时返回 retryable `WORKFLOW_LINK_PENDING`，execution task requeue，网络调用=0；
6. cancel 在 intent 后、ensure 前使父 task停止 ensure；ensure 后、link 前则父 task查回同一 child、完成 link
   后 cancel child。无论哪种顺序，provider-start gate 都是最终网络闸门。

该模式避免在 PGlite transaction 内调用绑定根 db 的 execution port。

### 7.5 Provider-start gate

transcript runner 在任何下载/ASR 网络前调用：

```text
beginAsrProviderSideEffect(workflowId, transcriptTaskId, expectedRevision)
```

它只在以下条件 CAS 成功：

- workflow state=`transcript_task_queued`；
- `transcriptTaskId` 匹配；
- `cancelRequestedAt IS NULL`；
- child task 仍为当前可执行者。

成功后 state=`transcribing`。cancel 与此 CAS 的提交顺序决定：

- cancel 先：provider-start 0 行，网络调用 0；
- start 先：cancel 返回 `cancel_requested_after_provider`，触发 best-effort Abort；费用可能已发生。

### 7.6 Child terminal and late receipt

child terminal projection 条件含 `state != cancelled` 与 task ID 匹配。cancelled workflow 收到迟到成功，
只记录脱敏 operational log，不更新 workflow state；已经由 intelligence service 落下的 transcript 不删除。

## 8. State transitions

| From | Operation | Guard | To |
| --- | --- | --- | --- |
| none | canonical winner transaction | binding insert wins | canonical_claimed |
| canonical_claimed | runtime ensure/link | existing execution tuple ensured | runtime_task_pending 或 persisting_item |
| runtime_task_pending | parent execution handler | child/parent execution lease valid | persisting_item |
| persisting_item | item port invoked | receipt unknown | item_reconciling |
| persisting_item/item_reconciling | receipt confirmed | cancel null | item_persisted |
| persisting_item/item_reconciling | cancel CAS | receipt unknown | 同状态 + cancelRequestedAt（非终态） |
| persisting_item/item_reconciling | receipt confirmed | cancel set | cancelled |
| item_persisted | enqueue intent CAS | cancel null | transcript_intent_committed |
| canonical_claimed/runtime_task_pending/item_persisted | cancel CAS | no unknown external effect | cancelled |
| transcript_intent_committed | parent handler link CAS | cancel null | transcript_task_linking |
| transcript_task_linking | child ensured and linked | stable tuple exact | transcript_task_queued |
| transcript_task_linking | child claimed before link | handler gate | 同状态；child retryable，network=0 |
| transcript_task_queued | provider-start CAS | cancel null | transcribing |
| transcript_task_queued | cancel CAS | — | cancelled |
| transcribing | child success | workflow not cancelled | succeeded |
| transcribing | child blocked/retryable | workflow not cancelled | blocked |
| transcribing | child terminal error | workflow not cancelled | failed |
| transcribing | cancel CAS | — | cancelled |
| any non-terminal | retryable port/runtime error | checkpoint/effect key retained | blocked |
| blocked | retry | cancel null + checkpoint valid | `item_reconciling` 或对应 intent 状态 |
| any non-terminal | terminal unrecoverable error | no unknown effect, no retry | failed |

任何 terminal → 非 terminal 均非法；存在 unknown item/child effect 时禁止 terminal。lease 过期处理只由
existing execution runtime（之后为 T-517 唯一 runtime）拥有，workflow recovery 只解释领域 checkpoint。

规范性执行语义：

| 操作族 | 执行 owner | revision/event | lease/attempt | 失败与重复 |
| --- | --- | --- | --- | --- |
| canonical/runtime link | media orchestration API + execution service port | 每次 link CAS `+1` 且同事务 event | 只由 parent execution task 维护；workflow 无字段 | ensure 失败=`WORKFLOW_DISPATCH_PENDING`；one-shot reconcile 用同 tuple |
| item request/reconcile | parent `copilot_media_workflow` handler | request/confirm/cancel 各自 CAS `+1` + event | existing execution task retry/maxAttempts=3 | port 不可判定=`item_reconciling`；receipt query/retry同 effect key |
| intent/child link | 同一 parent handler | intent/link CAS 各 `+1` + event | parent execution lease recovery | ensure 失败保留 committed/linking；早 claim=`WORKFLOW_LINK_PENDING` |
| provider gate/terminal | child `transcribe` handler 调 media service | start/terminal CAS 各 `+1` + event | child execution lease/retry | gate conflict不调用网络；retryable requeue；不可恢复且 effect 已结清才 failed |
| cancel | media orchestration API | required expectedRevision 单 CAS `+1` + event | 不接管 lease/attempt | stale=409/current；item 未决只记 request；重复不改首次时间 |
| retry | media orchestration API 唤醒 existing parent/child | required revision 单 CAS `+1` + event | attempt 仍由 execution task 有界维护 | 仅 blocked；按精确 checkpoint 回 `item_reconciling/committed/linking/queued` |

## 9. Permissions and ownership

- 每个 public operation 从 server session 得到 `userId`，从当前选择与 request 得到 `accountId`；
- resolver 的 collector session 必须由 backend 用该 `accountId` 映射；request/模型/frontend 不得指定或
  复用另一个账号的 `browserSessionRef`；
- `accountId` 必须属于该 user 且 active；
- binding/workflow/item/transcript/task 查询全部带联合归属；
- `collectionId/assetId/projectId/publicationId` 必须逐项联合归属；
- loser 查 winner 也必须使用完整 canonical tuple + 联合归属；
- 所有不存在与越权资源统一返回 `OWNERSHIP_DENIED`，不泄露跨账号存在性。

## 10. Idempotency and repeat behavior

| 动作 | 稳定键/条件 | 重复结果 |
| --- | --- | --- |
| preview/resolve | 无持久键；只读 | 可重复外部读取，DB 写 0 |
| canonical create | canonical unique tuple | 返回同一 winner |
| parent runtime ensure | §7.2 完整 execution tuple | 返回同一 existing execution task |
| item persist | `media-workflow:{workflowId}:item` | 返回同一 item |
| enqueue intent | workflow revision/state CAS | 只提交一次 |
| child materialize | `media-transcript:{workflowId}:{externalWorkId}` | 返回同一 child |
| cancel | required revision + 首次 `cancelRequestedAt` CAS | 冲突返回真实 409/current；effect 未决保持非终态 |
| provider start | workflow state/task/revision CAS | 只有一个执行者 |
| terminal projection | workflow state/task/revision CAS | 迟到/重复回执不改 terminal |

模型、frontend 不得提供上述稳定键。

## 11. Compatibility and migration

- 现有 `intelligence.items.importDouyinShare` 与 `intelligence.transcripts.enqueue` 保持 wire 不变，
  供内容雷达现有手动路径继续使用；
- T-510 新组合 workflow 不先调用旧 `enqueueDouyinShareImport`，因为它违反 resolve-before-write；
- BUILD 必须把底层分享 adapter 拆为：
  - `resolveDouyinShareReadOnly`；
  - `persistResolvedDouyinItem`；
  旧 endpoint 可在其原有 task 中顺序调用这两个 port，行为不破坏；
- additive 新增 `copilot_media_workflows`、`media_operation_bindings`、`media_workflow_events` 三张表，
  并在 intelligence-owned item/import receipt 上增加 nullable unique `operation_effect_key` 查询能力；存量
  item/transcript/execution task 不回填；
- T-523 当前生产路径 `frontend/src/server/persistence-client.ts` 的 `dispatchDouyinShare` 与
  `intelligence.service.ts` 的 `transcribeAfterImport` 是明确 cutover 对象：仅链接改走 API-MO-002 且 DB=0，
  显式保存继续走内容雷达 import，显式转写改走 API-MO-003；Copilot consumer 不再传
  `transcribeAfterImport`。旧 wire 只为非 Copilot 手动入口保留；
- T-508 只有诊断 guard/fixture；在 T-510 切换时删除或改为 API-MO-001 contract test，不能把它写成唯一
  待退役生产实现；
- T-501 production capability operation 未交付时，API-MO-008 返回 `unknown`，封面参考生成关闭；
- migration 失败时新 Copilot 媒体入口关闭，旧内容雷达入口继续可用。

## 12. Observability and support

允许字段：

```text
requestId, traceId, workflowId, accountId, category,
stateBefore, stateAfter, revision, resolverVersion,
canonicalResult, childTaskId, durationMs, errorCode
```

禁止字段：

```text
Cookie, token, Key, shareInput, full URL, transcript text,
image bytes/base64, raw provider body
```

状态事件由 `MediaWorkflowEventV1` 持久化；每次 workflow CAS 与对应事件同事务提交，通过 API-MO-011
按联合归属读回。保留至少 30 天或最近 50 条/每 workflow，以较大者为准。canonical loser 只写进程
结构化日志，不新增 loser 数据库事件。

## 13. Concrete examples

### 13.1 Winner

```json
{
  "request": {
    "accountId": "account-a",
    "collectionId": null,
    "shareInput": "7.34 复制打开抖音 https://v.douyin.com/...",
    "authorization": "current_turn_explicit_transcribe"
  },
  "response": {
    "canonicalResult": "winner_created",
    "workflow": {
      "id": "media-workflow-01",
      "state": "canonical_claimed",
      "revision": 1,
      "externalWorkId": "7420000000000000001",
      "itemId": null,
      "transcriptTaskId": null,
      "cancelRequestedAt": null
    }
  }
}
```

### 13.2 Loser

短链、长链同时 resolve 到同一作品。一个 transaction binding insert 胜出；另一个 transaction
整体回滚并返回：

```json
{
  "canonicalResult": "existing_winner",
  "workflow": {
    "id": "media-workflow-01",
    "state": "item_persisted",
    "revision": 4,
    "externalWorkId": "7420000000000000001",
    "itemId": "intelligence-item-01"
  }
}
```

数据库不得存在第二个 workflow 或 dedupe row。

### 13.3 Cancel wins

```json
{
  "request": {
    "workflowId": "media-workflow-01",
    "expectedRevision": 4,
    "reason": "user"
  },
  "response": {
    "result": "cancelled_before_enqueue",
    "workflow": {
      "state": "cancelled",
      "revision": 5,
      "transcriptTaskId": null
    }
  }
}
```

随后 intent CAS 使用 revision 4 或 `cancelRequestedAt IS NULL` 条件，影响 0 行。

## 14. Test contract

| TEST ID | 验证 |
| --- | --- |
| `TEST-MO-001` | ≥100 条路由正/负/否定/假设/仅链接；误副作用 0 |
| `TEST-MO-002` | resolver 六状态与 30 秒 deadline；失败 DB writes=0 |
| `TEST-MO-003` | 短/长链双并发 canonical barrier；winner 1、loser writes 0 |
| `TEST-MO-004` | winner claim 后各 checkpoint kill/restart；item/task 不重复 |
| `TEST-MO-005` | cancel 先提交 vs enqueue intent 先提交的双 barrier |
| `TEST-MO-006` | cancel vs provider-start 双 barrier；cancel 先时网络=0 |
| `TEST-MO-007` | child ensure 后、link 前 kill；完整 stable tuple 查回同一 child，child=1 |
| `TEST-MO-008` | cancelled terminal 忽略 child 迟到成功/失败，recovery 不复活 |
| `TEST-MO-009` | 参考 asset 0/1/多条/越权与 capability fingerprint/expiry |
| `TEST-MO-010` | reference evidence 四阶段及禁止静默纯文降级 |
| `TEST-MO-011` | 跨 user/account binding/workflow/item/task/transcript 负测 |
| `TEST-MO-012` | 日志脱敏：完整 URL/Cookie/token/正文/图片 base64 0 命中 |
| `TEST-MO-013` | 1280×720 任务卡/候选卡键盘、取消与错误深链 E2E |
| `TEST-MO-014` | T-523 Copilot `transcribeAfterImport` consumer 归零；T-508 fixture 转 contract test；boundary/contract/orphan gate |
| `TEST-MO-015` | `RAT-MO-XP-01..04`：item receipt 未决 cancel、缺父 runtime task、child 缺 link/早 claim；终态不掩盖 effect、task=1、network=0 |
| `TEST-MO-016` | 每次 workflow CAS 同事务事件=1；sequence/revision 单调、API-MO-011 越权/分页/保留/脱敏 |

测试必须在 PGlite 和 PostgreSQL 事务语义上覆盖 `TEST-MO-003/005/006/015`；至少一组真实进程
kill/restart 覆盖 `TEST-MO-004/007/015`。PLAN §6.4 的跨端口 RAT protocol 是可执行 Gate，不是已运行
证据；没有当场证据不得补写 PASS。

## 15. Per-FR data-path feasibility

| FR | 来源类型 | 可验证证据 | 存储 | 读回显路径 | 冷启动/历史窗口 | 判定 |
| --- | --- | --- | --- | --- | --- | --- |
| FR-MO-001 | 系统内生 | asset/publication 现有 service；PLAN §13/14 file:line | 复用 asset/publication | API-MO-007 → 封面卡 | 当前账号现有数据，不回填 | feasible |
| FR-MO-002 | 系统内生 | T-501 FR-MC-07/AC-MC-18 + DEC-BATCH | T-501 capability run | API-MO-008 | 交付后生效；未交付 unknown | HARD：PKG-MO-CAPABILITY；T-501 CONTRACT 通过前核验 |
| FR-MO-003 | 授权第三方 | candidate 是现有 image adapter；四阶段 receipt 尚无生产 contract 证据 | cover task evidence | API-MO-009 → 封面卡 | 新任务起记录 | HARD：PKG-MO-CAPABILITY；BUILD adapter probe 前不可称 feasible |
| FR-MO-004 | 授权第三方 | Vision adapter 可用性/bytes 路径需 BUILD inventory 验证，当前不自证存在 | 不存正文；只存 task/result evidence | API-MO-010 | 按请求 | HARD：PKG-MO-CAPABILITY；BUILD 首片 inventory+probe |
| FR-MO-005 | 授权第三方 | 现有分享 adapter 只证明可解析；只读性尚未实现 | claim 前不存 | API-MO-002/003 | 每次请求只读解析 | HARD：PKG-MO-CANONICAL；BUILD 首片 deadline + DB-write detector |
| FR-MO-006 | 系统内生 | PostgreSQL unique + transaction rollback；§7.1 | binding/workflow | API-MO-003/004 | 新 workflow；旧数据不回填 | HARD：PKG-MO-CANONICAL；BUILD 并发红测 |
| FR-MO-007 | 系统内生 | 现有 item 原语不含 effect receipt query；§7.2 是待实现 contract | intelligence receipt + item/source/snapshot + workflow checkpoint | API-MO-004/011 | 新 workflow | HARD：PKG-MO-WORKFLOW；TEST-MO-015 前不可称 feasible |
| FR-MO-008 | 系统内生 | existing execution stable-tuple/lease 原语 + §7.3/7.4 | workflow intent + existing execution parent/child | API-MO-004/005/011 | 新 workflow；T-517 后迁唯一 runtime | HARD：PKG-MO-WORKFLOW/TASK-BRIDGE；TEST-MO-005..007/015 |
| FR-MO-009 | 系统内生 | projection/event 尚未实现 | workflow/child/item/event | API-MO-004/011 | 新 workflow | HARD：BUILD projection/event test |
| FR-MO-010 | 用户录入 | DEC-021；此前 route RAT 不能视为 replacement 已跑 | 只存 inputHash/reason | API-MO-001 | 当前 turn，不继承历史意图 | HARD：TEST-MO-001 当场运行 |
| FR-MO-011 | 用户录入 | task card cancel interaction + §7.3/7.5 | workflow cancel fields | API-MO-005 | 新 workflow | HARD：PKG-MO-WORKFLOW；BUILD barrier |
| FR-MO-012 | 系统内生 | T-523 当前生产 consumer file:line + T-508 诊断边界 | 无新增存储 | API-MO-001/002/003 + TEST-MO-014 gate | cutover 时一次核验 | HARD：T-523 consumer 归零后才 feasible |

`HARD` 行均有合法来源、具体算法、owner PKG 和核验期限；没有 `cut` 或空行。

## 16. 现网事实 / 仓内已有实现

| 断言 | 类型 | 证据 | 结论 |
| --- | --- | --- | --- |
| 分享 endpoint 当前先创建持久 task | 已存在 | `backend/src/modules/intelligence/intelligence.service.ts:2668-2697` | 新组合 op 不复用此前置顺序 |
| 建档 service 接受已解析 external ID | 已存在 | 同文件 `2705-2825` | 拆出 winner persist port |
| transcript enqueue 当前不是 workflow-row 原子动作 | 已存在 | 同文件 `3568-3635` | 经 workflow intent/outbox 连接 |
| T-523 Copilot 当前 dispatch 真实使用 `transcribeAfterImport` | 已存在 | `frontend/src/server/persistence-client.ts:11069-11099`；`intelligence.service.ts:2888-2926` | 是 T-510 migration/cutover 必检 consumer |
| execution child 支持 CAS claim/recovery | 已存在 | `persistent-task.service.ts:452-500,665-710` | 复用 |
| 启动恢复当前只 drain execution queues | 已存在 | `frontend/src/server/persistence-client.ts:5115-5117,5799-5803,9137-9146` | 只能加 one-shot reconcile hook，不能另建 ticker |
| PGlite 根 db 嵌套事务会死锁 | 已有证据 | `execution.service.ts:217-223`、`ai.service.ts:471-485` | 外部 port 全放事务外 |
| referenceImage 独立能力口径已获用户确认 | 已确认设计 | DEC-BATCH；T-501 FR-MC-07/AC-MC-18 | 依赖，不声称已实现 |
| 目标 workflow/binding 尚不存在 | 无实现 | `rg "copilot_media_workflows|media_operation_bindings" backend contract frontend` 空 | 新建两表 |

## 17. Control-layer registration draft

以下仍是 replacement 评审通过后的**待登记草案**；唯一例外是直接消费已登记
API-MC-010 的共享别名链 `FR-MO-002 → API-MO-008 → TEST-MO-010`，已提前以 `BROKEN`
登记到 canonical 控制层，用来防止 strict request 漂移，不代表 T-510 合同通过。其余未过审
ID 不写入 canonical，避免冒充已确认真相。

### 17.1 `ID_REGISTRY.md` 草案

```id-registry
| ID | Type | Defined In | Source IDs |
| --- | --- | --- | --- |
| FR-MO-001..012 | FR | docs/superpowers/specs/2026-07-25-copilot-media-orchestration-replacement.md | DEC-021 |
| NFR-MO-001..010 | NFR | docs/superpowers/specs/2026-07-25-copilot-media-orchestration-replacement.md | FR-MO-001..012 |
| FLOW-MO-01..04 | FLOW | docs/superpowers/specs/2026-07-25-copilot-media-orchestration-replacement.md | FR-MO-001..012 |
| ENT-MO-01..06 | ENT | docs/superpowers/specs/2026-07-25-copilot-media-orchestration-replacement.md | FR-MO-002..011 |
| IA-MO-01..03 | IA | docs/superpowers/specs/2026-07-25-copilot-media-orchestration-replacement.md | FLOW-MO-01..04 |
| API-MO-001..011 | API | docs/superpowers/specs/2026-07-25-copilot-media-orchestration-replacement.contract.md | FR-MO-001..012 |
| TEST-MO-001..016 | TEST | docs/superpowers/specs/2026-07-25-copilot-media-orchestration-replacement.contract.md | FR-MO-001..012, NFR-MO-001..010 |
```

### 17.2 `TRACEABILITY_MATRIX.md` 草案

```traceability
| Product | Flow | Entity | Page | API | Test | Status |
| --- | --- | --- | --- | --- | --- | --- |
| FR-MO-001, FR-MO-002, FR-MO-003, FR-MO-004 | FLOW-MO-01 | ENT-MO-04, ENT-MO-05 | IA-MO-02, IA-MO-03 | API-MO-007, API-MO-008, API-MO-009, API-MO-010 | TEST-MO-009, TEST-MO-010, TEST-MO-013 | BROKEN |
| FR-MO-005, FR-MO-006, FR-MO-007, FR-MO-008, FR-MO-009, FR-MO-010, FR-MO-011 | FLOW-MO-02, FLOW-MO-03, FLOW-MO-04 | ENT-MO-01, ENT-MO-02, ENT-MO-03, ENT-MO-06 | IA-MO-01 | API-MO-001..006, API-MO-011 | TEST-MO-001..008, TEST-MO-011..013, TEST-MO-015..016 | BROKEN |
| FR-MO-012 | FLOW-MO-03 | ENT-MO-03 | IA-MO-01 | API-MO-001, API-MO-003 | TEST-MO-014 | BROKEN |
| NFR-MO-001..010 | FLOW-MO-01..04 | ENT-MO-01..06 | IA-MO-01..03 | API-MO-001..011 | TEST-MO-002..016 | BROKEN |
```

`BROKEN` 表示契约已设计但未 BUILD，不得改成 `OK`。

### 17.3 `ARTIFACT_MANIFEST.yaml` 草案

```yaml
"T-510-1-plan":
  status: "draft"
  gate: "01-product-gate + independent spec-review"
  gate_status: "not-run"
  confirmation_required: true
  artifacts:
    - existing: "docs/superpowers/specs/2026-07-25-copilot-media-orchestration-replacement.md"
    - existing: "docs/superpowers/specs/2026-07-25-copilot-media-orchestration-replacement.review.md"
  notes: "旧三轮 FAIL 保留；replacement 从 resolve-before-write 与 workflow-row linearization 重建。"

"T-510-2-contract":
  status: "blocked"
  gate: "12-service-contract-gate + 15b-contract-completeness-gate"
  gate_status: "not-run"
  confirmation_required: true
  artifacts:
    - existing: "docs/superpowers/specs/2026-07-25-copilot-media-orchestration-replacement.contract.md"
    - existing: "docs/superpowers/specs/2026-07-25-copilot-media-orchestration-replacement.contract.review.md"
  notes: "上游 replacement PLAN 未通过独立评审；确认②与 BUILD 关闭。"
```

## 18. Gate readiness

- 11 个 operation 均已定义 request/response/error/permission/repeat/example 或明确内部纯函数语义；
- 12 个 FR 数据链路均有来源、证据、存储、读回显、冷启动与判定；
- 旧 blocker 与本轮作者侧 blocker 已转成 §7 可执行算法与 `TEST-MO-003/005..007/015` barrier；
- 未使用未决占位标记或静默 cut；
- 独立 review 仍为 `PENDING`，必须验证：transaction rollback 是否足以保证 loser writes=0、item receipt
  未决是否绝不 terminal、唯一 execution runtime/child early-claim 是否可恢复、API-MO-005 是否诚实冲突、
  T-523 cutover 是否完整、T-501 dependency 是否诚实 fail-closed。作者处置不能替代独立 verdict。
