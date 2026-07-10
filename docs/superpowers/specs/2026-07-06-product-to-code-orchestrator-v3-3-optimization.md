# product-to-code-orchestrator v3.3 优化设计

> Status: draft · 未过 gate · 不改 Skill 本体  
> Source: 2026-07-06 对 `product-to-code-orchestrator` 的使用复盘、CreatorOS 项目踩坑、hook 现状检查  
> Scope: 优化 Skill 的流程、模板、hook、reconcile 门卫与 Stitch/UI 图到前后端交付链路  
> Non-goal: 本文不直接修改 `/Users/zyongzhu/.skills-manager/skills/product-to-code-orchestrator/SKILL.md`

## 1. 背景

CreatorOS 基本全程使用 `product-to-code-orchestrator` 推进。现有 Skill 已经有效解决了几类早期问题:

- 需求不落账: `BACKLOG.md` 作为单一执行真相。
- UI 空头支票: `No API, no UI`。
- mock-first 后遗症: mock retirement ledger + 真实数据验收。
- 切片都绿但产品怪: `product-audit` 节拍。
- 重复造轮子: `现成方案 / OSS 调研` + CodeGraph 优先。

但 CreatorOS 后续仍暴露出三类更深的问题:

1. **视觉稿/ Stitch 很漂亮,但工程落地性未被前置核对。**  
   UI 图会自然生成 tab、筛选、排序、图表、指标、按钮,但这些控件背后的数据源/API/写读回显路径未必存在。

2. **逻辑架构有了,物理架构没人管。**  
   曾出现 backend 业务模块住进 frontend、AI SDK 泄漏到前端、worker 孤儿、跨模块 repository import。后来项目用 `SYSTEM_ARCHITECTURE.md + boundary-scan.mjs` 才把问题收口。

3. **文档和台账会膨胀/漂移。**  
   `BACKLOG.md` 容易变成会话实录,README 过期,`docs/` 中 current / historical / evidence 混在一起,索引与真实文件数漂移。

v3.3 的目标不是增加更多阶段,而是给现有 v3 增加可执行的牙齿。

## 2. 目标

v3.3 目标:

- 把 Stitch/UI 图纳入流程,但明确降级为 **视觉探索输入**,不是产品真相源。
- 强制每个 UI 控件通过 **接线表** 回查数据链路/API/状态。
- 把物理架构边界做成初始化产物和 reconcile 门卫。
- 把 hook 从“提醒为主”升级为“提醒 + 阻断 + 收尾巡检”,并避免 Claude/Codex 两套漂移。
- 把文档健康和 BACKLOG 健康纳入可执行检查。
- 强化 spec 的“现网事实”证据要求,避免成熟项目里重复造轮子或高估缺口。

### 2.1 业界实现调研结论

调研时间: 2026-07-06。调研对象优先取官方文档/一手资料。整体结论是:业界没有一个工具完整解决“产品意图 → UI 图/Stitch → 前端 → 后端 → 长期架构健康”这条链。成熟做法更像拼装:

```text
AI/设计稿生成负责加速表达
组件映射/设计系统负责减少重造
契约/边界/测试/文档门卫负责保证交付
```

| 方向 | 代表实现 | 可借鉴点 | 对 v3.3 的影响 |
|---|---|---|---|
| AI UI / design-to-code | Google Stitch: prompt/image → UI + frontend code; Builder Visual Copilot; Locofy; Anima | 适合快速探索视觉、布局、变体和基础前端代码,但不能证明数据/API/权限/状态存在 | Stitch 只作为 `exploratory` 输入;进入 BUILD 前必须过 `PAGE_BINDING_MATRIX` |
| 设计组件 ↔ 代码组件 | Figma Code Connect; Builder component mapping; Anima/Locofy UI library output | 设计稿应映射到仓库真实组件,而不是每次生成新组件 | 新增 `COMPONENT_MAPPING_REGISTRY_TEMPLATE.md`;接线表需要引用真实组件 |
| Design Tokens | W3C Design Tokens Community Group; Builder tokens | 色彩、间距、字体等视觉语言要可交换、可追踪、可复用 | 新增 `DESIGN_TOKEN_POLICY_TEMPLATE.md`;Stitch 不得引入第二套视觉语言 |
| UI 状态验收 | Storybook / Chromatic | 组件和页面应在 isolation 中覆盖 loading/empty/error/real-data/permission 等状态 | 新增 `UI_STORY_ACCEPTANCE_TEMPLATE.md`;视觉稿落地后要验状态集合,不只验 happy path |
| Agent 交付方式 | GitHub Copilot cloud agent; Devin; Replit Plan mode | Agent 从明确 ticket/plan/完成标准开始,在分支/PR/测试里交付 | 新增 `AGENT_TASK_SPEC_TEMPLATE.md`;BUILD 任务必须有验收命令和可见行为 |
| 架构边界 | Nx module boundaries; dependency-cruiser; ArchUnit | 依赖边界应声明式配置并自动检查,支持 forbidden/allowed/required | `boundary-scan.mjs` 规则模型参考 forbidden/allowed/required + baseline ratchet |
| Hook/本地门卫 | Claude Code hooks; pre-commit; lefthook; husky | hook 适合即时阻断和提醒,但不能成为唯一真相 | hook 只做即时反馈;最终裁决沉到 `reconcile.mjs`/CI |
| 文档体系 | Diataxis; ADR; C4 Model | 文档要分类型、标状态;架构决策要有记录;架构图要分层表达 | 新增 `ADR_TEMPLATE.md`;`SYSTEM_ARCHITECTURE_TEMPLATE.md` 采用 C4 的 context/container/component 思路 |
| 契约测试 | Pact consumer-driven contract | 前端实际消费的请求/响应可以生成契约测试,减少“API 看似有、接不上”的问题 | `PAGE_BINDING_MATRIX` 可派生 contract checklist/fixture |

不建议照搬:

- 不照搬“一键 Figma/Stitch 到生产代码”的叙事。它能省 layout 时间,但解决不了数据归属、API、权限、错误态、写读回显。
- 不把 hook 当最终门卫。hook 可能因平台、配置、绕路命令失效,关键检查必须能在 `reconcile`/CI 重跑。
- 不引入过重产品仪式。Shape Up / PRFAQ / DACI 有参考价值,但本 Skill 只吸收“先定义用户结果、边界和完成标准”。

## 3. 核心链路

当前高风险链路:

```text
UI 图 / Stitch → 前端照抄 → 后端补洞
```

v3.3 推荐链路:

```text
产品定位 / 用户任务
  → 数据链路可行性
  → Stitch / UI 图视觉探索
  → 组件映射 / Design Tokens 对齐
  → PAGE_BINDING_MATRIX 接线表
  → UI_STORY_ACCEPTANCE 状态验收
  → 垂直切片: contract → backend TDD → frontend 接真 → 写读回显
  → 真数据主线验收
```

Stitch 输出必须盖章:

```text
探索稿 · 未经数据可行性核对 · 不得直接进入 BUILD
```

## 4. 新增/调整的 Skill 资产

| 类型 | 文件 | 作用 |
|---|---|---|
| prompt | `prompts/design-artifact-intake.md` | 接收 UI 图/Stitch/截图,先拆控件与用户承诺,不直接写代码 |
| prompt | `prompts/stitch-decomposition.md` | 把 Stitch 页面拆成区域、控件、状态、数据块、交互承诺 |
| template | `templates/DESIGN_INTAKE_TEMPLATE.md` | 记录设计稿来源、状态、不可直接实现声明 |
| template | `templates/PAGE_BINDING_MATRIX_TEMPLATE.md` | 控件级接线表: UI 元素 → FR → 数据源 → API → 状态 |
| template | `templates/COMPONENT_MAPPING_REGISTRY_TEMPLATE.md` | 设计组件 ↔ 代码组件 ↔ props ↔ 状态 ↔ Storybook 示例 |
| template | `templates/DESIGN_TOKEN_POLICY_TEMPLATE.md` | 记录允许的 token 来源、命名、同步方式,防止 Stitch 生成第二套视觉语言 |
| template | `templates/UI_STORY_ACCEPTANCE_TEMPLATE.md` | 页面/组件状态验收: loading、empty、error、real-data、permission、responsive |
| template | `templates/AGENT_TASK_SPEC_TEMPLATE.md` | 每个 BUILD 任务的完成标准、验证命令、可见行为、真实数据路径 |
| template | `templates/SYSTEM_ARCHITECTURE_TEMPLATE.md` | 三房间/多房间图纸: 谁住哪、谁 import 谁、谁写库 |
| template | `templates/ADR_TEMPLATE.md` | 记录架构决策、上下文、取舍和后果,从大 spec 中沉淀长期决策 |
| rule | `rules/physical-architecture-rules.md` | 物理边界规则: frontend/backend/worker/contract/DB/AI 写入边界 |
| process | `process/boundary-scan.mjs` | 可配置边界扫描,ratchet 模式,新违规 fail |
| process | `process/docs-health.mjs` | 文档索引、状态、坏链、过期 README、evidence 目录检查 |
| process | `process/backlog-health.mjs` | BACKLOG 文件体积、单行长度、已完成行膨胀检查 |
| process | `process/hook-health.mjs` | 检查 `.claude` / `.codex` hook 注册、版本/hash、一致性 |
| gate | `gates/02-architecture-boundary-gate.md` | 离开 CONTRACT / 进入 BUILD 前必须过物理边界门 |
| gate | `gates/07-design-bindability-gate.md` | Stitch/UI 图进入 DESIGN/BUILD 前必须完成接线表 |
| template | `templates/DOCS_INDEX_TEMPLATE.md` | `docs/INDEX.md` 导航索引模板 |
| template | `templates/TASK_DETAIL_TEMPLATE.md` | 长任务详情外置模板,防 BACKLOG 变日志 |

## 5. Stitch / UI 图落地规则

### 5.1 设计稿状态

每个外部设计稿或 Stitch 输出必须标状态:

| 状态 | 含义 | 是否可进入 BUILD |
|---|---|---|
| `exploratory` | 视觉探索,未核对数据链路 | 否 |
| `bindable` | 已完成控件接线表,无悬空交互 | 可进入垂直切片 |
| `partially-bindable` | 部分控件可实现,部分需删除/规划中 | 仅可实现已绑定部分 |
| `rejected` | 与产品定位或数据现实冲突 | 否 |

### 5.2 PAGE_BINDING_MATRIX

每个页面必须维护控件级表:

| UI 元素 | 用户可见承诺 | FR/FLOW | 数据源 | API/操作 | 写读回显 | 判定 | 处置 |
|---|---|---|---|---|---|---|---|
| 播放量排序 | 按真实播放排序 | `FR-xxx` | metric snapshots | `projects.list(sort=views)` | 读 | `bindable` | 实现 |
| 导出成片 | 生成视频文件 | 无 | 无 | 无 | 无 | `unbound` | 删除或规划中 |
| 七日趋势图 | 展示近 7 天真实变化 | `FR-yyy` | analytics | `analytics.list` | 读 | `bindable` | 实现 |

判定枚举:

- `bindable`: 有数据源 + 有 API/操作 + 状态/错误路径清楚。
- `planned`: 暂不实现,但有 BACKLOG/HARD ID 且 UI 显示「规划中」。
- `static`: 纯说明/装饰,无交互承诺。
- `unbound`: 无数据源或无 API,不得进入 BUILD。
- `reject`: 违背产品定位或范围。

### 5.3 Gate 规则

`gates/07-design-bindability-gate.md` 检查:

- 每个按钮/tab/filter/sort/chart/card metric 都有接线行。
- `unbound` 行数必须为 0。
- `planned` 行必须有 BACKLOG/HARD ID 和用户可见「规划中」标记。
- 核心路径主交互不能是 `planned`。
- Stitch 原稿不得覆盖产品定位、数据链路、物理架构边界。

### 5.4 组件映射规则

借鉴 Figma Code Connect / Builder / Anima / Locofy 的共同方向:设计稿进入工程前,必须尽量映射到仓库已有组件,而不是让 AI 每次生成一套新 UI。

`COMPONENT_MAPPING_REGISTRY` 至少记录:

| 设计元素 | 代码组件 | props/variant | 状态 | Storybook/示例 | 判定 |
|---|---|---|---|---|---|
| Primary button | `Button` | `variant="primary"` | default/disabled/loading | `Button.stories.tsx` | reuse |
| Metric card | `MetricCard` | `value,label,trend` | empty/real/loading | `MetricCard.stories.tsx` | reuse |
| AI chat input | 无 | 无 | 无 | 无 | create-needed |

判定规则:

- `reuse`: 使用现有组件。
- `extend`: 扩展现有组件,必须说明新增 prop/variant。
- `create-needed`: 允许新增组件,但必须有设计理由和 Storybook 状态。
- `reject`: 设计元素不应实现,通常是悬空承诺或违反产品定位。

### 5.5 UI 状态验收

借鉴 Storybook / Chromatic 的思路,视觉验收不只看一张 happy path 截图。每个进入 BUILD 的页面至少要声明:

- `loading`: 数据加载中。
- `empty`: 真实数据为空,诚实显示 0/空。
- `error`: API/权限/网络失败。
- `real-data`: 真实数据主路径。
- `permission`: 没有权限或能力未配置。
- `responsive`: mobile / desktop 关键断点。

`UI_STORY_ACCEPTANCE` 不强制所有项目安装 Storybook;但模板必须能表达这些状态。已有 Storybook 时优先落成 stories,没有时落成 Playwright route fixture 或验收截图清单。

## 6. 物理架构门卫

### 6.1 SYSTEM_ARCHITECTURE.md 必备章节

初始化时生成 `SYSTEM_ARCHITECTURE.md`,借鉴 C4 Model 的分层表达,至少包含:

1. **Context**: 产品与外部系统边界。
2. **Container/房间图**: frontend / backend / worker / contract / storage / external services。
3. **Component/模块图**: 每个 container 内的模块归属和允许依赖方向。
4. **允许 import 方向**: 谁能依赖谁,谁不能依赖谁。
5. **数据库写入属主**: 哪个房间拥有 schema/migration,worker 是否能直连 DB。
6. **AI/Agent 边界**: AI 是否能直接写领域实体;候选/确认门在哪里。
7. **禁止依赖清单**: 例如 AI SDK 不准进 frontend 页面层。
8. **边界规则配置**: 对应 `boundaries.config.json`。

### 6.2 boundary-scan

新增通用 `process/boundary-scan.mjs`:

- 读 `orchestrator/process/boundaries.config.json`。
- 规则模型借鉴 dependency-cruiser / Nx:
  - `forbidden`: 明确禁止的路径、import、跨层依赖。
  - `allowed`: 某些目录只能依赖指定 tag/scope。
  - `required`: 某类模块必须依赖或暴露指定 contract。
  - `tags`: 给 package/path/module 标注 `scope:*`、`type:*`、`runtime:*`。
- 支持 baseline ratchet: 已知债可存在,新增违规 fail,债减少后更新 baseline。
- 接入 `reconcile.mjs` 和 CI。

CreatorOS 的规则可抽象成默认例子:

| 规则 | 描述 |
|---|---|
| `R1-no-backend-in-frontend` | 后端业务模块不准放在 frontend |
| `R2-no-ai-sdk-in-frontend-pages` | AI SDK / Agent SDK 只准在 worker/ai-runtime |
| `R3-no-cross-module-repository-import` | 模块之间不准直接 import 对方 repository |

## 7. Hook 体系优化

### 7.1 当前欠缺

现状 hook 主要是:

- `SessionStart`: 注入 BACKLOG。
- `PostToolUse(Write)`: 写 SPEC 后提醒拆任务。

问题:

- 提醒多,硬拦少。
- `backlog-guard` 可能没有实际注册。
- 拦 BACKLOG 状态,但拦不住不改 BACKLOG 直接写代码。
- `.claude` 与 `.codex` 两套脚本容易漂移。
- 无交互式 Stop/收尾巡检。
- hook 结果没有纳入 `reconcile` 最终门卫。

### 7.2 新 hook 分层

| 层 | 职责 | 示例 |
|---|---|---|
| 即时提醒 | 写 spec 后提醒拆任务 | `spec-decompose-gate` |
| 即时阻断 | 未过审开工、无 active task 改代码 | `pre-edit-guard` |
| 收尾巡检 | 本轮有代码/文档变化时提示或跑检查 | `stop-reconcile-guard` |
| 最终门卫 | agent/hook 不可靠时仍可手动/CI 复跑 | `reconcile.mjs` |

### 7.3 统一 hook 源

脚本只保留一份:

```text
orchestrator/hooks/session-start.sh
orchestrator/hooks/spec-decompose-gate.sh
orchestrator/hooks/pre-edit-guard.sh
orchestrator/hooks/stop-reconcile-guard.sh
```

`.claude/hooks/*` 和 `.codex/hooks/*` 只做薄 wrapper 或配置指向,避免重复维护。

### 7.4 hook-health

`process/hook-health.mjs` 检查:

- `.claude/settings.json` 与 `.codex/hooks.json` 是否存在。
- 必需 hook 是否注册。
- hook 指向是否为 `orchestrator/hooks/*`。
- hook 文件 hash/version 是否一致。
- `backlog-guard` 缺失时 warning/fail。

## 8. 文档与台账健康

### 8.1 docs-health

`process/docs-health.mjs` 检查:

- `docs/INDEX.md` 存在。
- `docs/superpowers/specs/INDEX.md` 登记数量与真实 spec 数一致。
- `REVIEW_LEDGER.md` 有新 spec 的登记行。
- Markdown 本地链接无坏链。
- 文档类型按 Diataxis 思路归类: `tutorial | how-to | reference | explanation | adr | evidence | generated`。
- 重大架构选择必须能在 `docs/adr/` 或等价目录找到 ADR。
- 顶层 README 不含明显过期句式,如“当前只包含规格,无代码”但目录已有代码。
- 顶层文档必须带状态: `current | historical | superseded | evidence | generated`。
- `frontend/docs/t*-verify` 这类验收截图被标为 evidence,不得被当作长期 spec。

### 8.2 backlog-health

`process/backlog-health.mjs` 检查:

- `BACKLOG.md` 超 15KB warning,超 30KB fail。
- 单行超过 300 字 warning,超过 600 字 fail。
- 已完成行只能保留一句话 + commit/证据链接。
- 长过程必须迁到 `docs/tasks/T-xxx.md` 或 commit message。

## 9. CodeGraph 与现网事实

### 9.1 项目自定义刷新命令

`rules/code-retrieval-rules.md` 不应写死 `codegraph index --force`。改为:

1. 优先读项目配置:

```json
{
  "codegraph": {
    "refresh": "node orchestrator/process/pmem.mjs sync",
    "verify": "sqlite3 .codegraph/codegraph.db 'select count(*) from nodes'"
  }
}
```

2. 没有配置时 fallback 到通用 `codegraph index --force`。
3. 刷新后必须用本次新增/修改符号验证索引真的更新。

### 9.2 SPEC 现网事实证据

`PRODUCT_SPEC_TEMPLATE.md` / `SERVICE_CONTRACT_TEMPLATE.md` 增强:

- “现网事实 / 仓内已有实现”每条必须有 `file:line` 或 CodeGraph 证据。
- “无现成实现”也要给出搜索证据,例如 `rg` / CodeGraph 查询结果。
- spec-reviewer 必须检查这些证据,否则判 finding。

## 10. init-project 调整

`tools/init-project.sh` 新增初始化产物:

- `PROJECT_CONTEXT.md`
- `SYSTEM_ARCHITECTURE.md`
- `docs/INDEX.md`
- `docs/adr/0001-record-architecture-decisions.md`
- `orchestrator/process/boundaries.config.json`
- `orchestrator/process/boundary-baseline.json`
- `orchestrator/hooks/*`
- `orchestrator/process/docs-health.mjs`
- `orchestrator/process/backlog-health.mjs`
- `orchestrator/process/hook-health.mjs`
- `templates/COMPONENT_MAPPING_REGISTRY_TEMPLATE.md`
- `templates/DESIGN_TOKEN_POLICY_TEMPLATE.md`
- `templates/UI_STORY_ACCEPTANCE_TEMPLATE.md`
- `templates/AGENT_TASK_SPEC_TEMPLATE.md`
- `templates/ADR_TEMPLATE.md`

同时 `reconcile.config.json` 默认接入:

```json
{
  "checks": [
    "node orchestrator/process/hook-health.mjs",
    "node orchestrator/process/backlog-health.mjs",
    "node orchestrator/process/docs-health.mjs",
    "node orchestrator/process/boundary-scan.mjs --quiet"
  ]
}
```

## 11. 迁移策略

### 11.1 新项目

新项目默认走 v3.3:

1. init 生成控制面 + 图纸 + docs index。
2. Stitch/UI 图先进入 design intake,不直接 BUILD。
3. CONTRACT 前完成数据链路可行性。
4. DESIGN 前完成接线表。
5. BUILD 逐切片真实数据写读回显。

### 11.2 既有项目

既有项目渐进接入:

1. 先跑 `hook-health`,只 warning 不 fail。
2. 生成 `SYSTEM_ARCHITECTURE.md` 与 baseline。
3. `boundary-scan` 用 ratchet 模式,只拦新增违规。
4. `backlog-health` 初期 warning,待压缩后再 fail。
5. `docs-health` 先登记缺口,不阻断业务修复。

## 12. 验收标准

v3.3 完成后,至少要有以下验证 fixture:

| 验收项 | 期望 |
|---|---|
| `selfcheck.sh` | 绿 |
| Stitch 样例含未接线按钮 | `design-bindability-gate` fail |
| Stitch 样例按钮标 planned 但无 BACKLOG/HARD | fail |
| Stitch 样例引入未知按钮样式但无组件映射 | fail |
| Stitch 样例引入新颜色/字号但无 token 处置 | fail/warn |
| 页面缺 loading/empty/error/real-data 状态验收 | fail/warn |
| frontend 页面 import AI SDK | `boundary-scan` fail 或基线内债务显示 |
| 新增 backend 代码到 frontend 禁区 | `boundary-scan` fail |
| `BACKLOG.md` 超长 fixture | `backlog-health` fail |
| spec index 漏登记 | `docs-health` fail |
| 重大架构改变无 ADR | `docs-health` fail/warn |
| `.claude` 有 hook,`.codex` 缺 hook | `hook-health` fail/warn |
| spec 声称“无现成实现”但无搜索证据 | spec-review finding |
| BUILD 任务无验证命令/完成标准 | task/spec gate fail |

## 13. 风险

| 风险 | 缓解 |
|---|---|
| 门太多,开发变慢 | 新项目 fail,既有项目先 warning + ratchet |
| Stitch 被过度限制,探索变僵 | 明确 exploratory 阶段不限制创意,只限制进入 BUILD |
| 组件映射变成大工程 | P0 只要求核心组件和本次页面涉及组件;全量设计系统放 P2 |
| hook 在不同 agent 平台不可用 | 所有关键检查下沉到 `reconcile.mjs`;hook 只是即时体验 |
| docs-health 误报 Markdown 链接 | 支持 allowlist 与解析规则,先 warning 校准 |
| boundary-scan 配置太项目化 | 提供通用规则类型 + 项目自定义 config |

## 14. 推荐实施顺序

1. **P0: Stitch / Design Artifact Intake**
   - 新增 `DESIGN_INTAKE_TEMPLATE.md`
   - 新增 `PAGE_BINDING_MATRIX_TEMPLATE.md`
   - 新增 `COMPONENT_MAPPING_REGISTRY_TEMPLATE.md`
   - 新增 `DESIGN_TOKEN_POLICY_TEMPLATE.md`
   - 新增 `UI_STORY_ACCEPTANCE_TEMPLATE.md`
   - 新增 `gates/07-design-bindability-gate.md`

2. **P0: Physical Architecture Gate**
   - 新增 `SYSTEM_ARCHITECTURE_TEMPLATE.md`
   - 新增 `boundary-scan.mjs`
   - 接入 `reconcile`

3. **P0: Agent Task Spec**
   - 新增 `AGENT_TASK_SPEC_TEMPLATE.md`
   - BUILD 任务必须写完成标准、验证命令、可见行为、真实数据路径

4. **P1: Hook Health**
   - 统一 hook 源
   - 新增 `hook-health.mjs`
   - 注册 `.claude` / `.codex`

5. **P1: Docs / Backlog Health**
   - 新增 `docs-health.mjs`
   - 新增 `backlog-health.mjs`
   - 新增 `ADR_TEMPLATE.md`
   - 更新 `init-project.sh`

6. **P1: CodeGraph + 现网事实证据**
   - 改规则与模板
   - 改 spec-reviewer 检查项

## 15. 参考资料

本节只记录本轮方案直接借鉴的资料。实施时仍以项目现网事实和本 Skill 自身约束为准。

| 主题 | 资料 |
|---|---|
| Stitch / AI UI | [Google Developers Blog: Introducing Stitch](https://developers.googleblog.com/stitch-a-new-way-to-design-uis/) |
| 设计组件映射 | [Figma Code Connect](https://developers.figma.com/docs/code-connect/) |
| design-to-code | [Builder Design to Code](https://www.builder.io/m/design-to-code), [Locofy Figma to React](https://www.locofy.ai/convert/figma-to-react), [Anima Figma to Code](https://www.animaapp.com/figma) |
| UI 状态与组件验收 | [Storybook](https://storybook.js.org/) |
| Design Tokens | [Design Tokens Community Group](https://www.designtokens.org/) |
| Agent 交付 | [GitHub Copilot cloud agent](https://docs.github.com/en/copilot/concepts/agents/cloud-agent/about-cloud-agent), [Devin Docs](https://docs.devin.ai/get-started/devin-intro), [Replit Agent](https://docs.replit.com/references/agent/overview) |
| 架构边界 | [Nx Enforce Module Boundaries](https://nx.dev/docs/features/enforce-module-boundaries), [dependency-cruiser rules](https://github.com/sverweij/dependency-cruiser/blob/main/doc/rules-reference.md), [ArchUnit](https://www.archunit.org/userguide/html/000_Index.html) |
| Hook / 本地门卫 | [Claude Code Hooks](https://code.claude.com/docs/en/hooks-guide), [pre-commit](https://pre-commit.com/), [lefthook](https://lefthook.dev/) |
| 文档与架构记录 | [Diataxis](https://diataxis.fr/), [ADR](https://adr.github.io/), [C4 Model](https://c4model.com/diagrams) |
| 契约测试 | [Pact Docs](https://docs.pact.io/) |

## 16. 一句话结论

v3.3 不改变 `product-to-code-orchestrator` 的主干,只补三道硬门:

```text
Stitch/UI 图能不能落地 → 组件映射 + token + 接线表 + 状态验收
代码结构会不会腐烂 → 物理架构门卫
长期项目会不会糊掉 → docs/backlog/hook 健康门卫
```

这轮优化的方向不是增加仪式感,而是把 CreatorOS 已经付过学费的坑变成默认拦截。
