# Experience Center — Page Implementation Plan (Task 22)

## 1. 页面信息

- 页面：Experience Center（经验沉淀）
- 路由：`/experience`（global resource-center 路由，**不**嵌套在 `/projects/[id]` 下）
- 参考图：`ui/Experience Center.png`
- 容器类型：ListPage
- Header 模式：`global`（由 `(creator)/shell-router.tsx` 配置）
- Sidebar 激活项："经验沉淀"
- 上下文卡片变体：`assistant`（D-003）
- 原图绝对路径：`/Users/zyongzhu/Workbase/Thirdspace-creator/.worktrees/frontend-implementation/ui/Experience Center.png`
- 原图 SHA-256：`609023b1435725b22b4e95c9ad3b68844c3562ad74b28575a9225ecfa46ba0bb`
- 依赖任务：Task 21（Publishing Center，已合入）

## 2. 原图观察

- 画布尺寸：1536 × 1024（D-009 桌面优先）
- 顶部二级导航：7 个 tab（按截图顺序固定）
- AI 洞察总结：4 张卡横排
- 最近发现：列表 + 效果数据列
- 经验库分类：6 张紧凑卡（含失败案例）
- 右侧栏：ValueOverview → ApplicationEffectChart → PopularExperienceList → QuickRecordActions
- 滚动区域：中央 ExperienceLayout

## 3. 组件树（已批准，page-specs §14）

```text
ExperiencePage
├── ExperienceTabs                (7 tabs in approved order)
├── MainColumn
│   ├── AISummarySection          (4 cards horizontally)
│   │   └── SummaryCard × 4
│   ├── RecentDiscoveries         (list with effect data column)
│   │   └── DiscoveryRow[]
│   ├── ExperienceCategories      (6 cards incl. failures)
│   └── RecentRecordsTable
└── RightRail
    ├── ValueOverview
    ├── ApplicationEffectChart
    ├── PopularExperienceList
    └── QuickRecordActions
```

## 4. 截图区块拆解

| 顺序 | 区块 | 位置 | 关键尺寸关系 | 主要内容 |
|---|---|---|---|---|
| 1 | ExperienceTabs | 页面顶部 | 横向一行 7 个 | 全部 / 选题策划 / 脚本结构 / 拍摄执行 / 后期剪辑 / 互动运营 / 复盘沉淀 |
| 2 | AISummarySection | Tabs 下方 | 4 卡横排 | 总经验沉淀 / 已验证经验 / 平均复用率 / 待改进项 |
| 3 | RecentDiscoveries | 中央 | 列表 + 效果数据列 | 标题 / 来源 / 类型 / 效果 |
| 4 | ExperienceCategories | 中央 | 6 张紧凑卡 | 选题策划 / 脚本结构 / 拍摄执行 / 后期剪辑 / 互动运营 / 失败案例 |
| 5 | RightRail | 右侧栏 | 4 块 | ValueOverview → ApplicationEffectChart → PopularExperienceList → QuickRecordActions |

## 5. 组件复用计划

### 复用 components/ui

| 组件 | 用途 | 视觉变体 |
|---|---|---|
| `Tabs` | ExperienceTabs | 来自 base-ui，标准 line 变体 |
| `Table` | RecentDiscoveries / RecentRecordsTable | 与 `knowledge-page.tsx` 一致 |

### 复用共享业务组件

| 组件 | 用途 |
|---|---|
| `PageTabs` | ExperienceTabs（作为页面 tab 导航） |
| `SectionCard` | ValueOverview / PopularExperienceList / QuickRecordActions |
| `ChartFrame` | ApplicationEffectChart |
| `MetricCard` | AISummarySection（4 张 KPI 卡） |
| `TagChip` | 标签 |
| `ProgressBar` | ValueOverview 复用率进度条 |

### 页面内部组件

| 组件 | 不提升为共享组件的原因 |
|---|---|
| `ExperienceTabs` | 单一页面使用（基于 PageTabs） |
| `AISummarySection` | 单一页面使用 |
| `SummaryCard` | AISummarySection 内部组件 |
| `RecentDiscoveries` | 单一页面使用 |
| `ExperienceCategories` | 单一页面使用 |
| `RecentRecordsTable` | 单一页面使用 |

### 必须新增的共享组件

无。所有组件均使用现有共享组件组合而成。

## 6. 数据与状态

- 使用 fixture：默认数据保证非空
- ViewModel / selector：`buildViewModel()` 在 `experience-page.tsx` 内组合
- 默认状态：4 张 AI summary 卡、5 条最近发现、6 张经验分类、右侧 4 块
- 选中状态：默认第一个 tab 选中；快速记录按钮无交互（Server Component）
- 展开状态：N/A
- 空状态：默认数据保证非空
- Loading 状态：N/A（无网络）
- Error 状态：N/A（无网络）

## 7. 行为验收条件

| Given | When | Then | 测试层级 |
|---|---|---|---|
| 访问 `/experience` | Server Component 渲染 | Header 是 `global`，pageTitle=经验沉淀，pageDescription=被验证的创作经验与失败案例 | RTL |
| Header 渲染完成 | 检查 sidebar | "经验沉淀" 为 `aria-current="page"`，href="/experience" | RTL + Playwright |
| Contextual card | 检查 sidebar | 变体为 `assistant`（D-003） | RTL + Playwright |
| Tab 渲染 | 检查 ExperienceTabs | 顺序：全部 → 选题策划 → 脚本结构 → 拍摄执行 → 后期剪辑 → 互动运营 → 复盘沉淀 | RTL + Playwright |
| Summary 渲染 | 检查 AISummarySection | 4 张 summary card | RTL + Playwright |
| Discoveries 渲染 | 检查 RecentDiscoveries | 至少 1 行 discovery-row + effect-data 列 | RTL + Playwright |
| Categories 渲染 | 检查 ExperienceCategories | 6 张 category card，含 `experience-failures` | RTL + Playwright |
| Rail 渲染 | 检查 RightRail | 4 块顺序：ValueOverview → ApplicationEffectChart → PopularExperienceList → QuickRecordActions | RTL + Playwright |
| Shell 不重复 | 检查 DOM | 只有 1 个 `[data-slot="app-shell"]` | RTL + Playwright |

## 8. TDD 与文件边界

- 可写文件：
  - `frontend/src/app/(creator)/experience/page.tsx`（新建）
  - `frontend/src/features/experience/experience-page.tsx`（新建）
  - `frontend/src/features/experience/experience-page.test.tsx`（新建）
  - `frontend/src/features/experience/experience-interactive-region.tsx`（按需新建）
  - `frontend/tests/e2e/experience.spec.ts`（新建）
  - `frontend/tests/visual/pages/experience.spec.ts`（新建）
  - `frontend/src/features/experience/page-implementation-plan.md`（本文件）
- 只读文件：禁止修改
- 禁止修改：`package.json` / `pnpm-lock.yaml` / `frontend/src/app/(creator)/layout.tsx` / `frontend/src/app/(creator)/shell-router.tsx` / `frontend/src/components/shell/*` / `frontend/src/fixtures/canonical.ts` / `frontend/src/styles/tokens.css` / `frontend/src/components/ui/*`
- 首个失败测试：单元测试 `experience-page.test.tsx` 在没有 page 文件时 import 解析失败
- 预期失败原因：`Failed to resolve import "./experience-page"`
- 组件测试命令：`pnpm test experience`
- Playwright 命令：`pnpm test:e2e experience`、`pnpm test:visual experience`
- 视觉对比区域：1536 × 1024 全屏
- 视觉遮罩区域：N/A（无 overlay）

## 9. 还原顺序

1. 搭建 `ExperiencePage` 顶层结构（ExperienceTabs / MainColumn / RightRail）。
2. 放置 MainColumn（SummarySection / Discoveries / Categories / Table）。
3. 放置 RightRail 4 块（ValueOverview / ApplicationEffectChart / PopularExperienceList / QuickRecordActions）。
4. 填充共享组件（`MetricCard` / `ChartFrame` / `SectionCard` / `PageTabs` / `ProgressBar` / `TagChip`）。
5. 补齐文字、标签与分类。
6. 无交互逻辑（Server Component）。
7. 跑单元 + e2e + visual 三套测试。
8. 修正任何契约差异。

## 10. 明确不做

- 不把经验中心改成普通知识库。
- 不新增社区或模板市场。
- 不移除失败案例分类。
- 不在 Experience Center 内放置项目身份（`page` 标题在 Header 中）。
- 不修改 `canonical.ts` / `scenarios.ts`。
- 不引入新依赖。

## 11. 验收截图

- 原图：`ui/Experience Center.png`
- 实现截图：`tests/visual/pages/__screenshots__/experience.spec.ts-snapshots/experience.png`（首次运行由 Playwright 生成，Controller 审批基线）
- 已知差异：默认数据保证非空，与具体业务数据解耦
- 是否需要产品确认：否