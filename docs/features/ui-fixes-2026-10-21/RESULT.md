# 五项界面修复结果（2026-10-21）

代码和定向验证已完成，尚未提交：当前环境禁止写入仓库 .git，git add 与 git commit 都因无法创建 index.lock 而失败。没有 push，没有修改授权、激活、verdict 或签名代码。

## 修改文件与行为

|问题|产品文件|测试文件|修复与单项验证|
|---|---|---|---|
|1 侧栏与选题列宽|frontend/src/styles/creatoros-system.css；frontend/src/features/topics/topics-workflow.module.css|frontend/src/components/shell/shell.test.tsx；frontend/src/features/topics/topics-interactions.test.tsx|展开侧栏限制224px，折叠64px，手机仍全宽；候选/详情列允许收缩。单项阶段83例通过。真实1440px视觉未验。|
|2 项目首开位置|frontend/src/styles/creatoros-studio.css|frontend/src/features/draft-workbench/draft-workbench-page.bug8.test.tsx；frontend/src/features/draft-workbench/project-pipeline-panel.test.tsx|移除脚本区order:-1，恢复项目准备在前；保留#script。连同已有thesis-skeleton-panel.t730.test.tsx主动跳转回归共32例通过。|
|3 来源中文|frontend/src/features/topics/topics-interactive-region.tsx|frontend/src/features/topics/topics-interactions.test.tsx|五种来源完整中文，收藏显示“收藏”，未知/原型属性名显示“未知来源”。39例通过。|
|4 雷达重复按钮|frontend/src/features/intelligence/intelligence-workbench.tsx|frontend/src/features/intelligence/intelligence-workbench.test.tsx|删除ItemCard升级按钮，保留详情04入口、查看项目与任务取消；从详情升级仍防重复。单项阶段46例通过。|
|5 未知转写状态|contract/src/resources/intelligence.ts；frontend/src/features/intelligence/intelligence-display.ts；frontend/src/features/intelligence/intelligence-workbench-types.ts|frontend/src/features/intelligence/intelligence-workbench-api.test.ts；frontend/src/features/intelligence/intelligence-workbench.test.tsx|响应读取容错为unknown，显示状态未知；保留正文，严格筛选及结构校验不变。68例通过。|

流程文件：BACKLOG.md记录T-1378～T-1382，状态均由taskctl转换；orchestrator/events.ndjson保留事件。PROJECT.md由pmem sync生成。本目录五个SPEC记录用户授权、范围与实测结果。

## 最终合并验证

- frontend/pnpm typecheck：退出0，Next路由类型生成及tsc通过。
- 相关7个vitest文件：192例通过。
- 额外纳入draft-workbench-state.test.ts：7例通过、已知T-767一例失败（预测stale期望true，实际false），未修改该文件。
- 合计8个文件：199通过、1个既有失败。
- LED-047原回归命令：8个文件189例通过。
- boundary-scan：无新增违规，保留原基线5项。
- git diff --check：通过。Impeccable机械扫描返回空列表。
- 独立只读范围及实现复核：未发现需要返工的缺陷；未将独立源码审查记为浏览器验收。

## 未验证及阻塞

自动Chrome进程在沙箱中被拒绝；Computer Use也未获准使用Chrome；因此没有真实1440px截图或实测几何。侧栏已有224px utility，本次加强共享CSS边界，不能宣称已在现场证明650px的原始成因。项目首开问题的负排序则有源码和红绿测试直接证据。

未运行完整reconcile：现有T-1373记录的真实CLI用户目录写入及联网副作用仍未隔离，reconcile会无条件执行该命令。本次不绕过、不更改门禁，不宣称全局全绿。已完成pmem sync和本项适用的定向检查。

五项提交都受.git只读阻塞；taskctl已将任务登记为block。独立补丁系列位于/private/tmp/creatoros-ui-fixes-2026-10-21，便于恢复Git写权限后按顺序仅暂存对应差异并生成五个中文commit。


2026-10-22 集成补记：本文原 UI 编号 T-1378～T-1384 对应当前 T-1387～T-1393，见 [编号映射](TASK_ID_MAPPING.md)。历史实测结果与状态保持原样。
