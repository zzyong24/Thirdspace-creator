# CreatorOS Frontend SPEC

## 1. 文档目的

本文定义 CreatorOS 前端的实现边界、共享布局、页面还原规则、开发顺序和验收标准。

页面视觉依据为：

```text
/Users/zyongzhu/Workbase/Thirdspace-creator/ui/*.png
```

当前共有 17 张设计图，画布尺寸均为 `1536 × 1024`。

### 1.1 已锁定技术基线

- Next.js App Router + React + TypeScript `strict`。
- Tailwind CSS + shadcn/ui。
- pnpm，Node.js 24 LTS。
- Lucide React 作为通用图标来源。
- shadcn/ui Chart + Recharts 作为图表实现。
- Vitest + React Testing Library + `user-event` 作为组件测试。
- Playwright 作为路由、关键流程和视觉回归测试。

Foundation 完成后必须提交并冻结 lockfile。页面 Agent 不得新增依赖、切换包管理器或引入第二套 UI、图标、图表、CSS-in-JS 或全局状态库。

## 2. 强制约束

以下规则优先级高于实现者的个人偏好：

1. 所有页面使用同一套 `AppShell`。
2. 所有页面使用同一套 `Sidebar`。
3. 所有页面使用同一套 `TopHeader`。
4. 不允许为单个页面复制或重新实现 Sidebar、Header。
5. 不允许自由设计新布局。
6. 不允许改变设计图中的页面结构、区块顺序、主要尺寸关系和信息层级。
7. 不允许为了“优化体验”增加、删除、合并或移动页面功能。
8. 优先复用 `components/ui` 下已有组件。
9. 只有在 `components/ui` 中不存在等价能力时，才允许新增通用组件。
10. 页面必须尽量还原对应 UI 图，包括布局、间距、层级、颜色、边框、圆角、阴影和密度。
11. 设计图中没有展示的交互，不得自行补充复杂流程。
12. 设计图与产品文档冲突时，先停止实现并记录差异，不得自行决定。
13. 当前产品是个人创作工具，不实现协作者、团队权限和多人评论能力。
14. UI 中出现的协作者头像或团队入口应按产品业务文档处理，不可据此扩展团队功能。
15. 所有页面数据必须来自统一的 typed fixture contract，不得在页面中临时拼接同义数据。
16. 禁止使用 `Math.random()`、`Date.now()`、当前网络数据或不固定时区生成截图内容。
17. 页面 Agent 不得修改 AppShell、设计 token、共享 fixture、`components/ui`、依赖或其他页面。
18. 设计冲突必须以 `specs/decision-log.md` 的已批准结论为准，不得由实现 Agent 自行裁决。

## 3. 视觉真相源

每个页面必须绑定唯一参考图：

| 页面 | 参考图 |
|---|---|
| Dashboard | `ui/Dashboard.png` |
| Projects | `ui/Projects.png` |
| New Project | `ui/New Project.png` |
| Project Overview | `ui/Project Overview.png` |
| Research Workspace | `ui/Research Workspace.png` |
| Planning Workspace | `ui/Planning Workspace.png` |
| Script Workspace | `ui/Script Workspace.png` |
| Production Workspace | `ui/Production Workspace.png` |
| Publishing Workspace | `ui/Publishing Workspace.png` |
| Analytics & Review | `ui/Analytics & Review.png` |
| Knowledge & Memory | `ui/Knowledge & Memory.png` |
| Assets Center | `ui/Assets Center.png` |
| Publishing Center | `ui/Publishing Center.png` |
| Experience Center | `ui/Experience Center.png` |
| Global Search | `ui/search.png` |
| AI Copilot | `ui/AIchat.png` |
| Settings | `ui/Settings.png` |

实现者必须在页面开发前打开对应原图，不允许仅根据文字描述开发。

## 4. 前端架构边界

```text
App
└── AppShell
    ├── Sidebar
    ├── MainFrame
    │   ├── TopHeader
    │   └── PageContent
    └── OverlayLayer
        ├── NewProjectDialog
        └── AICopilotDialog
```

### 4.1 AppShell

`AppShell` 是所有页面唯一的顶层应用布局，负责：

- 左侧固定 Sidebar。
- 右侧主内容区域。
- TopHeader 的统一放置。
- 页面内容滚动容器。
- 全局弹层、通知和 AI Copilot 的挂载层。
- 1536 × 1024 参考画布下的布局基准。

禁止：

- 页面自行创建第二套侧边栏。
- 页面把 TopHeader 写在页面组件内部。
- 页面使用与 AppShell 无关的独立全屏布局，除非该页面本身是 Overlay。

### 4.2 Sidebar

Sidebar 结构固定：

```text
Sidebar
├── Brand
├── PrimaryNavigation
│   ├── Dashboard
│   ├── Projects
│   ├── Knowledge
│   ├── Assets
│   ├── Publishing
│   ├── Experience
│   └── Settings
├── ContextSection
│   └── CurrentProject / QuickAccess
├── AIAssistantCard
└── UserProfile
```

允许变化：

- 当前导航项的激活态。
- ContextSection 的内容。
- AI 卡片中的页面相关提示文案。

不允许变化：

- Logo 位置。
- 主导航顺序。
- 导航图标与文字的基本结构。
- 用户区域位置。
- Sidebar 宽度和整体视觉样式。

### 4.3 TopHeader

所有页面共用一个 `TopHeader`，通过配置显示不同内容。

```text
TopHeader
├── Leading
│   ├── PageTitle / ProjectIdentity
│   └── Subtitle / Metadata
├── Center
│   └── ProjectStageStepper or Search
└── Actions
    ├── Search
    ├── Notification
    ├── Share
    ├── More
    └── PrimaryAction
```

TopHeader 允许以下模式：

- `global`：Dashboard、Projects、资源中心和 Settings。
- `project-overview`：项目标题、元信息和进入工作台。
- `project-workspace`：项目身份、六阶段 Stepper 和阶段主操作。
- `search`：全局搜索输入和筛选。
- `overlay-background`：弹层打开时保留底层 Header 并添加遮罩。

模式只改变插槽内容，不允许创建不同 Header 组件。

## 5. 页面容器类型

页面只能从以下容器类型中选择，不允许另造布局体系：

| 类型 | 用途 |
|---|---|
| `DashboardGridPage` | Dashboard 卡片网格 |
| `ListPage` | Projects、Publishing Center |
| `ProjectOverviewPage` | Project Overview |
| `WorkspacePage` | 六阶段工作台 |
| `ResourceCenterPage` | Knowledge、Assets、Experience |
| `SettingsPage` | Settings |
| `SearchPage` | Global Search |
| `ModalOverlay` | New Project、AI Copilot |

## 6. 路由与页面身份

路由用于表达当前信息架构，不改变 UI：

```text
/                              Dashboard
/projects                      Projects
/projects/new                  New Project overlay state
/projects/:projectId           Project Overview
/projects/:projectId/research  Research Workspace
/projects/:projectId/planning  Planning Workspace
/projects/:projectId/script    Script Workspace
/projects/:projectId/production Production Workspace
/projects/:projectId/publishing Publishing Workspace
/projects/:projectId/review    Analytics & Review
/knowledge                     Knowledge & Memory
/assets                        Assets Center
/publishing                    Publishing Center
/experience                    Experience Center
/search                        Global Search
/settings                      Settings
?copilot=open                  AI Copilot overlay state
```

New Project 和 AI Copilot 是 Overlay，不是脱离 AppShell 的独立视觉页面。

## 7. 组件复用规则

每次实现组件前按以下顺序检查：

1. `components/ui` 是否已有等价组件。
2. 共享业务组件中是否已有等价组件。
3. 当前页面是否可以组合已有组件完成。
4. 确认前三项均不满足后，才能新增组件。

新增组件必须满足至少一个条件：

- 被两个及以上页面使用。
- 具有独立、稳定的业务语义。
- 设计图中存在明确且重复的视觉模式。

禁止为仅有轻微文案差异的卡片创建多个组件。

## 8. 视觉实现规则

### 8.1 尺寸

- 以 1536 × 1024 为首要截图对比视口。
- Sidebar 在所有页面保持同宽。
- Workspace 页面保持左侧导航、中央工作区和右侧信息栏的比例。
- 不因响应式设计改变桌面参考图的信息顺序。

### 8.2 间距与密度

- 优先还原截图中的相对间距。
- 页面外边距、卡片间距、列表行高和区块留白应保持一致。
- 禁止为了减少滚动压缩信息。
- 禁止为了“更现代”扩大卡片、字号或留白。

### 8.3 卡片

- 统一白色或轻微渐变背景。
- 使用设计图中的浅边框、轻阴影和圆角。
- 标题、说明、数字、标签和操作的层级应与截图一致。

### 8.4 色彩

- 主色为紫色系。
- 成功、警告、错误、信息状态使用截图中对应的绿、橙、红、蓝。
- 禁止自行替换品牌色或增加新的强调色体系。

### 8.5 图标

- 优先使用项目已选定的同一图标库。
- 图标语义和位置必须与截图一致。
- 若无法获得原始图标，使用形状最接近者，不改变按钮结构。

## 9. 状态与数据

页面初次实现必须包含截图中可见的以下状态：

- 默认态。
- 激活导航态。
- 标签和状态徽章。
- 选中项。
- 展开的详情侧栏。
- 弹层遮罩。
- 图表静态展示。
- 空间占位和滚动区域。

不要求在视觉还原阶段提前实现：

- 真实平台发布。
- 真实 AI 调用。
- 真实文件转码。
- 真实指标采集。

但禁止为了省事删除对应 UI 区块。没有后端时使用符合数据模型的 fixture。

Fixture 必须满足：

- `src/fixtures/canonical.ts` 是跨页面 canonical 数据唯一真相源。
- 每个页面通过 selector/adapter 生成页面 ViewModel，不直接复制 canonical 数据。
- 固定 ID、日期、时区、排序和展示文案。
- `default`、`empty`、`loading`、`error`、`selected` 场景由共享 contract 定义。
- 页面首次视觉还原只实现设计图明确展示的状态；未展示状态使用共享样式，不允许页面自行设计。

## 10. 开发顺序

### Phase 1：全局壳层

1. AppShell
2. Sidebar
3. TopHeader
4. ProjectStageStepper
5. OverlayLayer

### Phase 2：通用组件

1. Card / SectionCard
2. Button / IconButton
3. Tabs / SegmentedControl
4. Badge / StatusBadge / Tag
5. SearchInput / FilterBar
6. DataTable / ListRow
7. MetricCard / Progress
8. EmptyState / Placeholder
9. Avatar / UserMenu
10. Dialog / Drawer / Dropdown
11. ChartFrame
12. FileThumbnail / MediaPreview
13. ActivityList / TaskList
14. RichTextToolbar / EditorShell

### Phase 3：页面

按依赖和共享程度实现：

1. Dashboard
2. Projects
3. New Project
4. Project Overview
5. Research Workspace
6. Planning Workspace
7. Script Workspace
8. Production Workspace
9. Publishing Workspace
10. Analytics & Review
11. Knowledge & Memory
12. Assets Center
13. Publishing Center
14. Experience Center
15. Global Search
16. AI Copilot
17. Settings

## 11. 页面开工门禁

每次实现页面前，必须先输出该页面的组件树和还原计划 SPEC，并获得确认后才能开始编码。采用连续的 Subagent-Driven Development 时，必须在执行前批量批准 17 份页面 SPEC；否则每个页面必须作为独立执行批次。

任何页面编码前，必须先输出并确认：

1. 页面参考图。
2. 页面路由和容器类型。
3. 完整组件树。
4. 截图区域拆解。
5. 复用的 `components/ui` 组件。
6. 需要新增的共享组件及理由。
7. 数据 fixture 与状态列表。
8. 逐区块还原顺序。
9. 不实现和不得改变的内容。
10. 截图验收计划。
11. 页面 Agent 的精确可写文件范围。
12. Given/When/Then 行为验收条件。
13. 必须先失败的测试及预期失败原因。
14. 原图绝对路径、SHA-256 和视觉对比区域。

模板见 `specs/page-implementation-template.md`。

## 12. 页面验收标准

每个页面完成后必须在 `1536 × 1024` 下与原图对比。

验收项：

- AppShell、Sidebar、Header 无重复实现。
- 页面所有主要区块均存在。
- 区块顺序与截图一致。
- 主要列宽和卡片比例接近截图。
- 文本层级、状态颜色和操作位置一致。
- 没有擅自添加功能。
- 没有删除截图中的功能。
- 没有改变信息架构。
- Overlay 的尺寸、位置和遮罩一致。
- 页面可滚动区域与固定区域符合截图。

如果截图无法确认某个细节，使用已有共享模式，不创建新的设计语言。

视觉基线由 Spec Reviewer 批准后，再由 Controller 提交。实现 Agent 不得自行更新或批准视觉 snapshot。

## 13. 变更控制

任何以下变更必须先更新 SPEC 并获得确认：

- 改 Sidebar 导航。
- 改 Header 结构。
- 改页面区块顺序。
- 新增页面。
- 合并或拆分页面。
- 新增产品功能。
- 改 Project 六阶段导航。
- 改 Overlay 为独立页面，或反向修改。
- 引入第二套组件库。
