# T1318 独立局部结果审核

Root 独立于实现者 R 核查了最终生产差异、完整公共测试与原始结果。本地修复及所列受控回归可接受；未签新包、真实供应商或整个父任务通过。

实际核验 `OUTPUT_INDEX.json` 的 318 项文件字节数与 SHA 全部匹配；red-v1、green-v1、green-v2、green-member-v3 四轮各 41 项运行前快照与其清单全部匹配。最终生产 SHA 为 `554daa79ac831bddad1f741a1f8cc382d6e1c35ee75a8d016a112fe55edc7fc3`，测试为 `5883285149a96330abc8d2feb0a6dfb69b11f8dc540f935db5c1d6079bcae962`，均与当前文件及最终清单一致。

原 RED 确在真实公开生成与账本结算后，于 `ai.tasks.confirm → adoptThesisCandidate` 抛 `AccountRequiredError`，不是模拟采纳失败。修后三种范围均返回 succeeded，公共版本读取与重复确认断言实际执行；唯一 AI 版本及原空白 user v1 均保留。green-v1 原版本数夹具错误保留，未改产品删除空白版本来使测试通过。

源码只改原采纳工作单元。同事务先锁原冻结账号、成员、组，再锁项目和任务；锁后重核原 tuple、execution/lease、项目映射、状态及原候选。三种范围的真实 SQL 轨迹与此一致，页面筛选 B 未进入 FOR UPDATE，原 A 仍是任务身份。组级业务成稿保持 account null，legacy 保原账号范围；仅重命名组不会被新增当前 groupVersion 条件拒绝。ArtifactsService 使用已锁项目的窄归属证明，原创建版本与任务终态在同一事务内。

已逐读安全保护与成员保护原件：外 user/group/legacy 账号、取消、归档、候选与项目映射篡改、冻结成员版本与转组变化均在相应守卫拒绝。两种写入失败通过 **SQL logger 发出点注入异常**，真实事务回滚及全 artifact/version 行不变断言通过；这证明回滚路径，不是 PostgreSQL 服务器约束失败或多连接死锁实测。原行恢复后原合法候选可采纳，未新增模型回合。

实际 green-v2 为 3 PASS，green-member-v3 为 1 PASS；最终生产后端类型、最终测试前端类型、boundary 与 semantic 命令 exit0 与报告一致。共享 timeout Gate 尚待 C；未运行本次实际供应商、新候选包或原失败 thesis103，不从局部成功追认旧现场已修。

本次仅结果检查，没有运行产品测试或修改实现。该独立审核文件是后续新增工件，不冒已包含在原 318 项索引中；原实现报告与索引保持原字节。审核文件写权已 RELEASE。
