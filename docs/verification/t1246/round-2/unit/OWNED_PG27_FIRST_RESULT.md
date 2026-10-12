# 27 个真实 owned PostgreSQL 原文件首修结果

本轮完整 27 files：24 PASS / 3 FAIL；509 cases：504 PASS / 5 FAIL / 0 SKIP，实际 exit 1，Vitest 1981.17 秒。原195环境问题首轮和本轮5红均保留。没有完整四包/类型/安装App结论。

唯一自有 nonce `0e808708c36f04da3a422326ab565b02`，loopback 62047。本次调用全程源码 digest `a51998165d48eb5faba557ae650c1c5a772beac863829e0d6e994fa9e05a67bd` 不变。build exit0，原完整文件输入/retry0/bail0/正预算180秒，原更长预算保留。外层未耗尽、进程已关闭、组残留0。仅本轮 pg_ctl stop exit0，postmaster PID不存在，owned root已清理；没有借旧55422/50028。

三例 B009 已批迁移尾漂移：legacy-source两例旧107条期待，实际108；legacy-scheduled新尾实际0004/0005/0006，旧断言仅0004/0005。首修失败封存后，按父已批合同只校准固定108、003—006完整新增尾及0133完整journal字段/固定SQL SHA。旧104/105 producer、原前缀/SHA、业务内容保真、双启和并发主体未删除。修后尚未执行新PG回执；旧v3审核 digest不再可用于新修后运行。

另两例实际新下游红：`shared-parent-writers.postgres.integration.test.ts` 的 review-output/writer-checked-first 超时180秒，migration-validated-first 在blocked true期待收到false。当前源码只读因果候选：第50行 raw contentOutputs fixture未设groupId，而真实项目有from组；`projects.repository.ts:324` 明确要求output.groupId与父组相同，`reviews.service.ts:161` 在insert之前调用真实verifyOutputOwned。writer阶段若前置拒绝，则从未进入被观测insert，reached.promise等满；migration阶段若前置拒绝，则writer未进入真实SQL锁等待。这是强源码证据，尚无保留真实错误对象的独立trace，不能直接签‘产品PG锁缺陷’或‘夹具修复完成’。

最小待独评候选仅此测试原output fixture补真实 `groupId:from`（可优先公共createOutput，若与原固定output ID矛盾需明确窄fixture），保持原同输出ID、父行迁移、全部SQL观察与锁阻塞/拒绝/回滚断言。不得把waiting/blocked期待改false、删review-output两族或增加超时来掩盖早拒绝。只有完整原文件fresh ownedPG复验后确认因果。

精确5例完整stack/current source SHA：`owned-targeted-v3-first-final-failure-map.json`；原日志/JSON、build、server身份、preload、源码前后及清理：`evidence/0e808708c36f04da3a422326ab565b02/`。
