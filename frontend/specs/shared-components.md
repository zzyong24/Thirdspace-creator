# CreatorOS 共享布局与组件规范

## 1. 目标

共享组件必须服务于 UI 还原和一致性，不用于重新设计页面。

当前前端工程尚未初始化，`components/ui` 尚不存在。初始化后必须先列出已有组件，再根据本规范进行映射。

## 2. 建议组件层级

```text
components/
├── ui/                 # 基础组件，优先复用
├── shell/              # AppShell、Sidebar、TopHeader
├── navigation/         # StageStepper、Tabs、Breadcrumb
├── project/            # ProjectCard、ProjectStatus、OutputStatus
├── content/            # Artifact、Script、Evidence、Timeline 展示
├── resources/          # Knowledge、Asset、Learning 展示
├── publishing/         # Platform、Publication、Metric 展示
├── analytics/          # ChartFrame、MetricCard、InsightCard
└── overlays/           # NewProjectDialog、AICopilotDialog
```

此目录是责任边界建议，不代表必须创建所有文件。

## 3. AppShell 组件树

```text
AppShell
├── Sidebar
│   ├── Brand
│   ├── PrimaryNav
│   │   └── SidebarNavItem[]
│   ├── ContextNav
│   │   └── ContextNavItem[]
│   ├── AssistantPromoCard
│   └── UserProfileMenu
├── MainFrame
│   ├── TopHeader
│   └── PageScrollArea
│       └── RouteOutlet
└── OverlayLayer
    ├── NewProjectDialog
    ├── AICopilotDialog
    ├── NotificationPopover
    └── GlobalMenus
```

## 4. Sidebar 规格

### 固定区域

| 区域 | 内容 |
|---|---|
| Brand | CreatorOS 标志与文字 |
| PrimaryNav | 首页、项目、知识库、素材中心、发布中心、经验沉淀、设置 |
| Assistant | AI 助手提示与入口 |
| User | 头像、名称、套餐标识、菜单入口 |

### 条件区域

| 页面类型 | ContextNav |
|---|---|
| Dashboard | 无或快捷访问项目 |
| Projects | 无 |
| Project 页面 | 当前项目选择器 |
| Resource Center | 快捷访问项目或标签 |
| Publishing Center | 快捷访问项目 |
| Settings | 快捷访问项目 |

### 状态

- default
- hover
- active
- compact context item
- unread indicator

## 5. TopHeader 规格

### 全局页面模式

```text
TopHeader
├── PageHeading
│   ├── Title
│   └── Description
└── HeaderActions
    ├── Search
    ├── Notification
    ├── SecondaryAction
    └── PrimaryAction
```

### Project Overview 模式

```text
TopHeader
├── ProjectBreadcrumb
├── ProjectHeading
│   ├── Title
│   ├── Edit / Favorite
│   └── Metadata
└── HeaderActions
    ├── Share
    ├── More
    └── EnterWorkspace
```

### Project Workspace 模式

```text
TopHeader
├── ProjectCompactIdentity
├── ProjectStageStepper
└── HeaderActions
    ├── Search or CommentIndicator
    ├── Share
    ├── More
    └── StagePrimaryAction
```

个人产品不实现多人评论。设计图中的评论图标只能作为个人备注或通知入口占位，不能扩展协作模型。

## 6. 基础 UI 组件映射

初始化工程后，应优先从 `components/ui` 复用：

| 视觉模式 | 基础组件能力 |
|---|---|
| 主次按钮 | Button |
| 图标操作 | IconButton / Button |
| 页签 | Tabs |
| 筛选切换 | SegmentedControl / ToggleGroup |
| 标签与状态 | Badge |
| 搜索 | Input / Command |
| 下拉筛选 | Select / DropdownMenu |
| 弹窗 | Dialog |
| 侧栏详情 | Sheet / Drawer |
| 提示 | Tooltip / Popover |
| 进度 | Progress |
| 列表与表格 | Table |
| 勾选 | Checkbox / Switch |
| 表单 | Form / Input / Textarea |
| 滚动容器 | ScrollArea |
| 分隔线 | Separator |
| 头像 | Avatar |

不允许为了接近截图而完全绕过基础组件重新手写交互语义。允许通过样式变体还原视觉。

## 7. 共享业务组件

### 导航与筛选

- `ProjectStageStepper`
- `PageTabs`
- `FilterBar`
- `SearchField`
- `ViewModeToggle`
- `SortSelect`
- `Pagination`

### 数据展示

- `MetricCard`
- `StatusBadge`
- `ProgressBar`
- `ProjectThumbnail`
- `PlatformIcon`
- `TagChip`
- `SectionCard`
- `ListSectionHeader`

### 项目

- `ProjectListItem`
- `ProjectSummaryCard`
- `ProjectStageOverview`
- `OutputPlanList`
- `MilestoneList`
- `ProjectActivityList`
- `TaskList`

### 内容与资源

- `ArtifactListItem`
- `KnowledgeListItem`
- `AssetCard`
- `AssetDetailPanel`
- `EvidenceCard`
- `FileThumbnail`
- `MediaPreview`
- `VersionCard`

### 分析

- `ChartFrame`
- `MetricTrendCard`
- `InsightCard`
- `RetentionChart`
- `AudienceBreakdown`
- `PublicationPerformanceRow`

## 8. 组件新增规则

新增共享组件前必须记录：

```text
组件名称：
出现页面：
对应截图区域：
components/ui 无法满足的原因：
复用次数：
允许的变体：
禁止的变体：
```

仅为单页单区块服务、且没有稳定语义的内容应保留在页面内部。

## 9. Fixture 规则

Fixture 应围绕已定义数据模型，不按截图随意拼接匿名对象。

主要 fixture：

- user
- projects
- projectStages
- contentOutputs
- artifacts
- knowledgeItems
- assets
- publications
- metricSnapshots
- reviews
- learnings
- aiTasks
- notifications

同一示例项目 `AI Native Browser 深度解析` 应在各页面保持一致的标题、状态、进度和平台信息。

