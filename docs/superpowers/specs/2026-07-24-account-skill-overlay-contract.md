# T-513 SERVICE CONTRACT：账号增量 Skill 覆盖

> 日期：2026-07-24  
> 阶段：CONTRACT  
> 上游：`2026-07-24-account-skill-overlay-replacement.md`、DEC-SKI-002  
> 状态：CONTRACT Gate PASS（独立评审 Round 4：P0=0、P1=0）

## 1. 共享类型

### TYPE-SKO-01 CompletionPolicyV1

```ts
type CompletionPolicyV1 = {
  schemaVersion: 1;
  minSegments: number;          // int, 1..100
  maxSegments: number | null;   // null=无上限；非 null 时 >= minSegments 且 <=100
  requiredSequence: string[];   // 每项 trim 后 1..32 字符，最多 20 项
  repairAttempts: number;       // int, 0..3
};
```

`requiredSequence` 的比较规则固定为：配置项和结果 `role` 均 `trim().toLowerCase()`，只接受
`^[a-z][a-z0-9_-]{0,31}$`；结果先压缩相邻重复 role（例如
`hook,body,body,cta → hook,body,cta`），再与 `requiredSequence` **完整相等**。它不是模糊
subsequence：缺项、插入未声明 role、乱序都失败。`requiredSequence=[]` 时只校验段数。

T-513 同时提供不含业务词汇的通用运行时校验器：

```ts
validateCompletionPolicy(
  policy: CompletionPolicyV1,
  segments: readonly { role?: string | null }[],
): { valid: boolean; errors: CompletionPolicyViolation[] };
```

`minSegments/maxSegments` 校验段数；`requiredSequence` 按声明顺序匹配结构化结果里的 `role`。
该校验器由结构化节点在返回成功前强制消费，违反时抛
`COMPLETION_POLICY_VIOLATION`，绝不把未达策略的对象当成功返回。T-512 只负责为
`script.draft` 提供默认策略、把失败原因送入 repair loop，并闭合候选采纳门；T-513 不硬编码
hook/CTA 等脚本业务词。

每个允许非 null `completionPolicy` 的 official Skill 必须声明 append-only adapter 引用：

```ts
completionPolicyAdapter: {
  id: string;
  version: string;
} | null;
```

adapter 在 schema 校验成功后把该 Skill 的任意 object 确定性转换为
`readonly {role?:string|null}[]`。adapter 只能来自内置/验签 base，账号不可覆盖；没有 adapter
时保存非 null policy 必须返回 `COMPLETION_POLICY_UNSUPPORTED 422`。adapter 版本不得原地改写，
历史 snapshot 按 `id+version` 解析；找不到时 fail-closed。adapter 还必须实现
`supportsSchema(jsonSchema): boolean`；PUT/rollback 对 effective outputSchema 先检查，不能证明
可提取 segments 时同样返回 `COMPLETION_POLICY_UNSUPPORTED 422`，不把错误拖到模型运行后。

### TYPE-SKO-02 OverlayPatch

```ts
type OverlayPatch = {
  system?: string | null; // 仅 Skill method slot；null=回到 official method
  template?: string | null;
  tools?: string[] | null;
  requiredFacets?: string[] | null;
  outputSchema?: Record<string, unknown> | null;
  completionPolicy?: CompletionPolicyV1 | null;
};
```

缺字段表示不改；`null` 表示清除该增量并回到 official base。`tools` 必须是当前 official tools
的子集；`contextRequirements`、CreatorOS platform policy 不可由账号写入。响应中的
`overlayVersion` 由服务端按成功写入后的 `rowRevision` 生成，不接受客户端 patch。

### RES-SKO-01 AccountSkillOverlayView

```ts
type EditableSkillValues = {
  system: string;
  template: string;
  tools: string[];
  requiredFacets: string[];
  outputSchema: Record<string, unknown> | null;
  completionPolicy: CompletionPolicyV1 | null;
};

type AccountSkillOverlayView = {
  skillId: string;
  accountId: string;
  baseVersion: string;
  editableFields: Array<
    | "system"
    | "template"
    | "tools"
    | "requiredFacets"
    | "outputSchema"
    | "completionPolicy"
  >;
  completionPolicySupported: boolean;
  official: EditableSkillValues;
  effective: EditableSkillValues;
  compatibility: "compatible" | "incompatible";
  compatibilityErrors: Array<{
    code:
      | "TOOL_REMOVED"
      | "OUTPUT_SCHEMA_INVALID"
      | "COMPLETION_POLICY_INVALID"
      | "COMPLETION_POLICY_UNSUPPORTED"
      | "REQUIRED_FACET_INVALID"
      | "FIELD_NOT_EDITABLE";
    path: string;
    message: string;
  }>;
  rowRevision: number | null;
  validatedBaseVersion: string | null;
  overlayVersion: string | null;
  overlay: OverlayPatch | null;
  updatedAt: string | null;
};
```

不存在账号覆盖也返回 200，`overlay/rowRevision=null`。兼容性每次针对当前已验签 base 重新计算。

### RES-SKO-02 AccountSkillOverlayVersion

```ts
type AccountSkillOverlayVersion = {
  id: string;
  skillId: string;
  accountId: string;
  rowRevision: number;
  observedBaseVersion: string;
  overlayVersion: string | null;
  overlay: OverlayPatch;
  savedCompatibility: "compatible";
  currentCompatibility: "compatible" | "incompatible";
  currentCompatibilityErrors: AccountSkillOverlayView["compatibilityErrors"];
  updatedBy: string;
  createdAt: string;
};
```

### TYPE-SKO-03 EffectiveSkillSnapshotV1

```ts
type EffectiveSkillSnapshotV1 = {
  snapshotVersion: 1;
  userId: string;
  accountId: string;
  resolvedAt: string;
  platformPolicyVersion: string;
  platformPolicy: string;
  skills: Array<{
    skillId: string;
    baseVersion: string;
    overlayRevision: number | null;
    overlayVersion: string | null;
    effective: {
      methodSystem: string;
      template: string;
      tools: string[];
      requiredFacets: string[];
      contextRequirements: string[];
      outputSchema: Record<string, unknown> | null;
      completionPolicy: CompletionPolicyV1 | null;
      completionPolicyAdapter: {
        id: string;
        version: string;
      } | null;
    };
  }>;
};
```

额外约束：

- `skills` 按 `skillId` 升序、无重复。
- `platformPolicy` 必须由 server official provider 注入，客户端同名字段一律以
  `RESERVED_INPUT_FIELD 400` 拒绝，不能静默忽略。
- 序列化 UTF-8 长度 `<= 262144` bytes。
- `contextRequirements` 只来自 official base。
- `completionPolicyAdapter` 只来自 official base；账号不可覆盖。
- snapshot 只随 task 保存；设置 API 永不返回完整 platform policy/prompt 快照。

### ERR-SKO-01 ErrorEnvelope

沿用 CreatorOS 统一失败 envelope：

```ts
type ErrorEnvelope = {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
};
```

成功响应统一为：

```ts
type SuccessEnvelope<T> = {
  data: T;
  meta: { requestId: string };
};
```

## 2. 设置操作

所有操作都要求已认证 `ctx.userId` 和 active `ctx.accountId`。请求体没有 `accountId`；调用方不能
指定或切换归属。账号缺失返回 `400 ACCOUNT_REQUIRED`，账号不属于用户或已归档按
`404 ACCOUNT_NOT_FOUND`，避免泄露。

### API-SKO-01 `settings.prompts.list`

- **Method/Path**：`GET /settings/prompts`
- **Request**：无 body。
- **Response 200**：`SuccessEnvelope<AccountSkillOverlayView[]>`，由 server
  `OfficialSkillProvider.list()` 列出当前验签成功/LKG 的**全部 official Skill**，按 skillId 升序；
  当前账号没有增量的行返回 `overlay/rowRevision=null`。每行包含当前 `baseVersion`、
  `editableFields`、可展示/编辑的 `official` 与合并后的 `effective`（均不含 platform policy /
  contextRequirements）、以及针对当前 base 的兼容性；前端不得再直接 import 本地 registry 拼
  catalog。
- **Errors**：`ACCOUNT_REQUIRED 400`、`ACCOUNT_NOT_FOUND 404`。
- **Permission**：当前用户当前 active 账号只读。
- **Repeat**：无写入；相同 base/数据下重复结果相同。

示例：

```json
{"data":[{"skillId":"script.draft","accountId":"acct-a","baseVersion":"v5","editableFields":["system","template","tools","requiredFacets","outputSchema","completionPolicy"],"completionPolicySupported":true,"official":{"system":"官方方法","template":"{{positioning}}","tools":[],"requiredFacets":["positioning"],"outputSchema":{"type":"object"},"completionPolicy":null},"effective":{"system":"A 的口播方法","template":"{{positioning}}","tools":[],"requiredFacets":["positioning"],"outputSchema":{"type":"object"},"completionPolicy":null},"compatibility":"compatible","compatibilityErrors":[],"rowRevision":2,"validatedBaseVersion":"v5","overlayVersion":"2","overlay":{"system":"A 的口播方法"},"updatedAt":"2026-07-24T00:00:00.000Z"}],"meta":{"requestId":"req-0"}}
```

### API-SKO-02 `settings.prompts.get`

- **Method/Path**：`GET /settings/prompts/:skillId`
- **Response 200**：`SuccessEnvelope<AccountSkillOverlayView>`；无 overlay 时返回 nullable 空视图。
- **Errors**：`ACCOUNT_REQUIRED 400`、`ACCOUNT_NOT_FOUND 404`、`SKILL_NOT_FOUND 404`。
- **Permission/Repeat**：同 API-SKO-01。

示例：

```json
{"data":{"skillId":"script.draft","accountId":"acct-a","baseVersion":"v5","editableFields":["system","template","tools","requiredFacets","outputSchema","completionPolicy"],"completionPolicySupported":true,"official":{"system":"官方方法","template":"{{positioning}}","tools":[],"requiredFacets":["positioning"],"outputSchema":{"type":"object"},"completionPolicy":null},"effective":{"system":"官方方法","template":"{{positioning}}","tools":[],"requiredFacets":["positioning"],"outputSchema":{"type":"object"},"completionPolicy":null},"compatibility":"compatible","compatibilityErrors":[],"rowRevision":null,"validatedBaseVersion":null,"overlayVersion":null,"overlay":null,"updatedAt":null},"meta":{"requestId":"req-1"}}
```

### API-SKO-03 `settings.prompts.put`

- **Method/Path**：`PUT /settings/prompts/:skillId`
- **Body**：

```ts
{
  expectedRevision: number | null; // 必填；null=create-only
  patch: OverlayPatch;             // 至少出现一个 key
}
```

- **Create**：目标不存在且 `expectedRevision=null`，插入 revision 1。
- **Update**：目标存在且 revision 等于整数 `expectedRevision`，条件 UPDATE 为 revision+1。
- **Atomicity**：当前行和完整增量历史在同一个 DB transaction；任一步失败全部回滚。
- **Patch merge**：先读取同归属当前完整增量；缺字段保持当前值，显式 `null` 删除该字段，
  create-only 时以空增量为起点。合并、针对当前 base 校验、CAS 写当前行、追加“合并后完整增量”
  历史必须在同一事务。
- **requiredFacets compatibility**：official base 必须声明 `availableFacets`（由装配层真实
  可产出的 facet 名生成，包含 required 与合法 optional placeholder）。名字满足
  `^[a-z][A-Za-z0-9_]{0,63}$`、去重；账号 requiredFacets 与 template 的全部
  `{{placeholder}}` 都必须是 `availableFacets` 子集，否则 `REQUIRED_FACET_INVALID`。不能用
  `official.requiredFacets` 代替 allowlist，也不能借此要求不存在的 context reader。
- **editableFields**：非 null patch key 必须在当前 official base 的 editableFields 中，否则
  `SKILL_FIELD_NOT_EDITABLE 422`。显式 null 始终允许用于清掉旧增量。基座升级后若已有 overlay
  包含已禁用字段，GET/list 标 `FIELD_NOT_EDITABLE/incompatible` 并禁止生成，直到用户清除；
  不静默忽略旧值。
- **Response 200**：`SuccessEnvelope<AccountSkillOverlayView>`。
- **Errors**：
  - `SKILL_OVERLAY_REVISION_CONFLICT 409`，details：
    `{latestRevision:number|null, latestUpdatedAt:string|null}`；
  - `SKILL_OVERLAY_INCOMPATIBLE 422`，details：`{compatibilityErrors:[...]}`；
  - `SKILL_TOOL_NOT_ALLOWED 422`，details：`{toolIds:string[]}`；
  - `SKILL_OVERLAY_INVALID 400`，details：Zod path/message；
  - `COMPLETION_POLICY_UNSUPPORTED 422`；
  - `REQUIRED_FACET_INVALID 422`；
  - `SKILL_FIELD_NOT_EDITABLE 422`；
  - `ACCOUNT_REQUIRED 400`、`ACCOUNT_NOT_FOUND 404`、`SKILL_NOT_FOUND 404`。
- **Permission**：当前用户当前 active 账号；AI/worker 无直写入口。
- **Repeat**：同一 `expectedRevision` 成功后重放必然 409，不产生第二条历史；调用方刷新后才能再写。

示例：

```json
{"expectedRevision":null,"patch":{"system":"A 的口播方法","tools":[]}}
```

```json
{"data":{"skillId":"script.draft","accountId":"acct-a","baseVersion":"v5","editableFields":["system","template","tools","requiredFacets","outputSchema","completionPolicy"],"completionPolicySupported":true,"official":{"system":"官方方法","template":"{{positioning}}","tools":[],"requiredFacets":["positioning"],"outputSchema":{"type":"object"},"completionPolicy":null},"effective":{"system":"A 的口播方法","template":"{{positioning}}","tools":[],"requiredFacets":["positioning"],"outputSchema":{"type":"object"},"completionPolicy":null},"compatibility":"compatible","compatibilityErrors":[],"rowRevision":1,"validatedBaseVersion":"v5","overlayVersion":null,"overlay":{"system":"A 的口播方法","tools":[]},"updatedAt":"2026-07-24T00:00:00.000Z"},"meta":{"requestId":"req-2"}}
```

### API-SKO-04 `settings.prompts.versions.list`

- **Method/Path**：`GET /settings/prompts/:skillId/versions`
- **Response 200**：`SuccessEnvelope<AccountSkillOverlayVersion[]>`，当前账号版本倒序数组；
  `savedCompatibility` 是写入时事实，`currentCompatibility*` 每次针对当前 base 重算。
- **Errors**：`ACCOUNT_REQUIRED 400`、`ACCOUNT_NOT_FOUND 404`、`SKILL_NOT_FOUND 404`。
- **Permission**：跨账号 `versionId`/历史不可见。
- **Repeat**：只读。

示例：

```json
{"data":[{"id":"skov-1","skillId":"script.draft","accountId":"acct-a","rowRevision":1,"observedBaseVersion":"v5","overlayVersion":null,"overlay":{"system":"A 的方法"},"savedCompatibility":"compatible","currentCompatibility":"compatible","currentCompatibilityErrors":[],"updatedBy":"user-1","createdAt":"2026-07-24T00:00:00.000Z"}],"meta":{"requestId":"req-3"}}
```

### API-SKO-05 `settings.prompts.rollback`

- **Method/Path**：`POST /settings/prompts/:skillId/rollback`
- **Body**：`{versionId:string, expectedRevision:number}`。
- **Transition**：读取同 user/account/skill 的历史增量，针对当前 official base 重验；成功写成
  `expectedRevision+1` 并追加新历史。历史版本本身不变。
- **Response 200**：`SuccessEnvelope<AccountSkillOverlayView>`。
- **Errors**：`ACCOUNT_REQUIRED 400`、`ACCOUNT_NOT_FOUND 404`、`SKILL_NOT_FOUND 404`、
  `SKILL_VERSION_NOT_FOUND 404`；其余同 PUT。
- **Permission**：跨账号 version 按不存在。
- **Repeat**：旧 expectedRevision 重放返回 409。

示例：

```json
{"versionId":"skov-1","expectedRevision":2}
```

```json
{"data":{"skillId":"script.draft","accountId":"acct-a","baseVersion":"v6","editableFields":["system","template","tools","requiredFacets","outputSchema","completionPolicy"],"completionPolicySupported":true,"official":{"system":"官方 v6","template":"{{positioning}}","tools":[],"requiredFacets":["positioning"],"outputSchema":{"type":"object"},"completionPolicy":null},"effective":{"system":"A 的方法","template":"{{positioning}}","tools":[],"requiredFacets":["positioning"],"outputSchema":{"type":"object"},"completionPolicy":null},"compatibility":"compatible","compatibilityErrors":[],"rowRevision":3,"validatedBaseVersion":"v6","overlayVersion":null,"overlay":{"system":"A 的方法"},"updatedAt":"2026-07-24T00:03:00.000Z"},"meta":{"requestId":"req-4"}}
```

## 3. 内部运行时端口

### PORT-SKO-01 `OfficialSkillProvider`

```ts
interface OfficialSkillProvider {
  get(skillId: string): OfficialSkillBase | null;
  list(): OfficialSkillBase[];
  platformPolicy(): { version: string; text: string };
}
```

`OfficialSkillBase` 除模板/工具/schema 外必须声明：

```ts
{
  baseVersion: string;
  availableFacets: string[]; // 装配层可真实产出的 required + optional facet allowlist
  editableFields: AccountSkillOverlayView["editableFields"];
  completionPolicyAdapter: { id: string; version: string } | null;
}
```

属主 `ai-worker`；只返回内置或验签成功的 remote base。验签失败继续使用 existing
last-known-good/内置 base，不接受账号或 DB 写入。

### PORT-SKO-02 `AccountSkillOverlayReader`

```ts
interface AccountSkillOverlayReader {
  listBySkillIds(
    ctx: RequestContext,
    skillIds: readonly string[],
  ): Promise<AccountSkillOverlayRow[]>;
}
```

属主 backend/settings；查询恒含 userId/accountId/skillId，不返回旧全局表。

### PORT-SKO-03 `resolveEffectiveSkillSnapshot`

```ts
resolveEffectiveSkillSnapshot(
  ctx: RequestContext,
  requiredSkillIds: readonly string[],
): Promise<EffectiveSkillSnapshotV1>;
```

纯合并 + 校验；不写库、不调用模型。错误：

- `SKILL_SNAPSHOT_INCOMPLETE 422`
- `SKILL_OVERLAY_INCOMPATIBLE 422`
- `SKILL_SNAPSHOT_TOO_LARGE 413`
- `SKILL_SNAPSHOT_ACCOUNT_MISMATCH 403`

### PORT-SKO-04 `requiredSkillIdsForTask`

```ts
requiredSkillIdsForTask(
  taskType: string,
  inputData: Readonly<Record<string, unknown>>,
): readonly string[];
```

确定性注册表规则：

| taskType/入口 | required skill |
|---|---|
| 与 registered skillId 同名 | 同名 skillId |
| `review.analyze` | `review.insights` |
| `cover.generate` | `cover.brief` |
| `publish.platform_adapt` | `platform.adapt` |
| `video.decisions` | 由受控 input kind 映射到 `video.*` registered skill；客户端不得直接给任意 skillId |
| Chat 同步请求 | 当前 surface 的 `chatbox.*`；同步 registered 子 Skill 按同一 owner tuple 进入独立嵌套 snapshot；派生异步工具创建自己的 task/snapshot |
| `scheduled.self.detail` | `topic.attribution` |
| `scheduled.benchmark` | `benchmark.teardown` |
| `scheduled.topic.daily` | `topic.generate`、`trend.extract` |
| `scheduled.favorites` | `favorites.triage`、`knowledge.distill` |
| 明确登记的非 Skill task | `[]` |
| 未登记 taskType | `SKILL_TASK_MAPPING_MISSING`，启动/测试 Gate 失败 |

CodeGraph/rg 消费入口矩阵必须与本注册表集合等价；新增 `getTemplate` 消费点但未登记时静态测试失败。

### PORT-SKO-05 `runWithEffectiveSkillSnapshot`

```ts
runWithEffectiveSkillSnapshot<T>(
  snapshot: EffectiveSkillSnapshotV1,
  fn: () => Promise<T>,
): Promise<T>;
```

server-only AsyncLocalStorage 传递。运行态 `getTemplate/getTools/resolveOutputSchema` 只读 active
snapshot；无 active snapshot 抛 `SKILL_SNAPSHOT_MISSING`。管理面改用
`getOfficialTemplate/listOfficialTemplates/exportOfficialSkillSchema`，不进入运行态 API。

`runStructuredNode` 在 schema 校验成功后，从 active snapshot 读取当前 template 对应的
`completionPolicy`，再按 official-only `completionPolicyAdapter.id+version` 把 object 转成
segments，调用 TYPE-SKO-01 的通用校验器；只有通过才返回 object。显式传
`outputSchema` 不能绕过该策略。非结构化节点若其 Skill 声明了非 null completionPolicy，则在
启动前返回 `COMPLETION_POLICY_UNSUPPORTED`，不能静默忽略。

最终工具：

```text
snapshot.tools
∩ policyApprovedCatalog
∩ accountAuthorizedTools
∩ perInvocationConfirmedTools
```

任一交集外 tool 不暴露、不执行。

## 4. AI 任务创建与恢复

### API-SKO-06 `ai.tasks.create` 增量契约

Body 新增：

```ts
{
  taskType: string;
  attemptId: string;        // UUID/稳定 16..128 字符；每次用户动作生成
  retryOfTaskId?: string;
  inputData?: Record<string, unknown>;
}
```

`AITaskResource` 同步新增只读字段：

```ts
{
  attemptId: string;
  requestFingerprint: string; // 仅摘要，不回显敏感 input
  retryOfTaskId: string | null;
}
```

客户端提交的 `inputData.skillSnapshot/platformPolicy` 被拒绝为 `RESERVED_INPUT_FIELD 400`。
backend：

1. 对去掉保留字段后的
   `{userId,accountId,taskType,inputData,retryOfTaskId: retryOfTaskId ?? null}` 做
   canonical JSON + SHA-256，
   得到 `requestFingerprint`。
2. 幂等唯一键固定为 `(userId, accountId, taskType, attemptId)`；查询和唯一约束四列缺一不可。
3. 同键且 fingerprint 相同，任意状态均返回原 task；fingerprint 不同返回
   `ATTEMPT_PAYLOAD_MISMATCH 409`，不得静默返回旧任务。
4. `retryOfTaskId` 必须读取同 user/account/taskType 的终态源任务并持久化到
   `retry_of_task_id`；跨归属/不存在按 `TASK_NOT_FOUND 404`，源任务非终态返回
   `RETRY_SOURCE_NOT_TERMINAL 409`。
5. 解析 requiredSkillIds 和完整 snapshot。
6. `INSERT ... ON CONFLICT DO NOTHING RETURNING`。
7. 败者回读胜者并按 fingerprint 判定返回或 409。

- **Response 200/201**：`SuccessEnvelope<AITaskResource>`；新建 201，幂等命中 200。
- **Errors**：`ACCOUNT_REQUIRED 400`、`ACCOUNT_NOT_FOUND 404`、
  `ATTEMPT_ID_INVALID 400`、`RESERVED_INPUT_FIELD 400`、
  `SKILL_TASK_MAPPING_MISSING 422`、`SKILL_SNAPSHOT_INCOMPLETE 422`、
  `SKILL_OVERLAY_INCOMPATIBLE 422`、`SKILL_SNAPSHOT_TOO_LARGE 413`、
  `ATTEMPT_PAYLOAD_MISMATCH 409`、`TASK_NOT_FOUND 404`、
  `RETRY_SOURCE_NOT_TERMINAL 409`。
- **Permission**：只允许已认证用户在当前 active 账号创建；不能替另一个账号指定 owner。
- **Repeat**：同 attempt+同 fingerprint 返回同一 task/snapshot；不同 fingerprint 明确 409。

请求示例：

```json
{"taskType":"script.draft","attemptId":"018f8d8a-90ab-7def-8123-123456789abc","inputData":{"projectId":"project-1"}}
```

响应示例：

```json
{"data":{"id":"ai-task-1","userId":"user-1","projectId":"project-1","contentOutputId":null,"taskType":"script.draft","status":"queued","inputData":{"projectId":"project-1"},"modelKey":"gpt-5","idempotencyKey":"acct-a:script.draft:018f8d8a-90ab-7def-8123-123456789abc","attemptId":"018f8d8a-90ab-7def-8123-123456789abc","requestFingerprint":"sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef","retryOfTaskId":null,"requestedAt":"2026-07-24T00:05:00.000Z","startedAt":null,"completedAt":null,"errorMessage":null},"meta":{"requestId":"req-5"}}
```

冲突示例：

```json
{"error":{"code":"ATTEMPT_PAYLOAD_MISMATCH","message":"同一次尝试的请求内容已变化，请发起新的 attemptId","details":{"existingTaskId":"ai-task-1"}}}
```

状态命中语义：

| 原状态 | 同 attemptId | 用户显式重试 |
|---|---|---|
| queued/running/awaiting_confirmation | 返回原任务，不重复调用 | 新 attemptId；UI 应先提示已有任务 |
| succeeded | 返回原结果 | 新 attemptId，可关联 retryOf |
| failed/cancelled | 返回原错误 | 新 attemptId，可关联 retryOf |

模型调用前必须写 `model_call_started` step。snapshot 缺失的旧任务：

- queued → `failed/SKILL_SNAPSHOT_MISSING_SAFE_RETRY`；
- running → `failed/SKILL_SNAPSHOT_RECONCILIATION_REQUIRED`，禁止自动重试；
- 已有 result → 保留 result，禁止再次调用，结果不可采纳直到用户人工核对。

snapshot 写在 `ai_tasks.runtime_data.skillSnapshot`（server-only），`AITaskResource.inputData`
只返回原业务输入；任何 list/get/create response 都不得序列化 `runtime_data`、platform policy
或完整 prompt。

### PORT-SKO-06 `claimAiTaskExecution`

```ts
claimAiTaskExecution(
  ctx: RequestContext,
  taskId: string,
  input: { workerId: string; leaseSeconds: number },
): Promise<
  | { task: AITaskResource; leaseToken: string; leaseExpiresAt: string }
  | null
>;
```

- 单条条件 `UPDATE ... WHERE user_id=? AND account_id=? AND id=? AND status='queued'
  RETURNING` 完成领取，同时写 `running/startedAt/leaseOwner/leaseToken/leaseExpiresAt`。
- 两个执行者竞争时只有一个拿到非 null；拿到 null 的执行者必须立即退出，不能调用模型/工具。
- 领取成功后，runner 先以 leaseToken 原子追加唯一 `model_call_started` step，再调用任何
  provider/tool；具体由下述 `beginModelCall` 门控制。终态写入也必须匹配 leaseToken，旧执行者
  不能覆盖新状态。
- lease 过期且没有 `modelCallStartedAt` 时，reconciler 只能用
  `status=running AND lease_token=旧 token AND lease_expires_at<=now AND
  model_call_started_at IS NULL` 的 CAS 退回 queued；一旦已有
  `model_call_started`，只能转 `SKILL_SNAPSHOT_RECONCILIATION_REQUIRED`，禁止自动重跑未知副作用。
- `markRunning` 的“先读 queued 再无条件 update”路径删除；所有 runner 只能走此端口。
- **Errors/permission**：账号缺失 `ACCOUNT_REQUIRED`；跨 user/account/未知 task 一律
  `TASK_NOT_FOUND`；非法 leaseSeconds/workerId 为 `EXECUTION_CLAIM_INVALID`。该端口只暴露给
  server worker，不进入客户端 contract。

### PORT-SKO-07 `beginModelCall`

```ts
beginModelCall(
  ctx: RequestContext,
  taskId: string,
  leaseToken: string,
): Promise<boolean>;
```

同一 DB transaction 内：

1. 条件 UPDATE：
   `status='running' AND lease_token=? AND lease_expires_at>now AND
   model_call_started_at IS NULL`，写 `model_call_started_at=now` 并 `RETURNING`；
2. 仅 UPDATE 胜者追加唯一 `model_call_started` step；
3. 任一步失败整体回滚。

只有返回 `true` 的 runner 才能调用 provider/tool。返回 `false`、token 失效、lease 过期或 marker
唯一冲突都必须立即退出。reconciler 的 requeue CAS 和本事务对同一 task 行竞争，因此不存在
“旧 lease 被回收后旧 runner 又开始模型调用”的窗口。

### PORT-SKO-08 `renewAiTaskExecution`

```ts
renewAiTaskExecution(
  ctx: RequestContext,
  taskId: string,
  leaseToken: string,
  extendSeconds: number,
): Promise<{ leaseExpiresAt: string } | null>;
```

- 仅当 `status=running AND lease_token=? AND lease_expires_at>now` 时条件续租；与 reconciler
  对同一行 CAS。返回 null 表示已失去执行权。
- claim 的 lease 必须覆盖该 runner 单次外部操作硬超时 + 30 秒余量；范围 60..1800 秒。
  runner 至少每 `min(leaseSeconds/3, 30s)` heartbeat，并在每次 provider/tool 调用前续租。
- heartbeat 返回 null 时立即触发该调用的 `AbortController`，禁止开始后续调用或写成功；
  外部 tool 还必须使用 `taskId:stepNo` 幂等键。provider 已接收但无法撤回的单次请求进入
  reconciliation，不会由新 runner 自动重放。
- terminal write 仅匹配当前 `status=running + leaseToken`；若 reconciler 已先接管则返回 false，
  runner 退出，不伪报成功。`model_call_started_at` 存在的任务永不重新 claim，因此即使心跳丢失
  也不会出现第二次模型调用。

## 5. 设置页 binding

| UI 行为 | API | 规则 |
|---|---|---|
| 进入技能页 | API-SKO-01（server official/LKG catalog + 当前账号 delta） | query key 必含 accountId |
| 切号 | cancel 旧请求、清编辑态、重新 list | 延迟返回的旧 accountId 响应必须丢弃 |
| 首次保存 | API-SKO-03 expectedRevision null | 冲突刷新 |
| 再次保存 | API-SKO-03 current revision | 禁止盲覆盖 |
| 恢复默认 | PUT 所有可覆盖字段 null | 保留 revision/history |
| 查看历史/回滚 | API-SKO-04/05 | 只见当前账号 |
| incompatible | GET/list compatibility errors | 禁止生成；提供编辑/恢复默认 |

不存在 legacy 认领、复制到账号、强制覆盖按钮。

## 6. 数据路径可行性

来源类型枚举：`系统内生`、`用户录入`。本任务无第三方动态数据源。

| FR | 来源类型 | 来源/证据 | 写入 | 读取/消费 | verdict |
|---|---|---|---|---|---|
| FR-SKO-01 | 系统内生 | `ai-worker/src/prompt/registry.ts` official registry + signed remote loader | official provider 只读 | resolver/settings official list | feasible |
| FR-SKO-02 | 用户录入 | 设置页当前账号交互 | backend settings service → account overlay tables | ctx 联合过滤 | feasible |
| FR-SKO-03 | 用户录入 | expectedRevision | 条件 INSERT/UPDATE + transaction history；PLAN PGlite RAT | PUT/rollback | feasible |
| FR-SKO-04 | 系统内生 | official base + account delta | 不写全局 Registry | ALS active snapshot | feasible |
| FR-SKO-05 | 系统内生 | requiredSkillIds registry | `ai_tasks.runtime_data.skillSnapshot`（server-only） | runner/recovery | feasible |
| FR-SKO-06 | 系统内生 | snapshot validation | typed failed terminal/step | UI/log | feasible |
| FR-SKO-07 | 用户录入 | global account switcher | 无额外写入 | account-keyed query/editor | feasible |
| FR-SKO-08 | 系统内生 | DEC-SKI-002 | 旧表零写零读 | 反向污染测试 | feasible |
| FR-SKO-09 | 系统内生+用户确认 | official tools + policy/account/invocation grants | 不扩大授权 | Chat tool gate | feasible |

HARD：无。PLAN 两项原 HARD（PGlite CAS、入口盘点）已有 RAT/矩阵证据。

## 7. Contract Gate 自检

- API-SKO-01..06 均定义 happy path、请求/响应、errors、permission、state/repeat semantics 和示例。
- FR-SKO-01..09 均有来源、写入、读取与 testable consumer。
- policy 字段消费点：
  - tools → `backend/src/modules/ai-runtime/chat-tools.ts:3781` `buildChatTools` / chat tool gate；
  - platformPolicy → BUILD 目标
    `backend/src/modules/ai-runtime/effective-skill-snapshot.ts#resolveEffectiveSkillSnapshot` +
    chat/structured runner；
  - requiredFacets → `ai-worker/src/prompt/template.ts:93` `bindPrompt`；
  - outputSchema → `ai-worker/src/nodes/structured-node.ts:129` `resolveOutputSchema`；
  - completionPolicy → `ai-worker/src/nodes/structured-node.ts:121` `runStructuredNode` 的 adapter +
    通用 validator（BUILD 在该函数内落地）；
    T-512 仅增加 `script.draft` 默认值、repair loop 与采纳门；
  - 256 KiB → BUILD 目标
    `backend/src/modules/ai-runtime/effective-skill-snapshot.ts#serializeEffectiveSkillSnapshot`。
- 物理边界：contract 定义 shape；backend/settings 单写 DB；ai-worker official/runtime resolver；
  frontend 仅 RPC。
