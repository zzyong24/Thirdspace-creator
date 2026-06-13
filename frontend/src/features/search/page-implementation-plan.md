# Global Search — Page Implementation Plan (Task 23)

## 1. 页面信息

- 页面：Global Search（全局搜索）
- 路由：`/search`（global resource-center 路由）
- 参考图：`ui/search.png`
- 容器类型：SearchPage
- Header 模式：`search`（由 `(creator)/shell-router.tsx` 配置）
- Sidebar 激活项：保持全局主导航（无独立"搜索"激活态）
- 页面标题：`全局搜索`（`pageTitle` 由 shell-router 注入）
- 上下文卡：`assistant` 变体（D-003）
- 原图绝对路径：`/Users/zyongzhu/Workbase/Thirdspace-creator/.worktrees/frontend-implementation/ui/search.png`
- 原图 SHA-256：`e384830beb6b9b1e341e357cab5a27ca2aeb19b7fa91933a17d9a99da4d511ec`
- 依赖任务：无（独立页）

## 2. 原图观察

- 画布尺寸：1536 × 1024（D-009 桌面优先）
- 时区/locale：`zh-CN` / `Asia/Shanghai`（D-010）
- 主内容起点：Header 已是 `search` 模式（占据主区域顶部的全局搜索框）
- 顶部搜索框横跨主区域（在 TopHeader 的 search mode 下显示）
- 主要列数：2 栏 — 左侧为「结果区」、右侧为「侧边栏」
- 固定区域：Header + Sidebar + 顶部 ResultTypeTabs
- 滚动区域：中央 SearchResults 区域
- Overlay：无
- 结果按类型分段（不改成统一长列表）

## 3. 组件树（已批准，page-specs §15）

```text
SearchPage
├── GlobalSearchHeader          (search Header mode = single global search field)
├── ResultTypeTabs              (Project / Knowledge / Asset / Video)
├── SearchResults
│   ├── ProjectResultSection    (3 cards horizontally)
│   ├── KnowledgeResultSection
│   ├── AssetResultSection      (thumbnails horizontally)
│   └── VideoResultSection      (thumbnails horizontally)
└── SearchSideRail
    ├── SearchFilters
    ├── QuickActions
    ├── SearchHistory
    └── SearchTips
```

## 4. 截图区块拆解

| 顺序 | 区块 | 位置 | 关键尺寸关系 | 主要内容 |
|---|---|---|---|---|
| 1 | GlobalSearchHeader | TopHeader（search mode） | 横跨主区域 | 单一全局搜索框 |
| 2 | ResultTypeTabs | 页面顶部 | 4 个 tab | 项目 / 知识 / 素材 / 视频 |
| 3 | ProjectResultSection | 中央 | 3 张卡横排 | 项目卡（标题 + 阶段 + 进度） |
| 4 | KnowledgeResultSection | 中央 | 列表 | 知识条目 |
| 5 | AssetResultSection | 中央 | 缩略图横排 | 缩略图 + 标题 |
| 6 | VideoResultSection | 中央 | 缩略图横排 | 缩略图 + 平台图标 |
| 7 | SearchSideRail | 右侧 | 4 个区块 | 筛选 → 快捷操作 → 历史 → 技巧 |

## 5. 组件复用计划

- 复用：`SectionCard`（搜索结果分区）、`TagChip`（筛选 chip）、
  `PlatformIconView`（视频缩略图装饰）、`PageTabs`（ResultTypeTabs）、
  `Input` / `Button` / `Badge` / `Card`
- 不修改：`(creator)/layout.tsx` / `shell-router.tsx` / `Sidebar` / `TopHeader` / 任何 `components/ui/*`
- 不引入新依赖
- Server Component 主结构，URL `?q=` 同步逻辑通过轻量 Client island 实现

## 6. 数据来源

- 全部从 `canonicalDataset` 读取：
  - `projects`（项目结果）— 取前 3 个
  - `knowledgeItems`（知识结果）
  - `assets`（素材结果）
  - `publications` + `publicationRevisions`（视频结果）
  - `searchHistory`（搜索历史）
- 不调用 `Date.now` / `Math.random` / 网络
- 搜索 query 在 URL state 中表达（`?q=...`，同步到 input 和结果）

## 7. 验收不变量

- 顶部搜索框在 TopHeader 的 search mode 下显示（不要在页面里重复实现）
- 结果按类型分段，不改成统一长列表
- 项目结果为横向三卡
- 素材和视频结果为缩略图横排
- 右侧栏固定筛选、快捷操作、历史和技巧
- ResultTypeTabs 顺序：项目 → 知识 → 素材 → 视频
- SearchSideRail 顺序：SearchFilters → QuickActions → SearchHistory → SearchTips
- 单一 AppShell（一个 Sidebar、一个 TopHeader）
