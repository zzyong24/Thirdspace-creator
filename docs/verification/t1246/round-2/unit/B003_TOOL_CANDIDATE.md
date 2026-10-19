第28消费者 B003 的独立候选

{
  "task": "T-1246",
  "group": "B003",
  "scope": "单独第28消费者完整原75cases；本候选不执行PG",
  "originalSha256": "d192f72b5a193cb92303ead1806ca7d735c25dea0344b7905c5ad78e70143c35",
  "currentSha256": "eb46ac4d8782962c003396b7d8cced7556d5d03725e5177a530550c1f803f7dd",
  "candidatePath": "docs/verification/t1246/round-2/unit/t1074-tool-candidate-v1.json",
  "sourceSnapshotDigest": "33e853528124cb781f3192784f2933d3ffcd76fe9f603df5ee8d30e13cfb7f1d",
  "inputCount": 2221,
  "caseCountOriginalActual": 75,
  "testHookMs": 180000,
  "originalLongCasesMs": 1200000,
  "originalLongCasesCount": 4,
  "caseOuterMs": 28800000,
  "independentTotalMs": 35220000,
  "cleanupReserveMs": 1440000,
  "actualPgStarted": false,
  "caseChanges": [
    "仅原T1074 PG特定role硬守门→已有owned marker/server/URL/helper，仍拒5432/55422/其它实例；CREATE/DROP仍原同临时DB",
    "原删除事务先锁原账号组，waitPgLock观察真实account_groups且pg_blocking_pids包含原writerPID；删除提交后拒绝/0孤儿0回执全部原assert保留",
    "原75完整case+4个20分钟case预算原样保留，单次0retry、无selector、独立8h文件外层覆盖最坏内层和独立启动build/cleanup余量"
  ],
  "sharedDist": "等当前27 EOF+清理及parent独评才开；不得并发build",
  "toolExecution": "仅 --execute + 精确review.sourceSnapshotDigest/runtimeRoot/scope/runtimedist准入；无review只输出候选"
}
