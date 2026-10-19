# T-1062 · 安装旧库迁移身份研究

```research-first-gate/v2
{
  "schema": "research-first-gate/v2",
  "task_id": "T-1062",
  "research_task_id": "T-1062",
  "status": "validated",
  "problem_statement": "实际安装版启动时拒绝105条旧账本中的4个未知身份，造成首页与列表500；三冻结来源和旧包资源不能解释混合历史",
  "failure_family": "installed-historical-migration-identities",
  "observed_invariant": "用户旧库必须可核验升级，保留真实历史与资料；不得丢失、重建或伪造迁移回执",
  "trigger_kinds": [
    "high-cost-feedback-loop"
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
        "kind": "approved-spec",
        "ref": "docs/features/t1062-consolidated-local-client-acceptance.md",
        "claim": "旧tag/SQL/when原文保留，隔离升级及资料保留必须实测"
      },
      {
        "kind": "source-code",
        "ref": "backend/src/migration-convergence.ts",
        "claim": "未知hash/when会在catalog检查前拒绝，参考SQL只在隔离内存执行"
      }
    ],
    "local": [
      {
        "kind": "runtime",
        "path": "docs/verification/t1062/ACCEPTANCE.md",
        "locator": "2026-10-06 安装后真实失败与隔离核因",
        "observation": "实际安装服务accounts/groups500，已核验备份clone发现4真实GitSQL身份"
      }
    ],
    "experiments": [
      {
        "question": "真实旧账本是否有可验证SQL来源，结构是否恰由这些已执行SQL解释，原0128是否可在参考库执行",
        "command": "node docs/research/t1062-installed-migration-history/verify-cause.mjs（验证已现场执行的clone+reference最小实验）",
        "environment": "只打开私有备份副本；参考PGlite内存执行历史SQL及0128，原库及不可变备份未打开",
        "result": "4/4未知身份命中GitSQL；101共同身份；missing/extras均0；原0128参考执行成功；尚未验证公共工厂升级",
        "artifact_path": "docs/research/t1062-installed-migration-history/cause-result.json",
        "artifact_sha256": "1560febb4c451efcdc614973173a8b706eb9a06ab37b627d009092b920dff3ad"
      }
    ]
  },
  "options": [
    {
      "id": "OPT-1",
      "outcome": "完整冻结三份真实旧journal/SQL，精确识别已执行supplemental身份，并按账本subset核catalog兼容variant",
      "tradeoffs": "保持原3canonical和旧字段；增加有限的可验证旧历史，不重启已回退keyring协议",
      "scope": "迁移身份及参考catalog，无业务API/归属/凭证配置变更",
      "falsified_by": "精确历史解释不了结构，公共工厂仍不能升级，或fresh变成legacy协议"
    },
    {
      "id": "OPT-2",
      "outcome": "新增0129强制fresh与所有旧库带四旧schema",
      "tradeoffs": "虽可统一catalog，但将无关keyring nullable凭证旧协议引入fresh，超出所需兼容",
      "scope": "新fresh结构及凭证字段",
      "falsified_by": "当前服务不依赖旧字段且仅历史subset即可升级"
    }
  ],
  "recommendation": "OPT-1",
  "validation": {
    "timebox_minutes": 90,
    "max_experiments": 2,
    "acceptance_criteria": [
      {
        "name": "历史身份真实",
        "target": "4/4 exactSQL及101共同身份",
        "measurement": "现场GitSQL hash与私有clone ledger比对",
        "observed": "4/4、101",
        "verify_key": "t1062-installed-history-cause",
        "evidence_path": "docs/research/t1062-installed-migration-history/cause-result.json",
        "evidence_sha256": "1560febb4c451efcdc614973173a8b706eb9a06ab37b627d009092b920dff3ad"
      },
      {
        "name": "结构解释及原SQL可执行",
        "target": "missing=0/extras=0；0128参考执行成功",
        "measurement": "实际PGlite clone catalog与内存历史SQL catalog对比",
        "observed": "0/0，参考0128成功；完整升级未验",
        "verify_key": "t1062-installed-history-cause",
        "evidence_path": "docs/research/t1062-installed-migration-history/cause-result.json",
        "evidence_sha256": "1560febb4c451efcdc614973173a8b706eb9a06ab37b627d009092b920dff3ad"
      }
    ],
    "resume_criteria": "只恢复精确历史识别的实现与原验证；禁止据此称完整安装通过"
  },
  "decision_impacts": [
    "none"
  ],
  "decision_ids": []
}
```

既有用户授权覆盖升级兼容修复；本方案不改变用户内容、归属、凭证配置或发布标准。已安装失败继续保留，公共工厂和新包仍待验。
