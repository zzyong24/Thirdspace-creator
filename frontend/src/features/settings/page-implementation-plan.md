# Settings — Page Implementation Plan (Task 25)

## 1. 页面信息

- 页面：Settings（设置）
- 路由：`/settings`（global resource-center 路由）
- 参考图：`ui/Settings.png`
- 容器类型：SettingsPage
- Header 模式：`global`（由 `(creator)/shell-router.tsx` 配置）
- Sidebar 激活项："设置"
- 原图绝对路径：`/Users/zyongzhu/Workbase/Thirdspace-creator/.worktrees/frontend-implementation/ui/Settings.png`
- 原图 SHA-256：`ab32cc156f193da770064434f8b6313a39cede2eb2c656292fe3c5ba7bcef094`
- 依赖任务：Task 20（Assets Center，已合入）

## 2. 原图观察

- 画布尺寸：1536 × 1024（D-009 桌面优先）
- 主内容起点：顶部 8 个 Tab，左宽右窄两列布局
- 主要列数：2（左 MainSettings + 右 SettingsRail）
- 固定区域：Header + Sidebar + 顶部 SettingsTabs
- 滚动区域：中央 SettingsGrid
- Overlay：无

## 3. 组件树（已批准，page-specs §17）

```text
SettingsPage
├── SettingsTabs                   (8 tabs in approved order)
└── SettingsGrid
    ├── MainSettings
    │   ├── AccountInformationCard
    │   ├── PreferenceSettingsCard
    │   └── SystemSettingsCard
    └── SettingsRail
        ├── StorageUsageCard
        ├── ModelConfigurationCard
        └── OtherSettingsCard
```

## 4. 截图区块拆解

| 顺序 | 区块 | 位置 | 关键尺寸关系 | 主要内容 |
|---|---|---|---|---|
| 1 | SettingsTabs | 页面顶部 | 横向一行 8 个 Tab | 账户 / 偏好 / 通知 / 外观 / 集成 / 存储 / 数据 / 关于 |
| 2 | AccountInformationCard | 左列上 | 单卡 | 头像 + 昵称 + 邮箱 + 计划/时区 Tag + 昵称/邮箱 Input |
| 3 | PreferenceSettingsCard | 左列中 | 单卡（5 行） | 默认主页 / 默认创作模式 / 默认可见性 / 自动保存 / 使用情况分析 |
| 4 | SystemSettingsCard | 左列下 | 单卡（4 行） | 主题 / 密度 / 语言 / 桌面通知 |
| 5 | StorageUsageCard | 右列上 | 单卡 | ProgressBar + 4 行分布 |
| 6 | ModelConfigurationCard | 右列中 | 单卡（3 行） | 提供商 / 模型 / 温度 |
| 7 | OtherSettingsCard | 右列下 | 单卡（3 行） | 导入 / 导出 / 删除账户 |

## 5. 组件复用计划

### 复用 components/ui

| 组件 | 用途 |
|---|---|
| `Input` | AccountInformationCard、ModelConfigurationCard 的文本/数值输入 |
| `Switch` | PreferenceSettingsCard / SystemSettingsCard / OtherSettingsCard 开关 |
| `Select` | PreferenceSettingsCard / SystemSettingsCard / ModelConfigurationCard 下拉 |
| `Button` | OtherSettingsCard 的导入 / 导出 / 删除按钮 |

### 复用共享业务组件

| 组件 | 用途 |
|---|---|
| `PageTabs` | SettingsTabs（page-tabs 共享组件已批准用于 Settings） |
| `SectionCard` | 所有 6 张卡片的容器 |
| `ProgressBar` | StorageUsageCard 的存储用量条 |
| `TagChip` | AccountInformationCard 的计划/时区标签 |

### 页面内部组件

| 组件 | 不提升为共享组件的原因 |
|---|---|
| `SettingsFormRow` | Settings 页面专用的"标签 + 控件"紧凑行结构 |

### 必须新增的共享组件

无。所有组件均使用现有共享组件组合而成。

## 6. 数据与状态

- 使用 fixture：读取 `canonicalDataset.user` + `canonicalDataset.userPreferences` 推导 AccountInformation / PreferencesState
- ViewModel / selector：`buildSettingsViewModel()` 在 `settings-page.tsx` 内组合
- 默认状态：固定 8 个 Tab、3 张主卡、3 张右栏卡；本地交互状态由 `settings-interactive-region.tsx` 持有
- 选中状态：Tab 选中态由 PageTabs 管理（首个 Tab 默认选中）
- 展开状态：N/A
- 空状态：默认数据保证非空
- Loading 状态：N/A（无网络）
- Error 状态：N/A（无网络）

## 7. 行为验收条件

| Given | When | Then | 测试层级 |
|---|---|---|---|
| 访问 `/settings` | Server Component 渲染 | Header 是 `global`，pageTitle=设置，pageDescription=账号、偏好与系统 | RTL + Playwright |
| Header 渲染完成 | 检查 sidebar | "设置" 为 `aria-current="page"`，href="/settings" | RTL + Playwright |
| Contextual card | 检查 sidebar | 变体为 `assistant`（D-003） | RTL + Playwright |
| Tab 渲染 | 检查 SettingsTabs | 顺序：账户 → 偏好 → 通知 → 外观 → 集成 → 存储 → 数据 → 关于（8 项） | RTL + Playwright |
| MainSettings 渲染 | 检查左列 | 顺序：account-information-card → preference-settings-card → system-settings-card | RTL + Playwright |
| SettingsRail 渲染 | 检查右列 | 顺序：storage-usage-card → model-configuration-card → other-settings-card | RTL + Playwright |
| Form row 渲染 | 检查 MainSettings | 每行含 form-row-label + form-row-control | RTL |
| Storage card | 检查右列 | 含 progress-bar | RTL |
| Shell 不重复 | 检查 DOM | 只有 1 个 `[data-slot="app-shell"]` | RTL + Playwright |
| 禁止改变 | 检查 DOM | 无 team-settings-card / permission-settings-card / subscription-settings-card | RTL + Playwright |

## 8. TDD 与文件边界

- 可写文件：
  - `frontend/src/app/(creator)/settings/page.tsx`（新建）
  - `frontend/src/features/settings/settings-page.tsx`（新建）
  - `frontend/src/features/settings/settings-page.test.tsx`（新建）
  - `frontend/src/features/settings/settings-interactive-region.tsx`（新建，Client island）
  - `frontend/tests/e2e/settings.spec.ts`（新建）
  - `frontend/tests/visual/pages/settings.spec.ts`（新建）
  - `frontend/src/features/settings/page-implementation-plan.md`（本文件）
- 只读文件：禁止修改
- 禁止修改：`package.json` / `pnpm-lock.yaml` / `frontend/src/app/(creator)/layout.tsx` / `frontend/src/app/(creator)/shell-router.tsx` / `frontend/src/components/shell/*` / `frontend/src/fixtures/canonical.ts` / `frontend/src/styles/tokens.css` / `frontend/src/components/ui/*`
- 首个失败测试：单元测试 `settings-page.test.tsx` 在没有 page 文件时 import 解析失败
