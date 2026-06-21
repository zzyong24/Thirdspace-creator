# Handoff to code mode (Claude Code)

> Paste the prompt below into Claude Code to continue the spec-alignment remediation.
> Generated 2026-06-21. Source of truth = `orchestrator/ARTIFACT_MANIFEST.yaml`.

---

我在接手一个进行到一半的前端规格对齐(remediation)工作,请继续。

## 项目
CreatorOS,仓库 Thirdspace-creator,pnpm monorepo。前端代码在 worktree:
`.worktrees/frontend-implementation/`(分支 feat/frontend-implementation)。
⚠️ 目前所有 remediation 改动都【未提交】,请先 `git status` 查看,并考虑新建 remediation 分支再继续。

## 唯一事实源:orchestrator/ 控制工件(先全部读一遍)
- orchestrator/ARTIFACT_MANIFEST.yaml —— 工作流状态与增量进度(权威)
- orchestrator/CODE_RECONCILIATION.md —— 代码↔规格偏差审计(问题清单 + RISK-001..010)
- orchestrator/REMEDIATION_BACKLOG.md —— 按 P0/P1/P2 排序的修复清单(23 条)
- orchestrator/DECISION_LOG.md —— 关键决策,尤其 DEC-006
- orchestrator/ID_REGISTRY.md / TRACEABILITY_MATRIX.md —— 稳定 ID 与可追溯矩阵

## 核心决策(DEC-006)
全量对齐:【specs 为准,改代码去符合 specs】。三个决策点都按 spec 解:
UI 栈迁回 shadcn/Radix、补齐缺失实体、字段枚举对齐 spec。

## 已完成并验证(tsc/lint/各 suite 全绿,沙箱内)
- INC-1 数据层:补 13 个缺失实体到 types+fixtures、修数据完整性 bug(跨工件 currentVersionId、悬空 ingestionRunId、错指 coverAssetId)、Learning.confidenceScore 改整型、relationType 放宽 string。
- INC-2 选择器层:新建 14 个 build<Page>ViewModel,15 个页面改为消费 selector(消除 102 处直接 canonicalDataset.* 取数);新增通用场景机制 makePageScenarios/buildPageScenario(scenarios.ts)。
- INC-4 P1 功能:Production / Publishing Workspace / Knowledge / Publishing Center / Analytics 五页接通交互 + loading/error/empty 状态(新增 *-interactive-region.tsx 岛 + 共享 components/state/page-state.tsx);Copilot 变真组件;Script 编辑器可编辑 + 工具栏;NotificationPopover(基于 ui/popover);Dashboard/Analytics 指标改为由 fixtures 派生;补 SidebarAssistantCard。

## 待办
- INC-3(R0-1)UI 栈从 @base-ui/react 迁回 shadcn/ui on Radix(`components/ui/*` 20 个文件 + components.json)。需要装 Radix/shadcn 依赖并跑 build —— 这步之前在沙箱做不了,正是交给你 code 模式的主因。
- INC-5(P2)抽取约 32 个内联/缺失的共享组件(content/resources/analytics 三层)、去重 ProjectStageStepper(top-header 里有私有副本)、抽 SearchField/FilterBar、改名(PlatformIconView→PlatformIcon、AIAnalysisCard→InsightCard 等)、把 Pagination/ViewModeToggle/SortSelect 从 features/projects 移到 components/、补 public/fixtures/ 与 features/<page>/{components,tests} 目录、视觉重基线、复跑 stage-09 gate。
- 小尾巴:experience/copilot 的数据仍来自选择器内常量,未接关系型 canonical(为避免破坏视觉基线而保守延后),按需补。

## 约束(务必遵守)
- 确定性:render/fixtures/selectors 中禁止 Date.now / Math.random / fetch。
- 岛模式:server 外壳 + `*-interactive-region.tsx` 客户端岛;复用 src/components/ui/* 原语。
- 默认态 DOM 尽量保持等价,以免破坏现有 component 测试与 visual baseline;新行为加【新】测试,不要弱化既有断言(派生指标值变化时更新对应断言、不要删)。

## 验证
- 完整门禁:`cd frontend && pnpm verify`(= lint && typecheck && test && build)。
- 视觉:重基线后 `pnpm test:visual`。
- 【第一步请先跑 `pnpm verify` 确认 INC-1/2/4 在完整 build 下也绿】,再开始 INC-3/INC-5。

## 完成定义
INC-3/INC-5 做完后,重跑 stage-09 frontend-implementation gate(判据见 CODE_RECONCILIATION.md),
通过后再按 orchestrator 流程把相关阶段在 ARTIFACT_MANIFEST.yaml 提升为 passed。记得同步更新 manifest 与 DECISION_LOG。
