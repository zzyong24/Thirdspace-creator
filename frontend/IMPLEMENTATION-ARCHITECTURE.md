# CreatorOS Frontend Implementation Architecture

## 1. Purpose

This document locks the frontend implementation boundaries before code is written. It does not change the product or the 17 approved page structures.

## 2. Runtime Baseline

| Area | Decision |
|---|---|
| Runtime | Node.js 24 LTS |
| Package manager | pnpm, version pinned in `packageManager` |
| Framework | Current stable Next.js App Router at Foundation time |
| Language | TypeScript with `strict: true` |
| Styling | Tailwind CSS and CSS variables |
| Components | shadcn/ui |
| Icons | Lucide React |
| Charts | shadcn/ui Chart built on Recharts |
| Unit/component tests | Vitest, React Testing Library, `user-event` |
| Browser/visual tests | Playwright Chromium |

The repository is a pnpm workspace with `frontend` and `backend` application packages and one root lockfile. The frontend and backend are separate deployment units; all backend business modules still run in the single backend modular monolith.

The Foundation Agent records exact installed versions in package manifests and the root lockfile. Later agents may not change them.

The existing `frontend/` directory contains specifications. Foundation must scaffold Next.js in a temporary directory and merge the generated application files into `frontend/` without deleting or replacing Markdown files.

Frontend code communicates with the backend through approved HTTP contracts. It may not import backend repositories, services, database schemas or infrastructure modules directly. Shared contract generation may be added later only through a separately approved task.

## 3. Target Directory Structure

```text
frontend/
├── src/
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── globals.css
│   │   └── (creator)/
│   │       ├── layout.tsx
│   │       ├── loading.tsx
│   │       ├── error.tsx
│   │       ├── not-found.tsx
│   │       ├── @modal/
│   │       │   ├── default.tsx
│   │       │   └── (.)projects/new/page.tsx
│   │       ├── page.tsx
│   │       ├── projects/
│   │       │   ├── page.tsx
│   │       │   ├── new/page.tsx
│   │       │   └── [projectId]/
│   │       │       ├── page.tsx
│   │       │       ├── research/page.tsx
│   │       │       ├── planning/page.tsx
│   │       │       ├── script/page.tsx
│   │       │       ├── production/page.tsx
│   │       │       ├── publishing/page.tsx
│   │       │       └── review/page.tsx
│   │       ├── knowledge/page.tsx
│   │       ├── assets/page.tsx
│   │       ├── publishing/page.tsx
│   │       ├── experience/page.tsx
│   │       ├── search/page.tsx
│   │       └── settings/page.tsx
│   ├── components/
│   │   ├── ui/
│   │   ├── shell/
│   │   ├── navigation/
│   │   ├── project/
│   │   ├── content/
│   │   ├── resources/
│   │   ├── publishing/
│   │   ├── analytics/
│   │   └── overlays/
│   ├── features/
│   │   └── <page-or-domain>/
│   │       ├── components/
│   │       └── tests/
│   ├── fixtures/
│   │   ├── canonical.ts
│   │   ├── scenarios.ts
│   │   └── selectors/
│   ├── types/
│   │   ├── domain.ts
│   │   └── view-models.ts
│   ├── lib/
│   └── styles/
│       └── tokens.css
├── tests/
│   ├── e2e/
│   ├── visual/
│   └── accessibility/
└── public/
    └── fixtures/
```

Route files compose feature components. They must not contain a second Sidebar, TopHeader, fixture copy, or page-specific design system.

## 4. App Router Boundaries

- `src/app/layout.tsx` owns document metadata, font loading and global CSS only.
- `src/app/(creator)/layout.tsx` owns the single `AppShell` and the `@modal` slot.
- Page and layout files are Server Components by default.
- Client Components are limited to interactive islands: dialogs, tabs, controlled filters, forms, editor controls, interactive charts and URL-state controllers.
- AppShell remains a Server Component unless a narrowly scoped child requires client behavior.
- Fixture selectors run on the server where possible and return typed page ViewModels.
- No frontend global state library is used in the first implementation phase.

State ownership:

| State | Owner |
|---|---|
| Navigable filters, tabs or search | URL search params |
| Dialog open state with route identity | App Router route or query state |
| Temporary input and selection | Local Client Component state |
| Cross-page canonical data | Typed fixture selectors |
| Server data later | Module API adapter, not page-local fetch logic |

## 5. Overlay Semantics

### New Project

- `/projects/new` has a full-page fallback for direct visits and refreshes.
- Navigation from inside CreatorOS uses an intercepting route rendered in `@modal`.
- Closing the modal uses browser history when a background route exists.
- The dialog must trap focus, close on the approved close controls and restore focus to the trigger.
- The overlay comparison masks the background because the reference image uses a different Dashboard state.

### AI Copilot

- `?copilot=open` is the canonical URL state.
- Opening preserves the current pathname and other approved search params.
- Closing removes only `copilot`.
- Browser Back closes the overlay before leaving the underlying page.
- One `OverlayController` reads the query; pages may only render triggers.
- Visual comparison targets the Copilot panel and overlay treatment, not the full background.

## 6. Data and Fixture Contract

`src/fixtures/canonical.ts` contains the only cross-page sample dataset. The canonical project is `AI Native Browser 深度解析`.

Required guarantees:

- Stable IDs and relationships.
- Fixed clock and `Asia/Shanghai` display timezone.
- Fixed locale, ordering, percentages and metric values.
- No randomness, network access or runtime current date.
- Page code consumes typed selectors, not raw fixture arrays.
- Selectors expose `default`, `empty`, `loading`, `error` and page-specific selected scenarios.
- The fixture shape follows the approved data model while page ViewModels contain only rendering needs.

Only the Data Contract Agent may change canonical fixtures. Page Agents request a selector change through the Controller.

## 7. Design System Decisions

- Tokens live in `src/styles/tokens.css` and are mapped into Tailwind.
- Tokens cover color, typography, Sidebar width, Header height, spacing, radius, shadow, z-index and chart palette.
- shadcn/ui is initialized once by Foundation.
- Shared UI installation is performed only by the Shared Components Agent.
- Page Agents may compose approved components but may not run the shadcn CLI.
- Platform logos use an approved local mapping. Agents may not fetch arbitrary remote brand assets.
- Images use local deterministic assets and `next/image` where appropriate.
- The first Script Workspace pass implements the visible editor shell and toolbar only. It does not introduce TipTap, Lexical or another editor framework.

## 8. Shared States and Accessibility

- Root segments provide shared `loading.tsx`, `error.tsx` and `not-found.tsx`.
- Loading, empty and error visuals are shared components; pages may not invent alternatives.
- All controls have accessible names.
- Dialogs trap focus and restore it on close.
- Keyboard navigation follows native/shadcn behavior.
- Charts expose a title, summary and textual metric alternative.
- Color is not the sole carrier of state.
- Reduced motion disables nonessential transitions in tests and for users who request it.

## 9. Responsive Boundary

The first implementation is desktop-first:

- Primary acceptance viewport: `1536 × 1024`.
- Minimum supported desktop width: `1280px`.
- Below `1280px`, preserve information order and allow controlled horizontal overflow where required.
- Do not redesign the Sidebar, collapse navigation or reorder workspace columns without a separate approved responsive SPEC.

## 10. Ownership

| Owner | Exclusive write scope |
|---|---|
| Foundation | frontend package/config, root workspace and lockfile, test runner setup |
| Design System | global CSS, tokens, font and icon mapping |
| Data Contract | `src/types/**`, `src/fixtures/**` |
| Shell | root layouts and `src/components/shell/**` |
| Shared Components | `src/components/ui/**` and approved shared business components |
| Page Agent | assigned route, assigned feature directory and its tests |
| Controller | dependency approval, baseline snapshots and cross-owner coordination |

No two implementation agents write concurrently. A cross-owner requirement becomes a separate prerequisite task.
