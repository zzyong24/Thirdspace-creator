# T-1433 重复发布同步不误改项目版本

用户2026-10-28要求逐条修复剩余问题，密钥与新Mac包暂时不动。源码审查确认两个可独立复现的写入点：markPublished 即使项目阶段与进度不变仍写 updatedAt；normalizeVisiblePlatformWork 即使发布记录已公开、项目 hidden=false 仍写两行。此类空操作会造成版本漂移；不将它们追认成旧 Windows 快照两条时间变化的确定原因。

## 合同

- markPublished 在项目已处于目标阶段/进度且阶段行没有变化时返回当前行，不写项目更新时间。真实阶段变化及真实内容合并仍更新；归档只读与账号/账号组所有权不变。不覆盖并发的新阶段状态，复用现有仓储写入边界。
- normalizeVisiblePlatformWork 保留现有父级锁和事务，在锁内读取当前 publication/project；仅当 hiddenAt/platformStatus 或 matching platformRef.hidden 实际需要变更时写对应行。已公开、hidden缺省或false均是公开语义，不凭空添加false。跨账号、外部作品引用不匹配不得改项目。
- 使用真实PGlite集成夹具与可推进时钟，证明首次转换会改、第二次同值不改、真实变化仍改。保留所有既有断言，补充独立只读/隔离/事务回归。修复不得新增付费调用、真实业务写入或安装包。

## 范围与写集

backend/src/modules/projects/projects.service.ts、projects.service.test.ts、projects.repository.ts、projects.repository.integration.test.ts；必要时backend/src/modules/ingestion/ingestion.merge-bound-project.integration.test.ts；本SPEC及相邻独立审核、docs/verification/t1433/**、docs/research/2026-10-28-project-noop-timestamps-research.md；BACKLOG.md、PROJECT.md、orchestrator/process/modules.config.json、orchestrator/progress.json、orchestrator/context/T-1433.md以及仅通过正式工具追加的事件与审核链。

## 验收

先实际运行新增测试并看到原代码失败，再修改；运行两份projects测试与ingestion合并、project-preparation幂等和brief终态集成回归，backend类型检查、timeout/boundary检查及独立实现审查。保存原始输出与命令。旧失败现场保留；没有实机复跑不能宣称历史业务副作用已完全闭环。
