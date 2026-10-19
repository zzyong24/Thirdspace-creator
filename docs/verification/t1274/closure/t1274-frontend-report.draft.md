# T-1274 frontend-validation 报告草案

未执行。contract_sha只是当前合同全文的真实SHA前12位；commit_sha/observed_at/exit_code/output_ref/visible_copy保留空值。verify_key与command是拟登记项，当前未写全局allowlist。该草案应被strict验证器拒绝，不能交taskctl complete。

```frontend-validation
{
  "schema": "frontend-validation/v1",
  "task_id": "T-1274",
  "contract_path": "docs/verification/t1274/closure/t1274-journey-contract.md",
  "contract_sha": "def6ddfffdfd",
  "commit_sha": null,
  "observed_at": null,
  "run": {
    "verify_key": "t1274:closure-readonly",
    "command": "node docs/verification/t1274/closure/fresh-readonly.cjs T-1274",
    "exit_code": null,
    "output_ref": null
  },
  "environment": {
    "surface": "browser",
    "runtime": null,
    "viewports": [
      {
        "width": 1366,
        "height": 900,
        "result": "unknown"
      },
      {
        "width": 390,
        "height": 844,
        "result": "unknown"
      }
    ]
  },
  "data": {
    "mode": "non-fixture",
    "witnesses": [
      {
        "id": "output-5e3e4e95-261",
        "role": "真实模型重排复制后的独立作品"
      },
      {
        "id": "output-8a2fadb0-19",
        "role": "只读原作品及既有成片来源"
      }
    ]
  },
  "levels": {
    "logic": {
      "status": "unknown",
      "evidence_ref": "docs/verification/t1274/AC_CURRENT.md"
    },
    "surface": {
      "status": "unknown",
      "evidence_ref": "docs/verification/t1274/AC_CURRENT.md"
    },
    "journey": {
      "status": "unknown",
      "evidence_ref": "docs/verification/t1274/AC_CURRENT.md"
    },
    "experience": {
      "status": "not-requested",
      "evidence_ref": "docs/verification/t1274/CLOSURE_AUDIT.md"
    }
  },
  "checks": [
    {
      "id": "AC-1274-01",
      "test_id": "CLOSURE-T1274-AC01",
      "result": "unknown",
      "evidence_ref": "docs/verification/t1274/AC_CURRENT.md",
      "historical_evidence_refs": [
        "docs/verification/t1274/AC_CURRENT.md",
        "docs/verification/t1274/model-reorder-clone/REPORT.md",
        "docs/verification/t1283/rough-public-new/REPORT.md",
        "docs/verification/t1274/final-gap-walkthrough/REPORT.md",
        "docs/verification/t1285/public-cas-recovery/REPORT.md"
      ]
    },
    {
      "id": "AC-1274-02",
      "test_id": "CLOSURE-T1274-AC02",
      "result": "unknown",
      "evidence_ref": "docs/verification/t1274/AC_CURRENT.md",
      "historical_evidence_refs": [
        "docs/verification/t1274/AC_CURRENT.md",
        "docs/verification/t1274/model-reorder-clone/REPORT.md",
        "docs/verification/t1283/rough-public-new/REPORT.md",
        "docs/verification/t1274/final-gap-walkthrough/REPORT.md",
        "docs/verification/t1285/public-cas-recovery/REPORT.md"
      ]
    },
    {
      "id": "AC-1274-03",
      "test_id": "CLOSURE-T1274-AC03",
      "result": "unknown",
      "evidence_ref": "docs/verification/t1274/AC_CURRENT.md",
      "historical_evidence_refs": [
        "docs/verification/t1274/AC_CURRENT.md",
        "docs/verification/t1274/model-reorder-clone/REPORT.md",
        "docs/verification/t1283/rough-public-new/REPORT.md",
        "docs/verification/t1274/final-gap-walkthrough/REPORT.md",
        "docs/verification/t1285/public-cas-recovery/REPORT.md"
      ]
    },
    {
      "id": "AC-1274-04",
      "test_id": "CLOSURE-T1274-AC04",
      "result": "unknown",
      "evidence_ref": "docs/verification/t1274/AC_CURRENT.md",
      "historical_evidence_refs": [
        "docs/verification/t1274/AC_CURRENT.md",
        "docs/verification/t1274/model-reorder-clone/REPORT.md",
        "docs/verification/t1283/rough-public-new/REPORT.md",
        "docs/verification/t1274/final-gap-walkthrough/REPORT.md",
        "docs/verification/t1285/public-cas-recovery/REPORT.md"
      ]
    },
    {
      "id": "AC-1274-05",
      "test_id": "CLOSURE-T1274-AC05",
      "result": "unknown",
      "evidence_ref": "docs/verification/t1274/AC_CURRENT.md",
      "historical_evidence_refs": [
        "docs/verification/t1274/AC_CURRENT.md",
        "docs/verification/t1274/model-reorder-clone/REPORT.md",
        "docs/verification/t1283/rough-public-new/REPORT.md",
        "docs/verification/t1274/final-gap-walkthrough/REPORT.md",
        "docs/verification/t1285/public-cas-recovery/REPORT.md"
      ]
    },
    {
      "id": "AC-1274-06",
      "test_id": "CLOSURE-T1274-AC06",
      "result": "unknown",
      "evidence_ref": "docs/verification/t1274/AC_CURRENT.md",
      "historical_evidence_refs": [
        "docs/verification/t1274/AC_CURRENT.md",
        "docs/verification/t1274/model-reorder-clone/REPORT.md",
        "docs/verification/t1283/rough-public-new/REPORT.md",
        "docs/verification/t1274/final-gap-walkthrough/REPORT.md",
        "docs/verification/t1285/public-cas-recovery/REPORT.md"
      ]
    },
    {
      "id": "AC-1274-07",
      "test_id": "CLOSURE-T1274-AC07",
      "result": "unknown",
      "evidence_ref": "docs/verification/t1274/AC_CURRENT.md",
      "historical_evidence_refs": [
        "docs/verification/t1274/AC_CURRENT.md",
        "docs/verification/t1274/model-reorder-clone/REPORT.md",
        "docs/verification/t1283/rough-public-new/REPORT.md",
        "docs/verification/t1274/final-gap-walkthrough/REPORT.md",
        "docs/verification/t1285/public-cas-recovery/REPORT.md"
      ]
    },
    {
      "id": "AC-1274-08",
      "test_id": "CLOSURE-T1274-AC08",
      "result": "unknown",
      "evidence_ref": "docs/verification/t1274/AC_CURRENT.md",
      "historical_evidence_refs": [
        "docs/verification/t1274/AC_CURRENT.md",
        "docs/verification/t1274/model-reorder-clone/REPORT.md",
        "docs/verification/t1283/rough-public-new/REPORT.md",
        "docs/verification/t1274/final-gap-walkthrough/REPORT.md",
        "docs/verification/t1285/public-cas-recovery/REPORT.md"
      ]
    }
  ],
  "coverage": [
    {
      "condition": "normal",
      "result": "unknown",
      "evidence_ref": "docs/verification/t1274/closure/PLAN.md"
    },
    {
      "condition": "empty",
      "result": "unknown",
      "evidence_ref": "docs/verification/t1274/closure/PLAN.md"
    },
    {
      "condition": "loading",
      "result": "unknown",
      "evidence_ref": "docs/verification/t1274/closure/PLAN.md"
    },
    {
      "condition": "error",
      "result": "unknown",
      "evidence_ref": "docs/verification/t1274/closure/PLAN.md"
    },
    {
      "condition": "batch-diagnostics",
      "result": "unknown",
      "evidence_ref": "docs/verification/t1274/closure/PLAN.md"
    },
    {
      "condition": "long-content",
      "result": "unknown",
      "evidence_ref": "docs/verification/t1274/closure/PLAN.md"
    },
    {
      "condition": "permission",
      "result": "unknown",
      "evidence_ref": "docs/verification/t1274/closure/PLAN.md"
    },
    {
      "condition": "desktop",
      "result": "unknown",
      "evidence_ref": "docs/verification/t1274/closure/PLAN.md"
    },
    {
      "condition": "narrow",
      "result": "unknown",
      "evidence_ref": "docs/verification/t1274/closure/PLAN.md"
    },
    {
      "condition": "native-browser-zoom-200",
      "result": "unknown",
      "evidence_ref": "docs/verification/t1274/closure/PLAN.md"
    },
    {
      "condition": "dirty-before-send",
      "result": "unknown",
      "evidence_ref": "docs/verification/t1274/closure/PLAN.md"
    },
    {
      "condition": "cas-recovery",
      "result": "unknown",
      "evidence_ref": "docs/verification/t1274/closure/PLAN.md"
    },
    {
      "condition": "receipt-recovery",
      "result": "unknown",
      "evidence_ref": "docs/verification/t1274/closure/PLAN.md"
    }
  ],
  "tdd_red_ref": "docs/verification/t1274/final-gap-walkthrough/RESULT.json",
  "visible_copy": null,
  "open_defects": [
    "严格watched_paths仍dirty且新鲜只读收尾未运行；无可绑定HEAD或可见文案回执。"
  ],
  "status": "incomplete",
  "verification_scope": "草稿：尚未运行；将新鲜只读观察与历史已发生子证据分开映射，不能自动把历史模型/ASR/故障覆盖绑定为当前HEAD重演。",
  "global_limitations": [
    "全局reconcile29ERROR保留T1204归属，未签全局PASS。",
    "未替换已安装App或发布。"
  ]
}
```
