# <T-ID> · <未知机制 / 被违反不变量>研究卡

> Truth: evidence。任务状态只看 `BACKLOG.md`；正式取舍只看 `DECISION_LOG.md`。
> 本卡描述问题形状，不复制 PRODUCT_SPEC，也不把候选写成已确认产品范围。

```research-first-gate/v2
{
  "schema": "research-first-gate/v2",
  "task_id": "<被暂停的实现任务 ID>",
  "research_task_id": "<研究任务 ID>",
  "status": "researching | candidate | validated",
  "problem_statement": "<观察到什么，为什么现有机制解释不了>",
  "failure_family": "<项目自定义、稳定的 kebab-case 问题族>",
  "observed_invariant": "<被违反的已确认合同/数据/系统不变量>",
  "trigger_kinds": ["violated-invariant", "unsuccessful-intervention-churn"],
  "paused_actions": [
    "further-production-changes",
    "broadened-workaround",
    "repeated-full-system-runs",
    "irreversible-operations"
  ],
  "evidence": {
    "authoritative": [
      { "kind": "official-doc | standard | source-code | approved-spec", "ref": "<URL 或项目内路径>", "claim": "<直接支持的判断>" }
    ],
    "local": [
      { "kind": "code | config | log | test | runtime | hardware", "path": "<项目内路径>", "locator": "<行/符号/记录>", "observation": "<事实>" }
    ],
    "experiments": [
      {
        "question": "<该实验能区分哪两个候选>",
        "command": "<可重复命令；不得含密钥/敏感原文>",
        "environment": "<sandbox / fixture / isolated device>",
        "result": "<事实结果>",
        "artifact_path": "<项目内脱敏结果路径>",
        "artifact_sha256": "<64 hex>"
      }
    ]
  },
  "options": [
    { "id": "OPT-1", "outcome": "<结果>", "tradeoffs": "<代价>", "scope": "<边界>", "falsified_by": "<什么证据会推翻>" },
    { "id": "OPT-2", "outcome": "<结果>", "tradeoffs": "<代价>", "scope": "<边界>", "falsified_by": "<什么证据会推翻>" }
  ],
  "recommendation": "OPT-1",
  "validation": {
    "timebox_minutes": 120,
    "max_experiments": 2,
    "acceptance_criteria": [
      { "name": "<项目指标>", "target": "<阈值>", "measurement": "<如何测>", "observed": "<实测值>", "verify_key": "<reconcile.config.json research_verify_commands key>", "evidence_path": "<项目内证据路径>", "evidence_sha256": "<64 hex>" },
      { "name": "<第二个项目指标>", "target": "<阈值>", "measurement": "<如何测>", "observed": "<实测值>", "verify_key": "<research verify key>", "evidence_path": "<项目内证据路径>", "evidence_sha256": "<64 hex>" }
    ],
    "resume_criteria": "<哪些证据与决定齐备后才可恢复>"
  },
  "decision_impacts": ["none | product-direction | ia | data-ownership | security | data-contract | contract | release-criteria | irreversible-operation | material-cost"],
  "decision_ids": []
}
```

## 结论说明

- 已证明：<只写证据支持的事实>
- 尚未证明：<明确未知项>
- 推荐理由：<为什么最小、可逆且直接验证机制>
- 明确不做：<防止试点扩成重构>
