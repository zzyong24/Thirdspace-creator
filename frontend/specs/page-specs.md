# CreatorOS 17 个页面拆解

## 1. Dashboard

**参考图：** `ui/Dashboard.png`  
**容器：** `DashboardGridPage`  
**Header：** `global`  
**Sidebar：** 激活“首页”

### 组件树

```text
DashboardPage
├── WelcomeHeading
├── SummaryMetrics
│   └── MetricCard × 5
├── DashboardGrid
│   ├── ContinueCreatingCard
│   │   ├── ProjectProgressRow[]
│   │   └── NewProjectEntry
│   ├── TodoCard
│   │   └── TaskRow[]
│   ├── TrendingTopicsCard
│   │   └── TopicRow[]
│   ├── RecentPublicationsCard
│   │   └── PublicationCompactRow[]
│   ├── DataOverviewCard
│   │   ├── CompactMetrics
│   │   └── TrendChart
│   └── CreationSuggestionsCard
│       └── SuggestionRow[]
└── SidebarAssistantCard
```

### 还原要点

- 顶部欢迎语和五张指标卡保持单行。
- 下方为三列卡片网格，不改成单列 Feed。
- “继续创作”和“待办事项”高度接近。
- 最近发布、数据概览、创作建议保持底部三列。
- 热门选题、创作建议中的颜色状态必须与截图对应。

### 禁止改变

- 不把 Dashboard 改成可拖拽组件。
- 不新增快捷入口或日历。
- 不改变三列信息密度。

## 2. Projects

**参考图：** `ui/Projects.png`  
**容器：** `ListPage`  
**Header：** `global`  
**Sidebar：** 激活“项目”

### 组件树

```text
ProjectsPage
├── PageHeading
├── ProjectToolbar
│   ├── SearchField
│   ├── FilterButton
│   └── NewProjectButton
├── StatusTabs
├── ViewAndSortControls
├── ProjectList
│   └── ProjectListItem[]
└── Pagination
```

### 还原要点

- 状态 Tab 位于列表上方，保持数量徽章。
- 列表行包含缩略图、标题、摘要、负责人显示、阶段、进度、平台、更新时间和操作。
- 进度条和百分比同列展示。
- 保持右上网格/列表切换与排序控件。

### 禁止改变

- 不改成 Kanban。
- 不删除平台图标或阶段说明。
- 不把项目行改成大卡片瀑布流。

## 3. New Project

**参考图：** `ui/New Project.png`  
**容器：** `ModalOverlay`  
**Header：** 使用底层页面 Header  
**Sidebar：** 使用底层页面 Sidebar

### 组件树

```text
NewProjectDialog
├── DialogHeader
├── ProjectNameField
├── ProjectBriefField
├── TargetPlatformSelector
├── ContentTypeSelector
├── CreationModeSelector
├── DialogHint
└── DialogFooter
    ├── EnterAfterCreateCheckbox
    ├── CancelButton
    └── CreateButton
```

### 还原要点

- 居中大尺寸白色弹窗，底层页面加灰色遮罩。
- 表单顺序必须与截图一致。
- 平台、内容类型和创作模式均采用横向选择卡。
- 创作模式卡片包含推荐、省心、自由等辅助标识。

### 禁止改变

- 不改成多步 Wizard。
- 不拆成独立页面。
- 不新增模板市场或高级设置步骤。

## 4. Project Overview

**参考图：** `ui/Project Overview.png`  
**容器：** `ProjectOverviewPage`  
**Header：** `project-overview`  
**Sidebar：** 激活“项目”

### 组件树

```text
ProjectOverviewPage
├── ProjectProgressCard
│   ├── StageOverview
│   └── OverallProgress
├── MainColumn
│   ├── AssetSummaryCard
│   ├── RecentFilesCard
│   └── ProjectActivityCard
└── SideColumn
    ├── ProjectInfoCard
    ├── OutputPlanCard
    ├── PublishingStatusCard
    └── MilestoneCard
```

### 还原要点

- 顶部项目进度卡横跨主区域。
- 下方固定为左宽右窄两列。
- 项目资产概览使用五个紧凑统计项。
- 最近文件和项目动态是列表，不改成网格。
- 右侧四张卡按截图顺序堆叠。

### 禁止改变

- 不新增团队成员管理。
- 不把阶段导航移入 Sidebar。
- 不合并输出规划与发布状态。

## 5. Research Workspace

**参考图：** `ui/Research Workspace.png`  
**容器：** `WorkspacePage`  
**Header：** `project-workspace`  
**Sidebar：** 激活“项目”，显示当前项目

### 组件树

```text
ResearchWorkspacePage
├── MainWorkspace
│   ├── ProjectIdeaCard
│   ├── TrendBackgroundSection
│   │   └── ResearchSummaryCard × 3
│   ├── CompetitorAnalysisTable
│   └── ResearchCollectionSection
│       ├── TypeTabs
│       └── ResearchSourceRow[]
└── RightRail
    ├── ResearchNotesCard
    ├── EvidenceCollectionCard
    └── RelatedTagsCard
```

### 还原要点

- 中央主区和右侧栏比例严格参考截图。
- 趋势与背景保持三张并列卡。
- 竞品分析保持表格结构和威胁等级。
- 资料收集位于主区底部，使用类型 Tab。
- 研究笔记、证据收藏和标签固定在右栏。

### 禁止改变

- 不把研究资料改成知识库页面。
- 不增加聊天式研究界面。
- 不改变竞品表格字段。

## 6. Planning Workspace

**参考图：** `ui/Planning Workspace.png`  
**容器：** `WorkspacePage`  
**Header：** `project-workspace`  
**Sidebar：** 激活“项目”，显示当前项目

### 组件树

```text
PlanningWorkspacePage
├── PlanningTabs
├── MainWorkspace
│   ├── ContentContractSection
│   │   └── ContractCard × 4
│   ├── CoreThesisCard
│   └── ThesisTreeSection
│       └── ThesisColumn × 4
└── RightRail
    ├── EvidenceMapCard
    └── KeyMaterialsCard
```

### 还原要点

- 顶部二级 Tab 顺序保持：内容合同、论点树、证据地图、受众洞察、差异化亮点。
- 内容合同保持四张横向卡。
- 核心论点为独立强调卡。
- 论点树保持中央根节点向四列分支的结构。
- 证据地图和关键素材位于右侧栏。

### 禁止改变

- 不使用自由画布替代截图中的结构化论点树。
- 不合并核心论点和内容合同。
- 不增加额外策划阶段。

## 7. Script Workspace

**参考图：** `ui/Script Workspace.png`  
**容器：** `WorkspacePage`  
**Header：** `project-workspace`  
**Sidebar：** 激活“项目”，显示当前项目

### 组件树

```text
ScriptWorkspacePage
├── ScriptTabs
├── MainWorkspace
│   ├── RichTextEditor
│   │   ├── EditorToolbar
│   │   ├── ScriptDocument
│   │   └── EditorStatusBar
│   └── VersionHistoryStrip
└── RightRail
    ├── OutlineStructureCard
    ├── AIWritingSuggestionsCard
    └── GoldenQuotesCard
```

### 还原要点

- 编辑器占主区域绝大部分。
- 工具栏、正文、底部字数与保存状态在同一编辑器壳层。
- 版本记录横向排列在编辑器下方。
- 右侧依次为大纲、AI 建议、金句。
- 正文中的时间码和紫色强调文字需保留。

### 禁止改变

- 不替换成聊天式写作。
- 不把版本历史隐藏到独立页面。
- 不擅自增加 Markdown 预览分栏。

## 8. Production Workspace

**参考图：** `ui/Production Workspace.png`  
**容器：** `WorkspacePage`  
**Header：** `project-workspace`  
**Sidebar：** 激活“项目”，显示当前项目

### 组件树

```text
ProductionWorkspacePage
├── ProductionModeSelector
├── ProductionGrid
│   ├── RecordingScriptPanel
│   ├── AssetLibraryPanel
│   ├── PreviewPanel
│   └── SettingsRail
│       ├── RecordingSettings
│       ├── SubtitleSettings
│       └── ExportSettings
└── TimelinePanel
    └── TimelineSegmentCard[]
```

### 还原要点

- 顶部制作方式三张选择卡保持横排。
- 中间为脚本、素材库、预览、设置四个视觉区域。
- 素材库保持分类 Tab 和三列缩略图。
- 设置栏保持窄列，按录制、字幕、导出分组。
- 时间线位于底部横向铺开。

### 禁止改变

- 不把制作页重做成专业 NLE 布局。
- 不新增多轨道时间线。
- 不移动导出按钮位置。

## 9. Publishing Workspace

**参考图：** `ui/Publishing Workspace.png`  
**容器：** `WorkspacePage`  
**Header：** `project-workspace`  
**Sidebar：** 激活“项目”，显示当前项目

### 组件树

```text
PublishingWorkspacePage
├── PublishingTabs
├── PublishingGrid
│   ├── BasicInformationForm
│   │   ├── TitleField
│   │   ├── DescriptionField
│   │   ├── CoverSelector
│   │   ├── Tags
│   │   ├── CategoryAndSeries
│   │   └── PublishingOptions
│   ├── PlatformPublishingPanel
│   │   ├── PlatformPublishCard[]
│   │   ├── BatchTimeActions
│   │   ├── ConfirmPublishButton
│   │   └── PrePublishCheck
│   └── PreviewRail
│       ├── PlatformPreview
│       ├── PublishChecklist
│       └── PublishTips
```

### 还原要点

- 主区三列：基础信息、发布平台、预览与检查。
- 平台发布卡按截图纵向排列。
- 封面与标签在基础信息同一区域。
- 预览卡模拟平台帖子，但不自行改版。
- 发布清单和提示位于右栏下方。

### 禁止改变

- 不改成发布向导。
- 不增加平台连接流程页面。
- 不合并平台设置与基础信息。

## 10. Analytics & Review

**参考图：** `ui/Analytics & Review.png`  
**容器：** `WorkspacePage`  
**Header：** `project-workspace`  
**Sidebar：** 激活“项目”，显示当前项目

### 组件树

```text
AnalyticsReviewPage
├── AnalyticsTabs
├── MainAnalytics
│   ├── CoreMetricsRow
│   ├── PrimaryCharts
│   │   ├── ViewsTrendChart
│   │   └── ConversionFunnel
│   ├── SecondaryCharts
│   │   ├── AudienceProfile
│   │   ├── AudienceSource
│   │   └── RetentionCurve
│   └── KeyMomentsSection
└── RightRail
    ├── AIAnalysisCard
    └── ReviewHistoryCard
```

### 还原要点

- 顶部七张核心指标卡保持单行。
- 主图区域为左侧趋势图、右侧漏斗图。
- 下方三张分析卡同排。
- 关键时刻表现位于底部。
- AI 分析与复盘记录保持右侧栏。

### 禁止改变

- 不引入新指标。
- 不改变图表类型。
- 不把 AI 分析浮层化。

## 11. Knowledge & Memory

**参考图：** `ui/Knowledge & Memory.png`  
**容器：** `ResourceCenterPage`  
**Header：** `global`  
**Sidebar：** 激活“知识库”

### 组件树

```text
KnowledgePage
├── KnowledgeToolbar
├── KnowledgeMetrics
├── KnowledgeGrid
│   ├── CategoryPanel
│   ├── RecentKnowledgeTable
│   └── InsightRail
│       ├── PopularTags
│       ├── MemoryInsights
│       ├── UnsortedItems
│       └── ReusableSnippets
└── KnowledgeGraph
```

### 还原要点

- 搜索与筛选位于内容顶部。
- 五张知识统计卡保持单行。
- 中段为左分类、中列表、右洞察三列。
- 知识图谱横跨下方主区域。
- 热门标签使用多行紧凑标签云。

### 禁止改变

- 不将知识图谱改成独立页面。
- 不增加文件夹树层级。
- 不移除记忆洞察区。

## 12. Assets Center

**参考图：** `ui/Assets Center.png`  
**容器：** `ResourceCenterPage`  
**Header：** `global`  
**Sidebar：** 激活“素材中心”

### 组件树

```text
AssetsPage
├── AssetToolbar
├── AssetWorkspace
│   ├── AssetTypeSidebar
│   ├── AssetGallery
│   │   ├── GalleryControls
│   │   ├── AssetCardGrid
│   │   └── Pagination
│   └── AssetDetailPanel
│       ├── MediaPreview
│       ├── AssetActions
│       ├── AssetMetadata
│       ├── Tags
│       └── UsageHistory
└── StorageUsageCard
```

### 还原要点

- 页面内部存在素材类型窄栏，不可与全局 Sidebar 混淆。
- 中央保持三列素材卡网格。
- 右侧详情面板固定展示当前选中素材。
- 左下保留存储空间卡。
- 视频、图片、音频和文档缩略方式需区分。

### 禁止改变

- 不把详情面板改成弹窗。
- 不移除类型侧栏。
- 不增加文件夹层级导航。

## 13. Publishing Center

**参考图：** `ui/Publishing Center.png`  
**容器：** `ListPage`  
**Header：** `global`  
**Sidebar：** 激活“发布中心”

### 组件树

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

### 还原要点

- 主体为左侧发布列表、右侧分析栏。
- 列表按内容、项目、平台、发布时间、状态、表现、操作组织。
- 右栏保持数据概览、平台对比、趋势、热门内容顺序。
- 平台图标和内容缩略图必须保留。

### 禁止改变

- 不与 Publishing Workspace 合并。
- 不改成卡片瀑布流。
- 不新增内容编辑入口。

## 14. Experience Center

**参考图：** `ui/Experience Center.png`  
**容器：** `ResourceCenterPage`  
**Header：** `global`  
**Sidebar：** 激活“经验沉淀”

### 组件树

```text
ExperiencePage
├── ExperienceTabs
├── MainColumn
│   ├── AISummarySection
│   │   └── SummaryCard × 4
│   ├── RecentDiscoveries
│   │   └── DiscoveryRow[]
│   ├── ExperienceCategories
│   └── RecentRecordsTable
└── RightRail
    ├── ValueOverview
    ├── ApplicationEffectChart
    ├── PopularExperienceList
    └── QuickRecordActions
```

### 还原要点

- 顶部二级导航保持七项。
- AI 洞察总结四张卡横排。
- 最近发现保持列表和效果数据列。
- 经验库分类为六张紧凑卡。
- 右侧栏的价值、效果、热门经验、快捷记录顺序固定。

### 禁止改变

- 不把经验中心改成普通知识库。
- 不新增社区或模板市场。
- 不移除失败案例分类。

## 15. Global Search

**参考图：** `ui/search.png`  
**容器：** `SearchPage`  
**Header：** `search`  
**Sidebar：** 保持全局 Sidebar

### 组件树

```text
SearchPage
├── GlobalSearchHeader
├── ResultTypeTabs
├── SearchResults
│   ├── ProjectResultSection
│   ├── KnowledgeResultSection
│   ├── AssetResultSection
│   └── VideoResultSection
└── SearchSideRail
    ├── SearchFilters
    ├── QuickActions
    ├── SearchHistory
    └── SearchTips
```

### 还原要点

- 顶部搜索框横跨主区域。
- 结果按类型分段，不改成统一长列表。
- 项目结果为横向三卡。
- 素材和视频结果为缩略图横排。
- 右侧栏固定筛选、快捷操作、历史和技巧。

### 禁止改变

- 不引入聊天式搜索结果。
- 不调整结果类型顺序。
- 不移除右侧筛选栏。

## 16. AI Copilot

**参考图：** `ui/AIchat.png`  
**容器：** `ModalOverlay`  
**Header：** 使用底层页面 Header  
**Sidebar：** 使用底层页面 Sidebar

### 组件树

```text
AICopilotDialog
├── CopilotHeader
├── PromptComposer
│   ├── PromptInput
│   ├── SuggestedActionChips
│   └── SubmitButton
├── CopilotDashboard
│   ├── RecommendedCommands
│   ├── RecentTasks
│   └── ContinuingTasks
├── QuickEntries
└── SmartRecommendation
```

### 还原要点

- 弹窗居中，宽度约占画布一半以上。
- 顶部输入区和快捷动作在同一大卡片。
- 中间为推荐指令、最近任务、继续任务三列。
- 底部为快捷入口和智能推荐。
- 保持底层 Dashboard 遮罩可见。

### 禁止改变

- 不改成右侧聊天抽屉。
- 不改成常规消息流界面。
- 不新增 Agent 商店。

## 17. Settings

**参考图：** `ui/Settings.png`  
**容器：** `SettingsPage`  
**Header：** `global`  
**Sidebar：** 激活“设置”

### 组件树

```text
SettingsPage
├── SettingsTabs
├── SettingsGrid
│   ├── MainSettings
│   │   ├── AccountInformationCard
│   │   ├── PreferenceSettingsCard
│   │   └── SystemSettingsCard
│   └── SettingsRail
│       ├── StorageUsageCard
│       ├── ModelConfigurationCard
│       └── OtherSettingsCard
```

### 还原要点

- 顶部设置 Tab 保持八项及顺序。
- 主区域为左宽右窄两列。
- 账户信息、偏好设置、系统设置纵向排列。
- 存储空间、模型配置、导入导出和删除账户位于右栏。
- 表单行保持“说明 + 控件”的紧凑结构。

### 禁止改变

- 不新增团队或权限设置。
- 不增加订阅管理详情页。
- 不把模型配置移到独立页面。

## 18. 逐页实现通用还原流程

每个页面开始前必须：

1. 打开对应 `ui/*.png` 原图。
2. 从本文复制该页组件树。
3. 对照当前 `components/ui` 更新复用清单。
4. 输出页面主网格和逐区块还原顺序。
5. 明确截图中存在但当前阶段不接后端的区块。
6. 获得确认后才开始编码。
7. 完成后在 1536 × 1024 截图对比。

本文件中的组件树是初始约束。实现前可以按已有组件做技术层面的组合调整，但不得改变页面视觉结构和信息架构。

