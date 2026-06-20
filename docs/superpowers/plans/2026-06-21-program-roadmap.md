<!-- Generated 2026-06-21 by the creatoros-program-roadmap workflow: 338 interactions across 18 pages, 3 analyses. -->

# CreatorOS — Program Roadmap

> Single source of truth for parallel, goal/workflow-driven development. Built from the 338-interaction page inventory (18 pages), the per-module business-logic/state-machine digest, the module decomposition + dependency analysis, and the stage-frontier planning-gap analysis.

---

## 1. Current state & stage map

The frontend is **fixture-complete and green**: stage 11 PASS, `pnpm verify` (lint/tsc/398 tests/build) GREEN with the visual suite deliberately excluded. Every page renders deterministically off `buildXxxViewModel()` selectors over fixtures — but **almost nothing is wired to a backend**: across 18 pages, only the navigation `<Link>`s, the search-URL sync, the notification popover, and a handful of local-only form/editor controls actually do anything; all mutations are no-ops or local-state echoes. The seam that turns this into a real product is **stage 15a (service contract)** — fully specified and execution-ready — followed by per-module backend TDD (stage 16) and per-module frontend wiring (stage 15b, *unplanned*). Stages 12 (visual re-validation), 15b, and 17 (integration/release) are the real remaining build/plan work.

| Stage | What it is | Status | Primary artifact |
|---|---|---|---|
| 00–11 | FE scaffolding, design system, fixtures, pages, a11y, Radix migration | **PASS** (01–09,13,14 await one batch sign-off) | manifest; `frontend/src/**` |
| 12 | Visual re-validation vs SHA-pinned refs (post-Radix; ~25 expected pixel deltas; anti-laundering re-baseline) | **partial** — described, no plan/report doc, gate `not-run` | `frontend/tests/visual/*`; `STAGE-09-GATE-RERUN.md` |
| 15a | Service contract pkg `@creatoros/contract` (envelope, primitives, resource DTOs, 4 page DTOs, endpoint registry, typed client, registry+traceability tests) | **planned, execution-ready** — not executed (no `contract/` dir) | spec `…/specs/2026-06-21-service-contract-design.md` · plan `…/plans/2026-06-21-service-contract-15a.md` |
| 15b | FE mock-backend store + MockTransport; migrate 17 read paths to `await client.*`; wire high-value mutations w/ `router.refresh` | **UNPLANNED** — scoped only, deferred to its own spec/plan | §5 of the 15a design doc (bullets only) |
| 16 | Backend TDD per module (RED→GREEN), 12 file-level sub-plans + 5 E2E | **partial** — master plan only; 12 sub-plans not generated | `backend/TDD-PLAN.md`, `SPEC.md`, `MODULE-ARCHITECTURE.md` |
| 17 | Integration & release; swap MockTransport→HttpTransport at composition root | **UNPLANNED** — named only, blocked on 12/15/16 | none |

---

## 2. The build model — the seam

The architecture lets backend and frontend build **as vertical slices in parallel**, joined by a typed contract:

```
                 ┌──────────────────────────────────────────────┐
   15a CONTRACT   │  @creatoros/contract                          │
  (build first)   │  envelope · DTOs · endpoint registry · client │
                 └───────────────┬───────────────┬───────────────┘
                                 │               │
              ┌──────────────────▼──┐         ┌──▼───────────────────┐
   per module │ 16  Backend TDD      │         │ 15b  FE wiring        │
   in parallel│ RED→GREEN against    │  same   │ reads → await client.*│
              │ the contract types   │ contract│ mutations → refresh   │
              └──────────┬───────────┘         └──────────┬───────────┘
                         │  MockTransport now (15b) ───────┘
                         │  HttpTransport at composition root (17)
                         ▼
                 17 INTEGRATION & RELEASE
```

- **The contract is the single seam.** Both sides depend on `@creatoros/contract` types and the endpoint registry; neither imports the other. Once 15a lands, a module's backend (16) and its page wiring (15b) can proceed concurrently because both are typed against the same DTOs.
- **Transport is swappable.** 15b wires the FE to a server-side `MockBackend` store (seeded from the existing fixtures, deterministic `FIXED_NOW`/seeded counters) via `MockTransport`, so pages become *interactive and persistent within a session* with no backend running. At stage 17 the composition root swaps `MockTransport → HttpTransport` pointing at the real stage-16 services — no page code changes.
- **Reads first, then mutations.** 15b migrates the 17 read paths from direct selector calls to `await client.get*()`, then layers the high-value mutations (stage/output/publication transitions, script save+adopt, knowledge/asset create, notification read, insight→learning) each with `router.refresh()`.
- **Reference specs:** contract design `…/specs/2026-06-21-service-contract-design.md`; 15a task plan `…/plans/2026-06-21-service-contract-15a.md`; backend `backend/TDD-PLAN.md` + `SPEC.md` + `MODULE-ARCHITECTURE.md`.

---

## 3. Module decomposition & parallelization waves

Dependency-ordered. A wave starts only after all prior waves are green. **Critical path:** `Wave 0 → Identity → Projects → {Knowledge+Assets} → Artifacts → Publishing → Analytics → Reviews → {Learnings, AI} → query services`.

| Module | Deps (must exist first) | Pages powered | TDD phase |
|---|---|---|---|
| **Identity** | none | Settings, shell | 1 |
| **Settings** | Identity | Settings, AI Copilot | 1 |
| **Notifications** | none | Dashboard, shell, Settings | 10 (build early) |
| **Search** | none | Global Search, Knowledge | 4 (build early) |
| **Taxonomy** | Identity | Research, Knowledge, Assets | 4 |
| **Projects** | Identity, Notifications, Search | Projects, New Project, Overview, Planning, shell | 2 |
| **Knowledge** | Projects, Search, Taxonomy | Research, Planning, Knowledge | 4 |
| **Assets** | Projects, Search, Taxonomy, object-storage | Research, Planning, Production, Publishing, Assets, Settings | 5 |
| **Artifacts** | Projects, Knowledge, Assets, Search | Research, Planning, Script, Production, Overview | 3 |
| **Production** | Projects, Artifacts, Assets, Notifications | Production | 6 |
| **Publishing** | Projects, Assets, Notifications, Search | Publishing Workspace, Publishing Center | 7 |
| **Ingestion** | Publishing, Analytics, Knowledge, Assets, Artifacts, Notifications | (external skill; no page) | 7 |
| **Analytics** | Publishing | Review, Publishing Center, Experience, Dashboard | 8 |
| **Reviews** | Projects, Publishing, Analytics, Artifacts | Review, Experience | 9 |
| **Learnings** | Reviews, Projects, Search, Taxonomy | Dashboard, Review, Experience | 9 |
| **AI** | Settings, Projects, Artifacts, Knowledge, Assets, Reviews, Notifications | Script, AI Copilot | 10 |

**Waves (concurrency):**

- **Wave 0 — Foundation (single-stream, blocking):** Phase 0 skeleton + architecture guards (composition root, module template, dependency-cruiser/ESLint boundary tests) **+ stage 15a contract package**. Nothing parallelizes before this.
- **Wave 1 — zero-dependency roots (4 parallel tracks):** `{Identity, Notifications, Search}` fully concurrent; `{Settings, Taxonomy}` follow Identity.
- **Wave 2 — project graph:** **Projects** first (unblocks the most) → then `{Knowledge, Assets}` parallel → **Artifacts** joins once both land.
- **Wave 3 — downstream domain:** `{Production, Publishing}` parallel → **Analytics** → `{Ingestion, Reviews}` parallel → Reviews unblocks `{Learnings, AI}` parallel.
- **Wave 4 — page-composition query services (last, Phase 11, all 4 parallel, no inter-deps):** DashboardQueryService, ProjectOverviewQueryService, PublishingCenterQueryService, GlobalSearchQueryService. Consume only public services, never repositories.

Spare-capacity absorbers (wide-but-shallow, off critical path): Notifications, Search, Taxonomy, Settings, Production, Ingestion.

---

## 4. Complete interaction / button inventory

Exhaustive per page. **State legend:** `wired-local` = works client-side today, no persistence · `decorative` = renders but no handler (inert) · `needs-backend` = the real product behavior requires a server mutation/read. Repeated rows (e.g. 4 todos) listed once as a row-type.

### Dashboard `/` — wired-local 2 · decorative 7 · needs-backend 0
| Label | Type | State | Business action | Target op | Module | Transition |
|---|---|---|---|---|---|---|
| 开始对话 (AI CTA Link) | link | wired-local | Open copilot via `?copilot=open` | POST /ai/conversations | AI | — |
| 新项目 (entry Link) | link | wired-local | Open `/projects/new` modal | POST /projects | Projects | →draft (on modal create) |
| 继续创作 row | other | decorative | Resume project at current stage | GET /projects/:id/overview | Projects | — |
| 待办事项 row (×4) | other | decorative | Open/complete task | GET /projects/:id/tasks | Projects | Task open→done |
| 热门选题 row | other | decorative | Open topic / seed project | — | Knowledge | — |
| 最近发布 row (×4) | other | decorative | Open publication analytics | GET /analytics/projects/:id | Analytics | — |
| 数据概览 MetricCards | other | decorative | KPI tiles (no drill-down) | GET /analytics/projects/:id | Analytics | — |
| 本周播放趋势 sparkline | other | decorative | Static SVG trend | GET /analytics/projects/:id | Analytics | — |
| 创作建议 row | other | decorative | Adopt AI suggestion | POST /ai/tasks | AI | — |

### Projects `/projects` — wired-local 12 · decorative 8 · needs-backend 5
| Label | Type | State | Business action | Target op | Module | Transition |
|---|---|---|---|---|---|---|
| 搜索项目 (header search) | link | wired-local | Navigate to /search | GET /search | Search | — |
| 筛选 (TopHeader) | button | decorative | Open filter panel | GET /projects | Projects | — |
| ＋新建项目 | link | wired-local | Open /projects/new | POST /projects | Projects | →draft |
| 通知 bell | popover | wired-local | Toggle notifications | GET /notifications | Notifications | — |
| 全部标记为已读 | button | needs-backend | Mark all read (local Set today) | POST /notifications/:id/read | Notifications | unread→read |
| Notification item | menu | decorative | Single notification (no deep-link) | — | Notifications | — |
| 7 status tabs | tab | needs-backend | Filter by lifecycle status (visual-only) | GET /projects | Projects | — |
| 网格视图 toggle | toggle | wired-local | Grid layout (not persisted) | — | Projects | — |
| 列表视图 toggle | toggle | wired-local | List layout (not persisted) | — | Projects | — |
| 排序 SortSelect | select | needs-backend | Sort order (no re-sort wired) | GET /projects | Projects | — |
| 打开 (per row) | link | wired-local | Open workspace at current stage | GET /projects/:id/overview | Projects | — |
| ⋯ more (per row) | menu | decorative | Per-project context menu | PATCH /projects/:id | Projects | — |
| Pagination prev/numbers/next | button | decorative | Page the list (no handler/href) | GET /projects | Projects | — |
| 关闭 X (dialog) | button | wired-local | Close New Project dialog | — | Projects | — |
| Overlay backdrop | other | wired-local | Click-outside / Esc to close | — | Projects | — |
| 项目名称 input | form | wired-local | Capture name (gates Create) | POST /projects | Projects | — |
| 一句话描述 textarea | form | wired-local | Capture brief | POST /projects | Projects | — |
| 目标平台 radio cards | select | wired-local | Pick platform | POST /projects | Publishing | — |
| 内容类型 radio cards | select | wired-local | Pick contentType | POST /projects | Projects | — |
| 创作模式 radio cards | select | wired-local | Pick creation mode | POST /projects | Projects | — |
| 创建后进入工作区 checkbox | toggle | wired-local | Post-create routing | — | Projects | — |
| 取消 | button | wired-local | Abandon create | — | Projects | — |
| 创建 (submit) | form | needs-backend | Create project (local success today) | POST /projects | Projects | →draft; Stage research→in_progress |

### Project Overview `/projects/:id` — wired-local 1 · decorative 4 · needs-backend 0
| Label | Type | State | Business action | Target op | Module | Transition |
|---|---|---|---|---|---|---|
| 编辑信息 | button | decorative | Edit project metadata | PATCH /projects/:id | Projects | — |
| 收藏 | button | decorative | Toggle favorite | PATCH /projects/:id | Projects | — |
| 分享 | button | decorative | Share (no §13 endpoint — spec gap) | — | Projects | — |
| 更多 | menu | decorative | Overflow (archive etc.) | POST /projects/:id/archive | Projects | active→archived |
| 进入工作台 | link | wired-local | Enter workspace at current stage | — | Projects | — |

### Research Workspace `/projects/:id/research` — wired-local 6 · decorative 6 · needs-backend 2
| Label | Type | State | Business action | Target op | Module | Transition |
|---|---|---|---|---|---|---|
| 资料类型 tabs (全部/文章/视频/报告/播客) | tab | wired-local | Filter sources by type (filter is no-op today) | GET /knowledge | Knowledge | — |
| 竞品平台 TagChip | other | decorative | Platform pill | — | Analytics | — |
| 威胁等级 StatusBadge | other | decorative | Threat-level badge | — | Projects | — |
| 资料来源标签 TagChip | other | decorative | Source tags | — | Taxonomy | — |
| 相关标签 TagChip | other | decorative | Related tags | GET /search | Taxonomy | — |
| 趋势卡片 indicator | other | decorative | Trend arrow | — | Analytics | — |
| 研究笔记行 | other | needs-backend | Add/edit/delete notes | POST /knowledge/:id/revisions | Knowledge | — |
| 证据收藏行 | other | needs-backend | Link/unlink evidence | POST /knowledge/:id/relations | Knowledge | — |
| 竞品分析表 rows | other | decorative | Read-only comparison table | — | Knowledge | — |

### Planning Workspace `/projects/:id/planning` — wired-local 5 · decorative 9 · needs-backend 0
| Label | Type | State | Business action | Target op | Module | Transition |
|---|---|---|---|---|---|---|
| 5 planning tabs (合同/论点树/证据/受众/差异化) | tab | wired-local | Switch sub-view (no content swap) | GET /projects/:id/artifacts | Artifacts | — |
| 查看全部 (contract) | button | decorative | Open contract editor | GET /projects/:id/artifacts | Artifacts | — |
| 全部素材 | button | decorative | Open asset browser | GET /assets | Assets | — |
| ContractCard ×4 | other | decorative | Edit + approve contract dimension | POST /artifacts/:id/versions | Artifacts | ContentOutput draft→active |
| CoreThesisCard | other | decorative | Edit core thesis | POST /artifacts/:id/versions | Artifacts | — |
| ThesisTree root / column nodes | other | decorative | Edit/create ThesisNodes | POST /artifacts/:id/versions | Artifacts | — |
| EvidenceMap rows | other | decorative | Attach/detach EvidenceLink | POST /artifacts/:id/relations | Artifacts | — |
| KeyMaterials rows | other | decorative | Open asset / manage relation | GET /assets/:id | Assets | — |
| Status/type TagChips | other | decorative | Presentational pills | — | Artifacts | — |

### Script Workspace `/projects/:id/script` — wired-local 12 · decorative 5 · needs-backend 4
| Label | Type | State | Business action | Target op | Module | Transition |
|---|---|---|---|---|---|---|
| 4 tabs (主脚本/章节/引用/摘要) | tab | decorative | Switch sub-view (no routing) | GET /artifacts/:id | Artifacts | — |
| 16 toolbar buttons (bold/italic/underline/strike/H1-3/list×2/quote/code/link) | toggle | wired-local | Visual aria-pressed only (no RTE) | — | Artifacts | — |
| 保存 / Save | button | needs-backend | Persist as new ArtifactVersion (local flag today) | POST /artifacts/:id/versions | Artifacts | edits → new current_version |
| Section body editor (textarea per section) | editor | needs-backend | Edit ScriptSection inline | POST /artifacts/:id/versions | Artifacts | dirty → new version on save |
| 版本记录 cards | other | decorative | Restore prior version | GET /artifacts/:id/versions; POST /artifacts/:id/restore | Artifacts | restore → re-promote to current |
| 大纲结构 rows | other | decorative | Jump-to-section nav | GET /artifacts/:id | Artifacts | — |
| AI 写作建议 rows | other | needs-backend | Adopt AI rewrite candidate | POST /ai/tasks/:id/confirm → POST /artifacts/:id/versions | AI | Task awaiting_confirmation→completed; candidate→current |
| 金句 rows | other | decorative | Promote golden quote | GET /artifacts/:id | Artifacts | — |

### Production Workspace `/projects/:id/production` — wired-local 11 · decorative 7 · needs-backend 1
| Label | Type | State | Business action | Target op | Module | Transition |
|---|---|---|---|---|---|---|
| 真人口播 mode | toggle | wired-local | Select recording mode | PUT /outputs/:id/production | Production | — |
| 知识演示 mode | toggle | wired-local | Select knowledge-demo mode | PUT /outputs/:id/production | Production | — |
| AI 数字人 mode (disabled) | toggle | decorative | Coming-soon, inert | — | Production | — |
| 导入脚本 | link | decorative | Import approved script | GET /outputs/:id/production | Production | — |
| Asset category tab | tab | wired-local | Filter asset grid by type | GET /assets | Assets | — |
| Asset thumbnail | other | decorative | Attach asset to segment | POST /productions/:id/segments | Production | — |
| Preview aspect 16:9 | toggle | decorative | Switch preview ratio | — | Production | — |
| Preview play / pause / reset | button | wired-local | Local preview playback | — | Production | — |
| 设备检测 / 预览字幕效果 | link | decorative | Settings actions (href=#) | — | Production | — |
| Recording overlay toggle | toggle | wired-local | Toggle recording setting | PUT /outputs/:id/production | Production | — |
| AI subtitle toggle | toggle | wired-local | Toggle AI subtitles | PUT /outputs/:id/production | Production | — |
| Settings value chips | other | decorative | Fixed setting values (should be selects) | PUT /outputs/:id/production | Production | — |
| 导出视频 | button | needs-backend | Export to draft/publish package (local jump today) | POST /productions/:id/exports | Production | ContentOutput active→ready (on complete) |
| 添加章节 / 添加新片段 | button | wired-local | Append timeline segment | POST /productions/:id/segments | Production | — |
| Timeline segment card | button | wired-local | Select segment (drag-reorder NOT impl) | POST /productions/:id/segments | Production | — |

### Publishing Workspace `/projects/:id/publishing` — wired-local 8 · decorative 15 · needs-backend 1
| Label | Type | State | Business action | Target op | Module | Transition |
|---|---|---|---|---|---|---|
| Publishing tabs (设置/记录/平台/批量) | tab | wired-local | Switch sub-view (no panel swap) | — | Publishing | — |
| Title input | editor | wired-local | Edit title + counter | POST /publications/:id/revisions | Publishing | — |
| Description / Cover / Category / Series | other | decorative | Look editable, no handler | POST /publications/:id/revisions | Publishing/Assets | — |
| Tag chips × remove | filter | decorative | × glyph, no remove handler | POST /publications/:id/revisions | Publishing | — |
| Option toggles (评论/草稿/通知粉丝) | toggle | wired-local | Per-publication options (local) | POST /publications/:id/revisions | Publishing | — |
| Extra option checkboxes (评论/弹幕/转发) | toggle | decorative | Static ✓ spans | POST /publications/:id/revisions | Publishing | — |
| Platform select checkbox | toggle | wired-local | Pick platforms for batch | — | Publishing | — |
| Platform publish card | other | wired-local | Selected styling + status badge | GET /outputs/:id/publications | Publishing | — |
| 批量设置时间 / 清空时间 / 立即发布 pill | button/toggle | decorative | Bulk time actions (no handler) | POST /publications/:id/revisions | Publishing | — |
| 确认发布 | button | needs-backend | Publish selected (fixture mirror today) | POST /publications/:id/transition | Publishing | draft→ready→scheduled→published |
| Confirm result status text | other | wired-local | role=status reflection | — | Publishing | — |
| 内容日历 cells | other | decorative | 7-day schedule overview | GET /outputs/:id/publications | Publishing | — |
| 发布前检查 rows | other | decorative | Pre-publish checklist | — | Publishing | — |
| Preview platform tabs (B站/抖音/视频号/小红书) | tab | decorative | Look wired but NO onClick (gotcha) | — | Publishing | — |
| Metrics summary / comparison table / comments teaser | other | decorative | Analytics-sourced display | GET /analytics/publications/:id | Analytics | — |
| 发布清单 / 发布提示 / 查看更多提议 | other/link | decorative | Static lists; href=# | — | Publishing | — |

### Analytics Review `/projects/:id/review` — wired-local 7 · decorative 2 · needs-backend 0
| Label | Type | State | Business action | Target op | Module | Transition |
|---|---|---|---|---|---|---|
| 7 page tabs (整体/平台/观众/内容/收益/对比/体验) | tab | wired-local | Re-scope window (fixture selector) | GET /analytics/projects/:id | Analytics | — |
| 趋势 / 漏斗 chart tabs | tab | wired-local | Emphasise chart (local UI) | — | Analytics | — |
| Key-moment rows | other | wired-local | Select moment (local highlight) | — | Analytics | — |
| 查看全部 (top-published) | button | decorative | Open full published list | GET /analytics/projects/:id | Analytics | — |
| Top-published cards | other | decorative | Open publication analytics | GET /analytics/publications/:id | Analytics | — |
| Review-history rows | other | wired-local | Select review (open detail not wired) | GET /reviews/:id | Reviews | — |

> **Gap:** no UI to create review / add insight / complete review (`POST /projects/:id/reviews`, `POST /reviews/:id/insights`, `POST /reviews/:id/complete`) — review-authoring surface is greenfield.

### Knowledge `/knowledge` — wired-local 7 · decorative 9 · needs-backend 0
| Label | Type | State | Business action | Target op | Module | Transition |
|---|---|---|---|---|---|---|
| Search input | form | wired-local | Filter list + ?q= mirror | GET /knowledge | Knowledge | — |
| 5 type filter chips (全部/参考/笔记/片段/记录) | filter | wired-local | Narrow by type (client) | GET /knowledge | Knowledge | — |
| Recent row (select) | other | wired-local | Single-select (no detail fetch) | GET /knowledge/:id | Knowledge | — |
| Category rows | other | decorative | Filter by category (no handler) | GET /knowledge | Knowledge | — |
| Popular tags / row tags | filter/other | decorative | Tag filter (inert TagChip) | GET /knowledge | Knowledge | — |
| Memory insights | other | decorative | Adopt AI insight (no control) | — | Knowledge | — |
| Unsorted items | other | decorative | Open/categorize | POST /knowledge/:id/relations | Knowledge | — |
| Reusable snippets | other | decorative | Insert into script | — | Knowledge | — |
| Metrics ×5 / graph chart | other | decorative | Display only | — | Knowledge | — |

> **Gap:** no create/edit/add-note affordance (`POST /knowledge`, `POST /knowledge/:id/revisions`) anywhere on this page.

### Assets `/assets` — wired-local 1 · decorative 28 · needs-backend 5
| Label | Type | State | Business action | Target op | Module | Transition |
|---|---|---|---|---|---|---|
| Toolbar search | form | decorative | Full-text filter (server-shell inert) | GET /assets | Assets | — |
| 5 filter chips (类型/来源/项目/标签/更多) | filter/popover | decorative | Filter gallery | GET /assets | Assets | — |
| 清除筛选 | button | decorative | Reset filters | GET /assets | Assets | — |
| 批量操作 ▾ | menu | decorative | Bulk ops menu | POST /assets/:id/trash | Assets | active→trashed |
| ＋上传素材 | button | needs-backend | Two-phase upload | POST /assets/uploads → /complete | Assets | Upload created→completed |
| Sidebar search | form | decorative | In-rail filter | GET /assets | Assets | — |
| 9 type rows + 2 collection rows (收藏/回收站) | tab | decorative | Scope gallery | GET /assets | Assets | — |
| 全选 checkbox | toggle | decorative | Select-all (no onChange) | — | Assets | — |
| 网格/列表 view toggles | toggle | decorative | Layout preference | — | Assets | — |
| 排序方式 / 每页条数 | select | decorative | Sort / page size (defaultValue only) | GET /assets | Assets | — |
| Asset card | button | wired-local | Select → detail panel | — | Assets | — |
| Pagination numbers / next | button | decorative | Page list | GET /assets | Assets | — |
| 下载 | button | needs-backend | Download file | GET /assets/:id | Assets | — |
| 复制链接 | button | needs-backend | Copy object-storage URL | GET /assets/:id | Assets | — |
| 收藏 | button | needs-backend | Toggle favorite | POST /assets/:id/files | Assets | — |
| 更多 (detail overflow) | menu | needs-backend | Rename/trash/attach/version | POST /assets/:id/trash | Assets | active→trashed |

### Publishing Center `/publishing` — wired-local 12 · decorative 0 · needs-backend 3
| Label | Type | State | Business action | Target op | Module | Transition |
|---|---|---|---|---|---|---|
| 内容类型 tabs (全部/视频/图文/音频) | tab | wired-local | Filter by content type | GET /publications | Publishing | — |
| 搜索发布内容 | form | wired-local | Free-text filter + ?q= | GET /search | Search | — |
| 4 filter chips (全部/7天/30天/待优化) | filter | wired-local | Date/engagement filter | — | Publishing/Analytics | — |
| 全选 checkbox | toggle | wired-local | Select all visible rows | — | Publishing | — |
| 批量发布 | button | needs-backend | Batch-publish selected | POST /publications/:id/transition | Publishing | scheduled/ready→published |
| 批量下架 | button | needs-backend | Batch-remove | POST /publications/:id/transition | Publishing | published→removed |
| 修改时间 | button | needs-backend | Batch-reschedule | POST /publications/:id/revisions | Publishing | ready→scheduled |
| Row checkbox | toggle | wired-local | Add/remove from batch | — | Publishing | — |
| 查看 (row action) | button | wired-local | Highlight row (detail not wired) | GET /publications/:id | Publishing | — |
| Pagination prev/page/next | button | wired-local | Client-side paging | — | Publishing | — |

### Experience Center `/experience` — wired-local 7 · decorative 0 · needs-backend 3 (n quick actions)
| Label | Type | State | Business action | Target op | Module | Transition |
|---|---|---|---|---|---|---|
| 7 category tabs (全部/选题/脚本/拍摄/剪辑/运营/复盘) | tab | wired-local | Filter learnings (visual only) | GET /learnings | Learnings | — |
| 快速记录 action buttons (×N) | button | needs-backend | Quick-record a learning (server-shell inert) | POST /learnings | Learnings | Learning none→draft/unverified |

> **Gap:** no UI for apply (`POST /learnings/:id/applications`) or evaluate (`POST /learnings/:id/evaluate`); discoveries/records/categories not clickable.

### Search `/search` — wired-local 6 · decorative 8 · needs-backend 1
| Label | Type | State | Business action | Target op | Module | Transition |
|---|---|---|---|---|---|---|
| Page search input | form | wired-local | Query ↔ ?q= sync, client filter | GET /search | Search | — |
| Result type tabs (项目/知识/素材/视频) | tab | decorative | Scope facet (no onClick) | GET /search | Search | — |
| Topic filter chips (AI/教程/提示词/Agent/变现/出海) | filter | decorative | Tag facet | GET /search | Search | — |
| 查看全部 ×4 (项目/知识/素材/视频) | link | wired-local | Navigate to list page | GET /projects ·/knowledge ·/assets ·/publications | Projects/Knowledge/Assets/Publishing | — |
| Project/knowledge/asset/video result cards | other | decorative | Open detail (not links yet) | GET /…/:id | Projects/Knowledge/Assets/Publishing | — |
| Side facet rows (type/stage/tag) | filter | decorative | Apply facet | GET /search | Search | — |
| Quick-action links | link | wired-local | Jump to entry point (fixture href) | — | Search | — |
| Search-history rows | other | needs-backend | Re-run prior query (persist history) | GET /search | Search | — |
| Search-tips rows | other | decorative | Static syntax tips | — | Search | — |

> **Gap:** no saved-search/history-persistence endpoint in §13 — flag as backend spec gap.

### Settings `/settings` — wired-local 9 · decorative 8 · needs-backend 16
| Label | Type | State | Business action | Target op | Module | Transition |
|---|---|---|---|---|---|---|
| 8 section tabs (账户/偏好/通知/外观/集成/存储/数据/关于) | tab | wired-local | Switch section (visual only, no content swap) | — | Settings | — |
| 已验证 badge / plan / timezone chips | other | decorative | Display-only identity labels | — | Identity | — |
| 昵称 / 邮箱 inputs | editor | needs-backend | Edit profile | — (no §13 PATCH /me) | Identity | — |
| 默认主页 / 创作模式 / 默认可见性 selects | select | needs-backend | Persist preference | PATCH /settings/preferences | Settings | — |
| 自动保存 / 使用情况分析 switches | toggle | needs-backend | Persist preference | PATCH /settings/preferences | Settings | — |
| 主题 / 密度 / 语言 selects | select | needs-backend | Persist preference | PATCH /settings/preferences | Settings | — |
| 桌面通知 switch | toggle | needs-backend | Persist preference | PATCH /settings/preferences | Settings | — |
| 存储进度条 / 分布 rows | other | decorative | Display-only (cross-module aggregate) | GET /settings | Settings | — |
| 提供商 / 模型 selects | select | needs-backend | Persist model config | PUT /settings/models/:capability | Settings | — |
| 温度 number input | editor | needs-backend | Persist model config | PUT /settings/models/:capability | Settings | — |
| 导入 / 导出 | button | decorative | Account import/export (no route exposed) | — | Identity | — |
| 确认删除账户 switch | toggle | wired-local | Arm destructive gate | — | Identity | — |
| 删除账户 | button | needs-backend | Delete account (30-day window) | — (Identity coordination) | Identity | — |

### AI Copilot `/?copilot=open` — wired-local 7 · decorative 8 · needs-backend 4
| Label | Type | State | Business action | Target op | Module | Transition |
|---|---|---|---|---|---|---|
| 历史记录 | button | decorative | Open prior conversations | GET /ai/conversations | AI | — |
| Close X / backdrop / Esc | button/popover/other | wired-local | Dismiss overlay (param removal) | — | — | — |
| Prompt textarea | editor | wired-local | Compose instruction (local) | — | AI | — |
| Prompt submit / 生成 | form/button | needs-backend | Send to AI (canned reply today) | POST /ai/conversations/:id/messages | AI | — |
| 清空 | button | wired-local | Clear textarea | — | — | — |
| Suggested action chips | filter | wired-local | Insert template into textarea | — | AI | — |
| Recommended command rows | menu | needs-backend | Run AI command/task | POST /ai/tasks | AI | — |
| 查看所有指令 / 查看全部 ×2 | link | decorative | Open catalogs (no href) | GET /ai/conversations | AI | — |
| Recent task rows | other | decorative | Reopen task (static div) | — | AI | — |
| Continuing task cards | other | decorative | Resume/confirm/cancel (static) | POST /ai/tasks/:id/confirm | AI | — |
| Quick entry buttons | button | decorative | Shortcuts (no onClick) | — | AI | — |
| Smart recommendation chips | button | needs-backend | Act on context suggestion | POST /ai/tasks | AI | — |
| Keyboard hint | other | decorative | Static hint | — | — | — |

### New Project Overlay `/projects/new` — wired-local 21 · decorative 1 · needs-backend 1
(Same controls as the Projects-page dialog above; **创建 (submit)** is the sole `needs-backend` → `POST /projects`, transition `Project →draft` + seed 6 stages; the 创作模式 badge is the lone decorative element; all 6+6+3 radio cards, both text fields, EnterAfterCreate, backdrop, X, Cancel are `wired-local`.)

### Shell (Sidebar + TopHeader + NotificationPopover, all routes) — wired-local 17 · decorative 14 · needs-backend 3
| Label | Type | State | Business action | Target op | Module | Transition |
|---|---|---|---|---|---|---|
| 7 nav items (首页/项目/知识库/素材/发布/经验/设置) | link | wired-local | Section navigation | GET /…(per dest) | various | — |
| Brand mark / unread dot / user profile card | other | decorative | Visual / static (no menu wired) | — / GET /settings | —/Identity | — |
| Sidebar context item (current project) | link | wired-local | Open project overview | GET /projects/:id/overview | Projects | — |
| 打开 AI 助手 | link | wired-local | Open copilot (`?copilot=open`) | POST /ai/conversations | AI | — |
| 素材库存储 progress bar | other | decorative | Storage usage (on /assets) | GET /assets | Assets | — |
| Global search input (/search) | form | needs-backend | Global search (preventDefault today) | GET /search | Search | — |
| Search trigger / dashboard+projects search pills | link | wired-local | Navigate to /search (⌘K hint decorative) | GET /search | Search | — |
| ⌘K kbd hint | other | decorative | No keydown listener bound | — | — | — |
| 通知 bell + unread badge | popover/other | wired-local | Open popover / show count | GET /notifications | Notifications | — |
| 全部标记为已读 | button | needs-backend | Mark all read (local Set today) | POST /notifications/:id/read | Notifications | unread→read |
| Notification list item | other | decorative | Single notification (no per-item handler) | POST /notifications/:id/read | Notifications | — |
| ＋新建项目 (dashboard + projects headers) | link | wired-local | Open /projects/new | POST /projects | Projects | →draft |
| 筛选 (projects header) | button | decorative | Open filters (handler-less) | GET /projects | Projects | — |
| 进入工作台 / 进入下一步 | link | wired-local | Enter/advance stage (navigates only — no transition POST) | POST /projects/:id/stages/:stage/transition | Projects | Stage in_progress→completed; next not_started→in_progress |
| 完成制作 / 查看数据 / 导出报告 (terminal-stage) | button | decorative | Finish/view/export (no behavior) | POST /outputs/:id/stages/:stage/transition | Production | ContentOutput ready→published |
| 分享 / 更多 (project + generic headers) | button/menu | decorative | Share / overflow (handler-less) | — | Projects | — |
| Generic primary/secondary CTA | button | decorative | Fallback CTAs (no href/onClick) | — | Projects | — |
| Six-stage stepper | other | decorative | Display stages (not clickable) | GET /projects/:id/overview | Projects | — |

### Inventory roll-up

| | wired-local | decorative | needs-backend | page total |
|---|---|---|---|---|
| Dashboard | 2 | 7 | 0 | 9 |
| Projects | 12 | 8 | 5 | 25 |
| Project Overview | 1 | 4 | 0 | 5 |
| Research | 6 | 6 | 2 | 14 |
| Planning | 5 | 9 | 0 | 14 |
| Script | 12 | 5 | 4 | 21 |
| Production | 11 | 7 | 1 | 19 |
| Publishing Workspace | 8 | 15 | 1 | 24 |
| Analytics Review | 7 | 2 | 0 | 9 |
| Knowledge | 7 | 9 | 0 | 16 |
| Assets | 1 | 28 | 5 | 34 |
| Publishing Center | 12 | 0 | 3 | 15 |
| Experience | 7 | 0 | 3 | 10 |
| Search | 6 | 8 | 1 | 15 |
| Settings | 9 | 8 | 16 | 33 |
| AI Copilot | 7 | 8 | 4 | 19 |
| New Project Overlay | 21 | 1 | 1 | 23 |
| Shell | 17 | 14 | 3 | 34 |
| **TOTAL** | **151** | **139** | **49** | **339** |

> The **49 needs-backend controls** are the true mutation/work surface the build must light up. The **139 decorative** controls are mostly "look interactive, do nothing" — many need to be *lifted from server-shell into client islands or made into links* before they can even fire (notably the entire Assets toolbar/sidebar, Publishing-Workspace preview tabs, Search facets, and Settings persistence). **wired-local** controls already work but persist nothing.

---

## 5. Business logic & state machines (condensed)

**State machines (SPEC §12):**
- **Project:** `draft→active`; `active↔paused`; `active/paused→completed`; `completed→archived`. Archived ⇒ read-only, excluded from in-progress stats.
- **Stage** (Project & Output share): `not_started→in_progress→completed`; `in_progress↔blocked`; `not_started|in_progress→skipped` (**guard: reason + timestamp**).
- **ContentOutput:** `draft→active→ready→published→retired`; `active→cancelled`. **Guard:** `published` ⇔ ≥1 Publication published (not all).
- **Publication:** `draft→ready→scheduled→published`; `scheduled→failed`; `published→removed`. `removed` deletes platform content but **retains metrics history**.
- **AI Task:** `queued→running→awaiting_confirmation→completed`; `queued|running→failed|cancelled`.
- **Learning validation:** `hypothesis→validated|rejected→deprecated`.
- **Asset:** `active↔trashed`; physical delete only after retention + no references.
- **Review:** open → completed; **Notification:** unread→read. No machine for Knowledge/Artifacts (append-only versioning), Identity/Settings/Taxonomy/Search.

**Tricky-logic callouts (must be wired carefully):**
1. **Version immutability + AI candidate-adopt** (Artifacts × AI): `ArtifactVersion` append-only; `restoreVersion` = new version cloning old content. AI/Ingestion create a **candidate**; only `confirmResult` (from `awaiting_confirmation`) promotes it to `current_version`. Two enforcement points: AI confirm path + Ingestion "new candidate version" rule.
2. **Stage skip semantics** (Projects): `skipped` needs reason+timestamp; counts as *completed* for progress math but UI renders **"已跳过"**. `progress_pct` = avg of 6 stage progresses (Script/Production/Publishing/Review aggregate across all non-cancelled Outputs' OutputStages); it's a **query cache, not a fact**. Stages not strictly serial.
3. **Publication = external fact-of-record** (Publishing): no internal publish queue; statuses reflect external platform reality (manual/script). `ContentOutput.published` = ≥1 Publication published. `removed` keeps metrics.
4. **Metrics idempotency** (Analytics × Ingestion): `resolvePublication` then append; duplicate idempotency key **or identical `captured_at`** must not create a duplicate snapshot. UNIQUE `(external_source_id, idempotency_key)` and `(run_id, record_key)`; re-submission returns original; batches partially-successful; append-only.
5. **ProductionSegment vs TimelineSegment** (Production × Artifacts): TimelineSegment belongs to ArtifactVersion (versionable plan, immutable); ProductionSegment belongs to Production (actual state). Entering production **copies structure + keeps source ref**; later edits never rewrite the plan.

**Cross-cutting (SPEC §11):** one UoW per request; cross-module callees receive a **transaction-aware service, never a repository**; object-storage uses **stage-then-confirm** (no tx rollback reliance); Search/Notifications run **post-commit** and their failure never rolls back business truth (→ retryable record). Ownership is **User-only**; ownership errors surface as **404**. Assets is the **sole** module touching object storage.

---

## 6. Planning gaps

**Planned & execution-ready (have an artifact):**
- **15a service contract** — spec `…/specs/2026-06-21-service-contract-design.md` + plan `…/plans/2026-06-21-service-contract-15a.md`. *Ready to run now.*
- **16 backend TDD (master)** — `backend/TDD-PLAN.md` with per-module RED cases + 5 named E2E. *Foundation present; needs its 12 sub-plans generated first.*

**UNPLANNED — must be brainstormed + specced before any workflow can execute:**
1. **15b — FE mock-backend integration + interactions** (the biggest unplanned item; "the large, risky part"). Named pieces only: resettable in-memory store (`FIXED_NOW`/seeded counter), `MockTransport`, the 17-page async read migration, the mutation set (stage transition, publication transition, script save/adopt, knowledge/asset create, notification read, insight→learning). **No spec/plan exists.**
2. **Stage 17 — integration & release.** No artifact. Needs cross-module workflow tests, `MockTransport→HttpTransport` composition-root swap, release gate.
3. **Stage 12 — visual re-validation plan.** *What* is understood (~25 expected pixel deltas, Controller-gated anti-laundering re-baseline) but no plan/report doc. Worth a short adjudication plan.
4. **Stage-16 per-module file-level sub-plans (12).** §20 mandates generating them before coding; none generated. Treat as planning work.

**Backend spec gaps surfaced by the inventory (decide before wiring those buttons):**
- **Share** (Project Overview, Shell 分享) — no §13 endpoint. Decide: drop, or add share.
- **Search history / saved search** — no persistence endpoint in §13 (Search page history rows).
- **Account profile edit** (Settings 昵称/邮箱) — no `PATCH /me`; only the settings aggregate.
- **Account import/export/delete REST surface** (Settings) — Identity coordinates but no §13 REST route exposed.
- **Bulk "mark all read"** — only per-id `POST /notifications/:id/read` exists; a true bulk endpoint is unspecced.

**Non-blocking R2 tail** (does not gate stage-11; permitted by SPEC §8): R2-1 content-layer extraction (`ArtifactListItem`, `KnowledgeListItem`, `EvidenceCard`, `FileThumbnail`, `VersionCard`); R2-3 `FilterBar`/shared `SearchField` migration; R2-6 control sweep onto `ui/*`; R2-7 relocate feature tests; R2-9 = the stage-12 visual gate itself.

---

## 7. Proposed parallel goals (hand-off-ready)

Each goal is a **module vertical**: it assumes the 15a contract slice for that module exists, then runs backend TDD (16) + FE reads & mutations (15b) for the pages it owns. Ordered by the waves in §3. "Lights up" = the inventory controls that become real. Run a goal only after its deps are green.

### G0 — Foundation (blocking, single-stream)
- **Scope:** Phase 0 skeleton + architecture guards **+ execute stage 15a** (`@creatoros/contract`: envelope, primitives, resource DTOs, 4 page DTOs, endpoint registry, typed client, registry+traceability tests). Also stand up the 15b `MockBackend`/`MockTransport` shell **(needs the 15b spec first — see §8)**.
- **Deps:** none. **Lights up:** nothing user-visible; unblocks everything.

### Wave 1 (run G1–G4 in parallel; G2/G4 after G1's `index.ts` is stable)

**G1 — Identity vertical**
- Backend: Identity (Phase 1) — `getCurrentUser`, `requireUser`, `assertUserOwnsContext`, account export/delete coordination. **Deps:** G0.
- FE: ownership-404 plumbing; user profile card data. **Lights up:** Settings identity labels (display), shell user card.

**G2 — Settings vertical** (after Identity)
- Backend: Settings (Phase 1) — `getSettings`, `updatePreferences`, `setModelConfiguration`, `resolveModelForCapability`, agent config; `secret_reference` only.
- FE: wire all Settings preference selects/switches → `PATCH /settings/preferences`; provider/model/temperature → `PUT /settings/models/:capability`; storage aggregate read.
- **Lights up:** Settings (16 needs-backend controls), AI Copilot model resolution. **Decide first:** profile-edit + account-export/delete spec gaps.

**G3 — Notifications vertical**
- Backend: Notifications (Phase 10 module, no deps) — `listNotifications`, `markRead`, `markAllRead`, `getUnreadCount`, `createNotification`.
- FE: bell popover → `GET /notifications`; 全部标记为已读 → per-id read (or new bulk endpoint).
- **Deps:** G0. **Lights up:** shell bell + badge + mark-all-read; Projects-page notification popover.

**G4 — Search + Taxonomy vertical**
- Backend: Search (Phase 4, no deps) — `upsertDocument`, `removeDocument`, `search`, `recordSearch`, `rebuildUserIndex`, retries; Taxonomy (after Identity) — tag CRUD + `assignTags`.
- FE: global search input → real `GET /search`; Search-page result tabs/facets/chips + result cards as links; Knowledge tag chips navigational.
- **Deps:** G0 (Search), G1 (Taxonomy). **Lights up:** Search page (tabs/facets/cards), shell global search, tag affordances. **Decide first:** search-history persistence gap.

### Wave 2 (Projects first, then Knowledge+Assets parallel, then Artifacts)

**G5 — Projects vertical** *(critical path)*
- Backend: Projects (Phase 2) — full CRUD + list/filter/sort, `transitionProjectStage`, `createContentOutput`, `transitionOutputStage`, `setPrimaryOutputAsset`, tasks, activity. Seeds 6 stages + platforms on create.
- FE: New Project create → `POST /projects` (+ seed); Projects list status tabs/sort/pagination → server query; row open/kebab; Overview edit/favorite/archive; **进入工作台/进入下一步 → real stage transition POST**.
- **Deps:** G1, G3, G4-Search. **Lights up:** Projects (5 needs-backend + tabs/sort), New Project Overlay (创建), Project Overview, shell stepper/primary action, Dashboard continue/todo rows.

**G6 — Knowledge vertical** (after Projects)
- Backend: Knowledge (Phase 4) — create/revise/list/relate/attach.
- FE: Knowledge page search/filter → `GET /knowledge`; row → detail; categorize unsorted → relations; Research notes/evidence editing; **add create/edit affordance (greenfield)**.
- **Deps:** G5, G4. **Lights up:** Knowledge page, Research notes/evidence.

**G7 — Assets vertical** (after Projects, parallel with Knowledge)
- Backend: Assets (Phase 5) — two-phase upload, `registerGeneratedAsset`, file versions, attach/role, trash/restore, storage usage. Sole object-storage owner.
- FE: **lift the server-shell toolbar+sidebar into a client list-query island** (GET /assets); 上传素材 two-call upload; detail download/copy/favorite/trash; pagination/sort/select-all.
- **Deps:** G5, G4. **Lights up:** Assets (5 needs-backend + ~28 currently-inert filters), Production asset grid, Settings storage gauge.

**G8 — Artifacts vertical** (after Knowledge + Assets)
- Backend: Artifacts (Phase 3) — create/version (immutable), restore, relations, `replaceStructuredContent`, `getScriptSections`. Enforce candidate-adopt + restore-as-new-version.
- FE: Script save + section editors → `POST /artifacts/:id/versions`; version-history restore; AI-suggestion adopt hook; Planning contract/thesis/evidence editing.
- **Deps:** G5, G6, G7. **Lights up:** Script (save/editors/version/AI-adopt), Planning (contract/thesis/evidence), Research evidence links.

### Wave 3

**G9 — Publishing vertical** (after Wave 2)
- Backend: Publishing (Phase 7) — create/revise/transition, `resolvePublication`, list (workspace + center). External fact-of-record model.
- FE: Workspace 确认发布 → `POST /publications/:id/transition`; title/desc/tags/cover → revisions; **wire the inert preview tabs**; Publishing Center batch publish/down/reschedule.
- **Deps:** G5, G7, G3, G4. **Lights up:** Publishing Workspace (确认发布 + revisions), Publishing Center (3 batch actions).

**G10 — Production vertical** (after Artifacts, parallel with Publishing)
- Backend: Production (Phase 6) — production/settings/segments, export request/complete/fail; `completeExport` fan-out to Assets + Projects + Search.
- FE: mode select + settings → `PUT /outputs/:id/production`; segments → `POST …/segments`; export → real `POST …/exports` + complete (ContentOutput active→ready); initial `GET /outputs/:id/production` load.
- **Deps:** G5, G8, G7, G3. **Lights up:** Production (export + modes + segments + settings).

**G11 — Analytics vertical** (after Publishing)
- Backend: Analytics (Phase 8) — append snapshot; publication/output/project/dashboard/comparison reads. Append-only + idempotency.
- FE: Review tabs → windowed `GET /analytics/projects/:id`; top-published/publication drill-down; Dashboard KPIs; Publishing-Center analytics rail; Publishing-Workspace metrics.
- **Deps:** G9. **Lights up:** Analytics Review, Dashboard metrics, publishing analytics widgets.

**G12 — Ingestion vertical** (after Analytics; no page)
- Backend: Ingestion (Phase 7) — sources, runs, `ingestMetrics`/`ingestKnowledge`/`ingestAsset`/`ingestArtifact`, idempotency, partial-success. External skill writes only.
- **Deps:** G9, G11, G6, G7, G8, G3. **Lights up:** real metrics flowing into Analytics; no direct UI.

**G13 — Reviews vertical** (after Analytics)
- Backend: Reviews (Phase 9) — create/addPublication/createInsight/completeReview; pull Analytics+Publishing; confirmed insight → Learnings bridge.
- FE: **build the greenfield review-authoring surface** (create review, add insight, complete) + review-history drill-down on the Review page.
- **Deps:** G5, G9, G11, G8. **Lights up:** Analytics Review authoring + history.

**G14 — Learnings vertical** (after Reviews, parallel with AI)
- Backend: Learnings (Phase 9) — create/`promoteReviewInsight`/list/apply/`evaluateApplication`/`updateValidationStatus`/`getSuggestions`. Hot = computed.
- FE: Experience quick-record → `POST /learnings`; **build apply + evaluate affordances**; Dashboard suggestion adopt; category tabs → real filter.
- **Deps:** G13, G5, G4. **Lights up:** Experience Center (quick-record + apply/evaluate), Dashboard suggestions.

**G15 — AI vertical** (after Reviews, parallel with Learnings)
- Backend: AI (Phase 10) — conversations/messages, tasks (request/start/candidate/confirm/fail/cancel), recent tasks. Candidate-adopt gate; never overwrites current version; reads model config from Settings.
- FE: Copilot prompt submit → `POST /ai/conversations/:id/messages`; recommended/smart chips → `POST /ai/tasks`; continuing-task confirm/cancel; history/view-all; **Script AI-suggestion adopt → confirm → version promotion** (joins G8).
- **Deps:** G13, G2, G5, G8, G6, G7, G3. **Lights up:** AI Copilot (submit + task spawn + confirm), Script AI adopt, Dashboard 创作建议.

### Wave 4 — Query services (after all module `index.ts` frozen; all 4 parallel)

**G16 — Page-composition query services** — Dashboard / ProjectOverview / PublishingCenter / GlobalSearch query services (Phase 11). Consume only public services. **Lights up:** final composed reads for Dashboard, Project Overview, Publishing Center, Search.

### Stage 17 — Integration & release (last)
**G17 — Integration & release** — cross-module workflow + E2E; swap `MockTransport→HttpTransport` at composition root; visual gate (stage 12) adjudicated; release. **Deps:** all above + the stage-12, 15b, 17 plans written.

---

## 8. Recommended next action

**Do this first: execute stage 15a (the service contract) as G0** — it is the only fully-planned, execution-ready workstream, and it is the seam that unblocks every parallel module vertical. Run it from its existing plan (`…/plans/2026-06-21-service-contract-15a.md`) with no further design needed.

**In immediate parallel, write the three missing plans** (none can be handed to a workflow until specced):
1. **15b spec/plan** — the FE mock-backend store + MockTransport + read-migration + mutation-wiring. *This is the critical unblock for every "lights up" claim in §7; brainstorm it the moment 15a is underway.*
2. **Stage-16 12 file-level sub-plans** — generate before any module coding (§20 mandate).
3. **Stage-12 visual adjudication plan** — short doc so the ~25 pixel deltas are decided, not blanket-rebaselined.

**Then launch Wave 1 verticals** `{G1 Identity, G3 Notifications, G4 Search/Taxonomy}` concurrently, with `{G2 Settings, G4 Taxonomy}` following Identity — then drive the critical path `G5 Projects → {G6 Knowledge, G7 Assets} → G8 Artifacts → G9 Publishing → G11 Analytics → G13 Reviews → {G14 Learnings, G15 AI}`.

**Decisions still needed from you (block specific goals, not the critical path):**
- **Spec gaps** to resolve before their buttons can be wired: **Share** (drop vs add), **search-history persistence**, **profile edit (`PATCH /me`)**, **account import/export/delete REST surface**, **bulk mark-all-read endpoint**. (Affect G4, G2, G3.)
- **Stage-12 re-baseline authority** — confirm who is the Controller adjudicating the ~25 expected pixel deltas (anti-laundering gate).
- **15b sequencing** — confirm you want mock-first now (MockTransport) with the HttpTransport swap deferred to G17, vs wiring real backends per-vertical as each stage-16 module goes green.

Relevant artifact paths (all absolute): `/Users/zyongzhu/Workbase/Thirdspace-creator/backend/SPEC.md`, `/Users/zyongzhu/Workbase/Thirdspace-creator/backend/MODULE-ARCHITECTURE.md`, `/Users/zyongzhu/Workbase/Thirdspace-creator/backend/TDD-PLAN.md`, and the 15a spec/plan under `/Users/zyongzhu/Workbase/Thirdspace-creator/.worktrees/frontend-implementation/docs/superpowers/{specs,plans}/2026-06-21-service-contract-*.md`.
