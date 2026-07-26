# T-513 Replacement：账号增量 Skill 覆盖与执行隔离

> 日期：2026-07-24  
> 阶段：PLAN  
> 状态：PLAN Gate `CONCERNS（已处理，0 blocker）`；进入 CONTRACT  
> 替代：`2026-07-24-account-scoped-skill-isolation-design.md`（该工件三轮 FAIL，保留作失败证据）  
> 用户裁决：DEC-SKI-002

## 1. 问题、目标与范围

CreatorOS 已按 `(userId, accountId)` 隔离项目、定位与 AI 任务，但用户在“设置 → 技能”
保存的覆盖仍写入全局 `skill_config_overrides`，随后被热写入进程级 Registry。A 账号调整
`script.draft` 后，B 账号会看到并执行同一份配置；即使只给表加 `account_id`，并发任务仍会
争用同一份进程级可变状态。

本任务一次完成：

1. 官方内置/验签远程 Skill 继续作为共享只读基座。
2. 每个账号只持久化自己相对基座的增量字段，不复制整份官方 Skill。
3. 所有设置读写、历史与回滚按 `(userId, accountId, skillId)` 隔离并使用 revision CAS。
4. AI 调用只执行创建时固定的不可变 effective Skill snapshot，不读取另一账号或稍后修改的值。
5. 旧全局表退出新产品链路：保留物理数据，但不迁移、不认领、不读取、不展示。

### 非目标

- 不恢复旧全局覆盖；旧表只供离线人工取证，任何自动 fallback、恢复或执行链均不得读取。
- 不提供账号间隐式继承、复制或团队共享；未来如需要，另做显式导出/导入设计。
- 不让 AI 自动落库修改 Skill；仍由用户保存后由 backend service 写入。
- 不在本任务定义 T-512 的完整性策略内容；这里只提供账号级增量字段和快照承载能力。

**Appetite**：允许修改 contract、backend schema/service、ai-worker registry 解析、设置页和任务
创建/恢复链；不建立 legacy claim 状态机，不复制官方 Skill，不新增第二套任务系统。

## 2. 目标用户与 PR-FAQ

### 目标用户

- 同一 CreatorOS 用户管理两个及以上、风格不同的抖音账号。
- 单账号用户：继续使用官方 Skill 或从现在开始保存该账号的定制。

### 非目标用户

- 需要恢复旧全局定制的存量用户。
- 多人共同编辑一个账号、或需要组织级公共 Skill 的团队。

### PR-FAQ

CreatorOS 的每个抖音账号现在只保存自己的 Skill 差异。官方 Skill 仍统一升级；A 号改的语气、
结构或工具不会改变 B 号。生成任务开始后，即使用户切号或再次保存设置，该任务仍按开始时的
版本完成，避免在途结果漂移。

1. **以前的配置怎么办？** 旧配置无法证明属于哪个账号，因此不自动迁移，也不让它污染任何号。
2. **会不会让安装包或数据库更大？** 账号配置表不复制整套 Skill，只保存差异；为保证重启后
   仍按原版本恢复，任务执行账会保存本次所需 Skill 的完整快照，并有 256 KiB 上限。
3. **能否让两个号共用？** 当前不隐式共享。若以后需要，提供明确的导出/导入，而不是恢复全局态。
4. **为什么保存冲突要提示重试？** 它防止两个页面或后台操作互相覆盖刚保存的新版本。

## 3. 用户流程

### FLOW-SKO-01：当前账号编辑

1. 用户切换到账号 A，进入“设置 → 技能”。
2. 页面明确显示当前账号，读取官方基座与 A 的增量覆盖，展示 effective 值。
3. 保存时携带页面读到的 `rowRevision`；成功后 revision 加一并追加 A 的历史。
4. 切换账号 B 后重新读取，B 只见官方基座或 B 自己的增量。

**独立验证**：A 保存后，A GET 命中覆盖，B GET 无覆盖；B 不能读取 A 的 versionId。

首次没有覆盖时，GET 返回 `overlay: null, rowRevision: null`。首次 PUT 必须携带
`expectedRevision: null`，其语义是 create-only；两个并发首次 PUT 只有一个 INSERT 成功，
另一个统一返回 `SKILL_OVERLAY_REVISION_CONFLICT` 及 `latestRevision: 1`。已有行的 PUT 必须
携带整数 `expectedRevision`，条件 UPDATE 未命中时返回同一错误。当前行写入与历史追加处于
同一事务，任一步失败则全部回滚。

### FLOW-SKO-02：并发保存

1. 两个页面都读取 A 的 revision 3。
2. 页面一保存成功，得到 revision 4。
3. 页面二继续以 revision 3 保存，返回 `SKILL_OVERLAY_REVISION_CONFLICT` 和最新 revision；
   不覆盖 revision 4。

**独立验证**：PGlite 并发 PUT 最多一个成功，历史和当前行一致。

### FLOW-SKO-03：双账号并发生成

1. A/B 分别具有不同 `script.draft` 增量。
2. 创建任务时按任务归属账号解析并写入 effective Skill snapshot。
3. A/B 异步交错执行时，各自只从自己的 snapshot 读取模板、工具和 schema。

**独立验证**：使用 barrier 交错 100 次，A 调用从未出现 B 的标记，反之亦然。

`tools` 不是授权清单。账号覆盖只能从官方基座的 `tools` 中做子集删减，不能新增工具；backend
保存时与运行时解析时各验证一次 `overlay.tools ⊆ official.tools`。最终暴露给模型的工具还要与
当前场景 policy-approved catalog、账号权限及本次人工授权求交集。写类/付费工具原有逐次确认门
继续生效，snapshot 不能扩大权限或替代确认。

账号覆盖的 `system` 字段只代表 **Skill 方法槽**，不是最终 CreatorOS system prompt。装配顺序
固定且不可由账号改变：

```text
immutable CreatorOS platform policy
  → official Skill method
  → account method overlay
  → spotlighted untrusted context / user input
```

平台的人工确认、AI 只产候选、工具授权、隐私和不可信内容边界属于 immutable policy；账号配置
只能替换 method slot。snapshot 记录 `platformPolicyVersion` 和实际平台策略文本，执行时不得用
账号 system 覆盖它。保存与执行负测必须覆盖“伪造完整 system”“不可信内容要求绕过确认”
“账号方法里引用越权工具”。

### FLOW-SKO-04：历史与回滚

1. A 查看、回滚 A 的版本，回滚本身形成新 revision 和新历史。
2. 伪造 B 的 `versionId` 按不存在处理，不泄露 B 的内容。
3. 回滚也必须携带 `expectedRevision`；冲突时不写入。

历史记录保存“当时观察到的 `baseVersion` + 完整增量”，但回滚语义固定为：**把历史增量重新
应用到当前已验签基座**，不是恢复一份旧官方基座。写入前必须用当前基座重新验证 tools 子集、
JSON Schema 和 completionPolicy；不兼容则返回 `SKILL_OVERLAY_INCOMPATIBLE`，当前行和历史均
不变，并提示用户编辑后再保存。远程基座验签失败沿现有 last-known-good/内置基座路径，不把未
验签内容作为基座；官方删除工具后，引用该工具的旧增量会被隔离为 incompatible，不能执行。

### FLOW-SKO-05：旧任务恢复

部署新版本后，旧的 queued/running Skill 任务若没有 snapshot，不伪造历史配置，也不读取当前
账号配置：

- `queued`：可证明尚未进入模型调用，失败为 `SKILL_SNAPSHOT_MISSING_SAFE_RETRY`，允许用户重试。
- `running`：副作用未知，失败为 `SKILL_SNAPSHOT_RECONCILIATION_REQUIRED`，禁止自动重试；
  保留 task steps/result/usage/cost，提示用户先核对已有结果/费用后再决定是否新建任务。
- 新任务在发起模型调用前追加可持久化 `model_call_started` step；崩溃恢复可据此区分调用前与
  调用后。结果已经持久化时不得再次调用模型。

已有有效 snapshot 的任务照常恢复。

## 4. 信息架构

- **IA-SKO-01**：“设置 → 技能”仍是唯一入口，不新增导航。
- **IA-SKO-02**：页头持续显示当前账号；无账号时禁止读取/保存并引导先选择账号。
- **IA-SKO-03**：每个 Skill 展示“官方默认 / 当前账号已定制”及 revision；读取失败不复用前一账号缓存。
- **IA-SKO-04**：冲突提示“设置已在别处更新，请刷新后重试”，不提供盲目强制覆盖。
- **IA-SKO-05**：旧全局覆盖不展示认领横幅或入口。

## 5. 领域模型

### ENT-SKO-01 OfficialSkillBase

共享只读：`skillId`、`baseVersion`、`system`、`template`、`tools`、`requiredFacets`、
`contextRequirements`、`outputSchema`、`completionPolicy`。代码内置或验签远程包可替换基座，
但账号覆盖不写回基座。`contextRequirements` 是官方只读执行字段，账号不得覆盖；它必须完整
进入 snapshot，确保 `script.draft/planning.thesis/cover.brief` 等声明式上下文装配不丢失。

T-513 固定策略载体，T-512 再定义具体默认值与校验实现：

```ts
type CompletionPolicyV1 = {
  schemaVersion: 1;
  minSegments: number;
  maxSegments: number | null;
  requiredSequence: string[]; // 例如 ["hook", "body", "cta"]；空数组表示无角色顺序要求
  repairAttempts: number;
};
```

官方基座可声明默认 `completionPolicy`；账号增量未提供/清除该字段时回到官方默认。账号覆盖提供时
必须整体替换一个通过 contract 校验的 `CompletionPolicyV1`，不做字段级深合并。

T-513 提供并在结构化节点成功返回前强制执行通用 validator：只按
`minSegments/maxSegments/requiredSequence` 检查结构化段落数量和 `role` 顺序，不识别
hook/CTA 等业务词。声明非空策略但运行节点无法提供结构化 segments 时必须 fail-closed 为
`COMPLETION_POLICY_UNSUPPORTED`。T-512 在这个已真实消费的载体上增加 `script.draft` 默认策略、
自动修复与采纳门，不再另造全局规则。

### ENT-SKO-02 AccountSkillOverlay

唯一键 `(userId, accountId, skillId)`；字段：

- `rowRevision`：从 1 开始单调递增。
- `overlayVersion`：展示/审计标识。
- 可空增量：`system/template/tools/requiredFacets/outputSchema/completionPolicy`。
- `validatedBaseVersion`：最近一次保存时通过兼容校验的官方基座版本，只作审计提示。
- `updatedBy/createdAt/updatedAt`。

`undefined` 表示本次 PATCH 不改；`null` 表示清除此增量字段、回到基座。全部字段为 null 的行可
保留作 revision 锚，effective 结果仍等于基座。

### ENT-SKO-03 AccountSkillOverlayVersion

每次成功 PUT/rollback 后保存一份完整“增量快照”，包含联合归属、来源 revision、操作者和时间。
版本记录还包含当时观察到的 `baseVersion` 与兼容性校验结果，不可跨账号读取。

### ENT-SKO-04 EffectiveSkillSnapshot

执行时的 JSON 值对象：

```ts
type EffectiveSkillSnapshotV1 = {
  snapshotVersion: 1;
  userId: string;
  accountId: string;
  resolvedAt: string; // 只用于审计，不进入任务幂等键
  platformPolicyVersion: string;
  platformPolicy: string; // immutable；不来自账号 overlay
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
      contextRequirements: string[]; // official-only，账号不可覆盖
      outputSchema: Record<string, unknown> | null;
      completionPolicy: CompletionPolicyV1 | null;
      completionPolicyAdapter: {
        id: string;
        version: string;
      } | null; // official-only；适配器注册表 append-only
    };
  }>;
};
```

snapshot 存入任务的 server-only `runtime_data`，不进入对客户端返回的 `inputData`，创建后不再
重解析数据库。执行入口校验 `userId/accountId` 与任务
归属一致，并要求包含当前 runner 的全部 required Skill；缺失或错号都显式失败。

backend 维护单一纯函数 `requiredSkillIdsForTask(taskType, inputData)`，它由 task/runner 注册表
产生确定性、去重且排序稳定的 Skill 闭包。任务 INSERT 前一次解析并校验全部 ID；未知的 Skill
消费型 taskType 或闭包缺项返回 `SKILL_SNAPSHOT_INCOMPLETE`。Chat 的当前 surface Skill 在同步
请求开始时解析；Chat 工具若同步调用另一个 registered Skill，由宿主按同一 owner tuple 为该次
子调用解析独立 snapshot，并用嵌套 AsyncLocalStorage 作用域执行，结束后恢复父 Chat snapshot；
若派生异步子任务，子任务按自己的 taskType 创建独立 snapshot。两类子调用都不得继承父 Chat 的
不完整子集，也不得回退进程级 registry。非 Skill 任务显式映射为空数组，不得在运行中临时改读数据库。

定时采集 task 的 required Skill 必须登记完整后置闭包：`scheduled.self.detail` 包含
`topic.attribution`，`scheduled.benchmark` 包含 `benchmark.teardown`，
`scheduled.topic.daily` 包含 `topic.generate + trend.extract`，
`scheduled.favorites` 包含 `favorites.triage + knowledge.distill`。后置模型调用必须被
`await` 在同一 task snapshot/lease 内；best-effort 只表示失败不反转采集主结果，不表示可
fire-and-forget 逃出归属与租约。

任务幂等键只由稳定业务输入、`userId/accountId/taskType` 及显式 `idempotencyKey` 计算，排除
`resolvedAt`、展开后的 prompt 正文和 snapshot JSON。创建顺序固定为：

1. 客户端每次用户动作生成 `attemptId`；同一次 HTTP/网络重试复用它，用户点“重新生成/重试”
   必须生成新 `attemptId` 并可携带 `retryOfTaskId`。
2. 先按 `(userId, accountId, taskType, attemptId)` 查询已存在任务；任意状态命中都返回同一任务。
   状态语义固定为：`queued/running/awaiting_confirmation` 防重复执行；
   `succeeded/failed/cancelled` 是该 attempt 的最终结果，不借旧 key 新建。
3. 未命中时，各竞争者都只读解析自己的 snapshot（无副作用）。
4. 各自携带 snapshot 执行 `INSERT ... ON CONFLICT(user_id,idempotency_key) DO NOTHING RETURNING`；
   唯一键决定一个胜者。
5. 败者丢弃自己未持久化的 snapshot，按相同 key 读取并返回胜者 taskId/snapshot。

相同创建请求并发或网络重试必须得到同一 taskId 与胜者持久化的同一 snapshot。

每次 list/get/PUT/rollback/创建任务解析时，都把当前 overlay 重新应用到当前已验签基座并运行
兼容校验，不仅在保存时校验。响应包含
`baseVersion/validatedBaseVersion/compatibility: compatible|incompatible`；不兼容时 GET 保留
原 overlay 与类型化原因供编辑，任务在写 `model_call_started` 前以
`SKILL_OVERLAY_INCOMPATIBLE` 失败，绝不静默回退官方默认或调用模型。修复入口仍是当前账号的
Skill 编辑/恢复默认；原 overlay/history 不删除。

任务 snapshot 序列化后上限为 256 KiB，只包含 `requiredSkillIdsForTask` 的闭包；超限在建任务
前返回 `SKILL_SNAPSHOT_TOO_LARGE`，不产生任务或模型费用。完整 snapshot 与 task 同生命周期，
不得在 task 存在时单独清除；账号配置表仍只存增量。

### 状态与不变量

```text
official base (shared, immutable)
        + account overlay delta (owned, CAS)
        = effective snapshot (immutable per execution)
```

- `AccountSkillOverlay.userId/accountId` 必须属于请求上下文。
- 运行期本地覆盖不得写入进程级 Registry/Schema map。
- Registry 只保存官方基座；账号增量由纯函数解析，执行上下文只读。
- 账号归档后覆盖保留，但归档账号不能作为当前上下文读写或新建任务。

## 6. 功能需求

- **FR-SKO-01**：官方/验签远程 Skill 是共享只读基座；账号只保存增量。  
  删除会导致每号复制全量配置、升级分叉。
- **FR-SKO-02**：覆盖与版本以 `(userId, accountId, skillId)` 联合归属，所有操作强制当前账号。  
  删除会继续串号或越权读历史。
- **FR-SKO-03**：PUT 与 rollback 使用 `rowRevision` CAS，冲突不覆盖。  
  删除会让并发保存产生静默丢更新。
- **FR-SKO-04**：运行时通过纯解析得到不可变 effective snapshot，不修改全局 Registry。  
  删除会让双账号并发争用同一可变态。
- **FR-SKO-05**：异步任务创建时保存含官方只读执行字段与账号增量的完整 snapshot，恢复时只执行该 snapshot。  
  删除会让在途任务随设置修改漂移。
- **FR-SKO-06**：无 snapshot、错账号、缺 skill 的任务明确失败，绝不静默回退。  
  删除会制造不可追溯的“成功但用错配置”。
- **FR-SKO-07**：设置页明确当前账号并在切号时取消旧请求/清缓存后重读。  
  删除会让正确后端数据被前端旧缓存误展示。
- **FR-SKO-08**：旧全局覆盖退出所有新读写和运行时链路，物理数据只读保留。  
  删除会让新旧两套真相再次竞争。
- **FR-SKO-09**：账号 tools 增量只能缩减官方工具，最终工具集继续经过场景/账号/人工授权求交。  
  删除会让 Skill 设置变成权限升级旁路。

## 7. 非功能需求与验收信号

- **NFR-SKO-01 隔离**：双号 100 次交错解析/调用，串用次数必须为 0。
- **NFR-SKO-02 一致性**：并发 CAS 只有一个写成功；当前 revision 与历史链无断档。
- **NFR-SKO-03 可支持性**：日志记录 `taskId/accountId/skillId/baseVersion/overlayRevision`，
  不记录 prompt 正文。
- **NFR-SKO-04 性能/存储**：账号配置表只存增量；任务账保存所需 Skill 的完整 snapshot，
  单任务序列化上限 256 KiB，超限 fail-before-write。
- **NFR-SKO-05 边界**：backend 独占数据库；ai-worker 不读库；frontend 只走 contract；
  AI 仍不直接写业务表。
- **NFR-SKO-06 费用安全**：无法证明模型未调用的旧 running 任务不得自动重试。

### Success signals

- 北极星：发布后首个含双账号的 7 天验证窗口内，跨号 Skill 串用可复现数为 0。
- 护栏：`SKILL_SNAPSHOT_*` 失败率低于 Skill 任务的 1%；超过阈值立即停止自动恢复并排查入口遗漏。
- 验证时点：合并前定向并发/持久化测试；下一次真实双账号使用后检查本地结构化日志。

## 8. 方案比较与风险

### 替代品与切换

| 方案 | 问题 | 触发切换 | 成本 |
|---|---|---|---|
| 忍着全局共用 | A/B 串风格，无法追溯 | 任一跨号污染 | 零开发成本，持续返工 |
| 切号时重写全局 Registry | 并发仍竞争 | 后台任务与前台同时运行 | 实现小但不正确 |
| 每号复制完整 Skill | 官方升级和包体重复 | 官方 Skill 永不更新 | 数据与合并成本高 |
| 本方案：基座 + 增量 + snapshot | 需要改契约与执行入口 | 用户已确认 | 一次性改造，长期简单 |

### 被否决形态

| 形态 | 否决原因 | 翻案信号 |
|---|---|---|
| legacy claim/migration | 无可信归属证据，状态机成本高 | 用户明确要求恢复旧值并接受手动选择 |
| user 级公共覆盖再叠 account | 重新引入继承歧义 | 用户明确要求组织/账号组共享 |
| 只在 DB 加 account_id | 不能解决进程级 Registry 并发污染 | 永久单任务、单账号运行 |

### 五大风险

| 风险 | 证据 | 最便宜检验 | 若错代价 |
|---|---|---|---|
| 价值 | 用户直接指出多账号应隔离 | A/B 设置与生成走查 | 核心人设继续污染 |
| 可用性 | 入口不变，仅增加账号提示 | 组件切号测试 | 用户误改错账号 |
| 可行性 | RequestContext/ai_tasks 已有 accountId；PLAN RAT 已通过 | PGlite CAS + 100 次异步交错 RAT | 数据正确但运行串号 |
| 商业 | 修复可信度，不新增收费依赖 | 首个双账号日志窗口 | 用户放弃矩阵运营 |
| 依赖 | Node 服务端支持 AsyncLocalStorage；PGlite 支持事务/唯一键 | 仓内版本定向测试 | 需改为显式参数透传 |

### Pre-mortem

| 死因 | SPEC 级应对 |
|---|---|
| 某个 runner 绕过 snapshot 又读官方当前值 | 缺 snapshot fail-closed；静态扫描与入口矩阵 Gate |
| UI 切号后显示上一号缓存 | accountId 进入 query key，切号取消旧请求并清局部编辑态 |
| 两个保存互相覆盖 | 所有写路径统一 CAS，禁止 last-write-wins |
| 旧全局加载器仍在启动时执行 | 删除装配调用并加反向测试：旧表有值也不能影响 effective Skill |

## 9. 现成方案、OSS 与仓内事实

### 9.1 现成方案/OSS 取舍

| 候选 | 采用/弃用 | 理由 |
|---|---|---|
| PostgreSQL/PGlite 联合唯一键 + 条件 UPDATE/`ON CONFLICT` | 采用 | PostgreSQL 官方保证 `ON CONFLICT` 的原子结果；仓内已经使用 PGlite/Drizzle，无需引入锁服务。 |
| Drizzle `db.transaction` | 采用 | 当前 ORM 原生支持提交/回滚；用于“当前行 + 历史”单事务。 |
| Node `AsyncLocalStorage.run` | 采用作深层只读传递 | Node 官方保证 `run()` 内创建的异步操作可读取 store；仓内目标 Node 25 已稳定支持。它不作为持久真相。 |
| 给所有 runner 显式增加 snapshot 参数 | 保留为失败时替代 | 类型最显式，但会扩散数十个函数签名；若 ALS RAT/集成测试不稳定则切换。 |
| 进程互斥锁/切号重载 Registry | 弃用 | 只覆盖单进程，不能解决重启恢复，且会串并发任务。 |

依据：[Node AsyncLocalStorage 官方文档](https://nodejs.org/api/async_context.html)、
[PostgreSQL INSERT/ON CONFLICT](https://www.postgresql.org/docs/current/sql-insert.html)、
[Drizzle Transactions](https://orm.drizzle.team/docs/transactions)。

### 9.2 仓内现网事实

| 事实 | 证据 |
|---|---|
| 旧覆盖表无账号列 | `backend/src/schema/settings.ts:88`；SQL 镜像 `backend/src/schema/settings.ts:174` |
| 旧 repository 明确全局读写 | `backend/src/modules/settings/settings.repository.ts:141`、`:466` |
| 本地覆盖写入进程级 Registry/Schema map | `ai-worker/src/prompt/registry.ts:74`、`:81`、`:280` |
| 启动装配仍读取旧表全量 | `backend/src/modules/ai-runtime/skill-config-overrides.ts:118`、`frontend/src/server/persistence-client.ts:10962` |
| AI task 已有联合归属和 JSON input | `backend/src/schema/ai.ts:69`、`:79` |
| 默认幂等键当前基于完整 inputData | `backend/src/modules/ai/ai.service.ts:538`、`:546` |
| `contextRequirements` 已被真实运行时消费 | `ai-worker/src/prompt/template.ts:56`、`frontend/src/server/persistence-client.ts:849`、`:3989` |
| 当前没有账号 overlay/snapshot resolver | `rg -n "AsyncLocalStorage\\|resolveEffectiveSkill\\|EffectiveSkillSnapshot\\|account_skill" backend/src ai-worker/src contract/src frontend/src` 除本 SPEC 外 0 命中 |

### 9.3 Skill 消费入口矩阵（PLAN 已盘点）

| 类别 | 现有入口 | 改造要求 |
|---|---|---|
| 通用 schema | `ai-worker/src/nodes/structured-node.ts:129` | 从 active snapshot 解析 outputSchema；无上下文 fail-closed |
| Chat | `backend/src/modules/ai-runtime/chat-runner.ts:637`、`:693`、`:1457`、`:1535` | 整次 chat assembly 进入账号 snapshot 上下文；工具再过授权求交 |
| 规划/脚本/复盘 | `planning-runner.ts:307`、`planning-contract-runner.ts:145`、`planning-outline-runner.ts:158`、`script-review-runner.ts:218`、`review-runner.ts:134` | runner 顶层进入 snapshot 上下文 |
| 内容与定位 | `benchmark-teardown-runner.ts:187`、`comment-qa-sift-runner.ts:108`、`favorites-distill-runner.ts:125`、`material-match-runner.ts:107`、`positioning-runner.ts:293`、`reconstruct-runner.ts:143`、`topic-attribution-runner.ts:268`、`topic-enrich-runner.ts:248`、`topic-preference-distill-runner.ts:120`、`trend-source-signals.ts:174` | 同上 |
| 知识/校准/发布/视频 | `knowledge-classify-runner.ts:87`、`knowledge-distill-runner.ts:184`、`knowledge-relate-runner.ts:99`、`calibration-diagnose-runner.ts:248`、`calibration-score-runner.ts:210`、`cover-runner.ts:240`、`platform-adapt-runner.ts:172`、`video-decisions-runner.ts:721` | 同上 |
| 设置管理面 | `frontend/src/app/(creator)/settings/page.tsx:268`、`:272` | 只列 official base；effective 覆盖从账号 settings API 合并，管理读取不要求运行 snapshot |
| 旧加载器 | `frontend/src/server/persistence-client.ts:10962` | 删除本地全局加载；远程验签基座保留独立 official loader |

盘点命令：

```bash
codegraph callers getTemplate --json
codegraph callers resolveOutputSchema --json
rg -n '\b(getTemplate|resolveOutputSchema|getTools|listTemplates|exportSkillSchema)\(' \
  backend/src ai-worker/src frontend/src/server frontend/src/app frontend/src/features
```

## 10. PLAN RAT（当场证据）

运行环境：`Node v25.9.0`、`@electric-sql/pglite 0.2.17`、`drizzle-orm 0.36.4`。

1. PGlite 真库建立联合主键；两个并发 create-only INSERT 只有 1 个胜者；两个同 revision
   条件 UPDATE 只有 1 个胜者；在事务中注入异常后当前行和 history 同时回滚。
2. Node `AsyncLocalStorage` 执行 100 个 A/B 交错 Promise（含 microtask + timer），100/100
   读取自己的 frozen marker。
3. PGlite 任务表用 `(user_id,idempotency_key)` 唯一键让两个携带不同 snapshot 的竞争 INSERT
   只有一个胜者；败者回读后，两方返回同一 taskId 和同一持久 snapshot。

```json
{"createdWinners":1,"updateWinners":1,"transactionRollback":true,"result":"PASS"}
{"interleavings":100,"isolated":100,"result":"PASS"}
{"sameTask":true,"sameSnapshot":true,"result":"PASS"}
```

RAT 只证明原语可行；BUILD 仍须用仓内 Drizzle schema/repository 做红绿集成测试。若实际 Drizzle
方言无法把 CAS 和 history 收进同一事务，替代方案是同事务 raw SQL CTE，不引入进程锁。

## 11. 需求到实现边界

| 需求 | 属主 | 主要落点 | 独立测试 |
|---|---|---|---|
| FR-SKO-01/08 | ai-runtime + settings | official registry / legacy loader removal | 旧表污染反测 |
| FR-SKO-02/03 | backend settings | schema/repository/service/contract | 双号 + CAS + rollback |
| FR-SKO-04/06 | ai-worker + backend composition | pure resolver / scoped execution | 100 次交错 + fail-closed |
| FR-SKO-05 | backend AI task | create/recovery input snapshot | 修改设置后旧任务不漂移 |
| FR-SKO-07 | frontend settings | account-keyed query/editor | 切号与延迟响应反测 |
| FR-SKO-09 | settings + chat tool gate | tool subset validation / runtime intersection | 任意/越权/付费 tool 负测 |

## 12. HARD 与 Gate 结论

| 项 | 判定 | 解法与归属 | 最迟验证 |
|---|---|---|---|
| 全 Skill 消费入口是否都进入 snapshot 上下文 | feasible | PLAN 入口矩阵已列全；BUILD 以静态扫描 + 每类代表性集成测试封口 | BUILD 收片 |
| PGlite 并发 CAS 方言 | feasible | PLAN RAT 已验证 create/update 单胜者与事务回滚 | CONTRACT 细化为 SQL/Drizzle 字段契约 |

PLAN Gate 自检：FLOW/ENT/IA/FR 均有稳定 ID；无 `NEEDS CLARIFICATION`；用户裁决已写
DEC-SKI-002；旧迁移与复制范围已显式删除，不静默缩减。独立评审通过前不得开工。
