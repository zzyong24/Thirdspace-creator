# Decision Log — CreatorOS

Record confirmations, assumptions, tradeoffs, accepted risks, and skipped stages so future agents do not need chat history.

---

```text
ID: DEC-POS-623
Date: 2026-07-29
Stage: T-623 PLAN / CONTRACT
Type: user-confirmed-product-semantics
Decision: 定位中心右上角统一为“新建定位母版”。确认后清空当前账号 profile 的画像、
          facets 与 downstreamRules，并以 statement_version_floor 建立新的当前母版边界；
          positioning_statements 继续不可变保留，边界之前的历史不再成为 currentStatement。
          随后只打开既有定位 AI 对话并预填从头访谈，不自动发送、不由 AI 直接写库。
          复盘页“帮我复盘”不再打开全局 Copilot，而是预填既有项目编导右栏，用户发送后
          复用 review.analyze。定位编辑点击外部不得关闭。
Rationale: 现有重新定位只清前端表单，旧规则仍会进入 AI 上下文；物理删除定位陈述又破坏
           不可变审计。复盘页已有右栏却再弹全局面板，造成双入口和会话混淆。
Source: 用户 2026-07-29 截图与明确指令。
Affected Artifacts: positioning contract/service/repository/schema、定位中心交互、项目阶段
                    DraftChatRequestProvider、复盘入口、相关测试与追溯。
Explicit Limits: 不删除历史定位陈述；不新增第二套 Copilot 或 review 工具；不自动发送
                 预填话术；AI 候选仍须用户采纳后通过 backend service 落库。
Owner: user+agent
Status: active
```

```text
ID: DEC-LEARNING-001
Date: 2026-07-29
Stage: T-610 BUILD
Type: user-confirmed-product-semantics
Decision: 对话/复盘里由用户点击“采纳”或“存为经验”的内容，按当前用户与账号内的
          title+insight 稳定指纹去重，并直接成为 validated Learning，由知识库现有
          validated 投影立即展示；不再进入第二次裁决队列。AI 未经用户确认产生的候选
          仍保持 candidate。内容雷达保留跨轮次来源快照用于审计，但详情只按唯一 source
          展示，并回显最近采集时间与累计次数。
Rationale: 旧实现把已经经过用户确认的采纳再次降成 candidate，造成“已沉淀”但知识库
           不可见；刷新后还可重复插入。雷达详情把一个来源的三次历史快照误画成三条来源，
           与作品卡“1 个来源”的真实口径矛盾。
Source: 用户 2026-07-29 明确要求“经验需要去重，然后直接进知识库即可”，并要求核对采集
        是否去重。
Affected Artifacts: learnings.create 既有 operation 语义、Learnings service/repository、
                    learning migration、知识库 validated 投影、内容雷达详情来源证据。
Explicit Limits: 不新建第二套知识库表；不物理删除历史重复经验或跨轮次来源快照；不同账号
                 不互相去重；不同 source 发现同一作品时仍分别展示。
Owner: user+agent
Status: active
```

```text
ID: DEC-MODEL-619
Date: 2026-07-29
Stage: T-619 REMEDIATION / CONTRACT
Type: user-confirmed-authority-correction
Decision: Activity 的 config.pull ticket/introspection 只证明 projectKey/channelRef 与授权事实，
          不再提供权威 clientId。Creator 请求 Activity 时不得把自报 clientId 当授权依据；
          旧 ticket 响应若仍带 clientId 只兼容忽略。Creator 仅向 Growth 声明接受的
          extension/protocol，由 Growth registry 解析并签入最终 clientId；Creator 验签
          bundle 时继续强校验 Growth 签入的 creatoros.desktop 和协议。
Rationale: 应用/客户端目录唯一归 Growth，Activity 不拥有客户端目录，不能反向授权 clientId。
Affected Artifacts: T-606 Creator contract、creator-client-config-consumer-v1、Creator
                    config.pull request/parser/tests、T-619 validation、CHANGE_IMPACT。
Compatibility: 在 Growth/Activity 最终字段契约落定前，Creator parser 兼容旧响应字段但不信任；
               该兼容不允许恢复 request clientId，也不允许跨 locator 比较版本或 ETag。
Status: active（整改代码已验证；正式三端联调与独立复审前 release NO-GO）
```

```text
ID: DEC-MODEL-606
Date: 2026-07-29
Stage: T-606 PLAN / CONTRACT
Type: user-confirmed-authority-correction
Decision: CreatorOS 继续使用既有 config.pull ticket 和当前激活 locator。verified configured
          渠道 JSON 是当前模型配置权威，即使 Key/URL/model/provider 错误或模型调用失败也
          不回退本地；明确未配置、不可达且本次未取得 JSON、或安全校验失败时才使用本地。
          用户本地配置始终允许编辑并作为 inactive 备用。
Rationale: Growth T-086 最终契约与 2026-07-29 用户确认明确取代旧 T-575/T-604 设计。
Supersedes: T-575 的三键 parser/长期 Key 禁止/24h 远端 LKG；T-604 的 Gateway、短 bearer、
            introspection、alias routing、managed_locked 与远端 LKG 优先。
Invariant: Activity 只证明 projectKey/channelRef 授权；Growth-signed clientId 与其二者共同
           组成配置版本 locator。渠道 JSON/Key 不进入 URL、日志、错误、审计摘要或 Web 响应。
Authority: Growth docs/contracts/T-086-creatoros-managed-model-service.md
           SHA-256 be1d4546b080e8b30144e31dd20d2e094d82b66d3c57d0f6116782fb89650182；
           T-086-review-concern-resolution.md
           SHA-256 68bd438f9893a7c4508cff396274e893cb630d7ad488109e6b91430f18cdbc0f。
Status: active（独立评审通过前不得 BUILD）
```

```text
ID: DEC-PKG565-002
Date: 2026-07-27
Stage: T-565 PLAN / RAT
Type: user-confirmed-external-execution
Decision: 授权 agent 创建、推送并操作 T-565 的原生 Windows RAT 工作流；GitHub Actions
          费用不设上限，由 agent 根据验证需要持续运行和修复，直到 Product Gate 所需的
          Burn payload/cache/代理/中断、Win32 current/journal kill recovery 与 reparse
          containment 证据形成。
Rationale: T-565 重写 SPEC 的 cross-family Round 1 唯一未闭环 blocker 是原生 Windows
           可行性证据；本机没有 Windows/Wine/VM，私有仓 GitHub-hosted Windows runner
           是当前可执行的真实 Win32/NTFS 环境。用户明确回复“授权运行windows rat
           没有费用上限 你来操作”。
Pattern-Ref: PAT-001
Pattern Tier: T1（WiX Burn 直接采用 + CreatorOS 窄事务 worker；命中 BG-003 官方方案、
              BG-005 覆盖 acquisition/trust，worker 只补产品事务缺口）
Affected Artifacts: T-565 SPEC/review、Windows RAT workflow、RAT evidence、BACKLOG。
Explicit Limits: 仅授权验证和为验证所需的 branch/workflow push；不创建或发布 GitHub
                 Release，不对用户分发安装包，不将 RAT spike 冒充生产实现。
Supersedes: DEC-PKG565-001 的“不得触发付费 Windows runner”限制；其他限制继续有效。
Owner: user+agent
Status: active
```

```text
ID: DEC-PKG565-001
Date: 2026-07-27
Stage: T-565 PLAN
Type: user-confirmed-architecture-direction
Decision: 重选 CreatorOS Windows Runtime 交付架构。默认发布小型 Web Installer，同时保留
          完整 Offline Installer；两者使用同一签名分层 Runtime Image 与安装事务。setup
          必须完成全部必需 runtime 的下载/读取、校验、物化和 smoke；正式应用首启完整
          runtime 解压次数恒为 0。必须实质减少 node_modules/JS 散文件，不能只把原 tar
          改成联网下载。Windows 正式安装树不得保留通用 node_modules/源码项目结构；纯
          JS/JSON 优先 bundle，只有 Chromium、媒体工具、WASM、native addon、migrations
          等有真实路径要求的资产可进入签名 allowlist。安装失败不得显示成功或转移给首启修复。
Rationale: Windows 0.2.0 真机在安装后白屏约 30 分钟，已确认是在处理大量小文件。现有
           NSIS POSTINSTALL 失败后保留 tar、首启 AppData 兼容解压的 fail-forward 破坏
           “安装完成即可使用”与诚实失败边界；当前 runtime 26,381 个文件中 24,756 个来自
           node_modules，在线下载本身不能消除 NTFS/Defender 小文件成本。RAT-565-01 已证明
           高置信 prune 可把普通文件减至 16,381（-37.91%）且真实能力 smoke 通过，但距离
           ≤5,000 仍必须进行 production closure bundle；`pnpm deploy`/Next standalone/压缩
           容器都不能单独成为最终解法。
Architecture Refinement: 实际 Tauri 壳与四层 runtime 组成不可变、版本化 compatibility set；
                         固定 shortcut 只启动稳定 launcher，installer 在 pending set 真 smoke
                         后以单一 `current` 指针同时切换壳与 runtime。0.2.0 首迁移不信任旧 tar
                         为新 layer，必须全量取得新签名 layers，并在提交前保留 legacy fallback。
                         默认 Web 发布阈值：首装 ≤500 MiB、core-only 更新 ≤100 MiB、每成功
                         安装 CDN 成本 ≤US$0.10；超限阻断或另开 DEC。
Source: 用户 2026-07-27 明确要求“必须得 setup 阶段完成小文件的解压缩，并且必须合理的减少
        小文件”；在收到“默认 Web Installer + 保留 Offline Installer”的推荐与确认请求后
        回复“启动”。
Affected Artifacts: T-565、Windows runtime packaging、installer、updater、release workflow、
                    desktop startup resolver；替代 T-487 的 Windows 交付条款。
Invalidates: T-487/T-493 中“NSIS hook 失败后首启兼容解压可作为发布兜底”以及 T-487 已完成的
             Windows 零解压验收结论；macOS 交付条款不受影响。
Explicit Limits: 不触发付费 Windows runner、不发布安装包、不改变领域数据存储、不把必需
                 runtime 改成应用首启/功能首次使用时按需下载。
Owner: user+agent
Revisit Trigger: Windows 原生 RAT 证明 WiX Burn/少文件方案不可行，或用户改变在线/离线分发取舍。
Status: active
```

```text
ID: DEC-MC-002
Date: 2026-07-26
Stage: T-501 4-build
Type: user-confirmed-scope-reduction
Decision: T-501 只做现有模型设置页的轻量优化：减少普通用户配置项；“保存并测试”复用正式
          modelFor + streamText 并验证非空文本；补官方预设、New API/中转站、Responses、
          Kimi 开放平台与 Kimi Code 教程。
Rationale: 用户明确指出模型配置需求没有原方案复杂。当前 Settings、T-471 Responses 和
           settings.models.put/test 已经存在，继续建设八槽总览、向导、能力平台和付费探测
           会扩大范围、增加配置负担并偏离真实问题。
Source: 用户会话“优化一下就行了……减轻用户配置负担，优化配置测试通路，补充教程文档即可”，
        2026-07-26。
Affected Artifacts: T-501 BACKLOG/任务详情、替代范围、应用内手册、模型预设、连接测试组合层。
Invalidates: 旧 T-501 PRODUCT SPEC/CONTRACT/PAGE SPEC 中的八槽总览、配置向导、能力平台、
             费用与付费 effect 均不进入 BUILD；旧文档只作为历史审计材料。
Explicit Limits: 不新增页面/公开 operation/数据模型；不依赖 T-517；不触发图片或视频付费调用；
                 轻量测试只承诺基础流式文本，不冒充复杂工具调用全兼容认证。
Owner: user+agent
Revisit Trigger: 用户明确要求新增模型管理页面、能力平台、计费或付费 provider 验证。
Status: active
```

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

## DEC-013 (2026-06-23) — 全量做真:建缺的 AI producer + 新增后端 op

用户对两个范围决策均选最完整:① 无 producer 的 AI 产物区 → **本轮新建缺的 AI producer 节点**(趋势/竞品/证据地图等),不留 fixture、不止于空态。② 需新增的后端契约 op → **全部做真含重活**(独立观众读 op、calibration predictions.list、knowledge 归档/解关联、跨项目对比、文件字节上传/下载等)。

**含义**:CreatorOS 走向完整目标产品,23 个 GAP 全部做真。按 INTERACTION_SPEC「目标设计与实现方案」分波实现(Wave1 P0 首页+复盘 → Wave2 P1 工作台/中心 → Wave3 producer 缺口+P2),每波 typecheck+test+渲染 gate 后合并。多会话推进。

## DEC-015 (2026-06-24) — P1 持久化底座:内存 pglite → 真 Postgres + 版本化迁移

**背景**:用户指出整套被当成"假的"——根因之一是 DB 是内存 pglite(`new PGlite()`),重启即回 seed,无真持久化。产品化第一阶段(P1)。
**决策**(用户批准 L2 门控自治产物):运行时切到真 Postgres(`drizzle-orm/node-postgres` + `pg.Pool`,读 `DATABASE_URL`),本地用 docker-compose 起库;引入 drizzle migrator 应用版本化迁移。**Pattern-Ref: PAT-002**(REAL-FORCE 命中:用户数据留存 + 唯一约束 + 将来部署)。
**验收实证**:杀进程重启哨兵行幸存(数据持久);db:migrate 建 72 表 + `__drizzle_migrations` 追踪 + 幂等;backend 9/3skip + 真PG集成 3/3 + frontend 1335 零回归;reconcile exit 0。
**Owner**:agent(用户 /goal + 批准)。**Status**:active。**Invalidates**:none(运行时底座替换,契约/服务/UI 不变)。

## DEC-016 (2026-06-24) — 迁移基线用现有 DDL 拼 0000_init(非 drizzle-kit generate)

**决策**(B 级实现取舍,自治时定):初始迁移 `backend/drizzle/0000_init.sql` 由现有 23 个 `*_DDL` 按依赖序拼出(脚本 `gen-baseline-migration.ts`),而非 `drizzle-kit generate` 从 pgTable 定义重生成。**理由(Pattern-Ref: PAT-001 borrow)**:DDL 已验证可用、零 schema 漂移,避免"一次性补完 23 张 pgTable 定义"的高风险;pgTable-as-单一真源留作后续增量。**已知代价**:future schema 变更要么补 pgTable 再 generate,要么手写增量迁移。**Status**:active。

## DEC-017 (2026-06-24) — hybrid 驱动 + pglite 保留 external

**决策**(B 级):`buildPersistence` 按 `DATABASE_URL` 选驱动——有→真 Postgres(运行时),无→pglite(vitest/无DB 环境);两者应用同一套迁移。pglite 保留在 `serverExternalPackages`(运行时加载但不用),以避免为"运行时不 import pglite"做高风险文件拆分。**理由**:保住 1335 测试在 pglite 上的 100s 快反馈(混合测试策略),且 12 个导入 persistence-client 的测试无需真 DB。**Status**:active。

## DEC-018 (2026-06-24) — 真PG集成测试覆盖表选择

**决策**(B 级,微调 spec):真 PG 集成抽样覆盖 `users`(identity)+`ai_tasks`+`ai_task_results`,做跨表 ownership join,而非 spec 原写的 `projects`。**理由**:projects 表 NOT-NULL 列多、构造脆;ai_tasks→ai_task_results 父子关系的 ownership 链更干净地验证"跨表所有权 + node-postgres 驱动 + 连接池"。`TEST_DATABASE_URL` gate,未设则 skip。**Status**:active。

## DEC-019 (2026-07-23) — 正式支持 Responses，并保留 T-471 历史 Gate 缺口

**来源与确认**：用户明确要求 CreatorOS 支持 OpenAI Responses，并以仓库同级的本地
`Thirdspace-api`（New API fork）协议兼容为目标；2026-07-23 再次确认应按
`product-to-code-orchestrator` 补全流程。

**决策**：

1. `apiFormat` 正式包含 `openai_responses`；`openai_chat` 与 Responses 显式分流，任何一侧
   失败都不得自动降级成另一协议。
2. 使用 Vercel AI SDK 与 Pi 已有 Responses 实现，不自研第二套工具循环。
3. T-471 的代码提交 `94cc40bc` 保留；追溯性 SPEC 只恢复“需求→契约→实现→测试”关系，
   不声称它在代码之前存在。
4. 没有留下当场输出的 TDD 红测判定为 **历史 Gate FAIL（保留）**，不得补拍成 PASS。
5. 真实 New API token + 实际模型调用会产生费用，未经用户单独授权不执行；发布前真端到端
   保持 `RISK-011`。

**影响**：FR-069、FLOW-023、API-008/009、TEST-001..008；见 CI-013 与
`GATE-T471-RETROSPECTIVE.md`。
**Status**：active；历史 TDD fail retained，外部付费 E2E pending。

## DEC-020 (2026-07-23) — Codex/Claude 共用 product-to-code-orchestrator 入口

**来源与确认**：用户指出 CreatorOS 既有交付模式由 `product-to-code-orchestrator` 管理，
更换 Agent 宿主不应改变流程，并要求补充 `AGENTS.md`。

**决策**：

- `AGENTS.md` 对 Codex、Claude Code 和其他 Agent 一视同仁：先读 BACKLOG/SPEC，再加载技能、
  校验版本、执行 stage-router，最后才可改代码。
- BACKLOG 状态只经 `taskctl` 转换；`pmem` 仅同步项目记忆。
- SPEC + BACKLOG 是计划，不再用 writing-plans 文档替代。
- 历史证据不得伪造；缺失只能记 fail、pending 或用户确认的 accepted-risk。

**影响**：Agent 会话入口与流程治理，不改变产品行为、数据归属或物理架构。
**Status**：active。

## DEC-CR-001..010、014..015 (2026-07-23) — 内容雷达产品边界与用户确认

**来源与确认**：用户提出把旧“信号源”整体重构为位于定位与选题之间的对标监控/内容情报工作区，并在 2026-07-23 明确确认评论、逐字稿、首批平台、登录和稿件阶段边界；同日明确认可采用抖音热点宝作为关键词黑马上游的最终方案。完整定义见
`docs/superpowers/specs/2026-07-23-content-radar-restructure-design.md`。

**决策**：

1. `DEC-CR-001/003`：一级导航为「内容雷达」；对标博主、我的收藏、网页/RSS、黑马关键词统一归入该域。
2. `DEC-CR-002`：雷达只把外部情报转成自己的选题候选；用户确认后写选题池，不在雷达中创建 Project 或稿件。
3. `DEC-CR-004/005`：运行以真实 run 为准，失败、受阻与真 0 条分开；“全部作品”只指平台当前公开且当前会话可访问的内容。
4. `DEC-CR-006`：用户从已确认选题创建 Project 后，才可在 Project 脚本工作区生成/改写稿件；高相似候选不得采纳为正式稿件版本，必须修改或重新生成。
5. `DEC-CR-007`：逐字稿只能由用户单条或批量手动发起，全部异步排队；来源同步不自动转写。
6. `DEC-CR-008`：评论只取公开数量，不抓正文；数量获取困难时诚实降级为 `null/未知`，不填 0，不阻断作品基础元数据。
7. `DEC-CR-009`：首批支持抖音、通用网页与 RSS；网页/RSS 需要登录时引导用户打开受控登录会话，登录后重新测试，不保存明文凭据。
8. `DEC-CR-010`：关键词黑马采用抖音热点宝 `low_follower_breakout`“低粉爆款”官方策展榜单，弃用已证伪的抖音原始搜索路径。热点宝复用 canonical appData 下按账号隔离、可由用户清除的抖音 profile；情报/任务域只保存 `browserSessionRef`，不读取、复制或记录原始 Cookie/短时签名。通用网页登录态继续由既有 `browser-sessions` 专用服务加密管理，不与抖音 profile 混为一套。热点宝只提供候选，仓内 `detectDarkhorse` 的固定 48 小时三档规则负责最终命中；粉丝数缺失即排除，明确零粉只走绝对阈值分支且赞粉比为 `null`，官方 rank/score 只作证据；产品不把策展榜单宣称为全站穷举。
9. `DEC-CR-014`：任何来自他人的对标、收藏、黑马/爆款等外部视频必须保留可点击原视频链接；仅有标题/摘要不得转为选题。用户必须先手动完成异步转写，系统锁定一个不可变逐字稿版本与哈希，先做结构拆解，再结合定位生成选题候选。选题与后续 Project 均引用同一 transform/逐字稿证据；具体稿件生成或改写只在 Project 创建后发生，原逐字稿不得直接变成 Project 稿件，高相似候选仍须编辑或重新生成。
10. `DEC-CR-015`：增加“复制抖音分享链接单条建档”。用户粘贴分享链接并选择分类后，系统必须解析真实作品 ID、作者稳定身份和 canonical 视频 URL；已有作者复用同一博主节点并补齐所选分类 membership，未有则创建默认不监控的新节点。同一作品的短链/长链幂等去重。本操作只建档，明确不得自动发起逐字稿，用户仍需手动异步转写。

**Gate 状态**：产品口径及热点宝方案均已获用户确认，`RAT-CR-003` 已通过；`DEC-CR-010` 独立 delta review 经两轮 CONCERNS 修订后于 2026-07-23 PASS。用户同日授权开启落地实现，并在 BUILD 中补充确认 `DEC-CR-014` 的链接、逐字稿拆解和跨阶段证据口径，以及 `DEC-CR-015` 的分享链接单条建档；两项均沿用既有抖音只读权限与手动转写边界。
**Status**：resolved（PLAN gate PASS，进入 Contract）。

## DEC-CR-011..013 (2026-07-23) — 内容雷达 Contract 技术边界（已确认）

1. `DEC-CR-011`：内容雷达跨 frontend/backend/worker 且有多消费者，命中 `PAT-004 CF-001/002/003/004`，新增交换点全部先进入共享 Zod contract 与 operation registry；模块内私有纯函数才允许直写。
2. `DEC-CR-012`：情报、来源、快照和任务为跨重启用户数据，命中 `PAT-002 RF-001/002/004`，使用现有真实数据库与 Drizzle 迁移。统一长任务在 `execution` 模块增加 DB-backed claim/lease/heartbeat/checkpoint；`MOD-006` 因不支持计划、重试、优先级和真实 backpressure 不采用，也不提前引入 Redis/BullMQ。
3. `DEC-CR-013`：五类 adapter 只返回统一候选信封；`intelligence` service 负责幂等、合并、来源观察、快照和 run 聚合。热点宝 adapter 不拥有“三档黑马”业务规则，领域层复用修订后的 `detectDarkhorse`。

**Status**：resolved。用户已于 2026-07-23 认可整体方案并明确要求开启落地实现；该 Contract
形成 scope envelope，在不改变产品方向、数据归属、安全、服务契约和发布标准的前提下持续
进入 Build。用户同日再次确认分享链接按“分类 → 博主 → 视频”建档，已有博主复用、没有则
自动创建。

## DEC-PKG-01..05 (2026-07-23) — 桌面打包候选方向（待用户确认）

**来源边界**：用户要求把 CreatorOS 打包欠债合并调研，并补查 Tauri 官网的 Windows
最佳实践。用户尚未授权 RAT、正式实现、付费构建或 Windows 正式发布；以下均为
`needs-user-confirmation`，不是已生效决策。

1. `DEC-PKG-01`：继续把 Windows x64 作为证据补齐目标；所有退出条件达成前不得宣称正式支持。
2. `DEC-PKG-02`：优先验证 runtime 跟随 Tauri 标准 NSIS `$INSTDIR`；只有 RAT 证伪才采用独立 runtimeRoot 与第二套选盘 UI。
3. `DEC-PKG-03`：比较消费版 `currentUser` 与现有 `both`；是否取消默认 UAC 待 fixture 证据和用户确认。
4. `DEC-PKG-04`：明确 WebView2 缺失口径；在联网小包与约增加 127 MiB 的完全离线安装器之间待用户选择，不采用官方不推荐的 `skip`。
5. `DEC-PKG-05`：Windows 对外发布前接入 Authenticode + timestamp；未接入时只允许明确标注的内部未签名包，updater minisign 不冒充 OS 签名。

**证据**：`docs/research/2026-07-23-tauri-windows-packaging-official-practices.md`；
`docs/superpowers/specs/2026-07-23-desktop-packaging-first-launch-design.md`。

**影响**：Windows 安装路径、权限提示、离线口径、更新/回滚与发布标准；未确认前
T-487 保持 PLAN，不能进入 BUILD。
**Status**：needs-user-confirmation。

```text
ID: DEC-AUTO-001
Date: 2026-07-24
Stage: 1-plan / T-517
Type: user-confirmed-architecture-direction
Decision: CreatorOS 自动化必须成为内置系统底座，而不是继续扩展采集专用 sourceKind。采用
          “轻量 Automation Kernel + typed handler 积木”方向：数据库持久 job/run、唯一 ticker、
          timezone/misfire/overlap/retry、持久 claim/recovery、(userId,accountId) 归属；旧六类
          采集、内容雷达与持久后台任务迁为 handler；上下文健康先保留 typed conformance seam，
          待 T-516 领域契约通过后再注册生产 handler/job/UI。仓内已有 execution_tasks 的 lease/heartbeat/
          recovery 能力上收并演进为唯一 automation_run，不永久保留第二个通用执行状态机。
          AutomationGrant 只授权已声明副作用，不替代 P-01 人工确认门：无人值守只可写运行账、
          用户已委托来源返回且可验证的采集 evidence，以及 pending/imported 预设投影；它们不是
          active 业务闭环。用户创建或启用来源/采集计划即构成该已声明范围的持续确认，不要求每条
          指标/评论逐次授权。`source=imported` 历史作品壳属于 evidence projection，可幂等创建，
          但转 manual/active、形成正式稿件/经验或驱动后续闭环仍须用户确认。AI/规则形成的创作、
          语义归纳、偏好和修复一律只产 candidate/decision/manifest。handler 以
          domainWriteClass + operation allowlist 获得最小 service port；旧 enabled job 只有能证明
          用户曾创建/启用相同范围的来源/计划时才可迁移该采集授权，其他高风险 effect 不伪造 grant。
          参考 pg-boss、Graphile Worker、BullMQ、
          Temporal/DBOS 的成熟语义，但不直接引入 Redis、Mongo、外部 orchestration service、
          通用 DAG 或任意用户脚本。
Rationale: 仓内事实证明旧 scheduling 的 schema/wire/trigger/run 全部绑定采集与 ai_task，
           继续增加枚举会把兼容成本扩散给每个新业务。用户明确要求“属于系统底座，其他能力
           往底座上堆积木”；轻量自研可复用现有 PGlite/Drizzle 和本地运行语义，同时保留
           pg-boss/Graphile 的 durable queue、handler registry、稳定幂等键等正确模式。
Pattern-Ref: PAT-002, PAT-003, PAT-004
Source: 用户会话确认（含 2026-07-24 对 P-01/R-INGEST 的产品裁决：自动化数据是预设/证据，
        真正进入系统闭环才需要人确认）+
        docs/research/2026-07-24-creatoros-automation-kernel-oss-research.md，2026-07-24。
Affected Artifacts: T-517 replacement PRODUCT SPEC；SYSTEM_ARCHITECTURE；scheduling/automation
                    contract、backend Kernel、自动化页；T-514/T-516 的定时执行依赖。
Invalidates: 直接给旧 scheduled_job/sourceKind 增 `intelligence.sync` 或 `context.health`；
             每个业务自建 setInterval/cron/run history；automation_run 与 execution_tasks
             永久双写；T-516 DEC-CTX-005 中“原表直接泛化 jobKind”的未确认方案。
Owner: user
Revisit Trigger: replacement SPEC 独立评审证明 PGlite 上的原子 claim/恢复不可行，或真实产品
                 出现必须跨机器持续运行的已确认需求。
Status: superseded-in-part by DEC-ODR-001（“生产预设积木、唯一 ticker、人工确认业务闭环”的
        用户方向继续有效；`automation_run/AutomationGrant/effect` 物理路线不再是当前输入）
```

```text
ID: DEC-AUTO-002
Date: 2026-07-24
Stage: 2-contract / T-517
Type: architecture-data-contract
Decision: Automation Kernel 物理上采用八张归属表：automation_jobs、automation_runs、
          automation_run_events、automation_grants、automation_compatibility_mappings、
          automation_effects、automation_command_receipts、automation_cutover_state。
          automation_run 同时是 durable queue 与用户历史；attempt 用 run 计数 +
          严格 typed append-only event 表达，不另造第二执行状态表。command receipt 为 job/grant/
          migration mutation 提供跨重启幂等重放；effect ledger 逐网络/模型/领域副作用保存
          reservation/receipt；cutover control row 是 writer/ticker generation 的崩溃恢复真相。
          所有状态 CAS、lease/attempt 更新和 event/receipt 同事务。用户 RPC、runtime port、handler
          capability port 共用一套 typed contract；
          handler 只获得 manifest + grant + domainWriteClass 三重交集后的 operation allowlist。
          旧 scheduledJobs/jobRuns 只走单写 compatibility adapter。用户创建/启用同范围只读采集
          可以迁窄 grant；高风险/扩范围任务待重新授权。
Rationale: 单一 run 消除 execution_tasks/job_runs 的双真相；append-only event 保留取消、重试和
           reconciliation 证据；最小 capability port 同时满足账号 ownership、P-01 确认门和
           SYSTEM_ARCHITECTURE 模块边界。PGlite RAT 已证明最小 transaction/CAS/lease 原语可行。
Pattern-Ref: PAT-002, PAT-003, PAT-004
Source: T-517 confirmed PRODUCT SPEC；用户确认①（2026-07-24）；
        docs/research/2026-07-24-automation-kernel-pglite-rat.md。
Affected Artifacts: API-AUTO-001..027；automation contract/resources/schema/runtime；
                    scheduling compatibility；intelligence execution task migration。
Invalidates: automation_run + execution_tasks 永久双写；frontend 业务 ticker；
             handler 直拿 repository/通用写库；每条采集 evidence 逐次弹窗确认。
Owner: user+agent
Revisit Trigger: Contract review 证明 PGlite 无法支持同事务 event/CAS，或产品新增跨机器 worker。
Status: superseded by DEC-ODR-001（历史 Round 3 FAIL 保留；本决定从未激活，不再进入确认队列）
```

```text
ID: DEC-CTX-005
Date: 2026-07-24
Stage: 2-contract / T-516
Type: architecture-data-contract
Decision: T-516 拟采用四项物理裁决，待确认②统一签核：
          ① ContextFact 每轮重建，不复制业务真值；report/issue/candidate/event/manifest 写入
          canonical Drizzle DB。② 复用 scheduled_job/job_run 与唯一 tick 历史，但把现有采集
          专用 dispatch 泛化为 jobKind，context.health 是零 LLM 的独立 executor，不伪装成
          收藏/采集源，也不新增 timer。③ Publishing 暴露 canonical publication 窄读 port，
          Context 不跨 repository 拼表。④ creator_profiles 增加 revision；repair confirm/undo
          用 SQL CAS，AI/worker 只产候选，确认后由 backend positioning/context service 原子落库。
Rationale: 结果需要隔天确认和撤销，命中 PAT-002 RF-001/002/004；扫描需导航后继续且有终态，
           命中 PAT-003 AF-002/003；设置、backend、Publishing、Positioning、AI runtime 是
           多边界多消费者，命中 PAT-004 CF-001/002/003/004。复用真调度历史同时泛化执行器，
           比新增 timer 或把治理任务塞进采集语义更一致。
Pattern-Ref: PAT-002, PAT-003, PAT-004
Source: T-516 SERVICE CONTRACT 仓内可行性核查，2026-07-24。
Affected Artifacts: T-516 SERVICE CONTRACT；contract/context operations；backend context、
                    scheduling、publishing、positioning；settings/Copilot consumers。
Invalidates: 第二套调度/run 表；前端/localStorage 持有结果真值；Context 直读他模块 repository；
             无 revision 的先读后写伪 CAS。
Owner: user（确认②后 active）
Revisit Trigger: 独立契约评审发现 blocker，或用户不接受任一物理裁决。
Status: superseded by DEC-ODR-001（未获确认、从未激活；旧 report/issue/candidate/event 与独立
        confirm/undo 物理方案不再进入决策队列）
```

## DEC-FDB-001 (2026-07-26) — 问题反馈是用户确认的窄化出网，不建设客服平台

**来源**：用户要求“有个能反馈 bug 的渠道，且直接反馈给我”，并指出此前把它扩成客服工单、
多角色、复杂保留与删除编排已经跑偏。

**决策**：

1. 入口放在 CreatorOS 设置中；用户先预览描述、最多 3 张截图和是否附加加密日志，再明确点击
   “发送问题反馈”。未点击发送时反馈网络请求必须为 0。
2. Web 只调用 Tauri typed RPC；Tauri 固定本地附件快照、取得新鲜签名授权并上传，Web 不获得
   绝对路径、激活码或日志明文。
3. Thirdspace Growth 只提供一个私有开发者收件箱，复用现有管理员认证、私有对象存储、事务
   outbox 和 worker runtime；不建设客服角色、状态流转、用户在线回查或 legal hold。
4. 接收内容固定 90 天后删除；日志始终是开发者公钥加密的 `.enc`，只有开发者离线工具可解密。
5. 该窄化出网同步写入产品宪法 P-04 与 NFR-PRIVACY；以后如要客服协作必须另立需求并重新确认。

**用户确认（2026-07-26）**：用户明确要求直接反馈给开发者，并认可先纠正过度设计、后续再讨论
流程框架优化。

**Status**：superseded by DEC-FDB-002（历史产品裁决保留；Growth 上传/收件箱不再是 BUILD 输入）。

## DEC-FDB-002 (2026-07-26) — 撤销应用内上传，问题反馈复用已配置 supportUrl

**来源**：对 DEC-FDB-001 的最终可实现性审计发现，仓库没有可直接用于生产的 Growth 私有反馈
对象存储、通知 adapter 和所需 license proof；继续补齐会再次把“直接反馈给开发者”扩成新平台。
同时 CreatorOS 已经通过签名 channel config 下发、缓存并净化 `supportUrl`。

**决策**：

1. DEC-FDB-001 中关于 Tauri 上传、Growth 私有收件箱、截图/日志服务端保存和 90 天清理的决定，
   在进入 BUILD 前全部撤销；该决定保留为历史，不再作为实现输入。
2. CreatorOS 提供本地反馈弹窗：整理并复制描述与最小诊断摘要，打开已配置的 `supportUrl`，
   并可打开本机加密日志目录。
3. 真正提交发生在开发者已经配置的外部反馈渠道。应用不自动上传截图或日志，也不能把“外部页面
   已打开”显示成“反馈已发送”。
4. 未配置 `supportUrl` 时必须诚实提示，同时保留复制内容和打开日志目录的能力；禁止假按钮。
5. 后续若确实需要应用内上传、回执或工单协作，必须作为新需求证明现有渠道不足后重新确认。

**Status**：resolved（取代 DEC-FDB-001 的 BUILD 方向；T-518 回到 S 级直达入口）。

## DEC-ODR-001 (2026-07-26) — 四个过度设计任务统一退回最小现有能力路线

**来源**：用户明确表示近期方案“完全跑偏”，要求先统一解决具体问题，编排框架优化后议。独立审计
进一步证明旧方案重复建设执行器、反馈上传基础设施和文件平台；第一次瘦身又遗漏了部分已确认结果。

**决策**：

1. T-517 保留“生产预设积木”的用户方向，但撤销新 `automation_job/run`、八表 effect 平台和第二
   执行状态机。`scheduled_job/job_run` 继续管调度/展示；现有 `PersistentTaskService` 提供 durable
   task 原语，并补一套 typed handler registry 与单一轻量 driver。DEC-AUTO-001 中“必须新建
   automation_run/迁移为 Kernel”及 DEC-AUTO-002 的物理设计均被本决定取代。
2. T-516 保留设置入口、默认每周、可调/关闭/立即检查，以及“AI 起草修改、用户确认或调整后保存”。
   自动扫描只做确定性规则；AI 起草由用户主动触发，复用现有定位编辑、保存和版本历史，不新建
   candidate/event/confirmation/undo Saga。DEC-CTX-001/002 的用户结果继续有效，DEC-CTX-003/005
   中要求独立候选/撤销基础设施的实现解释由本决定收窄。
3. T-518 以 DEC-FDB-002 为准：复用 `supportUrl`，不建设 Growth 上传/工单。
4. T-519 保留默认文件夹、多级真实文件夹、“全部/最近/未归档”虚拟节点、多文件及既有 URL/文本
   导入、关系图/观点地图/全部、本地原文件与用户采纳门。实现先修 Assets upload ownership 和
   complete 幂等，不建设第二套上传/搜索/图谱。
5. 四份 2026-07-26 Replacement 是新的 PLAN 真相；旧 CONTRACT 全部保留为审计历史并关闭 BUILD。
   后续实现仍需新 CONTRACT、独立评审和确认②。

**Status**：resolved（用户范围重置；不授权修改 orchestrator engine，也不把四项功能伪报为完成）。

## DEC-REL-001 (2026-07-26) — 明日发布按核心逻辑 accepted-risk 进入 BUILD

**来源**：用户明确纠偏：不要因协议形式追求完美阻塞开发；UI、功能和核心逻辑没有大问题时
先实现、先发布，评审剩余完整性问题后补。

**决策**：

1. T-517、T-519、T-537 不再等待合同字段、示例和 scope ledger 的形式完美，按当前 PLAN 与
   replacement contract 直接进入隔离 BUILD。
2. accepted-risk 只覆盖协议完整性和扩展性，不豁免三条发布底线：T-537 不串 owner/collector；
   T-517 不重复/丢失运行且终态诚实；T-519 不产生跨账号或半写入文件。
3. 实现只复用现有 scheduled job/PersistentTask、Assets/Knowledge/Search/图和内容雷达 source，
   不新造第二状态机、上传平台、搜索平台、图谱平台或全局账号选择器。
4. 真实双抖音账号 RAT、完整真机 E2E 与剩余合同补账必须在最终发布说明中诚实列为待验收，
   不得把单测 fixture 冒充真实外部数据源证据。

**Status**：accepted-risk（用户授权先 BUILD；不等同于发布验收 PASS）。

## DEC-COL-001 (2026-07-26) — 内容雷达采用 owner/collector 双身份且不扩散到其他模块

**来源**：用户明确要求只有内容雷达需要指定采集账号，并要求主页、收藏夹、黑马三类登录型
来源均可选择；经营数据、评论、其他数据源与其他自动化任务不需要。

**决策**：

1. 当前工作区账号是所有 source/run/task/item/observation 的唯一 owner；采集账号只决定抖音
   adapter 使用哪份已绑定、active、同用户的本机登录态。
2. selector 只出现在 `creator_profile`、`favorites_folder`、`darkhorse_query` 的现有新增来源
   对话框；不得做成全局账号选择器，也不得改变 `self.metrics`、`self.detail`、comments、
   `web/rss`、分享链接或其他自动化任务。
3. 客户端只提交 `collectorAccountId`；服务端验属主、平台和状态后派生 opaque session。
   Cookie、profile 路径、签名及 `browserSessionRef` 不进入这三类公开契约、领域数据和普通日志。
4. 手动、首次、定时同步都消费 source 固化的 collector；任何异常都不得回退 owner 或伪装成
   成功 0 条。
5. T-496 的“仅收藏夹”失败工件由 T-537 替代。T-537 文档已三轮内部评审通过，但在两个真实
   active 抖音登录态完成 `RAT-537-01` 前，正式 PLAN/CONTRACT Gate 与全部 BUILD 保持 blocked。

**Status**：blocked（产品边界已确认；外部数据源可行性硬门未满足）。

## DEC-TSB-001 (2026-07-26) — 三系统权威边界、双入口与渠道生命周期

**来源**：用户要求根治 Thirdspace-growth、activation-manager、CreatorOS 三仓分工，并在
Growth DEC-050 新独立评审 PASS 后确认最终 lifecycle 与 AM exact contract。

**决策**：

1. Growth 是商业、渠道配置与官方产品 Bug 收件箱权威；AM 是 license/entitlement 与签名权威；
   CreatorOS 只负责产品、本地内容/日志、脱敏诊断、反馈交互和签名 runtime 的只读消费。
2. 产品 Bug 只读 `bugFeedbackUrl`；购买、续费、激活码交付售后只读
   `channelSupportUrl`。legacy `supportUrl` 严格只是 `channelSupportUrl` alias。
3. AM→Creator 唯一 runtime 是 signed `channelConfig` schema
   `channel-runtime-v2` closed 17 keys。Creator 按 raw digest/Ed25519/date/nonce →
   closed schema → `(projectKey,channelRef)` → RFC 8785 `sourceDigest` → version/digest 顺序验证。
4. Growth lifecycle 固定 `active→sales_disabled→terminated`。sales_disabled 的更高 snapshot
   令 purchase/renewal 为 null，保留 brand/support/download/official Bug；terminated 前必须由
   AM 把全部 active/non-revoked 授权原子改绑到明确 ordinary active target，报告满足
   `completed=affected,unresolved=0`。
5. Creator 不接收 tombstone、不自动 fallback、不猜 target。只在 AM 签名响应中出现新
   identity 后采纳。
6. 本地可信 runtime 并入现有加密 `.license` 快照原子保存；旧明文 `.channel-links`
   不自动信任或迁移。Creator 不自动上传日志、截图、用户内容或反馈正文。

**Invalidates**：DEC-FDB-002/DEC-ODR-001 中“Bug 复用 `supportUrl`”的字段语义；
T-396 的三键明文 cache 与单一 `supportUrl`；T-518 的 Bug 入口字段。T-531/T-532 与上传/
附件相关范围继续冻结。

**Evidence**：Growth canonical §5.1/§6/§7.3.1/§7.8..7.11 新周期 PASS；
AM API-AM-007/011/012；projection digest `sha256:b9512d…76d6d`；
reassignment fixture file SHA-256 `40a7bc44…2cc7`。

**Status**：implemented；Creator CONTRACT 三轮独立评审已收口，TDD/BUILD 与 consumer contract
tests 已完成。全局 `next build` 仍受当前 HEAD 中 T-535 已提交的 `instrumentation.ts`
code-frame panic 阻断，不影响本决策落地结论，但发布前必须由 T-535 清零。

## DEC-PLAT-001 (2026-07-26) — macOS 与 Windows 均为已完整验收桌面目标

**来源**：用户明确纠偏：Windows 版本已经完整验收，先前“不能完成验收”“仍待 Windows
实机验证”的当前口径均为错误信息。

**决策**：

1. CreatorOS 当前正式桌面目标为 macOS 与 Windows；两端均按已完成完整验收处理。
2. 当前生效的教程、产品定位、桌面 README、任务队列和规格索引不得再把 Windows 写成
   “未支持”“未实机验证”“不能验收”或发布范围外。
3. 旧 SPEC、旧评审与 README 中 P1 当时的验证范围可作为历史审计记录保留，但必须标明已被
   本决策和 2026-07-26 用户验收结论取代，不得继续作为当前状态引用。
4. 本决策记录的是当前发布验收结论，不反向补造未在当时发生的历史命令、测试日志或签名证据。
5. “CreatorOS 不自动发布到抖音”等真实产品边界继续保留；它与 Windows 桌面版是否完成验收
   是两件独立的事。

**Status**：resolved（事实纠偏；不新增产品范围）。

## DEC-FDB-003 (2026-07-26) — 发布前采用官方飞书表作为产品 Bug 降级入口

**来源**：用户在 test 包真机确认 Growth/AM 尚未下发反馈地址，并明确要求先写入飞书多维表格
入口，让用户手动提交和上传日志压缩包；应用内发送按钮禁用，暂不强制依赖 Growth。

**决策**：

1. `IssueFeedbackDialog` 仍优先使用签名 `bugFeedbackUrl`；字段为空或读取失败时，退到 CreatorOS
   内置的官方飞书反馈表 URL。该常量只服务产品 Bug，不得复用于购买、续费、下载或渠道售后。
2. 应用内“发送问题反馈”固定禁用，不调用产品反馈 POST；“打开反馈渠道”保持可用并通过可信
   desktop opener 打开系统浏览器。
3. UI 明确引导用户复制反馈内容、打开日志文件夹、压缩为 zip，再在飞书页面手动上传。
   CreatorOS 不自动读取、打包或上传日志，也不宣称外部页面已经提交成功。
4. 这是发布前 accepted-risk 降级；Growth/AM 的长期权威、签名 runtime 和三系统商业边界不变。

**Status**：accepted-risk（用户确认的临时发布降级；T-546）。

## DEC-TSL-001 (2026-07-27) — T-076-CREATOR 允许用户确认后的纯文字反馈，claim 未闭环不得完成

**来源**：用户明确要求让已发布 CreatorOS 成为三系统闭环终端，并固定 CreatorOS 只负责终端
交互、身份会话、权益领取入口、用户确认后的问题提交和本地脱敏诊断；Growth/AM 权威边界不变。
T-575 Round 1 独立评审指出该要求与旧 P-04“应用内发送固定禁用”冲突，并指出 disabled claim
adapter 不能冒充真实权益领取。

**决策**：

1. 更新产品宪法 P-04/NFR-PRIVACY：只有用户明确点击后，CreatorOS 才可把用户已预览并脱敏的
   问题纯文字提交到 Growth 官方收件服务，并只以 Growth 真实 `publicRef` 回显成功。
2. 渠道身份只能来自 AM 已验签授权上下文；Growth 决定渠道优先级。Creator 不上传日志、附件、
   截图、激活码、token、手机号、机器标识或其他用户内容。
3. `bugFeedbackUrl` 缺失、服务 health 未过或任一安全门关闭时，继续使用 DEC-FDB-003 的复制+
   官方飞书手动降级；打开网页不等于提交。
4. AM claim canonical 尚未落盘时允许先完成零出网 adapter、fixture 和 feature flag，但它们只是
   T-575 内部步骤。AM canonical、真实 provider、领取 UI、三仓正负 fixture 和真实联调未全部
   完成时，T-575 必须保持 blocked/未完成。
5. CreatorOS 不成为渠道、价格、订单、佣金、反馈优先级或 entitlement 真相源；不扩张
   `channelConfig` closed schema。
6. 当前已发布主功能优先：两项新能力默认关闭，任何异常先关远端签名门/capability；本任务不
   commit、push、deploy 或重新发布。
7. 后续主调度确认 AM final exact 已 Round 2 独立评审 PASS；并指出浏览器 owner API
   无法在禁止 deep-link/query/fragment/clipboard 的前提下把 claimToken 安全交给 Creator。
   Creator consumer 因此只预留 Growth API-210..212 device authorization + S256 PKCE：
   Creator 生成 session 并展示 user code，用户在 Growth 登录态完成 ownership+reauth 批准，
   Creator 持 device secret+verifier 轮询 API-212。approved no-store launch 到达后，在首次 AM
   consume 前，必须把 token/path/requestId/nonce/绑定语义摘要写入独立 OS 原生凭据
   pending-consume journal；这是 claimToken 唯一允许的短期持久化例外，禁止普通文件、数据库、
   URL、剪贴板、日志和遥测。AM 已锁同 requestId+同 consume digest exact replay；重启必须复用
   原请求，只有 `.license` 原子落盘并读后验真才删 journal。成功后只长期保存 AM Ed25519 验签
   通过的正式授权事实与既有 activation code。AM final descriptor/fixture SHA-256 分别为
   `52ce9b41…2d3`、`e4992497…384`，Creator 已逐字复制并 cmp；Growth API-210..212 PASS、最终
   device-flow fixture 一致和 Creator consumer 复审前，T-575 不进入 BUILD。
8. Creator Round 3 独立评审为 `CONCERNS`（0 blocker/2 major）。pending journal 删除条件收敛
   为 closed 状态表：`attempted` 后的取消、TTL、网络未知、坏签名和旧 `.license` 均不能删除，
   必须先 exact replay；本地成功但删除失败也先重放并把签名响应与本地快照逐字段核对。反馈直提
   由两门改为三门，新增不可伪造且未过期的服务 readiness；当前上游没有 Creator 可消费的 exact
   source/shape/TTL，登记 HARD-575-003。缺该门时 direct submit 固定 disabled，不由 URL、历史
   成功、telemetry 或 UI 猜 ready，也不新增通用健康平台。

**User confirmation**：用户 2026-07-27 的 T-076-CREATOR 明确授权。

**Pattern-Ref**：沿用 T-534/DEC-TSB-001 的现有可信边界，不新增第三方 flag 平台。

**Status**：resolved（方向变更已确认；仍须 T-575 独立评审与 contract gates）。

## DEC-TSL-002 (2026-07-27) — T-575 三轮后收敛裁决：不新增反馈 readiness 平台

**来源**：用户更新 `product-to-code-orchestrator` 至 3.7.0，并明确要求收敛审核、重新委派
Growth / Activation Manager / CreatorOS 继续推进。T-575 已完成三轮独立评审；按新规则不得
开启 Round 4，遗留问题由用户裁决。

**决策**：

1. Round 3 的 pending-consume journal 删除条件已按 closed 状态表修订，作为 BUILD 的
   fault-injection 验收条件，不再重复评审。
2. 不采纳“新增 Creator 可消费的独立 feedback readiness API/平台”这一实现扩张。
   “服务能力可用”由既有真实事务内联证明：CreatorOS 先取得 AM 签名反馈上下文，再调用
   Growth `API-170`；只有 Growth 返回并通过 closed-schema 校验的真实 `202 publicRef`
   才显示提交成功。
3. 任一步骤超时、断网、坏签名、上下文过期、Growth 非 `202`、回执不合法或服务降级，都必须
   保留用户草稿、显示未提交，并进入既有复制文字 + 官方反馈页的手动降级。历史成功、URL、
   telemetry、UI 本地状态不得冒充 ready。
4. 本裁决不新增 API、表、角色、健康平台或渠道字段，也不降低“失败不得冒充成功、用户明确
   确认后才出网、禁止附件/日志/激活码自动上传”的已确认验收标准。
5. T-575 可在 Growth API-210..212 契约 PASS 后进入完整 BUILD；任务仍须一次完成权益领取、
   签名渠道配置、纯文字反馈、真实回读、故障恢复和跨仓 E2E，不能把未完成部分静默延期。

**Risk disposition**：`avoid`（避免 reviewer 建议诱发的新 readiness 产品面），以现有
AM assertion + Growth authoritative POST receipt 的 fail-closed 事务作为最小结果约束。

**Status**：resolved（用户三轮后裁决；禁止 Round 4）。

## DEC-TSL-003 (2026-07-29) — T-575 只消费 Growth 签名产品配置，不扩展授权或 runtime 权威

**来源**：用户明确要求 CreatorOS 在 T-575 内从 Growth 拉取 product-specific opaque JSON，
由 CreatorOS 按产品协议解析；同时重申 Growth/Activity/CreatorOS 三方权威边界、24 小时离线
容错和 revoked/expired/replay fail-closed。

**决策**：

1. 采用 Growth 已独立评审 PASS[REV:d2895a3b6dac] 的
   `config-access-ticket-v1 + growth-client-config-bundle-v1`：Activity 只签短票并证明当前授权，
   Growth 保存/签名配置正文，Creator 只验签和解析。
2. `channelConfig` 继续只认 T-534 的 Activity signed `channel-runtime-v2`；Growth bundle 内六键
   不建立第二套 UI runtime。
3. Creator 首个产品协议固定为
   `creatoros.model-config@creatoros-model-config-v1`，只输出安全 modelPolicy；长期模型 key、
   支付/服务端 secret、激活码、原始设备标识和长期 bearer 禁止进入 bundle/LKG/UI/日志。
4. 仅 network/authority unavailable 可在 24 小时内使用 AES-GCM LKG；撤权、到期、重放、
   改绑、terminated、坏签名和版本倒退均 fail-closed，禁止 silent mock fallback。
5. 应用启动和授权事实成功落盘后异步 refresh；feature/config 默认关闭。真实联调前不得把代码或
   fixture 写成已上线。
6. 本决定是用户对 T-575 的新增明确裁决，复用 Growth 已审 exact contract；不重开
   DEC-TSL-002 已禁止的 T-575 Round 4。
7. Growth 已提交的单运行时重构 `a74b92e` 将 API-216 实际 transport 从 `/api/v2` 收敛到
   `/api`。Creator 同步改为 `/api/client-config/bundles/current`；本次只适配已提交的上游
   路径，不改变 ticket、验签、身份、缓存或 fail-closed 语义。用户 2026-07-29 已要求核实后
   收敛到 `main`。

**Status**：resolved（用户确认；进入 TDD/BUILD 与 live HTTPS 验收）。

## DEC-MODEL-001 (2026-07-28) — 内容雷达不新增专用模型配置面

**来源**：用户在 T-589 性能优化完成后明确指出“模型配置已经够多”，否决新增的
“内容雷达拆解模型”设置卡。

**决策**：

1. 内容雷达逐字稿拆解与选题转换统一复用既有 `topic.generate` / 默认文本模型配置。
2. 删除 `intelligence.topic-decompose` 专用模型 capability 的解析、设置卡和连接测试，
   不让性能优化转化为新的用户配置负担。
3. 保留与模型配置数量无关的性能改进：逐字稿 hash 复用拆解、输出预算、重试收紧、
   安全耗时日志和慢任务终态回显。
4. `intelligence.topic-decompose` 继续作为内部 Skill/Prompt ID 使用；它不再表示用户需要
   单独配置模型。

**User confirmation**：用户 2026-07-28 明确要求撤掉该配置项。

**Status**：resolved（配置面收敛；不改服务契约、数据归属或发布标准）。

## DEC-VIS-001 (2026-07-28) — 平台作品采用“仅确认公开才入库”的单一数据边界

**来源**：T-591 审计确认隐藏作品在项目/发布、指标、搜索和 AI 下游存在多套过滤口径及双写
漂移；用户随后明确要求“从数据源只采集未隐藏的作品，这样全局一致，下游不需要过滤”。

**决策**：

1. 抖音源适配器仍须在一次采集中临时观察公开、隐藏和未知状态，用于判断与发现恢复公开；
   但只有本轮明确公开的作品可以进入 CreatorOS 项目、发布、指标及派生数据域。
2. 明确隐藏的存量作品退出平台派生数据域；自动导入项目可整体清理，用户手工项目不得因平台
   状态变化被删除，只清理其平台发布及派生数据。
3. 未知状态 fail-closed：不新增、不误删。恢复公开依赖不受本地可见集合截断的源侧全量扫描
   重新采入。
4. 完成存量对账后，列表、统计、搜索、定位、复盘和 AI 不再各自维护 hidden 业务过滤；
   “显示已隐藏”产品入口退役。旧隐藏字段暂留作升级/回滚兼容，不再是下游真相。
5. 隐藏清理会删除本地平台指标历史，恢复公开后重新开始本地历史；账号汇总随当前公开集合
   下降属于已确认产品口径。
6. 该数据归属变更由 T-595 的窄 SPEC 独立评审通过后开工，T-592/593/594 并入同一任务收口，
   避免分别实现新的下游过滤。

**User confirmation**：用户 2026-07-28 明确确认全局统一到数据源边界。

**Pattern-Ref**：PAT-003（后台采集继续异步任务化）；PAT-004（collector → ingestion /
projects / publishing 跨边界走明确内部服务契约）。

**Status**：confirmed，待 T-595 独立 SPEC 评审。

## DEC-AUTO-001 (2026-07-29) — 内容雷达与全局自动化必须共用唯一调度基础架构

**来源**：用户再次明确指出“定时任务这里要统一一套基础架构，绝对不能两套”，并确认采用
T-517 / T-598 推荐的方案 A。代码核查确认当前生产组合根同时启动
`automation-driver` 与内容雷达独立 `intelligenceTimer`，与既有 `DEC-CR-016` 冲突。

**决策**：

1. 生产环境只允许 execution 模块的统一自动化 driver 判断账号级自动化作业是否到期；
   内容雷达不得保留独立 `setInterval`、cron、启动 due-source 扫描器或第二套运行记录。
2. 每个 `(userId, accountId)` 只保留一个系统托管的 `intelligence.sync` 聚合作业。自动化中心
   管账号级总开关、立即检查和聚合历史；内容雷达管来源级启停、频率、采集账号、手动同步及
   来源运行详情。
3. 旧 `benchmark`、`favorites` 作业与内容雷达来源重叠，切换时必须停用并完成生产者对账；
   `self.metrics`、`comments`、`self.detail` 与 `topic.daily` 仍作为不重叠的系统预设保留。
4. 到期发现、持久任务 claim/lease/recovery 与运行投影统一走
   `scheduled_job → job_run → PersistentTaskService → typed handler`。来源同步可以继续使用
   `source_sync` 子任务，但只能由 `intelligence.sync` handler 或用户手动操作创建。
5. 采用 forward-only 方案 A：enforce 后不允许旧二进制直接打开新数据库；故障通过同版本
   hotfix 或更高版本 roll-forward 修复。升级前快照仅作人工灾备，不得自动或静默覆盖当前库；
   恢复前必须停止写入、另存当前数据库并明确提示恢复点之后的业务写入会从恢复库中消失。
6. 本决策不授权云端常驻调度、不新增第三套执行状态机，也不允许为了兼容而保留第二个业务
   timer。

**User confirmation**：用户 2026-07-29 明确确认单一调度架构，并对推荐方案 A 回复“对的”。

**Risk disposition**：`avoid`（删除重复调度）；灾备恢复的数据损失风险通过默认 roll-forward、
禁止自动恢复、恢复前保全当前库和显式确认控制。

**Status**：resolved；解除 T-517 Delta SPEC `R2-01` 的用户裁决阻断，T-598 可进入 CONTRACT /
BUILD Gate。

## DEC-SCHED-001 (2026-07-29) — 项目是唯一排期入口，发布中心以日历承接节奏

**来源**：用户提出“选题 → 项目 → 发布排期”节奏规划，并在查看项目列表与发布中心截图后，
确认采用“项目行排期、发布中心删除重复列表并外移日历、首页待办提醒”的推荐方案。

**决策**：

1. 选题只负责形成内容候选，不直接排期；未发布、未归档项目是唯一排期入口，支持选今天或
   未来日期、改期和取消。
2. 排期真相归 `content-calendar`，必须建立真实 `projectId` 关系；项目不新增第二份发布日期，
   `targetCompletedAt` 不得冒充发布日期，项目名也不得再写进 `note` 冒充关联。
3. 发布中心移除与项目“已发布”重复的历史长表、搜索和筛选，以“过去真实 publication +
   未来项目排期”的月历作为左侧主区域，右侧保留真实表现摘要；旧 `/calendar` 兼容跳转。
4. 首页按排期、项目状态和真实发布事实派生逾期/今日/临近提醒；提醒不可手工完成，不重复写入
   task 或 notification，第一版不进入铃铛。
5. 第一版只选日期，不选时间；用户选定日期不得因时区漂移。排期只作规划与提醒，不自动向
   平台发布。

**User confirmation**：用户 2026-07-29 对完整推荐方向回复“认可”。

**Risk disposition**：`avoid`（避免选题、项目、日历、首页各存一份日期，以及发布中心/项目
双库存）；存量自由 entry 采取兼容展示和可审计补链，不猜测、不破坏性删除。

**Status**：confirmed；T-599 进入独立 SPEC 评审，CONTRACT / BUILD 尚未授权。

## DEC-AUTO-002 (2026-07-29) — 自动化中心只保留四个不重复的产品任务

**来源**：在 T-598 完成单一调度架构后，用户确认自动化任务语义继续收口，不向用户暴露
仅用于历史兼容、且与主采集任务调用同一 collector 的 `self.detail`。

**决策**：

1. 用户可见任务固定为“我的作品数据同步、我的作品评论同步、内容雷达自动同步、每日自动生成
   选题”四个。
2. `self.detail` 不再进入新账号 bootstrap、创建模板或自动化列表；存量 job 统一停用，
   `job_run` 历史保留用于排障和审计。
3. 作品后台明细能力不删除：`self.metrics` 继续复用既有 visible-only canonical collector，
   只删除重复的调度语义和入口。
4. `benchmark/favorites` 延续 DEC-AUTO-001：只保留历史兼容，不恢复为自动化任务。

**User confirmation**：用户 2026-07-29 对四任务口径明确回复“认可”。

**Status**：resolved；T-600 可直接按 T-598 既有 CONTRACT 做兼容任务退役。

## DEC-SCHED-002 (2026-07-29) — 排期复用共享契约与真实数据库，不建立 UI 日期副本

**来源**：T-599 从已确认 PLAN 进入 CONTRACT；项目、发布中心与首页需要共同读写项目排期。

**决策**：

1. 命中 `PAT-004` 的 CF-001/002/004：扩展现有 content-calendar Zod resource 与公开 operation，
   不在三个前端表面各写日期类型，也不新增 project schedule endpoint。
2. 命中 `PAT-002` 的 RF-001/002/004：排期是用户持久数据，依赖 active unique、ownership 与
   正规 migration，继续使用现有 Postgres/PGlite 同构 Drizzle 路径，不用内存状态。
3. 持久增量严格限制为 `project_id + planned_date`；旧 `planned_at` 只作兼容锚，产品显示与
   提醒只认 date-only `plannedDate`。
4. 真实发布仍归 publishing；公共 calendar transition 禁止手工写 `published`。

**Pattern-Ref**：PAT-004、PAT-002。

**User confirmation②**：用户于 2026-07-29 回复“确认”，授权按已评审 CONTRACT 进入 BUILD。

**BUILD 编号协调**：共享工作树中的 T-600 已占用 migration `0060`，T-599 顺延使用
`0061_project_schedule_calendar.sql`；只调整迁移文件序号，不改变 schema、数据归属或确认范围。

**Status**：confirmed；CONTRACT 独立 Round 2 评审 PASS，BUILD 已授权。

## DEC-CR-017 (2026-07-29) — 人工上传逐字稿复用当前作品的唯一逐字稿真相

**来源**：用户在内容雷达作品详情截图中明确要求“这里的逐字稿支持人工上传”。

**决策**：

1. “上传逐字稿”与“手动转写”并列，首批支持 UTF-8 `.txt/.md/.srt/.vtt`；浏览器只读本地
   文件并规范化正文，原文件不离开本机、不进入对象存储或第二套文件资产。
2. backend `intelligence` service 继续是逐字稿唯一写者；上传正文写入当前作品既有
   `ItemTranscript`，成功即为 `done/source=manual`，可直接进入现有拆解与选题生成。
3. 禁止覆盖 `done` 或 `queued/running` 的逐字稿；相同已完成正文的重试只返回既有资源，
   不同正文明确拒绝。由此避免改写已被选题或 Project 固定引用的来源证据。
4. 客户端按真实 `File.size` 拒绝超过 2 MiB 的文件；backend 不接收原文件，按收到的规范化
   正文重新计算 UTF-8 字节数并执行 2 MiB 上限，同时限制 500,000 字符。输入为空、乱码、
   任一上限超限、格式不支持或跨账号时零写入并给出可行动错误。取消文件选择零写入。

**Pattern-Ref**：PAT-004（跨 frontend/backend 的 typed contract）；持久化继续复用现有
Postgres/PGlite transcript 行，不命中新增存储方案。`MOD-001` 不采用，因为原文件不需要远端
保存。

**User confirmation**：用户 2026-07-29 明确提出人工上传入口，授权该产品增量。

**Status**：confirmed；T-603 须完成独立增量评审后才能 BUILD。

## DEC-CR-018 (2026-07-29) — 逐字稿在首个成功选题候选后永久锁定

**来源**：用户补充要求逐字稿支持粘贴、二次上传覆盖和重新转写，随后明确收敛为“一旦生成
选题了，这个逐字稿就捆绑了，就死了。这不能变了”。

**决策**：

1. 本决策只替代 `DEC-CR-017` 第 3 点的“已完成逐字稿一律禁止覆盖”规则；文件格式、正文
   上限、唯一写者和不保存原文件等边界继续有效。
2. 首个成功选题候选产生前，当前作品的唯一 `ItemTranscript` 可以通过粘贴、文件导入或重新
   转写被替换；产品不增加逐字稿版本表、历史记录或恢复旧稿能力。
3. “成功生成选题”以任一选题 transform 已产生可用 `outputSnapshot` 为准，不以用户确认进入
   选题池为准。候选一旦产生，即使后来取消或不采纳，逐字稿仍永久锁定。
4. 选题生成处于 `queued/running` 时只作临时写栅栏；任务失败、受阻或取消且没有候选产出时，
   逐字稿恢复可修改。
5. backend 必须在人工替换、重新转写和候选落地三处统一校验锁定条件；选题任务固定生成时的
   `transcriptHash`，防止并发替换造成候选与逐字稿错绑。

**User confirmation**：用户 2026-07-29 明确纠正为“一旦生成选题了，这个逐字稿就捆绑了，
就死了。这不能变了”。

**Build confirmation**：用户随后明确回复“你两个一起来实现吧，两个需求”，同时授权筛选排序
与逐字稿纠错/锁定按已记录方案进入实现。

**Status**：confirmed for BUILD；T-622 同一切片完成契约、backend、frontend 与测试。

## DEC-MAUTH-001 (2026-07-29) — 正式 CreatorOS 的模型配置由 Growth 渠道端完全托管

**来源**：用户明确要求 CreatorOS 模型配置从远程拉取、不支持用户自行配置，并进一步授权
CreatorOS 端实施。代码审计确认 T-575 仅完成签名配置拉取，现有设置与 AI runtime 仍读本地
`model_configurations`。

**决策**：

1. 正式渠道构建固定 `managed_locked` 权威；Growth 只控制 profile 与 capability alias，
   不能把正式客户端切回 BYOK。
2. 托管态设置页只读，服务端同步拒绝保存、测试、导入和导出；存量本地配置保留但忽略。
3. 全部模型能力通过 `EffectiveModelConfigPort` 求值，托管态禁止 DB、环境变量和内置云模型回退。
4. 长期 provider Key 永不下发客户端；Creator 只接短期 gateway session 的 typed port。
   上游 exact contract 缺失时默认 adapter 零出网并诚实不可用。
5. 开发/自托管构建默认保持 local，作为明确的构建级回滚；Web、数据库、header 或 Growth
   payload 无权切换正式客户端的权威。

**Pattern-Ref**：PAT-004（CF-001/002/004，跨 Settings/AI runtime/组合根使用 typed port）；
**Asset-Ref**：MOD-002（复用 provider-neutral resolver/adapter，不重写模型 SDK）。

**User confirmation**：用户 2026-07-29 回复“creatoros端的你来实现吧”。

**Status**：confirmed scope；T-604 SPEC/CONTRACT 独立评审通过后进入 BUILD。

## DEC-BOUNDARY-002 (2026-07-29) — Activity 最小运行快照不等于业务权威

**来源**：用户在评估 pure activationRef 全量迁移成本后，确认采用兼容折中方案，并要求把
产品边界写入项目，避免后续再次跑偏。

**决策**：

1. Activity 保留现有 project/channel 授权字段并继续负责激活码、设备、期限、撤权、签名和
   防重放；这些字段只是 Growth 下发的 opaque 运行快照，不要求现有用户重激活。
2. Growth 唯一解释范围标签对应的渠道、代理、客户、产品、应用目录、协议和模型配置。
3. CreatorOS 先取得 Activity 当前签名授权，再把凭证交给 Growth 获取配置；不得自报
   `projectKey/channelRef/clientId`，不得让本地缓存覆盖服务端撤权。
4. Activity 的 ticket/内省不得携带 `clientId`、应用目录或模型/商业字段；CreatorOS 只接受
   current v2 closed wire，并只信任 Growth-signed bundle 中的应用身份和配置。
5. pure activationRef 作为未来独立 breaking migration 保留，不在 T-606/T-620 删除字段、
   重发激活码或引入双协议。

**Status**：resolved；进入 T-620 增量复核和 BUILD。
