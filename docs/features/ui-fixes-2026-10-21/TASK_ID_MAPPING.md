# UI 任务编号映射（2026-10-22 集成）

本轮以 main 合并结果为基础保留双方任务，发现旧 UI 编号与既有诊断、构建及归档任务重号。以下只纠正身份，不改变原任务范围、状态、审核、实测结果或发布授权。原 SPEC 路径保留，今后的状态操作使用新编号。

|原 UI 编号|当前编号|任务|
|---|---|---|
|T-1378|T-1387|统一主导航宽度并恢复选题页1440px完整布局|
|T-1379|T-1388|修复项目页首开自动滚动到口播脚本|
|T-1380|T-1389|补全选题来源中文标签与未知值兜底|
|T-1381|T-1390|移除雷达作品卡片重复的升级为项目按钮|
|T-1382|T-1391|容错雷达作品未知转写状态避免整页崩溃|
|T-1383|T-1392|重新规划内容雷达三栏与来源操作布局|
|T-1384|T-1393|按真实密度重排内容雷达三栏|

原诊断/协作构建 T-1378～T-1380 以及原归档 T-1381～T-1384 保持原编号；T-1385 CI 任务原样保留。既有 taskctl 事件和 hash-chained review 事件全部保留原字节，不补作历史状态转换或评审。

旧 UI 事件的精确时间范围是 `2026-10-21T07:42:40.573Z` 至 `2026-10-21T08:52:14.475Z`，结合原 SPEC 路径识别。`2026-10-21T13:08:12.046Z` 的 T-1382 complete 属于原统一项目准备任务，不属于 UI 转写任务。

## 合并前远端原始任务行

以下完整保留集成前 8 行的文字；上表是发生重号的 7 项身份修正，原状态与验收结果不变。

```text
|T-1385|修复 Verify 的 Node 堆内存耗尽|🔨|—|—|[SPEC](docs/features/t1385-verify-ci-memory.md)|用户授权最小 CI 修复：两个 job 6144 MiB 堆、串行 typecheck；本地全检查及内存测量，不改许可/激活/verdict/签名，不push，交付补丁与本地提交脚本。|
|T-1384|按真实密度重排内容雷达三栏|⏸️|—|—|[SPEC](docs/features/ui-fixes-2026-10-21/T-1384.md)|用户授权沿ui-ux-pro-max与MASTER重排11来源/5分类/40作品；1440与1280保留三栏、缩略图、紧凑状态与筛选，保功能及详情唯一升级入口。当前分支本地提交或补丁脚本，不push。|
|T-1383|重新规划内容雷达三栏与来源操作布局|⏸️|—|—|[SPEC](docs/features/ui-fixes-2026-10-21/T-1383.md)|用户授权使用ui-ux-pro-max，1440px来源完整、三栏重排与窄窗降级；保留全部功能、详情04唯一升级入口、分组卡片与未知状态。补vitest/typecheck，当前分支本地中文提交或补丁脚本，不push。|
|T-1378|统一主导航宽度并恢复选题页1440px完整布局|⏸️|—|—|[SPEC](docs/features/ui-fixes-2026-10-21/T-1378.md)|用户2026-10-21明确：intelligence/topics侧栏统一约224px，选题右侧03/04完整显示；遵守MASTER，补vitest，独立中文commit至当前ui-fixes分支、不push。用户已允许跳过缺失技能；按本项SPEC执行并如实记录验证边界。 实际结果 / RESULT.md [RESULT](docs/features/ui-fixes-2026-10-21/RESULT.md)|
|T-1379|修复项目页首开自动滚动到口播脚本|⏸️|—|—|[SPEC](docs/features/ui-fixes-2026-10-21/T-1379.md)|用户2026-10-21明确：定位autofocus/scrollIntoView/hash根因，首开停顶部项目准备，保留主动去写稿#script；补vitest并独立中文commit。用户已允许跳过缺失技能；按本项SPEC执行并如实记录验证边界。 实际结果 / RESULT.md [RESULT](docs/features/ui-fixes-2026-10-21/RESULT.md)|
|T-1380|补全选题来源中文标签与未知值兜底|⏸️|—|—|[SPEC](docs/features/ui-fixes-2026-10-21/T-1380.md)|用户2026-10-21明确：candidateSource的trend/benchmark/demand/idea/favorites全部中文，未知值兜底；补vitest并独立中文commit。用户已允许跳过缺失技能；按本项SPEC执行并如实记录验证边界。 实际结果 / RESULT.md [RESULT](docs/features/ui-fixes-2026-10-21/RESULT.md)|
|T-1381|移除雷达作品卡片重复的升级为项目按钮|⏸️|—|—|[SPEC](docs/features/ui-fixes-2026-10-21/T-1381.md)|用户2026-10-21明确：只移除ItemCard入口，保留作品详情04选定方案入口；补vitest并独立中文commit。用户已允许跳过缺失技能；按本项SPEC执行并如实记录验证边界。 实际结果 / RESULT.md [RESULT](docs/features/ui-fixes-2026-10-21/RESULT.md)|
|T-1382|容错雷达作品未知转写状态避免整页崩溃|⏸️|—|—|[SPEC](docs/features/ui-fixes-2026-10-21/T-1382.md)|用户2026-10-21明确：transcript.status未知枚举显示状态未知且不触发整页ZodError；补vitest并独立中文commit。五项最终frontend typecheck及相关vitest，保留已知T767失败及既有lint；不改授权/激活/verdict/签名。用户已允许跳过缺失技能；按本项SPEC执行并如实记录验证边界。 实际结果 / RESULT.md [RESULT](docs/features/ui-fixes-2026-10-21/RESULT.md)|
```
