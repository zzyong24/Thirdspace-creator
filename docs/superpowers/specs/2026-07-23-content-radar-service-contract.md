# 内容雷达服务契约

> Task: `T-482`
> 日期：2026-07-23
> 上游：[内容雷达产品规格](2026-07-23-content-radar-restructure-design.md)
> 本文是 Contract 真值；不是独立任务拆解或分期计划。

## Artifact metadata

- Stage: `2-contract`
- Status: `confirmed`
- Upstream IDs: `FR-CR-001..021`、`FLOW-CR-001..009`、`ENT-CR-001..012`
- Decision IDs: `DEC-CR-001..015`
- Review: 上游 PLAN 与 `DEC-CR-010` delta review 已 PASS
- Manifest status: Contract Gate 已 PASS；用户已于 2026-07-23 确认 scope envelope 并授权进入 Build

## 1. 契约名称、消费者与提供者

契约名：`CreatorOS Content Intelligence Contract`

| 角色 | 责任 |
| --- | --- |
| `contract/` | `intelligence.*`、`execution.tasks.*` 的 Zod request/response/error schema 与 operation registry 单一真值 |
| `frontend/` | 内容雷达、选题、Project 脚本页只通过 typed client 调用；不得直接读库、读 Cookie 或执行采集 |
| `backend/src/modules/intelligence` | 分类、来源、内容、指标、来源观察、快照、转化、迁移的唯一领域写者 |
| `backend/src/modules/execution` | 通用持久任务、claim/lease/heartbeat/checkpoint/retry/cancel 的唯一状态机写者 |
| `backend/src/modules/scheduling` | 计划定义与到期触发；只创建 execution task，不直接采集或写情报表 |
| `backend/src/modules/projects` / `artifacts` | 用户创建 Project、采纳正式稿件版本；通过 intelligence service port 写/读来源引用 |
| `backend/src/modules/candidate` | 用户确认后创建选题；不得由 adapter 或 AI 直接写最终选题 |
| worker / `ai-runtime` | 实现抖音主页、热点宝、收藏、网页、RSS、ASR、Project 稿件候选执行器；通过 backend service port 写入 |
| browser session manager | 抖音域管理 canonical appData 下按账号隔离的可撤销 profile；通用网页域复用 AES-256-GCM 加密 storageState 的既有服务。情报/任务域只持有 `browserSessionRef` |

物理边界：

1. 新模块位于 `backend/src/modules/intelligence`，不得放入 `frontend/`。
2. worker 不直连数据库；所有 claim、checkpoint、情报写入、稿件采纳经 backend service port。
3. AI 只写 `candidate`/`preview`，用户确认后才由 backend service 写 topic 或 artifact version。
4. `contract` 不依赖上层包；operation 必须进入统一 registry。

## 2. 决策

### `DEC-CR-011` 契约优先

命中 `PAT-004` 的 `CF-001/002/003/004`：内容雷达跨 frontend/backend/worker，具有多个消费者，需要端到端类型安全和可追溯测试。因此所有跨边界操作先定义 Zod operation，再接实现；模块内私有纯函数可直接实现。

### `DEC-CR-012` 真实数据库与统一持久任务租约

命中 `PAT-002` 的 `RF-001/002/004`：来源、内容、观察、快照和任务均是用户数据，要求跨重启留存、唯一约束、事务与迁移。因此生产使用现有真实数据库与 Drizzle 迁移，测试用同迁移的 pglite。

`MOD-006` 文件队列不采用：本任务要求计划运行、优先级、暂停/继续、重试预算、claim/lease/heartbeat、跨三类任务统一控制，明确命中其 `when_not_to_use`。复用现有 `execution/scheduling/ai_tasks` 骨架，在 `execution` 模块增加 DB-backed `execution_tasks`，不提前引入 Redis/BullMQ。

### `DEC-CR-013` 适配器候选与领域判定分离

主页、热点宝、收藏、网页、RSS adapter 只返回统一信封和外部候选；`intelligence` service 负责幂等、合并、归因、快照和运行聚合。热点宝只提供 `low_follower_breakout` 候选，本地 `detectDarkhorse` 负责 48 小时三档命中。

### `DEC-CR-014` 外部视频转选题的证据门

来自他人的外部视频必须保留可点击 canonical URL；只有标题/摘要不得进入选题生成。`previewTopic` 只能消费用户手动取得且状态为 `done` 的明确逐字稿版本，先产结构拆解，再产选题候选。transform 固定 `sourceSnapshotId + transcriptVersionId + transcriptHash + positioningVersionId`；Project 创建后只通过该 transform 派生来源引用，避免客户端拼出不一致证据。逐字稿版本是不可变来源证据，不是 Project 稿件。

### `DEC-CR-015` 抖音分享链接单条建档

单条分享链接通过专用 operation 创建持久 `share_import` 任务；任务完成时在一个领域事务内执行“解析真实作品/作者→复用或创建博主节点→关联所选分类→幂等建档”。作者源按稳定 author identity 全账号唯一，分类使用 membership 多对多关系，不因用户选择新分类而搬走已有节点；新作者源默认不监控。item 按真实 `awemeId` 去重，短链、长链和重复口令归一为同一 canonical URL。operation 明确不得 enqueue transcript。

## 3. 公共类型

### 3.1 RequestContext

所有操作必须携带服务端解析后的：

```ts
type RequestContext = {
  requestId: string;
  userId: string;
  accountId: string;
};
```

客户端不得自行决定 `userId`；`accountId` 必须经 `resolveRequestContext` 校验归属。越权统一返回 `ACCOUNT_FORBIDDEN`。

### 3.2 AdapterEnvelope

```ts
type AdapterStatus =
  | "succeeded_with_items"
  | "succeeded_no_change"
  | "partial"
  | "blocked"
  | "failed";

type AdapterErrorCode =
  | "LOGIN_REQUIRED"
  | "CAPTCHA"
  | "PERMISSION_DENIED"
  | "IDENTITY_INVALID"
  | "FOLDER_MISSING"
  | "SIGNATURE_FAILED"
  | "NO_VALID_RESPONSE"
  | "RESPONSE_SHAPE_CHANGED"
  | "UNSAFE_URL"
  | "LOGIN_WALL"
  | "HTTP_ERROR"
  | "EMPTY_BODY"
  | "PARSE_FAILED"
  | "INVALID_FEED"
  | "RESPONSE_TOO_LARGE"
  | "TIMEOUT"
  | "MODEL_NOT_CONFIGURED"
  | "RATE_LIMITED";

type AdapterEnvelope<TItem, TCheckpoint> = {
  adapterStatus: AdapterStatus;
  upstreamEvidence: {
    adapter: "douyin_profile" | "douyin_single_video" | "douhot_darkhorse" | "douyin_favorites" | "web" | "rss";
    responseShape: string;
    capturedAt: string;
    finalUrl?: string;
    listValid: boolean;
    upstreamWindow?: string;
  };
  items: TItem[];
  checkpoint: TCheckpoint | null;
  errorCode: AdapterErrorCode | null;
  safeDiagnostics: Record<string, string | number | boolean | null>;
};
```

`safeDiagnostics` 禁止出现 Cookie、Authorization、短时签名、明文密码、完整逐字稿和完整私密正文。

### 3.3 ExecutionTask

```ts
type ExecutionTaskStatus =
  | "queued"
  | "running"
  | "pause_requested"
  | "paused"
  | "cancel_requested"
  | "cancelled"
  | "succeeded"
  | "failed"
  | "blocked";

type ExecutionTask = {
  id: string;
  userId: string;
  accountId: string;
  kind: "source_sync" | "share_import" | "transcribe" | "topic_preview" | "script_candidate" | "migration";
  ownerType: "source" | "item" | "transform" | "project" | "migration";
  ownerId: string;
  status: ExecutionTaskStatus;
  priority: number;
  idempotencyKey: string;
  checkpoint: unknown | null;
  leaseOwner: string | null;
  leaseExpiresAt: string | null;
  heartbeatAt: string | null;
  attempt: number;
  maxAttempts: number;
  costEstimate: { unit: string; min: number; max: number } | null;
  createdAt: string;
  updatedAt: string;
};
```

合法迁移：

- `queued → running|cancelled`
- `running → pause_requested|cancel_requested|succeeded|failed|blocked`
- `pause_requested → paused|failed`
- `paused → queued|cancelled`
- `cancel_requested → cancelled|failed`
- `failed|blocked → queued` 仅显式重试并生成新 attempt
- 终态不得直接回到 running

claim 必须以事务比较更新实现；lease 过期由 startup recovery 重新入队或按错误类别转 blocked，不能双 worker 同时执行。

### 3.4 领域资源

`IntelligenceCollection`、`IntelligenceSource`、`IntelligenceItem`、`ItemMetricSnapshot`、`ItemTranscript`、`SyncRun`、`SyncRunEvent`、`IntelligenceTransform`、`ItemSourceObservation`、`SourceSnapshot`、`ProjectIntelligenceReference`、`IntelligenceSourceCollectionMembership` 字段遵循上游 `ENT-CR-001..012`，并增加：

- 所有业务表显式带 `userId + accountId`。
- `IntelligenceSource.browserSessionRef: string | null`，不得存 Cookie；`douyin-profile:<accountId>` 指向抖音 appData profile，`web-domain:<domain>` 指向既有加密 browser session。
- `ItemTranscript.executionTaskId: string | null`。
- `ItemTranscript.id + contentHash` 是不可变版本锚；状态到 `done` 后禁止更新 `text/contentHash`，重新转写新增行并填写 `supersedesVersionId`。
- `SyncRun.executionTaskId: string`。
- `IntelligenceTransform.idempotencyKey: string`；`decompositionSnapshot` 至少包含 `hook`、`structureSteps[]`、`coreClaims[]`、`reusablePattern`、`factRisks[]`。
- `ProjectIntelligenceReference` 唯一键：`projectId + transformId`；其 item、snapshot、URL、定位版本和逐字稿版本全部从已确认 transform 派生，不接受客户端分别改写。
- `IntelligenceSourceCollectionMembership` 唯一键：`userId + accountId + sourceId + collectionId`；重复分享导入不得重复关联。

数据库唯一锚：

- collection sibling：`userId + accountId + parentId + normalizedName`
- source：`userId + accountId + type + externalKey/canonicalUrlHash`
- item：`userId + accountId + platform + type + externalId/canonicalUrlHash`
- observation：`userId + accountId + itemId + sourceId + externalRef`
- metric：`itemId + capturedAt + metricSource`
- transform：`userId + accountId + idempotencyKey`
- execution task：`userId + accountId + kind + idempotencyKey`

## 4. 错误信封、权限与重复行为

所有 operation 返回：

```ts
type Result<T> =
  | { ok: true; data: T; requestId: string }
  | {
      ok: false;
      error: {
        code: string;
        message: string;
        retryable: boolean;
        nextAction: "login" | "configure_model" | "retry" | "edit" | "none";
        details?: Record<string, string | number | boolean | null>;
      };
      requestId: string;
    };
```

公共错误：

| code | HTTP/RPC | 含义 |
| --- | --- | --- |
| `AUTH_REQUIRED` | 401 | 无当前用户 |
| `ACCOUNT_FORBIDDEN` | 403 | account 不属于当前 user |
| `NOT_FOUND` | 404 | 资源不存在或不属于当前 account |
| `VALIDATION_FAILED` | 400 | Zod/领域校验失败 |
| `ILLEGAL_TRANSITION` | 409 | 非法状态迁移 |
| `IDEMPOTENCY_CONFLICT` | 409 | 同 key 不同 payload |
| `DEPENDENCY_BLOCKED` | 423 | 登录、验证码、模型或上游受阻 |
| `RATE_LIMITED` | 429 | 达到统一限流 |
| `UPSTREAM_FAILED` | 502 | 上游明确失败 |
| `INTERNAL_ERROR` | 500 | 未分类内部错误；不得暴露 secret |

专属错误同样使用 `Result<T>` 失败分支：

| code | HTTP/RPC | 适用 |
| --- | --- | --- |
| `DUPLICATE_NAME` | 409 | 同级分类重名 |
| `SYSTEM_COLLECTION_IMMUTABLE` | 409 | 修改/删除系统分类 |
| `VERSION_CONFLICT` | 409 | optimistic version 过期 |
| `CONFIRMATION_REQUIRED` | 428 | 永久删除、回滚或清会话缺确认 token |
| `PREVIEW_REQUIRED` | 428 | 未通过身份/网页/收藏预览直接建源 |
| `SOURCE_PAUSED` | 409 | 对暂停/归档源发起 run |
| `RUN_ALREADY_ACTIVE` | 409 | 同源同 trigger 已有活动 run |
| `NO_AUDIO` | 422 | 图集或无音轨，不可转写 |
| `MODEL_NOT_CONFIGURED` | 424 | ASR/文本模型未配置 |
| `POSITIONING_MISSING` | 424 | 当前账号没有可用定位版本 |
| `SNAPSHOT_UNAVAILABLE` | 424 | 来源快照已不可用且无最小证据 |
| `SOURCE_URL_REQUIRED` | 424 | 外部视频缺少可点击 canonical URL，不能转选题 |
| `SHARE_LINK_INVALID` | 422 | 输入不是可解析的抖音作品分享链接 |
| `VIDEO_UNAVAILABLE` | 424 | 分享链接对应作品已失效、不可访问或无法确认真实作品身份 |
| `CANDIDATE_NOT_READY` | 409 | 候选任务未成功 |
| `TOPIC_NOT_CONFIRMED` | 409 | 未确认选题不能挂 Project 引用 |
| `TRANSCRIPT_REQUIRED` | 424 | 尚无状态为 `done` 的用户手动逐字稿版本，不能拆解或转选题 |
| `SIMILARITY_HIGH` | 422 | 高相似候选禁止采纳 |
| `CANDIDATE_STALE` | 409 | Project/reference 已变更，候选过期 |
| `INVENTORY_STALE` | 409 | 迁移 inventory hash 已失效 |
| `NEW_WRITES_NOT_FROZEN` | 409 | 回滚前未冻结新写 |
| `SESSION_LAUNCH_FAILED` | 503 | 受控浏览器会话无法启动 |

权限规则：所有 list/get/mutate 都强制 `userId + accountId`；批量输入先整批校验归属再写，禁止“能写几条写几条”的越权部分成功。删除和迁移操作需要二次确认 token，token 绑定资源、account、影响摘要，10 分钟失效。

幂等规则：创建、确认、入队、采纳、迁移均要求 `idempotencyKey`；同 key 同 payload 返回首次结果，同 key 不同 payload 返回 `IDEMPOTENCY_CONFLICT`。

## 5. Operation registry

下表每项均须进入 `contract/src/operations/intelligence.ts` 或 `execution.ts` 与全局 registry。

| API | operation | request | response | 专属错误 / 状态 | 幂等与来源 |
| --- | --- | --- | --- | --- | --- |
| `API-CR-001` | `intelligence.workspace.get` | `{accountId}` | 分类树、来源健康摘要、待处理数 | 公共错误 | 只读；`FR-CR-001/002/014` |
| `API-CR-002` | `intelligence.collections.create` | `{accountId,parentId?,name,idempotencyKey}` | `IntelligenceCollection` | `DUPLICATE_NAME` 409 | key 幂等；`FR-CR-002` |
| `API-CR-003` | `intelligence.collections.update` | `{id,name?,parentId?,sortOrder?,archived?,expectedVersion}` | collection | `SYSTEM_COLLECTION_IMMUTABLE`、`VERSION_CONFLICT` | optimistic version；`FR-CR-002` |
| `API-CR-004` | `intelligence.collections.delete` | `{id,mode:"unlink"|"permanent",confirmToken?}` | `{unlinked,deleted,preserved}` | `CONFIRMATION_REQUIRED` | permanent 需 token；`FR-CR-002/017` |
| `API-CR-005` | `intelligence.sources.previewProfile` | `{accountId,url}` | 身份、头像、canonical URL、可见作品概况 | adapter errors | 不落源；`FR-CR-003` |
| `API-CR-006` | `intelligence.sources.previewWeb` | `{accountId,url,instruction,browserSessionRef?}` | 类型、标题、样例、登录要求、解析器 | URL/adapter errors | 不落源；`FR-CR-009` |
| `API-CR-007` | `intelligence.sources.listFavoriteFolders` | `{accountId,browserSessionRef}` | 稳定 folder id 列表 | 登录/权限/验证码 | 只读；`FR-CR-008` |
| `API-CR-008` | `intelligence.sources.create` | `{accountId,collectionId,type,config,monitorEnabled,runInitial,idempotencyKey}` | source + optional task/run | `PREVIEW_REQUIRED`、adapter errors | 创建与首次任务同事务；`FR-CR-003/008/009/010/015` |
| `API-CR-009` | `intelligence.sources.list` | `{accountId,collectionId?,type?,status?,cursor?}` | paged sources + health | 公共错误 | 只读 |
| `API-CR-010` | `intelligence.sources.update` | `{id,collectionId?,displayName?,monitorEnabled?,syncPolicy?,instruction?,expectedVersion}` | source | `VERSION_CONFLICT` | 计划更新同事务；`FR-CR-002/015/017` |
| `API-CR-011` | `intelligence.sources.delete` | `{id,mode:"pause"|"archive"|"permanent",confirmToken?}` | 影响计数与 preserved snapshot 数 | `CONFIRMATION_REQUIRED` | `FR-CR-017` |
| `API-CR-012` | `intelligence.runs.start` | `{sourceId,trigger:"manual"|"initial"|"retry",idempotencyKey}` | `SyncRun + ExecutionTask` | `SOURCE_PAUSED`、`RUN_ALREADY_ACTIVE` | 原子创建；`FR-CR-004/014/020` |
| `API-CR-013` | `intelligence.runs.list` | `{sourceId,cursor?,status?}` | runs + step counts | 公共错误 | 只读 |
| `API-CR-014` | `intelligence.runs.get` | `{runId}` | run、events、adapter evidence、next action | 公共错误 | 安全诊断；`FR-CR-014` |
| `API-CR-015` | `intelligence.items.list` | `{accountId,collectionId?,sourceId?,query?,sort,cursor?,transcriptStatus?}` | paged items（外部视频含 `canonicalUrl` 与 `canTransformToTopic`）+ latest metrics + source count | 公共错误 | P95 目标；`FR-CR-005/011/019` |
| `API-CR-016` | `intelligence.items.get` | `{itemId}` | item、latest/series metrics、observations、snapshots、transcript、transforms | 公共错误 | `FR-CR-005/006/011` |
| `API-CR-017` | `intelligence.transcripts.enqueue` | `{itemIds:string[],idempotencyKey}` | tasks、费用预估、skipped | `NO_AUDIO`、`MODEL_NOT_CONFIGURED` | 仅用户手动；`FR-CR-007/020` |
| `API-CR-018` | `execution.tasks.command` | `{taskIds,command:"pause"|"resume"|"cancel"|"retry",idempotencyKey}` | tasks | `ILLEGAL_TRANSITION` | 批量原子归属校验；`FR-CR-020` |
| `API-CR-019` | `execution.tasks.list` | `{accountId,kind?,ownerId?,status?,cursor?}` | tasks + queue position | 公共错误 | 只读 |
| `API-CR-020` | `intelligence.transforms.previewTopic` | `{itemId,sourceSnapshotId,transcriptVersionId,positioningVersionId,idempotencyKey}` | candidate transform/task；成功输出结构拆解、选题候选、`canonicalUrl` 与完整证据锚 | `SOURCE_URL_REQUIRED`、`TRANSCRIPT_REQUIRED`、`POSITIONING_MISSING`、`SNAPSHOT_UNAVAILABLE` | 仅消费 `done` 逐字稿；取消前零 topic 写入；`FR-CR-012` |
| `API-CR-021` | `intelligence.transforms.confirmTopic` | `{transformId,editedCandidate,idempotencyKey}` | topic + provenance（含可点击 `canonicalUrl`、transform/逐字稿证据） | `CANDIDATE_NOT_READY` | backend candidate service 写入；选题读模型持续暴露原视频链接；`FR-CR-012` |
| `API-CR-022` | `projects.intelligence.attach` | `{projectId,topicId,transformId,idempotencyKey}` | reference（服务端派生 item/snapshot/URL/定位/逐字稿版本） | `TOPIC_NOT_CONFIRMED`、`CANDIDATE_STALE` | 创建 Project 后调用；拒绝 topic/transform 不匹配；`FR-CR-013` |
| `API-CR-023` | `projects.scripts.generateCandidate` | `{projectId,referenceIds,strategy,idempotencyKey}` | execution task | `TRANSCRIPT_REQUIRED`、`MODEL_NOT_CONFIGURED` | 只产候选；`FR-CR-013/020` |
| `API-CR-024` | `projects.scripts.acceptCandidate` | `{projectId,candidateTaskId,editedText?,idempotencyKey}` | artifact version + provenance | `SIMILARITY_HIGH`、`CANDIDATE_STALE` | 用户采纳；`FR-CR-013` |
| `API-CR-025` | `intelligence.migrations.inventory` | `{accountId}` | 旧域计数、writers/readers、风险 | 公共错误 | 只读；`FR-CR-016` |
| `API-CR-026` | `intelligence.migrations.start` | `{accountId,inventoryHash,idempotencyKey}` | migration task | `INVENTORY_STALE` | 迁移 ledger 幂等 |
| `API-CR-027` | `intelligence.migrations.report` | `{migrationId}` | 阶段、计数、孤儿、抽样、fence 状态 | 公共错误 | `FR-CR-016` |
| `API-CR-028` | `intelligence.migrations.rollback` | `{migrationId,confirmToken,idempotencyKey}` | 保全报告 + rollback task | `NEW_WRITES_NOT_FROZEN` | 不覆盖新域独有数据 |
| `API-CR-029` | `browserSessions.openLogin` | `{accountId,site,returnTo}` | `{browserSessionRef,status}` | `SESSION_LAUNCH_FAILED` | 外部副作用仅打开登录页 |
| `API-CR-030` | `browserSessions.clear` | `{browserSessionRef,confirmToken}` | `{cleared,blockedSources}` | `CONFIRMATION_REQUIRED` | 清会话后来源 blocked |
| `API-CR-031` | `intelligence.items.importDouyinShare` | `{accountId,collectionId,shareInput,idempotencyKey}` | `{task}`；任务成功结果为 `{item,creatorSource,membership,observation,sourceSnapshot,deduplicated,transcriptStatus}` | `SHARE_LINK_INVALID`、`VIDEO_UNAVAILABLE`、adapter login/captcha errors | `shareInput` 接受单 URL 或含 URL 的抖音分享文本；幂等创建持久 `share_import` task；完成时单事务复用/创建作者与 item；不得创建 transcript task；`FR-CR-021` |

## 6. 适配器写入协议

1. worker 通过 `execution.claimNext(kind)` 取得租约。
2. adapter 使用 `browserSessionRef` 向 session manager 请求运行上下文，不读取原始 Cookie。
3. 每页/批产生 `AdapterEnvelope`，worker 调 `intelligence.applyAdapterBatch(runId,envelope,leaseToken)`。
4. service 在单事务内：
   - 校验 lease、user/account/source；
   - upsert item；
   - append observation/snapshot/metric；
   - 更新 run checkpoint/counts；
   - heartbeat task。
5. adapter terminal 后由 service 依据所有 step 聚合 run 状态；只有全部执行源具备最小成功证据且无新增/更新才允许 `succeeded_no_change`。
6. worker 崩溃时 lease 到期；startup recovery 根据 checkpoint 重排，不重放已提交批次。

热点宝专属：

- adapter 只接受 `low_follower_breakout` 有效信封。
- 每个可写入的外部视频候选必须含经 URL guard 验证、可点击到原作品的 canonical URL；缺失时只写 run event/过滤计数，不创建可转选题 item。
- domain 使用 `detectDarkhorse` 修订版：`fans:null` 排除；`fans:0` 的 ratio 为 null，只走绝对阈值。
- 稳定排序：tier、非空 ratio、like、publish time、item id。
- 未命中候选只写 run event/计数，不创建 item。

分享链接单条建档专属：

- `douyin_single_video` 只能把安全重定向后可证明的 `awemeId + authorExternalId + canonicalUrl` 交给 domain；分享口令里的标题/昵称不作为真实身份。
- `shareInput` 先提取唯一 HTTP(S) URL，只允许抖音受支持域名；每跳重定向继续做域名与 URL guard 校验，禁止借短链跳入本机、私网或非抖音站点。
- `API-CR-031` 只创建持久 `share_import` task；worker 解析成功后，domain 在一个事务内按 author identity 复用或创建 `creator_profile` source、创建该 source 的 import run，并幂等 upsert membership/item/observation/snapshot。新 source 固定 `monitorEnabled=false`，不触发主页同步。
- item 唯一锚和 idempotency key 双重防重；同一 `awemeId` 的不同短链/长链返回 `deduplicated=true` 和既有 item。
- 事务前后不得调用 `intelligence.transcripts.enqueue`，响应 transcript 状态为 item 当前真实状态；首次建档为 `not_requested`，命中既有 item 时不覆盖既有逐字稿状态。

## 7. URL 与浏览器会话策略的运行时消费点

| contract policy | BUILD 消费者 |
| --- | --- |
| `url` 只允许 HTTP(S)、逐跳 DNS/redirect 校验 | `frontend/src/server/ingestion/web-reader.ts` 现有 guard 的后端化版本；迁入 worker/ingestion adapter |
| response size / timeout / redirect limit | web/rss adapter fetch wrapper |
| `browserSessionRef` 归属 | `backend/src/modules/browser-sessions/browser-sessions.service.ts:44-105`；抖音 profile 归属由 ingestion host 的 account-scoped authDir resolver 消费 |
| 通用网页 storageState 仅专用服务加密存取 | `backend/src/modules/browser-sessions/browser-sessions.service.ts:63-105`、`backend/src/schema/browser-sessions.ts:22-29` |
| 情报/任务/日志不记录 Cookie/签名 | intelligence/execution schema 禁止凭据字段 + adapter logger redaction + secret scan test |
| rate limit / concurrency / retry budget | execution task claim policy + 现有 douyinGateway |

具体 file:line 会在 BUILD 收片时回填；在消费点存在前相关 operation 不得标完成。

## 8. 兼容、迁移和删除

迁移状态：`inventory → backed_up → migrated → validated → write_fenced → consumers_switched → observing → retired`。

- 旧表在 `consumers_switched` 前只读兼容；不做永久双写。
- `benchmark teardown`、`favorites promotion`、trend 临时 signal、darkhorse candidate writer 必须列入 write fence。
- 迁移每个源行记录 old key→new id；重复执行返回同一映射。
- 回滚先冻结新写；旧域不能表达的 observation/snapshot/run 导出保全报告，绝不删除。
- 已被 topic/Project 引用的最小 snapshot 不随来源删除。
- 已被 transform/Project 引用的逐字稿版本、内容哈希和 canonical URL 不随重新转写或来源删除而覆盖；新转写只能新增版本。
- 未引用全文到达 retention deadline 后清理，保留 hash、URL、捕获时间和引用摘要。

## 9. 示例

### 9.1 创建热点宝来源

```json
{
  "accountId": "acc_01",
  "collectionId": "col_darkhorse",
  "type": "darkhorse_query",
  "config": {
    "keyword": "AI写作",
    "board": "low_follower_breakout",
    "browserSessionRef": "bs_douhot_acc01"
  },
  "monitorEnabled": true,
  "runInitial": true,
  "idempotencyKey": "source:darkhorse:acc01:AI写作"
}
```

成功返回 source、scheduled definition 和 initial run/task。未登录返回 `DEPENDENCY_BLOCKED` + `nextAction=login`，不得创建一个“健康”的 enabled source。

### 9.2 手动批量转写

```json
{
  "itemIds": ["item_1", "item_2"],
  "idempotencyKey": "transcribe:acc01:item_1,item_2:20260723"
}
```

响应中每条 item 分别为 queued/skipped/blocked；没有来源同步路径会调用该 operation。

### 9.3 选题确认

preview 前置条件是 item 有可点击 canonical URL、可用 source snapshot 与状态为 `done` 的 `transcriptVersionId`。preview 返回结构拆解、transform candidate 与固定证据锚；取消不调用 confirm。confirm 使用同一 `idempotencyKey` 重复提交只返回首次 topic，不创建 Project 或稿件；选题卡通过 provenance 显示原视频链接。

### 9.4 全 operation 最小实例

| API | concrete request → expected result |
| --- | --- |
| `API-CR-001` | `{accountId:"acc_01"}` → “我的收藏/黑马发现”系统根及受阻数 |
| `API-CR-002` | `{parentId:null,name:"AI 工具",idempotencyKey:"col:ai"}` → `col_ai` |
| `API-CR-003` | `{id:"col_ai",sortOrder:2,expectedVersion:1}` → version 2 |
| `API-CR-004` | `{id:"col_ai",mode:"unlink"}` → source 保留、collection 解除 |
| `API-CR-005` | `{url:"https://www.douyin.com/user/..."}` → nickname/avatar/canonicalUrl |
| `API-CR-006` | `{url:"https://example.com/feed.xml",instruction:"关注 AI"}` → `type:"rss"` + 3 条样例 |
| `API-CR-007` | `{browserSessionRef:"douyin-profile:acc_01"}` → stable folder ids |
| `API-CR-008` | 热点宝创建实例见 §9.1 → source + initial run/task |
| `API-CR-009` | `{type:"rss",status:"active"}` → paged RSS sources |
| `API-CR-010` | `{id:"src_1",monitorEnabled:false,expectedVersion:2}` → paused schedule |
| `API-CR-011` | `{id:"src_1",mode:"archive"}` → history preserved |
| `API-CR-012` | `{sourceId:"src_1",trigger:"manual",idempotencyKey:"run:src_1:01"}` → queued run |
| `API-CR-013` | `{sourceId:"src_1",status:"failed"}` → failed runs page |
| `API-CR-014` | `{runId:"run_1"}` → adapter evidence + `LOGIN_REQUIRED` next action |
| `API-CR-015` | `{collectionId:"col_ai",sort:"growth_desc"}` → latest metric summaries |
| `API-CR-016` | `{itemId:"item_1"}` → item + two metric snapshots + transcript status |
| `API-CR-017` | 批量转写实例见 §9.2 → queued/skipped/blocked per item |
| `API-CR-018` | `{taskIds:["task_1"],command:"pause",idempotencyKey:"pause:task_1"}` → `pause_requested` |
| `API-CR-019` | `{kind:"transcribe",status:"queued"}` → tasks + queue positions |
| `API-CR-020` | `{itemId:"item_1",sourceSnapshotId:"snap_1",transcriptVersionId:"txv_1",positioningVersionId:"pos_v2",idempotencyKey:"topic-preview:1"}` → decomposition + candidate task + immutable evidence |
| `API-CR-021` | `{transformId:"tr_1",editedCandidate:{title:"我的 AI 工作流"},idempotencyKey:"topic-confirm:1"}` → one topic + clickable source provenance |
| `API-CR-022` | `{projectId:"prj_1",topicId:"topic_1",transformId:"tr_1",idempotencyKey:"attach:1"}` → one server-derived reference |
| `API-CR-023` | `{projectId:"prj_1",referenceIds:["ref_1"],strategy:"结构借鉴",idempotencyKey:"script:1"}` → candidate task |
| `API-CR-024` | `{projectId:"prj_1",candidateTaskId:"task_script_1",idempotencyKey:"accept:1"}` → artifact version；高风险时 `SIMILARITY_HIGH` |
| `API-CR-025` | `{accountId:"acc_01"}` → benchmark/favorites/trend baseline counts |
| `API-CR-026` | `{accountId:"acc_01",inventoryHash:"sha256:...",idempotencyKey:"migration:acc_01"}` → migration task |
| `API-CR-027` | `{migrationId:"mig_1"}` → migrated/duplicate/orphan/fence counts |
| `API-CR-028` | `{migrationId:"mig_1",confirmToken:"ct_1",idempotencyKey:"rollback:mig_1"}` → preservation report + task |
| `API-CR-029` | `{accountId:"acc_01",site:"douhot.douyin.com",returnTo:"/radar"}` → opened `browserSessionRef` |
| `API-CR-030` | `{browserSessionRef:"douyin-profile:acc_01",confirmToken:"ct_2"}` → cleared + blocked source ids |
| `API-CR-031` | `{accountId:"acc_01",collectionId:"col_ai",shareInput:"https://v.douyin.com/...",idempotencyKey:"share:acc01:..."}` → queued share_import task；成功结果为 canonical item + reused/created creator + membership；zero transcript tasks |

## 10. 逐 FR 数据链路可行性

| FR | 来源类型 | 可验证证据 | 存储 | 读回显路径 | 冷启动/历史窗口 | 判定 |
| --- | --- | --- | --- | --- | --- | --- |
| `FR-CR-001` | 系统内生 | 侧栏/route 交互定义 | navigation config | 页面导航 | 即时 | feasible |
| `FR-CR-002` | 用户录入 | collection CRUD 交互定义 | collections | `API-CR-001..004` | 创建后即有 | feasible |
| `FR-CR-003` | 授权第三方 | `RAT-CR-001/002`：真实身份与 36 条主页作品 | sources + session ref | `API-CR-005/008/009` | 首次预览 | feasible |
| `FR-CR-004` | 授权第三方 | `RAT-CR-002` + 现有分页 reader | runs/tasks/items | `API-CR-012..016` | 首批 20 条，后续 checkpoint | HARD：现有 reader 改检查点续传；`PKG-CR-INGEST`，Build 结束前验证 |
| `FR-CR-005` | 授权第三方 | RAT 列表/详情字段 | items + latest metric | `API-CR-015/016` | 首次同步起 | feasible |
| `FR-CR-006` | 授权第三方 | 热点宝详情趋势 + 二次同步交互 | metric snapshots | `API-CR-016` | 无历史回填承诺；至少两帧才显示增量 | HARD：指标规模与索引；`PKG-CR-METRICS`，Build 性能 Gate |
| `FR-CR-007` | 用户录入 | 用户单条/批量点击定义 + 现有 transcribe runner | transcript + execution task | `API-CR-017..019` | 仅点击后 | HARD：持久租约接现有 runner；`PKG-CR-TASKS`，Build 重启测试前 |
| `FR-CR-008` | 授权第三方 | `RAT-CR-004/005`：稳定 folder 与 13 条作品 | sources/items/observations | `API-CR-007/008/015` | 授权后首次同步 | feasible |
| `FR-CR-009` | 用户录入/授权第三方 | `RAT-CR-006/007` + 测试预览交互 | sources/items/snapshots/runs | `API-CR-006/008/015/016` | 确认监控起 | HARD：URL 安全/登录 reader 后端化；`PKG-CR-WEB`，Build 安全 Gate 前 |
| `FR-CR-010` | 授权第三方 | `RAT-CR-003`：21 条热点宝结构化候选 | source/run/item/observation | `API-CR-008/012/015/016` | 官方可覆盖最近 48h | HARD：adapter + 修订判定函数；`PKG-CR-INGEST`，首个真实 canary 前 |
| `FR-CR-011` | 系统内生 | item 聚合定义 | item/metrics/transcript/snapshot | `API-CR-016` | 随数据到达 | feasible |
| `FR-CR-012` | 系统内生 | canonical URL + 手动逐字稿版本 + 定位版本 + 候选确认门 | transcript/version + decomposition transform + topic provenance | `API-CR-020/021` | 逐字稿 `done` 后 | HARD：不可变证据锚、结构拆解与跨模块 service port；`PKG-CR-TRANSFORM`，Build slice 内 |
| `FR-CR-013` | 系统内生 | Project/artifact/AI task 已有 | server-derived reference + candidate task + artifact version | `API-CR-022..024` | Project 创建后 | HARD：选题证据透传、相似性与采纳事务；`PKG-CR-TRANSFORM`，Build 安全测试前 |
| `FR-CR-014` | 系统内生 | adapter envelope/run event 定义 | runs/events/tasks | `API-CR-013/014/019` | 每次运行 | feasible |
| `FR-CR-015` | 用户录入/系统内生 | create source 监控开关交互 | source + schedule | `API-CR-008/010` | 创建后 | feasible |
| `FR-CR-016` | 系统内生 | 旧表清单与迁移状态机 | migration ledger + new domain | `API-CR-025..028` | 全量旧数据 | HARD：write fence/回滚；`PKG-CR-MIGRATION`，消费者切换前 |
| `FR-CR-017` | 用户录入 | pause/archive/permanent delete 交互 | source/retention ledger | `API-CR-010/011` | 全生命周期 | feasible |
| `FR-CR-018` | 系统内生 | RequestContext 归属校验模式已存在 | 所有表 user+account | 所有 API | 自创建起；迁移按账号 | HARD：全表 scope/unique/upsert 扫描；`PKG-CR-PROVENANCE`，Build 隔离测试前 |
| `FR-CR-019` | 系统内生 | 多来源 item/observation/snapshot 模型 | item/observation/snapshot | `API-CR-015/016` | 首次发现起 | HARD：跨源合并与冲突队列；`PKG-CR-PROVENANCE`，Build fixture 前 |
| `FR-CR-020` | 系统内生 | execution task 状态机 | execution_tasks | `API-CR-018/019` + owner APIs | 任务创建起 | HARD：DB lease/heartbeat/recovery；`PKG-CR-TASKS`，任何长任务接入前 |
| `FR-CR-021` | 用户录入/授权第三方 | 抖音分享链接 + 所选分类；现有单视频 reader | execution task + source membership + item + observation + snapshot | `API-CR-031` | 用户提交后持久排队，任务完成时单事务 | HARD：短链安全解析、author/item 双锚幂等且零自动转写；`PKG-CR-INGEST`，Build 单条导入测试前 |

没有 FR 判 `cut`，没有无合法来源的 HARD。所有 HARD 都有具体候选解、归属 PKG 和验证时点。

## 11. 现网事实 / 仓内已有实现

| 断言 | 类型 | 证据 | 结论 |
| --- | --- | --- | --- |
| typed contract registry 已存在 | 已存在 | `contract/src/operations/*.ts`、`contract/tests/registry.test.ts` | 新 operation 必须注册 |
| frontend typed dispatch 已存在 | 已存在 | `frontend/src/server/persistence-client.ts` | 复用 transport，不另建 API 栈 |
| 真实 DB/Drizzle/pglite 迁移测试已存在 | 已存在 | `backend/src/schema`、`backend/src/db` | 复用 |
| benchmark 来源/作品表已存在 | 已存在 | `backend/src/schema/benchmark.ts:18-62` | 迁移，不扩成第二真值 |
| 收藏夹/条目表已存在 | 已存在 | `backend/src/schema/favorites.ts:22-57` | 迁移 |
| trend source 只存配置 | 已存在缺口 | `backend/src/schema/trend-sources.ts:19-30` | 新域持久化内容/快照 |
| 主页 reader 可读真实作品 | 已存在 | `frontend/src/server/ingestion/douyin-cdp.ts:1176-1264` + `RAT-CR-002` | 搬至 adapter，补 checkpoint/error |
| 旧抖音搜索不可作为黑马上游 | 已证伪 | `RAT-CR-003` legacy evidence | 禁用生产调用 |
| 热点宝 adapter 尚不存在 | 无实现 | `rg \"douhot|video_billboard|low_follower_breakout\" frontend backend contract` 仅规格/RAT 无生产实现 | 新建 adapter |
| RSS parser 已存在 | 已存在 | `frontend/src/server/persistence-client.ts:8166-8187` | 搬迁并接持久化 |
| 网页 Readability/session pool 已存在 | 已存在 | `frontend/src/server/ingestion/web-reader.ts:485-590` | 复用，保留 final URL/title |
| 通用网页登录态已有加密单一真值 | 已存在 | `backend/src/modules/browser-sessions/browser-sessions.service.ts:63-105`; `backend/src/schema/browser-sessions.ts:22-29` | 复用专用加密服务；不再另造 profile 真值 |
| 抖音登录态按账号保存在 appData profile，不进入 browser_sessions 表 | 已存在 | `backend/src/schema/browser-sessions.ts:3-20`; `frontend/src/server/ingestion/douyin-cdp.ts:696-900` | 热点宝与主页/收藏复用抖音 profile |
| 三档 `detectDarkhorse` 已存在 | 已存在 | `backend/src/modules/benchmark/benchmark.darkhorse.ts:73-115` | 修 nullable/zero/sort 后复用 |
| 通用可恢复 DB lease 队列不存在 | 无实现 | `rg \"leaseExpiresAt|claimNext.*execution|heartbeatAt\" backend/src/modules/execution backend/src/modules/scheduling` 无统一命中 | 在 execution 模块新建 |
| AI candidate/用户采纳边界已存在 | 已存在 | `orchestrator/SYSTEM_ARCHITECTURE.md` + candidate/artifacts services | 复用 |
| `MOD-006` 文件队列不满足本任务 | 已验证资产但不适用 | asset `when_not_to_use`：需要 retries/priorities/scheduled jobs 时不用 | 不采用 |

## 12. Contract Gate 自检

- Happy path：31 个 operation 均有 request/response。
- Error：公共错误 + 每个 operation 专属错误已列出。
- Permission：统一 `RequestContext` 与整批归属校验。
- State：source、task、run、transform、migration 状态迁移明确。
- Idempotency：所有创建/入队/确认/采纳/迁移 operation 有 key。
- FR coverage：`FR-CR-001..021` 无空行、无 cut。
- Policy consumption：列出 URL、session、secret、rate limit 的 BUILD 消费者；未实现前不得关任务。
- 原 Contract Gate 覆盖 `DEC-CR-011..013` 与 30 个 operation；用户在 BUILD 中追加确认的 `DEC-CR-014/015` 与 `API-CR-031` 作为收紧证据门和单条建档 delta 纳入同一 T-482 验收。
