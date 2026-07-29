# T-599 CONTRACT 独立评审

- review_mode：independent product + architecture contract review / Round 2 targeted re-review
- model：GPT-5.6 Codex
- review_date：2026-07-29
- reviewed_contract_sha256：`006460bcc0f1ebaa2458d0b7bcf40e11b283743098e768ccec4f10e537c5cf86`
- verdict：**PASS**
- finding_count：blocker 0 / major 0 / minor 0
- build_allowed：**true**

本评审只核验已确认的 FR-SCHED-001..007、其数据归属与既有代码路径；没有追加多平台排期、具体时分、自动发布、通知或新公开 operation。

## Gate 判定（Round 1 历史）

| Gate | 判定 | 依据 |
|---|---|---|
| 03 Scope budget | **FAIL** | CONTRACT §2 的逐项计数为新域 0 / 新表 0 / 变更 operation 5 / role 0，未触发 `0/2/6/1` 线；但 Gate 03 要求的 `orchestrator/SCOPE_LEDGER.md` T-599 增量行缺失，现有账本仅有 T-534、T-537、T-595，故不能记录为 PASS。 |
| 12 Service contract | **FAIL** | M-599-01 的 dashboard 时区执行上下文未进入未变的 `pages.dashboard.get`，M-599-02 的历史回填缺少同 user/account 的安全谓词，M-599-03 未把发布中心真实读路径、错误隔离与批量界限合同化；因此页面、服务与存储不能据合同一致实现。 |
| 15b Contract completeness | **FAIL** | 虽然 §11 为全部 FR 填写了 feasible 行，且 §4 已给出主要请求、权限、错误和幂等规则，但三项 major 仍令日期-only、双账号回填、发布中心/首页读回的完整数据路径不可验证。 |

## Findings（Round 1 历史）

### M-599-01

- severity：major
- category：日期-only / timezone 数据路径
- evidence：CONTRACT §4 `timezone` 只在 create/update 请求与 `assertSchedulableDate` 中定义（[contract.md:147](/Users/zyongzhu/Workbase/Thirdspace-creator/docs/superpowers/specs/2026-07-29-project-publishing-schedule.contract.md:147)、[contract.md:258](/Users/zyongzhu/Workbase/Thirdspace-creator/docs/superpowers/specs/2026-07-29-project-publishing-schedule.contract.md:258)），但 `pages.dashboard.get` 保持无参，§5 的 `listActiveProjectSchedules` 也没有 timezone 输入或解析来源。现有 dashboard composer 只把原 `ctx` 传给依赖（[query-services.service.ts:80](/Users/zyongzhu/Workbase/Thirdspace-creator/backend/src/modules/query-services/query-services.service.ts:80)），而既有日历页面把宿主本地日期与 UTC 月窗混用（[content-calendar-page.tsx:140](/Users/zyongzhu/Workbase/Thirdspace-creator/frontend/src/features/content-calendar/content-calendar-page.tsx:140)）。这不能证明 UTC-8、UTC+8/14 与 DST 时“今天、逾期、临近、月窗”按同一个 IANA 时区计算。
- suggestion：在 CONTRACT 固定一个不新增公开 operation 的 `effectiveTimezone` 解析来源、合法性和失败策略；将它明确线程到月窗、`today`、逾期/reconcile、dashboard 派生与测试时钟。`plannedDate` 仍是唯一展示/比较值，`plannedAt` 只保留兼容锚。补 UTC-8、UTC+14、DST 边界的 create/list/dashboard/missed 回归。
- risk_disposition：未处置；会把同一 `YYYY-MM-DD` 在三个表面判成不同日期或错发提醒，直接违背 FR-SCHED-002 与 NFR-SCHED-002。

### M-599-02

- severity：major
- category：迁移回填 / 项目归属与隔离
- evidence：CONTRACT §7 只以 `content_output_id → content_outputs.project_id` 和“同项目无多条 active”决定补 `project_id`（[contract.md:293](/Users/zyongzhu/Workbase/Thirdspace-creator/docs/superpowers/specs/2026-07-29-project-publishing-schedule.contract.md:293)），没有要求 entry、output、project 同时满足相同 `user_id` 与 `account_id`。但项目和 publication 都是严格 account scoped（[projects.ts:13](/Users/zyongzhu/Workbase/Thirdspace-creator/backend/src/schema/projects.ts:13)、[publishing.repository.ts:316](/Users/zyongzhu/Workbase/Thirdspace-creator/backend/src/modules/publishing/publishing.repository.ts:316)）；现有 calendar create 也只校验 candidate，并不校验 output/project 归属（[content-calendar.service.ts:264](/Users/zyongzhu/Workbase/Thirdspace-creator/backend/src/modules/content-calendar/content-calendar.service.ts:264)）。单列 FK `project_id → projects(id)` 不能补足联合租户约束。
- suggestion：把回填 eligibility 收窄为：entry 的 `(user_id, account_id)` 与 output 所属 project 的 `(user_id, account_id)` 完全相等，且输出到项目链唯一、无 active 冲突；不满足任一条件一律保留 `project_id=NULL` 并标“待整理”。迁移测试必须构造同 user 跨账号和跨 user 的旧 output entry，断言都不补链；新写路径同样经 ProjectsSchedulePort 做联合归属校验。
- risk_disposition：未处置；历史脏链可能生成跨账号项目入口、提醒或发布事实，违背 FR-SCHED-003/004 与 NFR-SCHED-001。

### M-599-03

- severity：major
- category：发布中心真实读路径 / N+1 / 失败隔离
- evidence：CONTRACT 只写“calendar list + 真实 publication composition”（[contract.md:344](/Users/zyongzhu/Workbase/Thirdspace-creator/docs/superpowers/specs/2026-07-29-project-publishing-schedule.contract.md:344)），没有规定发布中心月窗的批量读取边界、项目/发布事实映射、标题/封面/指标失败的返回状态。现有装配器为每个项目读 outputs、每个 output 读 publications（[publishing-center-data.ts:339](/Users/zyongzhu/Workbase/Thirdspace-creator/frontend/src/features/publishing-center/publishing-center-data.ts:339)），再为每个 publication 读 revision 与 analytics（[publishing-center-data.ts:375](/Users/zyongzhu/Workbase/Thirdspace-creator/frontend/src/features/publishing-center/publishing-center-data.ts:375)），规模为 `1 + P + O + 2U`；任一 output 失败当前直接变成空数组（同文件:350、369），会把“读取失败”伪装为缺少历史。仓内已经有项目批量 output reference port（[projects.service.ts:335](/Users/zyongzhu/Workbase/Thirdspace-creator/backend/src/modules/projects/projects.service.ts:335)）与 publication 按 outputIds 批量读能力（[publishing.repository.ts:316](/Users/zyongzhu/Workbase/Thirdspace-creator/backend/src/modules/publishing/publishing.repository.ts:316)），但 CONTRACT 没有把它们或等价内部组合约束为实现责任。
- suggestion：在不新增公开 operation 的前提下，为 `/publishing?month=` 明确一个内部 page-composition read：按当前 `(userId, accountId)` 批量取得该月 calendar、真实 publication、project/output 映射及右侧汇总所需投影；禁止 per-project/per-output/per-publication 扇出。分别定义“日历失败”和“表现失败”的可见错误/重试 DTO，绝不把失败折叠成空数据或 fixture；以高密月份夹具断言读取次数有常数上界。
- risk_disposition：未处置；发布中心在真实历史增多时退化，且失败会被错误呈现为 0/空，违反 FR-SCHED-005、NFR-SCHED-003 和“诚实置 0”的前提（错误不是 0）。

### m-599-04

- severity：minor
- category：Gate 03 审计证据
- evidence：CONTRACT §2 已有计数表（[contract.md:29](/Users/zyongzhu/Workbase/Thirdspace-creator/docs/superpowers/specs/2026-07-29-project-publishing-schedule.contract.md:29)），但 `orchestrator/SCOPE_LEDGER.md` 没有 T-599 行；Gate 03 的 Evidence Required 要求逐项计数加 ledger 增量。
- suggestion：作者在控制面补一条 T-599 ledger 行，记录 `0/0/5/0`、无 `[REV-ADD]` 与“未触发”结论；不需要修改确认范围。
- risk_disposition：未处置；这是流程审计缺口，不单独改变产品行为，但它阻止 Gate 03 PASS。

## 已核对且无需扩大范围的正向事实

- `plannedDate` wire 必有、`plannedAt` 兼容锚、partial unique、项目入口、公共 transition 禁止手工 `published`、Dashboard 配额与派生不可完成的方向均已写入合同（§3--§7）。
- 既有公开 transition 当前确实允许 `planned → published`（[content-calendar.service.ts:437](/Users/zyongzhu/Workbase/Thirdspace-creator/backend/src/modules/content-calendar/content-calendar.service.ts:437)），因此 CONTRACT 对该旁路的收窄是必要且在确认范围内；BUILD 必须用真实 publication fact 替代它，不能仅改 UI。
- 本次只读验证命令：`pnpm --dir contract test -- --run tests/modules/content-calendar.test.ts tests/pages/dashboard.test.ts tests/registry.test.ts`，观察结果为 26 files / 141 tests PASS。它证明当前基线可解析，但尚不包含 T-599 的新 contract/迁移/时区/N+1 验收，不能作为 Gate 12/15b PASS 证据。

## Round 1 结论（历史）

在 M-599-01..03 及 Gate 03 ledger 证据关闭前，CONTRACT 不能进入确认②，`build_allowed=false`。最小修订应只补齐现有项目排期、calendar、publishing、dashboard 的内部数据契约与测试责任；不得以新增产品能力、公开 endpoint 或第二套排期真相来解决这些问题。

---

## Round 2 定向复评

- review_scope：仅复核 M-599-01..03、m-599-04 与 Gate 03/12/15b；未新增范围。
- reviewed_contract_sha256：`90f50143329078b88b8f1a405bcfdc41231cbfa822eff2e1956950101c2e4d0c`
- round_verdict：**PASS**
- open_findings：blocker 0 / major 0 / minor 0
- build_allowed：**true**

### Gate 判定（Round 2）

| Gate | 判定 | 复核证据 |
|---|---|---|
| 03 Scope budget | **PASS** | CONTRACT §2 已更正为 6 个变更公开 operation（calendar list/create/update/delete/transition + dashboard DTO），恰在 `≤6` 线内；`orchestrator/SCOPE_LEDGER.md` 已新增 T-599，记录 `0/0/6/0`、无 `[REV-ADD]` 与未触发结论。内部 `IdentityTimezonePort` 和 `PublishingCenterMonthProjectionPort` 明确不进 registry，不是公开 operation。 |
| 12 Service contract | **PASS** | §3/§4 补齐 `scheduleReminderReadState`、完整成功/重复行为与 operation 错误闭集；§5.1 固定 identity→IANA→UTC fallback 的单一 timezone runtime consumer，§5.2 固定内部 batch projection、归属和局部失败状态；§7 用联合 user/account 谓词收紧回填。所有变更均保持既有 endpoint/服务端口边界。 |
| 15b Contract completeness | **PASS** | FR-SCHED-001..007 的 feasible 行保持完整；项目排期写/读、旧数据回填、真实 publication fact、Dashboard 派生和发布中心月度读回均已有 source、owner、错误、状态/幂等或失败降级约束。§12 列出相应 contract/DB/service/dashboard/UI 验证责任。 |

### Round 1 finding disposition

| Finding | 结果 | Round 2 证据 |
|---|---|---|
| M-599-01 date-only + timezone | **resolved** | §5.1 定义唯一 `CalendarRequestContext`：`users.timezone` 为来源，IANA 校验，缺失/非法统一降级 UTC，且 create/update、month window、publishedAt 日归桶、Dashboard 与 missed reconcile 都消费它；`plannedAt` 被明确排除出日期比较。 |
| M-599-02 迁移回填与归属 | **resolved** | §7.3--7.4 要求 entry、output/promotion、project 的 `user_id` 和 `account_id` 全相等；跨 user、同 user 跨账号、冲突链和多 active 均保持 `project_id=NULL`。这与项目/发布现有 account-scoped repository 模式一致。 |
| M-599-03 发布中心 N+1 / 失败隔离 | **resolved** | §5.2 定义 `PublishingCenterMonthProjectionPort`、单次月读取 `<=6`、禁止 per-project/output/publication 扇出，利用既有 `listOutputRefsByProjects` 和按 outputIds 的 publication batch read；calendar/performance 各自 `ready|error`，真实空数据与失败严格区分。 |
| m-599-04 Gate 03 ledger | **resolved** | `orchestrator/SCOPE_LEDGER.md` 已有 T-599 账本行，且 operation 计数已从 5 校正为 6。 |

### 代码与测试交叉核对

- 用户 identity 现有 `timezone` 字段可作为所指定的唯一来源；修订没有把浏览器时区或请求参数误变成第二份真相。
- 既有 `ProjectsService.listOutputRefsByProjects` 和 Publishing 的 `listPublicationsByOutputIds` 提供了批量投影可复用的服务边界；合同禁止跨模块 repository import，符合物理架构。
- Round 1 已观察到的 `content-calendar` 公开 `planned → published` 旁路，在 Round 2 的 §4/§5 中仍被明确收窄为仅内部 publication reconcile；没有恢复假发布路径。
- 本轮为合同定向复评，未把尚未实现的 T-599 BUILD 测试伪造为已发生证据。Round 1 的基线命令 `pnpm --dir contract test -- --run tests/modules/content-calendar.test.ts tests/pages/dashboard.test.ts tests/registry.test.ts` 仍仅证明现有 26 files / 141 tests 通过；§12 的 T-599 测试必须在 BUILD 实施后作为新的 Gate 证据运行。

### Round 2 结论

Round 1 的 blocker/major/minor 均已以最小合同修订关闭，且没有新公开 operation、第二份排期真相或超出确认范围的产品能力。CONTRACT 可进入用户确认②并授权后续 BUILD；实际 BUILD 仍须先落实 §12 测试、迁移与边界 Gate，不能将本次合同 PASS 误写成实现或真机验收 PASS。

---

## Round 3 metadata-only hash verification

- review_scope：只核验 Round 2 后的 CONTRACT 元数据同步；不重新打开业务正文或新增范围。
- reviewed_contract_sha256：`e096447b61b9d1c14f335b88b32744e3cff286721015ec9193c7f34f5de2ace8`
- verification：CONTRACT 顶部已从“待 Round 2 复评”更新为“Round 2 PASS、待用户确认②”；Round 2 的业务锚点保持不变：operation=6、`scheduleReminderReadState`、identity 单一时区、联合 user/account 回填、`PublishingCenterMonthProjectionPort`、`<=6` 批量上界与 Scope Ledger `0/0/6/0` 均仍存在。
- current_verdict：**PASS**
- build_allowed：**true**

本轮仅更新 hash 收据与状态说明。合同尚处在用户确认②之前；`build_allowed=true` 表示 CONTRACT Gate 已允许进入后续授权流程，不代表已获用户 BUILD 授权，更不代表实现或真机验收已完成。

## Round 4 metadata-only hash verification

已核对 CONTRACT 顶部状态现为“用户于 2026-07-29 确认②，BUILD 已授权”；Round 2 业务锚点未变。已审工件 hash 更新为 `f47d9265eb8f65b15634856f3a9a275fe3a33fcdabbef0b6d526f050f6195ab6`。这不是新的业务评审轮；current verdict 仍为 **PASS**，`build_allowed=true`。

## Migration-number coordination hash verification

已定向核验：迁移目标仅从 `0060_project_schedule_calendar.sql` 顺延为
`0061_project_schedule_calendar.sql`；共享工作树确有 `0060_retire_self_detail_automation.sql`，且
`DEC-SCHED-002` 明确记录该编号协调。`planned_date/project_id`、联合 user/account 回填条件、FK、partial unique、窗口索引及不删除旧字段的约束保持不变。已审工件 hash 更新为 `006460bcc0f1ebaa2458d0b7bcf40e11b283743098e768ccec4f10e537c5cf86`；current verdict 仍为 **PASS**，`build_allowed=true`。
