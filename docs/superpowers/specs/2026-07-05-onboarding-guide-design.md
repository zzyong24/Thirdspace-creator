# T-131 增量:onboarding v1 → 常驻清单 + 卡片定位 + 三档 scope

> ⚠️ **本文档是增量 SPEC,不是全量重设计。** onboarding **v1 已实现并提交**(弹窗式,提交 dfff118/f134c08),原始设计见同目录 [onboarding-checklist-design.md](2026-07-05-onboarding-checklist-design.md)。本文档只描述 v1 之上的**三处增量**,并**复用 v1 的 `features/onboarding/onboarding-steps.ts` 派生逻辑,绝不重造**。
> 单一执行真值:BACKLOG(v1=T-131 已✅,增量=T-132)。免 spec-review gate(纯前端增量,不改数据归属/架构/方向)。

## 0. 为什么有这份增量(诚实记录)

用户与本会话讨论 onboarding 形态、拍板了「首次弹窗 + 降级常驻清单」;与此同时另一会话已把 v1 实现提交。读 v1 代码后确认:v1 与讨论高度重合,但缺用户最在意的一块——**关掉弹窗后引导消失、找不回**(`openOnboarding()` 导出于 [onboarding-overlay.tsx:50](../../../frontend/src/features/onboarding/onboarding-overlay.tsx) 但**零调用点**;dashboard 无常驻清单)。本增量补齐它。

## 1. v1 现状(经代码亲验,file:line)

- 弹窗 overlay `OnboardingOverlay`,全局挂 [shell-router.tsx:426](../../../frontend/src/app/(creator)/shell-router.tsx:426);挂载后并行拉 6 源 → `deriveSteps` → `ui/dialog` 弹;`allRequiredDone` 全配则不自动弹;dismiss 存 localStorage `creatoros:onboarding:dismissed`。
- 步骤纯逻辑 [onboarding-steps.ts](../../../frontend/src/features/onboarding/onboarding-steps.ts):`OnboardingGroup="required"|"optional"`(**两档**);`ONBOARDING_STEP_SET` 11 步(必备 3=文本模型/定位/首个项目,可选 8);`deriveSteps`/`allRequiredDone`/`progressOf` 纯函数;完成态 100% 派生、诚实降级(读失败→未完成,绝不假打勾)。
- 渲染件 `StepGroup`/`StepRow` 目前**内嵌 overlay.tsx 未导出**。
- 缺口:①`openOnboarding()` 无调用点(关掉找不回);②dashboard 无常驻清单;③深链只跳 `/settings` 整页,不定位具体卡。

## 2. 三处增量

### 增量① 三档 scope(required / recommended / optional)
- `OnboardingGroup` 加 `"recommended"`。
- step-set 里 `positioning-profile` 与 `web-search` 从各自档位改为 `recommended`(用户拍板:定位/联网搜索属「强烈建议」,非硬必备、也非纯可选)。其余不动(文本模型/首个项目=required;生图/生视频/审核/ASR/存储根/违禁词/抖音=optional)。
- 新增纯函数 `isOnboardingComplete(steps)` = **required + recommended 全 done**(optional 不计入、不阻止退场)。
- `allRequiredDone`(自动弹判据)**不变**——仍只看 required,保证「缺必备才自动弹」行为不变。

### 增量② 常驻可折叠清单 + 手动重开入口(核心)
- **抽共用**:把 overlay.tsx 内的 `StepGroup`/`StepRow`/`ProgressBar` 抽到新文件 `onboarding-checklist.tsx` 并导出;overlay 改为复用它(**零行为变化**,纯重构)。三档渲染在此统一(required/recommended/optional 三组标题)。
- **新组件** `onboarding-card.tsx`(client,Dashboard 顶部常驻可折叠卡):自己 `loadState`(复用 overlay 的 loader,抽到共用 `onboarding-data.ts`)→ `deriveSteps` → 复用 checklist 渲染(紧凑变体)。
  - 显示条件:`!hidden && !isOnboardingComplete(steps)`(独立于弹窗 dismissed —— 弹窗关了常驻卡仍在 = 用户要的「降级保留」)。
  - 折叠:默认展开,可折叠为标题+进度条一行。
  - 「打开完整引导」按钮 → `openOnboarding()`(接上 v1 的线头)。
  - 「不再显示」→ 写**新** localStorage key `creatoros:onboarding:hidden`=1(永久;区别于弹窗的 session `dismissed`)。
  - 配全(required+recommended done)→ 卡自动隐藏。
- **注入** dashboard-page.tsx 顶部一个 `<OnboardingCard/>`(仅新增一个 client 子节点,不动现有 viewModel 逻辑)。

### 增量③ settings 卡片定位(极简,非 tour)
- 深链带 `?highlight=<stepKey>`(如 `/settings?highlight=text-model`);step-set 的 `href` 相应带上锚点。
- settings 页 client 读 `?highlight`,给对应配置卡容器加 `id`/`data-highlight` 锚点 + 一个 effect:`scrollIntoView` + 2s 高亮 ring 后淡出。**非逐步覆盖 tour**(尊重 v1「不做 tour」立场),只是深链落地定位。`?highlight` 缺省无副作用。
- 映射:text-model/image/video/review/asr/web-search/storage/review-rules → settings 内各卡;positioning→`/positioning`、first-project→`/projects/new`、douyin→`/automations`(整页跳转,无需 highlight)。

## 3. 不动 / 复用(防重造)
- 不改 contract / backend / schema / 迁移。
- 复用 `deriveSteps`/`allRequiredDone`/`progressOf`/`OnboardingState`/loader、`ui/dialog`、v1 弹窗自动弹与 session-dismiss 逻辑。
- overlay.tsx 除「渲染件抽出复用」外行为不变。

## 4. 文件清单
- 改 `onboarding-steps.ts`:+`recommended` 档、positioning/web-search 改档、+`isOnboardingComplete`。
- 新 `onboarding-checklist.tsx`:抽出并导出 ProgressBar/StepGroup/StepRow(三档),overlay 复用。
- 新 `onboarding-data.ts`:抽出 `loadState` 及各 loader(overlay 与 card 共用)。
- 改 `onboarding-overlay.tsx`:复用 checklist + data(纯重构)。
- 新 `onboarding-card.tsx`:Dashboard 常驻可折叠卡。
- 改 `dashboard-page.tsx`:注入 `<OnboardingCard/>`。
- 改 `settings/page.tsx` + 各配置卡:`?highlight` 锚点 + 高亮 effect。
- 配套 `*.test.tsx`。

## 5. 测试 / 验收(DoD)
- `isOnboardingComplete`:optional 未配不影响 complete;required 或 recommended 缺 → 未 complete。
- 三档 `deriveSteps`:positioning/web-search 归 recommended。
- 常驻卡显隐矩阵:`hidden`/`isComplete`/各档缺口 组合 → 显/隐正确;「不再显示」写 hidden 后不再出现;「打开完整引导」触发 openOnboarding。
- settings highlight effect:param 存在→滚动+高亮;缺省→无副作用。
- overlay 重构后既有 22 测仍绿(行为不回归)。
- typecheck 0 + Dashboard/settings preview 冒烟自截图。

## 6. 切片(拆进 BACKLOG T-132,每片一条)
- **切片 1**:`onboarding-steps.ts` 增量(recommended 档 + isOnboardingComplete + 改档)+ 单测(TDD)。
- **切片 2**:抽 `onboarding-checklist.tsx` + `onboarding-data.ts`,overlay 改复用(纯重构,既有测保绿)。
- **切片 3**:`onboarding-card.tsx` 常驻卡 + 显隐/dismiss 测 + 注入 dashboard-page + 手动重开入口。
- **切片 4**:settings `?highlight` 卡片定位 + effect 测。
- **切片 5**:三步验证(vitest + typecheck)+ preview 冒烟自截图 + 收尾。

## 7. 非目标(YAGNI)
- 不做逐步覆盖 tour / 产品导览动画。
- 不建 backend onboarding 表 / 不改 contract。
- 不改 v1 弹窗的自动弹与 session-dismiss 语义。
- 不在卡内内联配置(深链到真表单)。
