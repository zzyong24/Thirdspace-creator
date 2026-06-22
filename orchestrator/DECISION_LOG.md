# Decision Log — CreatorOS

Record confirmations, assumptions, tradeoffs, accepted risks, and skipped stages so future agents do not need chat history.

---

```text
ID: DEC-001
Date: 2026-06-20
Stage: 00-intake (orchestrator initialization)
Type: default-assumption
Decision: Initialize product-to-code-orchestrator as a MID-PROJECT TAKEOVER rather than from scratch.
         Existing markdown specs and the implemented frontend are mapped onto stages in
         ARTIFACT_MANIFEST.yaml instead of being regenerated.
Rationale: The repo already contains product docs, frontend/backend specs, a fully implemented
          frontend (127 files, passing lint/typecheck/tests), and 17 imported UI screens.
          Re-running stages 00-11 from zero would discard working artifacts.
Source: Repo scan on 2026-06-20 (docs/, frontend/, backend/, ui/, branch feat/frontend-implementation).
Affected Artifacts: orchestrator/ARTIFACT_MANIFEST.yaml and all stage rows.
Invalidates: none.
Owner: agent
Revisit Trigger: If the user wants a clean-room re-derivation with full traceability.
Status: active
```

```text
ID: DEC-002
Date: 2026-06-20
Stage: 00-14 (all pre-existing stages)
Type: default-assumption
Decision: Mark all pre-existing artifacts as `draft` (not `passed`), because none were produced under
         this orchestrator and none carry stable IDs or have had their stage gate run.
Rationale: State-machine rule: a stage may move to `passed` only when its gate has been run and
          confirmations recorded. That has not happened yet for any stage.
Source: rules/orchestrator-state-machine.md, transition rule 1.
Affected Artifacts: stages 00-14 in ARTIFACT_MANIFEST.yaml.
Invalidates: none.
Owner: agent
Revisit Trigger: Ratification pass — run each stage gate to promote draft -> passed.
Status: active
```

```text
ID: DEC-003
Date: 2026-06-20
Stage: 11-frontend-implementation
Type: tradeoff
Decision: Treat frontend implementation as verified-green on static checks (eslint 0, tsc 0, vitest
         all-green) but NOT release-verified, because `next build` and the full vitest/visual suite
         could not complete inside the sandbox (45s command limit; npm registry blocked).
Rationale: Static analysis passed cleanly; build/visual confirmation must run on the host.
Source: Sandbox verification run 2026-06-20.
Affected Artifacts: stage 11 + OPEN-002.
Invalidates: none.
Owner: user
Revisit Trigger: Host run of `pnpm verify`.
Status: active
```

```text
ID: DEC-004
Date: 2026-06-20
Stage: 00-14 (ratification pass, option A)
Type: scope-change
Decision: Ran the ratification pass. Extracted and assigned stable IDs from existing docs
         (68 FR, 24 NFR, 22 FLOW, 58 ENT, 9 IA, 18 PAGE, 42 COMP) into ID_REGISTRY.md and built
         TRACEABILITY_MATRIX.md. Ran each stage gate 00-14. Documentation stages pass on completeness;
         those requiring confirmation are set to `needs-user-confirmation` pending one batch sign-off.
Rationale: User chose option A to firm up the foundation with traceability before backend work.
Source: Repo docs + subagent ID extraction, 2026-06-20.
Affected Artifacts: ID_REGISTRY.md, TRACEABILITY_MATRIX.md, ARTIFACT_MANIFEST.yaml (stages 00-14).
Invalidates: none.
Owner: agent
Revisit Trigger: User confirms the extracted IDs/specs -> promote stages to `passed`.
Status: active
```

```text
ID: DEC-005
Date: 2026-06-20
Stage: consistency-gates (cross-artifact)
Type: accepted-risk
Decision: Cross-artifact consistency gate returns FAIL on the upstream->downstream orphan scan: every
         backend-bearing FR currently lacks an API operation and a backend test, because the service
         contract (stage 15) and backend implementation (stage 16) do not exist yet.
Rationale: Expected for a frontend-first project mid-build; not a defect, but it blocks any claim of
          end-to-end completeness. Recorded so it is not mistaken for done.
Source: TRACEABILITY_MATRIX.md > Orphan Scan; consistency-gates.md.
Affected Artifacts: TRACEABILITY_MATRIX.md (GAP-002, GAP-003), manifest consistency_gate.status.
Invalidates: blocks stage 17 (integration-release) until chains close.
Owner: user+agent
Revisit Trigger: After service contract (15) + backend TDD (16) close the broken chains.
Status: active
```

```text
ID: DEC-006
Date: 2026-06-20
Stage: 11-frontend-implementation (remediation)
Type: user-confirmation
Decision: FULL ALIGNMENT — the existing specs are authoritative; the implementation will be changed to
         match them. All P0 decision points resolve in favor of the spec:
         (R0-1) migrate UI primitives from @base-ui/react back to shadcn/ui on Radix (locked baseline);
         (R0-4) add all 13 missing domain entities to types + fixtures;
         (R0-6) align field/enum types to the data model (Learning.confidenceScore int; relationType free string);
         (R2-7) create the mandated directory structure (public/fixtures/, features/<page>/{components,tests}).
         Execute the full P0+P1+P2 backlog in REMEDIATION_BACKLOG.md.
Rationale: User chose "需要全量对齐" (full spec conformance) over amending specs to accept current code.
Source: User instruction 2026-06-20.
Affected Artifacts: entire frontend; REMEDIATION_BACKLOG.md; manifest stages 06-12.
Invalidates: current frontend visual baselines (must re-baseline after fixes, R2-9).
Owner: user
Revisit Trigger: If scope/effort (≈5-8 wks) forces a phased cut.
Status: active
```

```text
ID: DEC-007
Date: 2026-06-21
Stage: 11-frontend-implementation (remediation execution, host)
Type: scope-change / gate-result
Decision: Executed the DEC-006 remediation backlog on the host and re-ran the stage-09
         frontend-implementation gate. Result: PASS (with one documented residual). Stage 11 promoted
         draft/fail -> passed/pass; implementation_gate fail -> pass.
Work done:
  - INC-3 (host-only): migrated all 18 ui/* primitives @base-ui/react -> shadcn/ui on Radix
    (radix-ui 1.6.0); removed @base-ui/react; components.json new-york. 0 @base-ui imports remain.
  - INC-5 milestones A-D: de-dup ProjectStageStepper; extract analytics layer
    (AudienceBreakdown/RetentionChart/HorizontalBarsChart/InsightCard), resource layer
    (AssetCard/MediaPreview/AssetDetailPanel), SearchField; move Pagination/ViewModeToggle/SortSelect to
    components/navigation; rename to spec (PlatformIcon/InsightCard/RetentionChart/AudienceBreakdown);
    public/fixtures/ + canonical.json generator; pin Node 24 LTS. Shared components ~10 -> 20.
  - INC-1/INC-2/INC-4 (prior sandbox work) re-verified GREEN under full host build.
Verification: `cd frontend && pnpm verify` GREEN — ESLint 0, tsc 0, 398 tests (38 files), next build OK.
Residual (non-blocking, recorded in STAGE-09-GATE-RERUN.md): RISK-007 tail — single-use content
  components (ArtifactListItem/KnowledgeListItem/EvidenceCard/FileThumbnail/VersionCard) left inline per
  SPEC §8; FilterBar + per-page search unification (R2-3); ui/* sweep (R2-6); test-dir relocation (R2-7);
  stage-12 visual re-validation (R2-9, design-locked references).
Rationale: User chose full INC-5 scope; highest-value/lowest-risk component work executed in committed,
          individually-verified milestones. Visual re-validation is stage-12 and excluded from `pnpm verify`.
Source: Host execution 2026-06-21 on branch remediation/frontend-spec-alignment.
Affected Artifacts: ARTIFACT_MANIFEST.yaml (stages 11/12, increments, implementation_gate),
          STAGE-09-GATE-RERUN.md, entire frontend ui/components layers.
Invalidates: CODE_RECONCILIATION.md FAIL verdict (superseded by STAGE-09-GATE-RERUN.md PASS).
Owner: agent (DEC-006 user-authorized)
Revisit Trigger: Stage-12 visual validation; or if the user wants the R2 tail completed.
Status: active
```

```text
ID: DEC-008
Date: 2026-06-21
Stage: 15-service-contract (15a)
Type: scope-change / build
Decision: Advanced the pipeline (user chose "build the backend") by executing stage 15a — the
         FE↔BE service contract — as the foundation that unblocks all parallel module verticals.
Approach: Zod-first shared package `@creatoros/contract` (approach C), pure TS, transport-agnostic.
Work done (TDD, on branch feat/service-contract off remediation/frontend-spec-alignment):
  - Framework: envelope (SPEC §14) + primitives + defineEndpoint registry + typed client + Transport iface.
  - 15 modules (projects exemplar + 13 fanned out via a 14-agent workflow) of resource DTOs + operations,
    translated field-by-field from types/domain.ts; 4 page composition DTOs.
  - registry.test asserts the surface == SPEC §13 exactly (76 routes, each once, unique ids) — caught +
    fixed an ai/projects key collision and a GET /search duplicate (page layer owns it).
  - traceability.test: every endpoint traced; each GAP-002 named backend-bearing FR covered.
Verification: contract gate typecheck 0, 20 files / 60 tests green; frontend untouched (398 tests pass).
Result: stage 15 -> draft/gate-pass (15a); frontier -> 16-backend-tdd. Closes the CONTRACT half of GAP-002.
Not done (separate specs/plans): 15b (FE MockTransport + read migration + mutation wiring — makes the
  buttons real), stage 16 (backend TDD against these schemas), stage 17 (MockTransport->HttpTransport swap).
Source: User instruction 2026-06-21 ("选择2" — build the backend).
Affected Artifacts: contract/ package; ARTIFACT_MANIFEST stage 15/frontier; TRACEABILITY_MATRIX GAP-002.
Owner: agent (user-directed)
Revisit Trigger: Start 15b or stage-16; or reconcile fine-grained per-operation FR ids.
Status: active
```

```text
ID: DEC-009
Date: 2026-06-21
Stage: 15b (FE mock-backend) + AI-orchestration design/foundation + contract seam fix
Type: scope-change / build / gate-result
Decision: Under the /goal "启动workflow开发前后端程序 以及联调" directive, advanced the pipeline in
         workflow mode (sequential TDD pipelines, one agent per plan task, verify+commit, halt-on-fail).
Work done (branch feat/service-contract, worktree frontend-implementation):
  - AI EXECUTION LAYER (new): designed + built. Spec 2026-06-21-ai-orchestration-agent-sdk-design.md
    (unified Claude Agent SDK substrate; AITask=query() on a worker; in-process creatoros MCP tools;
    submit_candidate is the SOLE write boundary; confirmResult is AI-free; awaiting_confirmation added
    to AITaskStatus). Plan 2026-06-21-ai-orchestration-foundation.md executed Tasks 1-10 (Wave 1):
    new @creatoros/ai-worker package (state machine, candidate schemas, ports, context tools,
    config resolver, fake runner, orchestrator, confirm) — SDK-free, 27 tests green. Task 11 (real
    SDK query() runner + script-rewrite Skill + manual smoke) deferred (needs binary + API key).
  - 15b (Wave 2): executed plan Tasks 1-8 — MockBackend store (deterministic clone + seeded ids),
    MockTransport + lib/contract-client (composition root), Dashboard read seam + loop, Projects
    read+write handlers (§12), Projects page async reads, and the Projects buttons wired
    (createProject/transitionProjectStage/patch/archive + refresh). viewModel? seam + isActiveRoute
    gate preserved; no assertions weakened.
  - CONTRACT SEAM FIX: @creatoros/contract switched NodeNext .js specifiers -> bundler resolution
    (module:esnext/moduleResolution:bundler, extensionless across 36 files). NodeNext .js barrels were
    unresolvable by Next 16/Turbopack (dropped ENDPOINTS/createClient at build); the whole consuming
    stack is bundlers (FE Turbopack, stage-16 BE = Next.js, vitest). Supersedes DEC-008's
    "exports ./src/index.ts" packaging note (still source-direct; just bundler-resolved).
  - AITaskStatus: added awaiting_confirmation in contract primitives + frontend domain.ts.
Verification: frontend `pnpm verify` GREEN (lint 0, tsc 0, 420 tests + 1 todo, Turbopack build OK,
  all 18 routes); contract typecheck 0 / 61 tests; ai-worker typecheck 0 / 27 tests.
Result: FE now consumes the contract via MockTransport with real Projects mutations; the FE↔BE seam
  builds clean. Closes the FE half of GAP-002 for the Projects vertical. Frontier -> 16-backend-tdd.
Not done: 15b Task 9 manifest promote (this entry stands in); other FE verticals (reuse 15b foundation);
  AI worker Task 11; stage 16 backend; stage 17 MockTransport->HttpTransport 联调.
Source: /goal workflow execution 2026-06-21 (Waves 1-2).
Affected Artifacts: ai-worker/ (new), frontend/ (mock-backend + projects), contract/ (seam + status),
  docs/superpowers/{specs,plans}/2026-06-21-*; ARTIFACT_MANIFEST stage 15b/AI/frontier.
Owner: agent (user-directed)
Revisit Trigger: Start stage-16 backend TDD; or wire AI worker Task 11.
Status: active
```

```text
ID: DEC-010
Date: 2026-06-21
Stage: 17-integration (FE↔BE 联调 seam, thin slice over the 15b mock store)
Type: scope-change / build / gate-result
Decision: Brought the FE↔BE integration (联调) forward over the 15b mock store, ahead of full
         persistence, because a runtime gap demanded it: 15b client islands imported the
         MockTransport-bound client, which in the browser mutates a browser-LOCAL store the server
         never sees (and bundles the mock backend into the client). So island buttons did not truly
         persist across router.refresh(). The fix IS the integration.
Work done (branch feat/service-contract):
  - HttpTransport (lib/http-transport.ts): client-safe; POSTs {id,input} to /api/v1/dispatch.
  - Composition split: lib/contract-client.ts -> HttpTransport (browser islands; no server imports
    -> mock backend stays out of the client bundle); lib/contract-client.server.ts (server-only
    guard) re-exports an in-process MockTransport client (server pages/route);
    server/mock-backend/in-process-client.ts is the guard-free variant for in-process tests.
  - Route app/api/v1/dispatch/route.ts: RPC dispatch by endpoint id -> mockTransport over the SERVER
    store -> contract envelope. STAGE-16 SWAP POINT: replace the transport behind this route with a
    persistence-backed one; HttpTransport + contract + pages are unchanged.
  - Tests: route.test proves the create->persist->list round-trip; http-transport.test the fetch
    shape; vitest stubs server-only/client-only (guards stay live in the Turbopack build).
Verification: frontend `pnpm verify` GREEN (lint 0, tsc 0, 426 tests +1 todo, Turbopack build OK, 18
  routes); client-bundle audit: getStore/handlers NOT in client chunks (only a pre-existing
  shell-router->canonicalDataset import remains, out of scope).
Result: real HTTP FE↔BE round-trip over the contract for the Projects vertical; island mutations now
  persist server-side. The "swap a line at stage 17" promise is realized as "swap the transport behind
  one route." Frontier -> 16-backend-tdd (real persistence behind the dispatch route).
Not done: stage-16 real persistence (Drizzle/Postgres; the TDD-PLAN uses Testcontainers — a
  Docker-vs-pglite test-infra decision is pending before that wave); other FE verticals (reuse this
  seam + 15b foundation); AI worker Task 11.
Source: /goal workflow execution 2026-06-21 (Wave 3, done inline for RSC-boundary safety).
Affected Artifacts: frontend/ (lib/*, app/api/v1, mock-backend, pages, vitest.config, server-only dep).
Owner: agent (user-directed)
Revisit Trigger: Stage-16 persistence behind /api/v1/dispatch; or fan out the remaining verticals.
Status: active
```

```text
ID: DEC-011
Date: 2026-06-21
Stage: 16-backend-tdd (Projects persistence slice) + 17 live cutover
Type: scope-change / build / gate-result
Decision: Executed a real-persistence slice and cut the live app over to it, so the FE↔BE 联调 round
         -trip is durable SQL, not the in-memory mock (closing the gap the Stop-hook flagged).
Infra decision: pglite (pure-WASM Postgres) instead of the TDD-PLAN's Testcontainers — runs in vitest
         AND the Next server with no Docker; Drizzle schema/queries identical to a real Postgres.
Work done (branch feat/service-contract):
  - NEW @creatoros/backend package: Drizzle schema (projects, project_activities) + pglite db factory
    (in-memory for tests / dataDir-capable) + ProjectRepository (list/get/create/patch/archive/
    stage.transition/activity, replicating the mock §12 semantics, injected clock+id for determinism)
    + createPersistenceTransport (contract Transport; UnsupportedOperationError -> caller falls back).
    typecheck 0, 8 pglite-backed tests.
  - LIVE CUTOVER: frontend compositeTransport (server/persistence-client.ts) = persistence for the 7
    project-entity ops + mock for the rest, used by BOTH server pages (contract-client.server) and the
    /api/v1/dispatch route -> server reads and island writes share ONE pglite store -> a created
    project persists in SQL and survives router.refresh(). An ownership set keeps pglite out of the
    static build; next.config serverExternalPackages externalizes the WASM. Deterministic seed
    (canonical) + clock/ids keep test/visual parity.
Verification: frontend `pnpm verify` GREEN (lint 0, tsc 0, 427 tests +1 todo, Next build OK WITH pglite,
  /api/v1/dispatch route live); backend typecheck 0 / 8 tests; route.test proves create->persist(SQL)->
  list + mock fallback.
Result: a COMPLETE vertical slice through the whole stack now exists and is proven —
  contract -> FE (HttpTransport) -> /api/v1/dispatch -> compositeTransport -> pglite SQL -> envelope ->
  render, durable. The "swap the transport behind one route" promise is realized with real persistence.
Not done (now pure fan-out of a proven path): the other 6 project ops' outputs/tasks persistence + the
  other module verticals (Knowledge/Assets/Artifacts/Publishing/Analytics/Reviews/Learnings/AI/
  Notifications) — each = a Drizzle schema + repository + add ids to PERSISTED_OPS, reusing this slice;
  dataDir for cross-restart durability; AI worker Task 11 (real SDK runner); extract /api/v1 into a REST
  surface if a standalone backend service is wanted.
Source: /goal workflow execution 2026-06-21 (Wave 4, inline for DB+RSC-boundary safety).
Affected Artifacts: backend/ (new pkg), frontend/ (persistence-client, contract-client.server, route,
  next.config), pnpm-lock; ARTIFACT_MANIFEST stage 16/17/frontier.
Owner: agent (user-directed)
Revisit Trigger: Fan out remaining verticals/ops; add dataDir durability; AI worker Task 11.
Status: active
```

```text
ID: DEC-012
Date: 2026-06-21
Stage: program scope (七步整合设计 adoption)
Type: scope-change / user-confirmation
Decision: ADOPT docs/CreatorOS-七步整合设计.md (Seven-Step Integration Design) into the program.
         It extends (does NOT refactor) the 6-stage trunk: adds a positioning gate, a monetization
         loop, a Candidate/AudienceSignal topic-intel layer, a Prediction/Rubric calibration loop, and
         cross-cutting PlatformAccount/ContentCalendar/StageTemplate/AI-relay. Its hard constraints
         C-2/C-3/C-4 ARE our proven patterns (DEC-011 persistence path / DEC-009 AI candidate-confirm /
         Ingestion idempotency), so the new modules slot into the same foundation/module-template/
         contract-op/pglite fan-out with zero architectural conflict.
User decisions (2026-06-21):
  1. Adopt, phased per spec §8.
  2. The "monetization-weighted" directional change (§2.0/§4.4/§6.2) is BAKED INTO the base-module
     plans BEFORE Wave 2/3 launch (no retrofit): ContentOutput.content_role (traffic/trust/conversion);
     MetricValue.metric_key extension (profile_visit/lead/inquiry/conversion/revenue…);
     AudienceSnapshot.dimension_type += intent/paying; Learning.learning_type += conversion types;
     Dashboard/Publishing surface conversion/lead as first-class metric columns. Touches the Projects/
     Analytics/Reviews/Learnings/Publishing/Dashboard module plans (+ a small contract v0.3 for
     content_role on contentOutputResource & any enum/key additions that cross the wire).
  3. The 6 NEW modules (positioning, monetization, candidate+audience-signal, calibration,
     platform-account, content-calendar) are appended as Waves 5-7 AFTER the base 16 (Waves 1-4),
     in spec §8 priority order (P0: monetization+candidate+calibration → P1: positioning+
     platform-account+content-calendar → P2: stage-templating+AI-relay+eng-debt). Each gets a
     modules/<n>-<module>.md plan via the same generation+fan-out; needs a contract v0.3 op/DTO pass.
  4. ID governance: PRAGMATIC continuation (append new FR/ENT/etc. as new segments) — NOT the spec's
     formal C-1 freeze ceremony, consistent with how this build has proceeded.
Execution timing: edits to base-module plans (#2) happen AFTER the running Wave 1 (Taxonomy/
  Notifications/Search/Settings) completes and BEFORE Wave 2 launch, to avoid worktree contention.
Source: user instruction 2026-06-21 (pointed at the new spec, "看能怎么落地" + 3 confirming answers).
Affected Artifacts: docs/CreatorOS-七步整合设计.md (status→adopted); upcoming contract v0.3; base-module
  plans (Projects/Analytics/Reviews/Learnings/Publishing/Dashboard); new module plans (6); program waves.
Owner: agent (user-directed)
Revisit Trigger: Wave 1 done → bake the directional change into Wave 2/3 plans; after base waves →
  generate the 6 new-module plans + contract v0.3.
Status: active
```

```text
ID: DEC-013
Date: 2026-06-22
Stage: process (orchestrator workflow hardening + manifest reconciliation)
Type: scope-change / process-improvement
Decision: (A) Reconcile ARTIFACT_MANIFEST.yaml to repo reality, and (B) add an in-repo executable process
         layer so the manifest can never silently go stale again, modeled on industry practice.
Problem found (audit 2026-06-22): the manifest's `stages:` block was a frozen 2026-06-20 snapshot that its
         own DECISION_LOG (DEC-008..012) contradicted — it claimed backend "not-started / no code" while a
         real @creatoros/backend persistence slice, @creatoros/contract v0.4.0, an ai-worker, and a live
         FE↔BE↔SQL Projects round-trip already existed on feat/service-contract (317 commits ahead of main).
         Required artifact CHANGE_IMPACT.md was missing; API/TEST/MOCK/ASM IDs referenced but never
         instantiated; consistency_gate=fail was non-blocking; failing gate verdicts were "invalidated"
         rather than retained; the workflow definition lived only in an external, unpinned skill install.
Work done:
  (A) Manifest reconciled: header + project block (work_branch, topology, honest notes); stages 13/15/16/17
      corrected to match DEC-008..012; consistency_gate reason updated + marked blocking for stage 17;
      added reconciliation + reference blocks; OPEN-003 resolved, OPEN-004 (ID governance accepted-risk) and
      OPEN-005 (untracked control artifacts on wrong branch) added.
  (B) New orchestrator/process/ layer (in-repo, version-pinned — fixes "definition lives external/unpinned"):
      - reconcile.mjs: drift detector / executable gate. Validates manifest against JSON Schema, checks
        each build-claim against git+filesystem reality on the work branch, enforces the blocking-consistency
        rule (no `passed` downstream of a failing release-critical chain unless `accepted-risk`), and flags
        manifest staleness vs the latest DEC. Exits non-zero on drift (CI-as-gate).
      - manifest.schema.json: structural + enum validation for the manifest.
      - rules/orchestrator-state-machine.md: pinned copy of the external skill rule (reproducible audits).
      - README.md: best-practice mapping (CI-as-gate, Terraform/GitOps drift, policy-as-code, DO-178C
        bidirectional traceability, ADR immutable history).
  (C) Created CHANGE_IMPACT.md back-filling CI-006/009/012 (the previously-missing required artifact).
Policy set:
  - FAIL HISTORY IS RETAINED: a failed gate verdict superseded by a later pass keeps its record + a delta;
    it is NOT marked `invalidated`. (Corrects the DEC-007 pattern; anti snapshot-laundering, ADR-style.)
  - DRIFT IS CHECKED: trust the manifest only after `node orchestrator/process/reconcile.mjs` passes.
Rationale: User /goal — "参照业界优秀实现解决 orchestrator 工程问题，并修复 manifest 等问题."
Source: Two-agent audit (artifacts + repo reality) 2026-06-22; skill rules at
        ~/.skills-manager/skills/product-to-code-orchestrator/.
Affected Artifacts: ARTIFACT_MANIFEST.yaml, DECISION_LOG.md, CHANGE_IMPACT.md (new), orchestrator/process/* (new).
Invalidates: none (corrects bookkeeping; no code/spec change). Does NOT alter any DEC-001..012 verdict.
Owner: agent (user-directed via /goal)
Revisit Trigger: Backport the executable-gate + retained-history changes into the external skill; or commit
        the control artifacts onto feat/service-contract (OPEN-005).
Status: active
```

```text
ID: DEC-014
Date: 2026-06-22
Stage: process (long-running autonomous harness)
Type: scope-change / process-improvement
Decision: Add a long-running autonomous harness so the orchestrator can run UNATTENDED for hours/days to
         implement the remaining verticals, following Anthropic's official "Effective harnesses for
         long-running agents" (three-agent initializer/coding/evaluator + progress checklist + commit-per-step).
Work done:
  - progress.json — feature-grained task queue, DERIVED from work-branch reality via process/progress.mjs
    (not hand-written). 21 verticals; honest status: only `projects` persisted, 20 scaffolded, 0 e2e_verified
    (matches the ~30% maturity note). `e2e_verified` is human/evaluator-set, never inferred.
  - process/progress.mjs — generate (from git reality) / status / next (the loop's task picker).
  - process/harness/ — README (3-agent model + run via /goal, headless loop, or GitHub Action), init.sh
    (initializer), coding-agent.md, evaluator.md, settings.autonomous.json (permission allowlist +
    Stop-hook = reconcile.mjs, for unattended runs only — NOT always-on project settings).
  - rules §"Autonomous Mode": scope-envelope pre-authorization replaces synchronous per-stage gates; an async
    decision queue lets the loop continue on unblocked verticals while a human answers asynchronously.
  - Backported to the skill (both copies) so future projects inherit the harness.
Rationale: User asked to research Anthropic's official long-running-agent practice and make the skill support
         it. Research confirmed the three-agent harness + /goal + self-verification + fresh-context-per-step.
Source: anthropic.com/engineering/effective-harnesses-for-long-running-agents; Claude Code /goal; Agent SDK.
Affected Artifacts: progress.json, process/harness/*, process/progress.mjs, rules (updated), skill copies; a
         detailed KB doc written to ThirdSpace (03-知识).
Invalidates: none (additive process layer; no code/spec change).
Owner: agent (user-directed via /goal)
Revisit Trigger: Run init.sh and drive the loop; or wire the GitHub Action on feat/service-contract.
Status: active
```

## DEC-012 (2026-06-23) — page-spec 交互契约缺口补全

**背景**:用户撞见首页"最近发布"显示 publication id + 0 播放、"本周播放趋势"恒空、多 tab 未实现。
根因:`frontend/specs/page-specs.md` 只定义了组件树+视觉还原,从未定义每个按钮/tab 的动作+数据来源+状态。

**决策**(用户选「全量 17+ surface 交互契约」):产出 `frontend/specs/INTERACTION_SPEC.md` —— 对 22 个
surface 全量只读审计(6 并行 agent),逐元素定死 动作→数据来源(契约op)→状态。共 344 元素行、
158 处 ❌/⚠️ 缺口。已分 P0/P1/P2 backlog,按 3 波实现,每波跑 gate。

**影响**:08-page-spec 增补交互契约维度(此前 gate 仅覆盖视觉);11-frontend-implementation 据此分波做真。
**风险接受**:成熟的 Positioning/Monetization/Accounts/Calendar/Topics 本轮不动。
