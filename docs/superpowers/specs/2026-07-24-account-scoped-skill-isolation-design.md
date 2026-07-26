# T-513：账号级 Skill 隔离、并发安全解析与存量迁移

> 日期：2026-07-24  
> 阶段：PLAN  
> 状态：三轮独立评审后仍 FAIL；已停止原地修订，回 PLAN 重做 replacement SPEC  
> 用户确认：用户在确认“不同账号应隔离 Skill”后明确要求“把它补一下”  
> 上游真相：
> [多账号完全独立人设](2026-07-05-multi-account-persona-design.md)、
> [Skill 驱动的编导智能体](2026-07-10-skill-driven-creative-agent-design.md)

## 1. 问题与目标

CreatorOS 已把一个本机用户下的多个抖音号定义为不同创作人设，项目、定位、知识、素材、
数据和 AI 任务均随当前账号切换。但用户编辑的 Skill 覆盖仍存入全局
`skill_config_overrides`：表以 `skill id` 为唯一主键，没有 `user_id/account_id`；
运行时还把本地覆盖写入进程级可变 Registry。结果是 A 号调整“写文案”的风格、结构或工具后，
B 号也会使用同一份覆盖；若只给表加账号列而继续热改全局 Registry，两个账号并发生成仍可能串用。

本任务完整修复这条归属断链：

1. 官方内置和签名远程 Skill 是所有账号共享的只读基座。
2. 用户编辑、历史版本和后续自动进化产生的覆盖归属当前 `(userId, accountId)`。
3. 每次生成在自己的异步上下文中解析不可变 effective Skill，不修改进程级本地覆盖。
4. 异步 AI 任务保存本次账号和 Skill 版本/策略快照；Skill 后改不追溯污染在途或历史任务。
5. 旧全局定制没有可信 account 证据，一律保持隔离；用户显式选择目标账号后才迁入。
6. 用户可把当前账号某个 Skill 显式复制到自己另一个 active 账号；默认遇到目标已有覆盖就拒绝，
   只有二次确认“覆盖目标版本”才替换并留下新历史。

## 2. 目标用户与非目标用户

### 目标用户

- 同一 CreatorOS 本地用户运营两个及以上抖音号，且各号定位、语气或内容结构不同。
- 只运营一个账号但已经定制过 Skill 的存量用户；升级后原定制仍应可用。

### 非目标用户

- 团队多人协同编辑同一账号：当前产品仍是本机单用户，不在本任务引入团队权限。
- 跨账号自动合并 Skill：不同人设默认独立；本任务只提供同一用户、已绑定 active 账号之间的
  显式复制。通用文件导出/导入、团队共享和第三方 Skill 注入审查仍由既有 T-335 承担。
- 让 AI 自动修改 Skill：本任务只修归属和解析，仍遵守“AI 只产建议、用户采纳后落库”。

## 3. 核心场景

### FLOW-SKI-01：当前账号定制 Skill

1. 用户切换到账号 A。
2. 打开设置 → 技能，读取 A 的覆盖与版本历史。
3. 修改 `script.draft` 的 system/template 并保存。
4. 再切到账号 B，B 仍显示官方基座或 B 自己的覆盖。

**Independent Test**：同一 user 下建 A/B 两号，对 A PUT 后分别 GET，A 命中、B 不命中。

### FLOW-SKI-02：双账号并发生成

1. A 的 `script.draft.system = "A_STYLE"`，B 的为 `"B_STYLE"`。
2. 同时发起 A、B 两个生成任务。
3. 两个模型调用分别绑定 A/B 模板与 schema，任何执行顺序都不互串。

**Independent Test**：用 barrier 并发两次 `runWithSkillContext`，在异步交错后断言各自读取稳定。

### FLOW-SKI-03：存量全局覆盖迁移

1. 升级前存在一条旧 `skill_config_overrides`。
2. 升级迁移按旧行 `updated_by` 关联用户，并统计该用户 active 抖音账号数。
3. 不根据 active、archived、createdAt 或“当前只剩一个号”猜归属；全部记录
   `pending_user_choice`，旧值不参与任何账号运行。旧表、旧历史均不删除。
4. 设置页显示“有一份旧 Skill 待归属”。用户选择自己名下一个 active 账号并确认后，
   当前覆盖与全部历史在同一事务中迁入；记录操作者、目标账号、旧/新 ID 映射和内容摘要。
5. 重复执行按 `(legacyOverrideId,targetAccountId)` 审计唯一键识别，成功迁移不重复写当前行或历史。
6. 目标账号已存在同 skill 覆盖时默认拒绝并返回目标 `rowRevision` 与摘要；用户只有通过
   “保留目标”或携带该 `expectedTargetRevision` 的“用旧值覆盖目标”二次选择才能结束待处理。
   选择覆盖时在同一事务中锁定目标、CAS revision、先把目标当前值追加历史，再写旧值；
   revision 已变化则返回新冲突摘要，要求重新确认。

**Independent Test**：单号、双号、`1 active + 1 archived`、失效后新绑号均保持 pending；
显式选号后当前值和全部历史数量/内容一致、可回滚，重跑迁移零新增。

### FLOW-SKI-04：版本回滚

1. A、B 对同一 skill 各自产生版本历史。
2. A 回滚只能选择 A 的历史；伪造 B 的 `versionId` 返回 ownership/not-found。

**Independent Test**：跨号 rollback 失败且 A/B 当前版本均未被改写。

### FLOW-SKI-05：显式复制到另一个账号

1. 用户在 A 的 Skill 详情点“复制到账号”，只能选择自己名下的其他 active 账号。
2. 目标 B 无覆盖时，请求携带 `expectedTargetRevision: null`；同事务插入并在 B 留下首条历史。
3. B 已有覆盖时第一次请求返回冲突摘要和 B 当前 `rowRevision`，不覆盖；用户二次确认
   `replace + expectedTargetRevision` 后，同事务锁/CAS，B 旧值先入历史，再写复制值并追加新历史。
   若确认后 B 被 PUT/copy/claim 改过，CAS 失败并返回新摘要，禁止覆盖新值。
4. 复制只复制本地 overlay，不复制官方基座；因此 B 仍跟随当前官方/签名远程基座。

**Independent Test**：跨用户、归档账号、伪造账号均失败；`reject/replace` 两种冲突语义可验，
A/B 历史链均不丢。

## 4. 价值与可行性

### PR-FAQ

CreatorOS 现在让每个抖音号拥有真正独立的创作 Skill。过去切换账号只切内容数据，
写作方法却仍共用一份全局覆盖，矩阵账号容易互相“串人设”；升级后官方基座仍统一更新，
每个账号的风格、禁语、结构和版本历史则只属于自己。用户无需学习新入口，仍在原技能设置页编辑，
但页面会明确显示当前账号。存量用户会看到一次明确的旧 Skill 归属选择；CreatorOS 不会根据
账号数量、活跃状态或创建时间猜测，也不会复制给所有号。

FAQ：

1. **为什么不继续共用一份 Skill？** 因为多个抖音号本来就是不同人设，共用会把 A 的表达规则污染 B。
2. **迁移会不会丢掉以前的定制？** 不删除旧表。旧值先隔离，必须由用户选择归属账号。
3. **能不能把 A 的设置给 B 用？** 可以显式“复制到账号”；目标已有配置时先提示冲突并要求二次确认。
4. **需要重新配置所有号吗？** 只有承接旧定制或被明确复制的账号有覆盖，其他账号从官方默认开始。

### 替代品与切换

| 现状方案 | 哪里不行 | 切换触发器 | 切换成本 |
|---|---|---|---|
| 忍着全局共用 | 切号仍串风格，用户不知道污染来自哪里 | 发现 B 号生成带 A 号口吻 | 无学习成本，但持续返工 |
| 每次生成手写临时指令 | 容易漏写，异步任务不可追溯 | 高频矩阵运营 | 每轮重复输入 |
| 为每个号装一套 CreatorOS | 数据和更新分裂 | 串号损失高于维护成本 | 安装、迁移、更新成本高 |
| 本方案 | 一处安装内按号隔离 | 用户切号即可自然生效 | 一次升级迁移 |

### 被否决的形态

| 形态 | 否决理由 | 翻案信号 |
|---|---|---|
| 继续全局 Registry，仅切号时覆盖 | 并发请求会竞争同一可变态，仍可串号 | 产品永久单账号且无后台并发 |
| 为每个账号复制整套官方 Skill | 官方升级难合并，制造大量重复数据 | 官方 Skill 不再更新 |
| 建 user 级默认覆盖再叠 account 覆盖 | 当前需求只要求完全独立，增加继承歧义 | 用户明确需要“所有账号默认共用我的基础风格” |

### 五大风险

| 风险 | 判断与证据 | 最便宜检验 | 若错代价 |
|---|---|---|---|
| 价值 | 用户明确预期不同账号 Skill 隔离；上游多账号 SPEC 定义每号独立人设 | 双号设置/生成走查 | 持续串人设，核心飞轮失真 |
| 可用性 | 沿用设置页，仅增加当前账号提示，不新增配置入口 | 切号后 A/B 页面纸面与组件测试 | 用户误以为改的是全局 |
| 可行性 | RequestContext 已有 accountId；settings repo、版本表与 Prompt Registry 均有清晰接点 | 已执行最小 RAT；BUILD 再跑 PGlite 双号红测 | 运行时仍串号 |
| 商业 | 修复数据可信度，避免高频用户因串号弃用 | 上线后审计跨号错配反馈 | 用户不敢使用自动进化 |
| 依赖 | 显式 snapshot 是执行契约；Node `AsyncLocalStorage` 只在服务端进程内传递 | Node 25 定向测试与 production build | 浏览器 bundle 泄漏或上下文丢失 |

### 最小 RAT（2026-07-24，当场证据）

执行 Node 25 一次性脚本：100 个 A/B 交错 Promise 分别进入独立
`AsyncLocalStorage`，跨 `Promise.resolve + setTimeout` 后读取；同时把不可变 snapshot
JSON round-trip 并计算 SHA-256；迁移裁决函数验证单账号自动、多账号/无账号隔离。

```text
{"alsInterleavings":100,"accountA":50,"accountB":50,
"snapshotDigest":"fdf135d60926e80de52ce81300df4a7c21c124b401ea31257a075d176601d079",
"migration":{"single":"auto","multi":"quarantine","none":"quarantine"},"result":"PASS"}
```

这只证明 Node 运行时原语和裁决形态可行，不替代仓内 TDD、PGlite 迁移测试和 production build。

### 采纳门槛

| 旅程 | 步数 | 前置 | 失败提示 |
|---|---:|---|---|
| 当前号编辑 Skill | 3 | 已绑定并选中账号 | 未选号时提示“先选择创作账号” |
| 切号验证隔离 | 2 | 至少两个账号 | 读取失败显示错误，不回退另一账号 |
| 存量迁移 | 3 | 绑定至少一个 active 账号 | 旧值始终先隔离并要求明确选择 |

### 商业假设与 pre-mortem

商业假设：减少一次跨号串 Skill 就足以抵消本任务维护成本；上线后若仍出现任何可复现串号，
说明隔离架构失败，必须停止 Skill 自动进化入口并回 PLAN。

| 死因 | SPEC 级应对 |
|---|---|
| DB 隔离了但全局 Registry 仍串 | 本地覆盖只进 AsyncLocalStorage，不写全局 Registry |
| fire-and-forget 任务脱离账号上下文 | 分派时把 effective Skill snapshot 写入任务 input |
| 旧全局值复制到错误账号 | 不自动迁移；全部待用户显式选择，旧表保留 |
| 设置页读失败后展示另一号缓存 | 读取按 ctx account，失败显示错误/官方基座，不复用前号状态 |

**Appetite**：完整覆盖契约、持久化、运行时、设置页与测试；不以只改表或只改 UI 作为完成。

## 5. 功能需求

- **FR-SKI-01**：官方内置与签名远程 Skill 是共享只读基座。  
  价值注：删除后每个账号都要复制官方配置，升级与回滚失去单一真值。
- **FR-SKI-02**：本地 Skill 覆盖以 `(userId, accountId, skillId)` 唯一归属。  
  价值注：删除后不同账号仍会覆盖同一行。
- **FR-SKI-03**：list/get/put/history/rollback 必须要求有效当前账号并做账号过滤。  
  价值注：删除后可通过 API 读取或回滚其他账号 Skill。
- **FR-SKI-04**：本地覆盖不得写入进程级全局 Registry；每个异步上下文解析自己的 effective Skill。  
  价值注：删除后并发生成仍可能串号。
- **FR-SKI-05**：AI 分派保存 effective Skill 快照，后台任务只能从快照执行。  
  价值注：删除后在途任务会被后续切号或改 Skill 改写。
- **FR-SKI-06**：旧全局覆盖一律保持隔离，由用户显式选号认领；保留旧表、旧历史与迁移审计。  
  价值注：删除后用户会丢配置或所有账号被同一旧人设污染。
- **FR-SKI-07**：设置页明确当前账号，切号后重读该号覆盖与历史。  
  价值注：删除后用户无法判断正在修改谁的 Skill。
- **FR-SKI-08**：本任务提供同一用户 active 账号间显式复制；默认冲突拒绝，二次确认才替换；
  不增加隐式继承。  
  价值注：删除后“完全独立人设”会再次出现隐性共享。

## 6. 非功能需求

- **NFR-SKI-01 隔离**：双号 100 次交错读取/生成不得出现一次模板、工具或 schema 串用。
- **NFR-SKI-02 并发**：同进程并发任务使用不可变上下文；不得以“切号时清全局缓存”实现。
- **NFR-SKI-03 迁移**：迁移幂等；旧表不删除；重复执行不新增重复账号级行或历史。
- **NFR-SKI-04 可支持性**：日志包含 `accountId/skillId/baseVersion/overlayVersion/taskId`，
  不记录 prompt 正文；保留窗口沿现有 sidecar 日志策略。
- **NFR-SKI-05 性能**：单次解析最多读取当前账号的覆盖集合；允许进程内按
  `(userId,accountId,updatedAt)` 缓存，但失效必须精确到账号。
- **NFR-SKI-06 边界**：backend 是 schema/service 属主；frontend 仅走 contract；
  ai-worker 不读数据库，worker 写候选仍经 backend service。
- **NFR-SKI-07 完整性**：snapshot 使用 canonical JSON 计算 SHA-256；恢复时校验
  `schemaVersion/userId/accountId/skillIds/contentDigest`。缺失、账号不一致或摘要不一致一律失败，
  不回退官方基座或当前数据库值。
- **NFR-SKI-08 线性化**：AccountSkillOverride 增加从 1 开始单调递增的 `rowRevision`。
  PUT/copy/claim 都在数据库事务中锁定目标行并以调用方看到的 `expectedTargetRevision`
  做 CAS；`null` 只表示调用方确认目标不存在。唯一键竞争或 revision 不符返回 409 与最新摘要，
  不做 last-write-wins。

## 7. 领域模型

### ENT-SKI-01 OfficialSkillBase

`skillId`、`baseVersion`、`system`、`template`、`tools`、`requiredFacets`、`outputSchema`。
来源为代码内置或验签远程包，只读、进程共享。

### ENT-SKI-02 AccountSkillOverride

唯一键 `(userId, accountId, skillId)`；包含 `overlayVersion`、单调 `rowRevision`、可空覆盖字段、
`updatedBy/updatedAt`。账号归档后数据保留但不能作为当前账号读写。

### ENT-SKI-03 AccountSkillOverrideVersion

`id`、`userId`、`accountId`、`skillId`、完整覆盖快照、`createdAt`。
回滚本身创建新版本。

### ENT-SKI-04 EffectiveSkillSnapshot

持久化为：

```ts
type EffectiveSkillSnapshotV1 = {
  schemaVersion: 1;
  userId: string;
  accountId: string;
  resolvedAt: string;
  skills: Array<{
    skillId: string;
    baseVersion: string;
    overlayVersion: string | null;
    system: string;
    template: string;
    tools: readonly string[];
    requiredFacets: readonly string[];
    outputSchema: JsonSchema | null;
    completionPolicy?: unknown; // T-512 在其 SPEC 中细化
  }>;
  contentDigest: string; // 不含本字段的 canonical JSON 的 SHA-256
};
```

异步任务写入 `ai_tasks.input_data.skillSnapshot`。同步 chat/route 不落任务表，但入口同样必须先
显式解析 snapshot，再进入运行器。snapshot 数组允许一个工作流固定多个 Skill。

摘要规范固定为 **RFC 8785 JSON Canonicalization Scheme (JCS)**：

- 输入必须满足 I-JSON；禁止 `undefined`、`NaN`、`Infinity`、重复对象键和孤立 surrogate。
- 计算时先移除顶层 `contentDigest`，对象键按 RFC 8785 的 UTF-16 code unit 顺序，数字和字符串
  按 ECMAScript/JSON 序列化规则；所有数组（包括 `skills/tools/requiredFacets`）保持业务原顺序，
  不另行排序。
- 创建端与恢复端只调用 `contract` 包同一个 `canonicalizeEffectiveSkillSnapshot` 与
  `digestEffectiveSkillSnapshot` 实现，禁止各自实现。
- 固定向量：`{"schemaVersion":1,"userId":"u","accountId":"a","resolvedAt":"2026-07-24T00:00:00.000Z","skills":[]}`
  的 JCS UTF-8 字节必须得到预先锁定在 contract test fixture 的 SHA-256；fixture 由实现时
  使用第二个独立 RFC 8785 实现交叉生成并落盘，历史证据不足时不得预填结果。

## 8. 服务与运行时契约

### API-SKI-01..05

保持现有路径和响应外形：

- `settings.prompts.list`
- `settings.prompts.get`
- `settings.prompts.put`
- `settings.prompts.versions.list`
- `settings.prompts.rollback`

新增：

- `settings.prompts.copy`：body 为
  `{ skillId, targetAccountId, conflict: "reject"|"replace", expectedTargetRevision: number|null }`。
- `settings.prompts.legacy.list`：只列当前用户待归属旧值的元数据和摘要，不返回其他用户数据。
- `settings.prompts.legacy.claim`：body 为
  `{ legacyOverrideId, targetAccountId, conflict: "reject"|"keep_target"|"replace",
  expectedTargetRevision: number|null }`。

语义变更为全部要求 `ctx.accountId`，repository 查询条件必须同时包含
`user_id/account_id`。跨账号的 `versionId` 按不存在处理，避免泄露。

### Effective Skill 解析

```text
Official built-in
  ⊕ verified remote base
  ⊕ current account overlay
  = immutable EffectiveSkillSnapshot
```

- 远程基座可以继续在启动时写入共享 Registry。
- **唯一执行契约是显式 snapshot**：异步任务创建前解析并持久化；同步入口调用前解析。
- `AsyncLocalStorage` 只负责在一次已校验 snapshot 的服务端执行中，把不可变值传给深层
  `getTemplate/getTools/resolveOutputSchema`；它不是持久化或恢复真相。
- 运行器入口没有 snapshot、snapshot 账号与 `ctx.accountId` 不同、摘要不符或缺少所需 skillId
  时明确失败。不得静默回退官方基座或重新读取“当前”覆盖。
- 管理面读取官方基座使用独立 `getOfficialTemplate/listOfficialTemplates`，不调用运行态解析器。
- 所有 `runStructuredNode` 调用必须传 effective template，禁止绕回编译期常量。
- fire-and-forget 与重启恢复任务都只从 `ai_tasks.input_data.skillSnapshot` 装载。

### Skill 消费入口矩阵

| Skill/节点 | 入口形态 | snapshot 来源 | 验收 |
|---|---|---|---|
| `script.draft`、`topic.generate`、`research.gather` | ai-worker node；当前仍引用编译期常量 | task snapshot | 改为运行态解析；并发与改后不追溯 |
| `script.review`、`cover.brief`、`planning.*`、`platform.adapt`、`reconstruct.project` | backend 异步任务 | task snapshot | 每个 taskType→skillIds 映射契约测试 |
| `positioning.generate`、`topic.enrich`、`topic.preference`、`topic.attribution`、`benchmark.teardown`、`intelligence.topic-decompose` | backend 异步/编排任务 | task snapshot | 映射与恢复测试 |
| `material.match`、`favorites.triage`、`trend.extract`、`video.*` | backend 异步/编排任务 | task snapshot | 多 Skill 数组与恢复测试 |
| `chatbox.*`、chat 内 `calibration.diagnose/review.insights` | `/api/chat` 同步流 | request snapshot | 无 snapshot/错账号失败 |
| `knowledge.classify/distill/relate`、`comment.qa-sift` | Next 同步 route | request snapshot | 四条 route 逐项测试 |
| `calibration.*`、`review.insights` | task 与 chat 两类入口 | 各自 request/task snapshot | 两类入口各测 |
| `material-summary`、`transcript-postprocess`、`script-source-similarity` | 内联专用模板，不在 Skill Registry | 明确豁免 | 静态清单锁定，不冒充可配置 Skill |

Gate 增加静态扫描：生产代码中 Registry Skill 禁止直接传 `*_TEMPLATE`；所有
`getTemplate/getTools/resolveOutputSchema` 消费点必须位于 snapshot wrapper 覆盖的入口矩阵。

## 9. 信息架构

- **IA-SKI-01 设置 → 技能**：沿用现有页面，标题区显示“当前账号：@名称”。
- **IA-SKI-02 Skill 行详情**：继续编辑 system/template、查看版本；所有数据仅属当前账号。
- 未选号时不展示可编辑表单，显示“选择一个创作账号后才能定制 Skill”。

## 10. 现成方案与仓内复用

| 能力 | 候选 | 覆盖度 | 证据 | 决策 |
|---|---|---|---|---|
| 请求账号边界 | `RequestContext.accountId` | full | `contract/src/request-context.ts:14-31` | 复用 |
| 账号归属查询 | 各 per-account repository 的 strict account 范式 | full | `backend/src/modules/knowledge/knowledge.repository.ts:64-69` | 复用 |
| Skill 合并 | `SkillConfigOverride` + `overrideTemplatesFromConfig` | partial | `ai-worker/src/prompt/registry.ts:251-305` | 提取纯合并逻辑；不再把本地覆盖写全局 |
| 异步上下文传递 | Node `AsyncLocalStorage` | partial | `package.json:7-9` 要求 Node 25；`ai-worker/package.json:27-31` 声明 Node types | 仅作已校验 snapshot 的进程内载体 |
| 版本历史 | 现有 `skill_config_override_versions` | partial | `backend/src/schema/settings.ts:104-126` | 改账号级归属并复用回滚语义 |
| 真持久化 | Drizzle + Postgres/PGlite 同迁移 | full | `backend/drizzle/0013_skill_config_overrides.sql` | 采用；符合 PAT-002 RF-001/002/004 |

未采用额外 OSS：Node core 已有上下文载体，Drizzle/现有 Registry 已覆盖其余能力。反证搜索
`rg -n 'effective.*skill|skill.*snapshot|AsyncLocalStorage|runWith.*Skill|account.*skill' ai-worker/src backend/src frontend/src`
在本任务开工前无既有 effective Skill/snapshot 实现命中；因此没有可复用的第三方/仓内隔离层。

## 11. 现网事实

| 断言 | 证据 | 结论 |
|---|---|---|
| 当前覆盖不按 ctx 隔离 | `backend/src/modules/settings/settings.repository.ts:141-150` | 必须改 repository |
| 当前表无 user/account | `backend/src/schema/settings.ts:78-98` | 新建账号级表并迁移 |
| 本地覆盖当前读取全表写全局 Registry | `backend/src/modules/ai-runtime/skill-config-overrides.ts:117-150` | 本地覆盖改执行上下文 |
| 设置页已按 built-in × overrides 投影 | `frontend/src/features/settings/skills-data.ts:397-419` | 复用 UI 投影 |
| outputSchema 页面仍只读 | `frontend/src/features/settings/skills-section.tsx:298-325` | T-512 处理编辑能力；本任务保证归属 |
| 多账号 RequestContext 已落地 | `contract/src/request-context.ts:14-24` | 无需新账号体系 |

## 12. 完整目标与硬问题

| HARD ID | 难点 | 关联 | 解决阶段 | 工作包 |
|---|---|---|---|---|
| HARD-SKI-01 | DB 隔离后仍可能被全局 Registry 串用 | FR-SKI-04/05 | CONTRACT+BUILD | PKG-SKI-RUNTIME |
| HARD-SKI-02 | 旧全局行没有可靠 account_id | FR-SKI-06 | CONTRACT+BUILD | PKG-SKI-MIGRATION |
| HARD-SKI-03 | chat、同步 route、异步 task 有多种入口 | FR-SKI-04/05 | CONTRACT+BUILD | PKG-SKI-ENTRYPOINTS |
| HARD-SKI-04 | 版本回滚跨号越权 | FR-SKI-03 | CONTRACT+BUILD | PKG-SKI-PERSISTENCE |

## 13. 假设

- **ASM-SKI-01**：一个本地数据库仍对应一个 CreatorOS 用户；`updated_by` 通常能对应该用户。
  若未来支持多用户共享 DB，迁移必须按 user 分组，不能使用“唯一用户”退化。
- **ASM-SKI-02**：Node 25 的 AsyncLocalStorage 会覆盖当前桌面 sidecar 与 Next 服务端 runtime；
  已通过最小 RAT，production build 与 typecheck 是仓内确认触发器。
- **ASM-SKI-03**：`updated_by` 只能证明用户，不能证明账号；即使该用户恰好一个 active 抖音号，
  也不能证明历史上没有归档/失效账号。因此所有旧覆盖都必须由用户选择，不自动归属。

## 14. 验收标准

- **TEST-SKI-01**：A PUT 后 A GET 命中，B GET 404/list 无该行。
- **TEST-SKI-02**：A/B 同 skill 分别有不同 system/template/tools/schema，并发执行 100 次零串用。
- **TEST-SKI-03**：A 不能读取、回滚 B 的历史版本。
- **TEST-SKI-04**：未选账号访问五个 prompt API 均明确失败，不回退全局。
- **TEST-SKI-05**：单号、0/多账号、`1 active + 1 archived`、失效后新绑号都 pending；
  显式 claim 后当前值和全部旧历史数量/内容一致且可回滚；迁移重跑不重复。
- **TEST-SKI-06**：官方远程基座更新仍对无本地覆盖账号生效；A 本地覆盖锁不影响 B。
- **TEST-SKI-07**：切号刷新设置页后“已定制”徽章、内容和历史均属于新账号。
- **TEST-SKI-08**：入口矩阵每一行至少一条动态测试；taskType→skillIds 全映射测试；静态扫描无
  Registry Skill 编译期常量绕过、无未包 snapshot 的运行态解析。
- **TEST-SKI-09**：异步任务分派后修改 Skill，已分派任务仍使用原 snapshot。
- **TEST-SKI-10**：snapshot 缺失、账号不符、schemaVersion 不支持或 digest 不符均失败，
  不回退当前 DB/官方基座。
- **TEST-SKI-11**：同用户 A→B copy 的 `reject/replace`、跨用户/归档目标失败与历史链正确。
- **TEST-SKI-12**：PUT/copy/claim 共用 `rowRevision` CAS；确认后目标被修改、双 replace、
  claim 与 PUT barrier 交错均不覆盖未确认版本。
- **TEST-SKI-13**：创建端与恢复端对 RFC 8785 固定向量、中文/emoji、对象乱序、数组保序输出
  同一 digest；非法 I-JSON 明确失败。
- **TEST-SKI-14**：backend/ai-worker/frontend typecheck、相关测试、production build、boundary、
  orphan scan、reconcile 全部通过。

## 15. 成功信号

| 类型 | 指标 | 阈值与时点 | 低于阈值触发 |
|---|---|---|---|
| 北极星 | 可复现跨号 Skill 串用次数 | 发布后 14 天 = 0 | 回 PLAN，暂停自动进化 |
| 护栏 | 存量用户 Skill 定制丢失反馈 | 发布后 14 天 = 0 | 启用旧表恢复并修迁移 |
| 护栏 | Skill 设置/生成错误率 | `settings.prompts.*` 非 2xx + AI task `failed` 中 `skill_snapshot_*` 事件数 / 对应调用数；发布前连续 7 天为基线，发布后第 1/3/7/14 天检查，任一滚动 24h 高于基线绝对值 0.5 个百分点即失败 | 回滚账号覆盖解析 |

## 16. Out of scope

- 不增加团队多人权限。
- 不实现 T-335 的通用文件导出/导入、团队共享和第三方 Skill 注入审查；T-513 只实现同一用户
  已绑定 active 账号间的显式复制。
- 不在本任务定义 T-512 的具体脚本完整性字段；但存储与快照必须为其预留账号级归属。
