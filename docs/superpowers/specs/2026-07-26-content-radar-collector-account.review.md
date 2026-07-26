# T-537 PLAN + CONTRACT 独立产品/架构评审

> 日期：2026-07-26
> 角色：独立产品负责人 + 系统架构 reviewer
> `review_mode`：`homogeneous`
> 模型：`gpt-5.6-sol`（独立子代理）
> WARNING：这是同模型新上下文评审，弱于跨家族 reviewer；结论只依据仓内代码、控制工件、T-502 RAT 与两份被审工件，不采信作者自评。
> 写入边界：本轮只新增本 review；未修改 PLAN、CONTRACT、BACKLOG、manifest 或代码。

## 1. 评审范围与阶段路由

被审工件：

- PLAN：`docs/superpowers/specs/2026-07-26-content-radar-collector-account.md`
- CONTRACT：`docs/superpowers/specs/2026-07-26-content-radar-collector-account.contract.md`

代码事实范围：

- `contract/src/resources/intelligence.ts`
- `contract/src/operations/intelligence.ts`
- `contract/src/resources/platform-accounts.ts`
- `contract/src/operations/platform-accounts.ts`
- `backend/src/schema/intelligence.ts`
- `backend/src/schema/platform-account.ts`
- `backend/src/modules/intelligence/`
- `backend/src/modules/platform-account/`
- `backend/src/modules/execution/persistent-task.service.ts`
- `frontend/src/server/intelligence/`
- `frontend/src/server/persistence-client.ts`
- `frontend/src/features/intelligence/intelligence-workbench.tsx`
- `docs/research/2026-07-24-favorites-dual-account-readonly-rat.md`

阶段路由：

```text
Current stage: 1-plan
Status: draft
Required artifacts: PLAN + 独立评审 + 用户确认①
Upstream dependencies: 用户确认的三类内容雷达来源范围、T-502 双账号 RAT
Gate: fail
Confirmation required: yes，但 blocker 关闭前不能把确认①记为 passed
Invalidates: 当前 CONTRACT 只能作为待修草稿，不能签核
Next action: revise + rerun RAT + re-review
```

`orchestrator/process/.skill-version` 与当前技能 `VERSION` 均为 `3.6.20`，没有流程版本漂移。

## 2. Verdict 与计数

| 工件 | Verdict | blocker | major | minor | Gate 结论 |
| --- | --- | ---: | ---: | ---: | --- |
| PLAN | **FAIL** | 1 | 2 | 0 | Product Gate 不通过；不得确认①，不得进入 BUILD |
| CONTRACT | **FAIL** | 3 | 7 | 0 | 上游 PLAN 未通过，且 service-contract / contract-completeness 均不通过 |

## 3. PLAN findings

### `PLAN-B1`：把真实双账号 RAT 从开工前 blocker 降成了 BUILD 完成条件

- **severity**：`blocker`
- **category**：`value-viability`
- **confirmed-FR impact**：`FR-537-01`、`FR-537-04`、`FR-537-06`、`AC-537-07`。如果第二个 active 账号不能读回不同稳定身份并产生可证明上游响应，产品的 owner/collector 分离核心场景没有可用数据源证据。
- **evidence**：
  - `docs/research/2026-07-24-favorites-dual-account-readonly-rat.md:6` 的真实结论是 `BLOCKED`：两个 active 注册记录中只有一个能读回稳定身份。
  - 同一 RAT 的“阻塞与恢复条件”明文写着“当前不能进入 Contract/Build”，并要求两个 active profile 分别读回不同身份、owner=A/collector=B 获得可证明上游响应。
  - PLAN `HARD-537-01` 却把解决时点写成 BUILD E2E；CONTRACT 最终又写成只阻断 BUILD 完成/发布。
  - Product Gate 规定“若错致命且半天内可验”的 RAT 必须在 PLAN 签核前完成；不能把已有 FAIL/BLOCKED 记录改称普通 BUILD 验收。
- **suggestion**：先由用户恢复第二个账号登录态，按既有脱敏协议重跑最小只读 RAT：两个 active profile 读回不同稳定身份；owner 固定为 A，collector=B；至少对一条已确认来源取得可证明的成功上游 envelope，合法空结果必须带 `listValid` 等成功证据。RAT 未通过前 PLAN 保持 `blocked/FAIL`，不能开启整个 BUILD；通过后，完整三类来源、定时、异常和切换仍在 BUILD E2E 验收。
- **risk disposition**：`mitigate`。这是跨账号安全边界与核心数据源可行性，不能用 fixture、目录数量、空数组或“发布前再看”接受。

### `PLAN-M1`：`browserSessionRef` 的禁令越出了已确认的三类来源

- **severity**：`major`
- **category**：`scope-inflation`
- **confirmed-FR impact**：`FR-537-03` 只需要让 `creator_profile`、`favorites_folder`、`darkhorse_query` 改成客户端提交 `collectorAccountId`；扩大到 `web`、`rss`、分享链接或 browser-session 操作不是本任务验收所需。
- **evidence**：
  - PLAN §3 明确只有三类 source 可携带 collector，并把其他来源/任务排除在外。
  - PLAN `AC-537-02` 又笼统要求“客户端请求/响应、领域公开 DTO”均不含 `browserSessionRef`。
  - 当前 `web`/`rss` config 与 `previewWeb` 仍合法使用可选 `browserSessionRef`：`contract/src/resources/intelligence.ts:127-139`、`contract/src/operations/intelligence.ts:167-195`。
  - CONTRACT §1.3 的“客户端永远不提交”与 §2.1 的“web/rss 不变”直接冲突。
- **suggestion**：把 PLAN 和 AC 的禁令限定为“三个 login-collector config、主页预览、收藏夹列举及其 source 公开投影”。`web`、`rss`、分享链接和独立 browser-session API 保持现状；若未来要全域移除 session ref，放入 Future possibilities，另立任务确认。
- **risk disposition**：`avoid`。避免借安全措辞制造未经确认的跨来源 breaking change。

### `PLAN-M2`：任务与控制层引用不存在，九条 FR 没有仓内任务真相

- **severity**：`major`
- **category**：`traceability`
- **confirmed-FR impact**：`FR-537-01..09` 全部缺少从任务队列到阶段 Gate 的仓内追溯；后续不能合法 `taskctl start/complete`。
- **evidence**：
  - PLAN 元数据声称范围来源为 ``BACKLOG.md#T-537``。
  - 在当前独立 worktree 对 `BACKLOG.md`、`BACKLOG-archive.md`、`orchestrator/ARTIFACT_MANIFEST.yaml`、`TRACEABILITY_MATRIX.md`、`ID_REGISTRY.md`、`DECISION_LOG.md` 搜索 `T-537` 均无命中。
  - `BACKLOG.md` 是项目任务队列真相；不存在的锚不能作为用户确认或 Gate 证据。
- **suggestion**：由主代理按项目规则登记一条 T-537 BACKLOG 行，链接这两份工件，并把 FR/FLOW/ENT/IA/API/TEST 登入相应控制工件；不得由本 reviewer 越权手改状态，也不得把 review 文件当任务真相。
- **risk disposition**：`mitigate`。这是治理与审计缺口，不扩产品能力。

## 4. CONTRACT findings

### `CONTRACT-B1`：CONTRACT 的上游与数据源前置条件尚未成立

- **severity**：`blocker`
- **category**：`traceability`
- **confirmed-FR impact**：`FR-537-01/04/06/07`。确认②会预授权整个 BUILD；不能用一个已知 `BLOCKED` 的核心外部链路签发 scope envelope。
- **evidence**：
  - CONTRACT 元数据承认依赖 PLAN 独立评审与确认①，但当前 PLAN 是 draft，且 `PLAN-B1` 未关闭。
  - CONTRACT §6 同时写“BUILD 前完成 RAT”和“期限为 BUILD E2E gate 前”，§8/末段又写只阻断 BUILD 完成，三个时点互相矛盾。
  - `v3-2-contract` 的输入必须是已签核 PRODUCT_SPEC；状态机禁止从 draft/blocked 上游进入实现。
- **suggestion**：在 RAT PASS 和 PLAN 确认①之前把 CONTRACT 保持 draft/blocked；统一时点为“RAT PASS 才允许整个 BUILD 开工”。BUILD 内 E2E 仍需覆盖三类来源、首次/手动/schedule、登录过期、验证码、锁与切换，不把前置 RAT 冒充完整 E2E。
- **risk disposition**：`mitigate`。不接受将真实账号链路缺失后移。

### `CONTRACT-B2`：archive/claim 竞态的“account version CAS”在现有模型中不存在，也没有定义线性化顺序

- **severity**：`blocker`
- **category**：`approach`
- **confirmed-FR impact**：`FR-537-06`、`FR-537-07`、`TEST-537-07`。按现合同实现无法证明 archive 竞态下 adapter 调用为 0，也无法判定哪一方“CAS 落败”。
- **evidence**：
  - CONTRACT §4.2 要求 account version + source version CAS，`assertCollectorEligible` 甚至返回 `version`。
  - `platform_accounts` 没有 `version` 列：`backend/src/schema/platform-account.ts:27-40`；公开 DTO 也没有：`contract/src/resources/platform-accounts.ts:5-18`。
  - `PlatformAccountService.assertOwnedAccount` 只返回 `void`，`listAccounts/getAccount` 返回的资源同样无 version：`backend/src/modules/platform-account/platform-account.service.ts:64-98,206-221`。
  - 当前 claim 只 CAS `execution_tasks.status=queued`：`backend/src/modules/execution/persistent-task.service.ts:454-538`；账号 archive 是另一次无 expected-version 的更新：`platform-account.repository.ts:214-226`。二者没有共同 CAS 对象。
- **suggestion**：CONTRACT 必须先选定一个可实现的线性化模型并写进测试：
  1. 最小方案是增加真实 account revision（schema、DTO 内部 port、archive expected revision），claim 前在同一 backend work unit 读取/锁定 account+source 并明确“archive 先提交 → adapter=0；claim 校验先线性化 → 本次允许按旧有效授权完成，archive 只阻断后续 claim”；
  2. 若产品要求 archive 请求一到达就取消在途 adapter，则需显式的 collector lease/reservation 与 archive 协调，不能再声称普通 CAS 已解决。
  不允许只在文案中返回一个不存在的 `version`。
- **risk disposition**：`mitigate`。这是授权撤销与并发正确性，不能接受模糊竞态。

### `CONTRACT-B3`：六步迁移的 duplicate 处理会被现有唯一索引直接阻断

- **severity**：`blocker`
- **category**：`approach`
- **confirmed-FR impact**：`FR-537-05`、`FR-537-09`、`TEST-537-09`。按当前步骤无法完成 duplicate 回填、checkpoint 重跑或索引切换。
- **evidence**：
  - 现库已经有完全相同列的唯一索引 `ux_intelligence_source_identity(user_id, account_id, type, external_key)`：`backend/drizzle/0050_content_intelligence.sql:46-47`。CONTRACT §5.1 所称“新增唯一索引”不是新能力，只会建立重复索引。
  - §5.2 要把重复 source 都改成同一个 v2 key，仅将非 canonical 行标成 `archived`。现唯一索引不含 `status`；第二条回填在 archive 前后都会发生 unique violation。
  - 即使先临时删索引，§5.2 第 5 步重建四列唯一索引时，保留相同 key 的 archived duplicate 仍会失败。
- **suggestion**：复用现有唯一索引并重写 collision 算法。最小可行做法是：事务内选 canonical；membership 指向 canonical；重复 source 归档；为重复行写确定性 tombstone external key（并在 ledger checkpoint/audit 保留原 key、canonical sourceId、duplicate sourceId），然后回填 canonical v2 key。若改成 partial unique index，只约束非 archived 行，也必须明确索引替换/回滚和 archived source 的读取语义。不得再写“新增同列索引”。
- **risk disposition**：`mitigate`。迁移不可恢复或错误合并会造成数据损坏，默认必须修。

### `CONTRACT-M1`：`accountHandle` read model 与安全 platform-account port 没有真实数据链

- **severity**：`major`
- **category**：`completeness`
- **confirmed-FR impact**：`FR-537-01`、`FR-537-08`。selector、来源卡和运行记录都需要安全账号标签；当前合同无法说明 intelligence 如何构造该字段，以及账号归档/缺失时如何继续读来源。
- **evidence**：
  - CONTRACT 给 `IntelligenceSourceResource.collector` 增加 `accountHandle`，但 `intelligence_sources` 只存 `collectorAccountId`。
  - 当前 `toSource` 是只依赖 source row 的同步 mapper：`backend/src/modules/intelligence/intelligence.service.ts:239-260`。
  - 现有 `platformAccountService.listAccounts/getAccount` 返回完整 `PlatformAccountResource`，其中包含 `secretReference`：`contract/src/resources/platform-accounts.ts:5-18`；`assertOwnedAccount` 又只返回 `void`，并不存在合同声称的安全 `{accountId,accountHandle,platform,version}` port。
- **suggestion**：定义一个真实的 backend 内部安全 port（可批量读取）只返回 `{accountId, accountHandle, platform, status, revision}`，由 intelligence service 注入使用，禁止把 `secretReference` 带入该依赖；明确 archived/missing collector 的 source DTO 仍可返回（例如账号 ID 脱敏 fallback + unavailable 状态），避免账号模块异常拖垮整个 radar workspace。若不愿新增 read dependency，就把 DTO 限为 `collectorAccountId`，UI 通过同一安全账号 read model 映射标签；二者选一并写实。
- **risk disposition**：`mitigate`。这是已确认 UI 回显与最小权限问题，不需要新公开 operation。

### `CONTRACT-M2`：server 内部 ref 与 runtime adapter 的接口未定义，owner ctx 仍会打开 owner authDir

- **severity**：`major`
- **category**：`completeness`
- **confirmed-FR impact**：`FR-537-03`、`FR-537-04`、`FR-537-06`、`TEST-537-03/06`。客户端删 ref 后，如果只照当前 adapter 改 schema，真实采集仍会使用 owner 登录态。
- **evidence**：
  - 当前 source adapter 下层端口只接收 `{ctx, externalAccountId|folderId|keyword}`：`frontend/src/server/intelligence/source-adapter.ts:83-107`。
  - 三个真实读取器均用 `douyinAuthDirFor(ctx.accountId)`：`frontend/src/server/persistence-client.ts:5281-5319`。
  - worker ctx 必须保持 owner 才能安全写库：`backend/src/modules/intelligence/source-sync-runner.ts:152-170`。
  - CONTRACT 只写“runtime port 解析”与 TEST 中“resolver 被调用”，没有定义 `getSourceExecutionInput`、adapter port、resolver 输入/输出和禁止 ctx 参与 authDir 的字段级合同。
- **suggestion**：补一个内部执行合同，例如：
  - intelligence service 返回 owner-scoped source + 已验证 `collectorAccountId` + opaque `collectorSessionRef`；
  - runtime-only `CollectorSessionPort.resolve(collectorSessionRef)` 返回不可序列化的本地 auth handle；
  - 三个 Douyin fetch port 显式接收该 auth handle，禁止从 `ctx.accountId` 推导；
  - task payload/checkpoint 仍只存 `sourceId/runId/trigger`，claim 后从 source 重新解析。
  `web/rss`、分享链接、comments/self 数据链不改。
- **risk disposition**：`mitigate`。这是 owner/collector 隔离的核心安全实现边界。

### `CONTRACT-M3`：对 `browserSessionRef` 的公开删除与“web/rss 不变”互相矛盾

- **severity**：`major`
- **category**：`scope-inflation`
- **confirmed-FR impact**：`FR-537-03`。三类登录来源需要删 client ref；web/rss 与其他 browser-session 流程不属于确认范围。
- **evidence**：
  - CONTRACT §1.3 写“客户端永远不提交、公开 API 永远不返回 `browserSessionRef`”。
  - §2.1 又写 `web`、`rss` 不变；当前两支 config 接受 optional ref，`previewWeb` 也返回 ref。
  - §2.2 从共享 `IntelligenceSourceResource` 全局删除该字段，会对 web/rss 产生未经说明的 breaking response change。
- **suggestion**：把删除限定在三支 v2 config、`previewProfile`、`listFavoriteFolders` 以及三支 source 的公开投影。共享 DTO 若要兼容 web/rss，可保留 nullable 字段但对三类登录来源强制为 null，或拆成按 type 的 discriminated resource；不要借 T-537 修改独立 browser-session API。
- **risk disposition**：`avoid`。保持任务边界，不把修三类来源变成全内容雷达 session 重构。

### `CONTRACT-M4`：darkhorse 的创建期登录检查与 PLAN 的首次 run 语义冲突

- **severity**：`major`
- **category**：`traceability`
- **confirmed-FR impact**：`FR-537-01`、`FR-537-07`。实现者无法判断登录过期时是否应“0 source”还是“source 已建、initial run blocked”。
- **evidence**：
  - PLAN `FLOW-537-01` 明确黑马关键词在保存后的既有首次 run 验证。
  - CONTRACT §4.1 又规定登录过期/CAPTCHA 时 `create 不落 source`。
  - `assertCollectorEligible` 只检查 registry ownership/status/platform，不验证浏览器登录态；CONTRACT 没有新增黑马 preview/probe operation。
- **suggestion**：沿用 5-operation 预算并与 PLAN 对齐：create 只验证账号登记资格；黑马的真实登录/验证码/响应结构由 initial run 验证，失败时 source 进入 `paused`，run/task 为结构化 `blocked`。主页/收藏可在 preview/list 阶段提前发现登录问题。不要为关闭矛盾再新增通用 login-probe operation。
- **risk disposition**：`mitigate`。用收敛语义修复，不扩 API。

### `CONTRACT-M5`：“创建失败绝不留半成品”没有可执行的事务边界

- **severity**：`major`
- **category**：`completeness`
- **confirmed-FR impact**：`FR-537-05`、`FR-537-06`、`TEST-537-05/06`。并发或 task enqueue 失败后可能出现 source 有、membership/run/task 缺失，重试行为不确定。
- **evidence**：
  - 当前 `createSource` 先 select、insert source、写 membership，再调用 `startRun`：`backend/src/modules/intelligence/intelligence.service.ts:1962-2039`。
  - `startRun` 又先通过独立 `PersistentTaskService.enqueue` 创建 task，再插 sync run：同文件 `1320-1399`。
  - `PersistentTaskService` 的公开 port 不接受外部 transaction；因此 CONTRACT §3 `API-537-04` 的“绝不留下 source/run/task 半成品”不能由现有 service 组合自然保证。
- **suggestion**：明确选择：
  1. 给 task enqueue 提供 transaction-bound backend port，使 source/membership/task/run 同事务提交；或
  2. 将保证收敛为“source 原子 upsert；initial enqueue 是同幂等键的可恢复第二步”，并定义 repair/retry 如何补齐缺失 run/task、UI 如何显示 `source created / initial enqueue failed`。
  不能同时保留绝对原子承诺和现有分离事务。
- **risk disposition**：`mitigate`。这是幂等和数据一致性，所需深度不算范围膨胀。

### `CONTRACT-M6`：迁移 ledger/API 确实存在，但被误写成可直接复用的 T-537 迁移能力

- **severity**：`major`
- **category**：`reinvent-wheel`
- **confirmed-FR impact**：`FR-537-09`、`TEST-537-09`。如果复用方式不明确，现有 T-482 migration report、write fence 和 T-537 v1→v2 checkpoint 会混用语义。
- **evidence**：
  - `intelligenceMigrationLedgers` 真实存在：`backend/src/schema/intelligence.ts:263-279`；`API-CR-025..028` 也存在：`contract/src/operations/intelligence.ts:510-580`。因此不存在“引用了不存在 ledger/API”的问题。
  - 但现有实现是写死 benchmark/trend/favorites 旧表到内容雷达的一次性 T-482 迁移：`backend/src/modules/intelligence/intelligence.service.ts:714-1317`，不是通用 source-config migration engine。
  - ledger 没有 `migrationKind`，也没有 `mergedIntoSourceId` 字段；CONTRACT 未说明 T-537 是扩展现有公开 migration operations、内部发布迁移，还是复用同表新类型。
- **suggestion**：明确唯一迁移入口和隔离键。优先复用 ledger 表，但给 checkpoint/counts 定义 `kind:"source_collector_v2"` 与版本化 shape，确保与 T-482 ledger 不碰撞；说明是否复用 `API-CR-025..028` 及其报告如何区分 kind。`mergedIntoSourceId` 作为 ledger audit 结构字段写清，不要暗示数据库已有列。若这是应用启动迁移，也要写触发、批量、恢复和可见报告路径。
- **risk disposition**：`mitigate`。复用真实底座，但不假装旧专用 migration 已解决新迁移。

### `CONTRACT-M7`：五个 operation 尚未达到 contract-completeness 的字段级门槛

- **severity**：`major`
- **category**：`completeness`
- **confirmed-FR impact**：`FR-537-01..09`。确认②后 BUILD 会按合同自治；缺失的错误 envelope、状态转移和示例会被下游自行发明。
- **evidence**：
  - 五个 API 有 request/response 主形状，但没有每操作一个具体 happy-path example。
  - `API-537-02..05` 没有逐操作列完整 HTTP code + error envelope；§4 的错误矩阵没有说明哪些 operation 返回哪些 code，`OWNERSHIP_ERROR` 等也未绑定现有 transport error mapper。
  - `API-537-01` 的成功响应文本多一个 `}`：`{ collectors: Array<...> } }`。
  - `safeDiagnostics` 只以 prose/test 约束隐私；现实现 `assertSafeDiagnostics` 只检查 key 中的 cookie/token 等词，不拒绝 `browserSessionRef`、`authDir`、路径或敏感 value：`backend/src/modules/intelligence/intelligence.service.ts:481-490`。
- **suggestion**：为 `API-537-01..05` 各补：请求例、成功响应例、完整错误表（HTTP + typed envelope + retryability）、权限先后顺序、重复调用例、合法/非法状态转移；对 diagnostics 定义安全 allowlist 与值级路径/ref 检测，并在 run event/task error/普通日志三个消费者上做负测。只补既有 5 个 operation，不新增 endpoint。
- **risk disposition**：`mitigate`。这是现有 scope 的合同完整性与隐私正确性。

## 5. 已核验为正确或可接受的设计

以下不构成 finding，也不应借评审扩 scope：

1. **只限三类内容雷达来源**是正确边界：`creator_profile`、`favorites_folder`、`darkhorse_query`；不得扩到 `self.metrics`、`self.detail`、comments、分享链接、发布或其他自动化。
2. **owner/collector 分离方向正确**：owner 继续来自可信 `ctx.accountId`，collector 只决定抖音只读登录态；worker 不得以 collector 构造写库 context。
3. **externalKey 没有重复嵌入 owner**：合同中的 v2 key 只含 collector + 业务锚，owner 已由现有唯一索引列 `account_id` 提供。collector 必须进入 key，才能允许同一 owner 下两个 collector 使用相同业务锚。需修的是“新增重复索引”和 duplicate tombstone，不是往 key 再加 owner。
4. **task payload 的方向正确**：当前 `source_sync` payload 只有 `sourceId/sourceType/trigger`，合同继续禁止 profile 路径、凭据和 ref 进入 payload/checkpoint 是合理的。collector 应在 claim 后从 source 读取，不需要复制进 task payload。
5. **scheduler 继承 source 的方向正确**：现有 `enqueueDueSourceRuns` 从 source 生成 owner ctx，重启 drain 从持久 task 恢复，再经 `getSourceExecutionInput` 读取 source；只需在 enqueue/claim 增真实 eligibility gate 和 runtime collector resolver，不应新建 scheduler。
6. **client ref 删除与 server internal ref 可以兼容**：仅对三类 v2 来源而言，客户端删除 `browserSessionRef`、服务端保存 opaque ref、runtime 最后解析 authDir 是可行架构；前提是按 `CONTRACT-M2/M3` 定义精确 port 且不误改 web/rss。
7. **真实双账号 E2E 不可被替代**：fixture 可覆盖负测、CAS 和 owner 写入，但不能替代两个不同 active 身份的真实上游读取证据。

## 6. 作者必须修订项

按阻断顺序：

1. 恢复第二个 active 登录态并重跑脱敏 RAT；RAT PASS 前 PLAN/CONTRACT/整个 BUILD 均不放行。
2. 把 `browserSessionRef` 变更严格限定在三类来源，保持 web/rss、分享链接和独立 browser-session API 不变。
3. 登记真实 T-537 BACKLOG 与控制层追溯，删除不存在的 `BACKLOG.md#T-537` 自证。
4. 为 archive/claim 选择真实并发线性化语义；补 account revision 或明确等价数据库机制，不能引用不存在的 version。
5. 重写 v1→v2 duplicate 算法，复用现有 source identity 唯一索引，并为 archived duplicate 定义不碰撞的 tombstone key/审计。
6. 定义 platform-account 安全内部 port、collector label read path、archived/missing fallback，禁止让 intelligence 依赖含 `secretReference` 的宽 DTO。
7. 定义 source execution input → runtime collector resolver → 三个 Douyin fetch port 的字段级接口，owner ctx 不得再决定 authDir。
8. 统一 darkhorse 创建/首次 run 失败语义，不新增未确认的 probe endpoint。
9. 选择 source/membership/task/run 的真实原子边界或幂等 repair 语义。
10. 明确 T-537 如何复用现有专用 migration ledger/API，并补齐 5 个 operation 的 examples、错误 envelope、状态与 diagnostics 隐私合同。

## 7. 可接受风险与不可接受风险

可接受并登记：

- BUILD 内三类来源的完整真实 E2E、schedule 时间推进、验证码/锁的受控故障注入可以在实现完成后执行；它们不替代开工前最小双账号 RAT。
- collector `accountHandle` 是可编辑显示名，不是身份锚；UI 可显示当前 handle，但审计必须以 `collectorAccountId` 为准，并允许 handle 变化。
- account archive 与已经线性化成功的 claim 若由用户明确接受“本次允许完成、后续阻断”，可以简化为无跨模块 lease 的模型；必须写入合同和测试，不能继续声称两边都能赢。

不可接受：

- 用 fixture、目录存在、两个注册行或合法性不明的 `[]` 代替双 active 账号 RAT。
- owner fallback、collector 推导 owner 写入 context、路径/ref/凭据进入 RPC/task/checkpoint/diagnostics。
- 在没有真实 account version 或线性化定义时声称 archive/claim CAS 已解决。
- 以 archive 状态掩盖仍然相同的 external key，然后声称唯一索引可创建。
- 借 T-537 改造 web/rss、comments、self、分享链接或其他自动化账号语义。

---

## 8. Round 2 独立 delta 复评

> 日期：2026-07-26
> `review_mode`：`homogeneous`
> 模型：`gpt-5.6-sol`（独立子代理）
> 输入：修订后 PLAN、修订后 CONTRACT、Round 1 review 与同一组真实代码
> 边界：只判断 Round 1 finding 是否被文本与真实代码共同关闭；没有把作者“已修”声明当证据。

### 8.1 Round 2 verdict

| 工件 | Round 2 verdict | blocker | major | minor | 结论 |
| --- | --- | ---: | ---: | ---: | --- |
| PLAN | **FAIL** | 1 | 1 | 0 | 开工时点已纠正，但真实双账号 RAT 仍是 `BLOCKED`，治理登记也尚未发生 |
| CONTRACT | **FAIL** | 1 | 1 | 0 | 2 个旧 blocker、6 个旧 major 已关闭；仍受 RAT/PLAN 上游阻断，且错误合同还有一处 major |

这里的 `FAIL` 不表示 Round 2 修订无效：大部分架构缺口已经真实收敛。它表示当前事实仍不满足 PLAN 确认①或 CONTRACT 确认②，不能把“文档已正确描述 blocker”误写成“blocker 已消失”。

### 8.2 Round 1 findings 逐条销账

| Round 1 finding | Round 2 状态 | 代码/工件核验 | disposition |
| --- | --- | --- | --- |
| `PLAN-B1` RAT 被后移 | **仍开口，但时点已修正** | PLAN 元数据、`RAT-537-01`、`HARD-537-01`、`AC-537-07` 均明确 RAT PASS 前不得确认①、不得确认 CONTRACT、不得开始任何 T-537 BUILD；但 T-502 真实 RAT 没有新 PASS 证据 | 保留 blocker，见 `R2-PLAN-B1` |
| `PLAN-M1` session 禁令越界 | **CLOSED** | `FR-537-03`、`ENT-537-01`、`AC-537-02` 已限定三类 login-collector；明确 web/rss、分享链接、独立 browser-session 不变 | `avoid` 已落实 |
| `PLAN-M2` 治理锚不存在 | **仍开口，但假锚已删除** | PLAN 不再引用不存在的 `BACKLOG.md#T-537`，并诚实记录当前 worktree 无治理登记；实际 BACKLOG/manifest/ID/矩阵仍无 T-537 | 保留 major，见 `R2-PLAN-M1` |
| `CONTRACT-B1` 上游/RAT 未成立 | **仍开口，但 Gate 顺序已修正** | CONTRACT 状态为 blocked，§6/§8 统一为 RAT PASS → PLAN 确认① → CONTRACT 复审/确认② → BUILD | 保留 blocker，见 `R2-CONTRACT-B1` |
| `CONTRACT-B2` 不存在的 account version CAS | **CLOSED** | `EligibleCollector` 不再返回 version；§4.2 明确第二次 user-scoped 资格查询为线性化点，source version 只协调 intelligence 自身；`TEST-537-08` 覆盖 archive 先提交和资格查询先成功两种顺序 | `accept` 单次已线性化读取、后续阻断的语义，待确认②确认 |
| `CONTRACT-B3` duplicate 与现唯一索引冲突 | **CLOSED** | §5.1 复用现有 `ux_intelligence_source_identity`；§5.2 先锁组、把 duplicate 改为唯一 tombstone 并归档，再回填 canonical，索引全程启用；audit 保留原 key/canonical/duplicate | collision-safe，未新增重复索引 |
| `CONTRACT-M1` `accountHandle` 无安全 read path | **CLOSED** | §2.3 定义 platform-account 拥有的窄 `CollectorAccountReadPort`，排除 `secretReference`，批量构造 workspace DTO，并为 archived/missing 定义 fallback | 不新增公开账号 API |
| `CONTRACT-M2` runtime collector resolver 未定义 | **CLOSED** | §4.3 定义 execution input、opaque ref、`CollectorSessionPort` 与 runtime-only auth handle；三个 fetch port 显式收 auth，禁止 `ctx.accountId` 求 authDir；task payload 不带 ref | owner 写入与 collector 读取已分开 |
| `CONTRACT-M3` web/rss 被误改 | **CLOSED** | 共享 DTO 保留 `browserSessionRef:string|null`；仅三类 source mapper 固定为 null；web/rss、分享链接和独立 browser-session 均明确保持现状；`TEST-537-01` 有回归断言 | 范围恢复到三类 |
| `CONTRACT-M4` darkhorse create/login 语义冲突 | **CLOSED** | `API-537-04` 与 §4.1 均规定 create 只查 registry；darkhorse 由 initial run 检出登录/验证码/锁，失败时 source paused、run/task blocked；未新增 probe API | 与 PLAN FLOW 对齐 |
| `CONTRACT-M5` source/task/run 无事务边界 | **CLOSED** | §5.4 定义 execution-owned `enqueueInTransaction` service port，共享同一 backend unit-of-work；create/retry 的 source/membership/task/run 全有或全无，commit 后才 dispatch，重放与 payload mismatch 有断言 | 需 BUILD TDD 证明，但合同已可执行 |
| `CONTRACT-M6` 把 T-482 ledger 冒充通用引擎 | **CLOSED** | §5.3 明确 T-482 API 不复用、不改语义；T-537 用内部 `SourceCollectorV2Migration`，复用 ledger 表但用专用 idempotency key、kind、schemaVersion、counts、checkpoint 与 fence 语义 | ledger 复用而不混用 |
| `CONTRACT-M7` operation/error/privacy 不完整 | **PARTIAL** | 五个 operation 已有 success example、权限顺序、重复行为、状态与错误表；diagnostics 改成 key/value allowlist。但主页预览的登录/captcha HTTP 与现 dispatch mapper 仍不自洽 | 保留 major，见 `R2-CONTRACT-M1` |

### 8.3 Round 2 剩余 findings

#### `R2-PLAN-B1`：真实双账号 RAT 仍未通过

- **severity**：`blocker`
- **category**：`value-viability`
- **confirmed-FR impact**：`FR-537-01/04/06`、`AC-537-07`。没有两个不同稳定身份及 owner=A/collector=B 的成功上游 envelope，核心数据源仍未证明。
- **evidence**：
  - 修订后的 PLAN 已正确写明 `RAT-537-01` 是确认①和整个 BUILD 的开工前置。
  - 当前仍只有 `docs/research/2026-07-24-favorites-dual-account-readonly-rat.md` 的 `BLOCKED` 证据；本轮没有新的 RAT 文件、不同身份摘要或成功 envelope。
- **suggestion**：无需再改 Gate 措辞；实际恢复第二个 active 登录态并执行 PLAN 已定义的五条脱敏 RAT。只有真实 PASS 证据能关闭本 finding。
- **risk disposition**：`mitigate`。fixture、目录数、两个注册行和无成功 envelope 的空数组均不能替代。

#### `R2-PLAN-M1`：T-537 治理登记仍未实际落盘

- **severity**：`major`
- **category**：`traceability`
- **confirmed-FR impact**：`FR-537-01..09` 仍没有合法任务状态转换、阶段登记与 ID/TEST 双向追溯。
- **evidence**：
  - PLAN 已删除假 `BACKLOG.md#T-537`，并诚实标注“须由主代理在合入前登记”。
  - 当前 worktree 的 `BACKLOG.md`、`BACKLOG-archive.md`、`ARTIFACT_MANIFEST.yaml`、`ID_REGISTRY.md`、`TRACEABILITY_MATRIX.md`、`DECISION_LOG.md` 仍无 `T-537`。
- **suggestion**：由主代理在其治理写入范围内登记真实 BACKLOG 行与控制工件；reviewer 不越权修改。登记完成后以路径/行号回填 Round 2 closure。
- **risk disposition**：`mitigate`。作者已关闭错误自证，但外部治理动作尚未完成。

#### `R2-CONTRACT-B1`：CONTRACT 仍受未通过 RAT 与未确认 PLAN 阻断

- **severity**：`blocker`
- **category**：`traceability`
- **confirmed-FR impact**：`FR-537-01/04/06/07`。确认②会签发 BUILD scope envelope；当前不能签发。
- **evidence**：
  - CONTRACT 的阻断顺序已正确且无矛盾。
  - `R2-PLAN-B1` 仍开口，PLAN 状态仍为 `blocked`，也没有用户确认①记录。
- **suggestion**：保持 CONTRACT `blocked`；RAT PASS 后先完成 PLAN 独立复评和确认①，再做 CONTRACT 最终 delta review/确认②。不要因本轮关闭架构缺口而跳过上游。
- **risk disposition**：`mitigate`。

#### `R2-CONTRACT-M1`：主页预览的登录/captcha 错误仍无法按现有 dispatch 映射实现

- **severity**：`major`
- **category**：`completeness`
- **confirmed-FR impact**：`FR-537-07`、`TEST-537-09`。主页预览若登录失效或遇验证码，客户端需要稳定区分并显示 collector 恢复动作；当前表格会让实现者在 HTTP/code 上二选一。
- **evidence**：
  - CONTRACT `API-537-02` 将验证码写成 `428 ValidationError / captcha_required`，同时只把登录失败列成 `401 AuthenticationError`。
  - 真实 `contract/src/envelope.ts` 把 `ValidationError` 固定映射为 HTTP 400，把 `AuthenticationError` 固定映射为应用认证失败 401；现有 428 只对应 `AccountRequiredError` 或 `DOUYIN_FAVORITES_CAPTCHA`。
  - `DOUYIN_FAVORITES_SESSION_EXPIRED/CAPTCHA` 是收藏专用命名；主页 preview 没有可直接复用且语义正确的通用 Douyin login/captcha ErrorCode。CONTRACT §4.1 说“标准结构化 session error”，但没有给出能被当前 dispatch 识别的具体 code。
  - 同一 §4.1 还遗留 `404 OWNERSHIP_ERROR`，而现有合法 top-level code 是 `OwnershipError`。
- **suggestion**：在不新增 operation 的前提下二选一并写实：
  1. 最小方案：主页 preview 用现有 `ValidationError` + `details.reason=login_required|captcha_required`，HTTP 均为 400；UI 按 reason 行动；
  2. 若产品必须让验证码保持 428、登录失效保持独立 code，则在现有 `ErrorCode/ERROR_HTTP` 增加通用 Douyin profile codes，并计入本任务 contract 变更与测试。
  同步把 §4.1 的 `OWNERSHIP_ERROR` 改为 `OwnershipError`，避免出现不存在的 top-level code。
- **risk disposition**：`mitigate`。这是已确认错误可恢复性，不需要新增产品能力。

### 8.4 Round 2 重点结论

1. **RAT**：已明确阻断整个 BUILD，但事实仍 `BLOCKED`，所以 PLAN/CONTRACT 都不能 PASS。
2. **account version**：不存在的假设已彻底删除；只使用 source version，账号并发用第二次资格读取线性化。
3. **二次资格读取竞态**：合同明确了两种合法顺序；archive 先提交时 adapter=0，资格查询先成功时允许本次只读完成、后续阻断。该最小语义可实现，不需要事件总线或跨模块 lease。
4. **collision migration**：先 duplicate tombstone、再 canonical 回填，在现有唯一索引全程启用时成立；`mergedIntoSourceId` 被正确限定为 JSON audit 字段。
5. **projection/session ports**：安全账号投影和 runtime auth handle 均有字段级接口与归属模块，未泄露 `secretReference`，owner ctx 不再被当作 collector auth。
6. **web/rss**：既有 `browserSessionRef` 输入/输出和共享 resource 字段被保留，T-537 只让三类 source 的公开值为 null。
7. **事务边界**：通过 execution-owned transaction service port 形成同库 work unit，未直接跨模块 import repository；合同层已闭合，BUILD 需以全有/全无和响应丢失重放测试证明。
8. **ledger**：T-537 有专用 kind/schema/idempotency/checkpoint/counts；不复用或改变 T-482 公开 migration API。
9. **剩余合同缺口**：只有主页 preview 错误 code/HTTP 映射尚未与真实 dispatch 对齐；修正后，除 RAT/PLAN 外，Round 1 CONTRACT 架构 findings 可全部销账。

---

## 9. Round 3 终审

> 日期：2026-07-26
> `review_mode`：`homogeneous`
> 模型：`gpt-5.6-sol`（独立子代理）
> 输入：最新 PLAN、最新 CONTRACT、Round 1/2 review、现有 dispatch/ErrorCode 与 T-502 RAT 事实
> 边界：只追加本 review；不修改作者工件、代码或治理。Round 3 是第三轮终审，不把尚未执行的 RAT 或治理动作补写成 PASS。

### 9.1 文档内部 verdict 与 runtime readiness

| 工件 | 文档内部 verdict | 内部 blocker / major / minor | 正式 Gate verdict | runtime readiness |
| --- | --- | ---: | --- | --- |
| PLAN | **PASS（仅表示文本内部已收敛）** | 0 / 0 / 0 | **FAIL：1 external blocker + 1 external major** | **BLOCKED**：`RAT-537-01` 未执行成功，T-537 治理登记未落盘 |
| CONTRACT | **PASS（仅表示文本内部已收敛）** | 0 / 0 / 0 | **FAIL：1 external blocker + 1 external major** | **BLOCKED**：上游 RAT/PLAN 尚未解锁，T-537 治理登记未落盘 |

“文档内部 PASS”不是 PLAN 确认①、CONTRACT 确认②或 BUILD 开工 PASS。按 reviewer 门规，有 blocker 的正式 verdict 必须是 `FAIL`，因此这里不用较宽松的 `CONCERNS(externally blocked)` 代替事实：工件已可执行，但真实运行前置仍被外部证据阻断。

### 9.2 Round 2 findings 终审销账

| Round 2 finding | Round 3 状态 | 终审证据 |
| --- | --- | --- |
| `R2-PLAN-B1` 真实双账号 RAT 未通过 | **OPEN / external blocker** | PLAN 已在元数据、`RAT-537-01`、`HARD-537-01`、`AC-537-07` 一致阻断整个 BUILD；但唯一真实证据 `docs/research/2026-07-24-favorites-dual-account-readonly-rat.md` 仍为 `BLOCKED`，没有第二个稳定身份与成功 envelope |
| `R2-PLAN-M1` 治理登记未落盘 | **OPEN / external major** | `BACKLOG.md`、`BACKLOG-archive.md`、manifest、ID registry、traceability matrix 与 decision log 对 `T-537/FR-537/API-537/TEST-537` 仍无命中；PLAN 已诚实声明缺失，没有再伪造锚点 |
| `R2-CONTRACT-B1` 受 RAT/PLAN 阻断 | **OPEN / external blocker** | CONTRACT 保持 `blocked`，§6/§8 顺序仍为 RAT PASS → PLAN 确认① → CONTRACT 复审/确认② → BUILD；没有越过上游 |
| `R2-CONTRACT-M1` preview 登录/captcha 错误映射不自洽 | **CLOSED** | PLAN `FR-537-07/AC-537-06`、CONTRACT §3、`API-537-02`、§4.1、`TEST-537-09` 均统一为主页登录过期/验证码使用 `400 ValidationError`，以 `details.reason=login_required|captcha_required` 区分；`AuthenticationError/401` 只表示 CreatorOS 请求身份失效 |

### 9.3 preview / favorites 映射核验

1. **主页 preview 已与现 transport 对齐**：`contract/src/envelope.ts:21-28,48-55` 的 `ValidationError→400`、`ConflictError→409`、`ExternalDependencyError→502`、`UnexpectedError→500` 与 CONTRACT `API-537-02` 完全一致；`frontend/src/app/api/v1/dispatch/route.ts:57-70` 会保留已注册 `code` 的 `details`，所以 UI 可按 `login_required`、`captcha_required`、`browser_profile_locked` 等 reason 行动。
2. **CreatorOS 身份与抖音登录态已分层**：`AuthenticationError/401` 仅由 CreatorOS 请求认证失败使用；主页抖音登录过期不再冒充应用认证错误，也没有发明 428 profile 语义。
3. **收藏夹保持 canonical code/HTTP**：`contract/src/envelope.ts:35-40,57-62` 已注册 session `401`、lock `409`、captcha `428`、network/upstream/invalid-response `502`；`frontend/src/server/ingestion/douyin-errors.ts:53-123` 的实际错误类 code 与 CONTRACT `API-537-03`、§4.1、`TEST-537-09` 一一一致。
4. **合法空结果仍有证据门**：收藏夹只有上游 list-valid 成功证据时可返回 `200 []`；主页/收藏错误均不得折叠为成功 0，修订没有用统一 ValidationError 抹平收藏夹的已有可操作 code。

### 9.4 前两轮已收敛项回归

- **RAT 时点**：仍明确阻断确认①、确认②和整个 BUILD；没有把 BUILD E2E 或目录/fixture 冒充 RAT。
- **account version / archive 竞态**：没有恢复不存在的 platform account version；第二次 user-scoped 资格读取仍是线性化点，archive 先提交时 adapter=0，资格读取先成功时仅允许本次只读完成。
- **collision-safe migration**：继续复用现有 `ux_intelligence_source_identity`；duplicate 先写唯一 tombstone 并归档，canonical 后回填，现有唯一索引全程启用。
- **projection/session ports**：`CollectorAccountReadPort` 仍由 platform-account 拥有且不返回 `secretReference`；`CollectorSessionPort` 返回 runtime-only auth handle，三个 fetch port 不再用 owner `ctx.accountId` 求 authDir。
- **web/rss 范围**：共享 DTO 保留既有 nullable `browserSessionRef`，仅三类 login-collector source 公开投影固定为 null；web/rss、分享链接和独立 browser-session 语义不变。
- **事务边界**：`enqueueInTransaction(ctx, tx, input)` 仍由 execution service port 拥有，同库 source/membership/task/run 全有或全无，提交后才 dispatch。
- **migration ledger**：`SourceCollectorV2Migration` 仍使用专用 idempotency key、kind、schemaVersion、counts/checkpoint/fence 语义，不改变 T-482 公开 operation。

最新 CONTRACT 相比 Round 2 仅增加错误映射澄清，没有新增 ENT、operation、role 或 product domain，也没有重新打开任何 Round 1 已关闭 finding。Round 3 不再提出新的内部 finding。

### 9.5 最终处置

- 作者文档无需继续原地进行第 4 轮文字修订；第三轮终审已达到内部可执行状态。
- 主代理必须先登记真实 T-537 治理条目，再由用户恢复第二个 active 登录态并执行 PLAN 已定义的脱敏、只读 RAT。
- RAT 失败或仍无第二稳定身份/成功 envelope：保持正式 `FAIL/BLOCKED`，整个 BUILD 不开工。
- RAT 真实 PASS 后：记录证据，完成 PLAN 确认①与 CONTRACT 确认②；BUILD 内完整三类来源 E2E 仍必须另跑，不能用前置 RAT 替代。
