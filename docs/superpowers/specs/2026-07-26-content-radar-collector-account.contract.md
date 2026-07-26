# CONTRACT：内容雷达采集账号双身份（T-537）

> 阶段：`2-contract`
> 状态：`blocked`（Round 3 文档内部 PASS；`RAT-537-01` PASS 且 PLAN 确认①之前正式 CONTRACT Gate 仍 FAIL，不得确认②、不得开始任何 T-537 BUILD）
> 上游：`2026-07-26-content-radar-collector-account.md`（`FR-537-01` 至 `FR-537-09`）
> 现有基线：`contract/src/resources/intelligence.ts`、`contract/src/operations/intelligence.ts`、`backend/src/modules/intelligence/`
> 范围预算：0 新域、0 新表、5 个变更/新增 operation、0 新 role；未触发 `0/2/6/1` 阈值。此作者线不得修改 `SCOPE_LEDGER.md`。

## 1. 合同目标与不变量

本合同只为 `creator_profile`、`favorites_folder`、`darkhorse_query` 增加一个经过服务端验证的 collector。它不改变 owner：

```text
ownerAccountId     = RequestContext.accountId = intelligence_sources.account_id
collectorAccountId = v2 source config 中经验证的 active/douyin 平台账号

source/run/task/item/observation/snapshot/transform -> owner
douyin authDir 与上游只读请求                       -> collector
```

1. owner 必须来自可信 context；任何请求体中的 `accountId` 只作与 context 相等的断言，不能指定目标工作区。
2. collector 必须同时满足 `userId` 属主、`status=active`、`platform=douyin`；检查在 preview/create、run enqueue、worker claim 三处执行。
3. 仅三种 login-collector config、主页预览与收藏夹列举不再由客户端提交/读取 `browserSessionRef`；三类 source 的共享公开投影把该字段固定为 `null`。`web`/`rss`、分享链接与独立 browser-session API 保持现有 session 合同。服务端可为三类 source 内部保存 `douyin-profile:{collectorAccountId}` opaque 值，真实 authDir 仅由 runtime port 解析。
4. 不允许 fallback 到 owner。任何不可用 collector 必须停止在结构化错误；异常响应不等于合法空结果。
5. collector 在 source 创建后不可改。用户想换号，必须新建 source，并选择归档旧 source；历史 run/item 不被改写。

## 2. v2 resource 与内部存储

### 2.1 客户端可提交的 `IntelligenceSourceConfigV2`

`intelligenceSourceConfig` 以以下三支替换现有含 `browserSessionRef` 的支；`web`、`rss` 不变且不得增加 collector。

```ts
type LoginCollector = { collectorAccountId: string };

type CreatorProfileConfigV2 = LoginCollector & {
  type: "creator_profile";
  configVersion: 2;
  canonicalUrl: string;
  externalAccountId: string;
};

type FavoritesFolderConfigV2 = LoginCollector & {
  type: "favorites_folder";
  configVersion: 2;
  folderId: string;
};

type DarkhorseQueryConfigV2 = LoginCollector & {
  type: "darkhorse_query";
  configVersion: 2;
  keyword: string;
  board: "low_follower_breakout";
};
```

所有三支 `.strict()`；`browserSessionRef`、`authDir`、`ownerAccountId`、任何 token/cookie 均为未知字段，必须在 contract validation 阶段拒绝。`collectorAccountId` 可等于 owner，保持单账号行为。

### 2.2 公开 resource 与内部持久化

`IntelligenceSourceResource` 保留已有 `accountId`，其语义固定为 owner；新增只读字段：

```ts
collector: {
  accountId: string;
  accountHandle: string | null;
  platform: "douyin" | null;
  availability: "active" | "archived" | "missing";
} | null;
```

允许的三种来源此字段必非空；`web`/`rss` 为 `null`。为避免范围外 breaking change，共享 DTO 继续保留现有 `browserSessionRef: string|null`：三类 login-collector source 的公开 mapper 强制输出 `null`，`web`/`rss` 沿用现有值。active collector 的来源卡显示 `用 @观察号采集 → 归当前工作区`；archived/missing 时仍返回 source，分别显示“采集账号已归档/不可用 → 归当前工作区”，审计仍以 `accountId` 为锚，不能用可编辑 handle 做身份判断。

内部表仍复用 `intelligence_sources`，不新建表：

| 字段 | v2 规则 |
| --- | --- |
| `account_id` | owner；由 `ctx.accountId` 写入，永不由 collector 覆盖。 |
| `adapter_config` | 存 v2 config，含 `collectorAccountId`；不存路径/原始凭据。 |
| `browser_session_ref` | 三类 source 仅服务端写入 opaque `douyin-profile:{collectorAccountId}`，其公开字段固定为 null；web/rss 现有语义不变。真实路径从 API/日志/任务 checkpoint 排除。 |
| `external_key` | 见 §5；唯一性包含 owner 和 collector。 |
| `version` | source CAS 版本；collector 不可变，pause/retry/迁移只在规则允许时 bump。 |

`SyncRun`、`ExecutionTask`、`IntelligenceItem`、`ItemSourceObservation` 等现有实体不加 collector ownership 字段：它们继续由 owner 维度隔离。为支持诊断可以在独立审计事件中复制已验证的 collector ID，但不能令其成为写入 context 或凭据载体。

### 2.3 platform-account 安全内部 port

在 `backend/src/modules/platform-account` 的公开 service port 上增加窄投影，不新增公开账号 API，也不让 intelligence import 其 repository：

```ts
type CollectorAccountProjection = {
  accountId: string;
  accountHandle: string;
  platform: string;
  status: "active" | "archived";
};

interface CollectorAccountReadPort {
  listCollectorAccounts(ctx: RequestContext): Promise<CollectorAccountProjection[]>;
  getCollectorAccount(
    ctx: RequestContext,
    accountId: string,
  ): Promise<CollectorAccountProjection | null>;
}
```

实现 owner 是 `platform-account` service：它可在模块内部调用现有 user-scoped repository，但 projection mapper 明确不读取/返回 `secretReference`、`externalAccountId`、follower 或凭据。`listCollectorAccounts` 只返回 active/douyin；`getCollectorAccount` 对当前用户自己的 archived 行仍返回安全投影，foreign/missing 统一为 `null`，避免泄露存在性。intelligence 注入此 port 批量构造 workspace source DTO；lookup 失败不能拖垮工作区，按 `availability=missing, accountHandle=null, platform=null` 回显。

## 3. Operation schema

所有错误复用现有 dispatch envelope：

```ts
type ErrorEnvelope = {
  error: {
    code: "AuthenticationError" | "OwnershipError" | "ValidationError" |
      "ConflictError" | "ExternalDependencyError" | "UnexpectedError" |
      "DOUYIN_FAVORITES_SESSION_EXPIRED" |
      "DOUYIN_FAVORITES_BROWSER_LOCKED" |
      "DOUYIN_FAVORITES_CAPTCHA" |
      "DOUYIN_FAVORITES_NETWORK" |
      "DOUYIN_FAVORITES_UPSTREAM" |
      "DOUYIN_FAVORITES_INVALID_RESPONSE";
    message: string;
    details: {
      reason?: string;
      retryable?: boolean;
      collectorAccountId?: string;
      sourceId?: string;
      runId?: string;
    };
  };
  meta: { requestId: string };
};
```

权限检查顺序统一为：认证 → owner context 相等断言 → user-scoped collector 查询 → active/douyin 资格 → 字段/状态校验 → 上游读取或领域写入。foreign/missing collector 在资格细节前统一 404；错误 details 不能含 ref、authDir、URL 查询签名或凭据。

`AuthenticationError/401` 只表示 CreatorOS 请求身份缺失或失效，不表示抖音登录态失效。主页 preview 没有专用 top-level ErrorCode：登录过期与验证码均复用现有 `ValidationError/400`，UI 分别按 `details.reason=login_required`、`details.reason=captcha_required` 给出恢复动作。收藏夹 list 则精确沿用 T-536 已有的 `DOUYIN_FAVORITES_*` ErrorCode 与 dispatch HTTP 映射。

### `API-537-01`：列出可选采集账号（新增）

`GET /intelligence/collectors?accountId={owner}`，operation id：`intelligence.collectors.list`。

| 项 | 合同 |
| --- | --- |
| 请求 | `accountId` 必须等于 `ctx.accountId`；不接受 userId/platform/status 覆盖参数。 |
| 成功响应 | `200 { collectors: Array<{ accountId, accountHandle, platform:"douyin" }> }`，仅当前 `ctx.userId` 且 active/douyin；按 `accountHandle, accountId` 稳定排序。当前 owner 若满足条件必须出现。 |
| 权限 | 当前已认证用户；查询经 platform-account service port，前端不得用缓存自行授权。 |
| 幂等 | 只读；无写入。 |
| 状态/重复 | 无状态转换；重复调用返回当前安全投影。无 active 候选是 `200 {collectors:[]}`，不伪造默认登录。 |
| 错误 | `401 AuthenticationError`；owner 不匹配 `404 OwnershipError(reason=owner_mismatch,retryable=false)`；意外依赖失败 `500 UnexpectedError(retryable=true)`。 |
| 消费者 | `AddSourceDialog` 仅在三种 type 时请求，结果用于 selector。 |

成功例：

```json
{"data":{"collectors":[{"accountId":"acct-observe","accountHandle":"@观察号","platform":"douyin"}]},"meta":{"requestId":"req-537-01"}}
```

### `API-537-02`：主页预览（变更）

既有 `POST /intelligence/sources/preview-profile`，operation id 保持 `intelligence.sources.previewProfile`。

```ts
// request
{ accountId: string; collectorAccountId: string; url: string }
// response
{ platform: "douyin"; externalAccountId: string; nickname: string;
  avatarUrl: string | null; canonicalUrl: string; visibleWorkCount: number | null }
```

服务端先断言 owner，再验证 collector，然后以 collector 的 opaque session 执行只读 preview。响应不含 session ref。改变 `collectorAccountId` 必须使 UI 丢弃尚未返回的旧请求结果（以 selector generation/request token 比较），同时清掉 profile preview 与自动填入昵称。该 operation 不写 source/run/task，重复调用只重复只读预览。

| HTTP | `error.code` / `details.reason` | 可重试 |
| ---: | --- | --- |
| 401 | `AuthenticationError`（仅 CreatorOS 请求身份失效） | 重新认证 CreatorOS 后 |
| 404 | `OwnershipError / owner_mismatch|collector_not_found` | 否 |
| 400 | `ValidationError / collector_archived|collector_platform_invalid|invalid_profile_url|login_required|captcha_required` | 按 reason 恢复账号、处理验证码或修正输入后 |
| 409 | `ConflictError / browser_profile_locked` | 关闭占用后 |
| 502 | `ExternalDependencyError / no_valid_response|response_shape_changed|network` | 视 reason |
| 500 | `UnexpectedError` | 是；不得转成 0 条 |

成功例：

```json
{"data":{"platform":"douyin","externalAccountId":"sec-target","nickname":"目标博主","avatarUrl":null,"canonicalUrl":"https://www.douyin.com/user/sec-target","visibleWorkCount":12},"meta":{"requestId":"req-537-02"}}
```

### `API-537-03`：收藏夹列举（变更）

既有 `GET /intelligence/sources/favorite-folders`，operation id 保持 `intelligence.sources.listFavoriteFolders`。

```ts
// query
{ accountId: string; collectorAccountId: string }
// response
Array<{ id: string; name: string; itemCount: number | null }>
```

移除 `browserSessionRef` query。服务端只用验证后的 collector 打开 profile。合法空收藏夹仅在上游 list valid 的成功 envelope/诊断证据存在时返回 `200 []`；读取异常不能转成空数组。selector 改变立即清 `folders`、`folderId`、验证成功文案和请求中的 pending generation。重复读取只读且幂等。

| HTTP | `error.code` / `details.reason` | 可重试 |
| ---: | --- | --- |
| 401 | `AuthenticationError`（仅 CreatorOS 请求身份失效） | 重新认证 CreatorOS 后 |
| 401 | `DOUYIN_FAVORITES_SESSION_EXPIRED` | 重连采集账号后 |
| 404 | `OwnershipError / owner_mismatch|collector_not_found` | 否 |
| 400 | `ValidationError / collector_archived|collector_platform_invalid` | 恢复/换号后 |
| 409 | `DOUYIN_FAVORITES_BROWSER_LOCKED` | 关闭占用后 |
| 428 | `DOUYIN_FAVORITES_CAPTCHA` | 人工处理后 |
| 502 | `DOUYIN_FAVORITES_NETWORK` / `DOUYIN_FAVORITES_UPSTREAM` / `DOUYIN_FAVORITES_INVALID_RESPONSE` | 视 code |
| 500 | `UnexpectedError` | 是；不得返回 `[]` |

成功例：

```json
{"data":[{"id":"folder-watch","name":"观察收藏","itemCount":23}],"meta":{"requestId":"req-537-03","page":1,"pageSize":100,"total":1}}
```

### `API-537-04`：创建来源（变更）

既有 `POST /intelligence/sources`，operation id 保持 `intelligence.sources.create`。

```ts
{
  accountId: string,             // 仅 owner context 相等断言
  collectionId: string | null,
  type: "creator_profile" | "favorites_folder" | "darkhorse_query" | "web" | "rss",
  config: IntelligenceSourceConfigV2 | WebOrRssConfig,
  displayName?: string,
  extractionInstruction?: string,
  monitorEnabled: boolean,
  runInitial: boolean,
  idempotencyKey: string
}
```

对登录型 type，service 的顺序固定为：验证 `type===config.type` → owner scope/collection → collector registry eligible → server derive opaque ref → normalize business anchor/externalKey → 在 §5.3 的单一 transaction-bound backend work unit 内 upsert source、membership、task、run。响应仍为 `{ source, run|null, task|null }`，但 `source` 使用 §2.2 新 resource。

重复相同 owner+collector+业务锚时返回同一 source；相同 `idempotencyKey` 的 payload 必须一致，若已有 initial run/task 返回既有资源，不另建。事务提交前失败全部回滚，提交后响应丢失可用同 key 重放。创建只检查账号登记资格：主页/收藏的登录问题通常已在 preview/list 暴露；黑马没有新 probe，真实登录/验证码/响应结构只由 initial run 验证，失败时 source=`paused`、run/task=`blocked`。

| HTTP | `error.code` / `details.reason` | 状态/可重试 |
| ---: | --- | --- |
| 401 | `AuthenticationError` | 0 写入；重新认证后 |
| 404 | `OwnershipError / owner_mismatch|collector_not_found|collection_not_found` | 0 写入；否 |
| 400 | `ValidationError / collector_archived|collector_platform_invalid|type_config_mismatch|browser_session_ref_forbidden` | 0 写入；修正后 |
| 409 | `ConflictError / idempotency_payload_mismatch|collector_immutable|active_run_exists` | 0 新增；按 reason |
| 500 | `UnexpectedError / transaction_rolled_back` | source/membership/task/run 全部 0 增量；同 key 可重试 |

成功例：

```json
{
  "data": {
    "source": {
      "id": "src-537", "userId": "user-1", "accountId": "acct-owner",
      "collectionId": null, "type": "darkhorse_query", "platform": "douyin",
      "displayName": "黑马：AI工具", "canonicalUrl": null,
      "externalKey": "darkhorse:acct-observe:low_follower_breakout:ai工具",
      "browserSessionRef": null, "monitorEnabled": true,
      "syncPolicy": {"mode":"scheduled","interval":"daily"},
      "extractionInstruction": null, "status": "active", "version": 1,
      "lastRunAt": null, "nextRunAt": "2026-07-27T00:00:00.000Z",
      "createdAt": "2026-07-26T00:00:00.000Z", "updatedAt": "2026-07-26T00:00:00.000Z",
      "collector": {"accountId":"acct-observe","accountHandle":"@观察号","platform":"douyin","availability":"active"}
    },
    "run": {
      "id":"run-537","userId":"user-1","accountId":"acct-owner","sourceId":"src-537",
      "executionTaskId":"task-537","trigger":"initial","status":"queued","checkpoint":null,
      "startedAt":null,"finishedAt":null,"scannedCount":0,"newCount":0,"updatedCount":0,
      "skippedCount":0,"failedCount":0,"errorCode":null,"errorSummary":null,
      "nextAction":"none","createdAt":"2026-07-26T00:00:00.000Z"
    },
    "task": {
      "id":"task-537","userId":"user-1","accountId":"acct-owner","kind":"source_sync",
      "ownerType":"source","ownerId":"src-537","status":"queued","priority":10,
      "idempotencyKey":"source-create-537:initial","checkpoint":null,"leaseOwner":null,
      "leaseExpiresAt":null,"heartbeatAt":null,"attempt":0,"maxAttempts":3,
      "errorCode":null,"errorMessage":null,"costEstimate":null,
      "createdAt":"2026-07-26T00:00:00.000Z","updatedAt":"2026-07-26T00:00:00.000Z"
    }
  },
  "meta":{"requestId":"req-537-04"}
}
```

### `API-537-05`：启动或恢复来源同步（语义变更）

既有 `POST /intelligence/sources/:sourceId/runs`，operation id 保持 `intelligence.runs.start`，请求与响应 schema 不新增 selector：

```ts
{ trigger: "manual" | "initial" | "retry"; idempotencyKey: string }
```

source 是唯一 collector 真相，调用者不能覆盖它。`manual/initial/schedule` 在 enqueue 前校验 collector；`retry` 是用户处理登录/验证码/锁后对同一固定 collector 的显式重验：合格时以 CAS `paused→active` 并建立**新** run/task，不合格时保持 paused/blocked。schedule 只读取 `source.monitorEnabled` 与 source v2 config，绝不出现全局 selector 或 owner fallback。

合法转移：`active + no active run → queued/running`；`paused + retry + registry eligible → active + new queued run/task`；任一 blocked/failed 旧 run/task 保持终态。非法转移：archived source、非 retry 启动 paused source、已有 queued/running run、请求试图覆盖 collector。

| HTTP | `error.code` / `details.reason` | 状态/可重试 |
| ---: | --- | --- |
| 401 | `AuthenticationError` | 无转换 |
| 404 | `OwnershipError / source_not_found|collector_not_found` | source 不泄露；无 adapter |
| 400 | `ValidationError / collector_archived|collector_platform_invalid|invalid_trigger` | source pause；无 adapter |
| 409 | `ConflictError / source_archived|source_paused_requires_retry|active_run_exists|idempotency_payload_mismatch` | 按 reason |
| 500 | `UnexpectedError / transaction_rolled_back` | 新 run/task 均不产生；同 key 可重试 |

同一个 `sourceId+idempotencyKey+trigger` 重放返回同一 run/task；另一个 key 在 active run 存在时返回 409。成功例：

```json
{
  "data": {
    "run": {
      "id":"run-retry-537","userId":"user-1","accountId":"acct-owner","sourceId":"src-537",
      "executionTaskId":"task-retry-537","trigger":"retry","status":"queued","checkpoint":null,
      "startedAt":null,"finishedAt":null,"scannedCount":0,"newCount":0,"updatedCount":0,
      "skippedCount":0,"failedCount":0,"errorCode":null,"errorSummary":null,
      "nextAction":"none","createdAt":"2026-07-26T01:00:00.000Z"
    },
    "task": {
      "id":"task-retry-537","userId":"user-1","accountId":"acct-owner","kind":"source_sync",
      "ownerType":"source","ownerId":"src-537","status":"queued","priority":20,
      "idempotencyKey":"retry-537","checkpoint":null,"leaseOwner":null,
      "leaseExpiresAt":null,"heartbeatAt":null,"attempt":0,"maxAttempts":3,
      "errorCode":null,"errorMessage":null,"costEstimate":null,
      "createdAt":"2026-07-26T01:00:00.000Z","updatedAt":"2026-07-26T01:00:00.000Z"
    }
  },
  "meta":{"requestId":"req-537-05"}
}
```

## 4. 资格、错误与状态机

### 4.1 `assertCollectorEligible(ctx, collectorAccountId)` 服务端边界

实现归 `backend/src/modules/intelligence`，只依赖 §2.3 注入的 `CollectorAccountReadPort`，不直接 import platform-account repository。该函数不虚构 account revision：

```ts
type EligibleCollector = {
  accountId: string;
  accountHandle: string;
  platform: "douyin";
};
```

foreign/missing 投影为 `OwnershipError(reason=collector_not_found)`；archived/non-douyin 为 `ValidationError`。它只证明账号注册资格，不读取登录页；登录过期、验证码、档案锁和上游结构由对应 preview/list 或真实 run 检出。

| 检查失败 | HTTP/结构化错误 | create/preview/list 行为 | run 行为 |
| --- | --- | --- | --- |
| collector 不属于 ctx.user | `404 OwnershipError`（不泄露存在性） | 拒绝，0 source/run/task/读取 | source CAS pause；run/task `blocked/PERMISSION_DENIED`，0 adapter 调用 |
| collector 已归档或删除 | `400 ValidationError(reason=collector_archived)` / `404 OwnershipError(reason=collector_not_found)` | 拒绝，0 写入/读取 | source pause；run/task `blocked/COLLECTOR_UNAVAILABLE`，0 adapter；恢复同账号后 retry 或新建 |
| collector 非 douyin | `400 ValidationError(reason=collector_platform_invalid)` | 拒绝，0 写入/读取 | source pause，run/task `blocked/IDENTITY_INVALID` |
| 抖音登录过期 | 主页 preview：`400 ValidationError(reason=login_required)`；收藏夹 list：`401 DOUYIN_FAVORITES_SESSION_EXPIRED` | profile/favorites 预览拒绝；**create 只查 registry，不承诺探测登录** | initial/manual/schedule run 将 source pause，run/task `blocked/LOGIN_REQUIRED`，提示重连 collector |
| 验证码 | 主页 preview：`400 ValidationError(reason=captcha_required)`；收藏夹 list：`428 DOUYIN_FAVORITES_CAPTCHA` | profile/favorites 预览拒绝；**darkhorse create 可成功，initial run 检出** | source pause，run/task `blocked/CAPTCHA`，不自动重试 |
| 浏览器档案锁 | 主页 preview：`409 ConflictError(reason=browser_profile_locked)`；收藏夹 list：`409 DOUYIN_FAVORITES_BROWSER_LOCKED` | profile/favorites 预览拒绝；darkhorse create 后由 initial run 检出 | source pause，run/task `blocked/BROWSER_PROFILE_LOCKED`，提示关闭占用后 retry |
| 上游结构/网络失败 | 主页 preview：`502 ExternalDependencyError`，reason 为 `no_valid_response`、`response_shape_changed` 或 `network`；收藏夹 list：`502 DOUYIN_FAVORITES_NETWORK`、`502 DOUYIN_FAVORITES_UPSTREAM` 或 `502 DOUYIN_FAVORITES_INVALID_RESPONSE` | 不可把错误改为 `[]`/成功 0 | 既有 failed/blocked 规则；计数不得伪造 |

`adapterErrorCode` 增加 `BROWSER_PROFILE_LOCKED` 与 `COLLECTOR_UNAVAILABLE`；request 层继续用现有 `ErrorCode` class + `details.reason`，不另造不受 dispatch mapper 识别的 top-level code。错误 envelope 结构以 §3 为准；消息可显示安全 handle，但不得含 session ref、路径或凭据。

### 4.2 状态、archive/claim 线性化与补偿

| 时点 | 规则 |
| --- | --- |
| 创建/预览 | 资格失败在任何上游读取与领域写入之前返回。 |
| manual/initial/schedule enqueue | 重新查询 user-scoped active/douyin 资格；失败不创建 task/run，并以 source `version` 条件更新为 paused。这里不依赖不存在的 account version。 |
| worker claim | task claim 成功后、adapter 前再调用一次 `assertCollectorEligible`。这次数据库资格读取是 archive/claim 的线性化点。失败时先在 intelligence 事务中以 `source.version` 和 run=`queued|running` 为条件暂停 source、阻断 run、追加 event，再以现有 task lease 调 `tasks.finish(blocked)`；adapter 调用为 0。 |
| adapter 返回 `LOGIN_REQUIRED`/`CAPTCHA`/锁 | 通过现有 `applyAdapterBatch` 终结真实 run；同步 CAS 暂停 source。不会以 `succeeded_no_change` 代替。 |
| account archive 与 claim 并发 | archive **先提交**：第二次查询不可见 active，adapter=0；第二次查询**先成功**：本次只读 adapter 允许完成，随后提交的 archive 阻断所有后续 enqueue/claim。T-537 不承诺“archive 请求一到达便中止已线性化的在途读取”，也不新增 lease/event bus。 |
| 阻断补偿 | intelligence 事务成功而 `tasks.finish` 短暂失败时，run 的 blocked 终态是恢复真相；lease recovery/重试先查 run，补写 task blocked，不得再次调用 adapter。task 先 blocked 而领域事务失败时同理重放领域阻断。 |
| 恢复 | 用户处理同一 collector 后使用 `retry`；旧 run/task 保持不可变 blocked 终态，新 run/task 用新幂等键。 |

source `version` 只协调 intelligence 自身 pause/retry 竞态；它不被描述成 platform account revision。由于 account 行软归档且没有 revision，本合同明确接受“第二次查询先成功的单次读取可完成”这一最小线性化语义。

### 4.3 内部 execution 与 runtime resolver 合同

`getSourceExecutionInput` 在 owner-scoped `requireSource` 后解析 v2 config并做第二次资格检查，返回：

```ts
type LoginSourceExecutionInput = {
  source: IntelligenceSourceResource; // accountId 仍是 owner
  config: CreatorProfileConfigV2 | FavoritesFolderConfigV2 | DarkhorseQueryConfigV2;
  collector: {
    collectorAccountId: string;
    collectorSessionRef: string; // 必须严格等于 server 由 ID 派生的 opaque ref
  };
  extractionInstruction: string | null;
};

interface CollectorSessionPort {
  resolve(input: {
    collectorAccountId: string;
    collectorSessionRef: string;
  }): LocalDouyinAuthHandle; // runtime-only，不可 JSON 序列化
}
```

`CollectorSessionPort.resolve` 必须同时校验 ref 格式与 accountId 一致，返回只在 frontend runtime/composition root 内存在的 `LocalDouyinAuthHandle`。三个真实 fetch port 改为显式接收 `auth: LocalDouyinAuthHandle`；`ctx.accountId` 只继续承载 owner 写入/审计，严禁参与 `douyinAuthDirFor`。task payload/checkpoint 只保留现有 `sourceId/sourceType/trigger`，claim 后每次从 source 重读 collector。

`web`、`rss`、分享链接、`comments`、`self.metrics`、`self.detail` 不消费此 port，也不改变它们现有 session/ctx 行为。

### 4.4 diagnostics 与日志最小化

三类 adapter 的 `safeDiagnostics` 改为按 adapter 的字段 allowlist，而非只检查 key 名。允许的值仅为计数、布尔、固定枚举和经过长度限制的 response-shape/error-name；拒绝任何 key 或 value 命中 `browserSessionRef`、`douyin-profile:`、`.auth`、绝对/相对文件路径、cookie/token/signature/authorization。

| 消费者 | 允许 | 禁止 |
| --- | --- | --- |
| run event `safeDetails` | count、listValid、responseShape 枚举、errorName 类名、owner/collector ID | ref、authDir、异常原 message、URL 查询、凭据 |
| task `errorCode/errorMessage` | 固定 error code 与面向用户的安全摘要 | 上游原始异常 message、路径、profile 名 |
| 普通日志 | request/source/run/task ID、owner/collector ID、error code | session ref、auth handle、Cookie、签名、完整上游响应 |

三个消费者都必须做 value 级负测；发现禁止值时拒绝持久化并转换为 `UnexpectedError(reason=unsafe_diagnostics)`，不能“清洗后继续成功”。

## 5. externalKey、幂等与迁移

### 5.1 v2 key

在同一 `(user_id, owner account_id, type)` 下，三个业务锚必须纳入 collector：

| type | v2 `external_key` |
| --- | --- |
| `creator_profile` | `profile:{collectorAccountId}:{externalAccountId}` |
| `favorites_folder` | `favorites:{collectorAccountId}:{folderId}` |
| `darkhorse_query` | `darkhorse:{collectorAccountId}:{board}:{normalizedKeyword}` |

复用现有唯一索引 `ux_intelligence_source_identity(user_id, account_id, type, external_key)`（`backend/drizzle/0050_content_intelligence.sql:46-47`），不新增同列索引。create 对该索引使用 `INSERT … ON CONFLICT` 原子 upsert，不能“先查再插”。`idempotencyKey` 继续保护同一用户意图重试；唯一键保护并发和不同请求 key 的同一业务实体。

### 5.2 v1 → v2

v1 是上述三种 config 中只有 `browserSessionRef`、没有 `configVersion/collectorAccountId` 的历史记录。现有唯一索引在迁移全程保持启用，算法不得让 archived duplicate 继续占用同一 key：

1. **双读**：读层对 v1 仅当 session ref 严格等于 `douyin-profile:{source.accountId}` 时解释为 `collector=owner`；不得从路径、昵称、目录数量或空列表猜测。无法证明的 v1 立即暂停并登记 `COLLECTOR_UNRESOLVED`。
2. **专用 inventory**：按 owner/type 计算每行 target v2 key，分组记录目标碰撞、历史 run/item/observation/membership 数和不可解释 ref；不把 T-482 的旧表迁移报告冒充本次 inventory。
3. **逐碰撞组事务**：对组内 source 行加锁。若已有合法 v2 行占用 target key，优先选它为 canonical；否则按最早 `created_at`、再最小 `id` 选 canonical。
4. **先释放 key，再回填 canonical**：先把每个非 canonical duplicate 的 `external_key` 改成确定性且唯一的 `tombstone:source_collector_v2:{duplicateSourceId}`，同时 `status=archived, monitorEnabled=false, nextRunAt=null`；随后才把 canonical 写为 target v2 key、v2 config、server opaque ref并 bump source version。整个顺序在现有唯一索引下可提交，不需要删/重建索引。
5. **关系与审计**：membership 以现有唯一索引幂等复制到 canonical 后删除 duplicate membership；历史 run/item/observation/snapshot 的 owner 与 sourceId 均不改。checkpoint 的 collision audit 记录 `{originalExternalKey,targetExternalKey,canonicalSourceId,duplicateSourceId,tombstoneExternalKey,mergedIntoSourceId}`；`mergedIntoSourceId` 是 JSON audit 字段，不声称数据库已有同名列。
6. **异常与重跑**：事务失败整组回滚；checkpoint 只在组提交后推进，重跑按 sourceId/tombstone 确定性复用。无法安全 canonical 的组保持原 key、source paused，并登记 blocked，不猜 collector。
7. **收口**：`v1RunnableRemaining=0`、所有 collision 组已提交、现有唯一索引仍有效、抽样与 owner/collector 测试通过后，三类 create 写入口才只接受 v2。回滚仅回滚尚未发布的整组事务；已归档合并使用 checkpoint 正向修复，不做破坏性逆迁移。

### 5.3 T-537 专用 migration ledger

`intelligence_migration_ledgers` 与 `API-CR-025..028` 当前只实现 T-482 的 benchmark/trend/favorites 旧表迁移，不是通用引擎。T-537 由 intelligence 模块拥有一个**内部发布迁移** `SourceCollectorV2Migration`：复用 ledger 表的 JSON 槽位，不复用/改变 T-482 的公开 operations。

| ledger 字段 | T-537 专用 shape |
| --- | --- |
| `idempotency_key` | `source_collector_v2:v2:{ownerAccountId}`；现有 `(user,account,idempotency_key)` 唯一约束隔离 T-482。 |
| `inventory_hash` | 该 owner 下三种 source 的 `id/type/externalKey/configVersion/sessionRefHash` 稳定哈希；不存 ref 原值。 |
| `stage` | 复用现有文本列，但仅本迁移解释为 `inventory|migrating|validated|retired|blocked`。 |
| `checkpoint` | `{kind:"source_collector_v2",schemaVersion:1,lastSourceId,collisions:[...],blockedSourceIds:[...]}`。 |
| `counts` | `{v1Total,migratedCanonical,archivedDuplicates,unresolved,remaining}`。 |
| `orphan_report` | 只保存脱敏 sample 与 collision/unresolved 原因；不存凭据。 |
| `write_fence_enabled` | 对 T-537 表示三类旧 config 写入口已 fence；不改变 T-482 旧表 fence。 |

触发顺序：数据库迁移完成 → APP 启动时在 due-source scheduler 与 queue drain 之前运行/续跑该内部迁移 → 成功或明确 blocked 后才放行相关 source。T-537 报告只通过 release gate、支持日志与 source 的 paused 状态可见；现有 `intelligence.migrations.*` 继续只表示 T-482，不扩 operation 数。

### 5.4 source / membership / task / run 原子边界

四类记录都在同一 backend 数据库。为兑现“创建失败不留半成品”，execution 模块增加**内部 service port** `enqueueInTransaction(ctx, tx, input)`：规则、payload 比较与 DTO 映射仍由 `PersistentTaskService` 拥有，intelligence 不 import execution repository。`tx` 是 composition root 提供的同一 backend unit-of-work handle，不跨进程。

- `API-537-04 runInitial=true`：source identity upsert、membership upsert、execution task enqueue、sync run insert 在一个事务提交；`runInitial=false` 只做前两项。
- `API-537-05`：task enqueue 与 run insert在一个事务提交；`retry` 的 `paused→active` 也在同一事务。
- 复用现有 `ux_intelligence_source_identity`、`ux_intelligence_source_collection_membership`、`ux_execution_task_idempotency`、`ux_intelligence_sync_run_task` 四个唯一约束。
- 事务前后均不 dispatch worker；只有 transaction commit 并返回 run/task 后才触发执行。失败全部回滚并返回 `UnexpectedError(reason=transaction_rolled_back,retryable=true)`。
- 响应丢失时，同 `idempotencyKey` 重放由四个唯一约束返回同一 source/membership/task/run；payload 不同则 409，不产生第二套记录。

## 6. 实现落点与数据链路可行性

| FR | 来源类型 | 可验证证据 | 存储 | 读回显 | 冷启动/历史窗口 | 判定 |
| --- | --- | --- | --- | --- | --- |
| `FR-537-01` | 系统内生 | platform-account user-scoped repository 已存在；§2.3 新增由该模块拥有的安全 projection port，`API-537-01` 只消费窄投影 | 无新表，source v2 config | AddSourceDialog selector | 绑定后立即可读；无历史要求 | feasible |
| `FR-537-02` | 系统内生 | 当前 dialog state 与 `listFavoriteFolders` 可见于 `intelligence-workbench.tsx:1823-2193` | 浏览器瞬态 state，不持久化 preview | dialog 重新渲染 | 每次 selector 改变清空 | feasible |
| `FR-537-03` | 系统内生 | 现有 config/operation schema 与 runtime `douyinAuthDirFor` 已定位；§4.3 定义字段级 resolver | `intelligence_sources.adapter_config` + 内部 opaque ref | 三类 source 公开 ref=null；web/rss 不变 | v1 双读→v2 迁移 | feasible |
| `FR-537-04` | 系统内生 | `createSource` owner 绑定与 `source-sync-runner` 的 owner ctx 已存在 | 既有 source/run/task/item/observation 表 | workspace/source/run/item 既有读取 | 历史 owner 不改 | feasible |
| `FR-537-05` | 系统内生 | 现有 source identity 唯一索引与四项幂等约束；§5.2 tombstone collision 算法 | 既有 `external_key` 与现有唯一索引 | create 返回 existing/canonical source | v1 key 按组回填 | feasible |
| `FR-537-06` | 系统内生 | 现有 scheduler/drain + §4.2 第二次资格线性化 + §5.4 transaction-bound task port | source v2 config、既有 task/run | 既有 run history/source health | schedule 按未来 nextRun；存量迁后继承 | feasible |
| `FR-537-07` | 授权第三方 | T-502 当前 `BLOCKED`；真实双账号成功仍待 `RAT-537-01` | 既有 source/run/task/event；无凭据持久化 | run history、来源卡 CTA | 登录态当前有效才可实时；无历史伪造 | HARD：用户恢复第二账号并在 **PLAN 确认①和任何 BUILD 开工前**完成 `RAT-537-01` |
| `FR-537-08` | 系统内生 | source resource/workspace 已是来源卡数据源 | source owner + read-model collector label | `IntelligenceWorkbench` SourceRow | 迁移后 v2 才显示 collector；v1 unresolved 显示待处理 | feasible |
| `FR-537-09` | 系统内生 | 既有 ledger 表真实存在但 T-482 实现专用；§5.3 定义隔离 kind/shape/owner | 既有 source、membership、ledger JSON | release gate、支持日志与 source status；T-482 API 不变 | 全量 v1，按 collision 组 checkpoint | feasible |

`FR-537-07` 的 HARD 不代表可带病进入 BUILD：来源候选是用户已授权、已绑定的抖音浏览器登录态，但 T-502 已证明当前环境尚缺第二份稳定身份。必须先恢复账号并完成 PLAN 的 `RAT-537-01`；RAT 不通过时 CONTRACT 保持 blocked，整个 T-537 BUILD 不开工。RAT 通过后，完整 E2E 仍是 BUILD 验收，二者不能互相替代。

## 7. 测试与负测合同

| 测试 ID | 层 | 断言 |
| --- | --- | --- |
| `TEST-537-01` | contract | 三种 v2 config 接受 `collectorAccountId` 且严格拒绝 `browserSessionRef`；三类 source 公开 ref=null；web/rss 的既有 session 字段与 previewWeb 合同不变。 |
| `TEST-537-02` | platform-account/intelligence | 安全 projection port 只返回 id/handle/platform/status，永不触达/返回 `secretReference`；foreign/missing/archived 映射符合 §2.3。 |
| `TEST-537-03` | service | foreign、archived、non-douyin collector 在 preview/create 前拒绝，读取/写入次数均 0；server 只派生 opaque ref。 |
| `TEST-537-04` | UI | selector 默认 owner；改变 selector 清 profile/folder/validation/pending old result；只显示三种 type。 |
| `TEST-537-05` | service/db | 三种 key 的 owner+collector 并发 create 复用现有 identity index；不同 collector 不碰撞；不能 PATCH 换 collector。 |
| `TEST-537-06` | transaction | source/membership/task/run 在 transaction-bound service port 中全有或全无；提交后响应丢失同 key 重放返回同一四元组，payload 变化 409。 |
| `TEST-537-07` | runner/runtime | owner ctx 写入；execution input 含 collector ID+opaque ref；resolver 返回 auth handle；三个 fetch port 使用 handle 且从不以 `ctx.accountId` 求 authDir。 |
| `TEST-537-08` | concurrency | archive 先提交时第二次资格检查失败、adapter=0；资格检查先成功时本次允许完成、后续 claim=0；无 account version 断言。 |
| `TEST-537-09` | error/UI | CreatorOS 身份失效才返回 `401 AuthenticationError`；主页 preview 登录过期为 `400 ValidationError(reason=login_required)`、验证码为 `400 ValidationError(reason=captcha_required)`，档案锁为 `409 ConflictError(reason=browser_profile_locked)`；收藏夹严格断言 T-536 的 session `401`、lock `409`、captcha `428`、三类 upstream `502` canonical code。run 侧 LOGIN_REQUIRED、CAPTCHA、BROWSER_PROFILE_LOCKED、COLLECTOR_UNAVAILABLE 均有结构化 source/run/task 终态和具体 collector 提示；darkhorse create 后由 initial run 阻断；绝不成功 0。 |
| `TEST-537-10` | migration | v1 exact owner ref 回填；异常 ref 不猜且 paused；duplicate 先 tombstone/归档再回填 canonical，现有唯一索引全程启用；checkpoint 重跑幂等。 |
| `TEST-537-11` | migration | ledger 的 `kind=source_collector_v2`、schemaVersion、idempotency key、counts 与 T-482 行隔离；现有 migration APIs 语义不变。 |
| `TEST-537-12` | privacy | run event、task error、普通日志对 key/value 同时做 allowlist 负测，ref/authDir/path/凭据/原始异常 message 均无法落盘。 |
| `TEST-537-13` | E2E | `RAT-537-01` 已在开工前 PASS 后，用两个真实不同 active 身份覆盖三类来源、手动/首次/schedule、过期、验证码、锁、切换和重启，不串号。 |

## 8. Gate 记录与待裁决

```text
Gate: scope-budget
Status: pass（本作者计数未触发）
Evidence: 本文元数据计数；复用 intelligence/platform-account/source-sync 既有域
Findings: 不能以“顺手支持”扩展到 self.metrics、comments 或其他任务
Decision: 保持三种来源边界

Gate: service-contract / contract-completeness
Status: blocked，待 RAT、PLAN 确认①与独立复审
Evidence: API-537-01..05、逐操作示例/错误/状态、专用迁移、逐 FR 可行性与 TEST-537-01..13
Findings: RAT-537-01 尚未通过；不能签发确认②
Decision: RAT PASS → PLAN 确认① → CONTRACT 复审/确认②；之后才能开始 T-537 BUILD，完整 E2E 仍在 BUILD 验收
```

需要主代理/用户处理的前置事项：

1. 恢复第二个 active 抖音登录态并按 PLAN `RAT-537-01` 重跑；若仍不能取得两个不同稳定身份及可证明成功 envelope，整个 T-537 BUILD 不得开工。
2. 当前隔离 worktree 没有 T-537 治理登记；按本作者线白名单不修改 BACKLOG/manifest/ID/矩阵，须由主代理合入前补齐，本文不再把不存在的锚当证据。
