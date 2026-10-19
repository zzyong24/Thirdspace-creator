# T1089 SPEC 独立评审

- 评审类型：`initial`
- 评审方式：只读；未修改仓库、产品、测试、数据库或任务状态
- 候选 HEAD：`b75eb8dad4aa4953f15ead5ff259bbec3af05071`
- SPEC：`docs/features/t1089-legacy-source-ownership-repair.md`
- SPEC SHA256：`dd8bf57f5f190db9a21de88314e13d359927504e31d99e5f5c859d45f12af309`
- 宪法：`docs/产品定位.md`
- 宪法 SHA256：`86bc2c8add6a01ebf5b2ecf9de05d448770ca14a4e0bdbbf376fffc6387e3800`
- 技能版本：本地与项目均为 `3.29.0`
- 评审结论：无 blocker / major / minor finding；可提交 `reviewctl` 裁决。

## 结论

T1089 的问题、归属证明、迁移行为、锁协议、版本装配、写集和验收已收敛到可实施程度。方案只给能以同 user、真实 account、真实 initial group/member 和完整父链证明的旧 NULL 来源补 `group_id`，不新增组、成员、别名或读取权限；无法证明、已转组、多义、冲突及未知结构继续保持原拒绝或 NULL。

该方案不修改旧任务、消息、payload、digest、task ID、账本、费用、租约、期限和状态，也不自动解封 cancelled、unknown、awaiting 或失效成员版本。来源修复与旧任务恢复分别有明确验收，避免把“能读来源”扩大成“重建任务”。

## 可实现性核对

### 数据归属

- 项目会话继承真实项目父归属；项目仍为 NULL 时不会单独提升子会话。
- 无项目会话只接受唯一、当前、version 1、无转组历史的真实 initial member 与 active initial group。
- 文章和图文 anchor 同时验证 output、project、artifact、类型、user/account 和非 NULL 父归属一致性，不仅凭 `project_id` 升组。
- `grp_legacy_*` 只作为已由真实 account/group/member 证明的 canonical 身份使用，不以字符串前缀产生 authority。

这些约束足以防止把当前 membership 错投到旧来源，也不放宽现有 owner、workspaceFilter 或 Worker 权限。

### 锁与迁移

0130 将函数/trigger DDL、全部表锁/行锁和三表回填放在同一 PL/pgSQL `EXCEPTION` 子事务中。仅 `55P03` 回滚整轮并在块外等待后重采；其它结构错误、SQL 错误、取消和 `40P01` 保持失败。规格还要求：

- authority 表先取 `TABLE SHARE NOWAIT`；
- parent 表取 `TABLE ROW SHARE NOWAIT`；
- group 和 parent 行按稳定顺序 `FOR SHARE NOWAIT`；
- 三来源表按固定顺序取 `SHARE ROW EXCLUSIVE NOWAIT`；
- 获得来源表锁后重新扫描候选、补齐父锁，再锁来源行并最终重验。

这与实际锁探针的结论一致：错误 DDL-first 顺序会形成 `40P01`，而 NOWAIT 失败必须依赖子事务回滚释放本轮已取锁。规格没有把 startup advisory lock 冒充业务互斥，也没有承诺静态无饥饿。

### 版本与 lineage

正常 journal 只追加 idx 104、tag `0130_legacy_source_ownership`、when `1791043200003`；0130 需要真实 0128/0129 前置回执。migration convergence 必须识别唯一 SQL/hash、固定 105 尾并保留旧 104 前缀，未知 future、缺前置、hash/SQL 漂移继续拒绝。fresh、104 升级、旧 lineage、二次启动与 reference catalog 都有明确验收，未要求重放或修改旧迁移。

## 证据边界

- 公开 resolver RED 证明 account-only 合法入口能生成三类 NULL 来源；它是合成 PGlite 诊断，不是 HTTP、Worker 或旧任务恢复 Gate。
- PG 两连接锁探针证明错误锁原语会死锁及 savepoint 回滚的锁释放行为；它不代签最终 0130。
- `legacy-lock-review.md` 是源码锁审，不是正式 SPEC PASS。
- 当前没有执行产品迁移、用户数据库、模型或安装验收。

## 写集与验收建议

产品三路径与两个新测试文件足以作为初始精确写集。验收列应为非 UI `—`；本任务没有页面或主要 UI 旅程。

规格已正确要求原 migration-convergence、workbench-main-migration、creative-canvas lineage 等回归。如果实际实现后某个既有测试因 104→105 的尾部预期必须改字节，应先把那个**精确测试路径**加入范围并独立复核，保留未知 identity、SQL 保真、future 与 drift 拒绝断言。现在没有确定证据要求预先扩张写集。

## reviewctl 输入

同目录 `t1089-spec-review-input.json` 符合 `spec-review-round/v2` initial 结构，finding 为空。Reviewer 没有执行 `reviewctl record`，也没有写任务状态或 Gate。


# T1089 SPEC 增量复核

- 复核类型：`recheck`，cycle 1 / round 2 候选
- 原回执：`PASS[REV:ecf84d18be49]`
- 原 SPEC SHA256：`dd8bf57f5f190db9a21de88314e13d359927504e31d99e5f5c859d45f12af309`
- 当前 SPEC SHA256：`329409f7243399404576a95b5b4d76e234997b88e5272b181f4f655ee087574c`
- 宪法 SHA256：`86bc2c8add6a01ebf5b2ecf9de05d448770ca14a4e0bdbbf376fffc6387e3800`
- 结论：原 round 1 无 finding；本次两处增量未引入新 finding。

## 增量核对

本轮只修改“冻结任务与恢复”及对应 RED/GREEN 第 3 项：

1. `SPEC-LINE:41:4c17714a5faf281e` 明确 canonical 冻结任务配 NULL conversation 时，原 host admission 已经拒绝，历史上尚无 Worker/工具请求，因此不能伪造旧 settled 回执。升级后只允许原任务 ID 首次准入和执行，允许必要的首次模型/工具请求，不新建消息或任务。
2. 同一行把真实可结算的历史状态拆成两族：NULL+account 来源按 legacy filter 原可读；以及 canonical conversation 合法、仅文章/图文 anchor 为 NULL。两族才要求升级后原回执回放、completion 和同 key replay零新增。
3. `SPEC-LINE:78:d76e0ddafb9fa6d7` 将三族落实到 104→105 正常 migrator 验收，要求分别记录模型/工具计数，并禁止手改冻结字段制造测试族。

该修订与现有工厂/host admission 的真实可达状态一致，关闭了“为不可达历史状态构造 settled 回执”的证据错误。它没有扩大产品行为，也没有放宽 owner、lease、membership、stale epoch 或任务状态约束。

## 保持不变的关键边界

- 0130 迁移本身仍只修改三类来源的 `group_id`。
- `ai_tasks` / `execution_tasks` 的 group、version、epoch、payload、digest、task ID、source metadata、已结算账本、费用、租约和期限不变。
- 第一族执行后的状态变化只能由原服务首次执行产生，不能归因于迁移。
- cancelled、unknown、awaiting、成员版本失效和冻结 scope 不符仍不得借回填解封。
- 原数据归属证明、NOWAIT 子事务锁协议、journal 105 尾、旧 lineage 保真、非 UI 验收和精确写集均未改变。

## reviewctl 处理建议

`reviewctl context T-1089` 返回 previous round 1 / PASS，并提供两条合法 `changed_line_refs`。因此本文件旁的 `t1089-spec-recheck-input.json` 应作为同一 cycle 的 round 2 `recheck` 输入；不需要新 cycle，也不应重置既有回执历史。Reviewer 未执行 `reviewctl record`、未修改 BACKLOG、事件或任务状态。


# T1089 父链稳定性增量复核

- 复核类型：`recheck`，cycle 1 / round 3 候选
- 上一轮：round 2 `PASS`
- 上一版 SPEC SHA256：`329409f7243399404576a95b5b4d76e234997b88e5272b181f4f655ee087574c`
- 当前 SPEC SHA256：`cd23b99741904335979c5694f9fc90799deb7ec02de7ea26605b3b069a660697`
- 宪法 SHA256：`86bc2c8add6a01ebf5b2ecf9de05d448770ca14a4e0bdbbf376fffc6387e3800`
- 结论：本轮单行锁协议修订未引入 finding。

## 增量核对

唯一变化为 `SPEC-LINE:49:286f137b7ee01051`：`projects / content_outputs / artifacts` 的表级预锁从 `ROW SHARE NOWAIT` 提升为 `SHARE NOWAIT`。

原 `ROW SHARE` 不阻止普通 `INSERT`。即使迁移第二次扫描并锁住当时存在的父行，另一个事务仍可在最终 authority 证明前插入此前缺失的父记录，使候选集合与父链闭包发生 phantom。`SHARE` 与普通 DML 取得的 `ROW EXCLUSIVE` 冲突，因此能稳定这三张父表的 INSERT、UPDATE 和 DELETE 窗口。

该提升不取消原有行级证明：迁移仍按稳定顺序对实际 project、output、artifact 执行 `FOR SHARE ... NOWAIT`，并在更新来源前重新验证完整父链。`FOR SHARE` / `FOR UPDATE` 所需的表级 `ROW SHARE` 与已经持有的 `SHARE` 兼容，不会因为同事务继续取得行锁而自冲突。

当既有父写事务或显式归组持有冲突锁时，`NOWAIT` 产生 `55P03`，仍由同一 `EXCEPTION` 子事务回滚本轮全部表锁、行锁、DDL 和 DML；块外等待后重新采集。没有新增生产执行上限、等待吞错、任务重发或 owner 权限。

## 保持不变的边界

- 产品仍限原 3 路径，测试仍限 2 个新文件；无 scope 扩张。
- authority 表与 group 行锁序、三来源表 `SHARE ROW EXCLUSIVE NOWAIT`、来源行最终 `FOR UPDATE NOWAIT` 不变。
- 只更新合法三来源的 `group_id`；任务、payload、digest、版本、状态和账本不变。
- 短暂阻止父表 DML 是迁移闭包所需的临时屏障，不成为运行期 owner 或 API 行为。

## 证据边界

旧 SQL SHA `afbe…` 的 14 个 migration GREEN 与 1 个 frontend GREEN 只能证明旧字节，不能代签此次锁模式变化后的新 SQL/hash。新实现必须重新运行相关 migration、104→105、旧 lineage、公开恢复测试及真实 PG 两连接竞争；本报告只批准规格中的锁约束，不声明实现或回归通过。

`reviewctl context T-1089` 返回 previous round 2 / PASS，并提供上述唯一合法 changed-line ref。旁附 input 应作为 cycle 1 round 3 `recheck` 使用。Reviewer 未执行 record、未改看板或状态。
