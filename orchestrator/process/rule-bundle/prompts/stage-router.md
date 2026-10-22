# 阶段路由

用于开始或恢复阶段、切换 BUILD 任务。流程为 `1-plan → 2-contract → 3-design → 4-build → 5-ship`；BUILD 以看板任务为交付单位。

1. 定位 `orchestrator/ARTIFACT_MANIFEST.yaml`。不存在时按 SKILL 的初始化入口处理，不凭空建立第二份阶段记录。
2. 运行 `node orchestrator/process/context-plan.mjs --root <project-root> [--task <T-id>] --json`。入口或版本清单缺失时使用支持的更新器。读取 required_reads、required_project_reads 及当前任务实际依赖。
3. 核对当前阶段与程序检查，选择最早未通过的阶段：排除 `passed` / `accepted-risk` / `compact`。其中 compact 仅是 S 类 DESIGN 的受校验紧凑表达，不等于接受风险。
4. BUILD 选择最上面的依赖就绪任务，核对 `research-gate.mjs audit`；开放研究门只阻塞受影响任务。首次实现先完成 [项目基线](project-bootstrap.md)。
5. CONTRACT 应满足范围必要性和契约完整性；DESIGN 的探索稿不得冒充已绑定操作的页面合同。派发、并行或自治才生成 context-compile 任务包。
6. 持续推进已授权工作。只有新事实改变重要选择时按 [公共流程](../workflows/_COMMON.md) 处理；向用户报告结果、证据或具体阻塞，无需逐项复述路由字段。
