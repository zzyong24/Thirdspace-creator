# Publishing Center — Page Implementation Plan (Task 21)

## 1. 页面信息

- 页面：Publishing Center（发布中心）
- 路由：`/publishing`（global resource-center 路由，**不**嵌套在 `/projects/[id]` 下）
- 参考图：`ui/Publishing Center.png`
- 容器类型：ListPage
- Header 模式：`global`（由 `(creator)/shell-router.tsx` 配置）
- Sidebar 激活项："发布中心"
- 原图绝对路径：`/Users/zyongzhu/Workbase/Thirdspace-creator/.worktrees/frontend-implementation/ui/Publishing Center.png`
- 原图 SHA-256：`5c678851e540b151c9e6c50dc5d956cd99a35b8ffdca5866a2863c796629967a`
- 依赖任务：Task 20（Assets Center，已合入）

## 2. 原图观察

- 画布尺寸：1536 × 1024（D-009 桌面优先）
- 主内容起点：左侧发布列表、右侧分析栏
- 主要列数：1（左 list + 右 rail）→ 内部分别 7 列 / 4 行
- 固定区域：Header + Sidebar + 顶部 ContentTypeTabs + Toolbar
- 滚动区域：中央 PublishingLayout
- Overlay：无

## 3. 组件树（已批准，page-specs §13）

```text
PublishingCenterPage
├── ContentTypeTabs
├── PublishingToolbar
├── PublishingLayout
│   ├── PublicationTable
│   │   └── PublicationPerformanceRow[]
│   └── AnalyticsRail
│       ├── PublishingMetrics
│       ├── PlatformComparisonChart
│       ├── TrendChart
│       └── TopContentList
└── Pagination
```

## 4. 截图区块拆解

| 顺序 | 区块 | 位置 | 关键尺寸关系 | 主要内容 |
|---|---|---|---|---|
| 1 | ContentTypeTabs | 页面顶部 | 横向一行 4 个 | 全部 / 视频 / 图文 / 音频 |
| 2 | PublishingToolbar | Tabs 下方 | 搜索 + 过滤 | 时间范围 / 待优化 |
| 3 | PublicationTable | 中央 | 7 列 | 内容 / 项目 / 平台 / 发布时间 / 状态 / 表现 / 操作 |
| 4 | AnalyticsRail | 右侧栏 | metrics → platform → trend → top | 4 张卡 |

## 5. 组件复用计划

### 复用 components/ui

| 组件 | 用途 | 视觉变体 |
|---|---|---|
| `Table` / 直接 `<table>` | PublicationTable 7 列 | 与 `knowledge-page.tsx` 一致 |

### 复用共享业务组件

| 组件 | 用途 |
|---|---|
| `ChartFrame` | TrendChart 趋势线 |
| `MetricCard` | PublishingMetrics（4 张 KPI 卡） |
| `SectionCard` | PlatformComparisonChart、TopContentList |
| `PlatformIconView` | PublicationRow 平台图标、PlatformComparison 平台图标 |
| `Pagination` | 列表下方分页 |

### 页面内部组件

| 组件 | 不提升为共享组件的原因 |
|---|---|
| `ContentTypeTabs` | 单一页面使用 |
| `PublishingToolbar` | 单一页面使用 |
| `PublicationTable` | 单一页面使用（注意 `PageTabs` 复用于其他页面） |
| `AnalyticsRail` | 单一页面使用 |
| `PublicationPerformanceRow` | PublicationTable 行 |
| `ContentThumbnail` | 16:9 缩略图，单一页面使用 |
| `FilterChip` | 工具栏内的过滤小标签 |

### 必须新增的共享组件

无。所有组件均使用现有共享组件组合而成。

## 6. 数据与状态

- 使用 fixture：读取 `canonicalDataset.publications` + 推导的 `metricValues` 汇总
- ViewModel / selector：`buildViewModel()` 在 `publishing-center-page.tsx` 内组合
- 默认状态：列表非空、4 个 metric、平台对比、6 月趋势、3 条热门内容
- 选中状态：无交互选中（页面是 Server Component）
- 展开状态：N/A
- 空状态：默认数据保证非空
- Loading 状态：N/A（无网络）
- Error 状态：N/A（无网络）

## 7. 行为验收条件

| Given | When | Then | 测试层级 |
|---|---|---|---|
| 访问 `/publishing` | Server Component 渲染 | Header 是 `global`，pageTitle=发布中心，pageDescription=已发布内容、表现与排期 | RTL |
| Header 渲染完成 | 检查 sidebar | "发布中心" 为 `aria-current="page"`，href="/publishing" | RTL + Playwright |
| Contextual card | 检查 sidebar | 变体为 `assistant`（D-003） | RTL + Playwright |
| Tab 渲染 | 检查 ContentTypeTabs | 顺序：全部 → 视频 → 图文 → 音频 | RTL + Playwright |
| Table 渲染 | 检查 PublicationTable | 7 列表头顺序：内容 / 项目 / 平台 / 发布时间 / 状态 / 表现 / 操作 | RTL + Playwright |
| Row 渲染 | 检查 PublicationPerformanceRow | 每行含 PlatformIcon | RTL + Playwright |
| Rail 渲染 | 检查 AnalyticsRail | 4 块顺序：PublishingMetrics → PlatformComparisonChart → TrendChart → TopContentList | RTL + Playwright |
| 分页渲染 | 检查 Pagination | `data-slot="pagination"` 存在 | RTL + Playwright |
| Shell 不重复 | 检查 DOM | 只有 1 个 `[data-slot="app-shell"]` | RTL + Playwright |

## 8. TDD 与文件边界

- 可写文件：
  - `frontend/src/app/(creator)/publishing/page.tsx`（新建）
  - `frontend/src/features/publishing-center/publishing-center-page.tsx`（新建）
  - `frontend/src/features/publishing-center/publishing-center-page.test.tsx`（新建）
  - `frontend/tests/e2e/publishing-center.spec.ts`（新建）
  - `frontend/tests/visual/pages/publishing-center.spec.ts`（新建）
  - `frontend/src/features/publishing-center/page-implementation-plan.md`（本文件）
- 只读文件：禁止修改
- 禁止修改：`package.json` / `pnpm-lock.yaml` / `frontend/src/app/(creator)/layout.tsx` / `frontend/src/app/(creator)/shell-router.tsx` / `frontend/src/components/shell/*` / `frontend/src/fixtures/canonical.ts` / `frontend/src/styles/tokens.css` / `frontend/src/components/ui/*`
- 首个失败测试：单元测试 `publishing-center-page.test.tsx` 在没有 page 文件时 import 解析失败
- 预期失败原因：`Failed to resolve import "./publishing-center-page"`
- 组件测试命令：`pnpm test publishing-center`
- Playwright 命令：`pnpm test:e2e publishing-center`、`pnpm test:visual publishing-center`
- 视觉对比区域：1536 × 1024 全屏
- 视觉遮罩区域：N/A（无 overlay）

## 9. 还原顺序

1. 搭建 `PublishingCenterPage` 顶层结构（ContentTypeTabs / Toolbar / Layout / Pagination）。
2. 放置 PublishingLayout 双列（PublicationTable + AnalyticsRail）。
3. 填充共享组件（`MetricCard` / `ChartFrame` / `SectionCard` / `PlatformIconView` / `Pagination`）。
4. 补齐文字、标签、平台图标、缩略图与状态。
5. 无交互逻辑（Server Component）。
6. 跑单元 + e2e + visual 三套测试。
7. 修正任何契约差异。

## 10. 明确不做

- 不与 Publishing Workspace 合并。
- 不改成卡片瀑布流。
- 不新增内容编辑入口。
- 不在 Publishing Center 内放置项目身份（`page` 标题在 Header 中）。
- 不修改 `canonical.ts` / `scenarios.ts`。
- 不引入新依赖。

## 11. 验收截图

- 原图：`ui/Publishing Center.png`
- 实现截图：`tests/visual/pages/__screenshots__/publishing-center.spec.ts-snapshots/publishing-center.png`（首次运行由 Playwright 生成，Controller 审批基线）
- 已知差异：缩略图采用 token 派生色，不复刻具体海报
- 差异原因：缩略图为占位视觉，不是页面元数据
- 是否需要产品确认：否
