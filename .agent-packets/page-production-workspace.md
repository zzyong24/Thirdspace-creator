# Task Packet: page-production-workspace

> Issued by Controller (session 2026-06-14). Status when issued: parent branch
> `feat/frontend-implementation` HEAD `dac42e0`. Implementation currently at
> **27.41% pixel diff** vs the reference image.
> Acceptance: bring the implementation to **≤ 0.5% pixel diff** and have the
> visual matrix pass for this route, without regressing other 16 routes.

## 1. Page information

| Field | Value |
|---|---|
| Page ID | `production-workspace` |
| Route | `/projects/ai-native-browser/production` |
| Reference image (absolute) | `/Users/zyongzhu/Workbase/Thirdspace-creator/ui/Production Workspace.png` |
| Reference image SHA-256 | `f73dff930936ab4eba1024c3f9dea0a96f6336c7901e39858589255aae9edf21` |
| Container type | `WorkspacePage` |
| Header mode | `project-workspace` |
| Sidebar active | `projects` (with current project identity) |
| Canvas | 1536 × 1024 |
| Worktree | `/Users/zyongzhu/Workbase/Thirdspace-creator/.worktrees/frontend-implementation` |
| Branch | `feat/frontend-implementation` |
| Base SHA at issue | `dac42e0` (use current HEAD if ahead) |

## 2. Reference image observation

- Top: 3-card production mode selector (live / virtual / automated or similar)
- Center grid: 4 regions — RecordingScriptPanel, AssetLibraryPanel, PreviewPanel, SettingsRail
- AssetLibraryPanel: type tabs + 3-column thumbnail grid
- SettingsRail: narrow column grouped by Recording / Subtitle / Export
- Bottom: full-width TimelinePanel with TimelineSegmentCards

## 3. Component tree (from `frontend/specs/page-specs.md` §8, approved)

```text
ProductionWorkspacePage
├── ProductionModeSelector
├── ProductionGrid
│   ├── RecordingScriptPanel
│   ├── AssetLibraryPanel
│   ├── PreviewPanel
│   └── SettingsRail
│       ├── RecordingSettings
│       ├── SubtitleSettings
│       └── ExportSettings
└── TimelinePanel
    └── TimelineSegmentCard[]
```

## 4. Restoration要点 (from page-specs.md)

- Top production mode: 3 horizontal selector cards
- Middle: 4 visual regions (script / assets / preview / settings)
- Asset library: category tabs + 3-column thumbnails
- Settings: narrow column grouped by Recording / Subtitle / Export
- Timeline: bottom, horizontal, full-width

## 5. 禁止改变 (DO NOT)

- Do not rebuild as a professional NLE layout
- Do not add multi-track timeline
- Do not move the export button position
- Do not split the preview panel into a modal

## 6. Applicable decision-log entries

- D-001 Personal product: comment-like icons as static placeholders
- D-005 Page heading via TopHeader
- D-007 Empty/Loading/Error states
- D-009 Desktop-first 1536×1024, min 1280px
- D-010 Canonical time fixture (zh-CN / Asia/Shanghai)

## 7. Immutable rules (must be followed verbatim)

- Use the single shared AppShell, Sidebar and TopHeader
- Do not redesign, reorder, add or remove product structure
- Reuse approved `components/ui` and shared business components
- **Do not add dependencies**
- Do not import backend code into the frontend
- Do not modify files outside the owned scope (§9)
- Do not change canonical fixtures
- Do not use randomness, current time, remote data or unstable assets
- Keep Client Components as small interactive islands
- Follow strict RED-GREEN-REFACTOR
- **Do not update visual baselines**
- If the task conflicts with a SPEC, return `NEEDS_CONTEXT`; do not decide

## 8. Public APIs available

- AppShell, Sidebar, TopHeader (with `project-workspace` mode), ProjectStageStepper
- `frontend/src/features/production/production-workspace-page.tsx` and `.test.tsx`
- Components: `ProductionModeSelector`, `RecordingScriptPanel`, `AssetLibraryPanel`, `PreviewPanel`, `SettingsRail`, `TimelinePanel`, `TimelineSegmentCard`
- `components/ui/*`: Button, Tabs, Card, ScrollArea, Slider, Select, etc.

## 9. File ownership (this task)

| Status | Path |
|---|---|
| **May write** | `frontend/src/features/production/**` |
| **May write** | `frontend/tests/visual/pages/production.spec.ts` |
| Read-only | shared shell, ui, lib, fixtures, shell-router, other pages |
| **Forbidden** | package.json, lockfile, tsconfig, playwright config, baselines, other pages' files |

## 10. Component reuse

- Reuse `ProjectStageStepper` for the workspace header
- Reuse `AssetCard` from `components/assets/` for the asset library
- Reuse `SectionCard` for the 4 center regions

Do **not** promote a single-page-only component to shared.

## 11. Acceptance criteria

| Given | When | Then | Level |
|---|---|---|---|
| Visual matrix runs | Production route | `toHaveScreenshot()` for `production-workspace` passes (diff ≤ 0.5%) | Playwright |
| Other 16 routes | matrix runs | No regression | Playwright |
| `pnpm lint && pnpm typecheck && pnpm test && pnpm build` | run | All pass | tooling |
| `node scripts/visual/diff.mjs` | run | `production-workspace` reports `diffRatio ≤ 0.005` | Custom |

## 12. Visual route, fixture, state, comparison regions, masks

- Route: `/projects/ai-native-browser/production`
- Fixture: canonical project + production state
- State: default mode, no segment selected
- Comparison: full canvas 1536×1024
- No mask

## 13. Required verification commands

```bash
cd /Users/zyongzhu/Workbase/Thirdspace-creator/.worktrees/frontend-implementation/frontend
pnpm exec playwright test --project=visual -g "production-workspace"
pnpm exec playwright test --project=visual
pnpm visual:capture-current && pnpm visual:diff
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

Artifacts: `__artifacts__/current/production-workspace.png`, `__artifacts__/diff/production-workspace.png`, `__artifacts__/diff-report.json`.

## 14. Required report format

Per AGENT-PROTOCOL §7, status one of: DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED. Include:
- Files changed
- RED / GREEN / regression commands + results
- Screenshot path
- Commit SHA
- Self-review findings
- Concerns / blockers

## 15. First-step diagnostic

27.41% is large. Investigate:
1. Is the 3-card mode selector visible at top?
2. Is the 4-region middle grid present? (script / assets / preview / settings)
3. Is the timeline panel at the bottom horizontal and full-width?
4. Are settings subgroups (Recording / Subtitle / Export) showing the right structure?

If the timeline is missing or vertical, fix the layout first. The 4-region grid is the biggest visual feature; getting it right gets you most of the way to 0.5%.

## 16. Working in parent worktree, parallel with other agents

Per session decision. If you hit `fatal: Unable to create '.git/index.lock'`, wait 5 seconds and retry — another subagent is committing. Your owned files (`frontend/src/features/production/**`) do not overlap with any other concurrent subagent.
