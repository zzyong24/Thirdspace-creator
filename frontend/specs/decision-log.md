# CreatorOS Frontend Decision Log

This file resolves known conflicts between product rules, screenshots and implementation mechanics. Agents may not reinterpret these decisions.

## D-001 Personal Product vs Collaboration Visuals

**Decision:** CreatorOS remains a personal product. Collaborator avatars, share controls and comment-like icons visible in screenshots are preserved as static visual elements or personal notes/exports. They do not create members, permissions, comments or team workflows.

## D-002 Knowledge Page Identity

**Decision:** `/knowledge` remains a global resource-center route. If the screenshot shows project identity or the Project Stage Stepper, render that region as a contextual project filter/preview within the shared Header configuration. Do not move Knowledge into `/projects/[projectId]` and do not create a second Header.

## D-003 Assets Sidebar Card

**Decision:** All pages use the same Sidebar structure. The lower contextual card may use an approved `assistant` or `storage` content variant, but its placement, dimensions and parent Sidebar component stay shared. Assets Center may select the storage variant shown in its reference.

## D-004 Dashboard Assistant Card

**Decision:** `SidebarAssistantCard` belongs to the shared Sidebar, even where a page component tree lists it under Dashboard. Dashboard must not render a duplicate.

## D-005 Page Heading vs TopHeader

**Decision:** A screenshot heading that occupies the global Header region is supplied through `TopHeader` slots. A page-local heading is used only when the screenshot clearly contains an additional heading inside the scrollable content. Projects and Global Search must not create duplicate Headers.

## D-006 Overlay Background Mismatch

**Decision:** New Project and AI Copilot reference images use background Dashboard states that differ from the canonical Dashboard. Visual review compares the dialog/panel, overlay treatment and immediate anchoring. The background is masked and does not define a second Dashboard implementation.

## D-007 Empty, Loading and Error States

**Decision:** These states are required for engineering completeness but are not new page designs. They use shared components and tokens. Page-specific empty/error artwork or layout is prohibited unless a future design reference approves it.

## D-008 Script Editor

**Decision:** The first visual implementation contains the visible editor shell, content and toolbar behavior required by the screenshot. No full rich-text editor framework is introduced until editing behavior has a separate approved SPEC.

## D-009 Responsive Scope

**Decision:** Acceptance is desktop-first at `1536 × 1024`, with a minimum width of `1280px`. No mobile navigation or responsive information-architecture redesign is part of this implementation.

## D-010 Canonical Demonstration Time

**Decision:** Fixtures use a fixed clock, locale `zh-CN` and timezone `Asia/Shanghai`. Relative dates are derived from the fixed clock, not the runtime date.

## D-011 Repository and Deployment Shape

**Decision:** One Git repository uses a root pnpm workspace with `frontend` and `backend` packages and one root lockfile. They are separate deployment units. The backend package remains one modular-monolith deployment; frontend code consumes approved HTTP contracts and never imports backend repository, service, database or infrastructure modules.
