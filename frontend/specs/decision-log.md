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

## D-012 视频制作工作台与编导同一工程（2026-10-01）

**依据：** 用户本轮明确要求“制作那里也要有一个工作台，而不是现在的完全黑盒式的自动化剪辑”，随后追加参考 ChatCut、“通过这个编导助手就能够操控剪辑”。这是已授权产品方向；具体可逆布局由当前方案明确，新增存储/API 仍需 CONTRACT 与独立评审，不将方向授权扩展为发布授权。

**裁决：** `docs/features/t1035-video-production-workbench.md` 成为制作工作区内部的当前功能与关系权威，替代旧 `ui/Production Workspace.png` 中录制脚本、素材网格、预览和示意章节条的固定内部排列。新关系为编导/素材入口、合成预览、选中项参数与同步时间轴。保留 AppShell、Sidebar、TopHeader、WorkspacePage 容器、既有紫色品牌和通用组件；不另建全局导航或第二个编导执行器。旧图继续作为备料、成品、字幕和导出功能的保留参考，不要求用假按钮或假数据还原旧示意功能。

**验收范围：** 制作内容区正常 1440×900、最低 900×600，全局壳沿其已有约束；其他页面的视觉规则和 D-009 不被本条改写。探索稿只是可审阅示例，不能作为正式参考绑定或真实制作验收。正式实现前必须通过本任务合同与页面规范复核；正式数据来自账号归属已校验的服务，而非设计 fixture。

**编导快照：** 用户已经手工修改但未保存时，明确显示“保存并交给编导”，点击先 CAS 保存并回读，再给模型读取该版；失败保留指令/草稿且不提交模型，未应用 AI 候选不自动采纳。界面和编导最终应用使用同一个制作版本服务。
