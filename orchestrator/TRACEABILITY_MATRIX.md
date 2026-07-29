# Traceability Matrix — CreatorOS

How product intent becomes flows, model concepts, pages, components, contracts, tests, validation
evidence, and release decisions. Built during the ratification pass (2026-06-20) from ID_REGISTRY.md
and the page→entity table in `docs/CreatorOS-storage-and-business-logic.md` §8.

## Matrix (per page = one core journey)

| Page | Flow IDs | Entity IDs (read/write) | Component IDs (sample) | Frontend Test | API IDs | Backend Test |
| --- | --- | --- | --- | --- | --- | --- |
| PAGE-001 Dashboard | FLOW-001 | ENT-003, 009, 037, 040, 024 | COMP-014, 016, 022, 023 | dashboard.spec | — | — |
| PAGE-002 Projects | FLOW-002/003/004 | ENT-003, 005, 007, 008 | COMP-009, 011, 022 | projects.spec | — | — |
| PAGE-003 New Project | FLOW-005 | ENT-003, 005, 006, 007 (w) | COMP-004 | new-project-overlay.spec | — | — |
| PAGE-004 Project Overview | FLOW-002/005 | ENT-003, 005, 012, 022, 010, 011 | COMP-024, 025, 026, 027 | project-overview.spec | — | — |
| PAGE-005 Research Workspace | FLOW-006 | ENT-012, 019, 017, 021 (r/w) | COMP-029, 030, 033 | research.spec | — | — |
| PAGE-006 Planning Workspace | FLOW-007 | ENT-012, 015, 017, 007 (r/w) | COMP-020, 033 | planning.spec | — | — |
| PAGE-007 Script Workspace | FLOW-008/009/010 | ENT-012, 013, 016, 048 (r/w) | COMP-036 | script.spec | — | — |
| PAGE-008 Production Workspace | FLOW-011/012 | ENT-033, 034, 022, 036 (r/w) | COMP-031, 035 | production.spec | — | — |
| PAGE-009 Publishing Workspace | FLOW-013/014 | ENT-037, 038, 022 (r/w) | COMP-018, 042 | publishing-workspace.spec | — | — |
| PAGE-010 Analytics & Review | FLOW-015/016 | ENT-039, 040, 041, 043, 024 | COMP-037, 038, 039, 040, 041 | analytics-review.spec | — | — |
| PAGE-011 Knowledge & Memory | FLOW-006 | ENT-019, 020, 021, 026 (r/w) | COMP-030, 019 | knowledge.spec | — | — |
| PAGE-012 Assets Center | FLOW-021 | ENT-022, 023, 029, 031, 032 (r/w) | COMP-031, 032, 034 | assets.spec | — | — |
| PAGE-013 Publishing Center | FLOW-013/020 | ENT-037, 007, 003, 040 | COMP-042, 018 | publishing-center.spec | — | — |
| PAGE-014 Experience Center | FLOW-015/016 | ENT-024, 025, 043 (r/w) | COMP-039 | experience.spec | — | — |
| PAGE-015 Global Search | FLOW-017 | ENT-058, 057 | COMP-010 | search.spec | — | — |
| PAGE-016 AI Copilot | FLOW-018 | ENT-046, 047, 048 (r/w) | COMP-005 | ai-copilot.spec | — | — |
| PAGE-017 Settings | FLOW-021 | ENT-001, 002, 051, 052, 023 (r/w) | COMP-003 | settings.spec | — | — |

## Orphan Scan (consistency-gates.md — BOTH directions)

### Downstream → upstream (no unrequested work)
- All 18 PAGEs trace to ≥1 FLOW (table above) and to FR via the implementation-plan phase coverage. **No orphan pages.**
- All 42 COMPs are referenced by ≥1 page in `frontend/specs/shared-components.md`. **No orphan components.**
- No APIs exist, so no orphan APIs.
- Frontend TESTs (vitest + visual specs) each target a page. **No orphan tests.**
- Result: **PASS** — no unrequested scope detected.

### Upstream → downstream (no dropped requirement)
- FR→PAGE: most product FRs surface in a page (frontend realized).
- **FR→API→TEST: BROKEN for every backend-bearing FR.** No service contract (API-*) and no backend tests exist. Examples of broken chains: FR-002 (project CRUD), FR-013/014 (artifact versions), FR-044/047/049 (publications & ingestion), FR-052/053 (metrics), FR-026/027 (search index) — all have FR + PAGE but **no API and no backend TEST**.
- Result: **FAIL** — release-critical chains are broken on the backend half. Per the gate, consistency cannot return `pass` until the service contract + backend tests close these chains.

## Gap Review

| Gap ID | Description | Affected IDs | Severity | Required Action | Owner |
| --- | --- | --- | --- | --- | --- |
| `GAP-001` | (RESOLVED) Stable IDs now assigned | all | — | Done in ratification pass | agent |
| `GAP-002` | Contract HALF-CLOSED (2026-06-21): `@creatoros/contract` defines all 76 SPEC §13 operations (Zod; §13-completeness + GAP-002-traceability tests green). FE still on fixtures until 15b wires MockTransport; backend tests attach at stage 16. | all FR needing persistence | medium (was high) | 15a done → 15b FE wiring + stage-16 backend tests on same op ids | user+agent |
| `GAP-003` | No backend implementation or tests | ENT-*, API-* | high | Backend TDD (stage 16) | agent |
| `GAP-004` | `next build` + full visual suite not confirmed green | PAGE-001..017 | medium | Run `pnpm verify` on host | user |
| `GAP-005` | FLOW-019 external ingestion has no UI owner (backend/contract flow) | FLOW-019 | low | Confirm it is backend-only by design | user |
| `GAP-006` | read/write verbs on PAGE→ENT links are inferred, not doc-stated | PAGE-005..017 | low | Confirm during page-spec ratification | user |

## Completion Standard

- Every confirmed `FR` and release-critical `NFR` has at least one validation path.
- Every page and API traces back to a product requirement or explicit decision.
- Every release-critical journey has test or browser-validation evidence.
- Any unimplemented confirmed requirement is listed as a gap, deferred work, or accepted risk.

## T-471 聚焦追踪

| Requirement | Flow | Surface | Contract | Tests | 状态 |
|---|---|---|---|---|---|
| FR-069 | FLOW-023 | PAGE-017 | API-008、API-009 | TEST-001..008 | RISK-011：代码与回归已落地；历史 TDD 红证据缺失，付费真端到端待授权 |

## T-501 聚焦追踪

| Requirement | Flow | Surface | Contract | Tests | 状态 |
|---|---|---|---|---|---|
| DEC-MC-002（旧 DEC-MC-001/FR-MC/API-MC 扩展范围失效） | 保存当前表单 → 正式 `modelFor + streamText` → 非空文本才连通 | 现有 Settings 模型配置卡与应用内手册 | 复用既有 `settings.models.put/test`，不新增公开 operation | T-501 定向 67 tests + frontend typecheck + 目标 lint | BUILD PASS（`f91b08cb`）；未调用真实 provider/付费能力，复杂工具调用保留真机边界 |

## T-516 聚焦追踪

| Requirement | Flow | Surface | Contract | Tests | 状态 |
|---|---|---|---|---|---|
| DEC-ODR-001；T-516 Replacement | 设置账户区；每周默认/可调/关闭/立即检查；用户主动 AI 起草 | 现有定位编辑、保存和版本历史 | [新 PLAN](../docs/superpowers/specs/2026-07-26-copilot-context-health-minimal.md)；旧 API-CTX-001..014 invalidated | 新 CONTRACT 后登记 | Replacement PLAN Round 3 PASS；CONTRACT/确认②/BUILD 关闭，生产代码未改 |

## T-517 聚焦追踪

| Requirement | Flow | Surface | Contract | Tests | 状态 |
|---|---|---|---|---|---|
| DEC-ODR-001；T-517 Replacement | `scheduled_job/job_run` 调度展示 → `PersistentTaskService` durable task → typed handler | 现有自动化页与业务入口 | [新 PLAN](../docs/superpowers/specs/2026-07-26-creatoros-automation-kernel-minimal.md)；旧 API-AUTO-001..027 invalidated | 新 CONTRACT 后登记 | Replacement PLAN Round 3 PASS；旧 CONTRACT 三轮 FAIL 保留；新 CONTRACT/确认②/BUILD 关闭 |

## T-518 聚焦追踪

| Requirement | Flow | Surface | Contract | Tests | 状态 |
|---|---|---|---|---|---|
| `FR-FDBR-01..06`；DEC-FDB-002；DEC-ODR-001 | 本地整理/复制 → 打开签名 `supportUrl`；独立打开加密日志目录 | `UI-FDBR-001` 侧边栏反馈入口 | [Replacement CONTRACT](../docs/superpowers/specs/2026-07-26-bug-feedback-inbox.contract.md)：`API-FDBR-001..003`、`PURE-FDBR-001`；旧 Growth 上传 CONTRACT invalidated | `TEST-FDBR-001..007`：T-518 定向 49 tests + contract 1 test | BUILD PASS（`705c7156`）；零上传、零反馈写 API、零假“已发送”状态；typecheck/boundary/orphan/reconcile 全绿 |

## T-519 聚焦追踪

| Requirement | Flow | Surface | Contract | Tests | 状态 |
|---|---|---|---|---|---|
| DEC-ODR-001；T-519 Replacement | Assets ownership/idempotency → 默认多级文件夹 → 文件/URL/文本导入 → 四视图 | 现有 Knowledge 页面增量 | [新 PLAN](../docs/superpowers/specs/2026-07-26-knowledge-workspace-lean.md)；旧 41-operation CONTRACT invalidated | 新 CONTRACT 后登记 | Replacement PLAN Round 3 PASS；旧 ID/图/导入保留；CONTRACT/确认②/BUILD 关闭 |

## T-534 聚焦追踪

| Requirement | Flow | Surface | Contract | Tests | 状态 |
|---|---|---|---|---|---|
| DEC-TSB-001；FR-TSB-001..003；NFR-TSB-001 | FLOW-TSB-001 | ENT-TSB-001；UI-TSB-001/002 | [Creator CONTRACT](../docs/superpowers/specs/2026-07-26-three-system-runtime-config-boundary.md)；API-TSB-001 | TEST-TSB-001..010 | Creator review 三轮收口；BUILD/consumer contract tests PASS；全局 next build 受当前 HEAD 的 T-535 instrumentation panic 阻断 |

## T-537 聚焦追踪

| Requirement | Flow | Surface | Contract | Tests | 状态 |
|---|---|---|---|---|---|
| DEC-COL-001；FR-537-01..09；NFR-537-01..05 | FLOW-537-01/02 | ENT-537-01..03；IA-537-01/02 | [PLAN](../docs/superpowers/specs/2026-07-26-content-radar-collector-account.md)；[CONTRACT](../docs/superpowers/specs/2026-07-26-content-radar-collector-account.contract.md)；API-537-01..05 | TEST-537-01..13；RAT-537-01 | 三轮评审文档内部 PASS；正式 Gate 因第二个有效抖音账号的真实 RAT 未通过而 BLOCKED，生产代码未改 |

## T-575 / T-076-CREATOR 聚焦追踪

| Requirement | Flow | Surface | Contract | Tests | 状态 |
|---|---|---|---|---|---|
| DEC-TSL-001；FR-575-01/02 | FLOW-575-01 | 既有激活页、设置授权卡与 T-534 runtime | T-534 `API-TSB-001` | TEST-575-01/04 | 已发布基线可复用；本任务只做不回归验证 |
| FR-575-03/04；HARD-575-001/002 | FLOW-575-01 | UI-575-001 | [Creator consumer CONTRACT](../docs/contracts/creator-entitlement-claim-consumer-v1.md)；PORT-575-001；AM final descriptor/vector pinned；Growth API-210..212/0028/durable readiness local BUILD PASS | TEST-575-02/05 | 三仓 local BUILD verified with capability off；live HTTPS E2E、部署、正式密钥与 release receipt 仍为完成门 |
| FR-575-05..07；HARD-575-003 | FLOW-575-02 | UI-575-002 | API-575-001 + Growth T-069 API-AM-013/API-170 | TEST-575-03/05 | DEC-TSL-002 closed HARD-575-003：不新增 readiness wire，真实 closed 202 receipt 才成功 |

| DEC-TSL-003；FR-575-08 | FLOW-575-03 | server-only config refresh / safe modelPolicy projection | [Creator config consumer CONTRACT](../docs/contracts/creator-client-config-consumer-v1.md)；API-575-002；Growth T-077 PASS[REV:d2895a3b6dac] | TEST-575-06 | 本地 BUILD PASS：fixture byte-pin、启动/激活/claim 接线、6h 抖动刷新、AES-GCM LKG 与 fail-closed 已验证；live HTTPS E2E、正式公钥/keyId、Mac beta 仍未完成 |

## T-606 渠道模型配置权威纠偏

| Requirement | Flow | Surface | Contract | Tests | 状态 |
|---|---|---|---|---|---|
| DEC-MODEL-606；Growth FR-055/NFR-029 | 既有激活 locator → config.pull → configured/not_configured/unreachable/security_error → channel/local 唯一 authority | PAGE-017 设置页脱敏来源状态；本地配置始终可编辑 | [T-606 CreatorOS 绑定 SPEC](../docs/superpowers/specs/2026-07-29-creatoros-channel-model-authority.contract.md)；既有 API-575-002 | TC-T606-01..09；聚焦 backend 31 + frontend 86；Playwright 桌面/390px | BUILD 已验证：review PASS[REV:bc38a5b47eac]、Next build PASS；Growth/Activity live HTTPS、正式 Key 与发布许可仍未完成 |
## Canonical block(机器可读真值 —— orphan-scan 只读此块;上方人读表与叙事仅作导航)

> 2026-07-15 引擎升级(v3.6.3 --update)时迁入 canonical 格式。**PLANNED 在此的语义**:前端链
> (FLOW→ENT→PAGE)成立;契约(76 操作)与后端测试(188 文件)已落地但**尚未回挂到本矩阵**
> (API/Test 列 NONE 是登记欠账,不是实现欠账,见 GAP-002/003 与 BACKLOG 补账任务)。
> SHIP 前每行必须重挂并翻成 OK/DEFERRED/RISK(gate 14 检查)。

```traceability
| Product | Flow | Entity | Page | API | Test | Status |
| --- | --- | --- | --- | --- | --- | --- |
| NONE | FLOW-001 | ENT-003, ENT-009, ENT-037, ENT-040, ENT-024 | PAGE-001 | NONE | NONE | PLANNED |
| NONE | FLOW-002, FLOW-003, FLOW-004 | ENT-003, ENT-005, ENT-007, ENT-008 | PAGE-002 | NONE | NONE | PLANNED |
| NONE | FLOW-005 | ENT-003, ENT-005, ENT-006, ENT-007 | PAGE-003 | NONE | NONE | PLANNED |
| NONE | FLOW-002, FLOW-005 | ENT-003, ENT-005, ENT-012, ENT-022, ENT-010, ENT-011 | PAGE-004 | NONE | NONE | PLANNED |
| NONE | FLOW-006 | ENT-012, ENT-019, ENT-017, ENT-021 | PAGE-005 | NONE | NONE | PLANNED |
| NONE | FLOW-007 | ENT-012, ENT-015, ENT-017, ENT-007 | PAGE-006 | NONE | NONE | PLANNED |
| NONE | FLOW-008, FLOW-009, FLOW-010 | ENT-012, ENT-013, ENT-016, ENT-048 | PAGE-007 | NONE | NONE | PLANNED |
| NONE | FLOW-011, FLOW-012 | ENT-033, ENT-034, ENT-022, ENT-036 | PAGE-008 | NONE | NONE | PLANNED |
| NONE | FLOW-013, FLOW-014 | ENT-037, ENT-038, ENT-022 | PAGE-009 | NONE | NONE | PLANNED |
| NONE | FLOW-015, FLOW-016 | ENT-039, ENT-040, ENT-041, ENT-043, ENT-024 | PAGE-010 | NONE | NONE | PLANNED |
| NONE | FLOW-006 | ENT-019, ENT-020, ENT-021, ENT-026 | PAGE-011 | NONE | NONE | PLANNED |
| NONE | FLOW-021 | ENT-022, ENT-023, ENT-029, ENT-031, ENT-032 | PAGE-012 | NONE | NONE | PLANNED |
| NONE | FLOW-013, FLOW-020 | ENT-037, ENT-007, ENT-003, ENT-040 | PAGE-013 | NONE | NONE | PLANNED |
| NONE | FLOW-015, FLOW-016 | ENT-024, ENT-025, ENT-043 | PAGE-014 | NONE | NONE | PLANNED |
| NONE | FLOW-017 | ENT-058, ENT-057 | PAGE-015 | NONE | NONE | PLANNED |
| NONE | FLOW-018 | ENT-046, ENT-047, ENT-048 | PAGE-016 | NONE | NONE | PLANNED |
| NONE | FLOW-021 | ENT-001, ENT-002, ENT-051, ENT-052, ENT-023 | PAGE-017 | NONE | NONE | PLANNED |
| FR-069, DEC-019, RISK-011 | FLOW-023 | NONE | PAGE-017 | API-008, API-009 | TEST-001, TEST-002, TEST-003, TEST-004, TEST-005, TEST-006, TEST-007, TEST-008 | RISK |
| DEC-CR-001, DEC-CR-011, FR-CR-001, FR-CR-002, NFR-CR-010 | FLOW-CR-001 | ENT-CR-001, ENT-CR-002 | NONE | API-CR-001, API-CR-002, API-CR-003, API-CR-004 | NONE | PLANNED |
| DEC-CR-003, DEC-CR-005, DEC-CR-008, DEC-CR-012, FR-CR-003, FR-CR-004, FR-CR-005, FR-CR-006, FR-CR-015, NFR-CR-003, NFR-CR-004, NFR-CR-005, NFR-CR-007 | FLOW-CR-001 | ENT-CR-002, ENT-CR-003, ENT-CR-004, ENT-CR-006, ENT-CR-009, ENT-CR-010 | NONE | API-CR-005, API-CR-008, API-CR-009, API-CR-010, API-CR-012, API-CR-013, API-CR-014, API-CR-015, API-CR-016, API-CR-029 | RAT-CR-001, RAT-CR-002 | PLANNED |
| DEC-CR-007, DEC-CR-012, FR-CR-007, FR-CR-020, NFR-CR-002, NFR-CR-012 | FLOW-CR-001, FLOW-CR-006, FLOW-CR-007 | ENT-CR-005, ENT-CR-006, ENT-CR-007, ENT-CR-008 | NONE | API-CR-017, API-CR-018, API-CR-019, API-CR-023 | NONE | PLANNED |
| DEC-CR-013, FR-CR-008 | FLOW-CR-004 | ENT-CR-001, ENT-CR-002, ENT-CR-003, ENT-CR-009 | NONE | API-CR-007, API-CR-008, API-CR-012, API-CR-015, API-CR-016 | RAT-CR-004, RAT-CR-005 | PLANNED |
| DEC-CR-009, DEC-CR-013, FR-CR-009, NFR-CR-011 | FLOW-CR-002 | ENT-CR-002, ENT-CR-003, ENT-CR-006, ENT-CR-009, ENT-CR-010 | NONE | API-CR-006, API-CR-008, API-CR-012, API-CR-015, API-CR-016, API-CR-029, API-CR-030 | RAT-CR-006, RAT-CR-007 | PLANNED |
| DEC-CR-010, DEC-CR-013, FR-CR-010 | FLOW-CR-003 | ENT-CR-002, ENT-CR-003, ENT-CR-006, ENT-CR-009 | NONE | API-CR-008, API-CR-012, API-CR-014, API-CR-015, API-CR-016, API-CR-029, API-CR-030 | RAT-CR-003 | PLANNED |
| FR-CR-011, FR-CR-014, DEC-CR-004, NFR-CR-001, NFR-CR-006 | FLOW-CR-007 | ENT-CR-003, ENT-CR-006, ENT-CR-007, ENT-CR-009, ENT-CR-010 | NONE | API-CR-013, API-CR-014, API-CR-015, API-CR-016, API-CR-019 | RAT-CR-001, RAT-CR-003, RAT-CR-006 | PLANNED |
| DEC-CR-002, DEC-CR-006, FR-CR-012, FR-CR-013, NFR-CR-008, NFR-CR-013 | FLOW-CR-005, FLOW-CR-006 | ENT-CR-003, ENT-CR-008, ENT-CR-010, ENT-CR-011 | NONE | API-CR-020, API-CR-021, API-CR-022, API-CR-023, API-CR-024 | NONE | PLANNED |
| FR-CR-016, NFR-CR-009 | FLOW-CR-008 | ENT-CR-001, ENT-CR-002, ENT-CR-003, ENT-CR-005, ENT-CR-008, ENT-CR-009, ENT-CR-010 | NONE | API-CR-025, API-CR-026, API-CR-027, API-CR-028 | NONE | PLANNED |
| FR-CR-017, FR-CR-018, FR-CR-019 | FLOW-CR-001, FLOW-CR-002, FLOW-CR-003, FLOW-CR-004, FLOW-CR-005, FLOW-CR-006, FLOW-CR-007, FLOW-CR-008 | ENT-CR-001, ENT-CR-002, ENT-CR-003, ENT-CR-004, ENT-CR-005, ENT-CR-006, ENT-CR-007, ENT-CR-008, ENT-CR-009, ENT-CR-010, ENT-CR-011 | NONE | API-CR-001, API-CR-004, API-CR-009, API-CR-010, API-CR-011, API-CR-015, API-CR-016, API-CR-030 | NONE | PLANNED |
| DEC-CR-003, DEC-CR-007, DEC-CR-012, DEC-CR-013, DEC-CR-015, FR-CR-021, NFR-CR-002, NFR-CR-007, NFR-CR-012 | FLOW-CR-009 | ENT-CR-002, ENT-CR-003, ENT-CR-004, ENT-CR-005, ENT-CR-006, ENT-CR-009, ENT-CR-010, ENT-CR-012 | IA-CR-003, IA-CR-005, IA-CR-007 | API-CR-031 | NONE | PLANNED |
| FR-FDBR-01, FR-FDBR-02, FR-FDBR-03, FR-FDBR-04, FR-FDBR-05, FR-FDBR-06 | NONE | UI-FDBR-001, PURE-FDBR-001 | NONE | API-FDBR-001, API-FDBR-002, API-FDBR-003 | TEST-FDBR-001, TEST-FDBR-002, TEST-FDBR-003, TEST-FDBR-004, TEST-FDBR-005, TEST-FDBR-006, TEST-FDBR-007 | OK |
| DEC-TSB-001, FR-TSB-001, FR-TSB-002, FR-TSB-003, NFR-TSB-001 | FLOW-TSB-001 | ENT-TSB-001 | UI-TSB-001, UI-TSB-002 | API-TSB-001 | TEST-TSB-001, TEST-TSB-002, TEST-TSB-003, TEST-TSB-004, TEST-TSB-005, TEST-TSB-006, TEST-TSB-007, TEST-TSB-008, TEST-TSB-009, TEST-TSB-010 | OK |
| DEC-TSL-001, FR-575-01, FR-575-02 | FLOW-575-01 | ENT-TSB-001 | UI-TSB-001, UI-TSB-002 | API-TSB-001 | TEST-575-01, TEST-575-04 | RISK |
| FR-575-03, FR-575-04, HARD-575-001, HARD-575-002 | FLOW-575-01 | NONE | UI-575-001 | PORT-575-001 | TEST-575-02, TEST-575-05 | RISK |
| DEC-TSL-001, FR-575-05, FR-575-06, FR-575-07, HARD-575-003 | FLOW-575-02 | NONE | UI-575-002 | API-575-001 | TEST-575-03, TEST-575-05 | RISK |
| DEC-TSL-003, FR-575-08 | FLOW-575-03 | NONE | NONE | API-575-002 | TEST-575-06 | RISK |
```
