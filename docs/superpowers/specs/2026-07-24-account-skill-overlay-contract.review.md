# T-513 SERVICE CONTRACT 独立评审

> 被评审工件：`2026-07-24-account-skill-overlay-contract.md`  
> 评审方式：独立只读 Agent；不得编辑被评审工件；不得触碰 T-517。

## Round 1 — FAIL

时间：2026-07-24

### Blocker

- P0：只有 task 建行幂等，没有原子执行 claim。现有 `markRunning` 是先读后写，两个 runner
  可同时调用模型/工具。
- P1：attemptId 未绑定 canonical request fingerprint；同 attempt 不同 payload 会静默返回旧任务。
- P1：`retryOfTaskId` 没有联合归属、taskType、终态和持久化语义。
- P1：PUT partial patch 未定义“读完整 delta→merge→校验→CAS→完整历史”的同事务算法。
- P1：`requiredSequence` 的相等/子序列、标准化、重复 role 规则不确定。
- P1：API-SKO-06 缺 response、errors、permission、repeat 与示例。

### 其他问题

- 成功响应裸类型与 `{data}` 示例冲突。
- 历史兼容性没有区分保存时和当前 base。
- `platformPolicy` 同时存在“忽略”和“400 拒绝”两种语义。
- 多个设置操作缺逐项 ownership error 和示例。

### 修正

- 新增 `claimAiTaskExecution`：单条 `queued→running UPDATE ... RETURNING`、lease token、
  唯一 `model_call_started`、终态 token 校验、过期恢复规则；删除旧 `markRunning` 路径。
- 唯一键改为 `(userId,accountId,taskType,attemptId)`，增加 canonical SHA-256 fingerprint；
  payload 不同明确 409。
- `retryOfTaskId` 限同 user/account/taskType 的终态任务并持久化。
- 闭合 patch merge 同事务算法、requiredSequence 精确比较、统一成功 envelope、完整错误和示例。
- platform policy 客户端注入统一 fail-closed 400；历史分别展示 saved/current compatibility。

### 流程说明

独立评审返回前曾提前完成一组账号 overlay 仓储红绿测；收到 FAIL 后立即停止后续 BUILD，
CONTRACT 未标通过、任务未完成，也未触发构建。该提前切片不作为 Gate 证据，待 Round 2
blocker 清零后才继续。

## Round 2 — FAIL

### 已清零

- PUT merge、requiredSequence、retry source ownership/persistence。
- API-SKO-06 errors/permission 主体、envelope、历史兼容性和 platformPolicy fail-closed。

### 剩余 blocker

- P0：claim 后至 marker 前 lease 可过期；旧 runner 仍可能和新 lease runner 双调用。
- P1：fingerprint 漏 `retryOfTaskId`。
- P1：设置页需要 official catalog，但只有内部 provider 与仅列 overlay 的 RPC。
- P1：任意结构化 object 到 completionPolicy segments 没有 official adapter。

### 修正

- 新增 `beginModelCall` 条件事务；只有当前、未过期 lease 且 marker 首写胜者能调用 provider/tool；
  requeue 同样按旧 token + 无 marker CAS。
- fingerprint 纳入规范化 `retryOfTaskId ?? null`。
- API-SKO-01 改为 server official/LKG catalog 与当前账号 delta 的完整合并列表；frontend 禁止直读
  本地 registry。
- official Skill 增加 append-only completionPolicy adapter `id+version`；无 adapter 或 effective
  schema 不被 adapter 支持时，PUT/rollback 直接 422。
- snapshot 改存 server-only `ai_tasks.runtime_data`，避免 task DTO 暴露 platform policy/prompt。

## Round 3 — FAIL

### 已清零

- 双调用 P0、fingerprint/retry、official catalog 来源、completion adapter 保存门、server-only
  runtime snapshot。

### 剩余 blocker

- P1：catalog 缺 official/effective 可编辑值。
- P1：contract 没有内联带 adapter 的完整 snapshot shape。
- P1：requiredFacets 错把 official required 子集当全部合法 placeholder。
- P1：editableFields 没有写侧拒绝和基座升级兼容语义。
- P1：模型开始后 lease 没有续租/失权取消协议。

### 修正

- catalog view 增加 official/effective 六类可编辑值，同时继续隐藏 platform policy 和
  contextRequirements。
- CONTRACT 内联完整 `EffectiveSkillSnapshotV1`，包含 official-only adapter `id+version`。
- official base 增加真实 `availableFacets` allowlist；required 与 template placeholder 都据它校验。
- PUT 对非 editable 非 null 字段 422；null 可清理。基座取消权限后旧 overlay 显式 incompatible。
- 新增 `renewAiTaskExecution` CAS heartbeat、失权 Abort、外部 tool 幂等键和 reconciliation 规则。

## Round 4 — PASS

独立终审：`P0=0`、`P1=0`，service-contract + contract-completeness Gate 可 PASS，可进入 BUILD。

确认闭合：

- official/effective catalog 可直接驱动 UI。
- snapshot 完整内联 adapter。
- availableFacets 覆盖合法 optional placeholder。
- editableFields 有写侧 422 与基座升级 incompatible。
- renew heartbeat / Abort / tool idem / no replay 与 beginModelCall 形成安全单执行链。

终审 P2 已在进入 BUILD 前清理：`overlayVersion` 改为 server-generated；示例使用完整 SHA-256；
尚未存在的 BUILD consumer 以目标文件+函数登记，收片时补真实行号。
