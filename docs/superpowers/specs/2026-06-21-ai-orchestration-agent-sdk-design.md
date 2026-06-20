# AI Orchestration via the Claude Agent SDK — Design (CreatorOS)

Date: 2026-06-21 · Layer: AI execution (the "external Agent / Skill" of storage §7) ·
Decision basis: user directive — integrate AI via the **Claude Agent SDK** rather than
hand-rolling Messages-API calls ("不要自己手搓"), leveraging the SDK's native MCP + Skills;
**design before build**. Substrate decision: **unified Agent SDK** for all AI nodes.

This spec defines the execution substrate that sits behind the existing AI data model
(`AITask` / `AITaskReference` / `AITaskResult` / `AgentConfiguration` / `ModelConfiguration`).
The product specs deliberately leave execution external (data-model §7; storage §7 line 482:
*"Agent 的实际执行可由外置 Skill 完成"*). This is that external executor, named.

## 1. Goal

Give CreatorOS a single, auditable AI execution layer that:

- turns an `AITask` into a **Claude Agent SDK `query()` run** on a backend worker;
- lets the agent **read** domain context and **propose** a candidate result, but **never**
  formalize it — the candidate-confirm boundary becomes a runtime guarantee, not a convention;
- expresses each AI node's prompt/procedure as a **Skill**, and each domain capability the
  agent needs as an **in-process MCP tool**, so prompts and tool surface are version-controlled,
  not hardcoded;
- keeps the deterministic contract/render layer (stage 15a/15b, no `Date.now`/`Math.random`/`fetch`
  inline) completely untouched — all non-determinism stays behind the async `AITask` boundary.

**Non-goal of this spec:** building it. This is the design to approve before any plan or code.

## 2. Why the Agent SDK (and which "Agent" product)

The user-linked `code.claude.com/docs/en/agent-sdk/overview` is the **Claude Agent SDK** — a
Python/TypeScript **library that runs Claude Code's agent loop inside our own process**. It is
**not** the hosted "Managed Agents" REST API (a separate product where Anthropic runs the sandbox).

| | Why it fits CreatorOS |
|---|---|
| Runs in our process / infra | Worker can read Postgres/S3 directly via in-process tools; no data round-trip to a managed sandbox |
| Native MCP | Domain capabilities (read project, list artifacts, web search) exposed as tools the agent composes autonomously |
| Native Skills | Each AI node's prompt + procedure is a `SKILL.md`, auto-invoked by description — exactly the "external Skill" the specs anticipate |
| Built-in agent loop | No hand-rolled `while stop_reason == "tool_use"` loop to maintain |
| Hooks + permissions | `PreToolUse`/`PostToolUse` give us the audit trail and the candidate-isolation gate for free |

We use **TypeScript** (`@anthropic-ai/claude-agent-sdk`) to match the monorepo stack
(Next.js + TS + Zod + Drizzle + Vitest).

### Important runtime fact (drives the architecture)

The SDK spawns the **Claude Code binary as a subprocess** and is **cwd/filesystem-centric** by
default. Two consequences, both load-bearing below:

1. AI execution **cannot** run in a Next.js request handler / edge function → it runs on a
   dedicated **worker** as an async job. (This matches the existing "execution is external / async
   candidate-confirm" design and the minutes-long turns of Opus/Fable.)
2. We **disable** the default filesystem tools (`Write`/`Edit`/`Bash`-on-disk) and give the agent
   our own **in-process MCP tools** over Postgres/S3 instead — CreatorOS data is not files.

## 3. The mapping (CreatorOS AI entities ↔ Agent SDK primitives)

The existing entities are almost literally SDK config objects:

| CreatorOS entity (data-model §7) | Fields used | Agent SDK primitive |
|---|---|---|
| `AgentConfiguration` | `agentType`, `capabilities`, `settings`, `secretReference` | `ClaudeAgentOptions` (system prompt + `allowedTools` + `skills` + `mcpServers` + `agents`) |
| `ModelConfiguration` | `capability`, `provider`, `modelName`, `secretReference`, `settings` | `model` + `effort` + the API key resolved from `secretReference` |
| `AITask` | `taskType`, `inputData`, `modelKey`, `idempotencyKey`, status timestamps | one `query()` run; `taskType` selects the `AgentConfiguration` |
| `AITaskReference` | `entityType`, `entityId`, `relationType` | context the agent fetches via in-process read-tools, injected into the prompt |
| `AITaskResult` | `resultType`, `artifactId` / `knowledgeItemId` / `assetId`, `resultData` | the agent's structured output, captured by a mandatory `submit_candidate` tool |

`AgentConfiguration.settings` JSON is the serialized SDK options (allowed tools, skill list,
subagents, permission overrides). `ModelConfiguration` rows map capability → model/effort
(e.g. `script.rewrite → claude-fable-5 / effort:high`; `copy.generate → claude-opus-4-8`;
`classification → claude-haiku-4-5`).

## 4. Architecture

```text
 Next.js API (request path, deterministic)        AI Worker (separate Node process)
 ─────────────────────────────────────            ────────────────────────────────────
 createAITask(taskType, input, refs)               picks up queued AITask (idempotency_key)
   → AITask row {status: queued}            ──▶      resolves AgentConfiguration + ModelConfiguration
   → AITaskReference rows                            builds ClaudeAgentOptions:
   returns task id (button shows "生成中")               · system prompt + skills (per taskType)
                                                        · mcpServers: { creatoros: <in-proc server> }
 confirmResult(resultId)  ◀── user clicks            · allowedTools: READ tools + submit_candidate
   → formalize candidate (AI-FREE path):                  + WebSearch  (NO Write/Edit/Bash)
       ArtifactVersion / KnowledgeItem /                · permissionMode: 'default', hooks: audit
       Asset / ReviewInsight                          query({ prompt, options })
   → AITask {status: succeeded}                       · agent reads context via creatoros.* tools
                                                       · agent calls submit_candidate(payload)
                                                  ◀──   worker writes AITaskResult (candidate)
                                                        AITask {status: awaiting_confirmation}
```

### 4.1 The worker

A standalone Node service (`ai-worker/`) that polls for `queued` AITasks (claim-by-update with
`idempotencyKey` dedup), runs one `query()` per task with bounded concurrency, and writes results.
Stateless beyond the DB; horizontally scalable. Polling (not a heavy queue) initially — the
job-source is an interface (`AiTaskQueue`) so it can swap to a real queue later without touching
execution logic.

### 4.2 In-process MCP context server (`creatoros`)

Built with `createSdkMcpServer({ name: 'creatoros', tools: [...] })`. Tools (Zod-schema'd,
runs in worker code, reuses the same Drizzle layer the backend uses):

- **Read tools** — `get_project`, `get_content_output`, `get_research_notes`, `list_artifacts`,
  `get_artifact_version`, `get_knowledge_items`, `get_metrics` … (scoped to the task's
  `AITaskReference` set; a tool that requests an out-of-scope entity is denied by a `PreToolUse` hook).
- **Exactly one write tool** — `submit_candidate(payload)` whose **Zod schema is the candidate
  shape per `resultType`**. It writes an `AITaskResult` row marked candidate; it **cannot** create
  or mutate an Artifact/Knowledge/Asset. This is the structured-output path *and* the write boundary.

The agent's `allowedTools` = `mcp__creatoros__get_*` + `mcp__creatoros__submit_candidate`
+ `WebSearch`/`WebFetch` (for research nodes only). The default `Write`/`Edit`/`Bash` are absent →
the agent physically cannot touch the filesystem or formalize a result.

### 4.3 Skills (one per AI node)

Each AI node is a `SKILL.md` under the worker's `.claude/skills/`, loaded via `settingSources`.
`AgentConfiguration.capabilities` lists which skills are enabled for a `taskType`. Catalog
(derived from the six-stage workflow + Copilot/Dashboard, storage §4/§7):

| Skill | Node / workflow stage | Default capability → model |
|---|---|---|
| `research-analysis` | Research — synthesize notes/evidence | `research.analyze` → opus-4-8 + WebSearch |
| `planning-thesis` | Planning — thesis/audience | `planning.thesis` → opus-4-8 |
| `script-rewrite` | **Script — AI rewrite (primary node)** | `script.rewrite` → **fable-5 / effort:high** |
| `copy-generation` | Publishing — platform copy | `copy.generate` → opus-4-8 |
| `review-insights` | Analytics & Review — insights/learnings | `review.insights` → opus-4-8 |
| `copilot-assist` | Global Copilot / Dashboard suggestions | `copilot.assist` → opus-4-8 (advisory, see §5) |

Production node (digital-human / subtitles) is asset-generation, likely an external MCP/service
rather than a text Skill — flagged as an open question (§9).

### 4.4 Hooks = audit + isolation

- `PreToolUse` — enforce `AITaskReference` scope (deny reads outside the task's referenced
  entities); log intended tool call to the AITask audit.
- `PostToolUse` — record tool result + tokens to the audit; `Stop`/`ResultMessage` →
  capture `total_cost_usd`, `session_id`, `subtype`.

## 5. Lifecycle & the required `AITaskStatus` change

Current enum (`domain.ts:643`): `queued | running | succeeded | failed | cancelled` — **missing
the candidate-confirm state**. The whole design depends on the agent stopping *before*
formalization. Reconciliation (minimal, additive):

```text
queued → running → awaiting_confirmation → succeeded   (user confirmed → formalized, AI-free)
                                         ↘ cancelled    (user rejected the candidate)
              ↘ failed (run error)        ↘ cancelled  (aborted)
```

- **Add `"awaiting_confirmation"`** to `AITaskStatus` (domain.ts, contract primitives, SPEC §12).
- The agent run ends at `awaiting_confirmation`; the candidate sits in `AITaskResult`.
- `confirmResult` is a **separate, deterministic, AI-free** code path (no `query()`) that
  transforms the candidate into `ArtifactVersion` / `KnowledgeItem` / `Asset` / `ReviewInsight`
  (honoring ArtifactVersion immutability — new candidate version, never overwrite `current_version`,
  per storage §6 line 289 / §7 line 477) and flips the task to `succeeded`.
- **Advisory tasks that never formalize** (Copilot chat suggestions) skip the gate:
  `running → succeeded` directly, `resultData` only. So `awaiting_confirmation` is entered iff the
  `resultType` formalizes into a domain entity.

This is the AITaskStatus inconsistency flagged earlier, now resolved by adding one enum value
rather than reshaping the flow.

## 6. Data flow (sequence — Script AI rewrite, the exemplar)

1. User clicks **AI 改写** in Script Workspace → island calls `client.createAITask({ taskType:
   "script.rewrite", projectId, contentOutputId, inputData: { artifactId, instructions } })`.
2. Backend writes `AITask {status: queued}` + `AITaskReference` rows (the artifact, its current
   version, relevant knowledge items). Returns task id; UI shows a pending state, polls task status.
3. Worker claims the task, resolves `AgentConfiguration("script.rewrite")` →
   options(skills:[`script-rewrite`], allowedTools:[`get_artifact_version`, `get_knowledge_items`,
   `submit_candidate`], model: fable-5/high, permission hooks). Resolves API key from
   `ModelConfiguration.secretReference`.
4. `query({ prompt, options })`: agent reads the current version + knowledge via tools, drafts a
   rewrite, calls `submit_candidate({ resultType: "artifact_version", resultData: {...} })`.
5. Worker validates the payload (Zod), writes `AITaskResult` (candidate), sets task
   `awaiting_confirmation`, stores `session_id` + cost.
6. UI poll sees `awaiting_confirmation` → shows the candidate diff with **采纳 / 放弃**.
7. **采纳** → `client.confirmResult(resultId)` → AI-free formalization creates a new
   `ArtifactVersion` candidate; task → `succeeded`. **放弃** → task → `cancelled`.
8. **重新生成 (with feedback)** → new AITask that `resume`s the stored `session_id` with the user's
   note, reusing context.

## 7. Error handling, idempotency, cost

- **Idempotency** — claim-by-update on `idempotencyKey`; a duplicate `createAITask` returns the
  existing task. Worker crash mid-run → task re-claimable after a lease timeout (`startedAt` + TTL).
- **Run failure** — `ResultMessage.subtype` ∈ {`error_*`} or thrown → task `failed`,
  `errorMessage` set; **no business data touched** (storage §7 rule line 479). Retryable nodes get
  bounded auto-retry; others surface the failure to the UI.
- **Refusal / safety** (esp. if fable-5) — handled per the claude-api skill: check refusal,
  opt into server-side fallbacks by default; a refused run → `failed` with a clear message.
- **Cost/usage** — `ResultMessage.total_cost_usd` + token usage persisted per task for audit
  (data-model §7 rule: every AI artifact traceable to its AITask + model config).
- **Concurrency** — worker pool with a bounded concurrent-`query()` cap (subprocess cost ~100–500ms
  each); cheap nodes routed to haiku via `ModelConfiguration`.

## 8. Determinism boundary (explicit)

The Agent SDK is inherently non-deterministic; the contract/MockBackend/render layer is strictly
deterministic. The boundary is the `AITask`:

- Pages/selectors/MockBackend **never** call `query()` inline; they only **read AITask status +
  AITaskResult** (deterministic rows) and render accordingly.
- All LLM/network/time non-determinism lives in the **worker**, behind the async task.
- 15b's `viewModel?` test seam and fixture determinism are unaffected — AITask rows are just data.

## 9. Open questions

1. **Production node** (digital-human, subtitles) — text Skill, external MCP/service, or out of
   scope for v1? (Leaning: external service via MCP, not a Skill.)
2. **Worker placement** — same repo package (`ai-worker/`) vs separate deploy unit; polling vs a
   real queue (BullMQ/pg-boss) for v1. (Leaning: in-repo package, DB-polling, queue interface.)
3. **Copilot streaming** — does the Copilot UX need token streaming (SSE) or is poll-to-result
   acceptable for v1? (Leaning: poll for v1; streaming is a later enhancement.)
4. **Auth** — API-key only (SDK ToS forbids claude.ai login for 3rd-party). Confirm the
   `secretReference` resolver (env / secrets manager).
5. **`succeeded` semantics** — keep `succeeded` as the post-confirm terminal state vs renaming to
   `completed`. (Leaning: keep `succeeded`, just insert `awaiting_confirmation`.)

## 10. Risks

- **Subprocess in production** — the SDK needs the Claude Code binary + a Node runtime + writable
  cwd on the worker host. Mitigation: containerize the worker with the binary; never run in edge/serverless.
- **Tool-scope leakage** — an in-process read tool could over-fetch. Mitigation: `PreToolUse` hook
  enforces the `AITaskReference` allowlist; deny-by-default.
- **Skill prompt drift** — Skills are prose; quality varies. Mitigation: version Skills in-repo,
  eval per node on a fixture set before enabling a capability.
- **Cost blow-up at high effort** — fable-5/high turns run minutes. Mitigation: per-capability
  model/effort via `ModelConfiguration`; haiku for cheap nodes; cost recorded per task.
- **Two products both called "agents"** — keep the doc/codebase explicit that we use the **Agent
  SDK (in-process library)**, not Managed Agents (REST), to avoid wiring confusion.

## 11. Out of scope (this spec)

- The worker's task plan/code (writing-plans → a later plan).
- Real backend persistence (stage 16) — this layer consumes the same Drizzle schema once it exists.
- Auth/session, real ingestion (FLOW-019), cross-session AI memory.
- The `MockTransport → HttpTransport` swap (stage 17).

## 12. Decisions

- **Substrate:** unified Agent SDK for all AI nodes (user choice) — one execution substrate, one
  audit/permission mechanism, Skills+MCP everywhere; single-shot nodes accept a small subprocess tax.
- **Language:** TypeScript worker (`@anthropic-ai/claude-agent-sdk`), matching the monorepo.
- **Write boundary:** agent gets read tools + `submit_candidate` only; `confirmResult` is AI-free.
- **Status:** add `awaiting_confirmation` to `AITaskStatus` (the required reconciliation).
- **Prompts:** one Skill per AI node; **tools:** in-process `creatoros` MCP server over Drizzle.
- **Model routing:** per-capability via `ModelConfiguration` (script.rewrite → fable-5/high default).
