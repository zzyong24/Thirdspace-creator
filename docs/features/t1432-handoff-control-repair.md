# T-1432 接手看板与任务包恢复

2026-10-28用户要求“逐条修复所有问题，密钥和新Mac包暂时不动”。本任务只修已汇总的看板重复、体积、状态标签及任务包生成问题；不更改产品验收结论，不执行模型、许可、经济、安装、发布或远端操作。

## 合同

1. 同一当前任务只保留一个执行行。原完整行及所有详细描述先逐字保全到BACKLOG-details或已存在归档，并记录来源行哈希；T1397沿最后真实block事件保留暂停。已归档的五条相同行仅移除活动副本，不重复归档。不同历史需求的五组撞号全部保留，使用来源索引区分，不改写旧ID或审核链。
2. 使用正式归档工具迁出已完成任务，保持原审核/验收票据、SPEC及证据。压缩只外置叙事，不丢当前与旧版本；相同内容幂等，不同内容追加。五列暂停表与七列执行表按实际表头处理，不丢列。执行看板应恢复体积门要求；不能把未完成任务当完成处理。
3. taskctl状态转换同步规范状态标签。既有矛盾文字经显式normalize-labels入口修复，只清除与emoji矛盾的标准状态词，保留其余限制说明，不改变emoji含义或验收票据；记录事件与原文、守并发和共享锁。research-gate采用同一规范，暂停不能被整理成恢复。修正文档中的恢复命令。
4. T1408的14个非法文件名前缀glob按当前跟踪文件展开为38个精确文件，保留其他写集，不放宽安全路径守卫。补齐T1424、T1403、T1406基于当前SPEC的准确绑定，禁止非终端glob与外仓路径。更新维护任务绑定，再通过正式progress generate和context-compile生成。既有步骤状态、commit、阻塞原因、e2e事实和11个leases保全，不借生成操作推进其他任务。
5. 归档撞号来源索引只解释实际核实的历史记录；如工具识别索引，必须校验每条完整行哈希及来源，仍报告未经登记的新撞号、活动重复与索引损坏，不降低活动ID唯一性。若剩余告警未安全处理，按真实结果保留，不为归零删历史。

6. 旧任务可使用五列索引（ID/状态/审核/验收/文档），当前九项产品任务与本任务保留完整表。必须配套共享的任务元数据读取器：索引精确指向 BACKLOG-details.md 的唯一锚点，结构化元数据包含 ID、完整标题、叙事、原文档、原行及其 SHA256；读取时验证唯一锚点、任务 ID、原行哈希及仓内文档路径。状态、审核、验收永远从当前看板行读取，详情不得覆盖；不递归跟随历史链接。旧七列和已有五列暂停表继续可读。pmem、context-compile、reviewctl、taskctl、frontend-validation 都须使用解析后的本任务元数据，禁止对整份详情文件猜测标题或扫描 journey。缺锚点、重复锚点、串任务、损坏来源和错误 SPEC 必须显式失败，不能静默丢任务或降级审核。转换前后比对全部未完成任务 ID、状态、票据、标题、SPEC；15KiB软限若仍超出则如实保留，不调整阈值。

## 范围与写集

BACKLOG.md、BACKLOG-details.md、BACKLOG-archive.md、PROJECT.md；orchestrator/process/taskctl.mjs及其测试、research-gate.mjs及其测试、backlog-compact.mjs及其测试、backlog-health.mjs及其测试，以及需要共享的局部状态标签工具与测试、backlog-task-metadata.mjs及其测试；pmem.mjs、context-compile.mjs、reviewctl.mjs、frontend-validation.mjs及各自已有/新增针对性测试（仅索引兼容与原安全守卫）；orchestrator/process/modules.config.json；orchestrator/progress.json、context/T-1420.md、T-1421.md、T-1422.md、T-1423.md、T-1424.md、T-1426.md、T-1427.md、T-1403.md、T-1406.md、T-1408.md、T-1432.md；本SPEC及相邻审核、docs/verification/t1432/**、docs/research/2026-10-28-handoff-control-repair-research.md；本任务所需DEC和events/review-events只经正式工具新增。其他产品文件不属于本任务。

用户已授权修复这些工程记录；不改变构建配置、依赖版本、环境变量或密钥。本任务不迁入阶段2的旧分支记录，不修改独立T1430工作树。

## 验收

- 先对规范状态、重复叙事压缩和历史索引守卫做真实红测，再修最小实现；保留原回归断言。
- 每条被移出的原行都有逐字副本或归档来源；当前任务ID唯一；状态语义、票据及原审核链前缀不变。
- 正式生成成功，前后已有步骤状态和leases一致；任务包为实际工具生成，不伪造曾有任务包。
- 相关过程工具测试、git diff --check、reviewctl audit、backlog-health、pmem sync和quick read-only reconcile；如有非本任务错误需逐项保留，不宣称未运行的完整验收通过。
- 独立审查具体实现及数据保全，记录实际命令、输出与提交；不替代任何产品或真机验收。
