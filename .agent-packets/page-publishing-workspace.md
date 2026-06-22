# Task Packet: page-publishing-workspace

> Issued by Controller (session 2026-06-14). Status when issued: parent branch
> `feat/frontend-implementation` HEAD `dac42e0`. Implementation currently at
> **23.26% pixel diff** vs the reference image.
> Acceptance: bring the implementation to **≤ 0.5% pixel diff** and have the
> visual matrix pass for this route, without regressing other 16 routes.

## 1. Page information

| Field | Value |
|---|---|
| Page ID | `publishing-workspace` |
| Route | `/projects/ai-native-browser/publishing` |
| Reference image (absolute) | `/Users/zyongzhu/Workbase/Thirdspace-creator/ui/Publishing Workspace.png` |
| Reference image SHA-256 | `46385cfd85ac360d83ab0bcd799646f81eb633ffefca2a370dc5f8e5c2638e5f` |
| Container type | `WorkspacePage` |
| Header mode | `project-workspace` |
| Sidebar active | `projects` (with current project identity) |
| Canvas | 1536 × 1024 |
| Worktree | `/Users/zyongzhu/Workbase/Thirdspace-creator/.worktrees/frontend-implementation` |
| Branch | `feat/frontend-implementation` |
| Base SHA at issue | `dac42e0` (use current HEAD if ahead) |

## 2. Reference image observation

- Top: PublishingTabs (sub-mode tabs)
- Middle 3-column grid: BasicInformationForm / PlatformPublishingPanel / PreviewRail
- BasicInformationForm: TitleField, DescriptionField, CoverSelector, Tags, CategoryAndSeries, PublishingOptions
- PlatformPublishingPanel: vertical list of PlatformPublishCards, BatchTimeActions, ConfirmPublishButton, PrePublishCheck
- PreviewRail: PlatformPreview, PublishChecklist, PublishTips (right column)

## 3. Component tree (from `frontend/specs/page-specs.md` §9, approved)

```text
PublishingWorkspacePage
├── PublishingTabs
├── PublishingGrid
│   ├── BasicInformationForm
│   │   ├── TitleField
│   │   ├── DescriptionField
│   │   ├── CoverSelector
│   │   ├── Tags
│   │   ├── CategoryAndSeries
│   │   └── PublishingOptions
│   ├── PlatformPublishingPanel
│   │   ├── PlatformPublishCard[]
│   │   ├── BatchTimeActions
│   │   ├── ConfirmPublishButton
│   │   └── PrePublishCheck
│   └── PreviewRail
│       ├── PlatformPreview
│       ├── PublishChecklist
│       └── PublishTips
```

## 4. Restoration要点 (from page-specs.md)

- Three columns: basic info / platform publish / preview+check
- Platform publish cards stacked vertically
- Cover and tags in the same region as basic info
- Preview card simulates a platform post (do not redesign)
- Publish checklist and tips in the right rail below

## 5. 禁止改变 (DO NOT)

- Do not change to a publish wizard
- Do not add a platform connection flow page
- Do not merge platform settings with basic info
- Do not redesign the platform preview (it must mimic the platform's look)

## 6. Applicable decision-log entries

- D-001 Personal product: static placeholders
- D-005 Heading via TopHeader
- D-007 Empty/Loading/Error states
- D-009 Desktop-first 1536×1024, min 1280px
- D-010 Canonical time fixture

## 7. Immutable rules (must be followed verbatim)

Same as other packets — see new-project-overlay §7 for the full list. Critical:
- No new dependencies
- No shell / ui / lib / fixtures / shared changes
- No baseline updates
- Return `NEEDS_CONTEXT` if out of scope

## 8. Public APIs available

- `frontend/src/features/project-publishing/publishing-workspace-page.tsx` and `.test.tsx`
- Components: `PublishingTabs`, `BasicInformationForm`, `PlatformPublishingPanel`, `PlatformPublishCard`, `BatchTimeActions`, `PreviewRail`, `PlatformPreview`, `PublishChecklist`, `PublishTips`
- `components/ui/*`: Button, Input, Textarea, Select, Tabs, Card, Switch, Checkbox

## 9. File ownership (this task)

| Status | Path |
|---|---|
| **May write** | `frontend/src/features/project-publishing/**` |
| **May write** | `frontend/tests/visual/pages/publishing-workspace.spec.ts` |
| Read-only | shell, ui, lib, fixtures, shell-router, other pages |
| **Forbidden** | package.json, lockfile, tsconfig, playwright config, baselines, other pages' files |

## 10. Component reuse

- Reuse `ProjectStageStepper` (workspace header)
- Reuse `PlatformIcon` for platform cards
- Reuse `SectionCard` for the 3 main regions

## 11. Acceptance criteria

| Given | When | Then | Level |
|---|---|---|---|
| Visual matrix runs | Publishing route | `toHaveScreenshot()` for `publishing-workspace` passes (diff ≤ 0.5%) | Playwright |
| Other 16 routes | matrix runs | No regression | Playwright |
| `pnpm lint && pnpm typecheck && pnpm test && pnpm build` | run | All pass | tooling |
| `node scripts/visual/diff.mjs` | run | `publishing-workspace` reports `diffRatio ≤ 0.005` | Custom |

## 12. Visual route, fixture, state, comparison regions, masks

- Route: `/projects/ai-native-browser/publishing`
- Fixture: canonical publishing state
- State: default (one platform selected for preview)
- Comparison: full canvas 1536×1024
- No mask

## 13. Required verification commands

```bash
cd /Users/zyongzhu/Workbase/Thirdspace-creator/.worktrees/frontend-implementation/frontend
pnpm exec playwright test --project=visual -g "publishing-workspace"
pnpm exec playwright test --project=visual
pnpm visual:capture-current && pnpm visual:diff
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

Artifacts: `__artifacts__/current/publishing-workspace.png`, `__artifacts__/diff/publishing-workspace.png`, `__artifacts__/diff-report.json`.

## 14. Required report format

Per AGENT-PROTOCOL §7. Status one of DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED. Include Files changed, RED/GREEN/regression results, screenshot path, commit SHA, self-review, concerns.

## 15. First-step diagnostic

23.26% is large. Investigate:
1. Is the 3-column grid rendered? (basic info / platform / preview)
2. Is the right rail (preview / checklist / tips) below or beside the preview card?
3. Are the platform publish cards stacked vertically in the middle column?
4. Is the PublishChecklist in the right rail at the bottom?

## 16. Working in parent worktree, parallel with other agents

Per session decision. If you hit `fatal: Unable to create '.git/index.lock'`, wait 5 seconds and retry. Your owned files (`frontend/src/features/project-publishing/**`) do not overlap with any other concurrent subagent.
