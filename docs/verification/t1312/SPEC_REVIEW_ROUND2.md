# T1312 独立round2原消息归档

独立R /root/sol_initial_review_t1307_t1308 homogeneous Sol/high，0写/测试/模型/HTTP，40锁独核；C仅按R明确机械映射落盘，不自填verdict。

{
  "schema": "spec-review-round/v2",
  "review_kind": "recheck",
  "summary": "同lineage cycle1 round2只读复核完成：SPEC f29b5f7a、INPUT_LOCK_ROUND2 e8783769、MODULE_SCOPE_ROUND2 2daff38a及40项实际输入均匹配；已读原packet和精确修订diff。REV-001/002均有明确规格与范围销账，修订增量未发现新实质问题。不签实现、RED或公共验收；0写入、0测试/模型/HTTP，RELEASE全部写权与资源。",
  "findings": [
    {
      "id": "REV-001",
      "status": "resolved",
      "severity": "major",
      "category": "consistency",
      "requirement_anchor": {
        "id": "默认key与兼容:L18",
        "quote": "普通新组稳定组默认；同组null账号/账号A/账号B解析同一key。"
      },
      "acceptance_anchor": {
        "id": "必须当场发生的验证:L36",
        "quote": "修后同公开prepare→真实冻结worker/model受控协议→完成/confirm/lock/读回"
      },
      "where": "docs/features/t1312-group-calibration-default-rubric.md:18–20 普通group与旧account canonical命名空间",
      "failure_mode": "合法旧账号A='group:G'的不可迁移默认root/v1，恰为rubric-canonical:group:G与rubricver-canonical-1:group:G，和普通新组G规定的两个新ID完全相同。旧实体在其真实legacy组、普通G为另一个owned组时，禁止搬库/覆盖只会使G的首次合法prepare报碰撞，不能恢复其默认诊断。碰撞报错保护避免错用实体，但没有解决这次新key设计引入的可避免合法输入失败。",
      "evidence_kind": "deterministic-check",
      "evidence_ref": "SPEC:L18–20、L26、L36；contract/src/primitives.ts:3 的id=z.string().min(1)；contract/src/resources/platform-accounts.ts:5–7使用该id；backend/src/schema/platform-account.ts:28的id为text主键，无排除group:的约束。新旧公式代入A='group:G'后逐字相等。",
      "risk_class": "confirmed-requirement",
      "disposition": "mitigate",
      "remedy_type": "constraint",
      "scope_effect": "none",
      "origin": "baseline",
      "origin_ref": "round-1 full review",
      "suggestion": "约束新普通group的root/v1 ID与必须保留的全部legacy canonical ID使用不相交命名空间；可沿Root已选rubric-group-default:<G>/rubricver-group-default-1:<G>。机械覆盖合法旧A='group:G'与普通G并存且各自首次prepare/读回成立；原异owner或损坏记录的明确报错政策保留。",
      "resolution_evidence": "当前SPEC:L21已将普通G改为rubric-group-default:<G>/rubricver-group-default-1:<G>，与全部旧rubric-canonical:<A>/rubricver-canonical-1:<A>前缀不相交，旧ID原样。L53独立前RED、L21/L55合法旧A=group:G与普通G并存后各自prepare验收明确。DEC Round2授权与40项输入中的真实id合同一致；属于规格销账，未声称已执行测试。",
      "parent_id": ""
    },
    {
      "id": "REV-002",
      "status": "resolved",
      "severity": "major",
      "category": "consistency",
      "requirement_anchor": {
        "id": "锁序特别约束:L57",
        "quote": "所有默认写仅按实际完整ctx先lockWorkspaceMembership"
      },
      "acceptance_anchor": {
        "id": "新增重点组合:L52",
        "quote": "完整默认prepare→受控model完成→confirm→prediction→lock/结果录入"
      },
      "where": "SPEC:L46–48、L57与现役calibration confirm外层事务组合",
      "failure_mode": "现役confirm已在外层同一tx锁ai_task，再按真实task的冻结A/member/G加FOR UPDATE锁，随后仍把页面ctxB传给tx-bound createDraftPrediction。按当前SPEC给该默认写新增B/memberB/G锁，会形成A→G→B（纯组task为G→B）；并行B默认写先持B再等待G时，两事务各等对方而形成锁环。只保证新service内部B→G不能满足完整confirm链锁序，且当前8源没有给出该外层衔接的可执行安排。",
      "evidence_kind": "deterministic-check",
      "evidence_ref": "backend/src/modules/ai/calibration-positioning-adoption.service.ts:58–71外层tx/task锁及assertFrozenWorkspaceMembership，:167继续传ctx；frontend/src/server/persistence-client.ts:2794–2800用同tx创建calibration service并传原ctx；backend/src/modules/platform-account/membership-lock.service.ts:35–41实际account/member/group均FOR UPDATE；backend/src/workspace-scope.ts:13–15组scope允许同组筛选B访问原任务。为源码锁图的可达交错，不声称已执行PG并发观察。",
      "risk_class": "confirmed-requirement",
      "disposition": "mitigate",
      "remedy_type": "constraint",
      "scope_effect": "none",
      "origin": "baseline",
      "origin_ref": "round-1 full review",
      "suggestion": "把完整confirm入口的授权ctx和锁序收敛后再实施，禁止在已持G时新增页面筛选B锁。Root提出的最窄方向可闭合此链：仅calibration分支把已锁真实task的冻结workspace字段传给draft port，保request/source与原subject/version；纯组只重取G、冻结A只重取原A/member/G，不引入skip权限标志、不从历史root来源伪造ctx、不改positioning。该第9源须由C先精确增量SPEC/锁/范围并复核，不能在当前8源授权下临场修改；用真实confirm入口核跨筛选传递与锁轨迹。",
      "resolution_evidence": "当前SPEC:L39限定仅calibration分支从外层已锁真实task传user/group/account/groupVersion/membershipVersion并保request/source，沿同一tx重取原冻结A/member/G或纯组G，页面B不再进入draft下层；原subject/version与positioning不变。L47/MODULE_SCOPE_ROUND2新增第9源adoption.service及真实confirm集成测试W，DEC有Root明确增量授权。L41/L53要求完整入口前RED与SQL锁轨迹/回滚/叶子owner，明确PGlite不冒PG并发证明。对照现役外层锁与tx-bound draft port可实现该约束；未改变旧task→workspace历史顺序。",
      "parent_id": ""
    }
  ]
}
