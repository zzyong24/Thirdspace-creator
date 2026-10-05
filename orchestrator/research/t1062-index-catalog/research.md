# T-1062 外键引用独立唯一索引盘点研究

```research-first-gate/v2
{
  "schema": "research-first-gate/v2",
  "task_id": "T-1062",
  "research_task_id": "T-1062",
  "status": "validated",
  "problem_statement": "0128参考catalog漏掉外键引用的独立unique index，public createDb两次报42830；区分漏索引与真正无唯一约束",
  "failure_family": "convergence-referenced-unique-index",
  "observed_invariant": "三谱系兼容新DDL须完整保留unique/FK，不得假receipt或重复试改",
  "trigger_kinds": [
    "repeated-failure-family"
  ],
  "paused_actions": [
    "further-production-changes",
    "broadened-workaround",
    "repeated-full-system-runs",
    "irreversible-operations"
  ],
  "evidence": {
    "authoritative": [
      {
        "kind": "official-doc",
        "ref": "https://www.postgresql.org/docs/17/catalog-pg-constraint.html",
        "claim": "conindid可指向支持FK的索引，不只本表拥有的p/u/x约束索引"
      }
    ],
    "local": [
      {
        "kind": "log",
        "path": "orchestrator/research/t1062-index-catalog/failed-public-upgrade.log",
        "locator": "42830/production_edit_versions",
        "observation": "第二次移动FK排序后仍报no unique constraint"
      }
    ],
    "experiments": [
      {
        "question": "排除所有conindid是否误漏被FK引用的独立unique，而限定本表p/u/x能否保留又不重复owned索引",
        "command": "node orchestrator/research/t1062-index-catalog/probe.cjs",
        "environment": "PGlite全新内存库及127.0.0.1:55422随机PostgreSQL隔离库；实验后删除随机库，不读取现用资料",
        "result": "两引擎均旧查询漏独立unique，新查询保留独立unique及partial predicate，排除本表owned unique；FK插入成功且duplicate仍23505",
        "artifact_path": "orchestrator/research/t1062-index-catalog/probe-result.json",
        "artifact_sha256": "5063b2219725decf3c7af84be11f79a46b0d6616047689fe9333c543edb6c00b"
      }
    ]
  },
  "options": [
    {
      "id": "OPT-1",
      "outcome": "只排除本表p/u/x拥有索引，其余独立unique/index保留",
      "tradeoffs": "窄查询修复，不改DDL约束标准",
      "scope": "catalog盘点及基于其生成的新0128",
      "falsified_by": "隔离库不能保留引用索引或误重复本表constraint索引"
    },
    {
      "id": "OPT-2",
      "outcome": "继续排除所有conindid，另加特例production索引",
      "tradeoffs": "特例遗漏其他FK引用唯一索引且不可泛化",
      "scope": "production特例workaround",
      "falsified_by": "通用最小FK示例旧查询漏索引"
    }
  ],
  "recommendation": "OPT-1",
  "validation": {
    "timebox_minutes": 30,
    "max_experiments": 2,
    "acceptance_criteria": [
      {
        "name": "引用索引与predicate完整",
        "target": "两引擎保留parent_owner_idx、parent_user_partial",
        "measurement": "actual pg_index / pg_constraint 查询",
        "observed": "2/2引擎均保留",
        "verify_key": "t1062-index-catalog",
        "evidence_path": "orchestrator/research/t1062-index-catalog/probe-result.json",
        "evidence_sha256": "5063b2219725decf3c7af84be11f79a46b0d6616047689fe9333c543edb6c00b"
      },
      {
        "name": "所属约束与实际行为不削弱",
        "target": "排除本表owned_unique_user_id_key且实际FK插入成功、duplicate被23505拒绝",
        "measurement": "actual查询及真实SQL insert",
        "observed": "2/2引擎均符合",
        "verify_key": "t1062-index-catalog",
        "evidence_path": "orchestrator/research/t1062-index-catalog/probe-result.json",
        "evidence_sha256": "5063b2219725decf3c7af84be11f79a46b0d6616047689fe9333c543edb6c00b"
      }
    ],
    "resume_criteria": "PGlite和PG最小catalog实验同时保留引用独立唯一/partial index，排除本表owned unique并保留实际FK/duplicate约束；不声称四谱系全升级已通过"
  },
  "decision_impacts": [
    "none"
  ],
  "decision_ids": []
}
```

已证明窄查询条件能恢复被引用独立索引而保持constraint/index职责。尚未证明完整四谱系升级；恢复仅允许该已识别实现修正及原批准验收，不扩范围。
