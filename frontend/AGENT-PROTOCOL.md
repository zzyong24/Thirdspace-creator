# CreatorOS Multi-Agent Development Protocol

## 1. Execution Model

CreatorOS frontend implementation uses sequential Subagent-Driven Development:

1. Fresh implementer for one task.
2. Spec compliance review.
3. Implementer fixes all spec findings.
4. Re-review until approved.
5. Code-quality review.
6. Implementer fixes all quality findings.
7. Re-review until approved.
8. Controller marks the task complete and starts the next task.

Implementation agents must not run in parallel. Review agents may inspect only after the task commit exists.

## 2. Preflight Gate

Do not dispatch an implementer until all are true:

- Repository has an initial baseline commit containing specs and `ui/*.png`.
- Work occurs in a dedicated worktree and non-`main`/`master` branch.
- Worktree is clean before the task.
- Node.js 24 LTS and the pinned pnpm version are active.
- Root pnpm workspace and lockfile exist.
- Task dependencies and the previous two reviews are complete.
- The page SPEC and any conflict decisions are approved.

Current repository status on 2026-06-13: `NO-GO`, because the workspace is not yet a Git repository and the active Node version is `v25.9.0`.

## 3. Context Injection Rule

The Controller gives every Agent a curated Task Packet. Never tell an Agent to “read the plan and implement Task N.” Fresh agents do not inherit conversation context and must not infer missing rules.

Do not inject every project document. Over-injection hides relevant constraints and increases accidental reinterpretation. Include only the immutable global rules, exact task, relevant page section, public APIs and decisions needed for that task.

## 4. Required Task Packet

Each packet contains:

1. Task ID, goal, dependencies and exact completion definition.
2. Worktree path, branch, base SHA and expected commit boundary.
3. Full task steps, including RED/GREEN commands and expected result.
4. The mandatory global constraints copied verbatim.
5. Approved page component tree and restoration plan.
6. Reference image absolute path, SHA-256 and `1536 × 1024` canvas.
7. Applicable entries from `specs/decision-log.md`.
8. Public APIs for Shell, shared components, tokens and fixture selectors.
9. Owned files, read-only files and forbidden files.
10. Required component reuse and explicit dependency prohibition.
11. Given/When/Then acceptance criteria.
12. Visual route, fixture, state, comparison regions and masks.
13. Required verification commands and artifact paths.
14. Required report format.

## 5. Immutable Rules Injected in Every Packet

- Use the single shared AppShell, Sidebar and TopHeader.
- Do not redesign, reorder, add or remove product structure.
- Reuse approved `components/ui` and shared business components.
- Do not add dependencies.
- Do not import backend repository, service, database or infrastructure code into the frontend.
- Do not modify files outside the owned scope.
- Do not change canonical fixtures from a page task.
- Do not use randomness, current time, remote data or unstable assets.
- Keep Client Components as small interactive islands.
- Follow strict RED-GREEN-REFACTOR.
- Do not update visual baselines.
- If the task conflicts with a SPEC, return `NEEDS_CONTEXT`; do not decide.

## 6. File Ownership

| Role | May write | May not write |
|---|---|---|
| Foundation | frontend package/config, root workspace/lockfile, runner setup | page implementation |
| Design System | tokens, globals, font, icon mapping | page routes, fixtures |
| Data Contract | types, canonical fixture, selectors | Shell, page layout |
| Shell | root layout, AppShell, Sidebar, TopHeader | canonical fixture, page internals |
| Shared Components | approved shared components | page routes, canonical fixture |
| Page | assigned route, feature components, focused tests | package/config, Shell, tokens, fixture core, other pages, baselines |
| Controller | approved coordination edits and baselines | unreviewed product changes |

When a Page Agent needs a shared change, it returns `NEEDS_CONTEXT`. The Controller inserts a prerequisite owner task, reviews it, then re-dispatches the page task.

## 7. Agent Report Format

Status must be one of:

- `DONE`
- `DONE_WITH_CONCERNS`
- `NEEDS_CONTEXT`
- `BLOCKED`

The report includes:

- Files changed.
- RED command and expected failure observed.
- GREEN and regression commands with results.
- Screenshot path.
- Commit SHA.
- Self-review findings.
- Concerns, requested context or blockers.

## 8. Spec Reviewer Checklist

- Diff changes only authorized files.
- The single AppShell, Sidebar and TopHeader are reused.
- Route, container, section order, counts and selected state match the approved packet.
- No visible section was removed and no product feature was added.
- Approved fixture values and text are used.
- Design conflict decisions were followed.
- `1536 × 1024` screenshot was compared by approved regions.
- No dependency, shared abstraction or information architecture change was introduced.

The Spec Reviewer checks the packet and design reference, not the implementer's explanation.

## 9. Code-Quality Reviewer Checklist

- TypeScript strict; no unjustified `any` or assertions.
- Client boundary is minimal.
- Component responsibilities are focused.
- shadcn behavior, labels, keyboard and focus are correct.
- Fixtures are deterministic.
- Tests assert behavior rather than implementation classes.
- No duplicated Shell or copied cross-page data.
- Focused tests, full unit suite, typecheck, lint and build pass.
- Playwright, accessibility and visual checks required by the task pass.

Code-quality review starts only after spec compliance is approved.

## 10. Main Injection Risks and Controls

| Risk | Control |
|---|---|
| Missing global constraints | Immutable rules in every packet |
| SPEC version drift | Record base SHA and reference-image hash |
| Context overload | Curated excerpts, not whole-document dumping |
| Shared-file collision | Exclusive ownership and sequential implementers |
| Agent self-design | Decision log and `NEEDS_CONTEXT` escalation |
| Test standard invented per page | Shared test contract and exact commands |
| Snapshot laundering | Controller-only baseline updates |
| Dependency drift | Foundation-owned package and lockfile |
| Reviewer anchoring | Fresh reviewer receives packet, diff and image, not implementation narrative |

## 11. Stop Conditions

Stop the sequence and return to the Controller when:

- A reference image conflicts with an approved product rule and no decision exists.
- A required change is outside file ownership.
- The RED test cannot fail for the expected reason.
- Shared public APIs do not support the approved page.
- Visual comparison is impossible because assets, fonts or fixture state are missing.
- Git, worktree, runtime or lockfile preflight is not satisfied.
